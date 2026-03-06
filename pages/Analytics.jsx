import React from 'react';
import {
    TrendingDown,
    DollarSign,
    Calendar,
    ShieldAlert,
    BarChart,
    PieChart as PieChartIcon,
    ArrowUpRight,
    Info
} from 'lucide-react';
import {
    BarChart as ReBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';
import './Analytics.css';

const costData = [
    { month: 'Jan', inaction: 45000, proactive: 12000 },
    { month: 'Feb', inaction: 52000, proactive: 14000 },
    { month: 'Mar', inaction: 110000, proactive: 15000 },
    { month: 'Apr', inaction: 65000, proactive: 18000 },
    { month: 'May', inaction: 48000, proactive: 12000 },
];

const pieData = [
    { name: 'Operational Failure', value: 45 },
    { name: 'Emergency Repairs', value: 30 },
    { name: 'Legal/Compliance', value: 15 },
    { name: 'Service Disruption', value: 10 },
];

const COLORS = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981'];

const ROIStat = ({ label, value, trend, sub }) => (
    <div className="roi-stat glass-panel">
        <div className="roi-header">
            <span className="roi-label">{label}</span>
            <Info size={14} className="text-muted" />
        </div>
        <div className="roi-value-row">
            <div className="roi-value">{value}</div>
            {trend && <div className="roi-trend negative"><TrendingDown size={14} /> {trend}</div>}
        </div>
        <div className="roi-sub">{sub}</div>
    </div>
);

const Analytics = () => {
    return (
        <div className="analytics-container">
            <div className="analytics-header">
                <h1 className="text-gradient-cyan">Cost-of-Inaction (COI) Analytics</h1>
                <div className="header-meta">
                    <Calendar size={18} /> Last 6 Months Report
                </div>
            </div>

            <div className="analytics-top-grid">
                <ROIStat
                    label="Estimated COI (Monthly)"
                    value="$244,500"
                    trend="+18%"
                    sub="Projected loss due to deferred maintenance"
                />
                <ROIStat
                    label="Proactive Maint. ROI"
                    value="4.2x"
                    sub="Return for every $1 spent on early detection"
                />
                <ROIStat
                    label="Risk Mitigation Score"
                    value="68/100"
                    sub="System-wide resilience index"
                />
            </div>

            <div className="analytics-main-grid">
                {/* Cost Comparison Chart */}
                <div className="comparison-section glass-panel">
                    <div className="section-header">
                        <h3>Cumulative Costs: Inaction vs. Proactive</h3>
                        <BarChart size={20} className="text-cyan" />
                    </div>
                    <div className="chart-large">
                        <ResponsiveContainer width="100%" height="100%">
                            <ReBarChart data={costData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                                <YAxis stroke="#64748b" fontSize={12} />
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                                <Legend verticalAlign="top" height={36} />
                                <Bar dataKey="inaction" name="Cost of Inaction" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="proactive" name="Proactive Cost" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                            </ReBarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* COI Breakdown */}
                <div className="breakdown-section glass-panel">
                    <div className="section-header">
                        <h3>COI Impact Distribution</h3>
                        <PieChartIcon size={20} className="text-amber" />
                    </div>
                    <div className="chart-sq">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Strategy Recommendations */}
            <div className="strategy-section glass-panel">
                <h3>System Recommendations</h3>
                <div className="recommendations-list">
                    <div className="rec-item">
                        <ShieldAlert size={20} className="text-rose" />
                        <div className="rec-body">
                            <div className="rec-title">Immediate Repair: Canal-Gate-7</div>
                            <div className="rec-desc">Postponing this repair further will increase restoration costs by 300% within 14 days.</div>
                        </div>
                        <button className="accent-btn">Approve Work</button>
                    </div>
                    <div className="rec-item">
                        <ArrowUpRight size={20} className="text-cyan" />
                        <div className="rec-body">
                            <div className="rec-title">Upgrade Sensor Mesh - Sector B</div>
                            <div className="rec-desc">Implementation would reduce predictive maintenance error margin by 12%.</div>
                        </div>
                        <button className="accent-btn">View ROI Case</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
