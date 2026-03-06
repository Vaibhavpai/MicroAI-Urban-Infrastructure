import React, { useState, useEffect } from 'react';
import { Search, MapPin, User, History, Activity, Smartphone, MessageCircle, UserCheck, ChevronRight } from 'lucide-react';
import './IncidentManagement.css';

const WORKFLOW_STEPS = ['Reported', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

const IncidentManagement = () => {
    const [alerts, setAlerts] = useState([]);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [activeTab, setActiveTab] = useState('sms');

    useEffect(() => {
        const fetchIncidents = async () => {
            const possibleAnomalies = ['PIPE_034', 'BRIDGE_001'];

            try {
                // Poll the anomaly endpoint to see if any assets generated timestamp alerts
                const apiResults = await Promise.all(possibleAnomalies.map(async (asset) => {
                    const res = await fetch('http://127.0.0.1:8000/predict/anomaly', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ asset_id: asset, sensor_readings: [] })
                    });
                    const data = await res.json();

                    if (data.anomaly_count > 0) {
                        return {
                            id: `AL-${asset}`,
                            priority: data.anomaly_scores[0] > 0.8 ? 'critical' : 'high',
                            title: `Anomaly Registered (${data.anomaly_count} events)`,
                            asset: asset,
                            time: data.anomaly_timestamps[0] || '14:35 UTC',
                            status: 'reported',
                            events: data.anomaly_timestamps
                        };
                    }
                    return null;
                }));

                const finalAlerts = apiResults.filter(r => r !== null);
                setAlerts(finalAlerts);
                if (finalAlerts.length > 0) {
                    setSelectedAlert(finalAlerts[0]);
                }
            } catch (err) {
                console.error("API error fetching incidents", err);
            }
        };

        fetchIncidents();
    }, []);

    const getPriorityColor = (priority) => {
        switch (priority?.toLowerCase()) {
            case 'critical': return '#ef4444';
            case 'high': return '#f59e0b';
            default: return '#64748b';
        }
    };

    return (
        <div className="incident-page">
            <header className="incident-top-bar">
                <div className="title-section">
                    <h1 className="text-gradient-cyan">ML Incident Response Hub</h1>
                    <p className="subtitle">Real-time alert management populated from Backend APIs</p>
                </div>
            </header>

            <div className="incident-grid">
                <div className="alert-list-col glass-card">
                    <div className="alerts-scrollable">
                        {alerts.length === 0 && <div style={{ padding: 20 }}>No incidents detected...</div>}
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
                                    <div className="alert-asset"><MapPin size={12} /> {alert.asset}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="incident-main-col glass-card">
                    <div className="incident-detail-header">
                        {selectedAlert ? (
                            <>
                                <h2>{selectedAlert.title}</h2>
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
                            <h2>Select an Incident</h2>
                        )}
                    </div>
                    {selectedAlert && (
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

                <div className="response-center-col">
                    <div className="comm-panel glass-card">
                        <div className="comm-tabs">
                            <button className={activeTab === 'sms' ? 'active' : ''} onClick={() => setActiveTab('sms')}>
                                <Smartphone size={14} /> Dispatch Crew
                            </button>
                        </div>
                        <div className="comm-body">
                            <textarea placeholder="Type dispatch order..." />
                            <div className="template-row">
                                <button className="tmpl-btn">Acknowledge</button>
                                <button className="tmpl-btn">ETA Update</button>
                            </div>
                            <button className="send-btn"><span>SEND ORDERS</span></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IncidentManagement;
