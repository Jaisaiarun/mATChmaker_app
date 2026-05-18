import re
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqFeature import SeqFeature, FeatureLocation
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── Constants ─────────────────────────────────────────────────────────────────

DOMAINS_OF_INTEREST = {"condensation", "epimerization", "amp-binding", "pcp"}
# PATTERN_XUT = r"FF..GG.S"
# PATTERN_XU = r"[EDQ][RKQTS]..[VILM][LIVM]..[AWFHY][NDHST]"

PATTERN_XUT_1 = r"FF..GG.S"
PATTERN_XUT_2 = r"[FIY][FIMVY]..G[GAI].S"


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class ASDomain:
    name: str
    domain_type: str
    start: int
    end: int
    strand: int
    locus_tag: str
    special: list[str] = field(default_factory=list)
    raw_qualifiers: dict = field(default_factory=dict)


@dataclass
class CDS:
    locus_tag: str
    start: int
    end: int
    strand: int
    translation: Optional[str] = None
    domains: list[ASDomain] = field(default_factory=list)


# ── Helpers ───────────────────────────────────────────────────────────────────
def _bgc_bounds(cds_map: dict[str, CDS]) -> tuple[int, int]:
    """Return genomic span covering all CDS in cds_map."""
    if not cds_map:
        raise ValueError("cds_map is empty")
    starts = [cds.start for cds in cds_map.values()]
    ends = [cds.end for cds in cds_map.values()]
    return min(starts), max(ends)


def _is_protein_record(record) -> bool:
    """
    Infer whether a GenBank record contains a protein or nucleotide sequence.

    Detection order:
      1. molecule_type annotation  — fastest, used when reliably set
      2. Sequence character inspection — fallback for manually edited files
         where molecule_type is missing or wrong (e.g. Geneious exports)

    Returns True if protein (AA), False if nucleotide (DNA/RNA).
    """
    seq = str(record.seq)
    mol_type = record.annotations.get("molecule_type", "").lower()

    # ── Rule 1: trust explicit molecule_type if present ──────────────
    if "dna" in mol_type or "rna" in mol_type:
        return False  # explicitly nucleotide

    if "protein" in mol_type or "aa" in mol_type:
        return True  # explicitly protein

    # ── Rule 2: inspect sequence characters ──────────────────────────
    # DNA/RNA only uses A C G T N (+ U for RNA)
    # Protein uses the full 20 aa alphabet — any letter outside ACGTN
    # is a strong indicator of a protein sequence
    seq_sample = seq[:200].upper()  # sample first 200 chars — sufficient signal
    dna_chars = set("ACGTN")
    return bool(set(seq_sample) - dna_chars)


# def _extract_amp_binding_specificity(q: dict) -> list[str]:
#     temp = q.get("specificity", [])
#     return [
#         x.split("substrate consensus: ", 1)[1].strip()
#         if "substrate consensus: " in x else x.strip()
#         for x in temp
#     ]

def _extract_amp_binding_specificity(q: dict) -> list[str]:
    temp = q.get("specificity", [])

    special = []

    for item in temp:
        if ":" in item:
            special.append(item.split(":", 1)[1].strip())
        else:
            special.append(item.strip())

    return special


def _is_thioesterase_pfam(q: dict) -> bool:
    """
    Robust check for TE-like PFAM annotations.
    Looks through common qualifier fields.
    """
    searchable_values = []

    for key in ["description", "label", "note", "db_xref", "domain_id", "protein_domain_id"]:
        vals = q.get(key, [])
        if isinstance(vals, str):
            vals = [vals]
        searchable_values.extend(vals)

    joined = " | ".join(str(v) for v in searchable_values).lower()
    return "thioesterase" in joined


def print_cds_map(cds_map: dict[str, CDS]) -> None:
    print(f"\n{'═' * 70}")
    print(f"  CDS MAP  —  {len(cds_map)} entries")
    print(f"{'═' * 70}")

    for lt, cds in cds_map.items():
        print(f"\n  CDS  {lt}  [{cds.start}..{cds.end}]  strand={cds.strand}")

        if not cds.domains:
            print("       └── no domains")
            continue

        for i, d in enumerate(cds.domains):
            connector = "└──" if i == len(cds.domains) - 1 else "├──"
            print(f"       {connector} [{d.domain_type:15s}]  [{d.start}..{d.end}]")
            if d.special:
                print(f"            {'':15s}   ↳ {', '.join(d.special)}")

    print(f"\n{'═' * 70}\n")


