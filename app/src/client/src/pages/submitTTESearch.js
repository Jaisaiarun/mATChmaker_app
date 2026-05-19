import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'react-toastify';
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    Input,
    Slider,
    TextField,
    Typography,
} from '@mui/material';

/**
 * Submit one antiSMASH-annotated reference GenBank file plus a similarity
 * threshold; the server scores it against the precomputed TTE reference
 * database and returns grouped hits per protocluster.
 *
 * Mirrors the style of submitAntiSMASH.js for consistency.
 */
const SubmitTTESearch = () => {
    const [gbkFile, setGbkFile] = useState(null);
    const [minSimilarity, setMinSimilarity] = useState(50);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) {
            setGbkFile(null);
            return;
        }
        const name = file.name.toLowerCase();
        if (!name.endsWith('.gb') && !name.endsWith('.gbk')) {
            toast.error('Only .gb or .gbk files are allowed.');
            e.target.value = '';
            setGbkFile(null);
            return;
        }
        setGbkFile(file);
    };

    const handleThresholdChange = (_e, value) => {
        // Slider gives a number; clamp to [0, 100]
        const v = Array.isArray(value) ? value[0] : value;
        setMinSimilarity(Math.max(0, Math.min(100, Number(v) || 0)));
    };

    const handleThresholdInputChange = (e) => {
        const raw = e.target.value;
        if (raw === '') {
            setMinSimilarity(0);
            return;
        }
        const v = parseFloat(raw);
        if (Number.isNaN(v)) return;
        setMinSimilarity(Math.max(0, Math.min(100, v)));
    };

    const handleSubmit = async () => {
        if (isLoading) return;
        if (!gbkFile) {
            toast.error('Please upload a reference GenBank file.');
            return;
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('reference_file', gbkFile);
            formData.append('min_similarity', String(minSimilarity));

            const resp = await fetch('/api/submit_tte_search', {
                method: 'POST',
                body: formData,
            });

            let json = null;
            try {
                json = await resp.json();
            } catch (_) {
            }

            if (resp.ok && json?.status === 'success' && json?.payload?.jobId) {
                navigate(`/results/tte_search/${json.payload.jobId}`);
            } else {
                toast.error(json?.message || `Request failed: ${resp.status}`);
            }
        } catch (err) {
            toast.error(err?.message || String(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box display="flex" flexDirection="column" padding={4} maxWidth={720} margin="auto">
            <Typography variant="h4" gutterBottom>
                TTE Reference Search
            </Typography>

            <Typography variant="body2" color="text.secondary" gutterBottom>
                Upload one antiSMASH-annotated GenBank file containing an NRPS
                cluster. The server extracts the terminal release region (last
                carrier-protein domain → C-terminal thioesterase) from each
                protocluster in your file, then scores it against a precomputed
                database of TTE sequences from a curated set of reference
                clusters.
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{mt: 1}} gutterBottom>
                Results are grouped by reference protocluster. For each
                protocluster, every database cluster scoring at or above the
                similarity threshold is returned, sorted by descending
                similarity. Groups with no hits above threshold are still shown,
                so you can tell the difference between "no NRPS found" and
                "NRPS found but no homologs in the reference set".
            </Typography>

            <Divider sx={{my: 2}}/>

            <Box sx={{mb: 4}}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Reference GenBank file (.gb / .gbk)
                </Typography>
                <Input
                    type="file"
                    inputProps={{accept: '.gb,.gbk'}}
                    onChange={handleFileChange}
                />
                {gbkFile && (
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{mt: 0.5, display: 'block'}}
                    >
                        {gbkFile.name} ({(gbkFile.size / 1024).toFixed(1)} KB)
                    </Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{mt: 1, display: 'block'}}>
                    File must already be antiSMASH-annotated (containing{' '}
                    <code>aSDomain</code> and <code>PFAM_domain</code> features).
                    Run the antiSMASH Annotation tool first if your file is raw.
                </Typography>
            </Box>

            <Box sx={{mb: 4}}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Minimum similarity threshold (%)
                </Typography>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                    <Slider
                        value={minSimilarity}
                        onChange={handleThresholdChange}
                        min={0}
                        max={100}
                        step={1}
                        valueLabelDisplay="auto"
                        sx={{flexGrow: 1}}
                    />
                    <TextField
                        size="small"
                        value={minSimilarity}
                        onChange={handleThresholdInputChange}
                        inputProps={{
                            type: 'number',
                            min: 0,
                            max: 100,
                            step: 1,
                            style: {width: 60},
                        }}
                    />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{mt: 1, display: 'block'}}>
                    Percent identity over aligned positions (Clustal Omega
                    pairwise alignment, gaps excluded). 50% is a reasonable
                    starting point for "likely homologous"; raise it to find
                    closer relatives, lower it to cast a wider net.
                </Typography>
            </Box>

            <Button
                variant="contained"
                color="secondary"
                onClick={handleSubmit}
                disabled={isLoading || !gbkFile}
                sx={{width: 'fit-content'}}
            >
                {isLoading
                    ? <CircularProgress size={22} color="inherit"/>
                    : 'Search reference database'}
            </Button>

            <Typography variant="caption" color="text.secondary" sx={{mt: 2, display: 'block'}}>
                Searches can take 1–3 minutes per reference protocluster,
                depending on the size of the reference database.
            </Typography>
        </Box>
    );
};

export default SubmitTTESearch;