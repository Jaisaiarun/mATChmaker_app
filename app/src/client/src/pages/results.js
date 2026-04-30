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
    const [hasParas, setHasParas] = useState(false);
    const [sortDirection, setSortDirection] = useState('desc');
    const [selectedMonomers, setSelectedMonomers] = useState(new Set());
    const [monomerFilterInitialized,
        setMonomerFilterInitialized] = useState(false);
    const [showMonomerFilter, setShowMonomerFilter] = useState(false);
    const [selectedParasSubstrates, setSelectedParasSubstrates] = useState(new Set());
    const [parasFilterInitialized, setParasFilterInitialized] = useState(false);
    const [showParasFilter, setShowParasFilter] = useState(false);
    const [annotatedFile, setAnnotatedFile] = useState(null);
    const [progress, setProgress] = useState(null);
    const [nowTs, setNowTs] = useState(Date.now());
    const [protocoreFiles, setProtocoreFiles] = useState({});
    const [expandedSeqs, setExpandedSeqs] = useState(new Set());

    // live clock for paras_annotation elapsed display
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
                    setHasParas(payload.has_paras || false);

                    if (payload.protocore_files) setProtocoreFiles(payload.protocore_files || {});
                    if (payload.annotated_file) setAnnotatedFile(payload.annotated_file);
                    if (payload.progress) setProgress(payload.progress);

                    if (resolvedJobType === 'paras') {
                        rawResults.forEach(result => {
                            result.predictions?.sort((a, b) => b.probability - a.probability);
                            result.predictions?.forEach(pred => {
                                pred.probability = Number(pred.probability).toFixed(3);
                            });
                        });
                    }

                    setResults(rawResults);
                    setIsLoading(false);
                    clearInterval(intervalId);

                } else if (data.status === 'pending') {
                    if (data.payload?.job_type) setJobType(data.payload.job_type);
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

    // ── Monomer filter init ───────────────────────────────────────────────
    useEffect(() => {
        if (results && jobType === 'tte' && !monomerFilterInitialized) {
            const all = new Set();
            results.forEach(r => {
                if (r.monomer_pairs) {
                    r.monomer_pairs.split(' | ').forEach(m => {
                        const t = m.trim();
                        if (t) all.add(t);
                    });
                }
            });
            setSelectedMonomers(all);
            setMonomerFilterInitialized(true);
        }
    }, [results, jobType, monomerFilterInitialized]);

    // ── PARAS Filter filter init ───────────────────────────────────────────────
    useEffect(() => {
        if (results && jobType === 'tte' && hasParas && !parasFilterInitialized) {
            const all = new Set();
            results.forEach(r => {
                (r.paras_substrates || []).forEach(p => {
                    const label = p.substrate_3letter || p.substrate;
                    if (label) all.add(label);
                });
            });
            setSelectedParasSubstrates(all);
            setParasFilterInitialized(true);
        }
    }, [results, jobType, hasParas, parasFilterInitialized]);

    // ── Derived values (all useMemo before early returns) ─────────────────

    const uniqueMonomers = useMemo(() => {
        if (!results || jobType !== 'tte') return [];
        const monomers = new Set();
        results.forEach(r => {
            if (r.monomer_pairs) {
                r.monomer_pairs.split(' | ').forEach(m => {
                    const t = m.trim();
                    if (t) monomers.add(t);
                });
            }
        });
        return Array.from(monomers).sort();
    }, [results, jobType]);

    const uniqueParasSubstrates = useMemo(() => {
        if (!results || jobType !== 'tte' || !hasParas) return [];
        const subs = new Set();
        results.forEach(r => {
            (r.paras_substrates || []).forEach(p => {
                const label = p.substrate_3letter || p.substrate;
                if (label) subs.add(label);
            });
        });
        return Array.from(subs).sort();
    }, [results, jobType, hasParas]);

    const filteredAndSortedResults = useMemo(() => {
        if (!results || jobType !== 'tte') return results || [];

        let filtered = results.filter(r => {
            // Monomer filter
            const monomerPass = (() => {
                if (!r.monomer_pairs || r.monomer_pairs.trim() === '') return true;

                const rowMonomers = r.monomer_pairs
                    .split(' | ')
                    .map(m => m.trim());

                return rowMonomers.some(m => selectedMonomers.has(m));
            })();

            // PARAS substrate filter
            const parasPass = (() => {
                if (!hasParas) return true;

                const rowParasSubs = (r.paras_substrates || [])
                    .map(p => p.substrate_3letter || p.substrate)
                    .filter(Boolean);

                // Keep rows with no PARAS predictions visible
                if (rowParasSubs.length === 0) return true;

                return rowParasSubs.some(sub => selectedParasSubstrates.has(sub));
            })();

            return monomerPass && parasPass;
        });

        filtered = [...filtered].sort((a, b) => {
            const aRef = a.similarity === 'reference';
            const bRef = b.similarity === 'reference';

            if (aRef && !bRef) return -1;
            if (!aRef && bRef) return 1;
            if (aRef && bRef) return 0;

            const aVal = typeof a.similarity === 'number' ? a.similarity : -1;
            const bVal = typeof b.similarity === 'number' ? b.similarity : -1;

            return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
        });

        return filtered;
    }, [
        results,
        jobType,
        selectedMonomers,
        selectedParasSubstrates,
        hasParas,
        sortDirection
    ]);

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
                sortDirection === 'desc' ? b.topScore - a.topScore : a.topScore - b.topScore
            );
    }, [results, jobType, sortDirection]);

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
        const headers = [
            'File', 'File Locus', 'Region ID', 'Monomer Pairs',
            'CDS Locus Tag', 'TTE Length', 'Similarity', 'TTE Sequence',
            ...(hasParas ? ['PARAS Predictions (substrate: score%)'] : []),
        ];
        const rows = filteredAndSortedResults.map(r => {
            const cleanFileName = r.file.replace(/^[a-f0-9-]+_(?:[A-Z]+(?:_\d+)?)_/, '');
            const similarity = r.similarity === 'reference'
                ? 'reference'
                : typeof r.similarity === 'number' ? r.similarity.toFixed(2) : '';
            const base = [
                cleanFileName, r.file_locus || '', r.region_id || '',
                r.monomer_pairs || '', r.CDS_locus_tag || '', r.tte_len || '',
                similarity, r.tte_seq || '',
            ];
            if (hasParas) {
                const subs = (r.paras_substrates || [])
                    .map(p => `${p.substrate_3letter || p.substrate}: ${(p.score * 100).toFixed(1)}%`)
                    .join('; ');
                base.push(subs);
            }
            return base;
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
        const headers = ['Domain ID', 'Locus Tag', 'Existing Substrate', 'Substrate', 'Substrate Code', 'Score (%)'];
        const rows = (results || []).map(r => [
            r.domain_id || '', r.locus_tag || '', r.existing_specificity || '',
            r.substrate || '', r.substrate_3letter || '', (r.score * 100).toFixed(1),
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

    const handleMonomerToggle = (m) => setSelectedMonomers(prev => {
        const next = new Set(prev);
        next.has(m) ? next.delete(m) : next.add(m);
        return next;
    });
    const handleSelectAllMonomers = () => setSelectedMonomers(new Set(uniqueMonomers));
    const handleClearAllMonomers = () => setSelectedMonomers(new Set());

    // ── Loading screen ────────────────────────────────────────────────────

    if (isLoading) {
        const pct = progress?.total > 0
            ? Math.round((progress.current / progress.total) * 100)
            : null;

        const loadingMessage = (() => {
            if (!progress) return 'Starting...';
            const phase = progress.phase;
            if (jobType === 'paras_annotation') {
                if (phase === 'loading_model') return 'Loading PARAS model...';
                if (phase === 'running') return 'Running PARAS predictions...';
                if (phase === 'saving') return 'Saving annotated GenBank file...';
                return 'Starting...';
            }
            if (jobType === 'xu_xut_annotation') {
                if (phase === 'parsing') return 'Parsing GenBank file...';
                if (phase === 'annotating') return `Annotating ${progress.message || ''}...`;
                if (phase === 'saving') return 'Writing annotated GenBank file...';
                return 'Starting...';
            }
            if (jobType === 'antismash') {
                if (phase === 'running') return 'Running antiSMASH (this may take several minutes)...';
                if (phase === 'merging') return 'Merging antiSMASH output files...';
                return 'Starting...';
            }
            if (phase === 'extracting_reference') return 'Extracting TTE from reference file...';
            if (phase === 'comparing') return `Extracting TTE from ${progress.current_file || 'input file'}...`;
            if (phase === 'similarity') return `Computing similarity for ${progress.current_file || 'input file'}...`;
            if (phase === 'paras') {
                if (progress.current === 0) return 'Loading PARAS model...';
                return `Running PARAS — ${progress.message || ''}`;
            }
            return 'Processing...';
        })();

        const loadingDetail = (() => {
            if (!progress) return null;
            const phase = progress.phase;
            if (jobType === 'paras_annotation' && phase === 'running') {
                return `Domain ${progress.current} of ${progress.total}: ${progress.current_domain}`;
            }
            if (phase === 'similarity' && progress.tte_count != null) {
                return `${progress.tte_count} TTE sequence(s) found`;
            }
            if (phase === 'paras' && progress.current > 0) {
                return `Domain ${progress.current} of ${progress.total}`;
            }
            return null;
        })();

        const showProgressBar = jobType === 'paras_annotation' || jobType === 'xu_xut_annotation' || progress?.phase === 'paras';
        const isIndeterminate = (
            progress?.phase === 'loading_model' ||
            (progress?.phase === 'paras' && progress.current === 0) ||
            jobType === 'antismash'
        );

        return (
            <Box display='flex' flexDirection='column' justifyContent='center'
                 alignItems='center' minHeight='90vh' gap={2} padding={4}>

                <Loading frame1='Logo_trans_1.png' frame2='Logo_trans_2.png'/>

                <Typography variant='h6' color='text.secondary'>
                    {loadingMessage}
                </Typography>

                {loadingDetail && (
                    <Typography variant='body2' color='text.secondary'>
                        {loadingDetail}
                    </Typography>
                )}

                {showProgressBar && (
                    <Box sx={{width: '100%', maxWidth: 400}}>
                        <Box sx={{
                            width: '100%', height: 10, borderRadius: 5,
                            bgcolor: 'divider', overflow: 'hidden', position: 'relative',
                        }}>
                            {isIndeterminate ? (
                                <Box sx={{
                                    width: '35%', height: '100%', borderRadius: 5,
                                    bgcolor: 'secondary.main', position: 'absolute',
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
                            {isIndeterminate
                                ? (jobType === 'paras_annotation'
                                    ? `Preparing model... ${loadingElapsedSeconds}s`
                                    : 'Preparing PARAS model...')
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
                                                        fontFamily: 'monospace', fontSize: '0.78rem',
                                                        color: 'text.secondary',
                                                    }}>
                                                        {row.domain_id}
                                                    </TableCell>
                                                    <TableCell>{row.existing_specificity || '–'}</TableCell>
                                                    <TableCell>{row.substrate}</TableCell>
                                                    <TableCell>
                                                        <Chip label={row.substrate_3letter} size="small"
                                                              variant="outlined"/>
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

                {/* ── TTE table (with optional PARAS prediction column) ── */}
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
                        {/* PARAS filter */}
                        {hasParas && uniqueParasSubstrates.length > 0 && (
                            <Box sx={{mb: 2}}>
                                <Button
                                    variant="outlined" size="small"
                                    startIcon={<FaFilter/>}
                                    onClick={() => setShowParasFilter(prev => !prev)}
                                    sx={{mb: 1}}
                                    color="secondary"
                                >
                                    Filter PARAS Predictions
                                    ({selectedParasSubstrates.size}/{uniqueParasSubstrates.length})
                                </Button>
                                <Collapse in={showParasFilter}>
                                    <Paper sx={{p: 2, mb: 2}}>
                                        <Box sx={{display: 'flex', gap: 1, mb: 1}}>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedParasSubstrates(new Set(uniqueParasSubstrates))}>
                                                Select All
                                            </Button>
                                            <Button size="small" variant="text"
                                                    onClick={() => setSelectedParasSubstrates(new Set())}>
                                                Clear All
                                            </Button>
                                        </Box>
                                        <FormGroup row sx={{gap: 0.5}}>
                                            {uniqueParasSubstrates.map(sub => (
                                                <FormControlLabel
                                                    key={sub}
                                                    control={
                                                        <Checkbox
                                                            checked={selectedParasSubstrates.has(sub)}
                                                            onChange={() => setSelectedParasSubstrates(prev => {
                                                                const next = new Set(prev);
                                                                next.has(sub) ? next.delete(sub) : next.add(sub);
                                                                return next;
                                                            })}
                                                            size="small"
                                                        />
                                                    }
                                                    label={
                                                        <Chip
                                                            label={sub} size="small"
                                                            variant={selectedParasSubstrates.has(sub) ? 'filled' : 'outlined'}
                                                            color={selectedParasSubstrates.has(sub) ? 'secondary' : 'default'}
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
                            {hasParas && (
                                <Chip
                                    label="+ PARAS predictions"
                                    size="small"
                                    color="secondary"
                                    variant="outlined"
                                    sx={{ml: 1}}
                                />
                            )}
                        </Typography>

                        <TableContainer
                            component={Paper}
                            sx={{
                                minWidth: hasParas ? 1500 : 1200,
                                maxHeight: 600,
                                borderRadius: 2,
                                boxShadow: 2,
                            }}
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
                                        {/* PARAS prediction column — only when PARAS was run */}
                                        {hasParas && (
                                            <TableCell align="center" sx={{minWidth: 220}}>
                                                <strong>PARAS Predictions</strong>
                                                <Typography variant="caption" display="block" color="text.secondary">
                                                    all A-domains in region
                                                </Typography>
                                            </TableCell>
                                        )}
                                        {/* Protocore download column */}
                                        {protocoreHasAny && (
                                            <TableCell align="center">
                                                <strong>Protocore .gbk</strong>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                </TableHead>

                                <TableBody>
                                    {filteredAndSortedResults.map((r, index) => {
                                        const cleanFileName = r.file.replace(
                                            /^[a-f0-9-]+_(?:[A-Z]+(?:_\d+)?)_/, ''
                                        );
                                        const fileStem = cleanFileName.replace(/\.(gb|gbk)$/i, '');
                                        const lookupKey = `${fileStem}::${r.region_id}`;
                                        const protocoreFname = protocoreFiles[lookupKey] || null;
                                        const isReference = r.similarity === 'reference';
                                        const parasSubs = r.paras_substrates || [];

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
                                                    color: isReference
                                                        ? 'text.secondary'
                                                        : typeof r.similarity === 'number'
                                                            ? r.similarity >= 80 ? 'green'
                                                                : r.similarity >= 50 ? 'orange'
                                                                    : 'red'
                                                            : 'text.disabled',
                                                }}>
                                                    {isReference
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
                                                    title={expandedSeqs.has(index)
                                                        ? 'Click to collapse'
                                                        : 'Click to expand full sequence'}
                                                >
                                                    {expandedSeqs.has(index)
                                                        ? r.tte_seq
                                                        : `${(r.tte_seq || '').slice(0, 30)}${(r.tte_seq || '').length > 30 ? '…' : ''}`
                                                    }
                                                </TableCell>

                                                {/* ── PARAS predictions — all A-domains in this region ── */}
                                                {hasParas && (
                                                    <TableCell align="center" sx={{verticalAlign: 'top', pt: 1}}>
                                                        {isReference ? (
                                                            <Typography variant="caption"
                                                                        color="text.disabled">–</Typography>
                                                        ) : parasSubs.length > 0 ? (
                                                            <Box sx={{
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'flex-start',
                                                                gap: 0.5,
                                                            }}>
                                                                {parasSubs.map((p, i) => (
                                                                    <Box key={i} sx={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 0.5
                                                                    }}>
                                                                        <Chip
                                                                            label={p.substrate_3letter || p.substrate}
                                                                            size="small"
                                                                            color={
                                                                                p.score >= 0.8 ? 'success'
                                                                                    : p.score >= 0.5 ? 'warning'
                                                                                        : 'default'
                                                                            }
                                                                            variant="outlined"
                                                                        />
                                                                        <Typography variant="caption" sx={{
                                                                            fontWeight: 'bold',
                                                                            minWidth: 40,
                                                                            color: p.score >= 0.8 ? 'green'
                                                                                : p.score >= 0.5 ? 'orange' : 'red',
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

                                                {/* ── Per-row protocore download ── */}
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
                                                            <Typography variant="caption"
                                                                        color="text.disabled">–</Typography>
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

                {/* ── XUT / XU annotation results ── */}
                {jobType === 'xu_xut_annotation' && (
                    <Box sx={{width: '100%'}}>
                        {annotatedFile && (
                            <Box sx={{mb: 3, display: 'flex', alignItems: 'center', gap: 2}}>
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

                        {/* XUT table */}
                        {['XUT', 'XU'].map(featureType => {
                            const rows = (results || []).filter(r => r.type === featureType);
                            if (rows.length === 0) return null;
                            return (
                                <Box key={featureType} sx={{mb: 5}}>
                                    <Typography variant="h6" gutterBottom>
                                        {featureType === 'XUT' ? 'XUT_mATChmaker' : 'XU_mATChmaker'} regions
                                        <Chip label={`${rows.length} fragments`} size="small" sx={{ml: 1}}/>
                                    </Typography>
                                    <TableContainer component={Paper}
                                                    sx={{borderRadius: 2, boxShadow: 2, maxHeight: 500}}>
                                        <Table stickyHeader size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell><strong>#</strong></TableCell>
                                                    <TableCell><strong>Record</strong></TableCell>
                                                    <TableCell><strong>Label</strong></TableCell>
                                                    <TableCell align="center"><strong>Start</strong></TableCell>
                                                    <TableCell align="center"><strong>End</strong></TableCell>
                                                    <TableCell align="center"><strong>Length (aa)</strong></TableCell>
                                                    <TableCell><strong>Sequence</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {rows.map((r, idx) => (
                                                    <TableRow key={idx} hover>
                                                        <TableCell>{r.module_position}</TableCell>
                                                        <TableCell sx={{fontFamily: 'monospace', fontSize: '0.75rem'}}>
                                                            {r.record}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip label={r.label} size="small" variant="outlined"
                                                                  color="secondary"/>
                                                        </TableCell>
                                                        <TableCell align="center">{r.start}</TableCell>
                                                        <TableCell align="center">{r.end}</TableCell>
                                                        <TableCell align="center">{r.length}</TableCell>
                                                        <TableCell
                                                            onClick={() => setExpandedSeqs(prev => {
                                                                const next = new Set(prev);
                                                                const key = `${featureType}-${idx}`;
                                                                next.has(key) ? next.delete(key) : next.add(key);
                                                                return next;
                                                            })}
                                                            sx={{
                                                                maxWidth: expandedSeqs.has(`${featureType}-${idx}`) ? 400 : 160,
                                                                fontFamily: 'monospace',
                                                                fontSize: '0.72rem',
                                                                whiteSpace: expandedSeqs.has(`${featureType}-${idx}`) ? 'pre-wrap' : 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: expandedSeqs.has(`${featureType}-${idx}`) ? 'unset' : 'ellipsis',
                                                                cursor: 'pointer',
                                                                userSelect: 'text',
                                                                color: 'text.secondary',
                                                                wordBreak: expandedSeqs.has(`${featureType}-${idx}`) ? 'break-all' : 'normal',
                                                            }}
                                                            title="Click to expand/collapse"
                                                        >
                                                            {expandedSeqs.has(`${featureType}-${idx}`)
                                                                ? r.sequence
                                                                : `${(r.sequence || '').slice(0, 25)}${(r.sequence || '').length > 25 ? '…' : ''}`}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Box>
                            );
                        })}
                    </Box>
                )}

                {/* ── antiSMASH annotation results ── */}
                {jobType === 'antismash' && (
                    <Box sx={{width: '100%'}}>
                        {annotatedFile && (
                            <Box sx={{mb: 4, display: 'flex', alignItems: 'center', gap: 2}}>
                                <Typography variant="body1">Annotated GenBank file ready:</Typography>
                                <Button
                                    variant="contained" color="secondary" startIcon={<FaDownload/>}
                                    onClick={() => window.open(
                                        `/api/download_file/${jobId}/${encodeURIComponent(annotatedFile)}`,
                                        '_blank'
                                    )}
                                >
                                    {annotatedFile}
                                </Button>
                            </Box>
                        )}

                        {/* Summary card */}
                        {results?.length > 0 && (() => {
                            const s = results[0];
                            return (
                                <Paper sx={{p: 3, borderRadius: 2, boxShadow: 2, maxWidth: 500}}>
                                    <Typography variant="h6" gutterBottom>Annotation Summary</Typography>
                                    <Table size="small">
                                        <TableBody>
                                            {[
                                                ['Records', s.total_records],
                                                ['Protoclusters', s.protoclusters],
                                                ['aSModules', s.as_modules],
                                                ['aSDomains', s.as_domains],
                                                ['PFAM domains', s.pfam_domains],
                                                ['CDS features', s.cds_features],
                                            ].map(([label, value]) => (
                                                <TableRow key={label}>
                                                    <TableCell
                                                        sx={{fontWeight: 'bold', border: 'none'}}>{label}</TableCell>
                                                    <TableCell align="right" sx={{border: 'none'}}>{value}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </Paper>
                            );
                        })()}
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default Results;