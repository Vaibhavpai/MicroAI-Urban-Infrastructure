import React, { useState, useEffect } from 'react';
import {
    TrendingUp, AlertCircle, Bell, Activity,
    ShieldAlert, Database, Satellite, ArrowRight, Zap
} from 'lucide-react';
import {
    BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts';
import { MapContainer, TileLayer, Popup, CircleMarker, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import './Overview.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const API = 'http://localhost:8000';

const CITY_CENTER = [19.076, 72.877];

const FALLBACK_POSITIONS = {
    BRIDGE_001:      [19.064, 72.870],
    BRIDGE_002:      [19.068, 72.875],
    PIPE_042:        [19.082, 72.890],
    PIPE_043:        [19.079, 72.885],
    ROAD_012:        [19.058, 72.850],
    ROAD_013:        [19.055, 72.855],
    TRANSFORMER_007: [19.095, 72.865],
    TRANSFORMER_008: [19.091, 72.860],
};

// ── risk helpers ──────────────────────────────────────────────────────────────
const getRiskColor  = s => s >= 75 ? '#ef4444' : s >= 50 ? '#f59e0b' : '#10b981';
const getRiskLevel  = s => s >= 75 ? 'critical' : s >= 50 ? 'warning' : 'optimal';
const getRiskLabel  = s => s >= 75 ? 'CRITICAL' : s >= 50 ? 'WARNING'  : 'OPTIMAL';

// ── direct fetch helpers (no imported client) ─────────────────────────────────
const apiFetch = async (path, options = {}) => {
    const res = await fetch(`${API}${path}`, options);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
};

// Fetch all assets from MongoDB
const fetchAssets = async () => {
    try { return await apiFetch('/assets'); }
    catch (e) { console.warn('fetchAssets failed:', e.message); return []; }
};

// Fetch stored risk scores
const fetchRiskScores = async () => {
    try { return await apiFetch('/risk-scores'); }
    catch (e) { console.warn('fetchRiskScores failed:', e.message); return []; }
};

// Predict risk for a single asset via ML model
const fetchPredictRisk = async (assetId) => {
    try {
        const res = await apiFetch(`/predict/${assetId}`);
        return res.risk_score ?? res.score ?? null;
    } catch (e) {
        console.warn(`predictRisk(${assetId}) failed:`, e.message);
        return null;
    }
};

// Fetch alerts
const fetchAlerts = async () => {
    try { return await apiFetch('/alerts'); }
    catch (e) { console.warn('fetchAlerts failed:', e.message); return []; }
};

// ── sub-components ────────────────────────────────────────────────────────────
const KPICard = ({ title, value, icon: Icon, color, subtitle, trend, secondaryVal, delay }) => (
    <div className={`kpi-card ${color}`} style={{ animationDelay: `${delay}ms` }}>
        <div className="kpi-icon-bg"><Icon size={28} /></div>
        <div className="kpi-header"><span className="kpi-title">{title}</span></div>
        <div className="kpi-body">
            <div className="kpi-value-group">
                <div className="kpi-value">{value}</div>
                {secondaryVal && <div className="kpi-secondary">{secondaryVal}</div>}
            </div>
            {trend && (
                <div className={`kpi-trend ${trend.startsWith('+') ? 'up' : 'down'}`}>
                    <TrendingUp size={13} /> {trend}
                </div>
            )}
        </div>
        <div className="kpi-subtitle">{subtitle}</div>
        <div className="kpi-shine" />
    </div>
);

const AlertItem = ({ id, severity, message, time, onClick }) => (
    <div className={`alert-item ${severity}`} onClick={onClick}>
        <div className="alert-indicator" />
        <div className="alert-content">
            <div className="alert-meta">
                <span className="alert-time">{time}</span>
                <span className={`alert-tag ${severity}`}>{severity.toUpperCase()}</span>
            </div>
            <div className="alert-id-label">{id}</div>
            <div className="alert-msg">{message}</div>
        </div>
        <ArrowRight size={14} className="alert-arrow" />
    </div>
);

// ── main component ────────────────────────────────────────────────────────────
const Overview = () => {
    const navigate = useNavigate();
    const [locations,  setLocations]  = useState([]);
    const [kpiStats,   setKpiStats]   = useState({ totalAssets:0, highRisk:0, predictedFailures:0 });
    const [alerts,     setAlerts]     = useState([]);
    const [chartData,  setChartData]  = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [lastUpdate, setLastUpdate] = useState('--:--:--');

    const loadAll = async () => {
        try {
            // ── 1. fetch assets from MongoDB ──────────────────────────────
            const assets = await fetchAssets();
            if (!assets.length) {
                console.warn('No assets returned from /assets');
                setLoading(false);
                return;
            }

            // ── 2. fetch stored risk scores (fast path) ───────────────────
            const storedScores = await fetchRiskScores();
            const scoreMap = {};
            storedScores.forEach(r => {
                if (r.asset_id && r.risk_score != null) {
                    scoreMap[r.asset_id] = r.risk_score;
                }
            });

            // ── 3. build enriched asset list ──────────────────────────────
            const enriched = await Promise.all(assets.map(async (asset) => {
                const id = asset.asset_id || asset.id || asset._id;

                // position: use DB fields → fallback map → random near Mumbai
                const pos = (asset.location_lat && asset.location_lng)
                    ? [parseFloat(asset.location_lat), parseFloat(asset.location_lng)]
                    : FALLBACK_POSITIONS[id] || [
                        CITY_CENTER[0] + (Math.random() - 0.5) * 0.04,
                        CITY_CENTER[1] + (Math.random() - 0.5) * 0.04
                    ];

                // risk score: stored → ML predict → field on asset → 0
                let riskScore = scoreMap[id] ?? asset.risk_score ?? null;
                if (riskScore == null) {
                    riskScore = await fetchPredictRisk(id);
                }
                if (riskScore == null) {
                    // last resort: compute from age + criticality if available
                    const age  = asset.age_years     || 0;
                    const crit = asset.criticality   || 1;
                    riskScore  = Math.min(99, (age / 50) * 60 + (crit / 5) * 40);
                }

                riskScore = parseFloat(parseFloat(riskScore).toFixed(1));
                const status = getRiskLevel(riskScore);

                return {
                    ...asset,
                    id,
                    name: (asset.asset_type || id).replace(/_/g, ' '),
                    pos,
                    status,
                    risk_score: riskScore,
                };
            }));

            setLocations(enriched);

            // ── 4. KPI stats ──────────────────────────────────────────────
            setKpiStats({
                totalAssets:       enriched.length,
                highRisk:          enriched.filter(a => a.status === 'critical').length,
                predictedFailures: enriched.filter(a => a.risk_score > 60).length,
            });

            // ── 5. bar chart data ─────────────────────────────────────────
            setChartData(enriched.map(a => ({
                name: a.id.replace(/_/g, ' '),
                risk: a.risk_score,
                fill: getRiskColor(a.risk_score),
            })));

            // ── 6. alerts: from /alerts endpoint first ────────────────────
            const rawAlerts = await fetchAlerts();

            const backendAlerts = rawAlerts.map(a => ({
                id:       a.asset_id || a.id || '—',
                severity: (a.risk_score ?? a.score ?? 0) >= 75 ? 'critical' : 'warning',
                time:     a.timestamp
                              ? new Date(a.timestamp).toLocaleTimeString([], { hour12:false })
                              : new Date().toLocaleTimeString([], { hour12:false }),
                message:  a.top_reason
                           || a.message
                           || a.sensor_condition
                           || `Risk score: ${a.risk_score ?? '—'}`,
            }));

            // fill alerts from enriched assets for any not already covered
            const coveredIds = new Set(backendAlerts.map(a => a.id));
            const assetAlerts = enriched
                .filter(a => a.status !== 'optimal' && !coveredIds.has(a.id))
                .map(a => ({
                    id:       a.id,
                    severity: a.status,
                    time:     new Date().toLocaleTimeString([], { hour12:false }),
                    message:  `${a.name} — risk score ${a.risk_score}% (${getRiskLabel(a.risk_score)})`,
                }));

            const allAlerts = [...backendAlerts, ...assetAlerts]
                .sort((x, y) => y.time.localeCompare(x.time));

            setAlerts(allAlerts);
            setLastUpdate(new Date().toLocaleTimeString([], { hour12:false }));
            setLoading(false);

        } catch (err) {
            console.error('Overview loadAll error:', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
        const t = setInterval(loadAll, 60000);
        return () => clearInterval(t);
    }, []);

    if (loading) return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
            height:'60vh', color:'#94a3b8', fontSize:'14px', gap:'10px' }}>
            <div style={{ width:18, height:18, borderRadius:'50%',
                border:'2px solid #6366f1', borderTopColor:'transparent',
                animation:'spin 0.8s linear infinite' }}/>
            Loading infrastructure data...
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );

    return (
        <div className="overview-container">
            {/* Header */}
            <div className="overview-header">
                <div className="header-left">
                    <h1 className="page-title">
                        <span className="text-gradient-cyan">Infrastructure Health</span>
                        <span className="title-badge"><Zap size={12} /> Live</span>
                    </h1>
                    <p className="page-subtitle">
                        Real-time ML-powered monitoring — Mumbai Metropolitan Region
                    </p>
                </div>
                <div className="header-right-actions">
                    <div className="last-updated">
                        <div className="status-dot-animated" />
                        <span>Last updated: {lastUpdate}</span>
                    </div>
                    <button
                        onClick={loadAll}
                        style={{ background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)',
                            color:'#818cf8', borderRadius:'8px', padding:'6px 14px',
                            fontSize:'12px', cursor:'pointer', marginLeft:'10px' }}>
                        ↺ Refresh
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
                <KPICard
                    title="Total Assets Monitored"
                    value={kpiStats.totalAssets.toString()}
                    icon={Database}
                    color="cyan"
                    subtitle="Fetched from MongoDB"
                    trend="+100% Live"
                    delay={0}
                />
                <KPICard
                    title="High Risk Assets"
                    value={kpiStats.highRisk.toString()}
                    secondaryVal="Risk ≥ 75"
                    icon={ShieldAlert}
                    color="rose"
                    subtitle="Requires immediate attention"
                    delay={80}
                />
                <KPICard
                    title="Active Alerts"
                    value={alerts.length.toString()}
                    secondaryVal={`${kpiStats.predictedFailures} Warning`}
                    icon={Bell}
                    color="amber"
                    subtitle="From ML alert pipeline"
                    delay={160}
                />
                <KPICard
                    title="Predicted Failures"
                    value={kpiStats.predictedFailures.toString()}
                    secondaryVal="Assets"
                    icon={Activity}
                    color="purple"
                    subtitle="Risk score > 60"
                    delay={240}
                />
            </div>

            {/* Map + Alert Feed */}
            <div className="main-grid">
                <div className="map-section glass-panel">
                    <div className="map-header">
                        <div className="map-title-row">
                            <Satellite size={16} className="map-icon" />
                            <h3>Infrastructure Satellite Health Map</h3>
                        </div>
                        <div className="map-controls">
                            <div className="map-legend">
                                <span className="legend-dot critical" /> Critical
                                <span className="legend-dot warning" />  Warning
                                <span className="legend-dot optimal" />  Optimal
                            </div>
                        </div>
                    </div>
                    <div className="map-wrapper">
                        <MapContainer
                            center={CITY_CENTER}
                            zoom={13}
                            scrollWheelZoom={true}
                            style={{ height:'100%', width:'100%', borderRadius:'12px' }}
                        >
                            <LayersControl position="topright">
                                <LayersControl.BaseLayer name="Satellite" checked>
                                    <TileLayer
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                        attribution="&copy; Esri"
                                        maxZoom={19}
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Dark Map">
                                    <TileLayer
                                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                        attribution="&copy; CARTO"
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Street Map">
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution="&copy; OpenStreetMap"
                                    />
                                </LayersControl.BaseLayer>
                            </LayersControl>

                            {locations.map(loc => (
                                <CircleMarker
                                    key={loc.id}
                                    center={loc.pos}
                                    radius={loc.status === 'critical' ? 14 : 11}
                                    pathOptions={{
                                        color: '#ffffff',
                                        fillColor: getRiskColor(loc.risk_score),
                                        fillOpacity: 0.9,
                                        weight: 2.5,
                                    }}
                                    eventHandlers={{ click: () => navigate(`/asset/${loc.id}`) }}
                                >
                                    <Popup>
                                        <div style={{ fontFamily:'Inter, sans-serif', padding:'4px 0',
                                            background:'#0f172a', borderRadius:'8px', minWidth:'160px' }}>
                                            <div style={{ fontWeight:700, fontSize:'13px',
                                                marginBottom:4, color:'#f1f5f9' }}>{loc.id}</div>
                                            <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:6 }}>
                                                {loc.name}
                                            </div>
                                            <div style={{ fontSize:'12px', fontWeight:700,
                                                color: getRiskColor(loc.risk_score),
                                                display:'flex', alignItems:'center', gap:4 }}>
                                                ML Risk: {loc.risk_score}%
                                            </div>
                                            <div style={{ fontSize:'10px', color:getRiskColor(loc.risk_score),
                                                fontWeight:600, marginTop:3 }}>
                                                {getRiskLabel(loc.risk_score)}
                                            </div>
                                            <div style={{ fontSize:'10px', color:'#475569', marginTop:6 }}>
                                                Click for full analysis →
                                            </div>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            ))}
                        </MapContainer>
                    </div>
                </div>

                <div className="feed-section glass-panel">
                    <div className="feed-header">
                        <div className="feed-title-row">
                            <AlertCircle size={16} className="feed-icon" />
                            <h3>Live ML Alert Feed</h3>
                        </div>
                        <span className="feed-count">{alerts.length}</span>
                    </div>
                    <div className="feed-list">
                        {alerts.length > 0
                            ? alerts.map((a, i) => (
                                <AlertItem
                                    key={i}
                                    id={a.id}
                                    severity={a.severity}
                                    message={a.message}
                                    time={a.time}
                                    onClick={() => navigate(`/asset/${a.id}`)}
                                />
                            ))
                            : (
                                <div className="feed-empty">
                                    <Activity size={24} />
                                    <span>All assets operating within safe parameters.</span>
                                </div>
                            )
                        }
                    </div>
                </div>
            </div>

            {/* Risk Bar Chart */}
            <div className="charts-grid">
                <div className="chart-card glass-panel">
                    <div className="chart-header">
                        <h4>Asset Risk Score Distribution</h4>
                        <span className="chart-badge">Live ML</span>
                    </div>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} barSize={32} barGap={8}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="rgba(255,255,255,0.04)"
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey="name"
                                    stroke="#475569"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="#475569"
                                    fontSize={10}
                                    domain={[0, 100]}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background:'#0f172a',
                                        border:'1px solid rgba(255,255,255,0.1)',
                                        borderRadius:10,
                                        fontSize:'12px',
                                        color:'#f1f5f9',
                                    }}
                                    cursor={{ fill:'rgba(255,255,255,0.03)' }}
                                    formatter={v => [`${v}%`, 'Risk Score']}
                                />
                                <Bar dataKey="risk" radius={[6,6,0,0]} name="Risk Score">
                                    {chartData.map((entry, i) => (
                                        <Cell key={i} fill={entry.fill}/>
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Overview;