# -*- coding: utf-8 -*-

"""
Build a queryable SQLite database from every .gbk file in MIBIG_NRPS_DIR.

This is what powers the "Query database" page (query_database.js -> /api/sql)
once you point SQLITE_PATH at the .db file this script produces. It's
separate from build_tte_db.py's JSON cache (which only feeds TTE Reference
Search) — this one is a real relational schema meant for ad-hoc SQL.

Usage (run manually, or wire into your deploy step):

    python -m routes.build_mibig_sql_db

Env vars:
    MIBIG_NRPS_DIR   - folder of .gbk/.gb files (default: /app/mibig_nrps_db)
    MIBIG_SQL_DB     - output .db path (default: <repo>/mibig_nrps.db)

Idempotent-ish: always rebuilds from scratch (drops + recreates tables) so
reruns after adding/removing .gbk files just work. For thousands of files
this takes a while; for a few hundred it's seconds.
"""

import os
import re
import sqlite3
import time
from pathlib import Path
from Bio import SeqIO

MIBIG_NRPS_DIR = os.environ.get("MIBIG_NRPS_DIR", "/app/mibig_nrps_db")
MIBIG_SQL_DB = os.environ.get(
    "MIBIG_SQL_DB",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mibig_nrps.db"),
)
# Marker lives alongside the .gbk files, same convention as build_tte_db.py's
# TTE_DB_MARKER. Delete it to force a rebuild after swapping the corpus.
MIBIG_SQL_DB_MARKER = os.path.join(MIBIG_NRPS_DIR, ".mibig_sql_db.complete")

SCHEMA = """
DROP TABLE IF EXISTS domain;
DROP TABLE IF EXISTS tte;
DROP TABLE IF EXISTS cds;
DROP TABLE IF EXISTS cluster;

CREATE TABLE cluster (
    id               INTEGER PRIMARY KEY,
    bgc_id           TEXT NOT NULL,      -- filename stem, e.g. BGC0000311.1.region001
    filename         TEXT NOT NULL,
    locus            TEXT,
    definition       TEXT,
    accession        TEXT,
    organism         TEXT,
    source_organism  TEXT,
    strain           TEXT,
    product_class    TEXT,
    comment          TEXT
);

CREATE TABLE cds (
    id          INTEGER PRIMARY KEY,
    cluster_id  INTEGER NOT NULL REFERENCES cluster(id),
    locus_tag   TEXT,
    product     TEXT,
    start       INTEGER,
    end         INTEGER,
    strand      INTEGER
);

CREATE TABLE domain (
    id                  INTEGER PRIMARY KEY,
    cds_id              INTEGER NOT NULL REFERENCES cds(id),
    cluster_id          INTEGER NOT NULL REFERENCES cluster(id),
    domain_type         TEXT,     -- PFAM_domain / aSDomain
    aSDomain            TEXT,     -- e.g. AMP-binding, Thioesterase, Condensation
    start               INTEGER,
    end                 INTEGER,
    specificity          TEXT,     -- best-available substrate call (antiSMASH or PARAS)
    specificity_score    REAL
);

CREATE TABLE tte (
    id             INTEGER PRIMARY KEY,
    cluster_id     INTEGER NOT NULL REFERENCES cluster(id),
    cds_id         INTEGER REFERENCES cds(id),
    cds_locus_tag  TEXT,
    region_id      TEXT,
    region_idx     INTEGER,
    tte_seq        TEXT,
    tte_len        INTEGER,
    monomer_pairs  TEXT
);

CREATE INDEX idx_cds_cluster ON cds(cluster_id);
CREATE INDEX idx_domain_cds ON domain(cds_id);
CREATE INDEX idx_domain_cluster ON domain(cluster_id);
CREATE INDEX idx_domain_asdomain ON domain(aSDomain);
CREATE INDEX idx_tte_cluster ON tte(cluster_id);
CREATE INDEX idx_cluster_organism ON cluster(organism);
"""


def qget(feat, key, default=""):
    vals = feat.qualifiers.get(key, [])
    return vals[0] if vals else default


def fpos(feat):
    return int(feat.location.start), int(feat.location.end)