def infer_is_protein(record) -> bool:
    """
    Infer whether the GenBank record sequence is protein or nucleotide.

    Rules:
    1. Use molecule_type annotation if available.
    2. Otherwise inspect sequence characters.
    """
    seq = str(record.seq).upper()
    mol_type = record.annotations.get("molecule_type", "").lower()

    if "protein" in mol_type or "aa" in mol_type:
        return True

    if "dna" in mol_type or "rna" in mol_type:
        return False

    dna_chars = set("ACGTUN")
    seq_sample = seq[:200]

    # if there are letters outside nucleotide alphabet, treat as protein
    return bool(set(seq_sample) - dna_chars)


def _split_cds_map(
        cds_map: dict[str, CDS],
        is_protein: bool,
        gap_threshold: int = 200,
) -> list[dict[str, CDS]]:
    """
    Split a cds_map into sub-groups based on two rules:
      1. A CDS containing a Thioesterase domain → next CDS starts a new group
      2. Gap between consecutive CDS >= gap_threshold aa (200 aa or 600 nt)

    Returns a list of cds_map dicts, one per group.
    """
    if not cds_map:
        return []

    # sort CDS by start position
    ordered = sorted(cds_map.values(), key=lambda c: c.start)

    # convert aa threshold to coordinate space
    coord_threshold = gap_threshold if is_protein else gap_threshold * 3

    groups = []
    current = {}

    for i, cds in enumerate(ordered):
        current[cds.locus_tag] = cds

        split = False

        # rule 1: this CDS has a Thioesterase → split after it
        if any(d.domain_type == "Thioesterase" for d in cds.domains):
            split = True

        # rule 2: gap to next CDS >= threshold
        if not split and i + 1 < len(ordered):
            gap = ordered[i + 1].start - cds.end
            if gap >= coord_threshold:
                split = True

        if split:
            groups.append(current)
            current = {}

    if current:  # don't forget the last group
        groups.append(current)

    return groups


# ── Parser ────────────────────────────────────────────────────────────────────
def get_records(gbk_path: str) -> list[tuple[str, dict[str, CDS], str, bool]]:
    """
    Parse GenBank and return one tuple per record:
        (record_name, cds_map, seq, is_protein)

    cds_map contains only CDS that have relevant domains.
    """
    results = []

    for record in SeqIO.parse(gbk_path, "genbank"):
        seq = str(record.seq)
        is_protein = _is_protein_record(record)

        cds_map: dict[str, CDS] = {}
        asdom_buffer: list[tuple[str, ASDomain]] = []

        for feature in record.features:
            q = feature.qualifiers

            if feature.type == "CDS":
                lt = q.get("locus_tag", ["unknown"])[0]
                cds_map[lt] = CDS(
                    locus_tag=lt,
                    start=int(feature.location.start),
                    end=int(feature.location.end),
                    strand=feature.location.strand,
                    translation=q.get("translation", [None])[0],
                )

            elif feature.type == "aSDomain":
                lt = q.get("locus_tag", [None])[0]
                domain_type = q.get("aSDomain", [""])[0]

                if domain_type.lower() not in DOMAINS_OF_INTEREST:
                    continue

                special = []
                if domain_type == "AMP-binding":
                    special = _extract_amp_binding_specificity(q)
                elif domain_type == "Condensation":
                    special = q.get("domain_subtypes", [])
                    if not special:
                        special = q.get("domain_subtype", [])
                elif domain_type == "Epimerization":
                    special = q.get("domain_subtypes", [])
                    if not special:
                        special = q.get("domain_subtype", [])
                elif domain_type == "PCP":
                    special = []

                asdom_buffer.append((
                    lt,
                    ASDomain(
                        name=domain_type,
                        domain_type=domain_type,
                        start=int(feature.location.start),
                        end=int(feature.location.end),
                        strand=feature.location.strand,
                        locus_tag=lt or "unknown",
                        special=special,
                        raw_qualifiers=dict(q),
                    )
                ))

            elif feature.type == "PFAM_domain":
                lt = q.get("locus_tag", [None])[0]

                if not _is_thioesterase_pfam(q):
                    continue

                accession = q.get("db_xref", [""])[0]
                accession = accession.split(".")[0] if accession else "PFAM_TE"

                asdom_buffer.append((
                    lt,
                    ASDomain(
                        name=accession,
                        domain_type="Thioesterase",
                        start=int(feature.location.start),
                        end=int(feature.location.end),
                        strand=feature.location.strand,
                        locus_tag=lt or "unknown",
                        special=[],
                        raw_qualifiers=dict(q),
                    )
                ))

        for lt, domain in asdom_buffer:
            if lt and lt in cds_map:
                cds_map[lt].domains.append(domain)

        # keep only CDS with domains
        cds_map = {
            lt: cds for lt, cds in cds_map.items()
            if cds.domains
               and not all(d.domain_type == "Thioesterase" for d in cds.domains)  # ← filter here
        }

        groups = _split_cds_map(cds_map, is_protein, gap_threshold=200)

        for group_idx, group in enumerate(groups):
            # name sub-records so write functions can match them
            group_name = record.name if len(groups) == 1 \
                else f"{record.name}_part{group_idx + 1}"
            results.append((group_name, group, seq, is_protein, record.name))
    return results


