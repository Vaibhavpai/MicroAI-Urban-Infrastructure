import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Gauge,
    BarChart3,
    Box,
    AlertTriangle,
    Activity,
    ChevronLeft,
    ChevronRight,
    Zap,
    FlaskConical,
    PlaySquare,
    Radio,
    ScanLine,
} from 'lucide-react';
import './Layout.css';

const NAV = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, desc: 'Dashboard' },
    { to: '/asset', label: 'Asset Detail', icon: Gauge, desc: 'Deep Analysis' },
    { to: '/digital-twin', label: 'Digital Twin', icon: Box, desc: 'Simulation' },
    { to: '/analytics', label: 'Analytics', icon: BarChart3, desc: 'Cost & ROI' },
    { to: '/incidents', label: 'Incidents', icon: AlertTriangle, desc: 'Response Hub' },
    { to: '/live-stream', label: 'Live Stream', desc: 'Kafka Feed', icon: Radio },
    { to: '/city-comparison', label: 'Cities', icon: Activity, desc: 'Federation' },
    { to: '/scenario-builder', label: 'What-If', icon: FlaskConical, desc: 'Simulate' },
    { to: '/failure-replay', label: 'Replay', icon: PlaySquare, desc: 'Playback' },
    { to: '/bridge-cad', label: 'CAD Viewer', desc: '3D Structural', icon: Box },
    { to: '/road-scan', label: 'RoadScan', desc: 'AI Pavement', icon: ScanLine },
];

export default function Layout() {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();

    return (
        <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
            <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
                {/* Brand */}
                <div className="sidebar-brand">
                    <div className="brand-logo" style={{ padding: 0, background: 'transparent', border: 'none', boxShadow: 'none' }}>
                        <img src="/logo.png" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} alt="InfraWatch Logo" />
                    </div>
                    {!collapsed && (
                        <div className="brand-info">
                            <span className="brand-text">InfraWatch</span>
                            <span className="brand-sub">AI Platform</span>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav">
                    <div className="nav-section-label">{!collapsed && 'NAVIGATION'}</div>
                    {NAV.map(({ to, label, icon: Icon, desc }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            className={({ isActive }) =>
                                `nav-link${isActive ? ' active' : ''}`
                            }
                            title={collapsed ? label : ''}
                        >
                            <div className="nav-icon-wrap">
                                <Icon size={18} />
                            </div>
                            {!collapsed && (
                                <div className="nav-text">
                                    <span className="nav-label">{label}</span>
                                    <span className="nav-desc">{desc}</span>
                                </div>
                            )}
                            {!collapsed && (
                                <div className="nav-indicator" />
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="sidebar-footer">
                    {!collapsed && (
                        <div className="system-status">
                            <div className="status-row">
                                <div className="status-dot-animated" />
                                <span>System Online</span>
                            </div>
                            <div className="env-badge">LIVE • ML Active</div>
                        </div>
                    )}
                    <button
                        className="collapse-btn"
                        onClick={() => setCollapsed(!collapsed)}
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
