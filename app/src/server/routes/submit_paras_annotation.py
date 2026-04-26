#  -*- coding: utf-8 -*-

"""
Routes for annotating genbank files with paras prediction.
"""

import os
import threading
import time
import uuid
from pathlib import Path
import re

from Bio import SeqIO
from flask import Blueprint, request
from werkzeug.utils import secure_filename

from .app import app
from .common import ResponseData, Status
from .constants import TEMP_DIR

blueprint_paras_annotation = Blueprint("paras_annotation", __name__)

SUBSTRATE_TO_3LETTER = {
    "alanine": "Ala",
    "arginine": "Arg",
    "asparagine": "Asn",
    "aspartate": "Asp",
    "cysteine": "Cys",
    "glutamine": "Gln",
    "glutamate": "Glu",
    "glycine": "Gly",
    "histidine": "His",
    "isoleucine": "Ile",
    "leucine": "Leu",
    "lysine": "Lys",
    "methionine": "Met",
    "phenylalanine": "Phe",
    "proline": "Pro",
    "serine": "Ser",
    "threonine": "Thr",
    "tryptophan": "Trp",
    "tyrosine": "Tyr",
    "valine": "Val",
    "ornithine": "Orn",
    "β-alanine": "bAla",
    "beta-alanine": "bAla",
    "hydroxyphenylglycine": "Hpg",
    "dihydroxyphenylglycine": "Dhpg",
    "pipecolate": "Pip",
    "salicylate": "Sal",
    "2,3-dihydroxybenzoate": "Dhb",
    "3-hydroxykynurenine": "Hkyn",
    "anthranilate": "Ant",
    "homoserine": "Hse",
    "norvaline": "Nva",
    "norleucine": "Nle",
}


def to_3_letter(substrate_name: str) -> str:
    if not substrate_name:
        return ""
    return SUBSTRATE_TO_3LETTER.get(substrate_name.strip().lower(), substrate_name)


def get_existing_specificity(feat) -> str:
    for key in ["specificity", "substrate_specificity", "consensus", "prediction"]:
        if key in feat.qualifiers and feat.qualifiers[key]:
            return "; ".join(feat.qualifiers[key])
    return ""


