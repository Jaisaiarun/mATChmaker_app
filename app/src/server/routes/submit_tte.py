# -*- coding: utf-8 -*-

"""
Routes for submitting TTE jobs.
"""

import os
import re
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

from Bio import AlignIO, SeqIO
from flask import Blueprint, request
from werkzeug.utils import secure_filename

from .app import app
from .common import ResponseData, Status
from .constants import TEMP_DIR

blueprint_submit_tte = Blueprint("submit_tte", __name__)


####################################################################################################
# Helpers
####################################################################################################

def clustalo_pairwise_identity(fasta1: str, fasta2: str) -> float:
    def pid(a: str, b: str) -> float:
        matches = valid = 0
        for x, y in zip(a, b):
            if x != "-" and y != "-":
                valid += 1
                matches += (x == y)
        return 100.0 * matches / valid if valid else 0.0

    with tempfile.TemporaryDirectory() as tmpd:
        concat = Path(tmpd) / "both.faa"
        msa = Path(tmpd) / "aln.fasta"

        with open(concat, "w") as out:
            for rec in SeqIO.parse(fasta1, "fasta"):
                SeqIO.write(rec, out, "fasta")
            for rec in SeqIO.parse(fasta2, "fasta"):
                SeqIO.write(rec, out, "fasta")

        subprocess.run(
            ["clustalo", "-i", str(concat), "-o", str(msa), "--force", "--threads=4"],
            check=True
        )

        aln = AlignIO.read(str(msa), "fasta")
        recs = list(aln)
        return pid(str(recs[0].seq), str(recs[1].seq))


def get_similarity(in_seq: str, ref_seq: str):
    if not in_seq or not ref_seq:
        return None
    try:
        with tempfile.TemporaryDirectory() as tmpd:
            tmpd = Path(tmpd)
            in_out = tmpd / "Input.faa"
            ref_out = tmpd / "Reference.faa"

            in_out.write_text(f">Input_TTE\n{in_seq}\n")
            ref_out.write_text(f">Reference_TTE\n{ref_seq}\n")

            similarity = clustalo_pairwise_identity(str(in_out), str(ref_out))
            return similarity
    except Exception:
        return None


def qget(feat, key, default=""):
    vals = feat.qualifiers.get(key, [])
    return vals[0] if vals else default


def fpos(feat):
    return int(feat.location.start), int(feat.location.end)


def overlaps(a, b, c, d):
    return not (b <= c or d <= a)


def is_protocore(feat):
    return feat.type == "protocluster"


def extract_tte_from_cds(cds_feat, feats_in_cds):
    translation = qget(cds_feat, "translation")
    if not translation:
        return ""
    strand = cds_feat.location.strand

    pfams = [f for f in feats_in_cds if f.type in ("PFAM_domain", "aSDomain")]
    te_feats = [f for f in pfams if qget(f, "aSDomain") == "Thioesterase" and f.type == "PFAM_domain"]
    if not te_feats:
        return ""

    te_feats.sort(key=lambda f: fpos(f)[0], reverse=(strand == -1))
    te = te_feats[0]
    te_start_nt = int(qget(te, "protein_start") or 0)

    upstream_caps = {"PP-binding", "PCP", "PMP"}
    temp_caps = [f for f in feats_in_cds if qget(f, "aSDomain") in upstream_caps]
    if not temp_caps:
        return ""
    # Pick the cap domain immediately upstream of the TE in protein order.
    # temp_caps must sort in the OPPOSITE direction to te_feats:
    #   te_feats picks the FIRST TE in protein order (fwd: lowest genomic pos first).
    #   temp_caps wants the LAST cap before the TE (fwd: highest genomic pos first).
    temp_caps.sort(key=lambda f: fpos(f)[0], reverse=(strand != -1))

    anchor = temp_caps[0]
    ps = int(qget(anchor, "protein_start") or 0)

    if te_start_nt > ps:
        return translation[ps:]
    return ""


