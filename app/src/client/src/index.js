import React, {useEffect, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter, Route, Routes, useNavigate} from 'react-router-dom';
import {createTheme, ThemeProvider} from '@mui/material/styles';
import {AppBar, IconButton, Menu, MenuItem, Toolbar, Typography} from '@mui/material';
import {MdMenu} from 'react-icons/md';
import HomeIcon from '@mui/icons-material/Home';
import UploadIcon from '@mui/icons-material/Upload';
import GitHubIcon from '@mui/icons-material/GitHub';
import RetrieveIcon from '@mui/icons-material/GetApp';
import DatasetIcon from '@mui/icons-material/Dataset'
import QueryStatsIcon from '@mui/icons-material/QueryStats';

import './style/main.css';

import Toast from './components/Toast';
import Home from './pages/home';
import Retrieve from './pages/retrieve';
import Submit from './pages/submit';
import Results from './pages/results';
import NotFound from './pages/not_found';
import DataAnnotation from './pages/data_annotation'
import AnnotationEditor from './pages/annotation_editor'
import QueryDatabase from './pages/query_database'

import SubmitTTE from "./pages/submitTTE";
import ResultsTTE from './pages/resultsTTE';
import SubmitParasAnnotation from './pages/submitParasAnnotation';
import SubmitXuXut from './pages/submitXuXut';
import ResultsXuXut from './pages/resultsxuxut';
import SubmitAntiSMASH from './pages/submitAntiSMASH';


/**
 * Custom theme for the app.
 *
 * @returns {Theme} - The custom theme for the app.
 */
// const theme = createTheme({
//     palette: {
//         primary: {
//             main: '#3d7dca',
//         },
//         secondary: {
//             main: '#ffcb05',
//         },
//         white: {
//             main: '#ffffff',
//         },
//         black: {
//             main: '#000000',
//         },
//         gray: {
//             main: '#f5f5f5',
//         },
//     },
//     typography: {
//         fontFamily: [
//             'Arial',
//             'Roboto',
//             'sans-serif',
//         ].join(','),
//     },
// });

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#B8893A',
            dark: '#8C6420',
            light: '#D4A85A',
            contrastText: '#FEFCF5',
        },
        secondary: {
            main: '#2A6B68',
            light: '#3D9490',
            contrastText: '#FEFCF5',
        },
        error: { main: '#8C2D4F' },
        background: {
            default: '#F2E8D0',
            paper: '#FEFCF5',
        },
        text: {
            primary: '#1C1A14',
            secondary: '#5C5341',
        },
        divider: '#E0CFA4',
    },
    shape: { borderRadius: 8 },
    typography: {
        fontFamily: "'Instrument Sans', system-ui, sans-serif",
        h1: { fontFamily: "'DM Serif Display', Georgia, serif" },
        h2: { fontFamily: "'DM Serif Display', Georgia, serif" },
        h3: { fontFamily: "'DM Serif Display', Georgia, serif" },
        h4: { fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400 },
        h5: { fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400 },
        h6: { fontWeight: 600, letterSpacing: '-0.01em' },
        button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    padding: '8px 20px',
                    boxShadow: 'none',
                    '&:hover': { boxShadow: '0 2px 8px rgba(28,26,20,0.15)' },
                },
                containedPrimary: {
                    background: 'linear-gradient(135deg, #C9973E 0%, #A87828 100%)',
                    '&:hover': { background: 'linear-gradient(135deg, #D4A850 0%, #B8893A 100%)' },
                },
                containedSecondary: {
                    background: 'linear-gradient(135deg, #3D9490 0%, #2A6B68 100%)',
                    '&:hover': { background: 'linear-gradient(135deg, #4AA8A4 0%, #347A77 100%)' },
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    boxShadow: '0 1px 0 rgba(28,26,20,0.12)',
                    backgroundImage: 'none',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: { backgroundImage: 'none' },
            },
        },
        MuiMenuItem: {
            styleOverrides: {
                root: {
                    fontSize: 14,
                    gap: 4,
                    borderRadius: 6,
                    margin: '1px 4px',
                    '&:hover': { backgroundColor: '#F2E8D0' },
                },
            },
        },
        MuiDivider: {
            styleOverrides: { root: { borderColor: '#E0CFA4' } },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        backgroundColor: '#FEFCF5',
                        '& fieldset': { borderColor: '#E0CFA4' },
                        '&:hover fieldset': { borderColor: '#B8893A' },
                        '&.Mui-focused fieldset': { borderColor: '#B8893A' },
                    },
                },
            },
        },
        MuiSelect: {
            styleOverrides: {
                root: {
                    backgroundColor: '#FEFCF5',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E0CFA4' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#B8893A' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#B8893A' },
                },
            },
        },
        MuiRadio: {
            styleOverrides: {
                root: { color: '#C8AE78', '&.Mui-checked': { color: '#2A6B68' } },
            },
        },
    },
});

