import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Settings, ArrowLeft, ExternalLink, MapPin,
    Zap, AlertTriangle, TrendingUp, Leaf,
    Sparkles, Clock, Shield, ChevronDown, ChevronUp
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ComposedChart, Area, BarChart, Bar
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { predictRisk, explainAsset, simulateTwin, getCost, getWeather, getCarbon, getAIRecommendation } from '../api/client';
import './AssetDetail.css';

const ASSET_POSITIONS = {
    BRIDGE_001: [19.064, 72.870],
    PIPE_042: [19.082, 72.890],
    ROAD_012: [19.058, 72.850],
    TRANSFORMER_007: [19.095, 72.865],
};

const HealthGauge = ({ value, confidenceLower = 0, confidenceUpper = 0 }) => {
    const valueToAngle = (v) => 180 - (v / 100) * 180;
    const angle = valueToAngle(value || 0);
    const cx = 100; const cy = 110; const radius = 80;
    const needleRadius = radius - 4;
    const rad = (Math.PI / 180) * angle;

    const getColor = (v) => {
        if (v > 75) return '#f43f5e';
        if (v > 50) return '#f59e0b';
        return '#10b981';
    };

    return (
        <div className="gauge-container">
            <svg viewBox="0 0 200 130">
                <defs>
                    <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="50%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#f43f5e" />
                    </linearGradient>
                    <filter id="needle-glow">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>
                {/* Background track */}
                <path d="M20,110 A80,80 0 0,1 180,110" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="18" strokeLinecap="round" />
                {/* Colored arc */}
                <path d="M20,110 A80,80 0 0,1 180,110" fill="none" stroke="url(#gauge-gradient)" strokeWidth="14" strokeLinecap="round" />
                {/* Needle */}
                <line
                    x1={cx + 20 * Math.cos(rad)} y1={cy - 20 * Math.sin(rad)}
                    x2={cx + needleRadius * Math.cos(rad)} y2={cy - needleRadius * Math.sin(rad)}
                    stroke={getColor(value)} strokeWidth="3" strokeLinecap="round" filter="url(#needle-glow)"
                />
                <circle cx={cx} cy={cy} r="6" fill="var(--bg-primary)" stroke={getColor(value)} strokeWidth="3" />
                {/* Value */}
                <text x={cx} y={cy + 24} textAnchor="middle" fill={getColor(value)} fontSize="20" fontWeight="800">
                    {value}
                </text>
                <text x={cx} y={cy + 36} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">
                    / 100
                </text>
            </svg>
            <div className="gauge-labels"><span>0</span><span>100</span></div>
        </div>
    );
};

const MaintenanceAction = ({ id, title, desc, urgent }) => (
    <div className={`maintenance-item-v4 ${urgent ? 'urgent-item' : ''}`}>
        <div className="item-number-v4">{id}.</div>
        <div className="item-content-v4">
            <div className="item-title-v4">{title}</div>
            <div className="item-desc-v4">{desc}</div>
        </div>
    </div>
);

const SEVERITY_CONFIG = {
    critical: { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)', icon: '🔴' },
    high: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '🟠' },
    medium: { color: '#22d3ee', bg: 'rgba(34,211,238,0.10)', border: 'rgba(34,211,238,0.25)', icon: '🔵' },
    low: { color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', icon: '🟢' },
};

