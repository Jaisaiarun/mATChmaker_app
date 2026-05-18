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
from Bio import AlignIO, SeqIO
from flask import Blueprint, request
from pathlib import Path
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
            return clustalo_pairwise_identity(str(in_out), str(ref_out))
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

            mono_feats = [
                f for f in rec.features
                if overlaps(rs, re_, *fpos(f)) and "monomer_pairings" in f.qualifiers
            ]
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
                has_te = any(
                    f.type == "PFAM_domain" and qget(f, "aSDomain") == "Thioesterase"
                    for f in feats_in_cds
                )
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
                        # populated by PARAS phase if enabled
                        "paras_substrates": [],
                    })
    return rows


def extract_protocore_gbk(gbk_path: Path, out_dir: Path, clean_stem: str) -> list:
    """
    Extract every protocluster region from gbk_path and write each one as
    its own GenBank file inside out_dir.
    Returns list of (region_idx, filename).
    """
    written = []
    for rec in SeqIO.parse(str(gbk_path), "genbank"):
        proto_regions = [f for f in rec.features if is_protocore(f)]
        for r_idx, region in enumerate(proto_regions, start=1):
            rs, re_ = fpos(region)
            sub_rec = rec[rs:re_]
            sub_rec.id = f"{rec.id}_proto_core_{r_idx}"
            sub_rec.name = f"{rec.name[:10]}_pc{r_idx}"
            sub_rec.description = f"Protocluster {r_idx} from {rec.description}"
            sub_rec.annotations.setdefault(
                "molecule_type", rec.annotations.get("molecule_type", "DNA")
            )
            out_fname = f"{clean_stem}_proto_core_{r_idx}.gbk"
            SeqIO.write([sub_rec], str(out_dir / out_fname), "genbank")
            written.append((r_idx, out_fname))
    return written


def run_paras_on_tte_rows(
        rows: list,
        input_file_paths: list,
        paras_model_key: str,
        job_id: str,
) -> tuple[list, dict]:
    """
    Run PARAS once per input GBK file on every AMP-binding aSDomain.

    For each protocore region, collect ALL AMP-binding predictions
    (one prediction per domain, top substrate only) and store them as a
    list on every TTE row that belongs to that region.

    Also writes qualifiers back onto each feature and saves a
    {clean_stem}_PARAS.gbk annotated file for download.

    Returns
    -------
    rows            : enriched row list (paras_substrates filled in)
    annotated_files : {out_name: full_path} for every file written
    """
    annotated_files: dict[str, str] = {}

    try:
        from parasect.api import run_paras
        from .submit import loader
        from .submit_paras_annotation import to_3_letter

        model = loader.get(paras_model_key)
        total_files = len(input_file_paths)

        # region_substrates[(clean_stem, region_id)] = [
        #     {"locus_tag": ..., "substrate": ..., "score": ...}, ...
        # ]
        region_substrates: dict[tuple, list] = {}

        for file_idx, input_path in enumerate(input_file_paths):
            gbk_path = Path(input_path)
            clean_stem = re.sub(r'^[a-f0-9\-]+_(?:IN_\d+|REF)_', '', gbk_path.stem)
            records = list(SeqIO.parse(str(gbk_path), "genbank"))

            for rec_idx, record in enumerate(records):
                proto_regions = [f for f in record.features if is_protocore(f)]

                for r_idx, region in enumerate(proto_regions, start=1):
                    region_id = f"proto_core_{r_idx}"
                    rs, re_ = fpos(region)
                    key = (clean_stem, region_id)
                    region_substrates.setdefault(key, [])

                    # All AMP-binding domains inside this protocore
                    amp_feats = [
                        (feat_idx, feat)
                        for feat_idx, feat in enumerate(record.features)
                        if (feat.type == "aSDomain"
                            and feat.qualifiers.get("aSDomain", [""])[0] == "AMP-binding"
                            and overlaps(rs, re_, *fpos(feat)))
                    ]

                    total_domains = len(amp_feats)

                    for domain_idx, (feat_idx, feat) in enumerate(amp_feats):
                        seq = feat.qualifiers.get("translation", [""])[0] or ""
                        locus_tag = feat.qualifiers.get("locus_tag", [""])[0] or ""
                        domain_id = feat.qualifiers.get("domain_id", [""])[0] or locus_tag

                        app.config["JOB_RESULTS"][job_id]["progress"] = {
                            "phase": "paras",
                            "message": (
                                f"File {file_idx + 1}/{total_files} — "
                                f"{region_id} domain {domain_idx + 1}/{total_domains}"
                            ),
                            "current": domain_idx + 1,
                            "total": total_domains,
                        }

                        if not seq:
                            continue

                        try:
                            paras_results = run_paras(
                                selected_input=f">{domain_id}\n{seq}",
                                selected_input_type="fasta",
                                path_temp_dir=TEMP_DIR,
                                model=model,
                                use_structure_guided_alignment=False,
                            )
                        except Exception:
                            continue

                        if not paras_results:
                            continue

                        preds = sorted(
                            paras_results[0].to_json().get("predictions", []),
                            key=lambda x: float(x["probability"]),
                            reverse=True,
                        )

                        if not preds:
                            continue

                        # Write top 3 back onto the feature for the annotated GBK
                        for i_ind, p in enumerate(preds[:3]):
                            if float(p["probability"]) <= 0.1:
                                break  # preds are sorted desc, so stop here
                            feat.qualifiers[f"specificity_prediction_PARAS_{i_ind + 1}"] = [
                                to_3_letter(p["substrate_name"])
                            ]
                            feat.qualifiers[f"specificity_score_PARAS_{i_ind + 1}"] = [
                                str(round(float(p["probability"]), 4))
                            ]
                        feat.qualifiers = dict(sorted(feat.qualifiers.items()))

                        # Store top prediction for this domain → region lookup
                        top = preds[0]
                        region_substrates[key].append({
                            "substrate": top["substrate_name"],
                            "substrate_3letter": to_3_letter(top["substrate_name"]),
                            "score": round(float(top["probability"]), 4),
                        })

            # Save annotated GBK for this input file
            out_name = f"{clean_stem}_PARAS.gbk"
            out_path = Path(TEMP_DIR) / out_name
            SeqIO.write(records, str(out_path), "genbank")
            annotated_files[out_name] = str(out_path)
            app.logger.info("Saved PARAS-annotated GBK: %s", out_name)

        del model

        # ── Fill paras_substrates on every matching TTE row ──────────────
        for row in rows:
            if row.get("role") != "input":
                continue
            # row["file"] still carries UUID prefix — strip it before matching
            raw_name = re.sub(r'\.(gb|gbk)$', '', row["file"], flags=re.IGNORECASE)
            clean_stem = re.sub(r'^[a-f0-9\-]+_(?:IN_\d+|REF)_', '', raw_name)
            region_id = row.get("region_id", "")
            key = (clean_stem, region_id)
            row["paras_substrates"] = region_substrates.get(key, [])

    except Exception as e:
        app.logger.warning("PARAS annotation step failed: %s", e)

    return rows, annotated_files


