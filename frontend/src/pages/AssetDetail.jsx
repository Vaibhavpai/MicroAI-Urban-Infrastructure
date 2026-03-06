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
    BRIDGE_002: [19.068, 72.875],
    PIPE_042: [19.082, 72.890],
    PIPE_043: [19.079, 72.885],
    ROAD_012: [19.058, 72.850],
    ROAD_013: [19.055, 72.855],
    TRANSFORMER_007: [19.095, 72.865],
    TRANSFORMER_008: [19.091, 72.860],
    HOSPITAL_001: [19.016, 72.852],
};

const getAssetType = (id) => {
    if (!id) return 'Other'
    if (id.startsWith('BRIDGE')) return 'Bridge'
    if (id.startsWith('PIPE')) return 'Pipeline'
    if (id.startsWith('ROAD')) return 'Road'
    if (id.startsWith('TRANSFORMER')) return 'Transformer'
    if (id.startsWith('HOSPITAL')) return 'Hospital'
    return 'Other'
}

const getAssetIcon = (type) => {
    if (type === 'Bridge') return '🌉'
    if (type === 'Pipeline') return '🔧'
    if (type === 'Road') return '🛣️'
    if (type === 'Transformer') return '⚡'
    if (type === 'Hospital') return '🏥'
    return '🏗️'
}

const TYPE_ORDER = ['Bridge', 'Pipeline', 'Road', 'Transformer', 'Other']