/**
 * Custom toolbar for the app.
 *
 * @returns {React.ReactElement} - The custom toolbar for the app.
 */
const CustomToolbar = () => {
    // handle navigation
    const navigate = useNavigate();

    // version of the app
    const [version, setVersion] = useState('UNKNOWN');

    // fetch version from server
    useEffect(() => {
        fetch('/api/version')
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                setVersion(`v${data.version}`);
            })
            .catch((error) => {
                console.error('Failed to fetch version:', error);
                setVersion('v?');  // Fallback version if fetch fails
            });
    }, []);

    // state to handle menu
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);

    // function to handle opening menu
    const handleMenuOpen = (event) => {
        setAnchorEl(event.currentTarget);
    };

    // function to handle closing menu
    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    // handle meny item click
    const handleMenuItemClick = (path) => {
        navigate(path);
        handleMenuClose();
    };

    // function to open external link in a new tab
    const handleExternalLinkClick = (url) => {
        window.open(url, '_blank');  // open the link in a new tab
        handleMenuClose();  // close the menu after opening
    };

    return (
        <AppBar position='static' sx={{
            background: 'linear-gradient(90deg, #1C1A14 0%, #2C2616 100%)',
            borderBottom: '2px solid #B8893A',
        }}>
            <Toolbar sx={{ minHeight: 56, gap: 1 }}>
                <IconButton onClick={handleMenuOpen} sx={{
                    mr: 1,
                    color: '#E0CFA4',
                    border: '1px solid rgba(184,137,58,0.3)',
                    borderRadius: 2,
                    p: '6px',
                    '&:hover': { backgroundColor: 'rgba(184,137,58,0.12)', borderColor: '#B8893A' },
                }}>
                    <MdMenu size={18}/>
                </IconButton>

                <Menu
                    anchorEl={anchorEl}
                    open={open}
                    onClose={handleMenuClose}
                    PaperProps={{
                        sx: {
                            mt: 1,
                            border: '1px solid #E0CFA4',
                            borderRadius: 2,
                            boxShadow: '0 8px 24px rgba(28,26,20,0.14)',
                            backgroundColor: '#FEFCF5',
                            minWidth: 220,
                            py: 0.5,
                        }
                    }}
                >
                    <MenuItem onClick={() => handleMenuItemClick('/')}>
                        <HomeIcon sx={{marginRight: '10px'}}/>
                        Home
                    </MenuItem>
                    <MenuItem onClick={() => handleMenuItemClick('/submit')}>
                        <UploadIcon sx={{marginRight: '10px'}}/>
                        Submit
                    </MenuItem>

                    <MenuItem onClick={() => handleMenuItemClick("/submit_tte")}>
                        <UploadIcon sx={{marginRight: '10px'}}/>
                        TTE Comparison
                    </MenuItem>
                    <MenuItem onClick={() => handleMenuItemClick('/annotate_gbk')}>
                        <UploadIcon sx={{marginRight: '10px'}}/>
                        Annotate GenBank (PARAS)
                    </MenuItem>
                    <MenuItem onClick={() => handleMenuItemClick('/annotate_xu_xut')}>
                        <UploadIcon sx={{marginRight: '10px'}}/>
                        XUT / XU Annotation
                    </MenuItem>
                    <MenuItem onClick={() => handleMenuItemClick('/annotate_antismash')}>
                        <UploadIcon sx={{marginRight: '10px'}}/>
                        antiSMASH Annotation
                    </MenuItem>
                    <MenuItem onClick={() => handleMenuItemClick('/retrieve')}>
                        <RetrieveIcon sx={{marginRight: '10px'}}/>
                        Retrieve
                    </MenuItem>
                    <MenuItem onClick={() => handleMenuItemClick('/data_annotation')}>
                        <DatasetIcon sx={{marginRight: '10px'}}/>
                        Data annotation
                    </MenuItem>
                    <MenuItem onClick={() => handleMenuItemClick('/query_database')}>
                        <QueryStatsIcon sx={{marginRight: '10px'}}/>
                        Query database
                    </MenuItem>
                    <MenuItem
                        onClick={() => handleExternalLinkClick('https://github.com/Jaisaiarun/mATChmaker_app/issues')}>
                        <GitHubIcon sx={{marginRight: '10px'}}/>
                        Report an issue
                    </MenuItem>
                </Menu>

                {/* display name and version next to hamburger */}
                <Typography
                    variant='h6'
                    sx={{
                        marginLeft: '8px',
                        fontFamily: "'DM Serif Display', Georgia, serif",
                        fontSize: '1.2rem',
                        color: '#E0CFA4',
                        letterSpacing: '-0.01em',
                        flexGrow: 1,
                    }}
                >
                    mATChmaker
                    <Typography component="span" sx={{
                        fontSize: '11px',
                        color: 'rgba(224,207,164,0.55)',
                        fontFamily: "'DM Mono', monospace",
                        fontWeight: 400,
                        ml: 1.5,
                        letterSpacing: '0.04em',
                    }}>
                        {version}
                    </Typography>
                </Typography>
            </Toolbar>
        </AppBar>
    );
};

