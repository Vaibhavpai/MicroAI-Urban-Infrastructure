import React, { useState, useEffect } from 'react';
import {
    Activity as ActivityIcon,
    Cpu,
    Droplets,
    Plus,
    Minus,
    Eye,
    Settings,
    ArrowRight
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceArea,
    Label
} from 'recharts';
import './DigitalTwin.css';
import bridgeImg from '../assets/bridge_3d.png';
import crackImg from '../assets/crack_sim.png';

const ViewportToolbar = () => (
    <div className="viewport-toolbar">
        <div className="tool-btn"><Plus size={14} /></div>
        <div className="tool-btn"><Minus size={14} /></div>
        <div className="tool-btn"><Eye size={14} /></div>
        <div className="tool-btn"><Settings size={14} /></div>
    </div>
);

const DigitalTwin = () => {
    const [twinData, setTwinData] = useState(null);
    const [cascadeData, setCascadeData] = useState(null);
    const [trajectoryChartData, setTrajectoryChartData] = useState([]);

    // Fallback data if API is still loading or fails
    const [miniData] = useState(Array.from({ length: 15 }, (_, i) => ({ val: 30 + Math.random() * 40 })));

    useEffect(() => {
        const fetchApiData = async () => {
            try {
                // 1. Fetch Twin Simulation
                const twinResponse = await fetch('http://127.0.0.1:8000/simulate/twin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        asset_id: 'BRIDGE_001',
                        sensor_readings: [],
                        delay_days: 30
                    })
                });
                const twinJson = await twinResponse.json();
                setTwinData(twinJson);

                // Map TWIN trajectory into the existing Recharts shape seamlessly
                if (twinJson.trajectory) {
                    const mappedData = twinJson.trajectory.map(point => ({
                        time: point.day,
                        label: `Day ${point.day}`,
                        temp: 15 + Math.sin(point.day / 6) * 10 + Math.random() * 2, // Mocked background weather
                        wind: 50 + Math.sin(point.day / 12) * 40 + Math.random() * 10,
                        precip: point.day > 10 && point.day < 15 ? 60 + Math.random() * 40 : 5,
                        risk: point.risk_score
                    }));
                    setTrajectoryChartData(mappedData);
                }

                // 2. Fetch Cascade Failure
                const cascadeResponse = await fetch('http://127.0.0.1:8000/predict/cascade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        asset_id: 'BRIDGE_001'
                    })
                });
                const cascadeJson = await cascadeResponse.json();
                setCascadeData(cascadeJson);

            } catch (error) {
                console.error("Failed to fetch API data", error);
            }
        };

        fetchApiData();
    }, []);

    // Standard static fallback if trajectory not yet loaded
    const displayData = trajectoryChartData.length > 0 ? trajectoryChartData : Array.from({ length: 30 }, (_, i) => ({
        time: i, label: `Day ${i}`, temp: 20, wind: 50, precip: 10, risk: 10
    }));

    return (
        <div className="dt-container-v3">
            <main className="dt-grid-v3">
                {/* Panel 1: Bridge Sim */}
                <div className="dt-panel-v3">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                            <h3 className="dt-panel-title">CENTRAL SPAN BRIDGE DT-001</h3>
                            <p className="dt-panel-subtitle">High-resolution of key city bridge (Status: Connected to API)</p>
                        </div>
                        <div style={{ color: '#475569', cursor: 'pointer' }}>...</div>
                    </div>

                    <div className="viewport-3d" style={{ flex: 1, background: '#000', position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
                        <ViewportToolbar />
                        <img src={bridgeImg} alt="Bridge" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        <svg className="sim-lead-lines" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                            <path d="M 380 180 L 460 180 L 460 300" stroke="#f59e0b" strokeWidth="2" fill="none" opacity="0.6" strokeDasharray="4 2" />
                            <path d="M 400 200 L 480 200 L 480 300" stroke="#f59e0b" strokeWidth="2" fill="none" opacity="0.6" />
                        </svg>
                    </div>
                </div>

                {/* Panel 2: Crack Sim */}
                <div className="dt-panel-v3">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                            <h3 className="dt-panel-title">CRACK PROGRESSION SIMULATION</h3>
                            <p className="dt-panel-subtitle">
                                {twinData?.critical_threshold_day
                                    ? `Critical Failure Predicted at Day ${twinData.critical_threshold_day}`
                                    : 'Automated slow-motion animation under increasing loads.'}
                            </p>
                        </div>
                        <div style={{ color: '#475569', cursor: 'pointer' }}>...</div>
                    </div>

                    <div className="viewport-3d" style={{ flex: 1, background: '#000', position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
                        <ViewportToolbar />
                        <img src={crackImg} alt="Crack" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <svg className="sim-lead-lines" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                            <path d="M 100 180 L 40 180 L 40 300" stroke="#22d3ee" strokeWidth="2" fill="none" opacity="0.6" />
                        </svg>
                    </div>

                    <div className="sim-slider-container" style={{ marginTop: 'auto', paddingTop: 15 }}>
                        <div className="track-bg" style={{ height: 4, borderRadius: 2, background: 'linear-gradient(to right, #22d3ee 60%, #ef4444 60%)', position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <div className="slider-thumb" style={{ position: 'absolute', left: '60%', width: 12, height: 12, background: '#fff', border: '2px solid #22d3ee', borderRadius: '50%', transform: 'translateX(-50%)', boxShadow: '0 0 10px #22d3ee' }} />
                        </div>
                        <div className="slider-labels" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.65rem' }}>
                            <span style={{ color: '#64748b' }}>Current State</span>
                            <ArrowRight size={12} style={{ color: '#475569' }} />
                            <span style={{ color: '#ef4444' }}>Simulated State (T+30 Days)</span>
                        </div>
                    </div>
                </div>

                {/* Panel 3: Cascade Failure */}
                <div className="dt-panel-v3">
                    <h3 className="dt-panel-title">
                        CASCADE FAILURE GRAPH
                        {cascadeData && ` (${cascadeData.total_assets_at_risk} Assets at Risk)`}
                    </h3>
                    <div style={{ flex: 1, position: 'relative', marginTop: 10 }}>
                        <svg width="100%" height="100%" viewBox="0 0 500 300">
                            {/* Central Node */}
                            <g transform="translate(250, 150)">
                                <circle r="35" fill="#0f172a" stroke="#f43f5e" strokeWidth="2" />
                                <path d="M -15 5 Q 0 -25 15 5 M -15 10 L 15 10 M -10 5 L -10 15 M 10 5 L 10 15" stroke="#fff" fill="none" strokeWidth="1.5" />
                                <text y="50" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700">Central Bridge</text>
                            </g>

                            {/* Dynamic API Connections */}
                            {cascadeData ? cascadeData.affected_assets.map((asset, i) => {
                                // Simple radial positioning
                                const angle = (i / cascadeData.affected_assets.length) * Math.PI * 2;
                                const radius = 100 + (asset.distance * 20);
                                const x = 250 + Math.cos(angle) * radius;
                                const y = 150 + Math.sin(angle) * radius;
                                // Color based on cascade risk severity
                                const color = asset.cascade_risk > 60 ? '#f43f5e' : (asset.cascade_risk > 40 ? '#f59e0b' : '#bef264');

                                return (
                                    <g key={i}>
                                        <line x1="250" y1="150" x2={x} y2={y} stroke="#334155" strokeWidth="1" strokeDasharray={asset.distance > 1 ? "4 4" : "none"} />
                                        <circle cx={x} cy={y} r="8" fill={color} />
                                        <text x={x + 12} y={y + 4} fill="#e2e8f0" fontSize="9" fontWeight="600">
                                            {asset.asset_id} ({asset.cascade_risk}%)
                                        </text>
                                    </g>
                                )
                            }) : (
                                // Fallback loading nodes
                                [
                                    { x: 50, y: 150, label: 'Loading...', color: '#94a3b8' },
                                    { x: 100, y: 50, label: 'Loading...', color: '#94a3b8' },
                                ].map((node, i) => (
                                    <g key={i}>
                                        <line x1="250" y1="150" x2={node.x} y2={node.y} stroke="#334155" strokeWidth="1" />
                                        <circle cx={node.x} cy={node.y} r="6" fill={node.color} />
                                        <text x={node.x + 10} y={node.y + 4} fill="#e2e8f0" fontSize="9" fontWeight="600">{node.label}</text>
                                    </g>
                                ))
                            )}
                        </svg>
                    </div>
                </div>

                {/* Panel 4: API Simulated Trajectory Correlation */}
                <div className="dt-panel-v3">
                    <div className="weather-chart-header">
                        <h3 className="dt-panel-title">SIMULATED RISK PROGRESSION (T+30 DAYS)</h3>
                        <div className="weather-legend">
                            <span className="legend-item red"><div className="l-line dashed" /> ML API Risk Score</span>
                            <span className="legend-item orange"><div className="l-line" /> Wind</span>
                            <span className="legend-item purple"><div className="l-line" /> Precip</span>
                        </div>
                        <div style={{ color: '#475569', cursor: 'pointer' }}>...</div>
                    </div>

                    <div className="stacked-weather-container">
                        {/* 1. LAYER - WIND / RISK */}
                        <div className="weather-chart-slice">
                            <div className="y-axis-label">Risk Score / Wind</div>
                            <div className="slice-content">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={displayData}>
                                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" />
                                        <YAxis hide domain={[0, 150]} />
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
                                        <Area type="monotone" dataKey="wind" stroke="#f59e0b" fill="none" strokeWidth={2} isAnimationActive={true} />
                                        {/* Dynamic Risk Overlay */}
                                        <Area type="monotone" dataKey="risk" stroke="#f43f5e" strokeDasharray="4 4" fill="none" strokeWidth={3} isAnimationActive={true} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 2. LAYER - PRECIPITATION */}
                        <div className="weather-chart-slice">
                            <div className="y-axis-label">Precipitation</div>
                            <div className="slice-content">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={displayData}>
                                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" />
                                        <YAxis hide domain={[0, 150]} />
                                        <Area type="step" dataKey="precip" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} isAnimationActive={true} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* TIMELINE X-AXIS */}
                        <div className="chart-timeline-row">
                            <span>0 Days</span>
                            <span>7 Days</span>
                            <span>14 Days</span>
                            <span>21 Days</span>
                            <span>30 Days</span>
                        </div>
                    </div>
                </div>

                {/* --- CENTER OVERLAY --- */}
                <div className="dt-overlay-container" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100 }}>
                    <svg width="100%" height="100%">
                        <defs>
                            <marker id="arrow-glow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="context-stroke" />
                            </marker>
                        </defs>
                        <line x1="50%" y1="0" x2="50%" y2="377" stroke="#f59e0b" strokeWidth="2.5" opacity="0.8" markerEnd="url(#arrow-glow)" />
                        <line x1="49%" y1="0" x2="49%" y2="377" stroke="#f43f5e" strokeWidth="2.5" opacity="0.8" markerEnd="url(#arrow-glow)" />
                        <line x1="51%" y1="0" x2="51%" y2="377" stroke="#22d3ee" strokeWidth="2.5" opacity="0.8" markerEnd="url(#arrow-glow)" />

                        <line x1="45%" y1="412" x2="47.5%" y2="412" stroke="#f59e0b" strokeWidth="2.5" markerEnd="url(#arrow-glow)" />
                        <line x1="55%" y1="412" x2="52.5%" y2="412" stroke="#f43f5e" strokeWidth="2.5" markerEnd="url(#arrow-glow)" />
                    </svg>
                    <div className="risk-intel-hub">
                        <div className="risk-intel-text">
                            API Active<br />
                            <span style={{ fontSize: '0.5rem', color: '#22d3ee' }}>Digital Twin Sync</span>
                        </div>
                    </div>
                </div>
            </main>

            <div className="dt-bottom-grid">
                {[
                    { title: 'Traffic Flow', color: '#22d3ee', icon: ActivityIcon },
                    { title: 'Power Grid Load', color: '#10b981', icon: Cpu },
                    { title: 'Water Pressure', color: '#6366f1', icon: Droplets },
                    { title: 'Waste Management', color: '#f43f5e', icon: ActivityIcon },
                ].map((item, i) => (
                    <div key={i} className="dt-mini-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8' }}>{item.title.toUpperCase()}</span>
                            <item.icon size={12} color={item.color} />
                        </div>
                        <div style={{ flex: 1, marginTop: 10 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={miniData}>
                                    <Area type="monotone" dataKey="val" stroke={item.color} fill={item.color} fillOpacity={0.1} strokeWidth={2} />
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