const AIRecommendationCard = ({ rec, index }) => {
    const [expanded, setExpanded] = useState(false);
    const sev = SEVERITY_CONFIG[rec.severity] || SEVERITY_CONFIG.medium;

    return (
        <div
            className="ai-rec-card"
            style={{
                '--sev-color': sev.color,
                '--sev-bg': sev.bg,
                '--sev-border': sev.border,
                animationDelay: `${index * 0.1}s`,
            }}
        >
            <div className="ai-rec-header" onClick={() => setExpanded(!expanded)}>
                <div className="ai-rec-left">
                    <span className="ai-rec-index">{index + 1}</span>
                    <div>
                        <div className="ai-rec-title">{rec.title}</div>
                        <span className="ai-rec-severity" style={{ background: sev.bg, color: sev.color, borderColor: sev.border }}>
                            {sev.icon} {rec.severity}
                        </span>
                    </div>
                </div>
                <button className="ai-rec-toggle">
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {expanded && (
                <div className="ai-rec-details">
                    <div className="ai-rec-detail-row">
                        <Shield size={13} className="ai-rec-icon" />
                        <div>
                            <div className="ai-rec-detail-label">Prevention Action</div>
                            <div className="ai-rec-detail-text">{rec.prevention}</div>
                        </div>
                    </div>
                    <div className="ai-rec-detail-row">
                        <Clock size={13} className="ai-rec-icon" />
                        <div>
                            <div className="ai-rec-detail-label">Timeline</div>
                            <div className="ai-rec-detail-text">{rec.timeline}</div>
                        </div>
                    </div>
                    <div className="ai-rec-detail-row">
                        <TrendingUp size={13} className="ai-rec-icon" />
                        <div>
                            <div className="ai-rec-detail-label">Estimated Impact</div>
                            <div className="ai-rec-detail-text ai-impact-highlight">{rec.estimated_impact}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const AssetDetail = () => {
    const { assetId } = useParams();
    const navigate = useNavigate();
    const currentAssetId = assetId || 'BRIDGE_001';
    const assetPos = ASSET_POSITIONS[currentAssetId] || [19.076, 72.877];

    const [delay, setDelay] = useState(15);
    const [assetData, setAssetData] = useState(null);
    const [shapData, setShapData] = useState(null);
    const [costData, setCostData] = useState(null);
    const [weatherData, setWeatherData] = useState(null);
    const [carbonData, setCarbonData] = useState(null);
    const [trajectory, setTrajectory] = useState([]);
    const [aiRecs, setAiRecs] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [riskResult, shapResult] = await Promise.all([
                    predictRisk(currentAssetId),
                    explainAsset(currentAssetId),
                ]);
                setAssetData(riskResult);
                setShapData(shapResult);

                // Fetch AI Recommendations using SHAP values
                if (shapResult?.top_factors?.length) {
                    setAiLoading(true);
                    setAiError(null);
                    try {
                        const aiResult = await getAIRecommendation({
                            asset_id: currentAssetId,
                            asset_type: shapResult.asset_type || currentAssetId.split('_')[0],
                            risk_score: riskResult?.risk_score || 0,
                            risk_level: riskResult?.risk_level || 'Unknown',
                            top_factors: shapResult.top_factors,
                        });
                        setAiRecs(aiResult);
                    } catch (aiErr) {
                        console.error('AI Recommendation error:', aiErr);
                        setAiError('Could not load AI recommendations');
                    } finally {
                        setAiLoading(false);
                    }
                }

                const [costResult, weatherResult, carbonResult] = await Promise.all([
                    getCost(currentAssetId, delay).catch(() => null),
                    getWeather(currentAssetId).catch(() => null),
                    getCarbon(currentAssetId).catch(() => null),
                ]);
                setCostData(costResult);
                setWeatherData(weatherResult);
                setCarbonData(carbonResult);
            } catch (err) {
                console.error("API Connection Error", err);
            }
        };
        fetchAll();
    }, [currentAssetId]);

    useEffect(() => {
        if (!currentAssetId) return;
        simulateTwin(currentAssetId, delay)
            .then(data => setTrajectory(data.trajectory || []))
            .catch(() => { });
    }, [currentAssetId, delay]);

    const currentRisk = assetData ? Math.round(assetData.risk_score) : 0;
    const isCritical = currentRisk > 75;
    const finalRisk = trajectory.length > 0
        ? Math.round(trajectory[trajectory.length - 1]?.risk_score || currentRisk)
        : Math.min(currentRisk + Math.round(delay * (isCritical ? 1.2 : 0.6)), 100);

    const chartData = trajectory.map(p => ({
        day: `Day ${p.day}`,
        risk: p.risk_score,
    }));

    const getStatusColor = () => {
        if (currentRisk > 75) return '#f43f5e';
        if (currentRisk > 50) return '#f59e0b';
        return '#10b981';
    };

    return (
        <div className="asset-detail-v2">
            {/* Header */}
            <div className="unified-header-v5">
                <div className="header-left-group">
                    <div className="title-with-actions">
                        <button className="back-btn" onClick={() => navigate('/')}>
                            <ArrowLeft size={16} />
                        </button>
                        <div>
                            <h1 className="asset-page-title">
                                <span className="text-gradient-cyan">{currentAssetId.replace('_', ' ')}</span>
                                <span
                                    className="status-pill"
                                    style={{ background: `${getStatusColor()}20`, color: getStatusColor(), borderColor: `${getStatusColor()}40` }}
                                >
                                    {assetData?.risk_level || 'Loading'}
                                </span>
                            </h1>
                            <div className="subtitle-v2">
                                <MapPin size={13} />
                                <span>Mumbai Metropolitan Region</span>
                                {weatherData && (
                                    <>
                                        <span className="sep">•</span>
                                        <span>🌡️ {weatherData.current_weather.temperature_c}°C</span>
                                        <span className="sep">•</span>
                                        <span>💧 {weatherData.current_weather.precipitation_mm}mm</span>
                                        <span className="sep">•</span>
                                        <span>Weather ×{weatherData.weather_risk_multiplier}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="header-quick-actions">
                        <button className="quick-btn" onClick={() => navigate('/digital-twin')}>
                            <Zap size={14} /> Digital Twin
                        </button>
                        <button className="quick-btn" onClick={() => navigate('/incidents')}>
                            <AlertTriangle size={14} /> Incidents
                        </button>
                    </div>
                </div>
            </div>

            <div className="main-v2-grid">
                {/* Left Column */}
                <div className="left-column">
                    {/* Health Gauge */}
                    <div className={`panel health-overview glass-panel ${isCritical ? 'strong-glow-red' : ''}`}>
                        <h3>ASSET HEALTH OVERVIEW</h3>
                        <div className="health-content">
                            <HealthGauge
                                value={currentRisk}
                                confidenceLower={assetData?.confidence_lower || 0}
                                confidenceUpper={assetData?.confidence_upper || 0}
                            />
                            <div className="health-metrics-v2">
                                <div className="metric-v2">
                                    <span className="label-v2">Risk Score</span>
                                    <div className="val-v2" style={{ color: getStatusColor() }}>{currentRisk}/100</div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">Confidence</span>
                                    <div className="val-v2">[{assetData?.confidence_lower ?? '—'}, {assetData?.confidence_upper ?? '—'}]</div>
                                </div>
                            </div>
                        </div>
                        <div className="health-footer-tags">
                            {shapData?.top_factors?.slice(0, 3).map((factor, i) => (
                                <span key={i} className="tag red">SHAP: {factor.description}</span>
                            ))}
                        </div>
                    </div>

                    {/* What-If Sim */}
                    <div className="panel simulation-panel glass-panel">
                        <h3>WHAT-IF SIMULATION</h3>
                        <div className="sim-content">
                            <div className="sim-label">"DELAY REPAIR BY..."</div>
                            <input type="range" min="0" max="90" value={delay} onChange={(e) => setDelay(parseInt(e.target.value))} className="sim-slider" />
                            <div className="slider-labels"><span>0 Days</span><span>45 Days</span><span>90 Days</span></div>
                            <div className="sim-impact">
                                <div className="impact-text">Impact of {delay}-day delay:</div>
                                <div className="impact-value">
                                    Risk climbs to <span className="final">{finalRisk} ({finalRisk > 75 ? 'Critical' : finalRisk > 50 ? 'High' : 'Moderate'})</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cost of Inaction */}
                    {costData && (
                        <div className="panel glass-panel cost-panel">
                            <h3>💰 COST OF INACTION</h3>
                            <div className="cost-grid">
                                <div className="metric-v2">
                                    <span className="label-v2">Preventive</span>
                                    <div className="val-v2" style={{ color: 'var(--emerald)' }}>₹{costData.preventive_cost?.toLocaleString()}</div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">Reactive</span>
                                    <div className="val-v2" style={{ color: 'var(--rose)' }}>₹{costData.reactive_cost?.toLocaleString()}</div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">Savings</span>
                                    <div className="val-v2" style={{ color: 'var(--cyan)' }}>₹{costData.savings?.toLocaleString()}</div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">ROI</span>
                                    <div className="val-v2" style={{ color: 'var(--amber)' }}>{costData.roi_percent}%</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Center Column */}
                <div className="center-column">
                    {/* Satellite Map */}
                    <div className="panel glass-panel asset-map-panel">
                        <h3>📍 ASSET LOCATION — SATELLITE</h3>
                        <div className="asset-map-wrapper">
                            <MapContainer center={assetPos} zoom={16} scrollWheelZoom={true} style={{ height: '100%', width: '100%', borderRadius: 10 }}>
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
                                <CircleMarker center={assetPos} radius={14}
                                    pathOptions={{
                                        color: '#fff',
                                        fillColor: getStatusColor(),
                                        fillOpacity: 0.9,
                                        weight: 3
                                    }}
                                >
                                    <Popup>
                                        <div style={{ fontFamily: 'Inter, sans-serif' }}>
                                            <strong style={{ color: '#f1f5f9' }}>{currentAssetId}</strong><br />
                                            <span style={{ color: getStatusColor(), fontWeight: 700 }}>Risk: {currentRisk}%</span>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            </MapContainer>
                        </div>
                    </div>

                    {/* Risk Trajectory */}
                    <div className="panel sensor-trends glass-panel">
                        <div className="panel-header-v2">
                            <h3>📈 RISK TRAJECTORY — {delay} DAY PROJECTION</h3>
                        </div>
                        <div className="chart-track">
                            <div className="chart-wrapper-v3">
                                {chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={240}>
                                        <ComposedChart data={chartData}>
                                            <defs>
                                                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                            <XAxis dataKey="day" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                                            <YAxis domain={[0, 100]} stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                                            <Tooltip
                                                contentStyle={{
                                                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: 10, fontSize: '0.75rem'
                                                }}
                                            />
                                            <Area type="monotone" dataKey="risk" stroke="#f43f5e" fill="url(#riskGrad)" strokeWidth={2.5} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="chart-loading">Loading trajectory from ML API...</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Carbon Impact */}
                    {carbonData && (
                        <div className="panel glass-panel carbon-panel">
                            <h3><Leaf size={14} style={{ color: 'var(--emerald)' }} /> CARBON IMPACT</h3>
                            <div className="carbon-grid">
                                <div className="metric-v2">
                                    <span className="label-v2">CO₂ Saved</span>
                                    <div className="val-v2" style={{ color: 'var(--emerald)' }}>{carbonData.co2_saved_kg} kg</div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">Trees Equivalent</span>
                                    <div className="val-v2" style={{ color: 'var(--cyan)' }}>{carbonData.trees_equivalent} 🌳/yr</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column */}
                <div className="right-column">
                    <div className="panel maintenance-sidebar glass-panel">
                        <div className="maintenance-actions">
                            <h4 className="actions-subheader">ML RECOMMENDATIONS</h4>
                            {shapData?.top_factors?.map((f, i) => (
                                <MaintenanceAction
                                    key={i}
                                    id={i + 1}
                                    title={`Address ${f.feature.replace('_', ' ')}`}
                                    urgent={f.impact > 0.3}
                                    desc={f.description}
                                />
                            ))}
                            {(!shapData || !shapData.top_factors?.length) && (
                                <MaintenanceAction id={1} title="Loading from ML API..." desc="Standby" urgent />
                            )}
                        </div>

                        {/* ── AI Recommendations (Gemini) ── */}
                        <div className="ai-rec-section">
                            <h4 className="ai-rec-subheader">
                                <Sparkles size={14} /> AI PREVENTION RECOMMENDATIONS
                            </h4>
                            {aiRecs?.summary && (
                                <div className="ai-rec-summary">{aiRecs.summary}</div>
                            )}

                            {aiLoading && (
                                <div className="ai-rec-loading">
                                    <div className="ai-loading-spinner" />
                                    <span>Gemini AI is analyzing SHAP values...</span>
                                </div>
                            )}

                            {aiError && (
                                <div className="ai-rec-error">
                                    <AlertTriangle size={14} /> {aiError}
                                </div>
                            )}

                            {aiRecs?.recommendations?.map((rec, i) => (
                                <AIRecommendationCard key={i} rec={rec} index={i} />
                            ))}
                        </div>

                        <button className="execute-btn" onClick={() => navigate('/incidents')}>
                            CREATE WORK ORDER
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AssetDetail;