def get_tte_records(gbk_path):
    """Extract TTE rows from all protocore regions in a GenBank file."""
    rows = []
    for rec in SeqIO.parse(gbk_path, "genbank"):
        name = rec.name
        proto_regions = [f for f in rec.features if is_protocore(f)]
        for r_idx, region in enumerate(proto_regions, start=1):
            rs, re_ = fpos(region)
            region_id = f"proto_core_{r_idx}"

            mono_feats = [f for f in rec.features if overlaps(rs, re_, *fpos(f)) and "monomer_pairings" in f.qualifiers]
            mono_feats.sort(key=lambda f: fpos(f)[0])
            monomers = []
            for mf in mono_feats:
                for v in mf.qualifiers.get("monomer_pairings", []):
                    monomers.append(str(v))
            monomers_str = " | ".join(monomers)

            cds_list = [f for f in rec.features if f.type == "CDS" and overlaps(rs, re_, *fpos(f))]
            feats_in_region = [f for f in rec.features if overlaps(rs, re_, *fpos(f))]

            for cds in cds_list:
                cs, ce = fpos(cds)
                feats_in_cds = [f for f in feats_in_region if cs <= fpos(f)[0] and fpos(f)[1] <= ce]
                has_te = any(f.type == "PFAM_domain" and qget(f, "aSDomain") == "Thioesterase" for f in feats_in_cds)
                if not has_te:
                    continue
                tte_seq = extract_tte_from_cds(cds, feats_in_cds)
                if tte_seq:
                    rows.append({
                        "file": gbk_path.name,
                        "file_locus": name,
                        "region_id": region_id,
                        "region_idx": r_idx,
                        "monomer_pairs": monomers_str,
                        "CDS_locus_tag": qget(cds, "locus_tag") or qget(cds, "locus_tags"),
                        "tte_seq": tte_seq,
                        "tte_len": len(tte_seq),
                    })
    return rows


def extract_protocore_gbk(gbk_path: Path, out_dir: Path, clean_stem: str) -> list:
    """
    Extract every protocluster region from gbk_path and write each one as
    its own GenBank file inside out_dir.

    Uses BioPython's built-in record slicing (``rec[start:end]``) which
    correctly re-zeros all feature coordinates (including compound/join
    locations), preserves strand, qualifiers and sub-features.

    File naming: ``<clean_stem>_proto_core_<N>.gbk``

    Returns a list of (region_idx, filename) tuples for every file written.
    """
    written = []

    for rec in SeqIO.parse(str(gbk_path), "genbank"):
        proto_regions = [f for f in rec.features if is_protocore(f)]

        for r_idx, region in enumerate(proto_regions, start=1):
            rs, re_ = fpos(region)

            # BioPython record slicing handles coordinate re-zeroing,
            # compound locations, strand, and qualifiers automatically.
            sub_rec = rec[rs:re_]

            # Override id/name/description for clarity
            sub_rec.id = f"{rec.id}_proto_core_{r_idx}"
            sub_rec.name = f"{rec.name[:10]}_pc{r_idx}"
            sub_rec.description = f"Protocluster {r_idx} from {rec.description}"
            # Ensure molecule_type annotation is set (required by GenBank writer)
            sub_rec.annotations.setdefault(
                "molecule_type", rec.annotations.get("molecule_type", "DNA")
            )

            out_fname = f"{clean_stem}_proto_core_{r_idx}.gbk"
            out_path = out_dir / out_fname
            SeqIO.write([sub_rec], str(out_path), "genbank")
            written.append((r_idx, out_fname))

    return written


####################################################################################################
# Background worker
####################################################################################################

