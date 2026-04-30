# -*- coding: utf-8 -*-

"""
Routes for annotating GenBank files with XUT and XU mATChmaker annotations.
"""

import os
import re
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
from .xu_xut_utils import (
    get_records,
    build_xut_buffer,
    build_xu_buffer,
    infer_is_protein,
)
from Bio.SeqFeature import SeqFeature, FeatureLocation
from collections import defaultdict

blueprint_xu_xut_annotation = Blueprint("xu_xut_annotation", __name__)


####################################################################################################
# Background worker
####################################################################################################

def run_xu_xut_annotation(job_id: str, input_path: str, created_by: str) -> None:
    """
    Background worker.
    1. Parse the GenBank file using get_records (handles multi-record, protein/nt, splitting).
    2. Build XUT and XU buffers for every record group.
    3. Write XUT_mATChmaker and XU_mATChmaker features back into the file.
    4. Save annotated GBK to TEMP_DIR.
    5. Store table rows + file path in JOB_RESULTS.
    """
    try:
        gbk_path = Path(input_path)

        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase": "parsing",
            "message": "Parsing GenBank file...",
            "current": 0,
            "total": 0,
        }

        # get_records returns (group_name, cds_map, seq, is_protein, original_name)
        record_groups = get_records(str(gbk_path))

        if not record_groups:
            raise Exception(
                "No NRPS/PKS domains found in the uploaded file. "
                "Make sure it is an antiSMASH-annotated GenBank with aSDomain features."
            )

        total_groups = len(record_groups)
        xut_grouped = defaultdict(list)
        xu_grouped  = defaultdict(list)
        table_rows  = []

        for idx, (group_name, cds_map, seq, is_protein, original_name) in enumerate(record_groups):
            app.config["JOB_RESULTS"][job_id]["progress"] = {
                "phase":   "annotating",
                "message": f"Annotating {group_name}...",
                "current": idx + 1,
                "total":   total_groups,
            }

            xut_buffer = build_xut_buffer(cds_map, seq, is_protein)
            xu_buffer  = build_xu_buffer(cds_map, seq, is_protein)

            xut_grouped[original_name].extend(xut_buffer)
            xu_grouped[original_name].extend(xu_buffer)

            # collect table rows for the results page
            for item in xut_buffer:
                table_rows.append({
                    "type":            "XUT",
                    "record":          group_name,
                    "original_record": original_name,
                    "module_position": item["module_position"],
                    "label":           item["label"],
                    "start":           item["start"],
                    "end":             item["end"],
                    "length":          len(item["sequence"]),
                    "sequence":        item["sequence"],
                })
            for item in xu_buffer:
                table_rows.append({
                    "type":            "XU",
                    "record":          group_name,
                    "original_record": original_name,
                    "module_position": item["module_position"],
                    "label":           item["label"],
                    "start":           item["start"],
                    "end":             item["end"],
                    "length":          len(item["sequence"]),
                    "sequence":        item["sequence"],
                })

        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase":   "saving",
            "message": "Writing annotated GenBank file...",
            "current": total_groups,
            "total":   total_groups,
        }

        # write features back into each record
        updated_records = []
        for record in SeqIO.parse(str(gbk_path), "genbank"):
            if "molecule_type" not in record.annotations:
                record.annotations["molecule_type"] = (
                    "protein" if infer_is_protein(record) else "DNA"
                )

            for item in xut_grouped.get(record.name, []):
                record.features.append(SeqFeature(
                    location   = FeatureLocation(item["start"], item["end"], strand=1),
                    type       = "XUT_mATChmaker",
                    qualifiers = {
                        "label":           [item["label"]],
                        "module_position": [str(item["module_position"])],
                        "created_by":      [created_by],
                        "modified_by":     [created_by],
                        "translation":     [item["sequence"]],
                    },
                ))
            for item in xu_grouped.get(record.name, []):
                record.features.append(SeqFeature(
                    location   = FeatureLocation(item["start"], item["end"], strand=1),
                    type       = "XU_mATChmaker",
                    qualifiers = {
                        "label":           [item["label"]],
                        "module_position": [str(item["module_position"])],
                        "created_by":      [created_by],
                        "modified_by":     [created_by],
                        "translation":     [item["sequence"]],
                    },
                ))

            record.features.sort(key=lambda f: int(f.location.start))
            updated_records.append(record)

        clean_stem = re.sub(r'^[a-f0-9\-]+_[AB]\d*_', '', gbk_path.stem)
        out_name   = f"{clean_stem}_XUT_XU_annotated.gb"
        out_path   = Path(TEMP_DIR) / out_name
        SeqIO.write(updated_records, str(out_path), "genbank")

        app.config["JOB_RESULTS"][job_id]["status"]         = str(Status.Success).lower()
        app.config["JOB_RESULTS"][job_id]["message"]         = "XUT/XU annotation complete"
        app.config["JOB_RESULTS"][job_id]["results"]         = table_rows
        app.config["JOB_RESULTS"][job_id]["annotated_file"]  = out_name
        app.config["JOB_RESULTS"][job_id]["gb_file_paths"]   = {out_name: str(out_path)}

    except Exception as e:
        app.logger.error("run_xu_xut_annotation error for job %s: %s", job_id, e)
        app.config["JOB_RESULTS"][job_id]["status"]  = str(Status.Failure).lower()
        app.config["JOB_RESULTS"][job_id]["message"]  = str(e)
        app.config["JOB_RESULTS"][job_id]["results"]  = []

    try:
        os.remove(input_path)
    except Exception:
        pass


####################################################################################################
# Route
####################################################################################################

@blueprint_xu_xut_annotation.route("/api/submit_xu_xut", methods=["POST"])
def submit_xu_xut():
    """Receive a GenBank file, run XUT/XU annotation, return job ID."""

    if "gbk_file" not in request.files:
        return ResponseData(Status.Failure, message="gbk_file is required.").to_dict()

    f = request.files["gbk_file"]
    if not f.filename or not f.filename.lower().endswith((".gb", ".gbk")):
        return ResponseData(Status.Failure, message="Only .gb or .gbk files allowed.").to_dict()

    created_by = request.form.get("created_by", "mATChmaker").strip() or "mATChmaker"

    job_id    = str(uuid.uuid4())
    timestamp = int(time.time())

    os.makedirs(TEMP_DIR, exist_ok=True)
    safe_name  = secure_filename(f.filename)
    input_path = os.path.join(TEMP_DIR, f"{job_id}_A_{safe_name}")
    f.save(input_path)

    app.config["JOB_RESULTS"][job_id] = {
        "status":         str(Status.Pending).lower(),
        "message":        "XUT/XU annotation job is pending",
        "job_type":       "xu_xut_annotation",
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
        target=run_xu_xut_annotation,
        args=(job_id, input_path, created_by),
        daemon=True,
    ).start()

    return ResponseData(Status.Success, payload={"jobId": job_id}).to_dict()