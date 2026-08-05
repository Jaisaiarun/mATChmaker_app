import React, {useEffect, useMemo, useState} from 'react';
import {useParams} from 'react-router-dom';
import {toast} from 'react-toastify';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Collapse,
    Divider,
    FormControlLabel,
    FormGroup,
    IconButton,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tooltip,
    Typography,
} from '@mui/material';
import {FaDownload, FaFilter} from 'react-icons/fa';
import {FaFileCsv} from 'react-icons/fa6';

import Loading from '../components/Loading';

const PAGE_HEIGHT_PX = 560;            // ≈ 15 rows + header in MUI dense table
const SIMILARITY_TIERS = [
    {min: 90, color: '#2e7d32', label: '≥ 90% — very close'},
    {min: 75, color: '#558b2f', label: '75–90% — closely related'},
    {min: 60, color: '#f9a825', label: '60–75% — likely homologous'},
    {min: 50, color: '#ef6c00', label: '50–60% — distant relatives'},
    {min: 0, color: '#c62828', label: '< 50% — weak / spurious'},
];

const similarityColor = (sim) => {
    if (typeof sim !== 'number' || Number.isNaN(sim)) return '#9e9e9e';
    for (const tier of SIMILARITY_TIERS) if (sim >= tier.min) return tier.color;
    return '#9e9e9e';
};

/**
 * Results page for the TTE reference-search job.
 *
 * Layout: one Paper per reference protocluster, each with its own monomer
 * filter (matching the style of resultsTTE.js) and a paginated/scrollable
 * sortable hit table. Empty groups are preserved.
 */
