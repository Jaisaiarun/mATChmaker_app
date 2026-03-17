import React, {useState} from 'react';
import {toast} from 'react-toastify';
import {Box, Button, CircularProgress, Divider, IconButton, Input, Typography} from '@mui/material';
import {FaTrash} from 'react-icons/fa';

const SubmitTTE = () => {
    // loading state
    const [isLoading, setIsLoading] = useState(false);

    // two required input files
    const [referenceFile, setFileA] = useState(null);
    const [inputFiles, setInputFiles] = useState([]);

    // refresh page
    const handleRefresh = () => {
        localStorage.removeItem('results');
        window.location.reload();
    };

    const isGenBankFile = (file) => {
        if (!file) return false;
        const name = file.name.toLowerCase();
        return name.endsWith('.gbk') || name.endsWith('.gb');
    };


    // file handlers
    const handleFileAUpload = (e) => {
        const file = e.target.files[0];
        if (!file) {
            setFileA(null);
            return;
        }

        if (!isGenBankFile(file)) {
            toast.error('Only .gbk or .gb files are allowed for TTE input.');
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
            if (!isGenBankFile(file)) {
                toast.warn(`Skipped "${file.name}": not .gb/.gbk`);
                return false;
            }
            if (existingNames.has(file.name)) {
                toast.warn(`Skipped "${file.name}": already added`);
                return false;
            }
            return true;
        });
        if (accepted.length) setInputFiles(prev => [...prev, ...accepted]);
        e.target.value = null; // allow re-adding same filename after removal
    };

    const handleRemoveInputFile = (name) => {
        setInputFiles(prev => prev.filter(f => f.name !== name));
    }


    // submit handler
    const handleSubmit = async () => {
        if (!referenceFile || inputFiles.length === 0) {
            toast.error('Please upload both input and reference Files.');
            return;
        }

        setIsLoading(true);

        try {
            const formData = new FormData();
            formData.append('reference_file', referenceFile);
            inputFiles.forEach(f => formData.append('input_files[]', f));

            const response = await fetch('/api/submit_tte', {
                method: 'POST',
                body: formData
            });

            let json = null;
            let text = '';

            try {
                text = await response.text();
                json = JSON.parse(text);
            } catch (e) {
                console.error('Backend returned non-JSON response:', text);
            }

            if (!response.ok) {
                if (json?.message) {
                    toast.error(json.message);
                } else {
                    toast.error(`Request failed: ${response.status} ${response.statusText}`);
                }
                return;
            }

            if (json?.status === 'success' && json?.payload?.jobId) {
                const jobId = json.payload.jobId;
                window.location.href = `/results/${jobId}`;
            } else if (json?.status === 'warning') {
                toast.warn(json.message);
            } else {
                toast.error(json?.message || 'Unexpected response from server.');
            }

        } catch (error) {
            console.error('Console Error:', error);
            toast.error(error.message || 'Submission failed.');
        } finally {
            setIsLoading(false);
        }
        setIsLoading(false);
    };

    return (
        <Box
            display="flex"
            flexDirection="column"
            padding={4}
            maxWidth={700}
            margin="auto"
        >
            <Typography variant="h4" gutterBottom>
                Submit TTE Data
            </Typography>

            <Divider sx={{mb: 3}}/>

            {/* First file */}
            <Box sx={{mb: 3}}>
                <Typography gutterBottom>
                    Upload Reference Genbank file
                </Typography>
                <Input
                    type="file"
                    inputProps={{accept: '.gb,.gbk'}}
                    onChange={handleFileAUpload}
                />
            </Box>

            {/* Second file */}
            <Box sx={{mb: 4}}>
                <Typography gutterBottom>
                    Upload Input Genbank files
                </Typography>
                <Input
                    type="file"
                    inputProps={{accept: '.gb,.gbk', multiple: true}}
                    onChange={handleInputFilesUpload}
                />
                {inputFiles.map(f => (
                    <Box key={f.name} sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 0.5}}>
                        <Typography variant="body2">{f.name}</Typography>
                        <IconButton size="small" onClick={() => handleRemoveInputFile(f.name)}>
                            <FaTrash size={12}/>
                        </IconButton>
                    </Box>
                ))}
            </Box>

            {/* Action buttons */}
            <Box display="flex" gap={2}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleRefresh}
                >
                    Refresh
                </Button>

                <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleSubmit}
                    disabled={isLoading || !referenceFile || inputFiles.length === 0}
                >
                    {isLoading ? <CircularProgress size={24}/> : 'Submit'}
                </Button>
            </Box>
        </Box>
    );
};

export default SubmitTTE;
