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
import TravelExploreIcon from '@mui/icons-material/TravelExplore';

const featuredTool = {
    href: '/submit_tte_search',
    label: 'TTE Reference Search',
    description: 'Search a query sequence against the precomputed TTE reference database',
    accent: '#1C6B8C',
    iconBg: 'rgba(28,107,140,0.10)',
    Icon: TravelExploreIcon,
    iconColor: '#1C6B8C',
};

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
                background: '#F2E8D0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                px: {xs: 3, sm: 4},
                pt: {xs: 3, sm: 4},
                pb: 5,
            }}
        >
            {/* ── Logo — trimmed asset, no duplicate wordmark below ── */}
            <Box
                component="img"
                src="/mATCmaker_transparent.png"
                alt="mATChmaker logo"
                sx={{
                    width: {xs: 150, sm: 180, md: 210},
                    height: 'auto',
                    objectFit: 'contain',
                    display: 'block',
                    mb: 1.5,
                }}
            />

            {/* ── Subtitle ── */}
            <Typography sx={{
                color: '#5C5341',
                maxWidth: 520,
                lineHeight: 1.55,
                fontSize: '0.95rem',
                textAlign: 'center',
                mb: 3,
            }}>
                A toolkit for modular NRPS domain compatibility analysis and substrate matching
                across biosynthetic gene clusters.
            </Typography>

            {/* ── Section label ── */}
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                width: '100%', maxWidth: 760, mb: 2,
            }}>
                <Box sx={{flex: 1, height: '1px', background: '#DCCFA0'}}/>
                <Typography sx={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10.5,
                    color: '#8C7A54',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                }}>
                    Analysis Tools
                </Typography>
                <Box sx={{flex: 1, height: '1px', background: '#DCCFA0'}}/>
            </Box>

            {/* ── Featured tool — TTE Reference Search ── */}
            <Box
                component={RouterLink}
                to={featuredTool.href}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    textDecoration: 'none',
                    width: '100%',
                    maxWidth: 760,
                    p: '18px 22px',
                    mb: 1.5,
                    background: `linear-gradient(135deg, ${featuredTool.accent}14 0%, #FEFCF5 65%)`,
                    border: `1px solid ${featuredTool.accent}55`,
                    borderRadius: '12px',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 24px rgba(28,26,20,0.10)',
                    },
                }}
            >
                <Box sx={{
                    width: 46, height: 46,
                    borderRadius: '11px',
                    background: featuredTool.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <featuredTool.Icon sx={{fontSize: 24, color: featuredTool.iconColor}}/>
                </Box>
                <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography sx={{
                        fontSize: 9.5,
                        fontFamily: "'DM Mono', monospace",
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: featuredTool.accent,
                        mb: 0.3,
                    }}>
                        Featured
                    </Typography>
                    <Typography sx={{
                        fontWeight: 600,
                        fontSize: '1rem',
                        color: '#1C1A14',
                        mb: 0.3,
                        lineHeight: 1.3,
                    }}>
                        {featuredTool.label}
                    </Typography>
                    <Typography sx={{
                        fontSize: '0.82rem',
                        color: '#6B5F47',
                        lineHeight: 1.5,
                    }}>
                        {featuredTool.description}
                    </Typography>
                </Box>
            </Box>

            {/* ── Tool cards — even 2x2 grid, no orphaned row ── */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: {xs: '1fr', sm: '1fr 1fr'},
                gap: 1.25,
                width: '100%',
                maxWidth: 760,
                mb: 4,
            }}>
                {tools.map((tool) => (
                    <Box
                        key={tool.href}
                        component={RouterLink}
                        to={tool.href}
                        sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1.75,
                            textDecoration: 'none',
                            p: '15px 18px',
                            background: '#FEFCF5',
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
                            width: 40, height: 40,
                            borderRadius: '10px',
                            background: tool.iconBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            mt: 0.25,
                        }}>
                            <tool.Icon sx={{fontSize: 20, color: tool.iconColor}}/>
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
                    color: '#8C7A54',
                    letterSpacing: '0.05em',
                }}>
                    Max Planck Institute for Terrestrial Microbiology &nbsp;·&nbsp; AG Bode &nbsp;·&nbsp; NRPS
                </Typography>
                <Typography sx={{
                    fontSize: 13,
                    color: '#5C5341',
                    letterSpacing: '0.01em',
                }}>
                    Dr. Patrick Gonschorek &nbsp;·&nbsp; Dr. Christian Schelhas &nbsp;·&nbsp; Jaisaiarun Prathapam Srinivasan
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