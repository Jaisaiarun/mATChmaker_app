import React, {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {toast} from 'react-toastify';
import {
    Box,
    Divider,
    IconButton,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography
} from '@mui/material';
import {FaCopy, FaDownload} from 'react-icons/fa';

import Loading from '../components/Loading';
import ResultTile from '../components/ResultTile';

/**
 * Component to display the results of the prediction.
 *
 * @returns {React.ReactElement} - The results component.
 */



const Results = () => {
    // get job ID from URL
    const {jobId} = useParams();

    // state to store results
    const [results, setResults] = useState(null);

    // state to keep track of loading state
    const [isLoading, setIsLoading] = useState(true);

    // state to store job type
    const [jobType, setJobType] = useState('paras');

    // fetch results from local storage
    useEffect(() => {
        let intervalId;

        const fetchResult = async () => {
            try {
                const response = await fetch(`/api/retrieve/${jobId}`);
                if (!response.ok) {
                    throw new Error('failed to fetch results');
                }
                ;

                const data = await response.json();

                if (data.status === 'success') {


                    // const results = data['payload']['results'] // replace original line

                    const payload = data.payload || {};
                    const results = payload.results || [];
                    const resolvedJobType = payload.job_type || 'paras';
                    setJobType(resolvedJobType);

                    // // sort all predictions by probability
                    // results.forEach(result => {
                    //     result['predictions'].sort((a, b) => b['probability'] - a['probability']);
                    // });
                    //
                    // // round all probabilities to 2 decimal places
                    // results.forEach(result => {
                    //     result['predictions'].forEach(prediction => {
                    //         prediction['probability'] = prediction['probability'].toFixed(3);
                    //     });
                    // });

                    if (resolvedJobType === 'paras') {
                        results.forEach(result => {
                            result.predictions?.sort(
                                (a, b) => b.probability - a.probability
                            );
                            result.predictions?.forEach(pred => {
                                pred.probability = Number(pred.probability).toFixed(3);
                            });
                        });
                    }


                    // set states
                    setResults(results);
                    setIsLoading(false);
                    clearInterval(intervalId);
                } else if (data.status === 'failure') {
                    throw new Error(data.message);
                }
                ; // else keep polling
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
            ;
        };

        if (jobId) {
            // poll every second (1000 milliseconds)
            intervalId = setInterval(fetchResult, 1000);
        }
        ;

        // clear interval when component unmounts
        return () => clearInterval(intervalId);

    }, [jobId]);

    // render loading spinner while fetching results
    if (isLoading) {
        return (
            <Box
                display='flex'
                flexDirection='column'
                justifyContent='center'
                alignItems='center'
                minHeight='80vh'
            >
                <Loading
                    frame1='paras_loading_1.png'
                    frame2='paras_loading_2.png'
                />
                <p>Making predictions...</p>
            </Box>
        );
    }
    ;

    // render message if no results are found
    if (!results) {
        return (
            <Box
                display='flex'
                justifyContent='center'
                alignItems='center'
                minHeight='80vh'
            >
                <p>No results found for job ID {jobId}</p>
            </Box>
        );
    }
    ;

    const shortFileName = (name) => {
        if (!name) return "";
        return name.replace(/^[^_]+_[^_]+_/, "");
    };

    // render results if available
    return (
        <Box
            display='flex'
            flexDirection='column'
            overflow='hidden'
        >
            <Box
                display='flex'
                flexDirection='column'
                alignItems='left'
                margin={4}
            >

                {/* header with job ID and download button */}
                <Box sx={{display: 'flex', flexDirection: 'row', gap: 1}}>
                    <Typography variant='h4' gutterBottom>
                        Results
                    </Typography>
                    <Box>

                        {/* download button */}
                        <IconButton
                            onClick={() => {
                                // const blob = new Blob([JSON.stringify(results)], {type: 'application/json'});
                                const blob = new Blob(
                                    [JSON.stringify({jobType, results}, null, 2)],
                                    {type: 'application/json'}
                                );

                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'results.json';
                                a.click();
                            }
                            }>
                            <FaDownload/>
                        </IconButton>

                    </Box>
                </Box>
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
                    {/*<Typography variant='body1' gutterBottom>*/}
                    {/*    In total, {results.length} prediction(s) were made. The tiles below show the predictions for*/}
                    {/*    each domain. You can scroll horizontally to view all predictions.*/}
                    {/*</Typography>*/}
                    {/*<Typography variant='body1' gutterBottom>*/}
                    {/*    In total, {results.length} result item(s) were produced.*/}
                    {/*</Typography>*/}

                    <Typography variant='body1' gutterBottom>
                        You can download the results as a JSON file using the download button above next to the header.
                    </Typography>
                    <Typography variant='body1' gutterBottom>
                        You can use the job ID to retrieve the results at a later time. All jobs are automatically
                        deleted after 7 days.
                    </Typography>
                </Box>
            </Box>


            {/* display results in a row, one item per domain with prediction */}
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

                    // always show scrollbar
                    '&::-webkit-scrollbar': {
                        display: 'block',
                    },

                    // scrollbar style
                    '&::-webkit-scrollbar-thumb': {
                        backgroundColor: '#ceccca',
                        borderRadius: '10px',
                    },
                }}
            >
                {/*{results.map((result, index) => (*/}
                {/*    <ResultTile key={index} result={result}/>*/}
                {/*))}*/}
                {jobType === 'paras' && results.map((result, index) => (
                    <ResultTile key={index} result={result}/>
                ))}

                {jobType === 'tte' && (
                    <TableContainer
                        component={Paper}
                        sx={{
                            minWidth: 1100,
                            maxHeight: 600,
                            borderRadius: 2,
                            boxShadow: 2
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
                                    <TableCell><strong>Similarity</strong></TableCell>
                                    <TableCell><strong>TTE Sequence</strong></TableCell>
                                </TableRow>
                            </TableHead>

                            <TableBody>
                                {results.map((r, index) => {
                                    // Clean filename (remove UUID prefixes)
                                    const cleanFileName = r.file.replace(
                                        /^[a-f0-9-]+_[AB]_/,
                                        ""
                                    );

                                    return (
                                        <TableRow key={index} hover>
                                            <TableCell>{cleanFileName}</TableCell>

                                            <TableCell>{r.file_locus}</TableCell>

                                            <TableCell>{r.region_id}</TableCell>

                                            <TableCell sx={{maxWidth: 200}}>
                                                {r.monomer_pairs || "-"}
                                            </TableCell>

                                            <TableCell>{r.CDS_locus_tag || "-"}</TableCell>

                                            <TableCell align="center">
                                                {r.tte_len}
                                            </TableCell>

                                            {/* Similarity cell */}
                                            <TableCell
                                                align="center"
                                                sx={{
                                                    fontWeight: "bold",
                                                    color:
                                                        r.similarity === "reference"
                                                            ? "text.secondary"
                                                            : typeof r.similarity === "number"
                                                                ? r.similarity >= 80
                                                                    ? "green"
                                                                    : r.similarity >= 50
                                                                        ? "orange"
                                                                        : "red"
                                                                : "text.disabled"
                                                }}
                                            >
                                                {r.similarity === "reference"
                                                    ? "reference"
                                                    : typeof r.similarity === "number"
                                                        ? `${r.similarity.toFixed(2)} %`
                                                        : "-"}
                                            </TableCell>

                                            {/* Sequence cell */}
                                            <TableCell
                                                sx={{
                                                    maxWidth: 350,
                                                    fontFamily: "monospace",
                                                    fontSize: "0.75rem",
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-all",
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
                )}

            </Box>
        </Box>
    );
};

export default Results;