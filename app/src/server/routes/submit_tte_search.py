# -*- coding: utf-8 -*-

"""
Route for searching a reference GenBank file against the precomputed TTE
reference database (loaded by build_tte_db.py at startup).

The reference file is assumed to be antiSMASH-annotated already.  For each
protocluster in the reference:
  1. Extract its TTE sequences (via the existing helper in submit_tte).
  2. For every cluster in the DB, compute the best (max) TTE × TTE
     percent identity using Clustal Omega.
  3. Apply the user-supplied similarity threshold to filter hits.
  4. Group hits under the reference protocluster they belong to.

Empty groups (a protocluster whose hits all fell below threshold, or which
had no extractable TTE) are preserved in the response so the frontend can
show "no hits above threshold" rather than silently dropping them.
"""

import os
import threading
import time
import uuid
from pathlib import Path
from typing import Optional
from flask import Blueprint, request
from werkzeug.utils import secure_filename

from .app import app
from .common import ResponseData, Status
from .constants import TEMP_DIR
from .submit_tte import get_tte_records, get_similarity

blueprint_submit_tte_search = Blueprint("submit_tte_search", __name__)


####################################################################################################
# Constants
####################################################################################################

DEFAULT_MIN_SIMILARITY = 50.0


####################################################################################################
# Reference TTE extraction grouped by protocluster
####################################################################################################

def _group_reference_ttes_by_protocluster(reference_path: Path) -> list:
    """
    Return [{region_id, region_idx, monomer_pairs, ttes: [{cds_locus_tag, tte_seq, tte_len}, ...]}]
    one entry per protocluster in the reference file (even if it has no TTE).
    """
    rows = get_tte_records(reference_path)

    # Bucket rows by region_id; preserve order of first appearance for stable display.
    buckets = {}
    order = []
    for r in rows:
        rid = r.get("region_id")
        if not rid:
            continue
        if rid not in buckets:
            buckets[rid] = {
                "region_id": rid,
                "region_idx": r.get("region_idx"),
                "monomer_pairs": r.get("monomer_pairs", ""),
                "ttes": [],
            }
            order.append(rid)
        buckets[rid]["ttes"].append({
            "cds_locus_tag": r.get("CDS_locus_tag", "") or "",
            "tte_seq": r.get("tte_seq", ""),
            "tte_len": r.get("tte_len", 0),
        })

    return [buckets[rid] for rid in order]


####################################################################################################
# Best-pair scoring
####################################################################################################

def _best_pair_score(ref_ttes: list, db_ttes: list) -> Optional[dict]:
    """
    For two lists of TTE dicts, return the single best-scoring pair as
    {similarity, best_ref_cds, best_db_cds, ref_tte_len, db_tte_len}.
    Returns None if no pair could be scored (no TTEs on one side, or all
    alignments failed).
    """
    if not ref_ttes or not db_ttes:
        return None

    best = None
    for ref in ref_ttes:
        ref_seq = ref.get("tte_seq", "")
        if not ref_seq:
            continue
        for db_t in db_ttes:
            db_seq = db_t.get("tte_seq", "")
            if not db_seq:
                continue
            sim = get_similarity(ref_seq, db_seq)
            if sim is None:
                continue
            if best is None or sim > best["similarity"]:
                best = {
                    "similarity": sim,
                    "best_ref_cds": ref.get("cds_locus_tag", ""),
                    "best_db_cds": db_t.get("cds_locus_tag", ""),
                    "ref_tte_len": ref.get("tte_len", len(ref_seq)),
                    "db_tte_len": db_t.get("tte_len", len(db_seq)),
                }
    return best


####################################################################################################
# Background worker
####################################################################################################