def overlaps(a, b, c, d):
    return not (b <= c or d <= a)


def is_protocore(feat):
    return feat.type == "protocluster"


def best_specificity(feat):
    """Prefer an existing antiSMASH call; fall back to the top-ranked PARAS prediction."""
    for key in ("specificity", "substrate_specificity", "consensus", "prediction"):
        v = qget(feat, key)
        if v:
            return v, None
    # PARAS writes specificity_prediction_PARAS_1, _2, ... — take rank 1
    v = qget(feat, "specificity_prediction_PARAS_1")
    if v:
        score = qget(feat, "specificity_score_PARAS_1")
        try:
            return v, float(score) if score else None
        except ValueError:
            return v, None
    return "", None


def extract_cluster_metadata(rec):
    meta = {
        "locus": rec.name or "",
        "definition": rec.description or "",
        "accession": rec.id or "",
        "organism": rec.annotations.get("organism", "") or "",
        "source_organism": rec.annotations.get("source", "") or "",
        "strain": "",
        "product_class": "",
        "comment": "",
    }
    strain_match = re.search(
        r"strain\s+([A-Za-z0-9._\-]+)", meta["organism"] or meta["source_organism"]
    )
    if strain_match:
        meta["strain"] = strain_match.group(1)
    comment = rec.annotations.get("comment", "")
    if comment:
        meta["comment"] = comment[:500]
    product_classes = []
    for feat in rec.features:
        if feat.type == "protocluster":
            for v in feat.qualifiers.get("product", []):
                if v and v not in product_classes:
                    product_classes.append(v)
    meta["product_class"] = " | ".join(product_classes)
    return meta


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