def run_paras_annotation(job_id: str, input_path: str, model_key: str) -> None:
    """
    Background worker.
    1. Parse the GenBank file.
    2. Find every AMP-binding aSDomain feature.
    3. Run PARAS on each one.
    4. Write predictions back as feat.qualifiers["specificity_prediction"].
    5. Save a new *_PARAS.gbk file.
    6. Store table rows + file path in JOB_RESULTS.
    """
    try:
        from parasect.api import run_paras
        from .submit import loader  # reuse the shared model loader

        gbk_path = Path(input_path)
        records = list(SeqIO.parse(str(gbk_path), "genbank"))

        # ── collect every AMP-binding domain ──
        amp_domains = []
        for rec_idx, record in enumerate(records):
            for feat_idx, feat in enumerate(record.features):
                if (
                    feat.type == "aSDomain"
                    and feat.qualifiers.get("aSDomain", [""])[0] == "AMP-binding"
                ):
                    amp_domains.append((rec_idx, feat_idx))

        if not amp_domains:
            raise Exception(
                f"No AMP-binding aSDomain features found in {gbk_path.name}. "
                "Make sure the file is an antiSMASH-annotated GenBank."
            )

        total = len(amp_domains)

        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "current": 0,
            "total": total,
            "current_domain": "Preparing model...",
            "phase": "loading_model",
            "started_at": app.config["JOB_RESULTS"][job_id]["timestamp"],
        }

        # ── load model once, reuse for all domains ──
        model = loader.get(model_key)

        # immediately move to running phase so frontend switches from indeterminate
        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "current": 0,
            "total": total,
            "current_domain": "Model loaded. Starting predictions...",
            "phase": "running",
            "started_at": app.config["JOB_RESULTS"][job_id]["timestamp"],
        }

        table_rows = []

        for i, (rec_idx, feat_idx) in enumerate(amp_domains):
            feat = records[rec_idx].features[feat_idx]

            seq = feat.qualifiers.get("translation", [""])[0]
            domain_id = feat.qualifiers.get("domain_id", [""])[0] or f"domain_{feat_idx}"
            locus_tag = feat.qualifiers.get("locus_tag", [""])[0] or ""

            if not seq:
                continue

            app.config["JOB_RESULTS"][job_id]["progress"] = {
                "current": i + 1,
                "total": total,
                "current_domain": domain_id,
                "phase": "running",
                "started_at": app.config["JOB_RESULTS"][job_id]["timestamp"],
            }

            fasta_input = f">{domain_id}\n{seq}"
            try:
                paras_results = run_paras(
                    selected_input=fasta_input,
                    selected_input_type="fasta",
                    path_temp_dir=TEMP_DIR,
                    model=model,
                    use_structure_guided_alignment=False,
                )
            except Exception as e:
                print(f"PARAS failed for {domain_id}: {e}")
                continue

            if not paras_results:
                continue

            preds = paras_results[0].to_json().get("predictions", [])

            preds_sorted = sorted(
                preds,
                key=lambda x: float(x["probability"]),
                reverse=True
            )

            existing_specificity = get_existing_specificity(feat)

            if preds_sorted:
                for i_ind in range(min(3, len(preds_sorted))):
                    top_pred = preds_sorted[i_ind]
                    top_score = float(top_pred["probability"])
                    top_name = top_pred["substrate_name"]
                    top_code = to_3_letter(top_name)
                    feat.qualifiers[f"specificity_prediction_PARAS_{i_ind + 1}"] = [top_code]
                    feat.qualifiers[f"specificity_score_PARAS_{i_ind + 1}"] = [str(round(top_score, 4))]

            feat.qualifiers = dict(sorted(feat.qualifiers.items()))

            for p in preds_sorted:
                score = float(p["probability"])
                if score < 0.05:
                    continue

                substrate_name = p["substrate_name"]
                substrate_code = to_3_letter(substrate_name)

                table_rows.append({
                    "domain_id": domain_id,
                    "locus_tag": locus_tag,
                    "seq": seq,
                    "existing_specificity": existing_specificity,
                    "substrate": substrate_name,
                    "substrate_3letter": substrate_code,
                    "score": round(score, 4),
                })

        del model

        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "current": total,
            "total": total,
            "current_domain": "Saving annotated file...",
            "phase": "saving",
            "started_at": app.config["JOB_RESULTS"][job_id]["timestamp"],
        }

        clean_stem = re.sub(r'^[a-f0-9\-]+_[AB]\d*_', '', gbk_path.stem)
        out_name = f"{clean_stem}_PARAS.gbk"
        out_path = gbk_path.parent / out_name
        SeqIO.write(records, str(out_path), "genbank")

        app.config["JOB_RESULTS"][job_id]["gb_file_paths"] = {
            out_name: str(out_path),
        }

        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Success).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = "Annotation complete"
        app.config["JOB_RESULTS"][job_id]["results"] = table_rows
        app.config["JOB_RESULTS"][job_id]["annotated_file"] = out_name

    except Exception as e:
        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Failure).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = str(e)
        app.config["JOB_RESULTS"][job_id]["results"] = []


@blueprint_paras_annotation.route("/api/submit_paras_annotation", methods=["POST"])
def submit_paras_annotation():
    """Receive a GenBank file + model choice, launch annotation job."""

    if "gbk_file" not in request.files:
        return ResponseData(Status.Failure, message="gbk_file is required.").to_dict()

    f = request.files["gbk_file"]
    if not f.filename or not f.filename.lower().endswith((".gb", ".gbk")):
        return ResponseData(Status.Failure, message="Only .gb or .gbk files allowed.").to_dict()

    model_key = request.form.get("model_key", "parasAllSubstrates").strip()
    allowed = {"parasAllSubstrates", "parasCommonSubstrates"}
    if model_key not in allowed:
        return ResponseData(Status.Failure, message=f"Unknown model: {model_key}").to_dict()

    job_id = str(uuid.uuid4())
    timestamp = int(time.time())

    os.makedirs(TEMP_DIR, exist_ok=True)
    safe_name = secure_filename(f.filename)
    input_path = os.path.join(TEMP_DIR, f"{job_id}_A_{safe_name}")
    f.save(input_path)

    # initialize progress immediately so frontend sees something before worker starts
    app.config["JOB_RESULTS"][job_id] = {
        "status": str(Status.Pending).lower(),
        "message": "Annotation job is pending",
        "job_type": "paras_annotation",
        "results": [],
        "timestamp": timestamp,
        "gb_file_paths": {},
        "progress": {
            "current": 0,
            "total": 0,
            "current_domain": "Queued...",
            "phase": "loading_model",
            "started_at": timestamp,
        },
    }

    threading.Thread(
        target=run_paras_annotation,
        args=(job_id, input_path, model_key),
        daemon=True,
    ).start()

    return ResponseData(Status.Success, payload={"jobId": job_id}).to_dict()