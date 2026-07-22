import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {toast} from 'react-toastify';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import DownloadIcon from '@mui/icons-material/Download';
import {DataGrid, GridPagination, GridToolbarContainer} from '@mui/x-data-grid';
import Statistics from '../components/Statistics';

const DEFAULT_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 100000;

const QUERYOPTIONS = [
    {
        key: 'clusterOrganism',
        label: 'Clusters by organism / species',
        kind: 'preset',
        defaultQuery: "SELECT bgc_id, organism, product_class FROM cluster LIMIT 500",
        Editor: ({presetInput, setPresetInput, setQuery}) => (
            <TextField
                label="Organism / species (partial match)"
                value={presetInput}
                onChange={(e) => {
                    const v = e.target.value;
                    setPresetInput(v);
                    const t = v.trim();
                    setQuery(
                        t
                            ? `
    SELECT
      id                AS cluster_id,
      bgc_id,
      filename,
      organism,
      strain,
      product_class,
      definition
    FROM cluster
    WHERE organism LIKE '%${t}%' COLLATE NOCASE
       OR source_organism LIKE '%${t}%' COLLATE NOCASE
    ORDER BY organism
    LIMIT 500
              `.replace(/\s+/g, ' ').trim()
                            : ''
                    );
                }}
                fullWidth
                placeholder="e.g., Photorhabdus or Xenorhabdus"
            />
        ),
    },
    {
        key: 'clusterProduct',
        label: 'Clusters by product class',
        kind: 'preset',
        defaultQuery: "SELECT DISTINCT product_class FROM cluster LIMIT 500",
        Editor: ({setQuery}) => {
            const [options, setOptions] = useState([]);
            const [value, setValue] = useState(null);
            const [loading, setLoading] = useState(false);

            useEffect(() => {
                let mounted = true;
                setLoading(true);
                fetch('/api/sql', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        query: "SELECT DISTINCT product_class FROM cluster WHERE product_class != '' ORDER BY product_class",
                        page: 0,
                        pageSize: 5000,
                    }),
                })
                    .then((r) => r.json())
                    .then((d) => {
                        if (mounted) setOptions(d.rows?.map((r) => r.product_class) || []);
                    })
                    .catch(() => setOptions([]))
                    .finally(() => setLoading(false));
                return () => {
                    mounted = false;
                };
            }, []);

            useEffect(() => {
                if (!value) {
                    setQuery('');
                    return;
                }
                const sql = `
    SELECT
      id AS cluster_id, bgc_id, organism, strain, product_class, definition
    FROM cluster
    WHERE product_class LIKE '%${value}%' COLLATE NOCASE
    ORDER BY organism
    LIMIT 500
        `.replace(/\s+/g, ' ').trim();
                setQuery(sql);
            }, [value, setQuery]);

            return (
                <Autocomplete
                    options={options}
                    value={value}
                    onChange={(_, newValue) => setValue(newValue)}
                    loading={loading}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Product class"
                            placeholder="Start typing a product class…"
                            InputProps={{
                                ...params.InputProps,
                                endAdornment: (
                                    <>
                                        {loading ? <CircularProgress size={18}/> : null}
                                        {params.InputProps.endAdornment}
                                    </>
                                ),
                            }}
                        />
                    )}
                    fullWidth
                    autoHighlight
                    clearOnEscape
                />
            );
        },
    },
    {
        key: 'tteByCluster',
        label: 'TTE sequences by BGC ID',
        kind: 'preset',
        defaultQuery: "SELECT bgc_id, cds_locus_tag, tte_len FROM tte LIMIT 500",
        Editor: ({presetInput, setPresetInput, setQuery}) => (
            <TextField
                label="BGC ID (partial match)"
                value={presetInput}
                onChange={(e) => {
                    const v = e.target.value;
                    setPresetInput(v);
                    const t = v.trim();
                    setQuery(
                        t
                            ? `
    SELECT
      c.bgc_id,
      c.organism,
      t.cds_locus_tag,
      t.region_id,
      t.tte_len,
      t.monomer_pairs,
      t.tte_seq
    FROM tte t
    JOIN cluster c ON c.id = t.cluster_id
    WHERE c.bgc_id LIKE '%${t}%' COLLATE NOCASE
    ORDER BY c.bgc_id, t.region_idx
    LIMIT 500
              `.replace(/\s+/g, ' ').trim()
                            : ''
                    );
                }}
                fullWidth
                placeholder="e.g., BGC0000311"
            />
        ),
    },
    {
        key: 'domainByCds',
        label: 'Domains by CDS locus tag',
        kind: 'preset',
        defaultQuery: "SELECT aSDomain, specificity, cds_id FROM domain LIMIT 500",
        Editor: ({presetInput, setPresetInput, setQuery}) => (
            <TextField
                label="CDS locus tag"
                value={presetInput}
                onChange={(e) => {
                    const v = e.target.value;
                    setPresetInput(v);
                    const t = v.trim();
                    setQuery(
                        t
                            ? `
    SELECT
      c.bgc_id,
      cds.locus_tag,
      cds.product,
      d.aSDomain,
      d.domain_type,
      d.specificity,
      d.specificity_score,
      d.start,
      d.end
    FROM domain d
    JOIN cds     cds ON cds.id = d.cds_id
    JOIN cluster c   ON c.id = d.cluster_id
    WHERE cds.locus_tag LIKE '%${t}%' COLLATE NOCASE
    ORDER BY cds.locus_tag, d.start
    LIMIT 500
              `.replace(/\s+/g, ' ').trim()
                            : ''
                    );
                }}
                fullWidth
                placeholder="e.g., ctg1_orf00012"
            />
        ),
    },
    {
        key: 'domainBySpecificity',
        label: 'A-domains by predicted substrate',
        kind: 'preset',
        defaultQuery: "SELECT aSDomain, specificity, specificity_score FROM domain LIMIT 500",
        Editor: ({presetInput, setPresetInput, setQuery}) => (
            <TextField
                label="Substrate / specificity call (partial match)"
                value={presetInput}
                onChange={(e) => {
                    const v = e.target.value;
                    setPresetInput(v);
                    const t = v.trim();
                    setQuery(
                        t
                            ? `
    SELECT
      c.bgc_id,
      c.organism,
      cds.locus_tag,
      d.specificity,
      d.specificity_score,
      d.start,
      d.end
    FROM domain d
    JOIN cds     cds ON cds.id = d.cds_id
    JOIN cluster c   ON c.id = d.cluster_id
    WHERE d.aSDomain = 'AMP-binding'
      AND d.specificity LIKE '%${t}%' COLLATE NOCASE
    ORDER BY d.specificity_score DESC
    LIMIT 500
              `.replace(/\s+/g, ' ').trim()
                            : ''
                    );
                }}
                fullWidth
                placeholder="e.g., ser, orn, phe"
            />
        ),
    },
];