def build():
    gbk_dir = Path(MIBIG_NRPS_DIR)
    if not gbk_dir.is_dir():
        raise SystemExit(f"MIBIG_NRPS_DIR does not exist: {MIBIG_NRPS_DIR}")

    gbk_files = sorted(list(gbk_dir.glob("*.gbk")) + list(gbk_dir.glob("*.gb")))
    print(f"Found {len(gbk_files)} GenBank files in {MIBIG_NRPS_DIR}")

    conn = sqlite3.connect(MIBIG_SQL_DB)
    conn.executescript(SCHEMA)
    cur = conn.cursor()

    n_clusters = n_cds = n_domains = n_ttes = n_failed = 0

    for gbk in gbk_files:
        bgc_id = gbk.stem
        try:
            rec = next(SeqIO.parse(str(gbk), "genbank"))
        except Exception as exc:
            print(f"  [skip] {gbk.name}: {exc}")
            n_failed += 1
            continue

        meta = extract_cluster_metadata(rec)
        cur.execute(
            """INSERT INTO cluster
               (bgc_id, filename, locus, definition, accession, organism,
                source_organism, strain, product_class, comment)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (bgc_id, gbk.name, meta["locus"], meta["definition"], meta["accession"],
             meta["organism"], meta["source_organism"], meta["strain"],
             meta["product_class"], meta["comment"]),
        )
        cluster_id = cur.lastrowid
        n_clusters += 1

        proto_regions = [f for f in rec.features if is_protocore(f)]
        cds_feats = [f for f in rec.features if f.type == "CDS"]

        for cds in cds_feats:
            cs, ce = fpos(cds)
            strand = cds.location.strand
            cur.execute(
                """INSERT INTO cds (cluster_id, locus_tag, product, start, end, strand)
                   VALUES (?,?,?,?,?,?)""",
                (cluster_id, qget(cds, "locus_tag"), qget(cds, "product"), cs, ce, strand),
            )
            cds_id = cur.lastrowid
            n_cds += 1

            feats_in_cds = [
                f for f in rec.features
                if f.type in ("PFAM_domain", "aSDomain") and cs <= fpos(f)[0] and fpos(f)[1] <= ce
            ]
            for dom in feats_in_cds:
                ds, de = fpos(dom)
                spec, spec_score = best_specificity(dom)
                cur.execute(
                    """INSERT INTO domain
                       (cds_id, cluster_id, domain_type, aSDomain, start, end,
                        specificity, specificity_score)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (cds_id, cluster_id, dom.type, qget(dom, "aSDomain"), ds, de,
                     spec, spec_score),
                )
                n_domains += 1

        # TTE extraction, mirroring build_tte_db.py's logic
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

            region_cds = [f for f in cds_feats if overlaps(rs, re_, *fpos(f))]
            feats_in_region = [f for f in rec.features if overlaps(rs, re_, *fpos(f))]

            for cds in region_cds:
                cs, ce = fpos(cds)
                feats_in_cds = [f for f in feats_in_region if cs <= fpos(f)[0] and fpos(f)[1] <= ce]
                has_te = any(
                    f.type == "PFAM_domain" and qget(f, "aSDomain") == "Thioesterase"
                    for f in feats_in_cds
                )
                if not has_te:
                    continue
                tte_seq = extract_tte_from_cds(cds, feats_in_cds)
                if not tte_seq:
                    continue

                # look up the cds row id we already inserted (match by locus_tag+start)
                locus_tag = qget(cds, "locus_tag")
                cur.execute(
                    "SELECT id FROM cds WHERE cluster_id=? AND locus_tag=? AND start=? LIMIT 1",
                    (cluster_id, locus_tag, cs),
                )
                row = cur.fetchone()
                cds_id = row[0] if row else None

                cur.execute(
                    """INSERT INTO tte
                       (cluster_id, cds_id, cds_locus_tag, region_id, region_idx,
                        tte_seq, tte_len, monomer_pairs)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (cluster_id, cds_id, locus_tag, region_id, r_idx,
                     tte_seq, len(tte_seq), monomers_str),
                )
                n_ttes += 1

    conn.commit()
    conn.close()

    print(f"Done: {n_clusters} clusters, {n_cds} CDS, {n_domains} domains, "
          f"{n_ttes} TTEs, {n_failed} files failed to parse.")
    print(f"Wrote {MIBIG_SQL_DB}")


####################################################################################################
# Startup hook (mirrors build_tte_db_if_needed in build_tte_db.py)
####################################################################################################

def build_mibig_sql_db_if_needed(set_sqlite_path: bool = True) -> None:
    """
    Call this once at app startup (see api.py). Builds mibig_nrps.db from
    MIBIG_NRPS_DIR the first time; on subsequent restarts it's skipped as
    long as the marker file + .db both still exist.

    Delete MIBIG_SQL_DB_MARKER (or the .db file itself) to force a rebuild
    after adding/removing/re-annotating .gbk files.

    If set_sqlite_path is True and the SQLITE_PATH env var isn't already
    set explicitly, this points the Query Database page (/api/sql) at the
    freshly-built mibig_nrps.db automatically. Set set_sqlite_path=False,
    or export SQLITE_PATH yourself, if you want /api/sql to keep querying
    a different database (e.g. parasect.db).
    """
    if not os.path.isdir(MIBIG_NRPS_DIR):
        print(f"[build_mibig_sql_db] MIBIG_NRPS_DIR does not exist: {MIBIG_NRPS_DIR} — skipping.")
        return

    already_built = os.path.isfile(MIBIG_SQL_DB_MARKER) and os.path.isfile(MIBIG_SQL_DB)
    if already_built:
        print(f"[build_mibig_sql_db] Using cached {MIBIG_SQL_DB} "
              f"(delete {MIBIG_SQL_DB_MARKER} to force a rebuild).")
    else:
        print(f"[build_mibig_sql_db] Building {MIBIG_SQL_DB} from {MIBIG_NRPS_DIR} ...")
        try:
            build()
            Path(MIBIG_SQL_DB_MARKER).touch()
        except Exception as exc:
            print(f"[build_mibig_sql_db] Build failed: {exc}")
            return

    if set_sqlite_path and not os.environ.get("SQLITE_PATH"):
        os.environ["SQLITE_PATH"] = MIBIG_SQL_DB
        print(f"[build_mibig_sql_db] SQLITE_PATH not set — defaulting /api/sql to {MIBIG_SQL_DB}")


if __name__ == "__main__":
    t0 = time.time()
    build()
    print(f"Took {time.time() - t0:.1f}s")