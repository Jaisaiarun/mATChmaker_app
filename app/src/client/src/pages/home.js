import React from 'react';
import { Box, Link, Tooltip, Typography, Chip } from '@mui/material';
import ExitIcon from '@mui/icons-material/ExitToApp';
import ScienceIcon from '@mui/icons-material/Science';
import GitHubIcon from '@mui/icons-material/GitHub';

const tools = [
    {
        href: '/submit_tte',
        label: 'TTE Comparison',
        description: 'Compare thioesterase domain sequences across GenBank entries',
        accent: '#2A6B68',
    },
    {
        href: '/annotate_gbk',
        label: 'PARAS Annotation',
        description: 'Annotate GenBank files with PARAS substrate predictions',
        accent: '#B8893A',
    },
    {
        href: '/annotate_xu_xut',
        label: 'XUT / XU Annotation',
        description: 'Annotate XU and XUT domains from sequence data',
        accent: '#6B4F8C',
    },
    {
        href: '/annotate_antismash',
        label: 'antiSMASH Annotation',
        description: 'Process and annotate antiSMASH biosynthetic gene cluster output',
        accent: '#8C2D4F',
    },
    // {
    //     href: '/retrieve',
    //     label: 'Retrieve Results',
    //     description: 'Retrieve previously submitted job results by job ID',
    //     accent: '#4A8C5C',
    // },
    // {
    //     href: '/data_annotation',
    //     label: 'Data Annotation',
    //     description: 'Manually annotate domain substrate data for curation',
    //     accent: '#7A6B3A',
    // },
    // {
    //     href: '/query_database',
    //     label: 'Query Database',
    //     description: 'Query the substrate and domain database directly',
    //     accent: '#5C3A8C',
    // },

];

const Home = () => {
    return (
        <Box
            className="page-enter"
            sx={{
                maxWidth: 760,
                margin: '0 auto',
                px: { xs: 3, sm: 5 },
                pt: { xs: 5, sm: 7 },
                pb: 10,
            }}
        >
            {/* Hero — centred with large logo above text */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', mb: 5 }}>
                <Box
                    component="img"
                    src="/mATChmaker_square.png"
                    alt="mATChmaker logo"
                    sx={{
                        width: { xs: 120, sm: 148 },
                        height: { xs: 120, sm: 148 },
                        borderRadius: 4,
                        boxShadow: '0 6px 28px rgba(28,26,20,0.20), 0 2px 6px rgba(28,26,20,0.10)',
                        mb: 3,
                        display: 'block',
                    }}
                />

                <Chip
                    label="iGEM Marburg 2025"
                    size="small"
                    sx={{
                        mb: 1.5,
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 11,
                        height: 24,
                        backgroundColor: '#E8F4F3',
                        color: '#2A6B68',
                        border: '1px solid rgba(42,107,104,0.22)',
                        borderRadius: '4px',
                    }}
                />

                <Typography
                    variant="h3"
                    sx={{
                        fontFamily: "'DM Serif Display', Georgia, serif",
                        fontSize: { xs: '2.2rem', sm: '2.8rem' },
                        lineHeight: 1.05,
                        letterSpacing: '-0.025em',
                        color: '#1C1A14',
                        mb: 1.5,
                    }}
                >
                    mATChmaker
                </Typography>

                <Typography
                    sx={{
                        color: '#5C5341',
                        maxWidth: 440,
                        lineHeight: 1.65,
                        fontSize: '0.975rem',
                    }}
                >
                    A toolkit for modular NRPS domain compatibility analysis and substrate matching across biosynthetic gene clusters.
                </Typography>
            </Box>

            {/* Divider */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
                <Box sx={{ flex: 1, height: '1px', background: '#E0CFA4' }} />
                <Typography sx={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10,
                    color: '#B8893A',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                }}>
                    Analysis Tools
                </Typography>
                <Box sx={{ flex: 1, height: '1px', background: '#E0CFA4' }} />
            </Box>

            {/* Tool cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 4 }}>
                {tools.map((tool) => (
                    <Box
                        key={tool.href}
                        component="a"
                        href={tool.href}
                        sx={{
                            display: 'block',
                            textDecoration: 'none',
                            p: '16px 18px',
                            background: '#FEFCF5',
                            border: '1px solid #E0CFA4',
                            borderRadius: 2,
                            cursor: 'pointer',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            position: 'relative',
                            overflow: 'hidden',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 18px rgba(28,26,20,0.10)',
                            },
                            '&::before': {
                                content: '""',
                                position: 'absolute',
                                top: 0, left: 0,
                                width: 3, height: '100%',
                                background: tool.accent,
                                borderRadius: 0,
                            },
                        }}
                    >
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#1C1A14', mb: 0.5 }}>
                            {tool.label}
                        </Typography>
                        <Typography sx={{ fontSize: '0.82rem', color: '#5C5341', lineHeight: 1.5 }}>
                            {tool.description}
                        </Typography>
                    </Box>
                ))}
            </Box>

            {/* External links */}
            <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                <Tooltip title="Opens iGEM wiki in a new tab" arrow>
                    <Link href="https://2025.igem.wiki/marburg/" target="_blank" underline="none"
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.8, fontSize: '0.875rem', fontWeight: 500, color: '#2A6B68', '&:hover': { color: '#3D9490' } }}>
                        <ScienceIcon sx={{ fontSize: 16 }} />
                        iGEM Wiki
                        <ExitIcon sx={{ fontSize: 13, opacity: 0.65 }} />
                    </Link>
                </Tooltip>
                <Tooltip title="Opens GitHub in a new tab" arrow>
                    <Link href="https://github.com/Jaisaiarun/mATChmaker-iGEM-Marburg-2025" target="_blank" underline="none"
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.8, fontSize: '0.875rem', fontWeight: 500, color: '#5C5341', '&:hover': { color: '#1C1A14' } }}>
                        <GitHubIcon sx={{ fontSize: 16 }} />
                        GitHub
                        <ExitIcon sx={{ fontSize: 13, opacity: 0.65 }} />
                    </Link>
                </Tooltip>
            </Box>
        </Box>
    );
};

export default Home;
