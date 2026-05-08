import React, { useState } from 'react';
import { toast } from 'react-toastify';
import {
    Box, Button, CircularProgress, Divider,
    FormControl, FormControlLabel, FormLabel,
    IconButton, Input, MenuItem,
    Radio, RadioGroup, Select, Typography, Chip,
} from '@mui/material';
import { FaTrash } from 'react-icons/fa';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';

const SectionCard = ({ children, sx = {} }) => (
    <Box sx={{
        background: '#FEFCF5',
        border: '1px solid #E0CFA4',
        borderRadius: 2,
        p: '20px 24px',
        ...sx,
    }}>
        {children}
    </Box>
);

const SectionLabel = ({ children }) => (
    <Typography sx={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#B8893A',
        mb: 1.5,
    }}>
        {children}
    </Typography>
);

const SubmitTTE = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [referenceFile, setFileA] = useState(null);
    const [inputFiles, setInputFiles] = useState([]);
    const [runParas, setRunParas] = useState('tte_only');
    const [parasModel, setParasModel] = useState('parasAllSubstrates');

    const handleRefresh = () => {
        localStorage.removeItem('results');
        window.location.reload();
    };

    const isGenBankFile = (file) => {
        if (!file) return false;
        const name = file.name.toLowerCase();
        return name.endsWith('.gbk') || name.endsWith('.gb');
    };

    const handleFileAUpload = (e) => {
        const file = e.target.files[0];
        if (!file) { setFileA(null); return; }
        if (!isGenBankFile(file)) {
            toast.error('Only .gbk or .gb files are allowed.');
            e.target.value = null;
            setFileA(null);
            return;
        }
        setFileA(file);
    };

    const handleInputFilesUpload = (e) => {
        const incoming = Array.from(e.target.files);
        const existingNames = new Set(inputFiles.map(f => f.name));
        const accepted = incoming.filter(file => {
            if (!isGenBankFile(file)) { toast.warn(`Skipped "${file.name}": not .gb/.gbk`); return false; }
            if (existingNames.has(file.name)) { toast.warn(`Skipped "${file.name}": already added`); return false; }
            return true;
        });
        if (accepted.length) setInputFiles(prev => [...prev, ...accepted]);
        e.target.value = null;
    };

    const handleRemoveInputFile = (name) => {
        setInputFiles(prev => prev.filter(f => f.name !== name));
    };

    const handleSubmit = async () => {
        if (!referenceFile || inputFiles.length === 0) {
            toast.error('Please upload both a reference and at least one input file.');
            return;
        }
        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('reference_file', referenceFile);
            inputFiles.forEach(f => formData.append('input_files[]', f));
            formData.append('run_paras_annotation', runParas === 'tte_paras' ? 'true' : 'false');
            formData.append('paras_model_key', parasModel);

            const response = await fetch('/api/submit_tte', { method: 'POST', body: formData });
            let json = null;
            try { json = JSON.parse(await response.text()); } catch (e) {}

            if (!response.ok) { toast.error(json?.message || `Request failed: ${response.status}`); return; }

            if (json?.status === 'success' && json?.payload?.jobId) {
                window.location.href = `/results/${json.payload.jobId}`;
            } else if (json?.status === 'warning') {
                toast.warn(json.message);
            } else {
                toast.error(json?.message || 'Unexpected response from server.');
            }
        } catch (error) {
            toast.error(error.message || 'Submission failed.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box className="page-enter" sx={{ maxWidth: 680, margin: '0 auto', px: { xs: 3, sm: 4 }, pt: 6, pb: 10 }}>

            {/* Page header */}
            <Box sx={{ mb: 4 }}>
                <Typography sx={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#B8893A',
                    mb: 0.5,
                }}>
                    Analysis
                </Typography>
                <Typography variant="h4" sx={{ letterSpacing: '-0.02em', mb: 1 }}>
                    TTE Comparison
                </Typography>
                <Typography sx={{ color: '#5C5341', fontSize: '0.9rem' }}>
                    Upload GenBank files to compare thioesterase domain sequences against a reference.
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                {/* Reference file */}
                <SectionCard>
                    <SectionLabel>Reference File</SectionLabel>
                    <Typography variant="body2" sx={{ color: '#5C5341', mb: 2, fontSize: '0.85rem' }}>
                        Upload a single GenBank (.gb / .gbk) file to use as the reference sequence.
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Button
                            component="label"
                            variant="outlined"
                            startIcon={<UploadFileIcon />}
                            size="small"
                            sx={{
                                borderColor: '#E0CFA4',
                                color: '#5C5341',
                                '&:hover': { borderColor: '#B8893A', color: '#B8893A', background: 'rgba(184,137,58,0.04)' },
                            }}
                        >
                            Choose file
                            <input type="file" accept=".gb,.gbk" hidden onChange={handleFileAUpload} />
                        </Button>
                        {referenceFile ? (
                            <Chip
                                label={referenceFile.name}
                                size="small"
                                onDelete={() => setFileA(null)}
                                sx={{
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 12,
                                    backgroundColor: '#E8F4F3',
                                    color: '#2A6B68',
                                    border: '1px solid rgba(42,107,104,0.2)',
                                }}
                            />
                        ) : (
                            <Typography variant="body2" sx={{ color: '#B8A07A', fontStyle: 'italic', fontSize: '0.825rem' }}>
                                No file selected
                            </Typography>
                        )}
                    </Box>
                </SectionCard>

                {/* Input files */}
                <SectionCard>
                    <SectionLabel>Input Files</SectionLabel>
                    <Typography variant="body2" sx={{ color: '#5C5341', mb: 2, fontSize: '0.85rem' }}>
                        Upload one or more GenBank files to compare against the reference.
                    </Typography>
                    <Button
                        component="label"
                        variant="outlined"
                        startIcon={<UploadFileIcon />}
                        size="small"
                        sx={{
                            borderColor: '#E0CFA4',
                            color: '#5C5341',
                            mb: inputFiles.length > 0 ? 2 : 0,
                            '&:hover': { borderColor: '#B8893A', color: '#B8893A', background: 'rgba(184,137,58,0.04)' },
                        }}
                    >
                        Add files
                        <input type="file" accept=".gb,.gbk" multiple hidden onChange={handleInputFilesUpload} />
                    </Button>

                    {inputFiles.length > 0 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                            {inputFiles.map(f => (
                                <Box key={f.name} sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    px: 1.5,
                                    py: 0.75,
                                    background: '#F5EDD5',
                                    borderRadius: 1.5,
                                    border: '1px solid #E0CFA4',
                                }}>
                                    <Typography variant="body2" sx={{
                                        flex: 1,
                                        fontFamily: "'DM Mono', monospace",
                                        fontSize: 12,
                                        color: '#5C5341',
                                    }}>
                                        {f.name}
                                    </Typography>
                                    <IconButton size="small" onClick={() => handleRemoveInputFile(f.name)} sx={{
                                        color: '#C8AE78',
                                        p: '4px',
                                        '&:hover': { color: '#8C2D4F', background: 'rgba(140,45,79,0.08)' },
                                    }}>
                                        <FaTrash size={11} />
                                    </IconButton>
                                </Box>
                            ))}
                        </Box>
                    )}
                </SectionCard>

                {/* PARAS options */}
                <SectionCard>
                    <SectionLabel>PARAS Options</SectionLabel>
                    <FormControl>
                        <RadioGroup value={runParas} onChange={(e) => setRunParas(e.target.value)}>
                            <FormControlLabel
                                value="tte_only"
                                control={<Radio size="small" />}
                                label={<Typography sx={{ fontSize: '0.9rem' }}>TTE comparison only</Typography>}
                            />
                            <FormControlLabel
                                value="tte_paras"
                                control={<Radio size="small" />}
                                label={<Typography sx={{ fontSize: '0.9rem' }}>TTE comparison + PARAS substrate prediction</Typography>}
                            />
                        </RadioGroup>
                    </FormControl>

                    {runParas === 'tte_paras' && (
                        <Box sx={{ mt: 2, ml: 3.5 }}>
                            <Typography variant="body2" sx={{ color: '#5C5341', mb: 1, fontSize: '0.825rem' }}>
                                PARAS model
                            </Typography>
                            <Select
                                size="small"
                                value={parasModel}
                                onChange={(e) => setParasModel(e.target.value)}
                                sx={{ minWidth: 260 }}
                            >
                                <MenuItem value="parasAllSubstrates">PARAS — all substrates</MenuItem>
                                <MenuItem value="parasCommonSubstrates">PARAS — common substrates</MenuItem>
                            </Select>
                        </Box>
                    )}
                </SectionCard>

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 1.5, pt: 1 }}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={handleRefresh}
                        sx={{
                            borderColor: '#E0CFA4',
                            color: '#5C5341',
                            '&:hover': { borderColor: '#B8893A', color: '#B8893A', background: 'rgba(184,137,58,0.04)' },
                        }}
                    >
                        Reset
                    </Button>
                    <Button
                        variant="contained"
                        color="secondary"
                        endIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                        onClick={handleSubmit}
                        disabled={isLoading || !referenceFile || inputFiles.length === 0}
                        sx={{ minWidth: 120 }}
                    >
                        {isLoading ? 'Submitting…' : 'Submit'}
                    </Button>
                </Box>
            </Box>
        </Box>
    );
};

export default SubmitTTE;
