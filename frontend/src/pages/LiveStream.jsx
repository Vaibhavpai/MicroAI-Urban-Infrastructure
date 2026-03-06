import { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell
} from 'recharts'
import { Radio, Zap, Activity, AlertTriangle, CheckCircle, Clock, Database } from 'lucide-react'
import { getAssets } from '../api/client'

const getRiskColor = s => s >= 80 ? '#ef4444' : s >= 60 ? '#f97316' : s >= 40 ? '#eab308' : '#22c55e'
const getRiskLevel = s => s >= 80 ? 'CRITICAL' : s >= 60 ? 'HIGH' : s >= 40 ? 'MEDIUM' : 'LOW'

// ── Asset-type-specific sensor definitions ────────────────────────────────
const SENSOR_DEFS = {
  bridge: {
    sensors: ['vibration_hz', 'deflection_mm', 'stress_load_kn', 'wind_speed_kmh', 'crack_width_mm', 'acoustic_emission_db'],
    labels: ['Vibration Hz', 'Deflection mm', 'Stress kN', 'Wind km/h', 'Crack mm', 'Acoustic dB'],
    shortLabels: ['Vib Hz', 'Defl mm', 'Stress kN', 'Wind', 'Crack', 'Acoustic'],
    baselines: { vibration_hz: 55, deflection_mm: 12.5, stress_load_kn: 520, wind_speed_kmh: 18, crack_width_mm: 0.3, acoustic_emission_db: 44 },
    noise: { vibration_hz: 5, deflection_mm: 1.5, stress_load_kn: 50, wind_speed_kmh: 4, crack_width_mm: 0.05, acoustic_emission_db: 4 },
    degradeSensors: ['vibration_hz', 'crack_width_mm', 'deflection_mm'],
  },
  pipeline: {
    sensors: ['flow_rate_lps', 'pressure_bar', 'temperature_c', 'corrosion_mm', 'moisture_pct', 'ph_level'],
    labels: ['Flow L/s', 'Pressure bar', 'Temp °C', 'Corrosion mm', 'Moisture %', 'pH Level'],
    shortLabels: ['Flow', 'Pressure', 'Temp', 'Corrosion', 'Moisture', 'pH'],
    baselines: { flow_rate_lps: 85, pressure_bar: 12.0, temperature_c: 26, corrosion_mm: 1.2, moisture_pct: 35, ph_level: 7.2 },
    noise: { flow_rate_lps: 8, pressure_bar: 1.0, temperature_c: 3, corrosion_mm: 0.1, moisture_pct: 5, ph_level: 0.3 },
    degradeSensors: ['corrosion_mm', 'pressure_bar'],
  },
  road: {
    sensors: ['surface_temp_c', 'rutting_depth_mm', 'traffic_load_kn', 'moisture_pct', 'roughness_iri', 'deflection_mm'],
    labels: ['Surface °C', 'Rutting mm', 'Traffic kN', 'Moisture %', 'IRI', 'Deflection mm'],
    shortLabels: ['Surf °C', 'Rut mm', 'Traffic', 'Moisture', 'IRI', 'Defl'],
    baselines: { surface_temp_c: 38, rutting_depth_mm: 6.5, traffic_load_kn: 450, moisture_pct: 25, roughness_iri: 2.8, deflection_mm: 0.45 },
    noise: { surface_temp_c: 3, rutting_depth_mm: 0.8, traffic_load_kn: 40, moisture_pct: 5, roughness_iri: 0.3, deflection_mm: 0.05 },
    degradeSensors: ['rutting_depth_mm', 'roughness_iri'],
  },
  transformer: {
    sensors: ['oil_temp_c', 'winding_temp_c', 'load_pct', 'dissolved_gas_ppm', 'vibration_hz', 'humidity_pct'],
    labels: ['Oil °C', 'Winding °C', 'Load %', 'DGA ppm', 'Vibration Hz', 'Humidity %'],
    shortLabels: ['Oil °C', 'Wind °C', 'Load %', 'DGA', 'Vib Hz', 'Humid %'],
    baselines: { oil_temp_c: 62, winding_temp_c: 78, load_pct: 72, dissolved_gas_ppm: 120, vibration_hz: 52, humidity_pct: 35 },
    noise: { oil_temp_c: 4, winding_temp_c: 5, load_pct: 6, dissolved_gas_ppm: 15, vibration_hz: 5, humidity_pct: 4 },
    degradeSensors: ['oil_temp_c', 'winding_temp_c', 'dissolved_gas_ppm'],
  },
}

const degradeFactors = {}
let globalMsgCount = 0
let degradingAssetIds = new Set()