# ── Naming ────────────────────────────────────────────────────────────────────

def name_xut_region(region_start: int, region_end: int, cds_map: dict[str, CDS]) -> str:
    c_parts = []
    a_parts = []

    mapping = {
        "Condensation_Starter": "CS",
        "Condensation_LCL": "LCL",
        "Condensation_DCL": "DCL",
        "Epimerization": "E",
        "Thioesterase": "TE",
        "PCP": "T",
    }

    for cds in cds_map.values():
        for domain in cds.domains:
            if domain.start >= region_start and domain.end <= region_end:
                if domain.domain_type == "Condensation" and domain.special:
                    c_parts.extend(domain.special)
                elif domain.domain_type == "AMP-binding" and domain.special:
                    a_parts.extend(domain.special)
                elif domain.domain_type == "Epimerization":
                    c_parts.append(domain.domain_type)
                elif domain.domain_type == "PCP":
                    c_parts.append(domain.domain_type)
                elif domain.domain_type == "Thioesterase":
                    a_parts.append(domain.domain_type)

    def safe_map(value: str) -> str:
        return mapping.get(value, value)

    if "Thioesterase" in a_parts:
        filtered_c_parts = c_parts
    else:
        filtered_c_parts = [i for i in c_parts if i != "PCP"]

    parts = []
    if filtered_c_parts:
        parts.append(":".join(safe_map(i) for i in filtered_c_parts))
    if a_parts:
        parts.append(":".join(safe_map(i) for i in a_parts))

    return " – ".join(parts) if parts else "XUT"


def name_xu_region(region_start: int, region_end: int, cds_map: dict[str, CDS]) -> str:
    c_parts = []
    a_parts = []

    mapping = {
        "Condensation_Starter": "CS",
        "Condensation_LCL": "LCL",
        "Condensation_DCL": "DCL",
        "Epimerization": "E",
        "Thioesterase": "TE",
        "PCP": "T",
    }

    for cds in cds_map.values():
        for domain in cds.domains:
            if domain.start >= region_start and domain.end <= region_end:
                if domain.domain_type == "Condensation" and domain.special:
                    c_parts.extend(domain.special)
                elif domain.domain_type == "AMP-binding" and domain.special:
                    a_parts.extend(domain.special)
                elif domain.domain_type == "Epimerization":
                    c_parts.append(domain.domain_type)
                elif domain.domain_type == "PCP":
                    c_parts.append(domain.domain_type)
                elif domain.domain_type == "Thioesterase":
                    a_parts.append(domain.domain_type)

    def safe_map(value: str) -> str:
        return mapping.get(value, value)

    if "Thioesterase" in a_parts:
        filtered_c_parts = c_parts
    else:
        filtered_c_parts = [i for i in c_parts if i != "PCP"]

    parts = []
    if a_parts:
        parts.append(":".join(safe_map(i) for i in a_parts))
    if filtered_c_parts:
        parts.append(":".join(safe_map(i) for i in filtered_c_parts))

    return " – ".join(parts) if parts else "XU"


