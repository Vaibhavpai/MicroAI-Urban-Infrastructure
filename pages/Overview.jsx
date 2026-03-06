import React, { useState, useEffect } from 'react';
import {
    TrendingUp,
    AlertCircle,
    Bell,
    Activity,
    ShieldAlert,
    Database,
    MapPin,
    Search
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { MapContainer, TileLayer, Popup, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './Overview.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const data = [
    { time: '14:00', traffic: 45, power: 210, water: 85 },
    { time: '15:00', traffic: 52, power: 235, water: 78 },
    { time: '16:00', traffic: 88, power: 280, water: 92 },
    { time: '17:00', traffic: 65, power: 255, water: 110 },
    { time: '18:00', traffic: 48, power: 220, water: 95 },
];

const heatmapZones = [
    { pos: [51.505, -0.09], radius: 800, color: '#f43f5e', opacity: 0.15 },
    { pos: [51.51, -0.11], radius: 600, color: '#f59e0b', opacity: 0.1 },
    { pos: [51.49, -0.07], radius: 1000, color: '#10b981', opacity: 0.05 },
];

const KPICard = ({ title, value, icon: Icon, color, subtitle, trend, secondaryVal }) => (
    <div className={`kpi-card ${color}`}>
        <div className="kpi-header">
            <span className="kpi-title">{title}</span>
            <Icon size={20} className={`kpi-icon ${color}`} />
        </div>
        <div className="kpi-body">
            <div className="kpi-value-group">
                <div className="kpi-value">{value}</div>
                {secondaryVal && <div className="kpi-secondary">{secondaryVal}</div>}
            </div>
            {trend && (
                <div className={`kpi-trend ${trend.startsWith('+') ? 'up' : 'down'}`}>
                    <TrendingUp size={14} /> {trend}
                </div>
            )}
        </div>
        <div className="kpi-subtitle">{subtitle}</div>
    </div>
);

const AlertItem = ({ id, severity, message, time }) => (
    <div className={`alert-item ${severity}`}>
        <div className="alert-meta">
            <span className="alert-time">{time}</span>
            <span className="alert-id">{id}</span>
            <span className={`alert-tag ${severity}`}>{severity.toUpperCase()}</span>
        </div>
        <div className="alert-msg">{message}</div>
    </div>
);

const Overview = () => {
    const [locations, setLocations] = useState([]);
    const [kpiStats, setKpiStats] = useState({ highRisk: 0, predictedFailures: 0 });
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        const fetchNetworkHealth = async () => {
            const baseAssets = [
                { id: 'BRIDGE_001', pos: [51.505, -0.09], name: 'Central Bridge' },
                { id: 'PIPE_034', pos: [51.51, -0.1], name: 'Water Pipeline' },
                { id: 'ROAD_012', pos: [51.49, -0.08], name: 'Main Highway' },
                { id: 'TRANSFORMER_X99', pos: [51.52, -0.12], name: 'Grid Transformer' },
            ];

            try {
                // Fetch Risk status for every asset in network
                const evaluatedAssets = await Promise.all(baseAssets.map(async (asset) => {
                    const res = await fetch('http://127.0.0.1:8000/predict/risk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ asset_id: asset.id, sensor_readings: [] })
                    });
                    const data = await res.json();

                    let status = 'optimal';
                    let severity = 'low';
                    if (data.risk_score >= 75) { status = 'critical'; severity = 'critical'; }
                    else if (data.risk_score >= 50) { status = 'warning'; severity = 'warning'; }

                    return { ...asset, status, severity, risk_score: data.risk_score };
                }));

                setLocations(evaluatedAssets);

                // Auto-generate Alerts based on High Risk assets returned from the API
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
                    highRisk: evaluatedAssets.filter(a => a.status === 'critical').length,
                    predictedFailures: evaluatedAssets.filter(a => a.risk_score > 60).length
                });

            } catch (err) {
                console.error("API Error connecting to predictions", err);
            }
        };

        fetchNetworkHealth();
    }, []);

    return (
        <div className="overview-container">
            {/* KPI Grid */}
            <div className="kpi-grid">
                <KPICard
                    title="Total Assets Monitored"
                    value="25,480"
                    icon={Database}
                    color="cyan"
                    subtitle="API Active"
                    trend="+12% Active"
                />
                <KPICard
                    title="High Risk Assets"
                    value={kpiStats.highRisk.toString()}
                    secondaryVal={`Δ +${kpiStats.highRisk}`}
                    icon={ShieldAlert}
                    color="rose"
                    subtitle="Requires immediate attention"
                />
                <KPICard
                    title="Active Alerts"
                    value={alerts.length.toString()}
                    secondaryVal={`${kpiStats.predictedFailures > 0 ? kpiStats.predictedFailures : 0} Warning`}
                    icon={Bell}
                    color="amber"
                    subtitle="Auto-populated by ML output"
                />
                <KPICard
                    title="Predicted Failures"
                    value={kpiStats.predictedFailures.toString()}
                    secondaryVal="Assets"
                    icon={Activity}
                    color="predicted"
                    subtitle="Based on Risk Scores > 60"
                />
            </div>

            <div className="main-grid">
                <div className="map-section glass-panel">
                    <div className="map-header">
                        <h3>Infrastructure ML Health Map</h3>
                        <div className="map-controls">
                            <div className="search-bar mini">
                                <Search size={14} />
                                <input type="text" placeholder="Search City Map..." />
                            </div>
                        </div>
                    </div>
                    <div className="leaflet-container">
                        <MapContainer center={[51.505, -0.09]} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {heatmapZones.map((zone, i) => (
                                <CircleMarker key={`heatmap-${i}`} center={zone.pos} radius={zone.radius / 10} pathOptions={{ fillColor: zone.color, fillOpacity: zone.opacity, stroke: false }} />
                            ))}
                            {locations.map(loc => (
                                <CircleMarker
                                    key={loc.id}
                                    center={loc.pos}
                                    radius={8}
                                    pathOptions={{
                                        color: '#fff',
                                        fillColor: loc.status === 'critical' ? '#f43f5e' : loc.status === 'warning' ? '#f59e0b' : '#10b981',
                                        fillOpacity: 1,
                                        weight: 2
                                    }}
                                    className="map-marker-v2"
                                >
                                    <Popup>
                                        <div className="map-popup">
                                            <strong>{loc.id}</strong><br />
                                            {loc.name}<br />
                                            ML Risk: {loc.risk_score}%
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            ))}
                        </MapContainer>
                    </div>
                </div>

                <div className="feed-section glass-panel">
                    <div className="feed-header">
                        <h3>Live ML Alert Feed</h3>
                        <button className="icon-btn"><Activity size={16} /></button>
                    </div>
                    <div className="feed-list">
                        {alerts.length > 0 ? alerts.map((a, i) => (
                            <AlertItem key={i} id={a.id} severity={a.severity} message={a.message} time={a.time} />
                        )) : (
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', padding: '1rem' }}>No critical alerts derived from API.</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="charts-grid">
                <div className="chart-card glass-panel">
                    <h4>Traffic Flow</h4>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                                <YAxis stroke="#64748b" fontSize={10} />
                                <Area type="monotone" dataKey="traffic" stroke="#22d3ee" fill="url(#colorTraffic)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="chart-card glass-panel">
                    <h4>Power Grid Load</h4>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                                <YAxis stroke="#64748b" fontSize={10} />
                                <Area type="monotone" dataKey="power" stroke="#10b981" fill="url(#colorPower)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="chart-card glass-panel">
                    <h4>Water Pressure</h4>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                                <YAxis stroke="#64748b" fontSize={10} />
                                <Area type="monotone" dataKey="water" stroke="#3b82f6" fill="url(#colorWater)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Overview;
