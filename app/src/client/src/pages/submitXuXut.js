import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'react-toastify';
import {Box, Button, CircularProgress, Divider, Input, TextField, Typography,} from '@mui/material';

const SubmitXuXut = () => {
    const [gbkFile, setGbkFile] = useState(null);
    const [createdBy, setCreatedBy] = useState('mATChmaker');
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
            formData.append('created_by', createdBy || 'mATChmaker');

            const resp = await fetch('/api/submit_xu_xut', {method: 'POST', body: formData});
            let json = null;
            try {
                json = await resp.json();
            } catch (_) {
            }

            if (resp.ok && json?.status === 'success' && json?.payload?.jobId) {
                navigate(`/results/xu_xut/${json.payload.jobId}`);
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
                XUT / XU mATChmaker Annotation
            </Typography>

            <Typography variant="body2" color="text.secondary" gutterBottom>
                Upload an antiSMASH-annotated GenBank file. The tool will detect XUT
                (FFXXGGXS / [FIY][FIMVY]XXGG[GAI]XS motif-based) and XU
                (48 bp upstream of AMP-binding domains) cutting sites across all
                NRPS modules, fragment the cluster accordingly, and write
                <code> XUT_mATChmaker</code> and <code>XU_mATChmaker</code> features
                directly into the file.
            </Typography>

            <Divider sx={{my: 2}}/>

            {/* File upload */}
            <Box sx={{mb: 3}}>
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

            {/* Created-by field */}
            <Box sx={{mb: 4}}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Created by (annotation tag)
                </Typography>
                <TextField
                    size="small"
                    value={createdBy}
                    onChange={e => setCreatedBy(e.target.value)}
                    placeholder="mATChmaker"
                    sx={{width: 260}}
                />
                <Typography variant="caption" color="text.secondary" sx={{mt: 0.5, display: 'block'}}>
                    This value is written into the <code>/created_by</code> qualifier of each new feature.
                </Typography>
            </Box>

            <Button
                variant="contained"
                color="secondary"
                onClick={handleSubmit}
                disabled={isLoading || !gbkFile}
                sx={{width: 'fit-content'}}
            >
                {isLoading ? <CircularProgress size={22} color="inherit"/> : 'Run XUT / XU annotation'}
            </Button>
        </Box>
    );
};

export default SubmitXuXut;