# ── Buffer builders ───────────────────────────────────────────────────────────
# def build_xut_buffer(cds_map: dict[str, CDS], seq: str, is_protein: bool) -> list[dict]:
#     bgc_start, bgc_end = _bgc_bounds(cds_map)
#
#     sites = []
#     for lt, cds in cds_map.items():
#         if not cds.translation:
#             continue
#
#         for m in re.finditer(PATTERN_XUT, cds.translation):
#             aa_cut = max(0, m.start() - 30)
#             site = cds.start + aa_cut if is_protein else cds.start + aa_cut * 3
#             site = max(bgc_start, min(site, bgc_end))
#             sites.append(site)
#             # print(f"XUT in {lt}: aa={m.start()} -> cut at {'aa' if is_protein else 'nt'} {site}")
#
#     boundaries = sorted(set([bgc_start] + sites + [bgc_end]))
#
#     xut_buffer = []
#     for i, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:])):
#         if start >= end:
#             continue
#
#         if is_protein:
#             sequence = seq[start:end]
#         else:
#             nt_chunk = seq[start:end]
#             usable_len = (len(nt_chunk) // 3) * 3
#             sequence = str(Seq(nt_chunk[:usable_len]).translate()) if usable_len > 0 else ""
#
#         xut_buffer.append({
#             "start": start,
#             "end": end,
#             "label": name_xut_region(start, end, cds_map),
#             "module_position": i + 1,
#             "sequence": sequence,
#         })
#
#     return xut_buffer
#
#
# def build_xu_buffer(cds_map: dict[str, CDS], seq: str, is_protein: bool) -> list[dict]:
#     bgc_start, bgc_end = _bgc_bounds(cds_map)
#
#     sites = []
#     for lt, cds in cds_map.items():
#         if not cds.translation:
#             continue
#
#         for m in re.finditer(PATTERN_XU, cds.translation):
#             aa_cut = m.end() - 1
#             site = cds.start + aa_cut if is_protein else cds.start + aa_cut * 3
#             site = max(bgc_start, min(site, bgc_end))
#             sites.append(site)
#             # print(f"XU in {lt}: aa={m.start()} -> cut at {'aa' if is_protein else 'nt'} {site}")
#
#     boundaries = sorted(set([bgc_start] + sites + [bgc_end]))
#
#     xu_buffer = []
#     for i, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:]), start=1):
#         if start >= end:
#             continue
#
#         if is_protein:
#             sequence = seq[start:end]
#         else:
#             nt_frag = seq[start:end]
#             usable = (len(nt_frag) // 3) * 3
#             sequence = str(Seq(nt_frag[:usable]).translate()) if usable > 0 else ""
#
#         xu_buffer.append({
#             "start": start,
#             "end": end,
#             "label": name_xu_region(start, end, cds_map),
#             "module_position": i,
#             "sequence": sequence,
#         })
#
#     return xu_buffer

