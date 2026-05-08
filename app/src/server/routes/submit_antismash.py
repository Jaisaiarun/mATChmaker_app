# -*- coding: utf-8 -*-

"""
Routes for running antiSMASH on a GenBank file and returning the annotated output.

antiSMASH is run with:
  - NRPS/PKS analysis (default) → produces aSModule, monomer_pairings, aSDomain features
  - PFAM domain annotation      → produces PFAM_domain features
  - Input gene annotations kept (--genefinding-tool none)

The merged annotated GenBank is returned as a downloadable file.
"""

import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

from Bio import SeqIO
from flask import Blueprint, request
from werkzeug.utils import secure_filename

from .app import app
from .common import ResponseData, Status
from .constants import TEMP_DIR

blueprint_antismash = Blueprint("antismash", __name__)


####################################################################################################
# Helper
####################################################################################################

def _find_antismash() -> str:
    """Return the antismash executable path, or raise if not found."""
    exe = shutil.which("antismash")
    if exe:
        return exe
    # common conda/venv paths
    for candidate in ["/usr/local/bin/antismash", "/opt/conda/bin/antismash"]:
        if os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError(
        "antiSMASH executable not found. "
        "Install it with: conda install -c bioconda antismash"
    )


def _merge_antismash_output(output_dir: Path, original_stem: str) -> tuple[Path, dict]:
    """
    antiSMASH writes one .gbk per region.  Merge all region files into a single
    multi-record GenBank, fixing molecule_type if missing.

    Returns (merged_path, {filename: full_path}) for download.
    """
    region_files = sorted(output_dir.glob("*.gbk")) + sorted(output_dir.glob("*.gb"))
    if not region_files:
        raise Exception("antiSMASH produced no GenBank output files.")

    all_records = []
    for rf in region_files:
        for rec in SeqIO.parse(str(rf), "genbank"):
            if "molecule_type" not in rec.annotations:
                rec.annotations["molecule_type"] = "DNA"
            all_records.append(rec)

    out_name = f"{original_stem}_antiSMASH.gb"
    out_path = Path(TEMP_DIR) / out_name
    SeqIO.write(all_records, str(out_path), "genbank")

    # also expose individual region files for granular download
    gb_file_paths = {out_name: str(out_path)}
    for rf in region_files:
        gb_file_paths[rf.name] = str(rf)

    return out_path, gb_file_paths


####################################################################################################
# Background worker
####################################################################################################

def run_antismash_annotation(job_id: str, input_path: str) -> None:
    """
    Background worker.
    1. Run antiSMASH on the input file.
    2. Merge output into a single annotated GenBank.
    3. Store file paths and a summary in JOB_RESULTS.
    """
    output_dir = Path(TEMP_DIR) / f"{job_id}_antismash_out"

    try:
        antismash_exe = _find_antismash()
        gbk_path      = Path(input_path)
        original_stem = re.sub(r'^[a-f0-9\-]+_[AB]\d*_', '', gbk_path.stem)

        os.makedirs(str(output_dir), exist_ok=True)

        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase":   "running",
            "message": "Running antiSMASH (this may take several minutes)...",
            "current": 0,
            "total":   0,
        }

        db_dir = os.environ.get("ANTISMASH_DB_DIR", "")

        cmd = [
            antismash_exe,
            str(gbk_path),
            "--output-dir",       str(output_dir),
            "--genefinding-tool", "none",       # keep existing gene annotations
            "--pfam2go",                         # PFAM domain annotation
            "--cpus",             "4",
            "--logfile",          str(output_dir / "antismash.log"),
        ]

        # add database dir only when explicitly set (not needed if installed default)
        if db_dir and os.path.isdir(db_dir):
            cmd += ["--databases", db_dir]

        app.logger.info("antiSMASH command: %s", " ".join(cmd))

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1800,        # 30 min hard limit
        )

        if proc.returncode != 0:
            log_tail = proc.stderr[-2000:] if proc.stderr else "(no stderr)"
            raise Exception(
                f"antiSMASH exited with code {proc.returncode}.\n"
                f"Last output:\n{log_tail}"
            )

        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase":   "merging",
            "message": "Merging antiSMASH output files...",
            "current": 0,
            "total":   0,
        }

        merged_path, gb_file_paths = _merge_antismash_output(output_dir, original_stem)

        # Build a summary: count feature types in the merged output
        summary = {
            "total_records":  0,
            "protoclusters":  0,
            "as_modules":     0,
            "as_domains":     0,
            "pfam_domains":   0,
            "cds_features":   0,
        }
        for rec in SeqIO.parse(str(merged_path), "genbank"):
            summary["total_records"] += 1
            for feat in rec.features:
                if feat.type == "protocluster":  summary["protoclusters"] += 1
                elif feat.type == "aSModule":    summary["as_modules"]    += 1
                elif feat.type == "aSDomain":    summary["as_domains"]    += 1
                elif feat.type == "PFAM_domain": summary["pfam_domains"]  += 1
                elif feat.type == "CDS":         summary["cds_features"]  += 1

        app.config["JOB_RESULTS"][job_id]["status"]         = str(Status.Success).lower()
        app.config["JOB_RESULTS"][job_id]["message"]         = "antiSMASH annotation complete"
        app.config["JOB_RESULTS"][job_id]["results"]         = [summary]
        app.config["JOB_RESULTS"][job_id]["annotated_file"]  = merged_path.name
        app.config["JOB_RESULTS"][job_id]["gb_file_paths"]   = gb_file_paths

    except Exception as e:
        app.logger.error("run_antismash_annotation error for job %s: %s", job_id, e)
        app.config["JOB_RESULTS"][job_id]["status"]  = str(Status.Failure).lower()
        app.config["JOB_RESULTS"][job_id]["message"]  = str(e)
        app.config["JOB_RESULTS"][job_id]["results"]  = []

    finally:
        try:
            os.remove(input_path)
        except Exception:
            pass
        # keep output_dir — files needed for download
        # cleaned up by the 7-day job expiry job in api.py


####################################################################################################
# Route
####################################################################################################

@blueprint_antismash.route("/api/submit_antismash", methods=["POST"])
def submit_antismash():
    """Receive a GenBank file, run antiSMASH, return job ID."""

    if "gbk_file" not in request.files:
        return ResponseData(Status.Failure, message="gbk_file is required.").to_dict()

    f = request.files["gbk_file"]
    if not f.filename or not f.filename.lower().endswith((".gb", ".gbk")):
        return ResponseData(Status.Failure, message="Only .gb or .gbk files allowed.").to_dict()

    job_id    = str(uuid.uuid4())
    timestamp = int(time.time())

    os.makedirs(TEMP_DIR, exist_ok=True)
    safe_name  = secure_filename(f.filename)
    input_path = os.path.join(TEMP_DIR, f"{job_id}_A_{safe_name}")
    f.save(input_path)

    app.config["JOB_RESULTS"][job_id] = {
        "status":         str(Status.Pending).lower(),
        "message":        "antiSMASH job is pending",
        "job_type":       "antismash",
        "results":        [],
        "timestamp":      timestamp,
        "gb_file_paths":  {},
        "annotated_file": None,
        "progress": {
            "phase":   "queued",
            "message": "Queued...",
            "current": 0,
            "total":   0,
        },
    }

    threading.Thread(
        target=run_antismash_annotation,
        args=(job_id, input_path),
        daemon=True,
    ).start()

    return ResponseData(Status.Success, payload={"jobId": job_id}).to_dict()