def run_tte_search(
        job_id: str,
        reference_path: str,
        min_similarity: float,
) -> None:
    try:
        db = app.config.get("TTE_DB")
        if not db or not db.get("clusters"):
            raise Exception(
                "TTE reference database is empty or not loaded. "
                "Check that /app/mibig_nrps_db contains annotated GenBank files "
                "and the container was restarted after they were added."
            )

        ref_path = Path(reference_path)

        # ── Phase 1: extract reference TTEs grouped by protocluster ───────
        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase": "extracting_reference",
            "message": "Extracting TTE sequences from reference protoclusters...",
            "current": 0,
            "total": 0,
        }

        protoclusters = _group_reference_ttes_by_protocluster(ref_path)
        if not protoclusters:
            raise Exception(
                "No protoclusters found in the reference file. "
                "Make sure the file is antiSMASH-annotated."
            )

        app.logger.info(
            "Reference has %d protocluster(s); DB has %d clusters / %d TTEs",
            len(protoclusters),
            db["stats"]["with_ttes"],
            db["stats"]["total_ttes"],
        )

        # ── Phase 2: per-protocluster scoring against the DB ──────────────
        # One group per reference protocluster (preserved even when empty).
        groups = []
        total = len(protoclusters)

        for idx, pc in enumerate(protoclusters, start=1):
            app.config["JOB_RESULTS"][job_id]["progress"] = {
                "phase": "scoring",
                "message": f"Scoring protocluster {idx}/{total} against {len(db['clusters'])} DB clusters...",
                "current": idx - 1,
                "total": total,
                "current_protocluster": pc["region_id"],
            }

            hits = []
            for cluster in db["clusters"]:
                best = _best_pair_score(pc["ttes"], cluster["ttes"])
                if best is None:
                    continue
                if best["similarity"] < min_similarity:
                    continue
                meta = cluster.get("metadata", {})
                hits.append({
                    "bgc_id": cluster["bgc_id"],
                    "filename": cluster.get("filename", ""),
                    "similarity": best["similarity"],
                    "best_ref_cds": best["best_ref_cds"],
                    "best_db_cds": best["best_db_cds"],
                    "ref_tte_len": best["ref_tte_len"],
                    "db_tte_len": best["db_tte_len"],
                    "definition": meta.get("definition", ""),
                    "source_organism": meta.get("source_organism", ""),
                    "product_class": meta.get("product_class", ""),
                    "accession": meta.get("accession", ""),
                    "db_tte_count": len(cluster.get("ttes", [])),
                })

            # Descending by similarity for nicer display
            hits.sort(key=lambda h: h["similarity"], reverse=True)

            groups.append({
                "region_id": pc["region_id"],
                "region_idx": pc["region_idx"],
                "monomer_pairs": pc["monomer_pairs"],
                "reference_tte_count": len(pc["ttes"]),
                "hit_count": len(hits),
                "hits": hits,
            })

        # ── Final progress update ─────────────────────────────────────────
        app.config["JOB_RESULTS"][job_id]["progress"] = {
            "phase": "done",
            "message": "TTE search complete.",
            "current": total,
            "total": total,
        }

        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Success).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = (
            f"TTE search complete: {sum(g['hit_count'] for g in groups)} hits "
            f"across {len(groups)} reference protocluster(s) at ≥{min_similarity}% identity."
        )
        app.config["JOB_RESULTS"][job_id]["results"] = groups
        app.config["JOB_RESULTS"][job_id]["search_params"] = {
            "min_similarity": min_similarity,
            "db_cluster_count": db["stats"]["with_ttes"],
            "db_tte_count": db["stats"]["total_ttes"],
        }

    except Exception as exc:
        app.logger.error("run_tte_search error for job %s: %s", job_id, exc)
        app.config["JOB_RESULTS"][job_id]["status"] = str(Status.Failure).lower()
        app.config["JOB_RESULTS"][job_id]["message"] = str(exc)
        app.config["JOB_RESULTS"][job_id]["results"] = []

    finally:
        try:
            os.remove(reference_path)
        except Exception:
            pass


####################################################################################################
# Route
####################################################################################################

@blueprint_submit_tte_search.route("/api/submit_tte_search", methods=["POST"])
def submit_tte_search():
    """
    Submit one antiSMASH-annotated reference GenBank to be searched against
    the precomputed TTE reference database.

    Form fields:
      - reference_file (file, required): .gb or .gbk
      - min_similarity (float, optional, default 50.0): percent identity threshold
    """
    if "reference_file" not in request.files:
        return ResponseData(Status.Failure, message="reference_file is required.").to_dict()

    f = request.files["reference_file"]
    if not f.filename or not f.filename.lower().endswith((".gb", ".gbk")):
        return ResponseData(
            Status.Failure, message="reference_file must be a .gb or .gbk file."
        ).to_dict()

    # Parse threshold; if anything goes wrong, fall back to default.
    try:
        min_similarity = float(request.form.get("min_similarity", DEFAULT_MIN_SIMILARITY))
    except (TypeError, ValueError):
        min_similarity = DEFAULT_MIN_SIMILARITY
    # Clamp to a sensible range
    if min_similarity < 0:
        min_similarity = 0.0
    if min_similarity > 100:
        min_similarity = 100.0

    # Bail early if the DB isn't loaded
    db = app.config.get("TTE_DB")
    if not db or not db.get("clusters"):
        return ResponseData(
            Status.Failure,
            message=(
                "TTE reference database is not available. "
                "Ensure /app/mibig_nrps_db is populated with annotated "
                "GenBank files and restart the server."
            ),
        ).to_dict()

    job_id = str(uuid.uuid4())
    timestamp = int(time.time())

    os.makedirs(TEMP_DIR, exist_ok=True)
    safe_name = secure_filename(f.filename)
    reference_path = os.path.join(TEMP_DIR, f"{job_id}_REF_{safe_name}")
    f.save(reference_path)

    app.config["JOB_RESULTS"][job_id] = {
        "status": str(Status.Pending).lower(),
        "message": "TTE search job pending",
        "job_type": "tte_search",
        "results": [],
        "timestamp": timestamp,
        "progress": {
            "phase": "queued",
            "message": "Queued...",
            "current": 0,
            "total": 0,
        },
    }

    threading.Thread(
        target=run_tte_search,
        args=(job_id, reference_path, min_similarity),
        daemon=True,
    ).start()

    return ResponseData(
        Status.Success,
        payload={
            "jobId": job_id,
            "min_similarity": min_similarity,
            "db_cluster_count": db["stats"]["with_ttes"],
            "db_tte_count": db["stats"]["total_ttes"],
        },
    ).to_dict()