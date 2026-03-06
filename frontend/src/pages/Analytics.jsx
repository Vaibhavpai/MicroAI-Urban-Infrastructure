import React, { useState, useEffect, useCallback } from 'react';
import {
    TrendingDown, Calendar, ShieldAlert,
    BarChart, PieChart as PieChartIcon, ArrowUpRight, Info,
    Zap, DollarSign, TrendingUp, Sliders, RefreshCw
} from 'lucide-react';
import {
    BarChart as ReBarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
    AreaChart, Area, LineChart, Line, ComposedChart
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { getAssets, getCost, getCarbon, getRiskScores } from '../api/client';
import './Analytics.css';

const COLORS = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981'];
const DELAY_PRESETS = [7, 15, 30, 60, 90, 180, 365];

const ROIStat = ({ label, value, trend, sub, icon: Icon, color, delay }) => (
    <div className="roi-stat glass-panel" style={{ animationDelay: `${delay}ms` }}>
        <div className="roi-header">
            <span className="roi-label">{label}</span>
            <div className="roi-icon-wrap" style={{ background: `${color}15`, color: color }}>
                {Icon && <Icon size={16} />}
            </div>
        </div>
        <div className="roi-value-row">
            <div className="roi-value">{value}</div>
            {trend && (
                <div className="roi-trend negative">
                    <TrendingDown size={14} /> {trend}
                </div>
            )}
        </div>
        <div className="roi-sub">{sub}</div>
    </div>
);

const Analytics = () => {
    const navigate = useNavigate();
    const [delayDays, setDelayDays] = useState(30);
    const [costChartData, setCostChartData] = useState([]);
    const [pieData, setPieData] = useState([]);
    const [totalCOI, setTotalCOI] = useState(0);
    const [avgROI, setAvgROI] = useState(0);
    const [riskIndex, setRiskIndex] = useState(0);
    const [recommendations, setRecommendations] = useState([]);
    const [costProgressionData, setCostProgressionData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [assets, setAssets] = useState([]);
    const [riskScores, setRiskScores] = useState([]);
    const [coiDelta, setCoiDelta] = useState(null);
    const [prevCOI, setPrevCOI] = useState(null);

    // Fetch assets + risk scores once on mount
    useEffect(() => {
        const fetchBase = async () => {
            try {
                const a = await getAssets();
                setAssets(a);
                try {
                    const rs = await getRiskScores();
                    setRiskScores(rs);
                } catch { }
            } catch (err) {
                console.error("Failed to fetch assets:", err);
            }
        };
        fetchBase();
    }, []);

    // Recalculate costs whenever delayDays or assets change
    const fetchCosts = useCallback(async () => {
        if (assets.length === 0) return;
        setLoading(true);
        try {
            // 1. Fetch cost for each asset at the current delay
            const costs = await Promise.all(assets.map(async (a) => {
                try {
                    const costResult = await getCost(a.asset_id, delayDays);
                    const carbon = await getCarbon(a.asset_id);
                    return { asset: a, cost: costResult, carbon };
                } catch {
                    return null;
                }
            }));

            const validCosts = costs.filter(Boolean);

            // 2. Bar chart: per-asset reactive vs proactive
            const barData = validCosts.map(c => ({
                asset: c.asset.asset_id.replace('_', ' '),
                inaction: c.cost.reactive_cost,
                proactive: c.cost.preventive_cost,
            }));
            setCostChartData(barData);

            // 3. Pie chart: breakdown by asset type
            const assetTypeCounts = {};
            validCosts.forEach(c => {
                const t = c.asset.asset_type;
                assetTypeCounts[t] = (assetTypeCounts[t] || 0) + c.cost.reactive_cost;
            });
            setPieData(Object.entries(assetTypeCounts).map(([name, value]) => ({ name, value: Math.round(value / 1000) })));

            // 4. KPIs
            const sumCOI = validCosts.reduce((s, c) => s + c.cost.reactive_cost, 0);

            // Track delta for trend display
            if (prevCOI !== null && prevCOI > 0 && prevCOI !== sumCOI) {
                const pctChange = ((sumCOI - prevCOI) / prevCOI * 100).toFixed(1);
                if (isFinite(pctChange)) {
                    setCoiDelta(pctChange > 0 ? `+${pctChange}%` : `${pctChange}%`);
                }
            }
            setPrevCOI(sumCOI); // store current for next comparison
            setTotalCOI(sumCOI);

            const avgR = validCosts.reduce((s, c) => s + c.cost.roi_percent, 0) / (validCosts.length || 1);
            setAvgROI(Math.round(avgR * 10) / 10);

            const avgRisk = riskScores.reduce((s, r) => s + r.risk_score, 0) / (riskScores.length || 1);
            setRiskIndex(Math.round(avgRisk));

            // 5. Recommendations from highest-cost assets
            const recs = validCosts
                .sort((a, b) => b.cost.reactive_cost - a.cost.reactive_cost)
                .slice(0, 3)
                .map(c => ({
                    title: `Immediate Repair: ${c.asset.asset_id}`,
                    desc: `At ${delayDays}-day delay: Reactive cost ₹${c.cost.reactive_cost?.toLocaleString()} vs Preventive ₹${c.cost.preventive_cost?.toLocaleString()} — Savings ₹${c.cost.savings?.toLocaleString()} (ROI: ${c.cost.roi_percent}%). CO₂ savings: ${c.carbon?.co2_saved_kg || 0}kg.`,
                    assetId: c.asset.asset_id,
                    reactiveCost: c.cost.reactive_cost,
                    savings: c.cost.savings,
                }));
            setRecommendations(recs);

            // 6. Cost progression chart — fetch at multiple delay points
            const progressionDelays = [7, 15, 30, 60, 90, 180];
            const progressionData = await Promise.all(progressionDelays.map(async (d) => {
                try {
                    const allCosts = await Promise.all(assets.map(a => getCost(a.asset_id, d).catch(() => null)));
                    const valid = allCosts.filter(Boolean);
                    const totalReactive = valid.reduce((s, c) => s + c.reactive_cost, 0);
                    const totalPreventive = valid.reduce((s, c) => s + c.preventive_cost, 0);
                    const totalSavings = totalReactive - totalPreventive;
                    return {
                        delay: `${d}d`,
                        days: d,
                        reactive: Math.round(totalReactive / 1000),
                        preventive: Math.round(totalPreventive / 1000),
                        savings: Math.round(totalSavings / 1000),
                    };
                } catch {
                    return null;
                }
            }));
            setCostProgressionData(progressionData.filter(Boolean));

        } catch (err) {
            console.error("Analytics fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [assets, delayDays, riskScores]);

    useEffect(() => {
        fetchCosts();
    }, [fetchCosts]);

    const formatCurrency = (val) => {
        if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
        if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
        if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
        return `₹${val}`;
    };

    return (
        <div className="analytics-container">
            {/* Page Header */}
            <div className="analytics-header">
                <div>
                    <h1 className="analytics-title">
                        <span className="text-gradient-cyan">Cost-of-Inaction Analytics</span>
                        {loading && <span className="loading-badge"><RefreshCw size={11} className="spin" /> Updating</span>}
                        {!loading && <span className="analytics-badge"><Zap size={11} /> Live ML</span>}
                    </h1>
                    <p className="analytics-subtitle">Dynamic financial & environmental impact — adjustable simulation period</p>
                </div>
                <div className="header-meta">
                    <Calendar size={15} />
                    <span>Real-time from ML Backend</span>
                </div>
            </div>

            {/* Dynamic Delay Control */}
            <div className="delay-control glass-panel">
                <div className="delay-header">
                    <div className="delay-label-row">
                        <Sliders size={16} className="text-cyan" />
                        <div>
                            <h3 className="delay-title">Simulation Period</h3>
                            <p className="delay-desc">Adjust to see how costs escalate with maintenance delay</p>
                        </div>
                    </div>
                    <div className="delay-value-display">
                        <span className="delay-number">{delayDays}</span>
                        <span className="delay-unit">days</span>
                    </div>
                </div>
                <div className="delay-slider-row">
                    <input
                        type="range"
                        min="1"
                        max="365"
                        value={delayDays}
                        onChange={(e) => setDelayDays(parseInt(e.target.value))}
                        className="delay-slider"
                    />
                    <div className="delay-marks">
                        {DELAY_PRESETS.map(d => (
                            <button
                                key={d}
                                className={`delay-preset ${delayDays === d ? 'active' : ''}`}
                                onClick={() => setDelayDays(d)}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* KPI Stats */}
            <div className="analytics-top-grid">
                <ROIStat
                    label={`Estimated COI (${delayDays}-Day)`}
                    value={formatCurrency(totalCOI)}
                    trend={coiDelta || undefined}
                    sub={`Total loss if repairs delayed ${delayDays} days`}
                    icon={DollarSign}
                    color="#f43f5e"
                    delay={0}
                />
                <ROIStat
                    label="Average ROI (Proactive)"
                    value={`${avgROI}%`}
                    sub="Return for every ₹1 spent on early detection"
                    icon={TrendingUp}
                    color="#22d3ee"
                    delay={80}
                />
                <ROIStat
                    label="Risk Mitigation Score"
                    value={`${100 - riskIndex}/100`}
                    sub="System-wide resilience index"
                    icon={ShieldAlert}
                    color="#10b981"
                    delay={160}
                />
            </div>

            {/* Cost Progression Over Time */}
            <div className="cost-progression glass-panel">
                <div className="section-header">
                    <h3>📈 Cost Escalation Over Time (All Assets Combined)</h3>
                    <span className="chart-badge-sm">Dynamic</span>
                </div>
                <div className="progression-chart">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={costProgressionData}>
                            <defs>
                                <linearGradient id="reactiveGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis dataKey="delay" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis
                                stroke="#475569" fontSize={10} tickLine={false} axisLine={false}
                                tickFormatter={(v) => `₹${v}K`}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 10, fontSize: '0.78rem'
                                }}
                                itemStyle={{ color: '#e2e8f0' }}
                                labelStyle={{ color: '#94a3b8' }}
                                formatter={(value) => [`₹${value}K`, undefined]}
                            />
                            <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                            <Area type="monotone" dataKey="reactive" name="Reactive Cost (₹K)" stroke="#f43f5e" fill="url(#reactiveGrad)" strokeWidth={2.5} />
                            <Area type="monotone" dataKey="savings" name="Potential Savings (₹K)" stroke="#22d3ee" fill="url(#savingsGrad)" strokeWidth={2} strokeDasharray="5 3" />
                            <Line type="monotone" dataKey="preventive" name="Preventive Cost (₹K)" stroke="#10b981" strokeWidth={1.5} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <div className="progression-legend">
                    <span className="progression-note">
                        ⚠️ At <strong>{delayDays} days</strong>, reactive cost is <strong>{formatCurrency(totalCOI)}</strong>
                        {costProgressionData.length > 0 && costProgressionData[0] && (
                            <> vs <strong>{formatCurrency(costProgressionData[0].reactive * 1000)}</strong> at 7 days — a <strong>{totalCOI > 0 && costProgressionData[0]?.reactive > 0 ? ((totalCOI / (costProgressionData[0].reactive * 1000) - 1) * 100).toFixed(0) : 0}% increase</strong></>
                        )}
                    </span>
                </div>
            </div>

            {/* Per-Asset Charts */}
            <div className="analytics-main-grid">
                <div className="comparison-section glass-panel">
                    <div className="section-header">
                        <h3>Cost: Reactive vs. Proactive ({delayDays}-Day Delay)</h3>
                        <BarChart size={18} className="text-cyan" />
                    </div>
                    <div className="chart-large">
                        <ResponsiveContainer width="100%" height="100%">
                            <ReBarChart data={costChartData} barGap={4}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="asset" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis
                                    stroke="#475569" fontSize={11} tickLine={false} axisLine={false}
                                    tickFormatter={(v) => v >= 100000 ? `₹${(v / 100000).toFixed(0)}L` : `₹${(v / 1000).toFixed(0)}K`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 10, fontSize: '0.8rem'
                                    }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                    labelStyle={{ color: '#94a3b8' }}
                                    formatter={(value) => [`₹${value?.toLocaleString()}`, undefined]}
                                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                />
                                <Legend verticalAlign="top" height={36} />
                                <Bar dataKey="inaction" name="Reactive Cost" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="proactive" name="Proactive Cost" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                            </ReBarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="breakdown-section glass-panel">
                    <div className="section-header">
                        <h3>COI by Asset Type (₹K)</h3>
                        <PieChartIcon size={18} className="text-amber" />
                    </div>
                    <div className="chart-sq">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData} cx="50%" cy="50%"
                                    innerRadius={55} outerRadius={78}
                                    paddingAngle={4} dataKey="value"
                                    strokeWidth={0}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 10, fontSize: '0.8rem'
                                    }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                    labelStyle={{ color: '#94a3b8' }}
                                    formatter={(value) => [`₹${value}K`, undefined]}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.72rem', color: '#94a3b8' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Recommendations */}
            <div className="strategy-section glass-panel">
                <h3>🎯 ML-Driven Recommendations (at {delayDays}-day delay)</h3>
                <div className="recommendations-list">
                    {recommendations.map((rec, i) => (
                        <div key={i} className="rec-item">
                            <div className="rec-icon-wrap">
                                {i === 0 ? <ShieldAlert size={18} className="text-rose" /> : <ArrowUpRight size={18} className="text-cyan" />}
                            </div>
                            <div className="rec-body">
                                <div className="rec-title">{rec.title}</div>
                                <div className="rec-desc">{rec.desc}</div>
                                <div className="rec-metrics">
                                    <span className="rec-metric rose">
                                        Reactive: {formatCurrency(rec.reactiveCost)}
                                    </span>
                                    <span className="rec-metric green">
                                        Savings: {formatCurrency(rec.savings)}
                                    </span>
                                </div>
                            </div>
                            <button className="accent-btn" onClick={() => navigate(`/asset/${rec.assetId}`)}>
                                View Asset
                            </button>
                        </div>
                    ))}
                    {recommendations.length === 0 && (
                        <div className="rec-empty">No recommendations yet — data loading from backend...</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Analytics;
