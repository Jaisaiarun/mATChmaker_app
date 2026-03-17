import React from 'react';
import {Box, Button, Link, Tooltip, Typography} from '@mui/material';
import ExitIcon from '@mui/icons-material/ExitToApp';

/**
 * Home component that displays the home page content.
 *
 * @returns {React.ReactElement} - The component showing the home page content.
 */
const Home = () => {
    return (
        <Box
            display='flex'
            flexDirection='column'
            justifyContent='center'
            alignItems='center'
            minHeight='80vh' // vertically centers content without taking full screen
            padding={4} // larger padding for better spacing
        >
            <Box display='flex' flexDirection='row' justifyContent='center' alignItems='center'>
                <Box
                    component='img'
                    // src='/paras.png'
                    src='/mATChmaker_square.png'
                    alt='mATChmaker logo'
                    sx={{maxWidth: 300}}
                />
                {/*<Box*/}
                {/*    component='img'*/}
                {/*    // src='/parasect.png'*/}
                {/*    src='/mATChmaker_square.png'*/}
                {/*    alt='PARASECT logo'*/}
                {/*    sx={{ maxWidth: 300 }}*/}
                {/*/>*/}
            </Box>

            <Typography variant='h3' component='div' fontWeight='bold' gutterBottom>
                {/*Welcome to PARAS(ECT)!*/}
                Welcome to mATChmaker!
            </Typography>

            <Typography variant='h6' component='div' color='textSecondary' align='center' gutterBottom>
                {/*Discover our adenylation domain substrate specificity prediction models.*/}
                mATChmaker is a tool for modular NRPS domain compatibility and substrate matching.
            </Typography>

            <Box
                sx={{
                    mt: 4,
                    mb: 2,
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 2
                }}
            >
                <Button
                    variant='contained'
                    color='primary'
                    size='large'
                    href='/submit'
                    sx={{marginBottom: 3}}
                >
                    <Typography sx={{color: 'white.main'}}>
                        Start predicting
                    </Typography>
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    size='large'
                    href="/submit_tte"
                    sx={{marginBottom: 3}}
                >
                    Start TTE Comparison
                </Button>
                 <Button
                    variant="contained"
                    color="primary"
                    size='large'
                    href="/submit_paras_annotation"
                    sx={{marginBottom: 3}}
                >
                    Annotate GenBank with PARAS
                </Button>

                <Button
                    variant='contained'
                    color='primary'
                    size='large'
                    href='/retrieve'
                    sx={{marginBottom: 3}}
                >
                    <Typography sx={{color: 'white.main'}}>
                        Retrieve results
                    </Typography>
                </Button>
                <Button
                    variant='contained'
                    color='primary'
                    size='large'
                    href='/data_annotation'
                    sx={{marginBottom: 3}}
                >
                    <Typography sx={{color: 'white.main'}}>
                        Annotate domain
                    </Typography>
                </Button>
                <Button
                    variant='contained'
                    color='primary'
                    size='large'
                    href='/query_database'
                    sx={{marginBottom: 3}}
                >
                    <Typography sx={{color: 'white.main'}}>
                        Query database
                    </Typography>
                </Button>
            </Box>

            <Typography variant='body1' align='center' color='textSecondary' gutterBottom>
                <Box sx={{display: 'flex', alignItems: 'center'}}>
                    Want to learn more NRPS and mATChmaker?
                    <Tooltip title='Opens new tab to bioRxiv.' arrow>
                        <Link
                            href='https://2025.igem.wiki/marburg/'
                            underline='hover'
                            target='_blank'
                            sx={{marginLeft: 1, fontWeight: 'bold'}}
                        >
                            <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                Visit our iGEM wiki page
                                <ExitIcon fontSize='small'/>
                            </Box>
                        </Link>
                    </Tooltip>
                </Box>
            </Typography>

            <Typography variant='body1' align='center' color='textSecondary'>
                <Box sx={{display: 'flex', alignItems: 'center'}}>
                    Github Page for mATChmaker
                    <Tooltip title='Opens new tab to GitHub.' arrow>
                        <Link
                            href='https://github.com/Jaisaiarun/mATChmaker-iGEM-Marburg-2025'
                            target='_blank'
                            underline='hover'
                            sx={{marginLeft: 1, fontWeight: 'bold'}}
                        >
                            <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                Visit our GitHub page
                                <ExitIcon fontSize='small'/>
                            </Box>
                        </Link>
                    </Tooltip>
                </Box>
            </Typography>
        </Box>
    );
};

export default Home;