const CustomTopToolbar = () => (
    <GridToolbarContainer sx={{justifyContent: 'flex-end', mb: 1}}>
        <GridPagination/>
    </GridToolbarContainer>
);

const QueryDatabase = () => {
    // which query mode is active
    const [selectedKey, setSelectedKey] = useState(QUERYOPTIONS[0].key);
    const selectedOption = useMemo(
        () => QUERYOPTIONS.find((o) => o.key === selectedKey) || QUERYOPTIONS[0],
        [selectedKey]
    );

    const [presetInput, setPresetInput] = useState('');
    const [query, setQuery] = useState(selectedOption.defaultQuery || '');

    // grid state
    const [rows, setRows] = useState([]);
    const [columns, setColumns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [rowCount, setRowCount] = useState(0);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [sortModel, setSortModel] = useState([]);
    const lastRequestRef = useRef(0);

    // Memoized active sort parameters
    const activeSort = useMemo(() => {
        if (!sortModel.length) return {sortBy: null, sortDir: null};
        const {field, sort} = sortModel[0];
        return {sortBy: field, sortDir: sort};
    }, [sortModel]);

    // Function to build columns from sample rows
    const buildColumnsFromRows = (sampleRows) => {
        if (!sampleRows.length) return [];
        const keys = Object.keys(sampleRows[0]);
        return keys.map((k) => ({
            field: k,
            headerName: k,
            flex: 1,
            minWidth: 120,
        }))
    };

    // Ensure each row has a unique 'id' field for DataGrid
    const ensureRowIds = (arr) => arr.map((r, i) => (r.id ? r : {id: `${page}-${i}`, ...r}));

    // Fetch results from the server
    const fetchResults = useCallback(async ({q, p, ps, sortBy, sortDir}) => {
        if (!q.trim()) {
            toast.warn('Please enter a SQL query.');
            return;
        }
        setLoading(true);
        const reqId = Date.now();
        lastRequestRef.current = reqId;
        try {
            const res = await fetch('/api/sql', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({query: q, page: p, pageSize: ps, sortBy, sortDir}),
            })
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (lastRequestRef.current !== reqId) return;
            const cols = data.columns?.length ? data.columns.map((c) => ({
                flex: 1,
                minWidth: 120, ...c
            })) : buildColumnsFromRows(data.rows || []);
            const withIds = ensureRowIds(data.rows || []);
            setColumns(cols);
            setRows(withIds);
            setRowCount(Number.isFinite(data.total) ? data.total : withIds.length);
        } catch (err) {
            toast.error(`Query failed: ${err.message}`);
            setColumns([]);
            setRows([]);
            setRowCount(0);
        } finally {
            setLoading(false);
        }
    }, [page, selectedOption]);

    // Fetch results when page, pageSize, or activeSort changes
    const onSearch = useCallback(() => {
        setPage(0);
        fetchResults({q: query, p: 0, ps: pageSize, ...activeSort});
    }, [query, pageSize, activeSort, fetchResults]);

    // Clear all results and reset state
    const clearAll = () => {
        setRows([]);
        setColumns([]);
        setRowCount(0);
        setPage(0);
        setSortModel([]);
        // keep current query text; if preset is active and its editor cleared, query may be ''
    };

    // Export helpers
    const makeDelimited = (cols, data, delim) => {
        const header = cols.map((c) => c.field).join(delim);
        const lines = data.map((r) => cols.map((c) => String(r[c.field] ?? '').replace(/\n|\r/g, ' ')).join(delim));
        return [header, ...lines].join('\n');
    };

    const downloadFile = (content, filename, mime) => {
        const blob = new Blob([content], {type: mime});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const exportCurrentPage = (format) => {
        if (!columns.length || !rows.length) {
            toast.info('Nothing to export.');
            return;
        }
        const delim = format === 'csv' ? ',' : '\t';
        const text = makeDelimited(columns, rows, delim);
        downloadFile(text, `results_page${page + 1}.${format}`, format === 'csv' ? 'text/csv' : 'text/tab-separated-values');
    };

    const exportAll = async (format) => {
        setLoading(true);
        try {
            if (!query.trim()) return toast.warn('Please enter a SQL query first!');
            const res = await fetch('/api/sql', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    query,
                    page: 0,
                    pageSize: MAX_EXPORT_ROWS,
                    sortBy: activeSort.sortBy,
                    sortDir: activeSort.sortDir,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const cols = data.columns?.length ? data.columns.map((c) => ({
                flex: 1,
                minWidth: 120, ...c
            })) : buildColumnsFromRows(data.rows || []);
            const delim = format === 'csv' ? ',' : '\t';
            const text = makeDelimited(cols, data.rows || [], delim);
            downloadFile(text, `results_all.${format}`, format === 'csv' ? 'text/csv' : 'text/tab-separated-values');
        } catch (err) {
            toast.error(`Export failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // only refetch if we've already run at least once
        if (!query.trim()) return;
        if (rows.length === 0 && rowCount === 0) return;
        fetchResults({q: query, p: page, ps: pageSize, ...activeSort});
    }, [page, pageSize, activeSort.sortBy, activeSort.sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Box p={2}>
            <Typography
                variant="h5"
                gutterBottom
            >
                Query database
            </Typography>

            <Statistics/>

            <Divider sx={{my: 2}}/>

            <Stack spacing={1} sx={{mb: 1}}>
                <Box sx={{minWidth: 260}}>
                    <InputLabel id="query-mode-label">Query mode</InputLabel>
                    <Select
                        fullWidth
                        labelId='qtype-label'
                        value={selectedKey}
                        onChange={(e) => {
                            const nextKey = e.target.value;
                            setSelectedKey(nextKey);
                            const next = QUERYOPTIONS.find((o) => o.key === nextKey);
                            setQuery(next?.defaultQuery || '');
                            // clear results on type switch
                            setPresetInput('');
                            setRows([]);
                            setColumns([]);
                            setRowCount(0);
                            setPage(0);
                            setSortModel([]);
                        }}
                    >
                        {QUERYOPTIONS.map((o) => (
                            <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>
                        ))}
                    </Select>
                </Box>

                {/* Per-option editor:
            - 'free' shows SQL textarea
            - presets render inputs that directly update the main query via setQuery
        */}
                {selectedOption.Editor ? (
                    selectedOption.key === 'free'
                        ? <selectedOption.Editor query={query} setQuery={setQuery}/>
                        : <selectedOption.Editor presetInput={presetInput} setPresetInput={setPresetInput}
                                                 setQuery={setQuery}/>
                ) : null}
            </Stack>

            <Stack
                direction={{xs: 'column', sm: 'row'}}
                spacing={1}
                alignItems="stretch"
            >
                <Stack spacing={1} minWidth={{xs: '100%', sm: 220}}>
                    <Stack direction="row" spacing={1}>
                        <Button startIcon={<SearchIcon/>} variant="contained" onClick={onSearch} disabled={loading}
                                fullWidth>
                            Search
                        </Button>
                        <Button startIcon={<ClearIcon/>} variant="outlined" onClick={clearAll}
                                disabled={loading && !rows.length} fullWidth>
                            Clear
                        </Button>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        {/* <Button startIcon={<DownloadIcon />} size="small" onClick={() => exportAll('csv')} disabled={loading}>CSV all</Button> */}
                        <Button startIcon={<DownloadIcon/>} size="small" onClick={() => exportAll('tsv')}
                                disabled={loading}>Download results</Button>
                    </Stack>
                </Stack>
            </Stack>

            <Divider sx={{my: 2}}/>

            <Box sx={{height: 520, width: '100%'}}>
                <DataGrid
                    rows={rows}
                    columns={columns}
                    pagination
                    paginationMode="server"
                    sortingMode="server"
                    pageSizeOptions={[10, 25, 50, 100]}
                    rowCount={rowCount}
                    page={page}
                    onPaginationModelChange={(model) => {
                        if (model.pageSize !== pageSize) setPageSize(model.pageSize);
                        if (model.page !== page) setPage(model.page);
                    }}
                    sortingOrder={["asc", "desc"]}
                    sortModel={sortModel}
                    onSortModelChange={(model) => setSortModel(model)}
                    disableRowSelectionOnClick
                    loading={loading}
                    slots={{
                        toolbar: CustomTopToolbar,
                        loadingOverlay: LinearProgress,
                        noRowsOverlay: () => (
                            <Stack height="100%" alignItems="center" justifyContent="center">
                                <Typography variant="body2" color="text.secondary">
                                    {rows.length === 0 && !loading ? 'Sorry, no results for query' : ''}
                                </Typography>
                            </Stack>
                        ),
                    }}
                />
            </Box>

            {loading && (
                <Box sx={{position: 'fixed', left: 0, right: 0, top: 0, zIndex: 1200}}>
                    <LinearProgress/>
                </Box>
            )}
        </Box>
    );
};

export default QueryDatabase;