####################################################################################################
# Background worker
####################################################################################################

def run_tte(
        job_id: str,
        reference_file_path: str,
        input_file_paths: list,
        run_paras_annotation: bool = False,
        paras_model_key: str = "parasAllSubstrates",
) -> None:
    try:
        results = []
        gb_file_paths = {}
        total_input_files = len(input_file_paths)

        # ── Phase 1: extract ALL reference protocore TTEs ─────────────────
        # Each reference protocore becomes its own comparison group.
        # ref_records is a flat list; each row carries region_id and region_idx
        # which identifies which reference protocore it belongs to.
        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase": "extracting_reference",
            "message": "Extracting TTE from reference file...",
            "current": 0,
            "total": total_input_files,
        }

        ref_records = get_tte_records(Path(reference_file_path))

        # Build a lookup: region_id -> list of ref TTE rows for that protocore
        ref_by_protocore: dict[str, list] = {}
        for row in ref_records:
            row["similarity"] = "reference"
            row["role"] = "reference"
            row["paras_substrates"] = []
            row["reference_protocore_id"] = row["region_id"]
            ref_by_protocore.setdefault(row["region_id"], []).append(row)

        # Add one reference row per protocore into results
        results.extend(ref_records)

        ref_protocore_ids = list(ref_by_protocore.keys())
        app.logger.info(
            "Reference file has %d protocore(s): %s",
            len(ref_protocore_ids), ref_protocore_ids
        )

        # ── Phase 2: per input file — compare against EACH ref protocore ──
        # For each input protocore row, we create one result entry per
        # reference protocore, each carrying its own similarity score and
        # reference_protocore_id so the frontend can group them into tables.
        for file_idx, input_path in enumerate(input_file_paths):
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

                if len(ref_protocore_ids) == 1:
                    # Single reference protocore — original behaviour: one row per input
                    ref_id = ref_protocore_ids[0]
                    ref_rows = ref_by_protocore[ref_id]
                    best_sim = None
                    for ref in ref_rows:
                        sim = get_similarity(row.get("tte_seq", ""), ref.get("tte_seq", ""))
                        if sim is None:
                            continue
                        if best_sim is None or sim > best_sim:
                            best_sim = sim
                    row["similarity"] = best_sim
                    row["reference_protocore_id"] = ref_id
                    results.append(row)

                else:
                    # Multiple reference protocores — emit one row per ref protocore
                    # so each table gets its own comparison entry.
                    for ref_id, ref_rows in ref_by_protocore.items():
                        best_sim = None
                        for ref in ref_rows:
                            sim = get_similarity(row.get("tte_seq", ""), ref.get("tte_seq", ""))
                            if sim is None:
                                continue
                            if best_sim is None or sim > best_sim:
                                best_sim = sim

                        # Copy the row so each ref-protocore table gets an independent entry
                        import copy
                        row_copy = copy.deepcopy(row)
                        row_copy["similarity"] = best_sim
                        row_copy["reference_protocore_id"] = ref_id
                        results.append(row_copy)

        # ── Phase 3 (optional): PARAS on all input files ──────────────────
        if run_paras_annotation:
            app.config["JOB_RESULTS"][job_id]["progress"] = {
                "phase": "paras",
                "message": "Loading PARAS model...",
                "current": 0,
                "total": 0,
            }
            results, annotated_files = run_paras_on_tte_rows(
                rows=results,
                input_file_paths=input_file_paths,
                paras_model_key=paras_model_key,
                job_id=job_id,
            )
            gb_file_paths.update(annotated_files)

        # ── Phase 4: extract protocores ───────────────────────────────────
        for input_path in input_file_paths:
            stem = Path(input_path).stem
            clean_stem = re.sub(r'^[a-f0-9\-]+_(?:IN_\d+|REF)_', '', stem)
            paras_path = Path(TEMP_DIR) / f"{clean_stem}_PARAS.gbk"
            source = paras_path if paras_path.exists() else Path(input_path)

            written = extract_protocore_gbk(source, Path(TEMP_DIR), clean_stem)
            for r_idx, out_fname in written:
                lookup_key = f"{clean_stem}::proto_core_{r_idx}"
                gb_file_paths[lookup_key] = str(Path(TEMP_DIR) / out_fname)
            if written:
                app.logger.info(
                    "Wrote %d protocore file(s) for %s (source: %s)",
                    len(written), clean_stem, source.name,
                )

        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Success).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = "TTE extraction & similarity completed"
        app.config["JOB_RESULTS"][job_id]["results"] = results
        app.config["JOB_RESULTS"][job_id]["gb_file_paths"] = gb_file_paths
        app.config["JOB_RESULTS"][job_id]["has_paras"] = run_paras_annotation
        app.config["JOB_RESULTS"][job_id]["protocore_files"] = {
            key: Path(path).name for key, path in gb_file_paths.items()
            if not key.endswith("_PARAS.gbk")
        }

    except Exception as e:
        app.logger.error("run_tte error for job %s: %s", job_id, e)
        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Failure).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = str(e)
        app.config["JOB_RESULTS"][job_id]["results"] = []

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

    run_paras = request.form.get("run_paras_annotation", "false").lower() == "true"
    paras_model_key = request.form.get("paras_model_key", "parasAllSubstrates").strip()
    if paras_model_key not in {"parasAllSubstrates", "parasCommonSubstrates"}:
        paras_model_key = "parasAllSubstrates"

    app.config["JOB_RESULTS"][job_id] = {
        "status": str(Status.Pending).lower(),
        "message": "TTE job is pending",
        "job_type": "tte",
        "results": [],
        "timestamp": timestamp,
        "gb_file_paths": {},
        "protocore_files": [],
        "has_paras": run_paras,
    }

    os.makedirs(TEMP_DIR, exist_ok=True)

    reference_file_path = os.path.join(
        TEMP_DIR,
        f"{job_id}_REF_{secure_filename(reference_file.filename)}"
    )
    reference_file.save(reference_file_path)

    input_file_paths = []
    for idx, f in enumerate(input_files):
        path = os.path.join(TEMP_DIR, f"{job_id}_IN_{idx}_{secure_filename(f.filename)}")
        f.save(path)
        input_file_paths.append(path)

    threading.Thread(
        target=run_tte,
        args=(job_id, reference_file_path, input_file_paths, run_paras, paras_model_key),
        daemon=True,
    ).start()

    return ResponseData(Status.Success, payload={"jobId": job_id}).to_dict()
