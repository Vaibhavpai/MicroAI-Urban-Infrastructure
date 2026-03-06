import React, { useState, useEffect } from 'react';
import { Settings, MoreHorizontal } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, ReferenceLine, ReferenceArea, Label } from 'recharts';
import './AssetDetail.css';

const generateDenseData = () => {
    const points = [];
    const stepsPerHour = 4;
    for (let i = 0; i <= 24 * stepsPerHour; i++) {
        const hour = Math.floor(i / stepsPerHour);
        const mins = (i % stepsPerHour) * 15;
        const timeStr = `${hour.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

        // Base values
        let vibration = 30 + Math.random() * 15;
        let load = 40 + Math.random() * 10;
        let temp = 20 + Math.random() * 5;

        // Anomalies
        if (hour >= 7 && hour <= 8) { vibration += 80 * Math.exp(-Math.pow(i - 30, 2) / 10); load += 100 * Math.exp(-Math.pow(i - 30, 2) / 10); }
        if (hour >= 16 && hour <= 17) { vibration += 70 * Math.exp(-Math.pow(i - 66, 2) / 10); load += 140 * Math.exp(-Math.pow(i - 66, 2) / 10); }

        points.push({ time: timeStr, vibration, load, temp });
    }
    return points;
};

const timeSeriesData = generateDenseData();

const bottomChartsData = [
    { time: '14:00', traffic: 45, power: 210, water: 85 },
    { time: '15:00', traffic: 52, power: 235, water: 78 },
    { time: '16:00', traffic: 88, power: 280, water: 92 },
    { time: '17:00', traffic: 65, power: 255, water: 110 }
];

const HealthGauge = ({ value, confidenceLower = 70, confidenceUpper = 76 }) => {
    const valueToAngle = (v) => 180 - (v / 100) * 180;
    const angle = valueToAngle(value || 0);

    const cx = 100; const cy = 110; const radius = 80;
    const needleRadius = radius - 4;
    const rad = (Math.PI / 180) * angle;

    const describeArc = (startAngle, endAngle) => {
        const a1 = (Math.PI / 180) * startAngle;
        const a2 = (Math.PI / 180) * endAngle;
        return ['M', cx + radius * Math.cos(a1), cy + radius * Math.sin(a1), 'A', radius, radius, 0, endAngle - startAngle <= 180 ? '0' : '1', 1, cx + radius * Math.cos(a2), cy + radius * Math.sin(a2)].join(' ');
    };

    return (
        <div className="gauge-container">
            <svg viewBox="0 0 200 120">
                <defs>
                    <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="50%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#f43f5e" />
                    </linearGradient>
                </defs>
                <path d="M20,110 A80,80 0 0,1 180,110" fill="none" stroke="#020617" strokeWidth="18" strokeLinecap="round" />
                <path d="M20,110 A80,80 0 0,1 180,110" fill="none" stroke="url(#gauge-gradient)" strokeWidth="14" strokeLinecap="round" />
                <path d={describeArc(valueToAngle(confidenceUpper), valueToAngle(confidenceLower))} fill="none" stroke="#fbbf24" strokeWidth="18" strokeLinecap="round" strokeOpacity="0.7" />
                <line x1={cx + 25 * Math.cos(rad)} y1={cy - 25 * Math.sin(rad)} x2={cx + needleRadius * Math.cos(rad)} y2={cy - needleRadius * Math.sin(rad)} stroke="#38bdf8" strokeWidth="10" strokeLinecap="round" />
                <circle cx={cx} cy={cy} r="10" fill="#020617" stroke="#38bdf8" strokeWidth="6" />
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

const AssetDetail = () => {
    const [delay, setDelay] = useState(15);
    const [assetData, setAssetData] = useState(null);
    const [shapAuth, setShapAuth] = useState(null);

    useEffect(() => {
        const fetchAssetHealth = async () => {
            try {
                // 1. Fetch live ML Risk
                const riskReq = await fetch('http://127.0.0.1:8000/predict/risk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ asset_id: 'BRIDGE_001', sensor_readings: [] })
                });
                const rData = await riskReq.json();
                setAssetData(rData);

                // 2. Fetch SHAP Analysis
                const shapReq = await fetch('http://127.0.0.1:8000/explain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ asset_id: 'BRIDGE_001', sensor_readings: [] })
                });
                const eData = await shapReq.json();
                setShapAuth(eData);

            } catch (err) {
                console.error("API Connection Error", err);
            }
        };

        fetchAssetHealth();
    }, []);

    const currentRisk = assetData ? Math.round(assetData.risk_score) : 0;
    const isCritical = currentRisk > 75;
    const increasedRisk = Math.round(delay * (isCritical ? 1.2 : 0.6));
    const finalRisk = Math.min(currentRisk + increasedRisk, 100);

    return (
        <div className="asset-detail-v2">
            <div className="unified-header-v5">
                <div className="header-left-group">
                    <div className="title-with-actions">
                        <h1>ASSET DETAIL: {assetData ? assetData.asset_id : "Loading"} (API Driven)</h1>
                        <div className="header-actions-v5">
                            <button className="icon-btn-v2"><Settings size={18} /></button>
                        </div>
                    </div>
                    <div className="subtitle-v2">
                        <span>Status: {assetData?.risk_level || 'Loading'}</span>
                    </div>
                </div>
            </div>

            <div className="main-v2-grid">
                <div className="left-column">
                    <div className={`panel health-overview glass-panel ${isCritical ? 'strong-glow-red' : ''}`}>
                        <h3>ASSET HEALTH OVERVIEW</h3>
                        <div className="health-content">
                            <HealthGauge
                                value={currentRisk}
                                confidenceLower={assetData ? assetData.confidence_lower : 0}
                                confidenceUpper={assetData ? assetData.confidence_upper : 0}
                            />
                            <div className="health-metrics-v2">
                                <div className="metric-v2">
                                    <span className="label-v2">Current Risk Score</span>
                                    <div className="val-v2 urgent">{currentRisk}</div>
                                </div>
                            </div>
                        </div>
                        <div className="health-footer-tags">
                            {shapAuth?.top_factors.map((factor, i) => (
                                <span key={i} className="tag red">SHAP: {factor.description}</span>
                            ))}
                        </div>
                    </div>

                    <div className="panel simulation-panel glass-panel">
                        <h3>WHAT-IF SIMULATION PANEL</h3>
                        <div className="sim-content">
                            <div className="sim-label">"DELAY REPAIR BY..."</div>
                            <input type="range" min="0" max="30" value={delay} onChange={(e) => setDelay(parseInt(e.target.value))} className="sim-slider" />
                            <div className="slider-labels"><span>0 Days</span><span>15 Days</span><span>30 Days</span></div>
                            <div className="sim-impact">
                                <div className="impact-text">Impact of {delay}-day delay:</div>
                                <div className="impact-value">
                                    Risk climbs to <span className="final">{finalRisk} ({finalRisk > 75 ? 'Critical' : 'Caution'})</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="center-column">
                    <div className="panel sensor-trends glass-panel">
                        <div className="panel-header-v2">
                            <h3>MULTI-SENSOR TIME-SERIES DATA</h3>
                        </div>
                        <div className="legend-v2">
                            <span className="l-vibration">Vibration</span>
                            <span className="l-load">Load</span>
                            <span className="l-temp">Temperature</span>
                        </div>

                        <div className="chart-track">
                            <div className="track-label">Vibration / Load</div>
                            <div className="chart-wrapper-v3">
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={timeSeriesData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                        <YAxis width={40} domain={[0, 200]} stroke="#475569" fontSize={9} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                                        <ReferenceArea x1="07:15" x2="08:45" fill="#f59e0b" fillOpacity={0.15} />
                                        <Line type="monotone" dataKey="vibration" stroke="#22d3ee" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="load" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="prediction-embedded-v3">
                            <div className="track-title">PREDICTED FAILURE RANGE</div>
                            <div className="chart-wrapper-v3">
                                <ResponsiveContainer width="100%" height={150}>
                                    <ComposedChart data={timeSeriesData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                        <XAxis dataKey="time" stroke="#475569" fontSize={8} minTickGap={40} axisLine={false} tickLine={false} />
                                        <YAxis width={40} stroke="#475569" fontSize={9} axisLine={false} tickLine={false} />
                                        <Area type="monotone" dataKey="vibration" stroke="none" fill="#f43f5e" fillOpacity={0.3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="right-column">
                    <div className="panel maintenance-sidebar glass-panel">
                        <div className="maintenance-actions">
                            <h4 className="actions-subheader">DYNAMIC ML RECOMMENDATIONS</h4>
                            {shapAuth?.top_factors.map((f, i) => (
                                <MaintenanceAction
                                    key={i}
                                    id={i + 1}
                                    title={`Address ${f.feature.replace('_', ' ')}`}
                                    urgent={f.impact > 0.3}
                                    desc={f.description}
                                />
                            ))}
                            {(!shapAuth || shapAuth.top_factors.length === 0) && (
                                <MaintenanceAction id={1} title="Loading factors from ML API..." desc="Standby" urgent />
                            )}
                        </div>
                        <button className="execute-btn">EXECUTE WORK ORDER</button>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default AssetDetail;
