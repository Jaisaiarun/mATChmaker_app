# -*- coding: utf-8 -*-

"""
Routes for submitting TTE (two-GenBank-file) jobs.
Currently uses dummy parsing logic.
"""

import os
import threading
import time
import uuid
from typing import Dict, Any
import tempfile
import subprocess
from Bio import AlignIO
from Bio import SeqIO
from flask import Blueprint, request, Response
from werkzeug.utils import secure_filename

from .app import app
from .common import ResponseData, Status
from .constants import TEMP_DIR
from pathlib import Path

# Blueprint for TTE
blueprint_submit_tte = Blueprint("submit_tte", __name__)


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
                        # "similarity": "N/A"
                    })
        return rows


def run_tte(job_id: str, file_a_path: str, file_b_path: str) -> None:
    """
    Dummy TTE worker:
    - Parses both GenBank files
    - Extracts basic metadata
    - Stores result
    """
    try:
        results = []

        # --- Extract reference TTEs ---
        ref_records = get_tte_records(Path(file_a_path))
        for row in ref_records:
            row["similarity"] = "reference"
            row["role"] = "reference"

        # --- Extract input TTEs ---
        input_records = get_tte_records(Path(file_b_path))
        for row in input_records:
            row["role"] = "input"
            max_sim = None

            for ref in ref_records:
                sim = get_similarity(row.get("tte_seq", ""), ref.get("tte_seq", ""))
                if sim is None:
                    continue
                if max_sim is None or sim > max_sim:
                    max_sim = sim

            row["similarity"] = max_sim  # float or None

        results.extend(ref_records)
        results.extend(input_records)
        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Success).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = "TTE extraction & similarity completed"
        app.config["JOB_RESULTS"][job_id]["results"] = results

    except Exception as e:
        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Failure).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = str(e)
        app.config["JOB_RESULTS"][job_id]["results"] = []

    try:
        os.remove(file_a_path)
        os.remove(file_b_path)
    except Exception:
        pass


# API route
####################################################################################################

@blueprint_submit_tte.route("/api/submit_tte", methods=["POST"])
def submit_tte() -> dict[str, Any]:
    """
    Submit two GenBank files for TTE processing.
    """

    # Validate input
    if "input_file" not in request.files or "reference_file" not in request.files:
        return ResponseData(
            Status.Failure,
            message="Both GenBank files (reference_file, input_file) are required."
        ).to_dict()

    file_a = request.files["reference_file"]
    file_b = request.files["input_file"]

    for f in [file_a, file_b]:
        if f.filename == "":
            return ResponseData(
                Status.Failure,
                message="Empty filename provided."
            ).to_dict()
        if not f.filename.lower().endswith((".gb", ".gbk")):
            return ResponseData(
                Status.Failure,
                message="Only .gb or .gbk GenBank files are allowed for TTE."
            ).to_dict()

    # Job setup
    job_id = str(uuid.uuid4())
    timestamp = int(time.time())

    app.config["JOB_RESULTS"][job_id] = {
        "status": str(Status.Pending).lower(),
        "message": "TTE job is pending",
        "job_type": "tte",
        "results": [],
        "timestamp": timestamp,
    }

    # Ensure temp directory exists
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Save files
    file_a_path = os.path.join(
        TEMP_DIR,
        f"{job_id}_A_{secure_filename(file_a.filename)}"
    )
    file_b_path = os.path.join(
        TEMP_DIR,
        f"{job_id}_B_{secure_filename(file_b.filename)}"
    )

    file_a.save(file_a_path)
    file_b.save(file_b_path)

    # Run in background
    threading.Thread(
        target=run_tte,
        args=(job_id, file_a_path, file_b_path),
        daemon=True,
    ).start()

    return ResponseData(
        Status.Success,
        payload={"jobId": job_id}
    ).to_dict()
