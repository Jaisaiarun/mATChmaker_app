import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'react-toastify';
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    FormControl,
    FormControlLabel,
    FormLabel,
    Input,
    Radio,
    RadioGroup,
    Typography,
} from '@mui/material';

const SubmitParasAnnotation = () => {
    const [gbkFile, setGbkFile] = useState(null);
    const [modelKey, setModelKey] = useState('parasAllSubstrates');
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
            formData.append('model_key', modelKey);

            const resp = await fetch('/api/submit_paras_annotation', {
                method: 'POST',
                body: formData,
            });

            let json = null;
            try {
                json = await resp.json();
            } catch (parseErr) {
                // ignore parse error, json stays null
            }

            if (resp.ok && json && json.status === 'success' && json.payload?.jobId) {
                navigate(`/results/${json.payload.jobId}`);
            } else {
                if (json?.message) {
                    toast.error(json.message);
                } else {
                    toast.error(`Request failed: ${resp.status} ${resp.statusText}`);
                }
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
                Annotate GenBank with PARAS
            </Typography>

            <Typography variant="body2" color="text.secondary" gutterBottom>
                Upload an antiSMASH-annotated GenBank file. PARAS will predict substrate
                specificity for every AMP-binding domain and add the predictions directly
                into the file as a new <code>specificity_prediction</code> qualifier.
            </Typography>

            <Divider sx={{my: 2}}/>

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
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{mt: 0.5, display: 'block'}}
                    >
                        {gbkFile.name} ({(gbkFile.size / 1024).toFixed(1)} KB)
                    </Typography>
                )}
            </Box>

            <Box sx={{mb: 4}}>
                <FormControl component="fieldset">
                    <FormLabel component="legend">
                        <Typography variant="subtitle1" fontWeight="bold">
                            Model
                        </Typography>
                    </FormLabel>

                    <RadioGroup value={modelKey} onChange={e => setModelKey(e.target.value)}>
                        <FormControlLabel
                            value="parasAllSubstrates"
                            control={<Radio size="small"/>}
                            label="PARAS — all substrates (recommended)"
                        />
                        <FormControlLabel
                            value="parasCommonSubstrates"
                            control={<Radio size="small"/>}
                            label="PARAS — common substrates only"
                        />
                    </RadioGroup>
                </FormControl>
            </Box>

            <Button
                variant="contained"
                color="secondary"
                onClick={handleSubmit}
                disabled={isLoading || !gbkFile}
                sx={{width: 'fit-content'}}
            >
                {isLoading ? <CircularProgress size={22} color="inherit"/> : 'Run PARAS annotation'}
            </Button>
        </Box>
    );
};

export default SubmitParasAnnotation;