const ResultsTTESearch = () => {
    const {jobId} = useParams();

    const [results, setResults] = useState(null);
    const [searchParams, setSearchParams] = useState(null);
    const [progress, setProgress] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errored, setErrored] = useState(false);

    // Per-group sort: {[regionId]: {field, direction}}
    const [sortConfig, setSortConfig] = useState({});
    // Per-group selected monomers: {[regionId]: Set<string>}
    const [selectedMonomers, setSelectedMonomers] = useState({});
    // Per-group filter-panel open state: {[regionId]: bool}
    const [showFilter, setShowFilter] = useState({});

    // ── Poll the job ──────────────────────────────────────────────────────
    useEffect(() => {
        let intervalId;
        let cancelled = false;

        const fetchResult = async () => {
            try {
                const resp = await fetch(`/api/retrieve/${jobId}`);
                if (!resp.ok) throw new Error('Failed to fetch results.');
                const data = await resp.json();
                if (cancelled) return;

                if (data.status === 'success') {
                    const payload = data.payload || {};
                    setResults(payload.results || []);
                    setSearchParams(payload.search_params || null);
                    if (payload.progress) setProgress(payload.progress);
                    setIsLoading(false);
                    clearInterval(intervalId);
                } else if (data.status === 'pending') {
                    if (data.payload?.progress) setProgress(data.payload.progress);
                } else if (data.status === 'failure') {
                    toast.error(data.message || 'TTE search failed.');
                    setErrored(true);
                    setIsLoading(false);
                    clearInterval(intervalId);
                }
            } catch (err) {
                if (cancelled) return;
                toast.error(err?.message || String(err));
                setErrored(true);
                setIsLoading(false);
                clearInterval(intervalId);
            }
        };

        fetchResult();
        intervalId = setInterval(fetchResult, 3000);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [jobId]);

    // ── Per-group monomer options derived from reference protocluster predictions ──
    const uniqueMonomersByGroup = useMemo(() => {
        if (!results) return {};
        const out = {};
        for (const g of results) {
            const set = new Set();
            if (g.monomer_pairs) {
                g.monomer_pairs.split(' | ').forEach((m) => {
                    const t = m.trim();
                    if (t) set.add(t);
                });
            }
            out[g.region_id] = Array.from(set);
        }
        return out;
    }, [results]);

    useEffect(() => {
        // Initialise selected sets to "all selected" once when options are known.
        if (!results) return;
        setSelectedMonomers((prev) => {
            const next = {...prev};
            for (const g of results) {
                if (!next[g.region_id]) {
                    next[g.region_id] = new Set(uniqueMonomersByGroup[g.region_id] || []);
                }
            }
            return next;
        });
    }, [results, uniqueMonomersByGroup]);

    const handleSort = (regionId, field) => {
        setSortConfig((prev) => {
            const cur = prev[regionId];
            const direction = (cur?.field === field && cur?.direction === 'desc') ? 'asc' : 'desc';
            return {...prev, [regionId]: {field, direction}};
        });
    };

    const sortHits = (hits, regionId) => {
        const conf = sortConfig[regionId] || {field: 'similarity', direction: 'desc'};
        const dir = conf.direction === 'asc' ? 1 : -1;
        return [...hits].sort((a, b) => {
            const av = a[conf.field];
            const bv = b[conf.field];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv)) * dir;
        });
    };

    const toggleMonomer = (regionId, m) => {
        setSelectedMonomers((prev) => {
            const cur = new Set(prev[regionId] || []);
            cur.has(m) ? cur.delete(m) : cur.add(m);
            return {...prev, [regionId]: cur};
        });
    };

    const downloadCsv = () => {
        if (!results) return;
        const rows = [[
            'reference_protocluster',
            'reference_tte_length',
            'db_cluster_id',
            'db_filename',
            'db_display_name',
            'db_organism',
            'db_strain',
            'db_accession',
            'db_product_class',
            'db_tte_length',
            'db_cluster_tte_count',
            'similarity_percent',
        ]];
        for (const group of results) {
            if (!group.hits || group.hits.length === 0) {
                rows.push([group.region_id || '', '', '', '', '(no hits above threshold)', '', '', '', '', '', '', '']);
                continue;
            }
            for (const h of group.hits) {
                rows.push([
                    group.region_id || '',
                    h.ref_tte_len ?? '',
                    h.bgc_id || '',
                    h.filename || '',
                    h.display_name || '',
                    h.organism || h.source_organism || '',
                    h.strain || '',
                    h.accession || '',
                    h.product_class || '',
                    h.db_tte_len ?? '',
                    h.db_tte_count ?? '',
                    typeof h.similarity === 'number' ? h.similarity.toFixed(2) : '',
                ]);
            }
        }
        const csv = rows
            .map((r) =>
                r.map((cell) => {
                    const s = String(cell ?? '');
                    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                }).join(',')
            )
            .join('\n');
        const blob = new Blob([csv], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tte_search_${jobId.slice(0, 8)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    // ── Loading / progress UI ─────────────────────────────────────────────
    if (isLoading) {
        const phaseLabel =
            progress?.phase === 'extracting_reference'
                ? 'Extracting reference TTEs'
                : progress?.phase === 'scoring'
                    ? 'Scoring against reference database'
                    : 'Working';
        const detail = progress?.message || '';
        const cur = progress?.current;
        const tot = progress?.total;
        const showCounter = typeof cur === 'number' && typeof tot === 'number' && tot > 0;

        return (
            <Box
                display="flex"
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                minHeight="90vh"
                gap={2}
                padding={4}
            >
                <Loading frame1="Logo_trans_1.png" frame2="Logo_trans_2.png"/>
                <Typography variant="h6">{phaseLabel}</Typography>
                {detail && (
                    <Typography variant="body2" color="text.secondary">
                        {detail}
                    </Typography>
                )}
                {showCounter && (
                    <Typography variant="caption" color="text.secondary">
                        Protocluster {Math.min(cur + 1, tot)} of {tot}
                    </Typography>
                )}
            </Box>
        );
    }

    if (errored) {
        return (
            <Box padding={4} maxWidth={720} margin="auto">
                <Typography variant="h5" color="error" gutterBottom>Search failed</Typography>
                <Typography variant="body2" color="text.secondary">
                    See the toast notification above for details, or check server logs.
                </Typography>
            </Box>
        );
    }

    if (!results || results.length === 0) {
        return (
            <Box padding={4} maxWidth={720} margin="auto">
                <Typography variant="h5" gutterBottom>No protoclusters found</Typography>
                <Typography variant="body2" color="text.secondary">
                    The reference file did not contain any antiSMASH protocluster features.
                    Make sure the file is antiSMASH-annotated before submitting.
                </Typography>
            </Box>
        );
    }

    // ── Main results ──────────────────────────────────────────────────────
    const totalHits = results.reduce((sum, g) => sum + (g.hit_count || 0), 0);

    return (
        <Box display="flex" flexDirection="column" padding={4} maxWidth={1200} margin="auto">
            <Box display="flex" alignItems="center" justifyContent="space-between" sx={{mb: 1}} flexWrap="wrap" gap={1}>
                <Typography variant="h4">TTE Search Results</Typography>
                <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<FaFileCsv/>}
                    onClick={downloadCsv}
                    disabled={totalHits === 0}
                >
                    Download CSV
                </Button>
            </Box>

            {searchParams && (
                <Box sx={{mb: 1, display: 'flex', flexWrap: 'wrap', gap: 1}}>
                    <Chip label={`Threshold: ≥ ${searchParams.min_similarity}% identity`} size="small"/>
                    <Chip
                        label={`Reference DB: ${searchParams.db_cluster_count} clusters / ${searchParams.db_tte_count} TTEs`}
                        size="small"
                    />
                    <Chip label={`${results.length} reference protocluster${results.length === 1 ? '' : 's'}`}
                          size="small"/>
                    <Chip
                        label={`${totalHits} total hit${totalHits === 1 ? '' : 's'}`}
                        size="small"
                        color={totalHits === 0 ? 'default' : 'success'}
                    />
                </Box>
            )}

            {/* Similarity colour legend */}
            <Box sx={{mb: 3, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center'}}>
                <Typography variant="caption" color="text.secondary" sx={{mr: 0.5}}>
                    Similarity scale:
                </Typography>
                {SIMILARITY_TIERS.map((tier) => (
                    <Chip
                        key={tier.label}
                        size="small"
                        label={tier.label}
                        sx={{backgroundColor: tier.color, color: '#fff', fontWeight: 500}}
                    />
                ))}
            </Box>

            {results.map((group) => {
                const sortedHits = group.hits ? sortHits(group.hits, group.region_id) : [];
                const conf = sortConfig[group.region_id] || {field: 'similarity', direction: 'desc'};
                const monomerOpts = uniqueMonomersByGroup[group.region_id] || [];
                const selected = selectedMonomers[group.region_id] || new Set();
                const filterOpen = !!showFilter[group.region_id];
                const groupPassesFilter = monomerOpts.length === 0 || selected.size > 0;

                return (
                    <Paper key={group.region_id} variant="outlined" sx={{p: 2, mb: 3}}>
                        <Box display="flex" alignItems="baseline" gap={1} flexWrap="wrap">
                            <Typography variant="h6">{group.region_id}</Typography>
                            <Chip
                                label={`${group.reference_tte_count} reference TTE${group.reference_tte_count === 1 ? '' : 's'}`}
                                size="small"
                            />
                            <Chip
                                label={`${group.hit_count} hit${group.hit_count === 1 ? '' : 's'}`}
                                size="small"
                                color={group.hit_count === 0 ? 'default' : 'primary'}
                            />
                        </Box>

                        {group.monomer_pairs && (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{mt: 0.5, mb: 1, display: 'block', wordBreak: 'break-word'}}
                            >
                                Predicted monomers: {group.monomer_pairs}
                            </Typography>
                        )}

                        {/* Monomer filter (per group) */}
                        {monomerOpts.length > 0 && (
                            <Box sx={{mb: 1}}>
                                <Button
                                    variant="outlined" size="small" startIcon={<FaFilter/>}
                                    onClick={() => setShowFilter((prev) => ({
                                        ...prev,
                                        [group.region_id]: !prev[group.region_id],
                                    }))}
                                >
                                    Monomers ({selected.size}/{monomerOpts.length})
                                </Button>
                                <Collapse in={filterOpen}>
                                    <Paper sx={{p: 1.5, mt: 1}} variant="outlined">
                                        <Box sx={{display: 'flex', gap: 1, mb: 1}}>
                                            <Button
                                                size="small" variant="text"
                                                onClick={() => setSelectedMonomers((prev) => ({
                                                    ...prev,
                                                    [group.region_id]: new Set(monomerOpts),
                                                }))}
                                            >
                                                Select all
                                            </Button>
                                            <Button
                                                size="small" variant="text"
                                                onClick={() => setSelectedMonomers((prev) => ({
                                                    ...prev,
                                                    [group.region_id]: new Set(),
                                                }))}
                                            >
                                                Clear all
                                            </Button>
                                        </Box>
                                        <FormGroup row sx={{gap: 0.5}}>
                                            {monomerOpts.map((m) => (
                                                <FormControlLabel
                                                    key={m}
                                                    control={
                                                        <Checkbox
                                                            size="small"
                                                            checked={selected.has(m)}
                                                            onChange={() => toggleMonomer(group.region_id, m)}
                                                        />
                                                    }
                                                    label={
                                                        <Chip
                                                            label={m}
                                                            size="small"
                                                            variant={selected.has(m) ? 'filled' : 'outlined'}
                                                            color={selected.has(m) ? 'secondary' : 'default'}
                                                        />
                                                    }
                                                />
                                            ))}
                                        </FormGroup>
                                    </Paper>
                                </Collapse>
                            </Box>
                        )}

                        <Divider sx={{my: 1}}/>

                        {group.hit_count === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{py: 2}}>
                                No reference clusters above the similarity threshold.
                            </Typography>
                        ) : !groupPassesFilter ? (
                            <Typography variant="body2" color="text.secondary" sx={{py: 2}}>
                                No monomers selected — check at least one above to show results.
                            </Typography>
                        ) : (
                            <TableContainer sx={{maxHeight: PAGE_HEIGHT_PX, overflow: 'auto'}}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{width: 110}}>
                                                <TableSortLabel
                                                    active={conf.field === 'similarity'}
                                                    direction={conf.field === 'similarity' ? conf.direction : 'desc'}
                                                    onClick={() => handleSort(group.region_id, 'similarity')}
                                                >
                                                    Similarity %
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={conf.field === 'display_name'}
                                                    direction={conf.field === 'display_name' ? conf.direction : 'desc'}
                                                    onClick={() => handleSort(group.region_id, 'display_name')}
                                                >
                                                    Reference cluster
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={conf.field === 'organism'}
                                                    direction={conf.field === 'organism' ? conf.direction : 'desc'}
                                                    onClick={() => handleSort(group.region_id, 'organism')}
                                                >
                                                    Organism
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={conf.field === 'product_class'}
                                                    direction={conf.field === 'product_class' ? conf.direction : 'desc'}
                                                    onClick={() => handleSort(group.region_id, 'product_class')}
                                                >
                                                    Product class
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>Lengths (ref / db)</TableCell>
                                            <TableCell sx={{width: 90}} align="center">Download</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {sortedHits.map((h, i) => {
                                            const sim = typeof h.similarity === 'number' ? h.similarity : null;
                                            const simText = sim != null ? sim.toFixed(2) : '—';
                                            const simBg = similarityColor(sim);
                                            const orgDisplay = h.organism || h.source_organism || '—';
                                            const refLabel = h.display_name || h.bgc_id || h.filename || '(unknown)';
                                            const downloadHref = h.filename
                                                ? `/api/download_reference_gbk/${encodeURIComponent(h.filename)}`
                                                : null;

                                            return (
                                                <TableRow key={`${group.region_id}-${i}-${h.bgc_id}`}>
                                                    <TableCell>
                                                        <Box
                                                            sx={{
                                                                display: 'inline-block',
                                                                px: 1.25,
                                                                py: 0.25,
                                                                borderRadius: 1,
                                                                backgroundColor: simBg,
                                                                color: '#fff',
                                                                fontWeight: 600,
                                                                minWidth: 56,
                                                                textAlign: 'center',
                                                            }}
                                                        >
                                                            {simText}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Tooltip
                                                            title={
                                                                <Box>
                                                                    <div>File: {h.filename}</div>
                                                                    <div>BGC ID: {h.bgc_id}</div>
                                                                    {h.accession && <div>Accession: {h.accession}</div>}
                                                                    {h.definition &&
                                                                        <div>Definition: {h.definition}</div>}
                                                                    {h.locus && <div>Locus: {h.locus}</div>}
                                                                </Box>
                                                            }
                                                            arrow
                                                        >
                                                            <span style={{cursor: 'help'}}>{refLabel}</span>
                                                        </Tooltip>
                                                    </TableCell>
                                                    <TableCell>{orgDisplay}</TableCell>
                                                    <TableCell>{h.product_class || '—'}</TableCell>
                                                    <TableCell>
                                                        {h.ref_tte_len ?? '—'} / {h.db_tte_len ?? '—'}
                                                        {typeof h.db_tte_count === 'number' && h.db_tte_count > 1 && (
                                                            <Typography variant="caption" color="text.secondary"
                                                                        sx={{ml: 1}}>
                                                                ({h.db_tte_count} TTEs)
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {downloadHref ? (
                                                            <Tooltip title={`Download ${h.filename}`} arrow>
                                                                <IconButton
                                                                    size="small"
                                                                    component="a"
                                                                    href={downloadHref}
                                                                    download
                                                                >
                                                                    <FaDownload/>
                                                                </IconButton>
                                                            </Tooltip>
                                                        ) : (
                                                            <span>—</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Paper>
                );
            })}
        </Box>
    );
};

export default ResultsTTESearch;