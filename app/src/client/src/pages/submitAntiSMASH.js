import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'react-toastify';
import {Box, Button, CircularProgress, Divider, Input, Typography,} from '@mui/material';

const SubmitAntiSMASH = () => {
    const [gbkFile, setGbkFile] = useState(null);
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

    const handleSubmit = async () => {
        if (isLoading) return;
        if (!gbkFile) {
            toast.error('Please upload a GenBank file.');
            return;
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('gbk_file', gbkFile);

            const resp = await fetch('/api/submit_antismash', {method: 'POST', body: formData});
            let json = null;
            try {
                json = await resp.json();
            } catch (_) {
            }

            if (resp.ok && json?.status === 'success' && json?.payload?.jobId) {
                navigate(`/results/${json.payload.jobId}`);
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
        <Box display="flex" flexDirection="column" padding={4} maxWidth={640} margin="auto">
            <Typography variant="h4" gutterBottom>
                antiSMASH Annotation
            </Typography>

            <Typography variant="body2" color="text.secondary" gutterBottom>
                Upload a GenBank file with existing gene annotations. antiSMASH will
                be run with PFAM domain annotation (<code>--pfam2go</code>) and
                full NRPS/PKS analysis, adding <code>PFAM_domain</code>,{' '}
                <code>aSDomain</code>, <code>aSModule</code>, and{' '}
                <code>monomer_pairings</code> features. Gene calling is skipped
                (<code>--genefinding-tool none</code>) so your existing CDS features
                are preserved.
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{mt: 1}} gutterBottom>
                antiSMASH can take several minutes to run depending on genome size.
            </Typography>

            <Divider sx={{my: 2}}/>

            <Box sx={{mb: 4}}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    GenBank file (.gb / .gbk)
                </Typography>
                <Input
                    type="file"
                    inputProps={{accept: '.gb,.gbk'}}
                    onChange={handleFileChange}
                />
                {gbkFile && (
                    <Typography variant="caption" color="text.secondary" sx={{mt: 0.5, display: 'block'}}>
                        {gbkFile.name} ({(gbkFile.size / 1024).toFixed(1)} KB)
                    </Typography>
                )}
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
                    : 'Run antiSMASH annotation'}
            </Button>
        </Box>
    );
};

export default SubmitAntiSMASH;