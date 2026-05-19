# -*- coding: utf-8 -*-

"""
Build the precomputed reference TTE database at app startup.

Walks every .gbk file in MIBIG_NRPS_DIR, extracts TTE sequences using the
existing helper from submit_tte, and writes a JSON cache alongside the
GenBank files.  Idempotent: presence of a `.tte_db.complete` marker means
the build has already been done.

Delete the marker file to force a rebuild on next startup (useful when
swapping the contents of MIBIG_NRPS_DIR).
"""

import json
import os
import time
from pathlib import Path
from Bio import SeqIO

from .app import app
from .submit_tte import get_tte_records

####################################################################################################
# Configuration
####################################################################################################

MIBIG_NRPS_DIR = os.environ.get("MIBIG_NRPS_DIR", "/app/mibig_nrps_db")
TTE_DB_FILE = os.path.join(MIBIG_NRPS_DIR, ".tte_db.json")
TTE_DB_MARKER = os.path.join(MIBIG_NRPS_DIR, ".tte_db.complete")


####################################################################################################
# Header metadata extraction
####################################################################################################

def _extract_cluster_metadata(gbk_path: Path) -> dict:
    """
    Pull cluster-level metadata from the GenBank headers and the first
    protocluster feature.  Returns a dict of fields the search route can
    surface in its hit rows.
    """
    meta = {
        "locus": "",
        "definition": "",
        "source_organism": "",
        "product_class": "",
        "accession": "",
    }
    try:
        # Use first record only — MIBiG-style cluster files are single-record.
        rec = next(SeqIO.parse(str(gbk_path), "genbank"))
        meta["locus"] = rec.name or ""
        meta["definition"] = rec.description or ""
        meta["accession"] = rec.id or ""
        meta["source_organism"] = rec.annotations.get("source", "") or ""

        # Collect distinct /product= values from protocluster features.
        # Most MIBiG entries have a single product type; some have several.
        product_classes = []
        for feat in rec.features:
            if feat.type == "protocluster":
                vals = feat.qualifiers.get("product", [])
                for v in vals:
                    if v and v not in product_classes:
                        product_classes.append(v)
        meta["product_class"] = " | ".join(product_classes)
    except Exception as exc:
        app.logger.warning("Could not read metadata from %s: %s", gbk_path.name, exc)
    return meta


####################################################################################################
# Builder
####################################################################################################

def _build_db() -> dict:
    """
    Walk MIBIG_NRPS_DIR, extract TTEs from every .gbk, return the
    in-memory DB structure.
    """
    db = {
        "built_at": int(time.time()),
        "source_dir": MIBIG_NRPS_DIR,
        "clusters": [],   # list of {bgc_id, metadata, ttes: [{cds_locus_tag, tte_seq, ...}, ...]}
        "stats": {
            "total_files": 0,
            "with_ttes": 0,
            "without_ttes": 0,
            "failed": 0,
            "total_ttes": 0,
        },
    }

    gbk_dir = Path(MIBIG_NRPS_DIR)
    if not gbk_dir.is_dir():
        app.logger.error("MIBIG_NRPS_DIR does not exist: %s", MIBIG_NRPS_DIR)
        return db

    gbk_files = sorted(list(gbk_dir.glob("*.gbk")) + list(gbk_dir.glob("*.gb")))
    db["stats"]["total_files"] = len(gbk_files)
    app.logger.info("TTE DB build: found %d GenBank files in %s", len(gbk_files), MIBIG_NRPS_DIR)

    for gbk in gbk_files:
        # Stem like "BGC0000311.1.region001" → bgc_id "BGC0000311.1.region001"
        bgc_id = gbk.stem
        try:
            tte_rows = get_tte_records(gbk)
        except Exception as exc:
            app.logger.warning("TTE extraction failed for %s: %s", gbk.name, exc)
            db["stats"]["failed"] += 1
            continue

        # Strip down each row to just what the search route needs to keep memory
        # footprint small and the JSON cache lean.
        ttes = []
        for r in tte_rows:
            tte_seq = r.get("tte_seq", "")
            if not tte_seq:
                continue
            ttes.append({
                "cds_locus_tag": r.get("CDS_locus_tag", "") or "",
                "region_id": r.get("region_id", ""),
                "region_idx": r.get("region_idx"),
                "tte_seq": tte_seq,
                "tte_len": r.get("tte_len", len(tte_seq)),
                "monomer_pairs": r.get("monomer_pairs", ""),
            })

        if not ttes:
            db["stats"]["without_ttes"] += 1
            continue

        meta = _extract_cluster_metadata(gbk)
        db["clusters"].append({
            "bgc_id": bgc_id,
            "filename": gbk.name,
            "metadata": meta,
            "ttes": ttes,
        })
        db["stats"]["with_ttes"] += 1
        db["stats"]["total_ttes"] += len(ttes)

    app.logger.info(
        "TTE DB build complete: %d/%d clusters yielded TTEs (%d total TTEs); "
        "%d had none; %d failed",
        db["stats"]["with_ttes"], db["stats"]["total_files"],
        db["stats"]["total_ttes"],
        db["stats"]["without_ttes"], db["stats"]["failed"],
    )
    return db


def build_tte_db_if_needed() -> None:
    """
    Called from api.py at startup.  Loads cached DB if marker is present;
    otherwise rebuilds.  Result is stashed in app.config["TTE_DB"] for the
    search route to consume.
    """
    if not os.path.isdir(MIBIG_NRPS_DIR):
        app.logger.warning(
            "TTE reference DB directory does not exist: %s — "
            "submit_tte_search route will be unavailable.", MIBIG_NRPS_DIR
        )
        app.config["TTE_DB"] = None
        return

    if os.path.isfile(TTE_DB_MARKER) and os.path.isfile(TTE_DB_FILE):
        try:
            with open(TTE_DB_FILE, "r") as f:
                db = json.load(f)
            app.logger.info(
                "Loaded cached TTE DB: %d clusters, %d TTEs (built at %s)",
                db["stats"]["with_ttes"], db["stats"]["total_ttes"],
                time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(db.get("built_at", 0))),
            )
            app.config["TTE_DB"] = db
            return
        except Exception as exc:
            app.logger.warning("Cached TTE DB unreadable (%s) — rebuilding.", exc)

    app.logger.info("Building TTE reference DB from %s ...", MIBIG_NRPS_DIR)
    db = _build_db()

    # Persist cache + marker.  Failure to write is non-fatal; the DB just
    # gets rebuilt next restart.
    try:
        with open(TTE_DB_FILE, "w") as f:
            json.dump(db, f)
        Path(TTE_DB_MARKER).touch()
    except Exception as exc:
        app.logger.warning("Could not persist TTE DB cache: %s", exc)

    app.config["TTE_DB"] = db