const generateReading = (assetDoc) => {
  globalMsgCount++
  const assetId = assetDoc.asset_id
  const assetType = assetDoc.asset_type
  const def = SENSOR_DEFS[assetType] || SENSOR_DEFS.bridge

  if (!degradeFactors[assetId]) degradeFactors[assetId] = 1.0

  const isDegrading = degradingAssetIds.has(assetId)
  if (isDegrading) {
    degradeFactors[assetId] = Math.min(2.0, degradeFactors[assetId] + 0.006)
  }
  const df = degradeFactors[assetId]

  const reading = {
    id: `${assetId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    asset_id: assetId,
    asset_type: assetType,
    city: assetDoc.city || 'Unknown',
    timestamp: new Date().toISOString(),
    partition: globalMsgCount % 3,
    offset: globalMsgCount,
  }

  let riskInputSum = 0
  def.sensors.forEach(key => {
    const base = def.baselines[key] || 0
    const noise = def.noise[key] || 1
    const factor = def.degradeSensors.includes(key) ? df : 1.0
    const val = parseFloat((base * factor + (Math.random() * noise * 2 - noise)).toFixed(3))
    reading[key] = val
    const deviation = Math.abs(val - base) / (base || 1)
    riskInputSum += deviation * (100 / def.sensors.length)
  })

  const risk_score = parseFloat(Math.min(99, Math.max(1,
    15 + riskInputSum * 3 + (isDegrading ? (df - 1) * 60 : 0) + Math.random() * 5
  )).toFixed(1))

  reading.risk_score = risk_score
  reading.risk_level = getRiskLevel(risk_score)
  reading.is_anomaly = risk_score > 70
  return reading
}

const PulseDot = ({ color }) => (
  <>
    <style>{`
      @keyframes kpulse {
        0%   { transform: scale(1); opacity: 0.8; }
        70%  { transform: scale(2); opacity: 0; }
        100% { transform: scale(2); opacity: 0; }
      }
    `}</style>
    <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        animation: 'kpulse 1.5s ease-out infinite'
      }} />
    </div>
  </>
)

const TOOLTIP_STYLE = {
  background: '#0f172a', border: '1px solid #334155',
  borderRadius: '8px', fontSize: '11px', color: '#f1f5f9'
}

export default function LiveStream() {
  const [isLive, setIsLive] = useState(true)
  const [messages, setMessages] = useState([])
  const [riskHistory, setRiskHistory] = useState([])
  const [throughput, setThroughput] = useState([])
  const [assetRisks, setAssetRisks] = useState({})
  const [totalMsgs, setTotalMsgs] = useState(0)
  const [anomalyCount, setAnomaly] = useState(0)
  const [latency, setLatency] = useState(12)
  const [flashId, setFlashId] = useState(null)
  const [assets, setAssets] = useState([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const timerRef = useRef(null)
  const feedRef = useRef(null)

  // Fetch assets from MongoDB via API on mount
  useEffect(() => {
    getAssets()
      .then(data => {
        const assetList = Array.isArray(data) ? data : []
        setAssets(assetList)
        // Set top 3 highest criticality as degrading
        const sorted = [...assetList].sort((a, b) => (b.criticality || 0) - (a.criticality || 0))
        degradingAssetIds = new Set(sorted.slice(0, 3).map(a => a.asset_id))
        setLoadingAssets(false)
        console.log(`📦 Loaded ${assetList.length} assets from MongoDB`)
      })
      .catch(err => {
        console.error('Failed to fetch assets:', err)
        setLoadingAssets(false)
      })
  }, [])

  useEffect(() => {
    if (!isLive || assets.length === 0) { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => {
      const count = Math.floor(Math.random() * 3) + 1
      const batch = Array.from({ length: count }, () =>
        generateReading(assets[Math.floor(Math.random() * assets.length)])
      )
      const firstId = batch[0].id
      setFlashId(firstId)
      setTimeout(() => setFlashId(null), 700)

      setMessages(prev => [...batch, ...prev].slice(0, 80))
      setTotalMsgs(prev => prev + count)
      setAnomaly(prev => prev + batch.filter(m => m.is_anomaly).length)
      setLatency(parseFloat((7 + Math.random() * 10).toFixed(1)))

      const avg = batch.reduce((s, m) => s + m.risk_score, 0) / batch.length
      const ts = new Date().toLocaleTimeString('en', { hour12: false })
      setRiskHistory(prev => [...prev, { t: ts, v: parseFloat(avg.toFixed(1)) }].slice(-40))
      setThroughput(prev => [...prev, { t: ts, v: count }].slice(-30))
      setAssetRisks(prev => {
        const next = { ...prev }
        batch.forEach(m => { next[m.asset_id] = m.risk_score })
        return next
      })
    }, 1200)
    return () => clearInterval(timerRef.current)
  }, [isLive, assets])

  const assetBarData = assets.slice(0, 12).map(a => ({
    name: a.asset_id.length > 15 ? a.asset_id.replace(/_/g, ' ').slice(0, 14) + '…' : a.asset_id.replace(/_/g, ' '),
    fullName: a.asset_id,
    risk: parseFloat((assetRisks[a.asset_id] || 20 + Math.random() * 5).toFixed(1)),
  }))

  const topRisks = Object.entries(assetRisks)
    .map(([id, score]) => ({ id, score, type: assets.find(a => a.asset_id === id)?.asset_type || '' }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  const anomalyRate = totalMsgs > 0
    ? ((anomalyCount / totalMsgs) * 100).toFixed(1) : '0.0'

  const getSensorColumnsForMessage = (msg) => {
    const def = SENSOR_DEFS[msg.asset_type] || SENSOR_DEFS.bridge
    return def.sensors.map((key, i) => ({
      key,
      label: def.shortLabels[i],
      value: msg[key],
    }))
  }

  const C = {
    page: {
      minHeight: '100vh', background: '#020817', padding: '24px',
      fontFamily: 'Inter, sans-serif', color: '#f1f5f9',
      display: 'flex', flexDirection: 'column', gap: '20px'
    },
    card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' },
    h2: { fontSize: '14px', fontWeight: '600', color: '#f1f5f9', margin: '0 0 3px' },
    lbl: { color: '#64748b', fontSize: '11px' },
    muted: { color: '#94a3b8', fontSize: '12px', margin: '0 0 12px' },
  }

  if (loadingAssets) {
    return (
      <div style={{ ...C.page, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#818cf8', fontSize: '16px' }}>📦 Loading assets from MongoDB...</div>
      </div>
    )
  }

  return (
    <div style={C.page}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ ...C.lbl, marginBottom: '4px' }}>InfraWatch / Live Stream</p>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Radio size={22} color="#818cf8" />
            Kafka Live Stream
          </h1>
          <p style={C.muted}>
            Real-time sensor pipeline — {assets.length} assets from MongoDB · topic: <span style={{ color: '#818cf8', fontFamily: 'monospace' }}>sensor-readings</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: isLive ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
            border: `1px solid ${isLive ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.2)'}`,
            borderRadius: '999px', padding: '5px 14px'
          }}>
            <PulseDot color={isLive ? '#22c55e' : '#475569'} />
            <span style={{ color: isLive ? '#86efac' : '#94a3b8', fontSize: '11px', fontWeight: '600' }}>
              {isLive ? 'STREAMING' : 'PAUSED'}
            </span>
          </div>
          <button onClick={() => setIsLive(p => !p)}
            style={{
              background: isLive ? '#1e293b' : '#4f46e5',
              border: '1px solid #334155', color: '#f1f5f9', borderRadius: '8px',
              padding: '8px 18px', fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}>
            {isLive ? '⏸ Pause' : '▶ Resume'}
          </button>
        </div>
      </div>

      {/* BROKER STATUS */}
      <div style={{
        ...C.card,
        background: 'linear-gradient(135deg,#0f172a 0%,#0a1628 100%)',
        borderTop: '2px solid #6366f1'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Database size={14} color="#818cf8" />
          <span style={{ color: '#f1f5f9', fontSize: '13px', fontWeight: '600' }}>Kafka Broker</span>
          <span style={{
            background: 'rgba(99,102,241,0.15)', color: '#818cf8',
            border: '1px solid rgba(99,102,241,0.3)', borderRadius: '999px',
            padding: '1px 8px', fontSize: '10px', fontWeight: '600'
          }}>
            localhost:9092
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', color: '#86efac', fontSize: '11px' }}>
            <PulseDot color="#22c55e" /> Connected
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '10px' }}>
          {[
            { label: 'Topic', value: 'sensor-readings', color: '#818cf8', mono: true },
            { label: 'Assets (DB)', value: assets.length, color: '#06b6d4' },
            { label: 'Asset Types', value: [...new Set(assets.map(a => a.asset_type))].length, color: '#22c55e' },
            { label: 'Total Messages', value: totalMsgs.toLocaleString(), color: '#f1f5f9' },
            { label: 'Anomalies', value: anomalyCount, color: '#ef4444' },
            { label: 'Avg Latency', value: `${latency}ms`, color: latency > 15 ? '#f97316' : '#22c55e' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px'
            }}>
              <div style={C.lbl}>{item.label}</div>
              <div style={{
                color: item.color, fontSize: '14px', fontWeight: '700', marginTop: '3px',
                fontFamily: item.mono ? 'monospace' : 'Inter'
              }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '14px' }}>
          <div style={{ ...C.lbl, marginBottom: '6px' }}>Partition Load</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[0, 1, 2].map(p => {
              const load = 25 + Math.floor(Math.random() * 50)
              return (
                <div key={p} style={{ flex: 1, background: '#1e293b', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '10px' }}>Partition {p}</span>
                    <span style={{ color: '#818cf8', fontSize: '10px', fontFamily: 'monospace' }}>{load}%</span>
                  </div>
                  <div style={{ background: '#0f172a', borderRadius: '999px', height: '4px' }}>
                    <div style={{
                      width: `${load}%`, height: '100%',
                      background: 'linear-gradient(90deg,#6366f1,#06b6d4)',
                      borderRadius: '999px'
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* KPI ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
        {[
          { icon: <Zap size={16} color="#818cf8" />, label: 'Msg / sec', value: (1.5 + Math.random()).toFixed(1), color: '#818cf8', sub: 'avg throughput' },
          { icon: <Activity size={16} color="#06b6d4" />, label: 'Active Assets', value: assets.length, color: '#06b6d4', sub: 'from MongoDB' },
          { icon: <AlertTriangle size={16} color="#ef4444" />, label: 'Anomaly Rate', value: `${anomalyRate}%`, color: parseFloat(anomalyRate) > 10 ? '#ef4444' : '#22c55e', sub: `${anomalyCount} anomalies` },
          { icon: <Clock size={16} color="#22c55e" />, label: 'Stream Latency', value: `${latency}ms`, color: latency > 15 ? '#f97316' : '#22c55e', sub: 'end-to-end' },
        ].map(item => (
          <div key={item.label} style={{ ...C.card, display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{
              background: item.color + '15', border: `1px solid ${item.color}30`,
              borderRadius: '8px', padding: '8px', flexShrink: 0
            }}>
              {item.icon}
            </div>
            <div>
              <div style={C.lbl}>{item.label}</div>
              <div style={{ color: item.color, fontSize: '20px', fontWeight: '700', lineHeight: 1, margin: '3px 0 2px' }}>{item.value}</div>
              <div style={{ color: '#475569', fontSize: '10px' }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CHARTS */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px' }}>
        <div style={C.card}>
          <h2 style={C.h2}>Live Risk Score Trend</h2>
          <p style={C.muted}>Rolling average risk across all assets</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={riskHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="t" stroke="#334155" tick={{ fill: '#475569', fontSize: 9 }} />
              <YAxis stroke="#334155" tick={{ fill: '#475569', fontSize: 10 }} domain={[0, 100]} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={v => [`${v}`, 'Avg Risk']} />
              <Area type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={2}
                fill="url(#rg)" dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={C.card}>
          <h2 style={C.h2}>Message Throughput</h2>
          <p style={C.muted}>Messages per interval</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={throughput} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="t" stroke="#334155" tick={{ fill: '#475569', fontSize: 9 }} />
              <YAxis stroke="#334155" tick={{ fill: '#475569', fontSize: 10 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={v => [`${v}`, 'Messages']} />
              <Bar dataKey="v" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ASSET RISK + TOP RISKS */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px' }}>
        <div style={C.card}>
          <h2 style={C.h2}>Per-Asset Live Risk</h2>
          <p style={C.muted}>Current score for each streaming asset</p>
          <ResponsiveContainer width="100%" height={Math.max(220, assetBarData.length * 28)}>
            <BarChart data={assetBarData} layout="vertical"
              margin={{ top: 5, right: 40, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" domain={[0, 100]} stroke="#334155"
                tick={{ fill: '#475569', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" stroke="#334155"
                tick={{ fill: '#94a3b8', fontSize: 9 }} width={110} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v, _, props) => [
                  `${v} — ${getRiskLevel(v)}`,
                  props.payload?.fullName || 'Risk'
                ]} />
              <Bar dataKey="risk" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {assetBarData.map((entry, i) => (
                  <Cell key={i} fill={getRiskColor(entry.risk)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={C.card}>
          <h2 style={C.h2}>Top Risk Assets</h2>
          <p style={C.muted}>Highest risk from stream</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {topRisks.length === 0
              ? <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>Waiting for data...</div>
              : topRisks.map((a, i) => {
                const rc = getRiskColor(a.score)
                return (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    background: '#1e293b', borderRadius: '8px', padding: '10px 12px',
                    borderLeft: `3px solid ${rc}`
                  }}>
                    <div style={{ color: '#475569', fontSize: '11px', fontWeight: '700', minWidth: '14px' }}>#{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: '600' }}>{a.id}</div>
                      <div style={{ color: '#64748b', fontSize: '10px' }}>{a.type}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: rc, fontSize: '16px', fontWeight: '700' }}>{a.score.toFixed(1)}</div>
                      <div style={{
                        background: rc + '20', color: rc, borderRadius: '999px',
                        padding: '0 6px', fontSize: '9px', fontWeight: '700'
                      }}>
                        {getRiskLevel(a.score)}
                      </div>
                    </div>
                  </div>
                )
              })
            }
          </div>
          <div style={{
            marginTop: '16px', background: 'rgba(34,197,94,0.07)',
            border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <CheckCircle size={12} color="#22c55e" />
              <span style={{ color: '#86efac', fontSize: '11px', fontWeight: '600' }}>Pipeline Health</span>
            </div>
            {[
              ['MongoDB Assets', `${assets.length} loaded`],
              ['Kafka Broker', 'Connected'],
              ['Consumer Group', 'Active'],
              ['ML Pipeline', 'Processing'],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b', fontSize: '10px' }}>{lbl}</span>
                <span style={{ color: '#22c55e', fontSize: '10px', fontWeight: '600' }}>● {val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* LIVE FEED */}
      <div style={C.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h2 style={C.h2}>Live Message Feed</h2>
            <p style={{ ...C.muted, marginBottom: 0 }}>
              Real-time Kafka messages · {messages.length} buffered · Asset-specific sensors from MongoDB
            </p>
          </div>
          {isLive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PulseDot color="#6366f1" />
              <span style={{ color: '#818cf8', fontSize: '11px' }}>Live</span>
            </div>
          )}
        </div>

        {/* header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.6fr 1fr 2.4fr 0.5fr 0.5fr 0.7fr',
          gap: '8px', padding: '7px 12px', background: '#1e293b',
          borderRadius: '6px', marginBottom: '6px'
        }}>
          {['Asset', 'City', 'Time', 'Sensors', 'Part', 'Offset', 'Risk'].map(h => (
            <span key={h} style={{
              color: '#475569', fontSize: '10px', fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: '0.04em'
            }}>{h}</span>
          ))}
        </div>

        <div ref={feedRef} style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {messages.length === 0
            ? <div style={{ color: '#475569', textAlign: 'center', padding: '40px', fontSize: '13px' }}>
              {isLive ? 'Connecting to Kafka...' : 'Stream paused.'}
            </div>
            : messages.map((msg, i) => {
              const rc = getRiskColor(msg.risk_score)
              const isNew = i === 0 && msg.id === flashId
              const sensorCols = getSensorColumnsForMessage(msg)
              return (
                <div key={msg.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.6fr 1fr 2.4fr 0.5fr 0.5fr 0.7fr',
                  gap: '8px', alignItems: 'center',
                  padding: '7px 12px', borderRadius: '6px', marginBottom: '2px',
                  background: isNew ? 'rgba(99,102,241,0.1)' : i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                  borderLeft: isNew ? '2px solid #6366f1' : '2px solid transparent',
                  transition: 'background 0.4s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {msg.is_anomaly && (
                      <div style={{
                        width: '5px', height: '5px', borderRadius: '50%',
                        background: '#ef4444', flexShrink: 0
                      }} />
                    )}
                    <span style={{ color: '#e2e8f0', fontSize: '10px', fontWeight: '500' }}>{msg.asset_id}</span>
                  </div>
                  <span style={{ color: '#818cf8', fontSize: '9px' }}>{msg.city}</span>
                  <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'monospace' }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {sensorCols.map(sc => (
                      <span key={sc.key} style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b',
                        borderRadius: '4px', padding: '1px 4px', fontSize: '8px',
                        color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap',
                      }}>
                        <span style={{ color: '#64748b' }}>{sc.label}:</span>{typeof sc.value === 'number' ? sc.value.toFixed(1) : '—'}
                      </span>
                    ))}
                  </div>
                  <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'monospace' }}>P{msg.partition}</span>
                  <span style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace' }}>{msg.offset}</span>
                  <span style={{
                    background: rc + '20', color: rc, borderRadius: '999px',
                    padding: '1px 7px', fontSize: '10px', fontWeight: '700',
                    textAlign: 'center', display: 'inline-block'
                  }}>
                    {msg.risk_score}
                  </span>
                </div>
              )
            })
          }
        </div>
      </div>

    </div>
  )
}