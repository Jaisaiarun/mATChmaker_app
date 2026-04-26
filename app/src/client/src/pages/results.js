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
    Typography
} from '@mui/material';
import {FaCopy, FaDownload, FaFilter} from 'react-icons/fa';
import {FaFileCsv} from 'react-icons/fa6';

import Loading from '../components/Loading';
import ResultTile from '../components/ResultTile';

const Results = () => {
    const {jobId} = useParams();
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [jobType, setJobType] = useState('paras');
    const [sortDirection, setSortDirection] = useState('desc');
    const [selectedMonomers, setSelectedMonomers] = useState(new Set());
    const [monomerFilterInitialized, setMonomerFilterInitialized] = useState(false);
    const [showMonomerFilter, setShowMonomerFilter] = useState(false);
    const [annotatedFile, setAnnotatedFile] = useState(null);
    const [progress, setProgress] = useState(null);
    const [nowTs, setNowTs] = useState(Date.now());
    const [protocoreFiles, setProtocoreFiles] = useState({});
    const [expandedSeqs, setExpandedSeqs] = useState(new Set());

    // live clock for elapsed loading time
    useEffect(() => {
        if (!isLoading || jobType !== 'paras_annotation') return;
        const timer = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [isLoading, jobType]);

    // ── Poll for results ──────────────────────────────────────────────────
    useEffect(() => {
        let intervalId;

        const fetchResult = async () => {
            try {
                const response = await fetch(`/api/retrieve/${jobId}`);
                if (!response.ok) throw new Error('failed to fetch results');

                const data = await response.json();

                if (data.status === 'success') {
                    const payload = data.payload || {};
                    const rawResults = payload.results || [];
                    const resolvedJobType = payload.job_type || 'paras';
                    setJobType(resolvedJobType);

                    if (payload.protocore_files) setProtocoreFiles(payload.protocore_files || {});

                    if (resolvedJobType === 'paras') {
                        rawResults.forEach(result => {
                            result.predictions?.sort((a, b) => b.probability - a.probability);
                            result.predictions?.forEach(pred => {
                                pred.probability = Number(pred.probability).toFixed(3);
                            });
                        });
                    }

                    if (payload.annotated_file) setAnnotatedFile(payload.annotated_file);
                    if (payload.progress) setProgress(payload.progress);

                    setResults(rawResults);
                    setIsLoading(false);
                    clearInterval(intervalId);

                } else if (data.status === 'pending') {
                    if (data.payload?.job_type) setJobType(data.payload.job_type);
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
                        If you feel this is an error, or if you need assistance, please contact the developers in GitHub
                        issues by selecting 'Report an issue' in the app bar at the top left of this page and posting
                        your issue or question.
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

    // ── Monomer filter init ───────────────────────────────────────────────
    useEffect(() => {
        if (results && jobType === 'tte' && !monomerFilterInitialized) {
            const allMonomers = new Set();
            results.forEach(r => {
                if (r.monomer_pairs) {
                    r.monomer_pairs.split(' | ').forEach(m => {
                        const trimmed = m.trim();
                        if (trimmed) allMonomers.add(trimmed);
                    });
                }
            });
            setSelectedMonomers(allMonomers);
            setMonomerFilterInitialized(true);
        }
    }, [results, jobType, monomerFilterInitialized]);

    // ── ALL hooks before early returns ────────────────────────────────────

    const uniqueMonomers = useMemo(() => {
        if (!results || jobType !== 'tte') return [];
        const monomers = new Set();
        results.forEach(r => {
            if (r.monomer_pairs) {
                r.monomer_pairs.split(' | ').forEach(m => {
                    const trimmed = m.trim();
                    if (trimmed) monomers.add(trimmed);
                });
            }
        });
        return Array.from(monomers).sort();
    }, [results, jobType]);

    const filteredAndSortedResults = useMemo(() => {
        if (!results || jobType !== 'tte') return results || [];

        let filtered = results.filter(r => {
            if (!r.monomer_pairs || r.monomer_pairs.trim() === '') return true;
            const rowMonomers = r.monomer_pairs.split(' | ').map(m => m.trim());
            return rowMonomers.some(m => selectedMonomers.has(m));
        });

        filtered = [...filtered].sort((a, b) => {
            const aIsRef = a.similarity === 'reference';
            const bIsRef = b.similarity === 'reference';
            if (aIsRef && !bIsRef) return -1;
            if (!aIsRef && bIsRef) return 1;
            if (aIsRef && bIsRef) return 0;
            const aVal = typeof a.similarity === 'number' ? a.similarity : -1;
            const bVal = typeof b.similarity === 'number' ? b.similarity : -1;
            return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
        });

        return filtered;
    }, [results, jobType, selectedMonomers, sortDirection]);

    const groupedAnnotationResults = useMemo(() => {
        if (!results || jobType !== 'paras_annotation') return [];

        const groups = {};
        results.forEach(r => {
            if (!groups[r.domain_id]) groups[r.domain_id] = [];
            groups[r.domain_id].push(r);
        });

        return Object.entries(groups)
            .map(([domain_id, rows]) => {
                const sorted = [...rows].sort((a, b) =>
                    sortDirection === 'desc' ? b.score - a.score : a.score - b.score
                );
                return {domain_id, rows: sorted, topScore: sorted[0]?.score ?? -1};
            })
            .sort((a, b) =>
                sortDirection === 'desc'
                    ? b.topScore - a.topScore
                    : a.topScore - b.topScore
            );
    }, [results, jobType, sortDirection]);

    // protocoreFiles is a dict: "<clean_stem>::<region_id>" → filename
    // e.g. { "myfile::proto_core_1": "myfile_proto_core_1.gbk", ... }
    // No transformation needed — used directly as a lookup.
    const protocoreHasAny = useMemo(
        () => Object.keys(protocoreFiles).length > 0,
        [protocoreFiles]
    );

    const loadingElapsedSeconds = useMemo(() => {
        if (!progress?.started_at) return 0;
        return Math.max(0, Math.floor((nowTs - progress.started_at * 1000) / 1000));
    }, [progress, nowTs]);

    // ── Download helpers ──────────────────────────────────────────────────

    const downloadTteCsv = () => {
        const headers = ['File', 'File Locus', 'Region ID', 'Monomer Pairs',
            'CDS Locus Tag', 'TTE Length', 'Similarity', 'TTE Sequence'];
        const rows = filteredAndSortedResults.map(r => {
            const cleanFileName = r.file.replace(/^[a-f0-9-]+_(?:[A-Z]+(?:_\d+)?)_/, '');
            const similarity = r.similarity === 'reference'
                ? 'reference'
                : typeof r.similarity === 'number' ? r.similarity.toFixed(2) : '';
            return [cleanFileName, r.file_locus || '', r.region_id || '',
                r.monomer_pairs || '', r.CDS_locus_tag || '', r.tte_len || '',
                similarity, r.tte_seq || ''];
        });
        const csv = [headers, ...rows]
            .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tte_results.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadAnnotationCsv = () => {
        const headers = ['Domain ID', 'Locus Tag', 'Existing Substrate',
            'Substrate', 'Substrate Code', 'Score (%)'];
        const rows = (results || []).map(r => [
            r.domain_id || '',
            r.locus_tag || '',
            r.existing_specificity || '',
            r.substrate || '',
            r.substrate_3letter || '',
            (r.score * 100).toFixed(1),
        ]);
        const csv = [headers, ...rows]
            .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'paras_annotation.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleMonomerToggle = (monomer) => {
        setSelectedMonomers(prev => {
            const next = new Set(prev);
            if (next.has(monomer)) next.delete(monomer);
            else next.add(monomer);
            return next;
        });
    };
    const handleSelectAllMonomers = () => setSelectedMonomers(new Set(uniqueMonomers));
    const handleClearAllMonomers = () => setSelectedMonomers(new Set());

    // ── Early returns ─────────────────────────────────────────────────────

    if (isLoading) {
        const pct = progress?.total > 0
            ? Math.round((progress.current / progress.total) * 100)
            : null;

        return (
            <Box display='flex' flexDirection='column' justifyContent='center'
                alignItems='center' minHeight='90vh' gap={2} padding={4}>

                <Loading frame1='Logo_trans_1.png' frame2='Logo_trans_2.png'/>

                <Typography variant='h6' color='text.secondary'>
                    {jobType !== 'paras_annotation' && 'Making predictions...'}
                    {jobType === 'paras_annotation' && !progress && 'Starting...'}
                    {jobType === 'paras_annotation' && progress?.phase === 'loading_model' && 'Loading PARAS model...'}
                    {jobType === 'paras_annotation' && progress?.phase === 'running' && 'Running PARAS predictions...'}
                    {jobType === 'paras_annotation' && progress?.phase === 'saving' && 'Saving annotated GenBank file...'}
                </Typography>

                {jobType === 'paras_annotation' && progress?.phase === 'running' && (
                    <Typography variant='body2' color='text.secondary'>
                        Domain {progress.current} of {progress.total}: {progress.current_domain}
                    </Typography>
                )}

                {jobType === 'paras_annotation' && (
                    <Box sx={{width: '100%', maxWidth: 400}}>
                        <Box sx={{
                            width: '100%', height: 10,
                            borderRadius: 5, bgcolor: 'divider',
                            overflow: 'hidden', position: 'relative',
                        }}>
                            {progress?.phase === 'loading_model' ? (
                                <Box sx={{
                                    width: '35%', height: '100%',
                                    borderRadius: 5, bgcolor: 'secondary.main',
                                    position: 'absolute',
                                    animation: 'loading-slide 1.4s ease-in-out infinite',
                                    '@keyframes loading-slide': {
                                        '0%': {left: '-35%'},
                                        '100%': {left: '100%'},
                                    },
                                }}/>
                            ) : (
                                <Box sx={{
                                    width: `${pct ?? 0}%`, height: '100%',
                                    borderRadius: 5, bgcolor: 'secondary.main',
                                    transition: 'width 0.4s ease',
                                }}/>
                            )}
                        </Box>
                        <Typography variant='caption' color='text.secondary'
                            sx={{mt: 0.5, display: 'block', textAlign: 'center'}}>
                            {progress?.phase === 'loading_model'
                                ? `Preparing model... ${loadingElapsedSeconds}s`
                                : pct !== null ? `${pct}%` : 'Starting...'}
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

    // ── Main render ───────────────────────────────────────────────────────
    return (
        <Box display='flex' flexDirection='column' overflow='hidden'>
            <Box display='flex' flexDirection='column' alignItems='left' margin={4}>

                <Box sx={{display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center'}}>
                    <Typography variant='h4' gutterBottom>Results</Typography>

                    <Tooltip title="Download as JSON">
                        <IconButton onClick={() => {
                            const blob = new Blob(
                                [JSON.stringify({jobType, results}, null, 2)],
                                {type: 'application/json'}
                            );
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'results.json';
                            a.click();
                            URL.revokeObjectURL(url);
                        }}>
                            <FaDownload/>
                        </IconButton>
                    </Tooltip>

                    {jobType === 'tte' && (
                        <Tooltip title="Download table as CSV">
                            <IconButton onClick={downloadTteCsv}><FaFileCsv/></IconButton>
                        </Tooltip>
                    )}

                    {jobType === 'paras_annotation' && (
                        <Tooltip title="Download predictions as CSV">
                            <IconButton onClick={downloadAnnotationCsv}><FaFileCsv/></IconButton>
                        </Tooltip>
                    )}
                </Box>

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

                <Box sx={{mt: 4}}>
                    <Typography variant='body1' gutterBottom>
                        You can download the results as a JSON file using the download button above.
                    </Typography>
                    <Typography variant='body1' gutterBottom>
                        You can use the job ID to retrieve the results at a later time. All jobs are
                        automatically deleted after 7 days.
                    </Typography>
                </Box>
            </Box>

            <Box sx={{
                overflowY: 'auto', overflowX: 'auto',
                backgroundColor: 'white.main',
                display: 'flex', gap: '20px',
                paddingLeft: '30px', paddingRight: '30px', paddingBottom: '20px',
                '&::-webkit-scrollbar': {display: 'block'},
                '&::-webkit-scrollbar-thumb': {backgroundColor: '#ceccca', borderRadius: '10px'},
            }}>

                {/* ── PARAS card tiles ── */}
                {jobType === 'paras' && results.map((result, index) => (
                    <ResultTile key={index} result={result}/>
                ))}

                {/* ── PARAS annotation table ── */}
                {jobType === 'paras_annotation' && (
                    <Box sx={{width: '100%'}}>
                        {annotatedFile && (
                            <Box sx={{mb: 3, display: 'flex', alignItems: 'center', gap: 2}}>
                                <Typography variant="body1">Annotated GenBank file ready:</Typography>
                                <Button
                                    variant="outlined" size="small"
                                    startIcon={<FaDownload/>}
                                    onClick={() => window.open(
                                        `/api/download_file/${jobId}/${encodeURIComponent(annotatedFile)}`,
                                        '_blank'
                                    )}
                                >
                                    {annotatedFile}
                                </Button>
                            </Box>
                        )}

                        <TableContainer component={Paper} sx={{borderRadius: 2, boxShadow: 2}}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell><strong>Domain ID</strong></TableCell>
                                        <TableCell><strong>Existing Substrate</strong></TableCell>
                                        <TableCell><strong>Substrate</strong></TableCell>
                                        <TableCell><strong>Code</strong></TableCell>
                                        <TableCell align="right">
                                            <TableSortLabel
                                                active={true}
                                                direction={sortDirection}
                                                onClick={() => setSortDirection(prev =>
                                                    prev === 'desc' ? 'asc' : 'desc'
                                                )}
                                            >
                                                <strong>Score</strong>
                                            </TableSortLabel>
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {groupedAnnotationResults.map((group) => (
                                        <React.Fragment key={group.domain_id}>
                                            <TableRow sx={{backgroundColor: 'background.default'}}>
                                                <TableCell colSpan={5}
                                                    sx={{fontWeight: 'bold', color: 'text.secondary'}}>
                                                    {group.domain_id}
                                                </TableCell>
                                            </TableRow>
                                            {group.rows.map((row, idx) => (
                                                <TableRow
                                                    key={`${group.domain_id}-${row.substrate_3letter}-${idx}`}
                                                    hover>
                                                    <TableCell sx={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.78rem',
                                                        color: 'text.secondary',
                                                    }}>
                                                        {row.domain_id}
                                                    </TableCell>
                                                    <TableCell>{row.existing_specificity || '–'}</TableCell>
                                                    <TableCell>{row.substrate}</TableCell>
                                                    <TableCell>
                                                        <Chip label={row.substrate_3letter} size="small" variant="outlined"/>
                                                    </TableCell>
                                                    <TableCell align="right" sx={{
                                                        fontWeight: 'bold',
                                                        color: row.score >= 0.8 ? 'green'
                                                            : row.score >= 0.5 ? 'orange' : 'red',
                                                    }}>
                                                        {(row.score * 100).toFixed(1)} %
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}

                {/* ── TTE table ── */}
                {jobType === 'tte' && (
                    <Box sx={{width: '100%'}}>

                        {/* Monomer filter */}
                        {uniqueMonomers.length > 0 && (
                            <Box sx={{mb: 2}}>
                                <Button
                                    variant="outlined" size="small"
                                    startIcon={<FaFilter/>}
                                    onClick={() => setShowMonomerFilter(prev => !prev)}
                                    sx={{mb: 1}}
                                >
                                    Filter Monomer Pairings ({selectedMonomers.size}/{uniqueMonomers.length})
                                </Button>
                                <Collapse in={showMonomerFilter}>
                                    <Paper sx={{p: 2, mb: 2}}>
                                        <Box sx={{display: 'flex', gap: 1, mb: 1}}>
                                            <Button size="small" variant="text" onClick={handleSelectAllMonomers}>
                                                Select All
                                            </Button>
                                            <Button size="small" variant="text" onClick={handleClearAllMonomers}>
                                                Clear All
                                            </Button>
                                        </Box>
                                        <FormGroup row sx={{gap: 0.5}}>
                                            {uniqueMonomers.map(monomer => (
                                                <FormControlLabel
                                                    key={monomer}
                                                    control={
                                                        <Checkbox
                                                            checked={selectedMonomers.has(monomer)}
                                                            onChange={() => handleMonomerToggle(monomer)}
                                                            size="small"
                                                        />
                                                    }
                                                    label={
                                                        <Chip
                                                            label={monomer} size="small"
                                                            variant={selectedMonomers.has(monomer) ? 'filled' : 'outlined'}
                                                            color={selectedMonomers.has(monomer) ? 'secondary' : 'default'}
                                                        />
                                                    }
                                                />
                                            ))}
                                        </FormGroup>
                                    </Paper>
                                </Collapse>
                            </Box>
                        )}

                        <Typography variant="body2" sx={{mb: 1}} color="text.secondary">
                            Showing {filteredAndSortedResults.length} of {results.length} results
                        </Typography>

                        <TableContainer
                            component={Paper}
                            sx={{minWidth: 1200, maxHeight: 600, borderRadius: 2, boxShadow: 2}}
                        >
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell><strong>File</strong></TableCell>
                                        <TableCell><strong>File Locus</strong></TableCell>
                                        <TableCell><strong>Region ID</strong></TableCell>
                                        <TableCell><strong>Monomer Pairs</strong></TableCell>
                                        <TableCell><strong>CDS Locus Tag</strong></TableCell>
                                        <TableCell><strong>TTE Length</strong></TableCell>
                                        <TableCell align="center">
                                            <TableSortLabel
                                                active={true}
                                                direction={sortDirection}
                                                onClick={() => setSortDirection(prev =>
                                                    prev === 'desc' ? 'asc' : 'desc'
                                                )}
                                            >
                                                <strong>Similarity</strong>
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell><strong>TTE Sequence</strong></TableCell>
                                        {/* Only render this column header if there are protocore files */}
                                        {protocoreHasAny && (
                                            <TableCell align="center">
                                                <strong>Protocore .gbk</strong>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                </TableHead>

                                <TableBody>
                                    {filteredAndSortedResults.map((r, index) => {
                                        // Strip UUID prefix to get clean filename
                                        const cleanFileName = r.file.replace(
                                            /^[a-f0-9-]+_(?:[A-Z]+(?:_\d+)?)_/, ''
                                        );
                                        // Strip extension to get stem, build lookup key
                                        const fileStem = cleanFileName.replace(/\.(gb|gbk)$/i, '');
                                        const lookupKey = `${fileStem}::${r.region_id}`;
                                        const protocoreFname = protocoreFiles[lookupKey] || null;

                                        return (
                                            <TableRow key={index} hover>
                                                <TableCell>{cleanFileName}</TableCell>
                                                <TableCell>{r.file_locus}</TableCell>
                                                <TableCell>{r.region_id}</TableCell>
                                                <TableCell sx={{maxWidth: 200}}>
                                                    {r.monomer_pairs || '–'}
                                                </TableCell>
                                                <TableCell>{r.CDS_locus_tag || '–'}</TableCell>
                                                <TableCell align="center">{r.tte_len}</TableCell>
                                                <TableCell align="center" sx={{
                                                    fontWeight: 'bold',
                                                    color: r.similarity === 'reference'
                                                        ? 'text.secondary'
                                                        : typeof r.similarity === 'number'
                                                            ? r.similarity >= 80 ? 'green'
                                                                : r.similarity >= 50 ? 'orange'
                                                                    : 'red'
                                                            : 'text.disabled',
                                                }}>
                                                    {r.similarity === 'reference'
                                                        ? 'reference'
                                                        : typeof r.similarity === 'number'
                                                            ? `${r.similarity.toFixed(2)} %`
                                                            : '–'}
                                                </TableCell>
                                                <TableCell
                                                    onClick={() => setExpandedSeqs(prev => {
                                                        const next = new Set(prev);
                                                        next.has(index) ? next.delete(index) : next.add(index);
                                                        return next;
                                                    })}
                                                    sx={{
                                                        maxWidth: expandedSeqs.has(index) ? 450 : 180,
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.75rem',
                                                        whiteSpace: expandedSeqs.has(index) ? 'pre-wrap' : 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: expandedSeqs.has(index) ? 'unset' : 'ellipsis',
                                                        cursor: 'pointer',
                                                        userSelect: 'text',
                                                        color: 'text.secondary',
                                                        wordBreak: expandedSeqs.has(index) ? 'break-all' : 'normal',
                                                    }}
                                                    title={expandedSeqs.has(index) ? 'Click to collapse' : 'Click to expand full sequence'}
                                                >
                                                    {expandedSeqs.has(index)
                                                        ? r.tte_seq
                                                        : `${(r.tte_seq || '').slice(0, 30)}${(r.tte_seq || '').length > 30 ? '…' : ''}`
                                                    }
                                                </TableCell>

                                                {/* Per-row protocore download — only rendered when column exists */}
                                                {protocoreHasAny && (
                                                    <TableCell align="center">
                                                        {protocoreFname ? (
                                                            <Tooltip title={`Download ${protocoreFname}`}>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => window.open(
                                                                        `/api/download_file/${jobId}/${encodeURIComponent(protocoreFname)}`,
                                                                        '_blank'
                                                                    )}
                                                                >
                                                                    <FaDownload size={12}/>
                                                                </IconButton>
                                                            </Tooltip>
                                                        ) : (
                                                            // Reference rows have no protocore file
                                                            <Typography variant="caption" color="text.disabled">
                                                                –
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default Results;