/**
 * App routes for the app.
 *
 * @returns {React.ReactElement} - The app routes for the app.
 */
function AppRoutes() {
    return (
        <div>
            <Routes>
                <Route
                    path='/'
                    element={<Home/>}
                />
                <Route
                    path='/submit'
                    element={<Submit/>}
                />
                <Route
                    path="/submit_tte"
                    element={<SubmitTTE/>}
                />
                <Route
                    path='/annotate_gbk'
                    element={<SubmitParasAnnotation/>}/>
                <Route
                    path='/annotate_xu_xut'
                    element={<SubmitXuXut/>}/>
                <Route
                    path='/annotate_antismash'
                    element={<SubmitAntiSMASH/>}/>
                <Route
                    path='/retrieve'
                    element={<Retrieve/>}
                />
                <Route
                    path='/results/xu_xut/:jobId'
                    element={<ResultsXuXut/>}
                />
                <Route
                    path='/results/tte/:jobId'
                    element={<ResultsTTE/>}
                />
                <Route
                    path='/results/:jobId'
                    element={<Results/>}
                />
                <Route
                    path='/annotation_editor/:jobId'
                    element={<AnnotationEditor/>}
                />
                <Route
                    path='/data_annotation'
                    element={<DataAnnotation/>}
                />
                <Route
                    path='/query_database'
                    element={<QueryDatabase/>}
                />
                <Route
                    path='*'
                    element={<NotFound/>}
                />
            </Routes>
        </div>
    );
}

/**
 * Main app component.
 *
 * @returns {React.ReactElement} - The main app component.
 */
function App() {
    return (
        <ThemeProvider theme={theme}>
            <BrowserRouter>
                <CustomToolbar/>
                <AppRoutes/>
                <Toast/>
            </BrowserRouter>
        </ThemeProvider>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(<App/>);