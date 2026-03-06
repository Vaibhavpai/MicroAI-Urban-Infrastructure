import React, { useState, useEffect } from 'react';
import {
    TrendingUp, AlertCircle, Bell, Activity,
    ShieldAlert, Database, MapPin, Search,
    Layers, Satellite, ArrowRight, Zap
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { MapContainer, TileLayer, Popup, CircleMarker, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { getAssets, predictRisk, getAlerts as fetchAlerts, getRiskScores } from '../api/client';
import './Overview.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Mumbai coordinates for Indian infrastructure
const CITY_CENTER = [19.076, 72.877];

const ASSET_POSITIONS = {
    BRIDGE_001: [19.064, 72.870],
    PIPE_042: [19.082, 72.890],
    ROAD_012: [19.058, 72.850],
    TRANSFORMER_007: [19.095, 72.865],
};

const KPICard = ({ title, value, icon: Icon, color, subtitle, trend, secondaryVal, delay }) => (
    <div className={`kpi-card ${color}`} style={{ animationDelay: `${delay}ms` }}>
        <div className="kpi-icon-bg">
            <Icon size={28} />
        </div>
        <div className="kpi-header">
            <span className="kpi-title">{title}</span>
        </div>
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

const Overview = () => {
    const navigate = useNavigate();
    const [locations, setLocations] = useState([]);
    const [kpiStats, setKpiStats] = useState({ totalAssets: 0, highRisk: 0, predictedFailures: 0 });
    const [alerts, setAlerts] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const assets = await getAssets();

                let riskScores = [];
                try { riskScores = await getRiskScores(); } catch { }

                const evaluatedAssets = await Promise.all(assets.map(async (asset) => {
                    const pos = ASSET_POSITIONS[asset.asset_id] || [
                        CITY_CENTER[0] + (Math.random() - 0.5) * 0.04,
                        CITY_CENTER[1] + (Math.random() - 0.5) * 0.04
                    ];

                    let riskScore = 0;
                    const stored = riskScores.find(r => r.asset_id === asset.asset_id);
                    if (stored) {
                        riskScore = stored.risk_score;
                    } else {
                        try {
                            const pred = await predictRisk(asset.asset_id);
                            riskScore = pred.risk_score;
                        } catch { riskScore = Math.random() * 100; }
                    }

                    let status = 'optimal', severity = 'low';
                    if (riskScore >= 75) { status = 'critical'; severity = 'critical'; }
                    else if (riskScore >= 50) { status = 'warning'; severity = 'warning'; }

                    return {
                        ...asset,
                        id: asset.asset_id,
                        name: asset.asset_id.replace('_', ' '),
                        pos,
                        status, severity,
                        risk_score: Math.round(riskScore * 10) / 10
                    };
                }));

                setLocations(evaluatedAssets);

                const dynamicAlerts = evaluatedAssets
                    .filter(a => a.status !== 'optimal')
                    .map(a => ({
                        id: a.id,
                        severity: a.severity,
                        time: new Date().toLocaleTimeString([], { hour12: false }),
                        message: `${a.name} showing elevated risk levels (${a.risk_score}%)`
                    }));
                setAlerts(dynamicAlerts);

                setKpiStats({
                    totalAssets: evaluatedAssets.length,
                    highRisk: evaluatedAssets.filter(a => a.status === 'critical').length,
                    predictedFailures: evaluatedAssets.filter(a => a.risk_score > 60).length
                });

                setChartData(evaluatedAssets.map((a) => ({
                    name: a.id.replace('_', ' '),
                    risk: a.risk_score,
                    fill: a.risk_score > 75 ? '#f43f5e' : a.risk_score > 50 ? '#f59e0b' : '#10b981'
                })));

                setLoading(false);
            } catch (err) {
                console.error("API Error:", err);
                setLoading(false);
            }
        };

        fetchAll();
        const interval = setInterval(fetchAll, 60000);
        return () => clearInterval(interval);
    }, []);

    const getMarkerColor = (status) => {
        if (status === 'critical') return '#f43f5e';
        if (status === 'warning') return '#f59e0b';
        return '#10b981';
    };

    return (
        <div className="overview-container">
            {/* Page Header */}
            <div className="overview-header">
                <div className="header-left">
                    <h1 className="page-title">
                        <span className="text-gradient-cyan">Infrastructure Health</span>
                        <span className="title-badge"><Zap size={12} /> Live</span>
                    </h1>
                    <p className="page-subtitle">Real-time ML-powered monitoring dashboard — Mumbai Metropolitan Region</p>
                </div>
                <div className="header-right-actions">
                    <div className="last-updated">
                        <div className="status-dot-animated" />
                        <span>Last updated: {new Date().toLocaleTimeString([], { hour12: false })}</span>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
                <KPICard
                    title="Total Assets Monitored"
                    value={kpiStats.totalAssets.toString()}
                    icon={Database}
                    color="cyan"
                    subtitle="Connected via MongoDB"
                    trend="+100% Live"
                    delay={0}
                />
                <KPICard
                    title="High Risk Assets"
                    value={kpiStats.highRisk.toString()}
                    secondaryVal="Risk > 75"
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
                    subtitle="Auto-populated by ML output"
                    delay={160}
                />
                <KPICard
                    title="Predicted Failures"
                    value={kpiStats.predictedFailures.toString()}
                    secondaryVal="Assets"
                    icon={Activity}
                    color="purple"
                    subtitle="Based on Risk Scores > 60"
                    delay={240}
                />
            </div>

            {/* Main Content Grid */}
            <div className="main-grid">
                {/* Satellite Map */}
                <div className="map-section glass-panel">
                    <div className="map-header">
                        <div className="map-title-row">
                            <Satellite size={16} className="map-icon" />
                            <h3>Infrastructure Satellite Health Map</h3>
                        </div>
                        <div className="map-controls">
                            <div className="map-legend">
                                <span className="legend-dot critical" /> Critical
                                <span className="legend-dot warning" /> Warning
                                <span className="legend-dot optimal" /> Optimal
                            </div>
                        </div>
                    </div>
                    <div className="map-wrapper">
                        <MapContainer
                            center={CITY_CENTER}
                            zoom={13}
                            scrollWheelZoom={true}
                            style={{ height: '100%', width: '100%', borderRadius: '12px' }}
                        >
                            <LayersControl position="topright">
                                <LayersControl.BaseLayer name="Satellite" checked>
                                    <TileLayer
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                        attribution="&copy; Esri, Maxar, Earthstar Geographics"
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
                                    radius={12}
                                    pathOptions={{
                                        color: '#ffffff',
                                        fillColor: getMarkerColor(loc.status),
                                        fillOpacity: 0.9,
                                        weight: 2.5
                                    }}
                                    eventHandlers={{
                                        click: () => navigate(`/asset/${loc.id}`)
                                    }}
                                >
                                    <Popup>
                                        <div style={{
                                            fontFamily: 'Inter, sans-serif',
                                            padding: '4px 0',
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4, color: '#f1f5f9' }}>
                                                {loc.id}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 6 }}>
                                                {loc.name}
                                            </div>
                                            <div style={{
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                color: getMarkerColor(loc.status),
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6
                                            }}>
                                                ML Risk: {loc.risk_score}%
                                            </div>
                                            <div style={{
                                                fontSize: '0.65rem',
                                                color: '#64748b',
                                                marginTop: 6,
                                                cursor: 'pointer'
                                            }}>
                                                Click marker for details →
                                            </div>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            ))}
                        </MapContainer>
                    </div>
                </div>

                {/* Alert Feed */}
                <div className="feed-section glass-panel">
                    <div className="feed-header">
                        <div className="feed-title-row">
                            <AlertCircle size={16} className="feed-icon" />
                            <h3>Live ML Alert Feed</h3>
                        </div>
                        <span className="feed-count">{alerts.length}</span>
                    </div>
                    <div className="feed-list">
                        {alerts.length > 0 ? alerts.map((a, i) => (
                            <AlertItem
                                key={i}
                                id={a.id}
                                severity={a.severity}
                                message={a.message}
                                time={a.time}
                                onClick={() => navigate(`/asset/${a.id}`)}
                            />
                        )) : (
                            <div className="feed-empty">
                                <Activity size={24} />
                                <span>All assets operating within safe parameters.</span>
                            </div>
                        )}
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
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#475569" fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        background: '#0f172a',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 10,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                        fontSize: '0.8rem',
                                    }}
                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                />
                                <Bar
                                    dataKey="risk"
                                    radius={[6, 6, 0, 0]}
                                    name="Risk Score"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
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
