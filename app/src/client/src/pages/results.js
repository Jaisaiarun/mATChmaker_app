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

    useEffect(() => {
        let intervalId;

        const fetchResult = async () => {
            try {
                const response = await fetch(`/api/retrieve/${jobId}`);
                if (!response.ok) throw new Error('failed to fetch results');

                const data = await response.json();

                if (data.status === 'success') {
                    const payload = data.payload || {};
                    const results = payload.results || [];
                    const resolvedJobType = payload.job_type || 'paras';
                    setJobType(resolvedJobType);

                    if (resolvedJobType === 'paras') {
                        results.forEach(result => {
                            result.predictions?.sort((a, b) => b.probability - a.probability);
                            result.predictions?.forEach(pred => {
                                pred.probability = Number(pred.probability).toFixed(3);
                            });
                        });
                    }

                    setResults(results);
                    setIsLoading(false);
                    clearInterval(intervalId);
                } else if (data.status === 'failure') {
                    throw new Error(data.message);
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
            intervalId = setInterval(fetchResult, 1000);
        }

        return () => clearInterval(intervalId);
    }, [jobId]);

    // Initialize monomer filter when TTE results arrive
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

    const downloadTteCsv = () => {
        const headers = ['File', 'File Locus', 'Region ID', 'Monomer Pairs',
            'CDS Locus Tag', 'TTE Length', 'Similarity', 'TTE Sequence'];
        const rows = filteredAndSortedResults.map(r => {
            const cleanFileName = r.file.replace(/^[a-f0-9-]+_[AB]_/, '');
            const similarity = r.similarity === 'reference'
                ? 'reference'
                : typeof r.similarity === 'number'
                    ? r.similarity.toFixed(2)
                    : '';
            return [cleanFileName, r.file_locus || '', r.region_id || '',
                r.monomer_pairs || '', r.CDS_locus_tag || '', r.tte_len || '',
                similarity, r.tte_seq || ''];
        });
        const csvContent = [
            headers.join(','),
            ...rows.map(row =>
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            )
        ].join('\n');
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tte_results.csv';
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

    if (isLoading) {
        return (
            <Box display='flex' flexDirection='column' justifyContent='center' alignItems='center' minHeight='80vh'>
                <Loading frame1='Logo_trans_1.png' frame2='Logo_trans_2.png'/>
                <p>Making predictions...</p>
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

    return (
        <Box display='flex' flexDirection='column' overflow='hidden'>
            <Box display='flex' flexDirection='column' alignItems='left' margin={4}>

                {/* Header with job ID and download button */}
                <Box sx={{display: 'flex', flexDirection: 'row', gap: 1}}>
                    <Typography variant='h4' gutterBottom>Results</Typography>
                    <Box>
                        <Tooltip title="Download as JSON">
                            <IconButton
                                onClick={() => {
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
                                }}
                            >
                                <FaDownload/>
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* ── NEW: CSV download button (TTE only) ── */}
                {jobType === 'tte' && (
                    <Tooltip title="Download table as CSV">
                        <IconButton onClick={downloadTteCsv}>
                            <FaFileCsv/>
                        </IconButton>
                    </Tooltip>
                )}

                <Typography variant='body1' gutterBottom>
                    <IconButton
                        onClick={() => {
                            navigator.clipboard.writeText(jobId);
                            toast.success('Copied the job ID to clipboard!');
                        }}
                    >
                        <FaCopy size={15} style={{paddingBottom: '3px'}}/>
                    </IconButton>
                    {`Job ID: ${jobId}`}
                </Typography>
                <Divider/>

                <Box sx={{mt: 4}}>
                    <Typography variant='body1' gutterBottom>
                        You can download the results as a JSON file using the download button above next to the header.
                    </Typography>
                    <Typography variant='body1' gutterBottom>
                        You can use the job ID to retrieve the results at a later time. All jobs are automatically
                        deleted after 7 days.
                    </Typography>
                </Box>
            </Box>

            <Box
                sx={{
                    overflowY: 'auto',
                    overflowX: 'auto',
                    backgroundColor: 'white.main',
                    display: 'flex',
                    gap: '20px',
                    paddingLeft: '30px',
                    paddingRight: '30px',
                    paddingBottom: '20px',
                    '&::-webkit-scrollbar': {display: 'block'},
                    '&::-webkit-scrollbar-thumb': {backgroundColor: '#ceccca', borderRadius: '10px'},
                }}
            >
                {/* PARAS results */}
                {jobType === 'paras' && results.map((result, index) => (
                    <ResultTile key={index} result={result}/>
                ))}

                {/* TTE results */}
                {jobType === 'tte' && (
                    <Box sx={{width: '100%'}}>

                        {/* ── NEW: Monomer filter panel ── */}
                        {uniqueMonomers.length > 0 && (
                            <Box sx={{mb: 2}}>
                                <Button
                                    variant="outlined"
                                    size="small"
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
                                                            label={monomer}
                                                            size="small"
                                                            variant={selectedMonomers.has(monomer) ? "filled" : "outlined"}
                                                            color={selectedMonomers.has(monomer) ? "secondary" : "default"}
                                                        />
                                                    }
                                                />
                                            ))}
                                        </FormGroup>
                                    </Paper>
                                </Collapse>
                            </Box>
                        )}

                        {/* ── NEW: Row count ── */}
                        <Typography variant="body2" sx={{mb: 1}} color="text.secondary">
                            Showing {filteredAndSortedResults.length} of {results.length} results
                        </Typography>

                        {/* Table */}
                        <TableContainer
                            component={Paper}
                            sx={{minWidth: 1100, maxHeight: 600, borderRadius: 2, boxShadow: 2}}
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

                                        {/* ── NEW: Sortable similarity header ── */}
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
                                    </TableRow>
                                </TableHead>

                                <TableBody>
                                    {/* ── CHANGED: filteredAndSortedResults instead of results ── */}
                                    {filteredAndSortedResults.map((r, index) => {
                                        // const cleanFileName = r.file.replace(/^[a-f0-9-]+_[AB]_/, '');
                                        const cleanFileName = r.file.replace(/^[a-f0-9-]+_(?:A|B|REF|IN_\d+)_/, '');
                                        return (
                                            <TableRow key={index} hover>
                                                <TableCell>{cleanFileName}</TableCell>
                                                <TableCell>{r.file_locus}</TableCell>
                                                <TableCell>{r.region_id}</TableCell>
                                                <TableCell sx={{maxWidth: 200}}>
                                                    {r.monomer_pairs || '-'}
                                                </TableCell>
                                                <TableCell>{r.CDS_locus_tag || '-'}</TableCell>
                                                <TableCell align="center">{r.tte_len}</TableCell>
                                                <TableCell
                                                    align="center"
                                                    sx={{
                                                        fontWeight: 'bold',
                                                        color:
                                                            r.similarity === 'reference'
                                                                ? 'text.secondary'
                                                                : typeof r.similarity === 'number'
                                                                    ? r.similarity >= 80
                                                                        ? 'green'
                                                                        : r.similarity >= 50
                                                                            ? 'orange'
                                                                            : 'red'
                                                                    : 'text.disabled'
                                                    }}
                                                >
                                                    {r.similarity === 'reference'
                                                        ? 'reference'
                                                        : typeof r.similarity === 'number'
                                                            ? `${r.similarity.toFixed(2)} %`
                                                            : '-'}
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        maxWidth: 350,
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.75rem',
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-all',
                                                    }}
                                                >
                                                    {r.tte_seq}
                                                </TableCell>
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