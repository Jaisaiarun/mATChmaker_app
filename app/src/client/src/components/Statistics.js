import React, {useEffect, useMemo, useState} from 'react';
import {Box, Card, CardContent, CardHeader, LinearProgress, Typography} from '@mui/material';
import {Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip} from 'recharts';
import {toast} from 'react-toastify';

const SQL_CLUSTERS_BY_PRODUCT = `
    SELECT product_class AS label,
           COUNT(*) AS value
    FROM cluster
    WHERE product_class != ''
    GROUP BY product_class
    ORDER BY value DESC
    LIMIT 12
`;

const COLORS = [
    '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c',
    '#d0ed57', '#ffa07a', '#90ee90', '#87cefa', '#ffb6c1'
];

export default function Statistics() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    // Fetch once on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/sql', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        query: SQL_CLUSTERS_BY_PRODUCT,
                        page: 0,
                        pageSize: 1000,
                        sortBy: null,
                        sortDir: null,
                    }),
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                if (!cancelled) setRows(Array.isArray(data.rows) ? data.rows : []);
            } catch (e) {
                if (!cancelled) toast.error(`Failed to load stats: ${e.message}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const chartData = useMemo(() => {
        // Expecting rows like: [{ label: 'Bacteria', value: 123 }, ...]
        return rows.map((r) => ({
            label: `${r.label} (${r.value})` ?? 'Unknown',
            value: Number(r.value ?? 0),
        })).filter(d => d.value > 0);
    }, [rows]);

    return (
        <Card sx={{height: 420}}>
            <CardHeader
                title="Clusters per product class"
                subheader="Number of BGCs in mibig_nrps_db grouped by antiSMASH product class"
            />
            <CardContent sx={{height: 340, position: 'relative'}}>
                {loading && (
                    <Box sx={{position: 'absolute', left: 0, right: 0, top: 0}}>
                        <LinearProgress/>
                    </Box>
                )}
                {chartData.length === 0 && !loading ? (
                    <Box sx={{height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <Typography variant="body2" color="text.secondary">No data</Typography>
                    </Box>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={chartData}
                                dataKey="value"
                                nameKey="label"
                                outerRadius="80%"
                                isAnimationActive={false}
                            >
                                {chartData.map((entry, idx) => (
                                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]}/>
                                ))}
                            </Pie>
                            <Tooltip/>
                            <Legend/>
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}