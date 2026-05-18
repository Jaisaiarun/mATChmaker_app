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
import {FaCopy, FaDownload, FaFilter} from 'react-icons/fa';
import {FaFileCsv} from 'react-icons/fa6';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

import Loading from '../components/Loading';

// ─── helpers ─────────────────────────────────────────────────────────────────

const similarityColor = (v) =>
    typeof v !== 'number' ? 'text.disabled'
        : v >= 80 ? 'green'
            : v >= 50 ? 'orange'
                : 'red';

const cleanFileName = (raw) =>
    (raw || '').replace(/^[a-f0-9-]+_(?:[A-Z]+(?:_\d+)?)_/, '');

// ─── per-protocore table ──────────────────────────────────────────────────────

const ProtocoreTable = ({protocoreId, rows, hasParas, protocoreFiles, jobId, index: tableIndex}) => {
    const [sortDirection, setSortDirection] = useState('desc');
    const [showMonomerFilter, setShowMonomerFilter] = useState(false);
    const [showParasFilter, setShowParasFilter] = useState(false);
    const [expandedSeqs, setExpandedSeqs] = useState(new Set());
    const [collapsed, setCollapsed] = useState(false);

    // ── unique filter options derived from this table's rows ─────────────────
    const uniqueMonomers = useMemo(() => {
        const s = new Set();
        rows.forEach(r => {
            if (r.monomer_pairs)
                r.monomer_pairs.split(' | ').forEach(m => {
                    if (m.trim()) s.add(m.trim());
                });
        });
        return Array.from(s).sort();
    }, [rows]);

    const uniqueParasSubs = useMemo(() => {
        if (!hasParas) return [];
        const s = new Set();
        rows.forEach(r => (r.paras_substrates || []).forEach(p => {
            const l = p.substrate_3letter || p.substrate;
            if (l) s.add(l);
        }));
        return Array.from(s).sort();
    }, [rows, hasParas]);

    const [selectedMonomers, setSelectedMonomers] = useState(new Set());
    const [selectedParas, setSelectedParas] = useState(new Set());

    // initialise / refresh filter sets when options change
    useEffect(() => setSelectedMonomers(new Set(uniqueMonomers)), [uniqueMonomers.join(',')]); // eslint-disable-line
    useEffect(() => setSelectedParas(new Set(uniqueParasSubs)), [uniqueParasSubs.join(',')]); // eslint-disable-line

    const protocoreHasAny = Object.keys(protocoreFiles).length > 0;

    // ── filtered + sorted ────────────────────────────────────────────────────
    const displayed = useMemo(() => {
        const filtered = rows.filter(r => {
            const monomerPass = (() => {
                if (!r.monomer_pairs || !r.monomer_pairs.trim()) return true;
                return r.monomer_pairs.split(' | ').map(m => m.trim()).some(m => selectedMonomers.has(m));
            })();
            const parasPass = (() => {
                if (!hasParas) return true;
                const subs = (r.paras_substrates || [])
                    .map(p => p.substrate_3letter || p.substrate).filter(Boolean);
                if (!subs.length) return true;
                return subs.some(s => selectedParas.has(s));
            })();
            return monomerPass && parasPass;
        });

        return [...filtered].sort((a, b) => {
            if (a.similarity === 'reference') return -1;
            if (b.similarity === 'reference') return 1;
            const aV = typeof a.similarity === 'number' ? a.similarity : -1;
            const bV = typeof b.similarity === 'number' ? b.similarity : -1;
            return sortDirection === 'desc' ? bV - aV : aV - bV;
        });
    }, [rows, selectedMonomers, selectedParas, hasParas, sortDirection]);

    // ── per-table CSV download ────────────────────────────────────────────────
    const downloadCsv = () => {
        const headers = [
            'Reference Protocore', 'File', 'File Locus', 'Region ID',
            'Monomer Pairs', 'CDS Locus Tag', 'TTE Length', 'Similarity', 'TTE Sequence',
            ...(hasParas ? ['PARAS Predictions (substrate: score%)'] : []),
        ];
        const csvRows = displayed.map(r => {
            const fname = cleanFileName(r.file);
            const sim = r.similarity === 'reference' ? 'reference'
                : typeof r.similarity === 'number' ? r.similarity.toFixed(2) : '';
            const base = [
                protocoreId, fname, r.file_locus || '', r.region_id || '',
                r.monomer_pairs || '', r.CDS_locus_tag || '', r.tte_len || '', sim, r.tte_seq || '',
            ];
            if (hasParas) {
                base.push((r.paras_substrates || [])
                    .map(p => `${p.substrate_3letter || p.substrate}: ${(p.score * 100).toFixed(1)}%`)
                    .join('; '));
            }
            return base;
        });
        const csv = [headers, ...csvRows]
            .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = `tte_${protocoreId.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Paper sx={{mb: 3, borderRadius: 2, boxShadow: 2, overflow: 'hidden'}}>

            {/* ── header bar ── */}
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2, py: 1.25,
                backgroundColor: 'background.default',
                borderBottom: '1px solid', borderColor: 'divider',
            }}>
                <Chip
                    label={tableIndex + 1}
                    size="small"
                    color="secondary"
                    sx={{width: 28, height: 28, borderRadius: '50%', fontWeight: 700}}
                />
                <Box sx={{flex: 1}}>
                    <Typography variant="subtitle1" sx={{fontWeight: 600, lineHeight: 1.2}}>
                        {protocoreId}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Reference protocore ·{' '}
                        {rows.length} comparison{rows.length !== 1 ? 's' : ''}
                        {displayed.length !== rows.length && ` (${displayed.length} shown)`}
                    </Typography>
                </Box>

                <Tooltip title="Download this table as CSV">
                    <IconButton size="small" onClick={downloadCsv}><FaFileCsv/></IconButton>
                </Tooltip>
                <Tooltip title={collapsed ? 'Expand table' : 'Collapse table'}>
                    <IconButton size="small" onClick={() => setCollapsed(p => !p)}>
                        {collapsed ? <KeyboardArrowDownIcon/> : <KeyboardArrowUpIcon/>}
                    </IconButton>
                </Tooltip>
            </Box>

            <Collapse in={!collapsed}>
                <Box sx={{p: 2}}>

                    {/* ── filters ── */}
                    <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2}}>
                        {uniqueMonomers.length > 0 && (
                            <Box>
                                <Button
                                    variant="outlined" size="small" startIcon={<FaFilter/>}
                                    onClick={() => setShowMonomerFilter(p => !p)}
                                >
                                    Filter Monomers ({selectedMonomers.size}/{uniqueMonomers.length})
                                </Button>
                                <Collapse in={showMonomerFilter}>
                                    <Paper sx={{p: 1.5, mt: 1}} variant="outlined">
                                        <Box sx={{display: 'flex', gap: 1, mb: 1}}>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedMonomers(new Set(uniqueMonomers))}>
                                                Select all
                                            </Button>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedMonomers(new Set())}>
                                                Clear all
                                            </Button>
                                        </Box>
                                        <FormGroup row sx={{gap: 0.5}}>
                                            {uniqueMonomers.map(m => (
                                                <FormControlLabel key={m}
                                                                  control={
                                                                      <Checkbox size="small"
                                                                                checked={selectedMonomers.has(m)}
                                                                                onChange={() => setSelectedMonomers(prev => {
                                                                                    const n = new Set(prev);
                                                                                    n.has(m) ? n.delete(m) : n.add(m);
                                                                                    return n;
                                                                                })}
                                                                      />
                                                                  }
                                                                  label={
                                                                      <Chip label={m} size="small"
                                                                            variant={selectedMonomers.has(m) ? 'filled' : 'outlined'}
                                                                            color={selectedMonomers.has(m) ? 'secondary' : 'default'}
                                                                      />
                                                                  }
                                                />
                                            ))}
                                        </FormGroup>
                                    </Paper>
                                </Collapse>
                            </Box>
                        )}

                        {hasParas && uniqueParasSubs.length > 0 && (
                            <Box>
                                <Button
                                    variant="outlined" size="small" startIcon={<FaFilter/>}
                                    color="secondary"
                                    onClick={() => setShowParasFilter(p => !p)}
                                >
                                    Filter PARAS ({selectedParas.size}/{uniqueParasSubs.length})
                                </Button>
                                <Collapse in={showParasFilter}>
                                    <Paper sx={{p: 1.5, mt: 1}} variant="outlined">
                                        <Box sx={{display: 'flex', gap: 1, mb: 1}}>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedParas(new Set(uniqueParasSubs))}>
                                                Select all
                                            </Button>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedParas(new Set())}>
                                                Clear all
                                            </Button>
                                        </Box>
                                        <FormGroup row sx={{gap: 0.5}}>
                                            {uniqueParasSubs.map(s => (
                                                <FormControlLabel key={s}
                                                                  control={
                                                                      <Checkbox size="small"
                                                                                checked={selectedParas.has(s)}
                                                                                onChange={() => setSelectedParas(prev => {
                                                                                    const n = new Set(prev);
                                                                                    n.has(s) ? n.delete(s) : n.add(s);
                                                                                    return n;
                                                                                })}
                                                                      />
                                                                  }
                                                                  label={
                                                                      <Chip label={s} size="small"
                                                                            variant={selectedParas.has(s) ? 'filled' : 'outlined'}
                                                                            color={selectedParas.has(s) ? 'secondary' : 'default'}
                                                                      />
                                                                  }
                                                />
                                            ))}
                                        </FormGroup>
                                    </Paper>
                                </Collapse>
                            </Box>
                        )}
                    </Box>

                    {/* ── table ── */}
                    <TableContainer sx={{maxHeight: 520, borderRadius: 1, border: '1px solid', borderColor: 'divider'}}>
                        <Table stickyHeader size="small" sx={{minWidth: hasParas ? 1400 : 1100}}>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>File</strong></TableCell>
                                    <TableCell><strong>File Locus</strong></TableCell>
                                    <TableCell><strong>Region ID</strong></TableCell>
                                    <TableCell><strong>Monomer Pairs</strong></TableCell>
                                    <TableCell><strong>CDS Locus Tag</strong></TableCell>
                                    <TableCell align="center"><strong>TTE Length</strong></TableCell>
                                    <TableCell align="center">
                                        <TableSortLabel
                                            active direction={sortDirection}
                                            onClick={() => setSortDirection(p => p === 'desc' ? 'asc' : 'desc')}
                                        >
                                            <strong>Similarity</strong>
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell><strong>TTE Sequence</strong></TableCell>
                                    {hasParas && (
                                        <TableCell align="center" sx={{minWidth: 220}}>
                                            <strong>PARAS Predictions</strong>
                                            <Typography variant="caption" display="block" color="text.secondary">
                                                all A-domains in region
                                            </Typography>
                                        </TableCell>
                                    )}
                                    {protocoreHasAny && (
                                        <TableCell align="center"><strong>Protocore .gbk</strong></TableCell>
                                    )}
                                </TableRow>
                            </TableHead>

                            <TableBody>
                                {displayed.map((r, idx) => {
                                    const fname = cleanFileName(r.file);
                                    const fileStem = fname.replace(/\.(gb|gbk)$/i, '');
                                    const lookupKey = `${fileStem}::${r.region_id}`;
                                    const protocoreFname = protocoreFiles[lookupKey] || null;
                                    const isReference = r.similarity === 'reference';
                                    const seqKey = `${protocoreId}-${idx}`;
                                    const expanded = expandedSeqs.has(seqKey);

                                    return (
                                        <TableRow key={seqKey} hover sx={{
                                            backgroundColor: isReference ? 'action.hover' : undefined,
                                        }}>
                                            <TableCell>
                                                {isReference && (
                                                    <Chip label="ref" size="small" color="default"
                                                          variant="outlined" sx={{mr: 0.5, height: 16, fontSize: 10}}/>
                                                )}
                                                {fname}
                                            </TableCell>
                                            <TableCell>{r.file_locus || '–'}</TableCell>
                                            <TableCell sx={{fontFamily: 'monospace', fontSize: '0.78rem'}}>
                                                {r.region_id || '–'}
                                            </TableCell>
                                            <TableCell sx={{maxWidth: 200}}>{r.monomer_pairs || '–'}</TableCell>
                                            <TableCell>{r.CDS_locus_tag || '–'}</TableCell>
                                            <TableCell align="center">{r.tte_len}</TableCell>

                                            <TableCell align="center" sx={{
                                                fontWeight: 'bold',
                                                color: isReference ? 'text.secondary' : similarityColor(r.similarity),
                                            }}>
                                                {isReference ? 'reference'
                                                    : typeof r.similarity === 'number'
                                                        ? `${r.similarity.toFixed(2)} %`
                                                        : '–'}
                                            </TableCell>

                                            <TableCell
                                                onClick={() => setExpandedSeqs(prev => {
                                                    const n = new Set(prev);
                                                    n.has(seqKey) ? n.delete(seqKey) : n.add(seqKey);
                                                    return n;
                                                })}
                                                title={expanded ? 'Click to collapse' : 'Click to expand full sequence'}
                                                sx={{
                                                    maxWidth: expanded ? 450 : 180,
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.75rem',
                                                    whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: expanded ? 'unset' : 'ellipsis',
                                                    cursor: 'pointer',
                                                    userSelect: 'text',
                                                    color: 'text.secondary',
                                                    wordBreak: expanded ? 'break-all' : 'normal',
                                                }}
                                            >
                                                {expanded
                                                    ? r.tte_seq
                                                    : `${(r.tte_seq || '').slice(0, 30)}${(r.tte_seq || '').length > 30 ? '…' : ''}`}
                                            </TableCell>

                                            {hasParas && (
                                                <TableCell align="center" sx={{verticalAlign: 'top', pt: 1}}>
                                                    {isReference ? (
                                                        <Typography variant="caption"
                                                                    color="text.disabled">–</Typography>
                                                    ) : (r.paras_substrates || []).length > 0 ? (
                                                        <Box sx={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'flex-start',
                                                            gap: 0.5
                                                        }}>
                                                            {(r.paras_substrates || []).map((p, i) => (
                                                                <Box key={i} sx={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 0.5
                                                                }}>
                                                                    <Chip
                                                                        label={p.substrate_3letter || p.substrate}
                                                                        size="small"
                                                                        color={p.score >= 0.8 ? 'success' : p.score >= 0.5 ? 'warning' : 'default'}
                                                                        variant="outlined"
                                                                    />
                                                                    <Typography variant="caption" sx={{
                                                                        fontWeight: 'bold', minWidth: 40,
                                                                        color: p.score >= 0.8 ? 'green' : p.score >= 0.5 ? 'orange' : 'red',
                                                                    }}>
                                                                        {(p.score * 100).toFixed(1)}%
                                                                    </Typography>
                                                                </Box>
                                                            ))}
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="caption"
                                                                    color="text.disabled">–</Typography>
                                                    )}
                                                </TableCell>
                                            )}

                                            {protocoreHasAny && (
                                                <TableCell align="center">
                                                    {protocoreFname ? (
                                                        <Tooltip title={`Download ${protocoreFname}`}>
                                                            <IconButton size="small"
                                                                        onClick={() => window.open(
                                                                            `/api/download_file/${jobId}/${encodeURIComponent(protocoreFname)}`,
                                                                            '_blank'
                                                                        )}
                                                            >
                                                                <FaDownload size={12}/>
                                                            </IconButton>
                                                        </Tooltip>
                                                    ) : (
                                                        <Typography variant="caption"
                                                                    color="text.disabled">–</Typography>
                                                    )}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}

                                {displayed.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={hasParas ? 10 : 9} align="center"
                                                   sx={{py: 4, color: 'text.disabled', fontStyle: 'italic'}}>
                                            No results match the current filters.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Typography variant="body2" sx={{mt: 1}} color="text.secondary">
                        Showing {displayed.length} of {rows.length} results
                        {hasParas && (
                            <Chip label="+ PARAS predictions" size="small" color="secondary"
                                  variant="outlined" sx={{ml: 1}}/>
                        )}
                    </Typography>
                </Box>
            </Collapse>
        </Paper>
    );
};

// ─── main page ────────────────────────────────────────────────────────────────

const ResultsTTE = () => {
    const {jobId} = useParams();
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasParas, setHasParas] = useState(false);
    const [protocoreFiles, setProtocoreFiles] = useState({});
    const [progress, setProgress] = useState(null);
    const [nowTs, setNowTs] = useState(Date.now());

    // live clock while loading
    useEffect(() => {
        if (!isLoading) return;
        const t = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(t);
    }, [isLoading]);

    // ── poll ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        let intervalId;
        const fetchResult = async () => {
            try {
                const response = await fetch(`/api/retrieve/${jobId}`);
                if (!response.ok) throw new Error('Failed to fetch results');
                const data = await response.json();

                if (data.status === 'success') {
                    const payload = data.payload || {};
                    setHasParas(payload.has_paras || false);
                    if (payload.protocore_files) setProtocoreFiles(payload.protocore_files || {});
                    if (payload.progress) setProgress(payload.progress);
                    setResults(payload.results || []);
                    setIsLoading(false);
                    clearInterval(intervalId);

                } else if (data.status === 'pending') {
                    if (data.payload?.has_paras !== undefined) setHasParas(data.payload.has_paras);
                    if (data.payload?.progress) setProgress(data.payload.progress);

                } else if (data.status === 'failure') {
                    toast.error(data.message);
                    setIsLoading(false);
                    clearInterval(intervalId);
                }
            } catch (error) {
                toast.error(
                    <>
                        {error.message}<br/><br/>
                        If you feel this is an error, or if you need assistance, please contact the
                        developers in GitHub issues by selecting 'Report an issue' in the app bar at
                        the top left of this page and posting your issue or question.
                    </>,
                    {autoClose: false}
                );
                setIsLoading(false);
                clearInterval(intervalId);
            }
        };
        if (jobId) {
            fetchResult();
            intervalId = setInterval(fetchResult, 1000);
        }
        return () => clearInterval(intervalId);
    }, [jobId]);

    // ── group results by reference_protocore_id ───────────────────────────────
    // Each unique reference_protocore_id gets its own table.
    // Rows without the field (backwards-compat) fall into a single group.
    const protocoreGroups = useMemo(() => {
        if (!results) return [];
        const map = new Map();
        results.forEach(r => {
            const key = r.reference_protocore_id || 'proto_core_1';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(r);
        });
        return Array.from(map.entries()).map(([id, rows]) => ({id, rows}));
    }, [results]);

    // ── download all results as JSON ──────────────────────────────────────────
    const downloadJson = () => {
        const blob = new Blob(
            [JSON.stringify({jobType: 'tte', hasParas, results}, null, 2)],
            {type: 'application/json'}
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tte_results.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── download all tables as a single combined CSV ──────────────────────────
    const downloadAllCsv = () => {
        const headers = [
            'Reference Protocore', 'File', 'File Locus', 'Region ID',
            'Monomer Pairs', 'CDS Locus Tag', 'TTE Length', 'Similarity', 'TTE Sequence',
            ...(hasParas ? ['PARAS Predictions (substrate: score%)'] : []),
        ];
        const csvRows = (results || []).map(r => {
            const fname = cleanFileName(r.file);
            const sim = r.similarity === 'reference' ? 'reference'
                : typeof r.similarity === 'number' ? r.similarity.toFixed(2) : '';
            const ref = r.reference_protocore_id || '';
            const base = [ref, fname, r.file_locus || '', r.region_id || '',
                r.monomer_pairs || '', r.CDS_locus_tag || '', r.tte_len || '', sim, r.tte_seq || ''];
            if (hasParas) {
                base.push((r.paras_substrates || [])
                    .map(p => `${p.substrate_3letter || p.substrate}: ${(p.score * 100).toFixed(1)}%`)
                    .join('; '));
            }
            return base;
        });
        const csv = [headers, ...csvRows]
            .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tte_results_all.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── loading screen ────────────────────────────────────────────────────────
    if (isLoading) {
        const pct = progress?.total > 0
            ? Math.round((progress.current / progress.total) * 100)
            : null;

        const startedAt = progress?.started_at ? new Date(progress.started_at).getTime() : null;
        const loadingElapsedSeconds = startedAt
            ? Math.max(0, Math.floor((nowTs - startedAt) / 1000))
            : 0;

        const loadingMessage = (() => {
            if (!progress) return 'Starting...';

            const phase = progress.phase;

            if (phase === 'extracting_reference') {
                return 'Extracting TTE from reference file...';
            }

            if (phase === 'comparing') {
                return `Extracting TTE from ${progress.current_file || 'input file'}...`;
            }

            if (phase === 'similarity') {
                return `Computing similarity for ${progress.current_file || 'input file'}...`;
            }

            if (phase === 'paras') {
                if (progress.current === 0) return 'Loading PARAS model...';
                return `Running PARAS ${progress.message ? `— ${progress.message}` : ''}`;
            }

            return 'Processing...';
        })();

        const loadingDetail = (() => {
            if (!progress) return null;

            if (progress.phase === 'similarity' && progress.tte_count != null) {
                return `${progress.tte_count} TTE sequence(s) found`;
            }

            if (progress.phase === 'paras' && progress.current > 0 && progress.total > 0) {
                return `Domain ${progress.current} of ${progress.total}`;
            }

            return null;
        })();

        const showProgressBar = progress?.phase === 'paras';
        const isIndeterminate = progress?.phase === 'paras' && progress.current === 0;

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

                <Typography variant="h6" color="text.secondary">
                    {loadingMessage}
                </Typography>

                {loadingDetail && (
                    <Typography variant="body2" color="text.secondary">
                        {loadingDetail}
                    </Typography>
                )}

                {showProgressBar && (
                    <Box sx={{width: '100%', maxWidth: 400}}>
                        <Box
                            sx={{
                                width: '100%',
                                height: 10,
                                borderRadius: 5,
                                bgcolor: 'divider',
                                overflow: 'hidden',
                                position: 'relative',
                            }}
                        >
                            {isIndeterminate ? (
                                <Box
                                    sx={{
                                        width: '35%',
                                        height: '100%',
                                        borderRadius: 5,
                                        bgcolor: 'secondary.main',
                                        position: 'absolute',
                                        animation: 'loading-slide 1.4s ease-in-out infinite',
                                        '@keyframes loading-slide': {
                                            '0%': {left: '-35%'},
                                            '100%': {left: '100%'},
                                        },
                                    }}
                                />
                            ) : (
                                <Box
                                    sx={{
                                        width: `${pct ?? 0}%`,
                                        height: '100%',
                                        borderRadius: 5,
                                        bgcolor: 'secondary.main',
                                        transition: 'width 0.4s ease',
                                    }}
                                />
                            )}
                        </Box>

                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{mt: 0.5, display: 'block', textAlign: 'center'}}
                        >
                            {isIndeterminate
                                ? `Preparing model... ${loadingElapsedSeconds}s`
                                : pct !== null
                                    ? `${pct}%`
                                    : 'Starting...'}
                        </Typography>
                    </Box>
                )}
            </Box>
        );
    }
    // ── main render ───────────────────────────────────────────────────────────
    return (
        <Box display='flex' flexDirection='column' overflow='hidden'>
            <Box display='flex' flexDirection='column' alignItems='left' margin={4}>

                {/* title row */}
                <Box sx={{display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center'}}>
                    <Typography variant='h4' gutterBottom>Results</Typography>

                    <Tooltip title="Download all results as JSON">
                        <IconButton onClick={downloadJson}><FaDownload/></IconButton>
                    </Tooltip>
                    <Tooltip title="Download all tables as combined CSV">
                        <IconButton onClick={downloadAllCsv}><FaFileCsv/></IconButton>
                    </Tooltip>

                    <Chip
                        label={`${protocoreGroups.length} reference protocore${protocoreGroups.length !== 1 ? 's' : ''}`}
                        size="small"
                        color="secondary"
                        variant="outlined"
                    />
                    {hasParas && (
                        <Chip label="+ PARAS predictions" size="small" color="secondary" variant="outlined"/>
                    )}
                </Box>

                {/* job ID */}
                <Typography variant='body1' gutterBottom>
                    <IconButton onClick={() => {
                        navigator.clipboard.writeText(jobId);
                        toast.success('Copied the job ID to clipboard!');
                    }}>
                        <FaCopy size={15} style={{paddingBottom: '3px'}}/>
                    </IconButton>
                    {`Job ID: ${jobId}`}
                </Typography>
                <Divider/>

                <Box sx={{mt: 2, mb: 2}}>
                    <Typography variant='body1' gutterBottom>
                        You can download all results as a JSON file or as a combined CSV using the buttons above.
                        Each reference protocore has its own table below — use the per-table CSV button to download
                        results for a single protocore.
                    </Typography>
                    <Typography variant='body1' gutterBottom>
                        You can use the job ID to retrieve the results at a later time. All jobs are
                        automatically deleted after 7 days.
                    </Typography>
                </Box>
            </Box>

            {/* ── one table per reference protocore ── */}
            <Box sx={{px: 4, pb: 4}}>
                {protocoreGroups.map(({id, rows}, i) => (
                    <ProtocoreTable
                        key={id}
                        protocoreId={id}
                        rows={rows}
                        hasParas={hasParas}
                        protocoreFiles={protocoreFiles}
                        jobId={jobId}
                        index={i}
                    />
                ))}

                {protocoreGroups.length === 0 && (
                    <Box sx={{textAlign: 'center', py: 8, color: 'text.disabled', fontStyle: 'italic'}}>
                        No protocore results returned from the server.
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default ResultsTTE;
