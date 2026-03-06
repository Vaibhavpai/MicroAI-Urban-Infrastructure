import React, { useState, useEffect } from 'react';
import {
    Activity as ActivityIcon, Cpu, Droplets,
    Plus, Minus, Eye, Settings, ArrowRight,
    Zap, Map, AlertTriangle, TrendingUp
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { simulateTwin, predictCascade, getAssets } from '../api/client';
import { useNavigate } from 'react-router-dom';
import './DigitalTwin.css';

const CITY_CENTER = [19.076, 72.877];

const ViewportToolbar = () => (
    <div className="viewport-toolbar">
        <div className="tool-btn"><Plus size={14} /></div>
        <div className="tool-btn"><Minus size={14} /></div>
        <div className="tool-btn"><Eye size={14} /></div>
        <div className="tool-btn"><Settings size={14} /></div>
    </div>
);

const DigitalTwin = () => {
    const navigate = useNavigate();
    const [twinData, setTwinData] = useState(null);
    const [cascadeData, setCascadeData] = useState(null);
    const [trajectoryChartData, setTrajectoryChartData] = useState([]);
    const [miniData] = useState(Array.from({ length: 15 }, (_, i) => ({ val: 30 + Math.random() * 40 })));

    const [assets, setAssets] = useState([]);
    const [selectedAsset, setSelectedAsset] = useState('BRIDGE_001');

    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const assetList = await getAssets();
                const usable = Array.isArray(assetList) ? assetList : [];
                setAssets(usable);
                if (usable.length > 0) {
                    setSelectedAsset(usable[0].asset_id);
                }
            } catch (err) {
                console.error("Failed to fetch assets", err);
            }
        };
        fetchInitial();
    }, []);

    useEffect(() => {
        if (!selectedAsset) return;

        const fetchApiData = async () => {
            try {
                const twinJson = await simulateTwin(selectedAsset, 30);
                setTwinData(twinJson);

                if (twinJson.trajectory) {
                    const mappedData = twinJson.trajectory.map(point => ({
                        time: point.day,
                        label: `Day ${point.day}`,
                        temp: 15 + Math.sin(point.day / 6) * 10 + Math.random() * 2,
                        wind: 50 + Math.sin(point.day / 12) * 40 + Math.random() * 10,
                        precip: point.day > 10 && point.day < 15 ? 60 + Math.random() * 40 : 5,
                        risk: point.risk_score
                    }));
                    setTrajectoryChartData(mappedData);
                }

                const cascadeJson = await predictCascade(selectedAsset);
                setCascadeData(cascadeJson);
            } catch (error) {
                console.error("Failed to fetch API data", error);
            }
        };

        fetchApiData();
    }, [selectedAsset]);

    const displayData = trajectoryChartData.length > 0 ? trajectoryChartData : Array.from({ length: 30 }, (_, i) => ({
        time: i, label: `Day ${i}`, temp: 20, wind: 50, precip: 10, risk: 10
    }));

    const currentAssetDoc = assets.find(a => a.asset_id === selectedAsset);
    const centerLat = currentAssetDoc?.location_lat || 19.076;
    const centerLng = currentAssetDoc?.location_lng || 72.877;

    return (
        <div className="dt-container-v3">
            {/* Page Header */}
            <div className="dt-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="dt-page-title">
                        <span className="text-gradient-cyan">Digital Twin Engine</span>
                        <span className="dt-live-badge"><Zap size={11} /> Active</span>
                    </h1>
                    <p className="dt-page-subtitle">Real-time infrastructure simulation & failure prediction</p>
                </div>
                <div>
                    <select
                        value={selectedAsset}
                        onChange={(e) => setSelectedAsset(e.target.value)}
                        style={{
                            background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9',
                            borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer',
                            outline: 'none'
                        }}
                    >
                        {assets.map(a => (
                            <option key={a.asset_id} value={a.asset_id}>
                                {a.asset_id} ({a.asset_type})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <main className="dt-grid-v3">
                {/* Panel 1: Satellite Map View */}
                <div className="dt-panel-v3">
                    <div className="dt-panel-header">
                        <div>
                            <h3 className="dt-panel-title">
                                <Map size={14} className="panel-icon" />
                                SATELLITE INFRASTRUCTURE VIEW
                            </h3>
                            <p className="dt-panel-subtitle">Real-time asset monitoring — Mumbai Region</p>
                        </div>
                    </div>
                    <div className="dt-map-wrapper">
                        <MapContainer key={`${selectedAsset}-${centerLat}`} center={[centerLat, centerLng]} zoom={14} scrollWheelZoom={true} style={{ height: '100%', width: '100%', borderRadius: 8 }}>
                            <LayersControl position="topright">
                                <LayersControl.BaseLayer name="Satellite" checked>
                                    <TileLayer
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                        attribution="&copy; Esri"
                                        maxZoom={19}
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Dark">
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; CARTO" />
                                </LayersControl.BaseLayer>
                            </LayersControl>
                            {cascadeData && cascadeData.affected_assets && cascadeData.affected_assets.map((asset, i) => {
                                const angle = (i / cascadeData.affected_assets.length) * Math.PI * 2;
                                const distanceScaling = asset.distance ? asset.distance * 0.006 : 0.012;
                                const lat = centerLat + Math.cos(angle) * distanceScaling;
                                const lng = centerLng + Math.sin(angle) * distanceScaling;
                                const color = asset.cascade_risk > 60 ? '#f43f5e' : asset.cascade_risk > 40 ? '#f59e0b' : '#10b981';
                                return (
                                    <CircleMarker key={i} center={[lat, lng]} radius={10}
                                        pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 2 }}
                                        eventHandlers={{ click: () => navigate(`/asset/${asset.asset_id}`) }}
                                    >
                                        <Popup>
                                            <div style={{ fontFamily: 'Inter, sans-serif' }}>
                                                <strong style={{ color: '#f1f5f9' }}>{asset.asset_id}</strong><br />
                                                <span style={{ color: color, fontWeight: 700 }}>Cascade Risk: {asset.cascade_risk}%</span>
                                            </div>
                                        </Popup>
                                    </CircleMarker>
                                );
                            })}
                            <CircleMarker center={[centerLat, centerLng]} radius={14}
                                pathOptions={{ color: '#f43f5e', fillColor: '#f43f5e', fillOpacity: 0.3, weight: 3 }}
                            >
                                <Popup>
                                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                                        <strong style={{ color: '#f1f5f9' }}>{selectedAsset}</strong><br />
                                        <span style={{ color: '#f43f5e', fontWeight: 700 }}>
                                            Source Risk: {cascadeData?.source_risk_score || twinData?.trajectory?.[0]?.risk_score || '...'}%
                                        </span>
                                    </div>
                                </Popup>
                            </CircleMarker>
                        </MapContainer>
                    </div>
                </div>

                {/* Panel 2: Cascade Failure Network */}
                <div className="dt-panel-v3">
                    <div className="dt-panel-header">
                        <div>
                            <h3 className="dt-panel-title">
                                <AlertTriangle size={14} className="panel-icon rose" />
                                CASCADE FAILURE NETWORK
                            </h3>
                            <p className="dt-panel-subtitle">
                                {cascadeData ? `${cascadeData.total_assets_at_risk} assets at risk from ${selectedAsset}` : 'Loading cascade simulation...'}
                            </p>
                        </div>
                    </div>
                    <div className="cascade-graph-wrapper">
                        <svg width="100%" height="100%" viewBox="0 0 500 300">
                            {/* Background grid */}
                            <defs>
                                <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                                </pattern>
                                <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.15" />
                                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                                </radialGradient>
                            </defs>
                            <rect width="500" height="300" fill="url(#grid)" />
                            <circle cx="250" cy="150" r="80" fill="url(#center-glow)" />

                            {/* Center node */}
                            <g transform="translate(250, 150)">
                                <circle r="38" fill="#0f172a" stroke="#f43f5e" strokeWidth="2.5" />
                                <circle r="38" fill="none" stroke="#f43f5e" strokeWidth="1" opacity="0.3" strokeDasharray="4 4">
                                    <animateTransform attributeName="transform" type="rotate" values="0;360" dur="20s" repeatCount="indefinite" />
                                </circle>
                                <text y="-4" textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="800">{selectedAsset}</text>
                                <text y="10" textAnchor="middle" fill="#f43f5e" fontSize="7.5" fontWeight="600">
                                    Risk: {cascadeData?.source_risk_score || twinData?.trajectory?.[0]?.risk_score || '...'}%
                                </text>
                            </g>

                            {cascadeData ? cascadeData.affected_assets.map((asset, i) => {
                                const angle = (i / cascadeData.affected_assets.length) * Math.PI * 2 - Math.PI / 2;
                                const radius = 90 + (asset.distance * 22);
                                const x = 250 + Math.cos(angle) * radius;
                                const y = 150 + Math.sin(angle) * radius;
                                const color = asset.cascade_risk > 60 ? '#f43f5e' : (asset.cascade_risk > 40 ? '#f59e0b' : '#10b981');

                                return (
                                    <g key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(`/asset/${asset.asset_id}`)}>
                                        <line x1="250" y1="150" x2={x} y2={y} stroke={color} strokeWidth="1.5" strokeOpacity="0.3" strokeDasharray={asset.distance > 1 ? "4 4" : "none"} />
                                        <circle cx={x} cy={y} r="22" fill="#0f172a" stroke={color} strokeWidth="1.5" />
                                        <circle cx={x} cy={y} r="5" fill={color} />
                                        <text x={x} y={y + 16} textAnchor="middle" fill="#94a3b8" fontSize="7" fontWeight="600">
                                            {asset.asset_id}
                                        </text>
                                        <text x={x} y={y + 25} textAnchor="middle" fill={color} fontSize="6.5" fontWeight="700">
                                            {asset.cascade_risk}%
                                        </text>
                                    </g>
                                );
                            }) : (
                                <text x="250" y="220" textAnchor="middle" fill="#64748b" fontSize="11">
                                    Loading cascade data...
                                </text>
                            )}
                        </svg>
                    </div>
                </div>

                {/* Panel 3: Risk Trajectory */}
                <div className="dt-panel-v3 span-2">
                    <div className="dt-panel-header">
                        <div>
                            <h3 className="dt-panel-title">
                                <TrendingUp size={14} className="panel-icon amber" />
                                SIMULATED RISK PROGRESSION (T+30 DAYS)
                            </h3>
                        </div>
                        <div className="weather-legend">
                            <span className="legend-item"><span className="l-dot" style={{ background: '#f43f5e' }} /> ML Risk</span>
                            <span className="legend-item"><span className="l-dot" style={{ background: '#f59e0b' }} /> Wind</span>
                            <span className="legend-item"><span className="l-dot" style={{ background: '#6366f1' }} /> Precip</span>
                        </div>
                    </div>

                    <div className="stacked-weather-container">
                        <div className="weather-chart-slice main-chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={displayData}>
                                    <defs>
                                        <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="windFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" />
                                    <XAxis dataKey="label" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} interval={4} />
                                    <YAxis hide domain={[0, 150]} />
                                    <Tooltip
                                        contentStyle={{
                                            background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 10, fontSize: '0.75rem'
                                        }}
                                    />
                                    <Area type="monotone" dataKey="wind" stroke="#f59e0b" fill="url(#windFill)" strokeWidth={1.5} />
                                    <Area type="monotone" dataKey="risk" stroke="#f43f5e" strokeDasharray="6 3" fill="url(#riskFill)" strokeWidth={2.5} />
                                    <Area type="step" dataKey="precip" stroke="#6366f1" fill="#6366f1" fillOpacity={0.08} strokeWidth={1} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="chart-timeline-row">
                            <span>0 Days</span><span>7 Days</span><span>14 Days</span><span>21 Days</span><span>30 Days</span>
                        </div>
                    </div>
                </div>
            </main>

            {/* Bottom Mini Cards */}
            <div className="dt-bottom-grid">
                {[
                    { title: 'Traffic Flow', color: '#22d3ee', icon: ActivityIcon, value: '2.4K' },
                    { title: 'Power Grid Load', color: '#10b981', icon: Cpu, value: '78%' },
                    { title: 'Water Pressure', color: '#6366f1', icon: Droplets, value: '45 PSI' },
                    { title: 'Structural Health', color: '#f43f5e', icon: ActivityIcon, value: '67/100' },
                ].map((item, i) => (
                    <div key={i} className="dt-mini-card">
                        <div className="mini-card-header">
                            <span className="mini-card-title">{item.title.toUpperCase()}</span>
                            <item.icon size={13} color={item.color} />
                        </div>
                        <div className="mini-card-value" style={{ color: item.color }}>{item.value}</div>
                        <div className="mini-card-chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={miniData}>
                                    <Area type="monotone" dataKey="val" stroke={item.color} fill={item.color} fillOpacity={0.08} strokeWidth={1.5} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DigitalTwin;