// ── HealthGauge ───────────────────────────────────────────────────────────────
const HealthGauge = ({ value }) => {
    const getColor = (v) => {
        if (v > 75) return '#f43f5e'
        if (v > 50) return '#f59e0b'
        return '#10b981'
    }

    const color = getColor(value);

    return (
        <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '10px' }}>
            <svg viewBox="0 0 200 110" style={{ width: '100%', maxWidth: '240px', overflow: 'visible' }}>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                {/* Background arc */}
                <path d="M 20 100 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="16"
                    strokeLinecap="round" />
                {/* Colored progress arc */}
                <path d="M 20 100 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke={color}
                    strokeWidth="16"
                    strokeLinecap="round"
                    pathLength="100"
                    strokeDasharray="100"
                    strokeDashoffset={100 - (value || 0)}
                    filter="url(#glow)"
                    style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease' }}
                />
            </svg>
            {/* Center value */}
            <div style={{ position: 'absolute', top: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '42px', fontWeight: '800', color: color, lineHeight: '1', textShadow: `0 0 20px ${color}40` }}>
                    {value || 0}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', letterSpacing: '2px', marginTop: '4px' }}>
                    RISK
                </span>
            </div>
            {/* Range labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '160px', marginTop: '-5px', color: '#64748b', fontSize: '11px', fontWeight: '700' }}>
                <span>0</span>
                <span>100</span>
            </div>
        </div>
    )
}

// ── MaintenanceAction ─────────────────────────────────────────────────────────
const MaintenanceAction = ({ id, title, desc, urgent }) => (
    <div className={`maintenance-item-v4 ${urgent ? 'urgent-item' : ''}`}>
        <div className="item-number-v4">{id}.</div>
        <div className="item-content-v4">
            <div className="item-title-v4">{title}</div>
            <div className="item-desc-v4">{desc}</div>
        </div>
    </div>
)

// ── AIRecommendationCard ──────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
    critical: { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)', icon: '🔴' },
    high: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '🟠' },
    medium: { color: '#22d3ee', bg: 'rgba(34,211,238,0.10)', border: 'rgba(34,211,238,0.25)', icon: '🔵' },
    low: { color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', icon: '🟢' },
}

const AIRecommendationCard = ({ rec, index }) => {
    const [expanded, setExpanded] = useState(false)
    const sev = SEVERITY_CONFIG[rec.severity] || SEVERITY_CONFIG.medium

    return (
        <div className="ai-rec-card"
            style={{
                '--sev-color': sev.color, '--sev-bg': sev.bg,
                '--sev-border': sev.border, animationDelay: `${index * 0.1}s`
            }}>
            <div className="ai-rec-header" onClick={() => setExpanded(!expanded)}>
                <div className="ai-rec-left">
                    <span className="ai-rec-index">{index + 1}</span>
                    <div>
                        <div className="ai-rec-title">{rec.title}</div>
                        <span className="ai-rec-severity"
                            style={{ background: sev.bg, color: sev.color, borderColor: sev.border }}>
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
                            <div className="ai-rec-detail-text ai-impact-highlight">
                                {rec.estimated_impact}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── AssetDetail ───────────────────────────────────────────────────────────────
const AssetDetail = () => {
    const { assetId } = useParams()
    const navigate = useNavigate()
    const currentAssetId = assetId || 'BRIDGE_001'
    const assetPos = ASSET_POSITIONS[currentAssetId] || [19.076, 72.877]

    const [delay, setDelay] = useState(15)
    const [assetData, setAssetData] = useState(null)
    const [shapData, setShapData] = useState(null)
    const [costData, setCostData] = useState(null)
    const [weatherData, setWeatherData] = useState(null)
    const [carbonData, setCarbonData] = useState(null)
    const [trajectory, setTrajectory] = useState([])
    const [aiRecs, setAiRecs] = useState(null)
    const [aiLoading, setAiLoading] = useState(false)
    const [aiError, setAiError] = useState(null)

    // ── NEW: assets from MongoDB for dropdown ─────────────────────────────────
    const [allAssets, setAllAssets] = useState([])
    const [assetsLoading, setAssetsLoading] = useState(true)

    // ── fetch all assets from MongoDB ─────────────────────────────────────────
    useEffect(() => {
        const loadAssets = async () => {
            setAssetsLoading(true)
            try {
                const res = await fetch('http://localhost:8000/assets')
                if (!res.ok) throw new Error(`${res.status}`)
                const data = await res.json()
                const mapped = data.map(a => {
                    const id = a.asset_id || a.id || String(a._id)
                    const type = getAssetType(id)
                    return { id, type, icon: getAssetIcon(type) }
                })
                mapped.sort((a, b) =>
                    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
                )
                setAllAssets(mapped)
            } catch (e) {
                console.warn('Could not fetch assets for dropdown:', e.message)
                // fallback so dropdown is never empty
                setAllAssets([
                    { id: 'BRIDGE_001', type: 'Bridge', icon: '🌉' },
                    { id: 'BRIDGE_002', type: 'Bridge', icon: '🌉' },
                    { id: 'PIPE_042', type: 'Pipeline', icon: '🔧' },
                    { id: 'PIPE_043', type: 'Pipeline', icon: '🔧' },
                    { id: 'ROAD_012', type: 'Road', icon: '🛣️' },
                    { id: 'ROAD_013', type: 'Road', icon: '🛣️' },
                    { id: 'TRANSFORMER_007', type: 'Transformer', icon: '⚡' },
                    { id: 'TRANSFORMER_008', type: 'Transformer', icon: '⚡' },
                ])
            } finally {
                setAssetsLoading(false)
            }
        }
        loadAssets()
    }, [])

    // ── fetch ML data for selected asset ─────────────────────────────────────
    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [riskResult, shapResult] = await Promise.all([
                    predictRisk(currentAssetId),
                    explainAsset(currentAssetId),
                ])
                setAssetData(riskResult)
                setShapData(shapResult)

                if (shapResult?.top_factors?.length) {
                    setAiLoading(true)
                    setAiError(null)
                    try {
                        const aiResult = await getAIRecommendation({
                            asset_id: currentAssetId,
                            asset_type: shapResult.asset_type || currentAssetId.split('_')[0],
                            risk_score: riskResult?.risk_score || 0,
                            risk_level: riskResult?.risk_level || 'Unknown',
                            top_factors: shapResult.top_factors,
                        })
                        setAiRecs(aiResult)
                    } catch (aiErr) {
                        console.error('AI Recommendation error:', aiErr)
                        setAiError('Could not load AI recommendations')
                    } finally {
                        setAiLoading(false)
                    }
                }

                const [costResult, weatherResult, carbonResult] = await Promise.all([
                    getCost(currentAssetId, delay).catch(() => null),
                    getWeather(currentAssetId).catch(() => null),
                    getCarbon(currentAssetId).catch(() => null),
                ])
                setCostData(costResult)
                setWeatherData(weatherResult)
                setCarbonData(carbonResult)
            } catch (err) {
                console.error('API Connection Error', err)
            }
        }
        fetchAll()
    }, [currentAssetId])

    useEffect(() => {
        if (!currentAssetId) return
        simulateTwin(currentAssetId, delay)
            .then(data => setTrajectory(data.trajectory || []))
            .catch(() => { })
    }, [currentAssetId, delay])

    const currentRisk = assetData ? Math.round(assetData.risk_score) : 0
    const isCritical = currentRisk > 75
    const finalRisk = trajectory.length > 0
        ? Math.round(trajectory[trajectory.length - 1]?.risk_score || currentRisk)
        : Math.min(currentRisk + Math.round(delay * (isCritical ? 1.2 : 0.6)), 100)

    const chartData = trajectory.map(p => ({
        day: `Day ${p.day}`,
        risk: p.risk_score,
    }))

    const getStatusColor = () => {
        if (currentRisk > 75) return '#f43f5e'
        if (currentRisk > 50) return '#f59e0b'
        return '#10b981'
    }

    // group allAssets by type for the optgroup dropdown
    const assetsByType = TYPE_ORDER
        .filter(t => allAssets.some(a => a.type === t))
        .map(t => ({ type: t, assets: allAssets.filter(a => a.type === t) }))

    return (
        <div className="asset-detail-v2">

            {/* ── HEADER ── */}
            <div className="unified-header-v5">
                <div className="header-left-group">
                    <div className="title-with-actions">
                        <button className="back-btn" onClick={() => navigate('/')}>
                            <ArrowLeft size={16} />
                        </button>
                        <div style={{ flex: 1 }}>
                            <h1 className="asset-page-title">
                                <span className="text-gradient-cyan">
                                    {currentAssetId.replace('_', ' ')}
                                </span>
                                <span className="status-pill"
                                    style={{
                                        background: `${getStatusColor()}20`,
                                        color: getStatusColor(),
                                        borderColor: `${getStatusColor()}40`
                                    }}>
                                    {assetData?.risk_level || 'Loading'}
                                </span>
                            </h1>

                            {/* ── ASSET SELECTOR DROPDOWN ── */}
                            <div style={{
                                marginTop: '10px', display: 'flex',
                                alignItems: 'center', gap: '10px', flexWrap: 'wrap'
                            }}>

                                {/* Label */}
                                <span style={{
                                    color: '#64748b', fontSize: '11px',
                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                    fontWeight: '600', whiteSpace: 'nowrap'
                                }}>
                                    Switch Asset:
                                </span>

                                {/* Grouped select */}
                                <select
                                    value={currentAssetId}
                                    disabled={assetsLoading}
                                    onChange={e => navigate(`/asset/${e.target.value}`)}
                                    style={{
                                        background: '#1e293b',
                                        border: '1px solid #334155',
                                        color: assetsLoading ? '#64748b' : '#f1f5f9',
                                        borderRadius: '8px',
                                        padding: '6px 32px 6px 12px',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        cursor: assetsLoading ? 'wait' : 'pointer',
                                        outline: 'none',
                                        appearance: 'none',
                                        WebkitAppearance: 'none',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: 'right 10px center',
                                        minWidth: '210px',
                                    }}>
                                    {assetsLoading
                                        ? <option>Loading assets from DB...</option>
                                        : assetsByType.map(({ type, assets }) => (
                                            <optgroup key={type} label={`── ${type} ──`}
                                                style={{ background: '#0f172a', color: '#94a3b8' }}>
                                                {assets.map(asset => (
                                                    <option key={asset.id} value={asset.id}
                                                        style={{ background: '#1e293b', color: '#f1f5f9' }}>
                                                        {asset.icon}  {asset.id}
                                                        {asset.id === currentAssetId ? '  ✓' : ''}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))
                                    }
                                </select>

                                {/* Quick-jump chips (first 5 assets) */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {allAssets.slice(0, 5).map(asset => {
                                        const isActive = asset.id === currentAssetId
                                        return (
                                            <button key={asset.id}
                                                onClick={() => navigate(`/asset/${asset.id}`)}
                                                style={{
                                                    background: isActive
                                                        ? `${getStatusColor()}20`
                                                        : 'rgba(255,255,255,0.04)',
                                                    border: isActive
                                                        ? `1px solid ${getStatusColor()}50`
                                                        : '1px solid rgba(255,255,255,0.08)',
                                                    color: isActive ? getStatusColor() : '#94a3b8',
                                                    borderRadius: '6px',
                                                    padding: '4px 10px',
                                                    fontSize: '11px',
                                                    fontWeight: isActive ? '600' : '400',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                {asset.icon} {asset.id.replace('_0', '')}
                                            </button>
                                        )
                                    })}
                                </div>

                                {/* Asset count badge */}
                                {!assetsLoading && (
                                    <span style={{
                                        background: 'rgba(99,102,241,0.1)',
                                        border: '1px solid rgba(99,102,241,0.25)',
                                        color: '#818cf8', borderRadius: '999px',
                                        padding: '2px 10px', fontSize: '10px', fontWeight: '600'
                                    }}>
                                        {allAssets.length} assets in DB
                                    </span>
                                )}
                            </div>

                            {/* Subtitle row */}
                            <div className="subtitle-v2" style={{ marginTop: '8px' }}>
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

            {/* ── MAIN GRID ── */}
            <div className="main-v2-grid">

                {/* Left Column */}
                <div className="left-column">
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
                                    <div className="val-v2" style={{ color: getStatusColor() }}>
                                        {currentRisk}/100
                                    </div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">Confidence</span>
                                    <div className="val-v2">
                                        [{assetData?.confidence_lower ?? '—'},
                                        {assetData?.confidence_upper ?? '—'}]
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="health-footer-tags">
                            {shapData?.top_factors?.slice(0, 3).map((factor, i) => (
                                <span key={i} className="tag red">
                                    SHAP: {factor.description}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="panel simulation-panel glass-panel">
                        <h3>WHAT-IF SIMULATION</h3>
                        <div className="sim-content">
                            <div className="sim-label">"DELAY REPAIR BY..."</div>
                            <input type="range" min="0" max="90" value={delay}
                                onChange={e => setDelay(parseInt(e.target.value))}
                                className="sim-slider" />
                            <div className="slider-labels">
                                <span>0 Days</span><span>45 Days</span><span>90 Days</span>
                            </div>
                            <div className="sim-impact">
                                <div className="impact-text">Impact of {delay}-day delay:</div>
                                <div className="impact-value">
                                    Risk climbs to{' '}
                                    <span className="final">
                                        {finalRisk} ({finalRisk > 75 ? 'Critical' : finalRisk > 50 ? 'High' : 'Moderate'})
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {costData && (
                        <div className="panel glass-panel cost-panel">
                            <h3>💰 COST OF INACTION</h3>
                            <div className="cost-grid">
                                <div className="metric-v2">
                                    <span className="label-v2">Preventive</span>
                                    <div className="val-v2" style={{ color: 'var(--emerald)' }}>
                                        ₹{costData.preventive_cost?.toLocaleString()}
                                    </div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">Reactive</span>
                                    <div className="val-v2" style={{ color: 'var(--rose)' }}>
                                        ₹{costData.reactive_cost?.toLocaleString()}
                                    </div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">Savings</span>
                                    <div className="val-v2" style={{ color: 'var(--cyan)' }}>
                                        ₹{costData.savings?.toLocaleString()}
                                    </div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">ROI</span>
                                    <div className="val-v2" style={{ color: 'var(--amber)' }}>
                                        {costData.roi_percent}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Center Column */}
                <div className="center-column">
                    <div className="panel glass-panel asset-map-panel">
                        <h3>📍 ASSET LOCATION — SATELLITE</h3>
                        <div className="asset-map-wrapper">
                            <MapContainer center={assetPos} zoom={16}
                                scrollWheelZoom={true}
                                style={{ height: '100%', width: '100%', borderRadius: 10 }}>
                                <LayersControl position="topright">
                                    <LayersControl.BaseLayer name="Satellite" checked>
                                        <TileLayer
                                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                            attribution="&copy; Esri" maxZoom={19} />
                                    </LayersControl.BaseLayer>
                                    <LayersControl.BaseLayer name="Dark">
                                        <TileLayer
                                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                            attribution="&copy; CARTO" />
                                    </LayersControl.BaseLayer>
                                </LayersControl>
                                <CircleMarker center={assetPos} radius={14}
                                    pathOptions={{
                                        color: '#fff', fillColor: getStatusColor(),
                                        fillOpacity: 0.9, weight: 3
                                    }}>
                                    <Popup>
                                        <div style={{ fontFamily: 'Inter, sans-serif' }}>
                                            <strong style={{ color: '#f1f5f9' }}>
                                                {currentAssetId}
                                            </strong><br />
                                            <span style={{ color: getStatusColor(), fontWeight: 700 }}>
                                                Risk: {currentRisk}%
                                            </span>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            </MapContainer>
                        </div>
                    </div>

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
                                            <CartesianGrid strokeDasharray="3 3"
                                                stroke="rgba(255,255,255,0.04)" vertical={false} />
                                            <XAxis dataKey="day" stroke="#475569"
                                                fontSize={9} tickLine={false} axisLine={false} />
                                            <YAxis domain={[0, 100]} stroke="#475569"
                                                fontSize={9} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{
                                                background: '#0f172a',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: 10, fontSize: '0.75rem'
                                            }} />
                                            <Area type="monotone" dataKey="risk"
                                                stroke="#f43f5e" fill="url(#riskGrad)"
                                                strokeWidth={2.5} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="chart-loading">
                                        Loading trajectory from ML API...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {carbonData && (
                        <div className="panel glass-panel carbon-panel">
                            <h3>
                                <Leaf size={14} style={{ color: 'var(--emerald)' }} /> CARBON IMPACT
                            </h3>
                            <div className="carbon-grid">
                                <div className="metric-v2">
                                    <span className="label-v2">CO₂ Saved</span>
                                    <div className="val-v2" style={{ color: 'var(--emerald)' }}>
                                        {carbonData.co2_saved_kg} kg
                                    </div>
                                </div>
                                <div className="metric-v2">
                                    <span className="label-v2">Trees Equivalent</span>
                                    <div className="val-v2" style={{ color: 'var(--cyan)' }}>
                                        {carbonData.trees_equivalent} 🌳/yr
                                    </div>
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
                                <MaintenanceAction
                                    id={1} title="Loading from ML API..."
                                    desc="Standby" urgent />
                            )}
                        </div>

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
    )
}

export default AssetDetail