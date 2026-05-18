import React from 'react';
import {Link as RouterLink} from 'react-router-dom';
import {Box, Link, Tooltip, Typography} from '@mui/material';
import ExitIcon from '@mui/icons-material/ExitToApp';
import ScienceIcon from '@mui/icons-material/Science';
import GitHubIcon from '@mui/icons-material/GitHub';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import DescriptionIcon from '@mui/icons-material/Description';
import BiotechIcon from '@mui/icons-material/Biotech';
import HubIcon from '@mui/icons-material/Hub';

const tools = [
    {
        href: '/submit_tte',
        label: 'TTE Comparison',
        description: 'Compare thioesterase domain sequences across GenBank entries',
        accent: '#2A6B68',
        iconBg: 'rgba(42,107,104,0.10)',
        Icon: ShowChartIcon,
        iconColor: '#2A6B68',
    },
    {
        href: '/annotate_gbk',
        label: 'PARAS Annotation',
        description: 'Annotate GenBank files with PARAS substrate predictions',
        accent: '#B8893A',
        iconBg: 'rgba(184,137,58,0.10)',
        Icon: DescriptionIcon,
        iconColor: '#B8893A',
    },
    {
        href: '/annotate_xu_xut',
        label: 'XUT / XU Annotation',
        description: 'Annotate XU and XUT domains from sequence data',
        accent: '#6B4F8C',
        iconBg: 'rgba(107,79,140,0.10)',
        Icon: BiotechIcon,
        iconColor: '#6B4F8C',
    },
    {
        href: '/annotate_antismash',
        label: 'antiSMASH Annotation',
        description: 'Process and annotate antiSMASH biosynthetic gene cluster output',
        accent: '#8C2D4F',
        iconBg: 'rgba(140,45,79,0.10)',
        Icon: HubIcon,
        iconColor: '#8C2D4F',
    },
];

const Home = () => {
    return (
        <Box
            className="page-enter"
            sx={{
                minHeight: '100vh',
                background: '#EDE5CC',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                px: {xs: 3, sm: 4},
                pt: {xs: 6, sm: 8},
                pb: 8,
            }}
        >
            {/* ── Logo — large, centred on parchment ── */}
            <Box
                component="img"
                src="/mATCmaker_transparent.png"
                alt="mATChmaker logo"
                sx={{
                    width: {xs: 220, sm: 280, md: 340},
                    height: 'auto',
                    objectFit: 'contain',
                    display: 'block',
                    mb: 3,
                }}
            />

            {/* ── Title ── */}
            <Typography sx={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontSize: {xs: '2rem', sm: '2.6rem'},
                letterSpacing: '-0.02em',
                lineHeight: 1.05,
                color: '#1C1A14',
                mb: 1.5,
                textAlign: 'center',
            }}>
                mATChmaker
            </Typography>

            {/* ── Subtitle ── */}
            <Typography sx={{
                color: '#5C5341',
                maxWidth: 520,
                lineHeight: 1.65,
                fontSize: '1rem',
                textAlign: 'center',
                mb: 5,
            }}>
                A toolkit for modular NRPS domain compatibility analysis and substrate matching
                across biosynthetic gene clusters.
            </Typography>

            {/* ── Section label ── */}
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                width: '100%', maxWidth: 700, mb: 2.5,
            }}>
                <Box sx={{flex: 1, height: '1px', background: '#D0BE90'}}/>
                <Typography sx={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10.5,
                    color: '#B8893A',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                }}>
                    Analysis Tools
                </Typography>
                <Box sx={{flex: 1, height: '1px', background: '#D0BE90'}}/>
            </Box>

            {/* ── Tool cards ── */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: {xs: '1fr', sm: '1fr 1fr'},
                gap: 1.5,
                width: '100%',
                maxWidth: 700,
                mb: 5,
            }}>
                {tools.map((tool) => (
                    <Box
                        key={tool.href}
                        component={RouterLink}
                        to={tool.href}
                        sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 2,
                            textDecoration: 'none',
                            p: '18px 20px',
                            background: '#FAF6EC',
                            border: '1px solid #E0CFA4',
                            borderRadius: '10px',
                            position: 'relative',
                            overflow: 'hidden',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 20px rgba(28,26,20,0.09)',
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
                        {/* Icon */}
                        <Box sx={{
                            width: 44, height: 44,
                            borderRadius: '10px',
                            background: tool.iconBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            mt: 0.25,
                        }}>
                            <tool.Icon sx={{fontSize: 22, color: tool.iconColor}}/>
                        </Box>

                        {/* Text */}
                        <Box>
                            <Typography sx={{
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                color: '#1C1A14',
                                mb: 0.4,
                                lineHeight: 1.3,
                            }}>
                                {tool.label}
                            </Typography>
                            <Typography sx={{
                                fontSize: '0.8rem',
                                color: '#6B5F47',
                                lineHeight: 1.55,
                            }}>
                                {tool.description}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Box>

            {/* ── Attribution ── */}
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.75,
                textAlign: 'center',
                mb: 3,
            }}>
                <Typography sx={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    color: '#B8893A',
                    letterSpacing: '0.05em',
                }}>
                    Max Planck Institute for Terrestrial Microbiology &nbsp;·&nbsp; AG Bode &nbsp;·&nbsp; NRPS
                </Typography>
                <Typography sx={{
                    fontSize: 13,
                    color: '#7A6A50',
                    letterSpacing: '0.01em',
                }}>
                    Dr. Patrick Gonschorek &nbsp;·&nbsp; Dr. Christian Schelhas &nbsp;·&nbsp; Jaisaiarun
                </Typography>
            </Box>

            {/* ── External links ── */}
            <Box sx={{display: 'flex', gap: 3}}>
                <Tooltip title="Opens iGEM wiki in a new tab" arrow>
                    <Link href="https://2025.igem.wiki/marburg/" target="_blank" underline="none"
                          sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.8,
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              color: '#2A6B68',
                              '&:hover': {color: '#3D9490'}
                          }}>
                        <ScienceIcon sx={{fontSize: 15}}/>
                        iGEM Wiki
                        <ExitIcon sx={{fontSize: 12, opacity: 0.6}}/>
                    </Link>
                </Tooltip>
                <Tooltip title="Opens GitHub in a new tab" arrow>
                    <Link href="https://github.com/Jaisaiarun/mATChmaker-iGEM-Marburg-2025" target="_blank"
                          underline="none"
                          sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.8,
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              color: '#5C5341',
                              '&:hover': {color: '#1C1A14'}
                          }}>
                        <GitHubIcon sx={{fontSize: 15}}/>
                        GitHub
                        <ExitIcon sx={{fontSize: 12, opacity: 0.6}}/>
                    </Link>
                </Tooltip>
            </Box>
        </Box>
    );
};

export default Home;