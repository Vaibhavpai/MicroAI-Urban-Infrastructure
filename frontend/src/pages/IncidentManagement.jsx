import React, { useState, useEffect } from 'react';
import { MapPin, History, Smartphone, Zap, AlertTriangle, ExternalLink, ArrowRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { predictAnomaly, getAlerts as fetchAlerts, triggerAlerts, dispatchOrder } from '../api/client';
import './IncidentManagement.css';

const WORKFLOW_STEPS = ['Reported', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

const ASSET_POSITIONS = {
    BRIDGE_001: [19.064, 72.870],
    PIPE_042: [19.082, 72.890],
    ROAD_012: [19.058, 72.850],
    TRANSFORMER_007: [19.095, 72.865],
};

const IncidentManagement = () => {
    const navigate = useNavigate();
    const [alerts, setAlerts] = useState([]);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [activeTab, setActiveTab] = useState('sms');
    const [triggerResult, setTriggerResult] = useState(null);
    const [isScanning, setIsScanning] = useState(false);

    // Dispatch states
    const [dispatchMsg, setDispatchMsg] = useState("");
    const [isDispatching, setIsDispatching] = useState(false);
    const [dispatchSuccess, setDispatchSuccess] = useState(false);

    useEffect(() => {
        if (selectedAlert) {
            setDispatchMsg(`Acknowledge alert for ${selectedAlert.asset}. Investigating immediately.`);
        } else {
            setDispatchMsg("");
        }
    }, [selectedAlert]);

    const handleDispatch = async () => {
        if (!dispatchMsg.trim() || !selectedAlert) return;
        setIsDispatching(true);
        try {
            // Send the request to our FastAPI backend, which handles hitting n8n webhook
            const res = await dispatchOrder(selectedAlert.asset, dispatchMsg);
            if (res && res.success) {
                setDispatchSuccess(true);
                setDispatchMsg("");
                setTimeout(() => setDispatchSuccess(false), 3000);
            } else {
                alert("Backend sent the dispatch, but n8n returned a failure status. Check n8n logs.");
            }
        } catch (err) {
            console.error("Dispatch failed", err);
            alert("Failed to send order. Check backend status or network.");
        } finally {
            setIsDispatching(false);
        }
    };

    useEffect(() => {
        const fetchIncidents = async () => {
            try {
                const dbAlerts = await fetchAlerts();
                const formattedDbAlerts = dbAlerts.map(a => ({
                    id: a.alert_id,
                    priority: a.severity === 'CRITICAL' ? 'critical' : a.severity === 'HIGH' ? 'high' : 'medium',
                    title: a.top_reason || `Alert for ${a.asset_id}`,
                    asset: a.asset_id,
                    time: a.timestamp ? new Date(a.timestamp).toLocaleTimeString([], { hour12: false }) : '--:--',
                    status: 'reported',
                    risk_score: a.risk_score,
                    sms_sent: a.sms_sent,
                    events: [],
                }));

                const anomalyAssets = ['BRIDGE_001', 'PIPE_042', 'ROAD_012', 'TRANSFORMER_007'];
                const anomalyResults = await Promise.all(anomalyAssets.map(async (aid) => {
                    try {
                        const data = await predictAnomaly(aid);
                        if (data.anomaly_count > 0) {
                            return {
                                id: `ANOM-${aid}`,
                                priority: data.anomaly_scores?.[0] > 0.8 ? 'critical' : 'high',
                                title: `Anomaly Registered (${data.anomaly_count} events)`,
                                asset: aid,
                                time: data.anomaly_timestamps?.[0] || 'Recent',
                                status: 'reported',
                                events: data.anomaly_timestamps || [],
                            };
                        }
                        return null;
                    } catch { return null; }
                }));

                const anomalyAlerts = anomalyResults.filter(Boolean);
                const allAlerts = [...formattedDbAlerts.slice(0, 10), ...anomalyAlerts];
                setAlerts(allAlerts);
                if (allAlerts.length > 0) setSelectedAlert(allAlerts[0]);
            } catch (err) {
                console.error("API error fetching incidents", err);
            }
        };

        fetchIncidents();
    }, []);

    const handleTrigger = async () => {
        setIsScanning(true);
        try {
            const result = await triggerAlerts();
            setTriggerResult(result);
        } catch (err) {
            console.error("Trigger failed", err);
        } finally {
            setIsScanning(false);
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority?.toLowerCase()) {
            case 'critical': return '#ef4444';
            case 'high': return '#f59e0b';
            default: return '#64748b';
        }
    };

    const selectedAssetPos = selectedAlert ? (ASSET_POSITIONS[selectedAlert.asset] || [19.076, 72.877]) : [19.076, 72.877];

    return (
        <div className="incident-page">
            {/* Header */}
            <header className="incident-top-bar">
                <div className="title-section">
                    <h1 className="incident-title">
                        <span className="text-gradient-cyan">ML Incident Response Hub</span>
                        <span className="incident-badge"><AlertTriangle size={11} /> {alerts.length} Active</span>
                    </h1>
                    <p className="subtitle">Real-time alert management from Backend APIs & anomaly detection</p>
                </div>
                <button className={`scan-btn ${isScanning ? 'scanning' : ''}`} onClick={handleTrigger}>
                    <RefreshCw size={14} className={isScanning ? 'spin' : ''} />
                    {isScanning ? 'Scanning...' : 'Trigger Alert Scan'}
                </button>
            </header>

            {triggerResult && (
                <div className="trigger-result">
                    ✅ Triggered {triggerResult.triggered} alerts
                    {triggerResult.skipped_cooldown?.length > 0 && ` | ${triggerResult.skipped_cooldown.length} skipped (cooldown)`}
                </div>
            )}

            <div className="incident-grid">
                {/* Column 1: Alert List */}
                <div className="alert-list-col glass-card">
                    <div className="list-header">
                        <span className="list-count">{alerts.length} incidents</span>
                    </div>
                    <div className="alerts-scrollable">
                        {alerts.length === 0 && <div className="no-incidents">No incidents detected from API...</div>}
                        {alerts.map(alert => (
                            <div
                                key={alert.id}
                                className={`alert-card ${selectedAlert?.id === alert.id ? 'active' : ''}`}
                                onClick={() => setSelectedAlert(alert)}
                            >
                                <div className="priority-stripe" style={{ backgroundColor: getPriorityColor(alert.priority) }} />
                                <div className="alert-card-body">
                                    <div className="alert-meta">
                                        <span className="alert-id">{alert.id}</span>
                                        <span className="alert-time">{alert.time}</span>
                                    </div>
                                    <h4 className="alert-title">{alert.title}</h4>
                                    <div className="alert-asset">
                                        <MapPin size={12} /> {alert.asset}
                                        <button className="asset-link-btn" onClick={(e) => { e.stopPropagation(); navigate(`/asset/${alert.asset}`); }}>
                                            <ExternalLink size={10} />
                                        </button>
                                    </div>
                                    {alert.risk_score !== undefined && (
                                        <div className="alert-risk" style={{ color: alert.risk_score > 75 ? '#f43f5e' : '#f59e0b' }}>
                                            Risk: {alert.risk_score}/100
                                            {alert.sms_sent && <span className="sms-badge">SMS ✓</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 2: Incident Detail + Map */}
                <div className="incident-main-col glass-card">
                    <div className="incident-detail-header">
                        {selectedAlert ? (
                            <>
                                <div className="detail-top-row">
                                    <h2>{selectedAlert.title}</h2>
                                    <button className="view-asset-btn" onClick={() => navigate(`/asset/${selectedAlert.asset}`)}>
                                        View Asset <ArrowRight size={14} />
                                    </button>
                                </div>
                                <p className="incident-id-tag">Asset: {selectedAlert.asset}</p>
                                <div className="workflow-stepper">
                                    {WORKFLOW_STEPS.map((step, idx) => (
                                        <React.Fragment key={step}>
                                            <div className={`step ${idx <= 1 ? 'active' : ''}`}>
                                                <div className="step-point" />
                                                <span className="step-label">{step}</span>
                                            </div>
                                            {idx < WORKFLOW_STEPS.length - 1 && <div className="step-line" />}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <h2 className="select-prompt">Select an Incident</h2>
                        )}
                    </div>

                    {/* Satellite Map of Selected Asset */}
                    {selectedAlert && (
                        <div className="incident-map-section">
                            <MapContainer center={selectedAssetPos} zoom={16} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }} key={selectedAlert.id}>
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
                                <CircleMarker center={selectedAssetPos} radius={14}
                                    pathOptions={{
                                        color: '#fff',
                                        fillColor: getPriorityColor(selectedAlert.priority),
                                        fillOpacity: 0.9,
                                        weight: 3
                                    }}
                                >
                                    <Popup>
                                        <div style={{ fontFamily: 'Inter, sans-serif' }}>
                                            <strong style={{ color: '#f1f5f9' }}>{selectedAlert.asset}</strong><br />
                                            <span style={{ color: getPriorityColor(selectedAlert.priority), fontWeight: 700 }}>
                                                {selectedAlert.title}
                                            </span>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            </MapContainer>
                        </div>
                    )}

                    {/* Event Log */}
                    {selectedAlert && selectedAlert.events?.length > 0 && (
                        <div className="incident-body-content">
                            <div className="content-section">
                                <h3 className="section-title"><History size={16} /> API Anomaly Event Log</h3>
                                <div className="vertical-timeline">
                                    {selectedAlert.events.map((ts, idx) => (
                                        <div key={idx} className="timeline-event">
                                            <div className="timeline-axis">
                                                <div className="event-dot" />
                                                <div className="event-line" />
                                            </div>
                                            <div className="event-card">
                                                <div className="event-header">
                                                    <span className="event-label">Sub-Optimal Reading Detected</span>
                                                    <span className="event-time">{ts}</span>
                                                </div>
                                                <p className="event-detail">LSTM Autoencoder exceeded set thresholds</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Column 3: Response Center */}
                <div className="response-center-col">
                    <div className="comm-panel glass-card">
                        <div className="comm-tabs">
                            <button className={activeTab === 'sms' ? 'active' : ''} onClick={() => setActiveTab('sms')}>
                                <Smartphone size={14} /> Dispatch Crew
                            </button>
                        </div>
                        <div className="comm-body">
                            <textarea
                                placeholder="Type dispatch order..."
                                value={dispatchMsg}
                                onChange={(e) => setDispatchMsg(e.target.value)}
                            />
                            <div className="template-row">
                                <button
                                    className="tmpl-btn"
                                    onClick={() => setDispatchMsg(`Acknowledge alert for ${selectedAlert?.asset || 'asset'}. Please investigate immediately.`)}>
                                    Acknowledge
                                </button>
                                <button
                                    className="tmpl-btn"
                                    onClick={() => setDispatchMsg(`Provide ETA update for team deployment to ${selectedAlert?.asset || 'asset'}.`)}>
                                    ETA Update
                                </button>
                            </div>
                            <button
                                className={`send-btn ${dispatchSuccess ? 'success' : ''}`}
                                onClick={handleDispatch}
                                disabled={isDispatching || !dispatchMsg.trim()}
                                style={{ backgroundColor: dispatchSuccess ? '#10b981' : undefined, cursor: (isDispatching || !dispatchMsg.trim()) ? 'not-allowed' : 'pointer', opacity: (isDispatching || !dispatchMsg.trim()) ? 0.6 : 1 }}
                            >
                                <span>{isDispatching ? 'SENDING...' : dispatchSuccess ? '✓ ORDERS SENT' : 'SEND ORDERS'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div className="quick-links glass-card">
                        <h4 className="quick-links-title">Quick Navigation</h4>
                        <button className="quick-link-btn" onClick={() => navigate('/')}>
                            📊 Overview Dashboard
                        </button>
                        <button className="quick-link-btn" onClick={() => navigate('/analytics')}>
                            💰 Cost Analytics
                        </button>
                        <button className="quick-link-btn" onClick={() => navigate('/digital-twin')}>
                            🔮 Digital Twin
                        </button>
                        {selectedAlert && (
                            <button className="quick-link-btn highlight" onClick={() => navigate(`/asset/${selectedAlert.asset}`)}>
                                🎯 View {selectedAlert.asset} Details
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IncidentManagement;
