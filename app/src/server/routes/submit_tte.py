# -*- coding: utf-8 -*-

"""
Routes for submitting TTE jobs.
"""

import os
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any
import re

from Bio import AlignIO
from Bio import SeqIO
from flask import Blueprint, request
from werkzeug.utils import secure_filename

from .app import app
from .common import ResponseData, Status
from .constants import TEMP_DIR

# Blueprint for TTE
blueprint_submit_tte = Blueprint("submit_tte", __name__)


# TODO: Add a checkbutton to enable paras prediction on the genebank files uploaded
####################################################################################################
# Background worker
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
            # if your clustalo_pairwise_identity returns a list, extract the single float:
            if isinstance(similarity, list) and similarity:
                # Expecting one pair only
                # Pull the 'identity' field if present
                if isinstance(similarity[0], dict) and "identity" in similarity[0]:
                    return similarity[0]["identity"]
                else:
                    return float(similarity[0])
            return similarity
    except Exception as e:
        # print(f" Error processing similarity: {e}")
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
    cs, ce = fpos(cds_feat)
    prot_len = len(translation)

    pfams = [f for f in feats_in_cds if f.type == "PFAM_domain" or f.type == "aSDomain"]
    # TE domains inside CDS
    te_feats = [f for f in pfams if qget(f, "aSDomain") == "Thioesterase" and f.type == "PFAM_domain"]
    if not te_feats:
        return ""  # no TE => skip

    te_feats.sort(key=lambda f: fpos(f)[0], reverse=(strand == -1))
    te = te_feats[0]
    te_start_nt, _ = fpos(te)
    te_start_nt = qget(te, "protein_start")

    # PP-binding/PCP/PMP inside CDS, upstream of TE
    upstream_caps = {"PP-binding", "PCP", "PMP"}
    temp_caps = [f for f in feats_in_cds if qget(f, "aSDomain") in upstream_caps]
    if not temp_caps:
        return ""
    temp_caps.sort(key=lambda f: fpos(f)[0], reverse=(strand != -1))

    anchor = temp_caps[0]

    # find start AA index: prefer protein_start; fallback to nt mapping
    ps = qget(anchor, "protein_start")
    if te_start_nt > ps:
        return translation[int(ps):]
    else:
        return ""


def get_tte_records(gbk_path):
    rows = []

    for rec in SeqIO.parse(gbk_path, "genbank"):
        name = rec.name
        proto_regions = [f for f in rec.features if is_protocore(f)]
        for r_idx, region in enumerate(proto_regions, start=1):
            rs, re = fpos(region)
            region_id = f"proto_core_{r_idx}"

            mono_feats = [f for f in rec.features if overlaps(rs, re, *fpos(f)) and "monomer_pairings" in f.qualifiers]
            mono_feats.sort(key=lambda f: fpos(f)[0])
            monomers = []
            for mf in mono_feats:
                for v in mf.qualifiers.get("monomer_pairings", []):
                    monomers.append(str(v))
            monomers_str = " | ".join(monomers)

            cds_list = [f for f in rec.features if f.type == "CDS" and overlaps(rs, re, *fpos(f))]
            feats_in_region = [f for f in rec.features if overlaps(rs, re, *fpos(f))]

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
                        "monomer_pairs": monomers_str,
                        "CDS_locus_tag": qget(cds, "locus_tag") or qget(cds, "locus_tags"),
                        "tte_seq": tte_seq,
                        "tte_len": len(tte_seq)
                    })

    return rows


def run_tte(job_id: str, reference_file_path: str, input_file_paths: list[str]) -> None:
    try:
        results = []

        total_input_files = len(input_file_paths)
        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase": "extracting_reference",
            "message": f"Extracting TTE from reference file...",
            "current": 0,
            "total": total_input_files,
        }

        ref_records = get_tte_records(Path(reference_file_path))
        for row in ref_records:
            row["similarity"] = "reference"
            row["role"] = "reference"

        results.extend(ref_records)

        for file_idx,input_path in enumerate(input_file_paths):
            clean_fname = re.sub(r'^[a-f0-9\-]+_[AB]\d*_', '', input_path)

            app.config["JOB_RESULTS"][job_id]["progress"] = {
                "phase": "comparing",
                "message": f"Comparing {clean_fname}...",
                "current": clean_fname,
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
                    print(max_sim, sim)
                    if sim is None:
                        continue
                    if max_sim is None or sim > max_sim:
                        max_sim = sim
                row["similarity"] = max_sim

            results.extend(input_records)

        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Success).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = "TTE extraction & similarity completed"
        app.config["JOB_RESULTS"][job_id]["results"] = results

    except Exception as e:
        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Failure).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = str(e)
        app.config["JOB_RESULTS"][job_id]["results"] = []

    try:
        os.remove(reference_file_path)
    except Exception:
        pass

    for path in input_file_paths:
        try:
            os.remove(path)
        except Exception:
            pass


# API route
####################################################################################################

@blueprint_submit_tte.route("/api/submit_tte", methods=["POST"])
def submit_tte() -> dict[str, Any]:
    """
    Submit one reference GenBank file and one or more input GenBank files for TTE processing.
    """

    if "reference_file" not in request.files:
        return ResponseData(
            Status.Failure,
            message="reference_file is required."
        ).to_dict()

    reference_file = request.files["reference_file"]
    input_files = request.files.getlist("input_files[]")

    if reference_file.filename == "":
        return ResponseData(
            Status.Failure,
            message="Reference file is empty."
        ).to_dict()

    if not reference_file.filename.lower().endswith((".gb", ".gbk")):
        return ResponseData(
            Status.Failure,
            message="Reference file must be a .gb or .gbk file."
        ).to_dict()

    if not input_files:
        return ResponseData(
            Status.Failure,
            message="At least one input file is required."
        ).to_dict()

    for f in input_files:
        if f.filename == "":
            return ResponseData(
                Status.Failure,
                message="One of the input files has an empty filename."
            ).to_dict()
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

    return ResponseData(
        Status.Success,
        payload={"jobId": job_id}
    ).to_dict()