def run_tte(job_id: str, reference_file_path: str, input_file_paths: list) -> None:
    try:
        results = []
        gb_file_paths = {}  # clean_name → full path (for download endpoint)

        total_input_files = len(input_file_paths)

        # ── Phase 1: extract reference TTEs ──────────────────────────────
        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase": "extracting_reference",
            "message": "Extracting TTE from reference file...",
            "current": 0,
            "total": total_input_files,
        }

        ref_records = get_tte_records(Path(reference_file_path))
        for row in ref_records:
            row["similarity"] = "reference"
            row["role"] = "reference"
        results.extend(ref_records)

        # ── Phase 2: per input file — extract TTEs, compute similarity,
        #             and save a protocore-only GenBank ───────────────────
        for file_idx, input_path in enumerate(input_file_paths):
            # Clean filename: strip UUID prefix  e.g. uuid_IN_0_myfile.gb → myfile.gb
            clean_fname = re.sub(r'^[a-f0-9\-]+_(?:IN_\d+|REF)_', '', Path(input_path).name)

            app.config["JOB_RESULTS"][job_id]["progress"] = {
                "phase": "comparing",
                "message": f"Extracting TTE sequences from {clean_fname}...",
                "current": file_idx,
                "total": total_input_files,
                "current_file": clean_fname,
            }

            input_records = get_tte_records(Path(input_path))

            app.config["JOB_RESULTS"][job_id]["progress"] = {
                "phase": "similarity",
                "message": f"Computing similarity for {clean_fname}...",
                "current": file_idx,
                "total": total_input_files,
                "current_file": clean_fname,
                "tte_count": len(input_records),
            }

            for row in input_records:
                row["role"] = "input"
                max_sim = None
                for ref in ref_records:
                    sim = get_similarity(row.get("tte_seq", ""), ref.get("tte_seq", ""))
                    if sim is None:
                        continue
                    if max_sim is None or sim > max_sim:
                        max_sim = sim
                row["similarity"] = max_sim

            results.extend(input_records)

            # ── Save one GenBank per protocore region for this input file ──
            stem = Path(input_path).stem
            clean_stem = re.sub(r'^[a-f0-9\-]+_(?:IN_\d+|REF)_', '', stem)

            written = extract_protocore_gbk(
                Path(input_path), Path(TEMP_DIR), clean_stem
            )
            for r_idx, out_fname in written:
                region_id = f"proto_core_{r_idx}"
                # Key: "<clean_stem>::<region_id>"  e.g. "myfile::proto_core_2"
                lookup_key = f"{clean_stem}::{region_id}"
                gb_file_paths[lookup_key] = str(Path(TEMP_DIR) / out_fname)
            if written:
                app.logger.info(
                    "Wrote %d individual protocore file(s) for %s",
                    len(written), clean_stem,
                )

        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Success).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = "TTE extraction & similarity completed"
        app.config["JOB_RESULTS"][job_id]["results"] = results
        app.config["JOB_RESULTS"][job_id]["gb_file_paths"] = gb_file_paths
        # Store list of protocore lookup keys so frontend can render per-region buttons
        # Each key is "<clean_stem>::<region_id>" → maps to its filename
        app.config["JOB_RESULTS"][job_id]["protocore_files"] = {
            key: Path(path).name for key, path in gb_file_paths.items()
        }

    except Exception as e:
        app.logger.error("run_tte error for job %s: %s", job_id, e)
        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Failure).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = str(e)
        app.config["JOB_RESULTS"][job_id]["results"] = []

    # Clean up temp input files (protocore files are kept for download)
    for path in [reference_file_path] + input_file_paths:
        try:
            os.remove(path)
        except Exception:
            pass


####################################################################################################
# Route
####################################################################################################

@blueprint_submit_tte.route("/api/submit_tte", methods=["POST"])
def submit_tte() -> dict:
    """Submit one reference + one or more input GenBank files for TTE processing."""

    if "reference_file" not in request.files:
        return ResponseData(Status.Failure, message="reference_file is required.").to_dict()

    reference_file = request.files["reference_file"]
    input_files = request.files.getlist("input_files[]")

    if not reference_file.filename:
        return ResponseData(Status.Failure, message="Reference file is empty.").to_dict()

    if not reference_file.filename.lower().endswith((".gb", ".gbk")):
        return ResponseData(Status.Failure, message="Reference file must be a .gb or .gbk file.").to_dict()

    if not input_files:
        return ResponseData(Status.Failure, message="At least one input file is required.").to_dict()

    for f in input_files:
        if not f.filename:
            return ResponseData(Status.Failure, message="One of the input files has an empty filename.").to_dict()
        if not f.filename.lower().endswith((".gb", ".gbk")):
            return ResponseData(
                Status.Failure,
                message=f"Invalid input file: {f.filename}. Only .gb or .gbk files are allowed."
            ).to_dict()

    job_id = str(uuid.uuid4())
    timestamp = int(time.time())

    app.config["JOB_RESULTS"][job_id] = {
        "status": str(Status.Pending).lower(),
        "message": "TTE job is pending",
        "job_type": "tte",
        "results": [],
        "timestamp": timestamp,
        "gb_file_paths": {},
        "protocore_files": [],
    }

    os.makedirs(TEMP_DIR, exist_ok=True)

    reference_file_path = os.path.join(
        TEMP_DIR,
        f"{job_id}_REF_{secure_filename(reference_file.filename)}"
    )
    reference_file.save(reference_file_path)

    input_file_paths = []
    for idx, f in enumerate(input_files):
        path = os.path.join(
            TEMP_DIR,
            f"{job_id}_IN_{idx}_{secure_filename(f.filename)}"
        )
        f.save(path)
        input_file_paths.append(path)

    threading.Thread(
        target=run_tte,
        args=(job_id, reference_file_path, input_file_paths),
        daemon=True,
    ).start()

    return ResponseData(Status.Success, payload={"jobId": job_id}).to_dict()