def build_xut_buffer(cds_map: dict[str, CDS], seq: str, is_protein: bool) -> list[dict]:
    bgc_start, bgc_end = _bgc_bounds(cds_map)

    sites = []
    for lt, cds in cds_map.items():
        if not cds.translation:
            continue
        for pattern in (PATTERN_XUT_1, PATTERN_XUT_2):  # ← search both
            for m in re.finditer(pattern, cds.translation):
                aa_cut = max(0, m.start() - 30)
                site = cds.start + aa_cut if is_protein else cds.start + aa_cut * 3
                site = max(bgc_start, min(site, bgc_end))
                sites.append(site)

    boundaries = sorted(set([bgc_start] + sites + [bgc_end]))

    xut_buffer = []
    for i, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:])):
        if start >= end:
            continue
        if is_protein:
            sequence = seq[start:end]
        else:
            nt_chunk = seq[start:end]
            usable_len = (len(nt_chunk) // 3) * 3
            sequence = str(Seq(nt_chunk[:usable_len]).translate()) if usable_len > 0 else ""
        xut_buffer.append({
            "start": start,
            "end": end,
            "label": name_xut_region(start, end, cds_map),
            "module_position": i + 1,
            "sequence": sequence,
        })
    return xut_buffer


def build_xu_buffer(cds_map: dict[str, CDS], seq: str, is_protein: bool) -> list[dict]:
    bgc_start, bgc_end = _bgc_bounds(cds_map)

    sites = []
    for cds in cds_map.values():
        for domain in cds.domains:
            if domain.domain_type != "AMP-binding":
                continue
            # 48 bp = 16 aa upstream of AMP-binding domain start
            if is_protein:
                site = domain.start - 16
            else:
                site = domain.start - 48  # 48 nt upstream
            site = max(bgc_start, min(site, bgc_end))
            sites.append(site)

    boundaries = sorted(set([bgc_start] + sites + [bgc_end]))

    xu_buffer = []
    for i, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:]), start=1):
        if start >= end:
            continue
        if is_protein:
            sequence = seq[start:end]
        else:
            nt_frag = seq[start:end]
            usable = (len(nt_frag) // 3) * 3
            sequence = str(Seq(nt_frag[:usable]).translate()) if usable > 0 else ""
        xu_buffer.append({
            "start": start,
            "end": end,
            "label": name_xu_region(start, end, cds_map),
            "module_position": i,
            "sequence": sequence,
        })
    return xu_buffer


def format_feature(entry: dict, feature_type: str, created_by: str) -> str:
    """Format a single feature as GenBank text."""
    start = entry["start"] + 1  # GenBank is 1-based
    end = entry["end"]
    lines = [f'     {feature_type:<16}{start}..{end}']
    for key, val in [
        ("label", entry["label"]),
        ("module_position", str(entry["module_position"])),
        ("created_by", created_by),
        ("modified_by", created_by),
        ("translation", entry["sequence"]),
    ]:
        lines.append(f'                     /{key}="{val}"')
    return "\n".join(lines)


def write_annotations(
        gbk_path: str,
        record_buffers: list[tuple[str, list[dict], list[dict], str]],  # ← (group, xut, xu, original)
        created_by: str = "Arun",
) -> str:
    from collections import defaultdict
    xut_grouped: dict[str, list[dict]] = defaultdict(list)
    xu_grouped: dict[str, list[dict]] = defaultdict(list)

    for group_name, xut_buffer, xu_buffer, original_name in record_buffers:
        xut_grouped[original_name].extend(xut_buffer)  # ← merge by original
        xu_grouped[original_name].extend(xu_buffer)

    updated_records = []
    for record in SeqIO.parse(gbk_path, "genbank"):
        if "molecule_type" not in record.annotations:
            record.annotations["molecule_type"] = "protein" if infer_is_protein(record) else "DNA"

        if record.name in xut_grouped:
            for item in xut_grouped[record.name]:
                record.features.append(SeqFeature(
                    location=FeatureLocation(item["start"], item["end"], strand=1),
                    type="XUT_mATChmaker",
                    qualifiers={
                        "label": [item["label"]],
                        "module_position": [str(item["module_position"])],
                        "created_by": [created_by],
                        "modified_by": [created_by],
                        "translation": [item["sequence"]],
                    },
                ))
            for item in xu_grouped[record.name]:
                record.features.append(SeqFeature(
                    location=FeatureLocation(item["start"], item["end"], strand=1),
                    type="XU_mATChmaker",
                    qualifiers={
                        "label": [item["label"]],
                        "module_position": [str(item["module_position"])],
                        "created_by": [created_by],
                        "modified_by": [created_by],
                        "translation": [item["sequence"]],
                    },
                ))
            record.features.sort(key=lambda f: int(f.location.start))

        updated_records.append(record)

    out_path = gbk_path.replace(".gb", "_annotated.gb")
    with open(out_path, "w") as out:
        SeqIO.write(updated_records, out, "genbank")

    print(f"Written {len(updated_records)} records -> {out_path}")
    return out_path


def _write_feature_annotations(
        gbk_path: str,
        record_buffers: list[tuple[str, list[dict]]],
        feature_type: str,
        output_suffix: str,
        created_by: str = "Arun",
) -> str:
    """
    Generic writer used by write_xut_annotations() and write_xu_annotations().
    """
    lookup = {record_name: buffer for record_name, buffer in record_buffers}
    updated_records = []

    for record in SeqIO.parse(gbk_path, "genbank"):
        if "molecule_type" not in record.annotations:
            record.annotations["molecule_type"] = "protein" if infer_is_protein(record) else "DNA"

        if record.name in lookup:
            feature_buffer = lookup[record.name]

            for item in feature_buffer:
                record.features.append(
                    SeqFeature(
                        location=FeatureLocation(item["start"], item["end"], strand=1),
                        type=feature_type,
                        qualifiers={
                            "label": [item["label"]],
                            "module_position": [str(item["module_position"])],
                            "created_by": [created_by],
                            "modified_by": [created_by],
                            "translation": [item["sequence"]],
                        },
                    )
                )

            record.features.sort(key=lambda f: int(f.location.start))

        updated_records.append(record)

    out_path = gbk_path.replace(".gb", output_suffix)
    with open(out_path, "w") as out:
        SeqIO.write(updated_records, out, "genbank")

    print(f"Written {len(updated_records)} records -> {out_path}")
    return out_path


def write_xut_annotations(
        gbk_path: str,
        xut_record_buffers: list[tuple[str, list[dict]]],
        created_by: str = "Arun",
) -> str:
    """
    Annotate only XUT features.

    Input format:
        [
            (record_name, xut_buffer),
            ...
        ]
    """
    return _write_feature_annotations(
        gbk_path=gbk_path,
        record_buffers=xut_record_buffers,
        feature_type="XUT_mATChmaker",
        output_suffix="_XUT_annotated.gb",
        created_by=created_by,
    )


def write_xu_annotations(
        gbk_path: str,
        xu_record_buffers: list[tuple[str, list[dict]]],
        created_by: str = "Arun",
) -> str:
    """
    Annotate only XU features.

    Input format:
        [
            (record_name, xu_buffer),
            ...
        ]
    """
    return _write_feature_annotations(
        gbk_path=gbk_path,
        record_buffers=xu_record_buffers,
        feature_type="XU_mATChmaker",
        output_suffix="_XU_annotated.gb",
        created_by=created_by,
    )


import os
from Bio import SeqIO
from Bio.SeqFeature import SeqFeature, FeatureLocation


def write_annotations(
        gbk_path: str,
        record_buffers: list[tuple[str, list[dict], list[dict]]],
        outdir: str = "mm_out",
        created_by: str = "Arun",
) -> str:
    """
    Annotate both XUT and XU features.

    Input format:
        [
            (record_name, xut_buffer, xu_buffer),
            ...
        ]

    Writes the updated GenBank file into `outdir`.
    """
    os.makedirs(outdir, exist_ok=True)

    lookup = {name: (xut_buf, xu_buf) for name, xut_buf, xu_buf, *_ in record_buffers}
    updated_records = []

    for record in SeqIO.parse(gbk_path, "genbank"):
        if "molecule_type" not in record.annotations:
            record.annotations["molecule_type"] = "protein" if infer_is_protein(record) else "DNA"

        if record.name in lookup:
            xut_buffer, xu_buffer = lookup[record.name]

            for item in xut_buffer:
                record.features.append(
                    SeqFeature(
                        location=FeatureLocation(item["start"], item["end"], strand=1),
                        type="XUT_mATChmaker",
                        qualifiers={
                            "label": [item["label"]],
                            "module_position": [str(item["module_position"])],
                            "created_by": [created_by],
                            "modified_by": [created_by],
                            "translation": [item["sequence"]],
                        },
                    )
                )

            for item in xu_buffer:
                record.features.append(
                    SeqFeature(
                        location=FeatureLocation(item["start"], item["end"], strand=1),
                        type="XU_mATChmaker",
                        qualifiers={
                            "label": [item["label"]],
                            "module_position": [str(item["module_position"])],
                            "created_by": [created_by],
                            "modified_by": [created_by],
                            "translation": [item["sequence"]],
                        },
                    )
                )

            record.features.sort(key=lambda f: int(f.location.start))

        updated_records.append(record)

    base_name = os.path.basename(gbk_path)
    stem, ext = os.path.splitext(base_name)
    out_path = os.path.join(outdir, f"{stem}_annotated{ext}")

    with open(out_path, "w") as out:
        SeqIO.write(updated_records, out, "genbank")

    print(f"Written {len(updated_records)} records -> {out_path}")
    return out_path


# ── Prepare buffers ───────────────────────────────────────────────────────────

def prepare_record_buffers(gbk_path: str):
    records = get_records(gbk_path)
    combined_buffers = []
    xut_only_buffers = []
    xu_only_buffers = []

    for record_name, cds_map, seq, is_protein, original_name in records:  # ← unpack 5
        xut_buffer = build_xut_buffer(cds_map, seq, is_protein)
        xu_buffer = build_xu_buffer(cds_map, seq, is_protein)
        combined_buffers.append((record_name, xut_buffer, xu_buffer, original_name))  # ← pass through
        xut_only_buffers.append((record_name, xut_buffer, original_name))
        xu_only_buffers.append((record_name, xu_buffer, original_name))

    return combined_buffers, xut_only_buffers, xu_only_buffers


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    gbk_path = "data/AG-Bode Genomes.gb"
    # gbk_path = "data/5 documents from 03 Cluster Heterologous Expression.gb"
    combined_buffers, xut_only_buffers, xu_only_buffers = prepare_record_buffers(gbk_path)

    out_path = write_annotations(gbk_path, combined_buffers, created_by="Arun")
    print(out_path)

    # Write XUT only
    # out_path = write_xut_annotations(gbk_path, xut_only_buffers, created_by="Arun")
    # print(out_path)

    # Write XU only
    # out_path = write_xu_annotations(gbk_path, xu_only_buffers, created_by="Arun")
    # print(out_path)
