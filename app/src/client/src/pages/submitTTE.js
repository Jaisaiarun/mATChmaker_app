import React, { useState } from 'react';
import { toast } from 'react-toastify';
import {
  Box,
  Button,
  Divider,
  Typography,
  Input,
  CircularProgress
} from '@mui/material';

const SubmitTTE = () => {
  // loading state
  const [isLoading, setIsLoading] = useState(false);

  // two required input files
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);

  // refresh page
  const handleRefresh = () => {
    localStorage.removeItem('results');
    window.location.reload();
  };

  // file handlers
  const handleFileAUpload = (e) => {
    setFileA(e.target.files[0] || null);
  };

  const handleFileBUpload = (e) => {
    setFileB(e.target.files[0] || null);
  };

  // submit handler
  const handleSubmit = async () => {
    if (!fileA || !fileB) {
      toast.error('Please upload both input files.');
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('fileA', fileA);
      formData.append('fileB', fileB);

      const response = await fetch('/api/submit_tte', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Network response was not ok!');
      }

      const json = await response.json();

      if (json.status === 'success') {
        const jobId = json.payload.jobId;
        window.location.href = `/results/${jobId}`;
      } else if (json.status === 'warning') {
        toast.warn(json.message);
      } else {
        toast.error(json.message);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message);
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

      <Divider sx={{ mb: 3 }} />

      {/* First file */}
      <Box sx={{ mb: 3 }}>
        <Typography gutterBottom>
          Upload first input file
        </Typography>
        <Input type="file" onChange={handleFileAUpload} />
      </Box>

      {/* Second file */}
      <Box sx={{ mb: 4 }}>
        <Typography gutterBottom>
          Upload second input file
        </Typography>
        <Input type="file" onChange={handleFileBUpload} />
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
          disabled={isLoading || !fileA || !fileB}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Submit'}
        </Button>
      </Box>
    </Box>
  );
};

export default SubmitTTE;
