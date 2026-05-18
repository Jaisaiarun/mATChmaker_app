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

// ─── constants ────────────────────────────────────────────────────────────────

const FEATURE_TYPES = ['XUT', 'XU'];

const TYPE_META = {
    XUT: {label: 'XUT_mATChmaker', color: 'secondary', accent: '#4F8F8B'},
    XU: {label: 'XU_mATChmaker', color: 'primary', accent: '#C9A24D'},
};

// ─── helpers ──────────────────────────────────────────────────────────────────

const lengthColor = (len) =>
    len >= 300 ? 'green' : len >= 150 ? 'orange' : 'text.primary';

// ─── per-type table ───────────────────────────────────────────────────────────

const FeatureTable = ({featureType, rows, jobId, annotatedFile}) => {
    const meta = TYPE_META[featureType];

    // ── sort ──────────────────────────────────────────────────────────────────
    const [sortField, setSortField] = useState('module_position');
    const [sortDirection, setSortDirection] = useState('asc');

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // ── filters ───────────────────────────────────────────────────────────────
    const [showRecordFilter, setShowRecordFilter] = useState(false);
    const [showLabelFilter, setShowLabelFilter] = useState(false);
    const [expandedSeqs, setExpandedSeqs] = useState(new Set());
    const [collapsed, setCollapsed] = useState(false);

    const uniqueRecords = useMemo(() => [...new Set(rows.map(r => r.record))].sort(), [rows]);
    const uniqueLabels = useMemo(() => [...new Set(rows.map(r => r.label))].sort(), [rows]);

    const [selectedRecords, setSelectedRecords] = useState(new Set());
    const [selectedLabels, setSelectedLabels] = useState(new Set());

    useEffect(() => setSelectedRecords(new Set(uniqueRecords)), [uniqueRecords.join(',')]); // eslint-disable-line
    useEffect(() => setSelectedLabels(new Set(uniqueLabels)), [uniqueLabels.join(',')]);  // eslint-disable-line

    // ── filtered + sorted ─────────────────────────────────────────────────────
    const displayed = useMemo(() => {
        const filtered = rows.filter(r =>
            selectedRecords.has(r.record) && selectedLabels.has(r.label)
        );

        return [...filtered].sort((a, b) => {
            let aV = a[sortField];
            let bV = b[sortField];
            if (typeof aV === 'string') aV = aV.toLowerCase();
            if (typeof bV === 'string') bV = bV.toLowerCase();
            if (aV < bV) return sortDirection === 'asc' ? -1 : 1;
            if (aV > bV) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rows, selectedRecords, selectedLabels, sortField, sortDirection]);

    // ── CSV download ──────────────────────────────────────────────────────────
    const downloadCsv = () => {
        const headers = ['Type', 'Record', 'Module Position', 'Label', 'Start', 'End', 'Length (aa)', 'Sequence'];
        const csvRows = displayed.map(r => [
            featureType, r.record, r.module_position, r.label,
            r.start, r.end, r.length, r.sequence || '',
        ]);
        const csv = [headers, ...csvRows]
            .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${featureType.toLowerCase()}_results.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const SortHeader = ({field, label, align = 'left'}) => (
        <TableCell align={align}>
            <TableSortLabel
                active={sortField === field}
                direction={sortField === field ? sortDirection : 'asc'}
                onClick={() => handleSort(field)}
            >
                <strong>{label}</strong>
            </TableSortLabel>
        </TableCell>
    );

    return (
        <Paper sx={{mb: 3, borderRadius: 2, boxShadow: 2, overflow: 'hidden'}}>

            {/* ── header bar ── */}
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2, py: 1.25,
                borderLeft: `4px solid ${meta.accent}`,
                backgroundColor: 'background.default',
                borderBottom: '1px solid', borderColor: 'divider',
            }}>
                <Chip
                    label={meta.label}
                    size="small"
                    color={meta.color}
                    variant="outlined"
                    sx={{fontWeight: 600, fontFamily: 'monospace', fontSize: 12}}
                />
                <Box sx={{flex: 1}}>
                    <Typography variant="caption" color="text.secondary">
                        {rows.length} fragment{rows.length !== 1 ? 's' : ''}
                        {displayed.length !== rows.length && ` (${displayed.length} shown)`}
                        {' · '}{uniqueRecords.length} record{uniqueRecords.length !== 1 ? 's' : ''}
                    </Typography>
                </Box>

                <Tooltip title="Download this table as CSV">
                    <IconButton size="small" onClick={downloadCsv}><FaFileCsv/></IconButton>
                </Tooltip>
                <Tooltip title={collapsed ? 'Expand' : 'Collapse'}>
                    <IconButton size="small" onClick={() => setCollapsed(p => !p)}>
                        {collapsed ? <KeyboardArrowDownIcon/> : <KeyboardArrowUpIcon/>}
                    </IconButton>
                </Tooltip>
            </Box>

            <Collapse in={!collapsed}>
                <Box sx={{p: 2}}>

                    {/* ── filters ── */}
                    <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2}}>

                        {/* record filter */}
                        {uniqueRecords.length > 1 && (
                            <Box>
                                <Button
                                    variant="outlined" size="small" startIcon={<FaFilter/>}
                                    onClick={() => setShowRecordFilter(p => !p)}
                                    color={meta.color}
                                >
                                    Records ({selectedRecords.size}/{uniqueRecords.length})
                                </Button>
                                <Collapse in={showRecordFilter}>
                                    <Paper sx={{p: 1.5, mt: 1}} variant="outlined">
                                        <Box sx={{display: 'flex', gap: 1, mb: 1}}>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedRecords(new Set(uniqueRecords))}>
                                                Select all
                                            </Button>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedRecords(new Set())}>
                                                Clear all
                                            </Button>
                                        </Box>
                                        <FormGroup row sx={{gap: 0.5}}>
                                            {uniqueRecords.map(rec => (
                                                <FormControlLabel key={rec}
                                                                  control={
                                                                      <Checkbox size="small"
                                                                                checked={selectedRecords.has(rec)}
                                                                                onChange={() => setSelectedRecords(prev => {
                                                                                    const n = new Set(prev);
                                                                                    n.has(rec) ? n.delete(rec) : n.add(rec);
                                                                                    return n;
                                                                                })}
                                                                      />
                                                                  }
                                                                  label={
                                                                      <Chip label={rec} size="small"
                                                                            variant={selectedRecords.has(rec) ? 'filled' : 'outlined'}
                                                                            color={selectedRecords.has(rec) ? meta.color : 'default'}
                                                                            sx={{fontFamily: 'monospace', fontSize: 11}}
                                                                      />
                                                                  }
                                                />
                                            ))}
                                        </FormGroup>
                                    </Paper>
                                </Collapse>
                            </Box>
                        )}

                        {/* label filter */}
                        {uniqueLabels.length > 1 && (
                            <Box>
                                <Button
                                    variant="outlined" size="small" startIcon={<FaFilter/>}
                                    onClick={() => setShowLabelFilter(p => !p)}
                                >
                                    Labels ({selectedLabels.size}/{uniqueLabels.length})
                                </Button>
                                <Collapse in={showLabelFilter}>
                                    <Paper sx={{p: 1.5, mt: 1}} variant="outlined">
                                        <Box sx={{display: 'flex', gap: 1, mb: 1}}>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedLabels(new Set(uniqueLabels))}>
                                                Select all
                                            </Button>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedLabels(new Set())}>
                                                Clear all
                                            </Button>
                                        </Box>
                                        <FormGroup row sx={{gap: 0.5}}>
                                            {uniqueLabels.map(lbl => (
                                                <FormControlLabel key={lbl}
                                                                  control={
                                                                      <Checkbox size="small"
                                                                                checked={selectedLabels.has(lbl)}
                                                                                onChange={() => setSelectedLabels(prev => {
                                                                                    const n = new Set(prev);
                                                                                    n.has(lbl) ? n.delete(lbl) : n.add(lbl);
                                                                                    return n;
                                                                                })}
                                                                      />
                                                                  }
                                                                  label={
                                                                      <Chip label={lbl} size="small"
                                                                            variant={selectedLabels.has(lbl) ? 'filled' : 'outlined'}
                                                                            color={selectedLabels.has(lbl) ? 'default' : 'default'}
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
                    <TableContainer sx={{
                        maxHeight: 500,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                    }}>
                        <Table stickyHeader size="small" sx={{minWidth: 900}}>
                            <TableHead>
                                <TableRow>
                                    <SortHeader field="module_position" label="#" align="center"/>
                                    <SortHeader field="record" label="Record"/>
                                    <SortHeader field="label" label="Label"/>
                                    <SortHeader field="start" label="Start" align="center"/>
                                    <SortHeader field="end" label="End" align="center"/>
                                    <SortHeader field="length" label="Length (aa)" align="center"/>
                                    <TableCell><strong>Sequence</strong></TableCell>
                                </TableRow>
                            </TableHead>

                            <TableBody>
                                {displayed.map((r, idx) => {
                                    const seqKey = `${featureType}-${idx}`;
                                    const expanded = expandedSeqs.has(seqKey);

                                    return (
                                        <TableRow key={seqKey} hover>
                                            <TableCell align="center" sx={{
                                                fontWeight: 600,
                                                color: 'text.secondary',
                                                fontSize: '0.8rem',
                                            }}>
                                                {r.module_position}
                                            </TableCell>

                                            <TableCell sx={{
                                                fontFamily: 'monospace',
                                                fontSize: '0.75rem',
                                                maxWidth: 200,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                <Tooltip title={r.record} placement="top">
                                                    <span>{r.record}</span>
                                                </Tooltip>
                                            </TableCell>

                                            <TableCell>
                                                <Chip
                                                    label={r.label}
                                                    size="small"
                                                    color={meta.color}
                                                    variant="outlined"
                                                />
                                            </TableCell>

                                            <TableCell align="center" sx={{fontSize: '0.8rem'}}>
                                                {r.start.toLocaleString()}
                                            </TableCell>
                                            <TableCell align="center" sx={{fontSize: '0.8rem'}}>
                                                {r.end.toLocaleString()}
                                            </TableCell>

                                            <TableCell align="center" sx={{
                                                fontWeight: 700,
                                                color: lengthColor(r.length),
                                            }}>
                                                {r.length}
                                            </TableCell>

                                            {/* sequence — click to expand */}
                                            <TableCell
                                                onClick={() => setExpandedSeqs(prev => {
                                                    const n = new Set(prev);
                                                    n.has(seqKey) ? n.delete(seqKey) : n.add(seqKey);
                                                    return n;
                                                })}
                                                title={expanded ? 'Click to collapse' : 'Click to expand full sequence'}
                                                sx={{
                                                    maxWidth: expanded ? 500 : 180,
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.72rem',
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
                                                    ? r.sequence
                                                    : `${(r.sequence || '').slice(0, 30)}${(r.sequence || '').length > 30 ? '…' : ''}`}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}

                                {displayed.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center"
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
                    </Typography>
                </Box>
            </Collapse>
        </Paper>
    );
};

// ─── main page ────────────────────────────────────────────────────────────────

const ResultsXuXut = () => {
    const {jobId} = useParams();
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [annotatedFile, setAnnotatedFile] = useState(null);
    const [progress, setProgress] = useState(null);

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
                    if (payload.annotated_file) setAnnotatedFile(payload.annotated_file);
                    if (payload.progress) setProgress(payload.progress);
                    setResults(payload.results || []);
                    setIsLoading(false);
                    clearInterval(intervalId);

                } else if (data.status === 'pending') {
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

    // ── split results by type ─────────────────────────────────────────────────
    const rowsByType = useMemo(() => {
        if (!results) return {};
        const map = {};
        FEATURE_TYPES.forEach(t => {
            map[t] = results.filter(r => r.type === t);
        });
        return map;
    }, [results]);

    // ── summary stats ─────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        if (!results) return null;
        const totalFragments = results.length;
        const uniqueRecords = new Set(results.map(r => r.record)).size;
        const avgLen = results.length
            ? Math.round(results.reduce((s, r) => s + r.length, 0) / results.length)
            : 0;
        return {totalFragments, uniqueRecords, avgLen};
    }, [results]);

    // ── download all as CSV ───────────────────────────────────────────────────
    const downloadAllCsv = () => {
        const headers = ['Type', 'Record', 'Module Position', 'Label', 'Start', 'End', 'Length (aa)', 'Sequence'];
        const csvRows = (results || []).map(r => [
            r.type, r.record, r.module_position, r.label,
            r.start, r.end, r.length, r.sequence || '',
        ]);
        const csv = [headers, ...csvRows]
            .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'xu_xut_results.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadJson = () => {
        const blob = new Blob(
            [JSON.stringify({jobType: 'xu_xut_annotation', results}, null, 2)],
            {type: 'application/json'}
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'xu_xut_results.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── loading screen ────────────────────────────────────────────────────────
    if (isLoading) {
        const pct = progress?.total > 0
            ? Math.round((progress.current / progress.total) * 100)
            : null;

        const loadingMessage = (() => {
            if (!progress) return 'Starting...';
            const phase = progress.phase;
            if (phase === 'parsing') return 'Parsing GenBank file...';
            if (phase === 'annotating') return `Annotating ${progress.message || ''}...`;
            if (phase === 'saving') return 'Writing annotated GenBank file...';
            return 'Processing...';
        })();

        const loadingDetail = (() => {
            if (!progress || progress.total === 0) return null;
            if (progress.phase === 'annotating')
                return `Record group ${progress.current} of ${progress.total}`;
            return null;
        })();

        return (
            <Box display='flex' flexDirection='column' justifyContent='center'
                 alignItems='center' minHeight='90vh' gap={2} padding={4}>
                <Loading frame1='Logo_trans_1.png' frame2='Logo_trans_2.png'/>
                <Typography variant='h6' color='text.secondary'>{loadingMessage}</Typography>
                {loadingDetail && (
                    <Typography variant='body2' color='text.secondary'>{loadingDetail}</Typography>
                )}
                {progress?.phase === 'annotating' && (
                    <Box sx={{width: '100%', maxWidth: 400}}>
                        <Box sx={{
                            width: '100%', height: 10, borderRadius: 5,
                            bgcolor: 'divider', overflow: 'hidden',
                        }}>
                            <Box sx={{
                                width: `${pct ?? 0}%`, height: '100%',
                                borderRadius: 5, bgcolor: 'secondary.main',
                                transition: 'width 0.4s ease',
                            }}/>
                        </Box>
                        <Typography variant='caption' color='text.secondary'
                                    sx={{mt: 0.5, display: 'block', textAlign: 'center'}}>
                            {pct !== null ? `${pct}%` : 'Starting...'}
                        </Typography>
                    </Box>
                )}
            </Box>
        );
    }

    if (!results) {
        return (
            <Box display='flex' justifyContent='center' alignItems='center' minHeight='80vh'>
                <p>No results found for job ID {jobId}</p>
            </Box>
        );
    }

    // ── main render ───────────────────────────────────────────────────────────
    return (
        <Box display='flex' flexDirection='column' overflow='hidden'>
            <Box display='flex' flexDirection='column' alignItems='left' margin={4}>

                {/* ── title row ── */}
                <Box sx={{display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center'}}>
                    <Typography variant='h4' gutterBottom>Results</Typography>

                    <Tooltip title="Download all results as JSON">
                        <IconButton onClick={downloadJson}><FaDownload/></IconButton>
                    </Tooltip>
                    <Tooltip title="Download all results as CSV">
                        <IconButton onClick={downloadAllCsv}><FaFileCsv/></IconButton>
                    </Tooltip>
                </Box>

                {/* ── job ID ── */}
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

                {/* ── summary stats ── */}
                {stats && (
                    <Box sx={{
                        display: 'flex', gap: 3, flexWrap: 'wrap',
                        mt: 3, mb: 1,
                    }}>
                        {[
                            ['Total fragments', stats.totalFragments],
                            ['Records', stats.uniqueRecords],
                            ['Avg length (aa)', stats.avgLen],
                            ['XUT fragments', rowsByType.XUT?.length ?? 0],
                            ['XU fragments', rowsByType.XU?.length ?? 0],
                        ].map(([label, value]) => (
                            <Box key={label} sx={{
                                textAlign: 'center',
                                px: 2.5, py: 1.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                minWidth: 110,
                            }}>
                                <Typography variant='h5' sx={{fontWeight: 700}}>{value}</Typography>
                                <Typography variant='caption' color='text.secondary'>{label}</Typography>
                            </Box>
                        ))}
                    </Box>
                )}

                <Box sx={{mt: 2, mb: 3}}>
                    {annotatedFile && (
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 1.5}}>
                            <Typography variant="body1">Annotated GenBank file ready:</Typography>
                            <Button
                                variant="outlined" size="small" startIcon={<FaDownload/>}
                                onClick={() => window.open(
                                    `/api/download_file/${jobId}/${encodeURIComponent(annotatedFile)}`,
                                    '_blank'
                                )}
                            >
                                {annotatedFile}
                            </Button>
                        </Box>
                    )}
                    <Typography variant='body2' color='text.secondary'>
                        Use the job ID to retrieve these results later. All jobs are deleted after 7 days.
                    </Typography>
                </Box>
            </Box>

            {/* ── one table per feature type ── */}
            <Box sx={{px: 4, pb: 4}}>
                {FEATURE_TYPES.map(t => {
                    const typeRows = rowsByType[t] || [];
                    if (typeRows.length === 0) return null;
                    return (
                        <FeatureTable
                            key={t}
                            featureType={t}
                            rows={typeRows}
                            jobId={jobId}
                            annotatedFile={annotatedFile}
                        />
                    );
                })}

                {results.length === 0 && (
                    <Box sx={{textAlign: 'center', py: 8, color: 'text.disabled', fontStyle: 'italic'}}>
                        No XUT or XU fragments were found in the uploaded file.
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default ResultsXuXut;