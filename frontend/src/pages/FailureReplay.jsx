import { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts'
import {
  Play, Pause, ChevronsLeft, ChevronsRight,
  SkipBack, SkipForward, Activity, ScrollText
} from 'lucide-react'
import { getAssets, getRiskScores } from '../api/client'

// ── helpers ──────────────────────────────────────────────────────────────────
const getRiskColor = s => s >= 80 ? '#ef4444' : s >= 60 ? '#f97316' : s >= 40 ? '#eab308' : '#22c55e'
const getRiskLevel = s => s >= 80 ? 'CRITICAL' : s >= 60 ? 'HIGH' : s >= 40 ? 'MEDIUM' : 'LOW'

// Map MongoDB asset_type → sensor config key
const TYPE_MAP = { bridge: 'BRIDGE', pipeline: 'PIPE', road: 'ROAD', transformer: 'TRANSFORMER', hospital: 'HOSPITAL' }
const normalizeType = (assetType) => TYPE_MAP[assetType] || TYPE_MAP[assetType?.toLowerCase()] || 'BRIDGE'

// ── Asset-type sensor definitions ────────────────────────────────────────────
const SENSOR_DEFS = {
  BRIDGE: {
    sensors: ['vibration_hz', 'deflection_mm', 'stress_load_kn', 'wind_speed_kmh', 'crack_width_mm', 'acoustic_emission_db'],
    labels: ['Vibration', 'Deflection', 'Stress Load', 'Wind Speed', 'Crack Width', 'Acoustic'],
    units: ['Hz', 'mm', 'kN', 'km/h', 'mm', 'dB'],
    colors: ['#6366f1', '#f97316', '#ef4444', '#06b6d4', '#a855f7', '#22c55e'],
    baselines: { vibration_hz: 55, deflection_mm: 12.5, stress_load_kn: 520, wind_speed_kmh: 18, crack_width_mm: 0.3, acoustic_emission_db: 44 },
    degradeStart: { vibration_hz: 1.8, deflection_mm: 0.5, stress_load_kn: 8, wind_speed_kmh: 0, crack_width_mm: 0.02, acoustic_emission_db: 2.2 },
    crisisStart: { vibration_hz: 0, deflection_mm: 0, stress_load_kn: 0, wind_speed_kmh: 0, crack_width_mm: 0.04, acoustic_emission_db: 2.2 },
  },
  PIPE: {
    sensors: ['flow_rate_lps', 'pressure_bar', 'temperature_c', 'corrosion_mm', 'moisture_pct', 'ph_level'],
    labels: ['Flow Rate', 'Pressure', 'Temperature', 'Corrosion', 'Moisture', 'pH Level'],
    units: ['L/s', 'bar', '°C', 'mm', '%', 'pH'],
    colors: ['#6366f1', '#f97316', '#ef4444', '#06b6d4', '#a855f7', '#22c55e'],
    baselines: { flow_rate_lps: 85, pressure_bar: 12.0, temperature_c: 26, corrosion_mm: 1.2, moisture_pct: 35, ph_level: 7.2 },
    degradeStart: { flow_rate_lps: -1.2, pressure_bar: 0.3, temperature_c: 1.1, corrosion_mm: 0.08, moisture_pct: 0.6, ph_level: -0.05 },
    crisisStart: { flow_rate_lps: 0, pressure_bar: 0.5, temperature_c: 0, corrosion_mm: 0.12, moisture_pct: 0, ph_level: -0.08 },
  },
  ROAD: {
    sensors: ['surface_temp_c', 'rutting_depth_mm', 'traffic_load_kn', 'moisture_pct', 'roughness_iri', 'deflection_mm'],
    labels: ['Surface Temp', 'Rutting', 'Traffic Load', 'Moisture', 'Roughness', 'Deflection'],
    units: ['°C', 'mm', 'kN', '%', 'IRI', 'mm'],
    colors: ['#6366f1', '#f97316', '#ef4444', '#06b6d4', '#a855f7', '#22c55e'],
    baselines: { surface_temp_c: 38, rutting_depth_mm: 6.5, traffic_load_kn: 450, moisture_pct: 25, roughness_iri: 2.8, deflection_mm: 0.45 },
    degradeStart: { surface_temp_c: 0.8, rutting_depth_mm: 0.3, traffic_load_kn: 5, moisture_pct: 0.4, roughness_iri: 0.15, deflection_mm: 0.02 },
    crisisStart: { surface_temp_c: 0, rutting_depth_mm: 0.5, traffic_load_kn: 0, moisture_pct: 0, roughness_iri: 0.25, deflection_mm: 0.03 },
  },
  TRANSFORMER: {
    sensors: ['oil_temp_c', 'winding_temp_c', 'load_pct', 'dissolved_gas_ppm', 'vibration_hz', 'humidity_pct'],
    labels: ['Oil Temp', 'Winding Temp', 'Load', 'DGA', 'Vibration', 'Humidity'],
    units: ['°C', '°C', '%', 'ppm', 'Hz', '%'],
    colors: ['#6366f1', '#f97316', '#ef4444', '#06b6d4', '#a855f7', '#22c55e'],
    baselines: { oil_temp_c: 62, winding_temp_c: 78, load_pct: 72, dissolved_gas_ppm: 120, vibration_hz: 52, humidity_pct: 35 },
    degradeStart: { oil_temp_c: 1.5, winding_temp_c: 1.8, load_pct: 0.8, dissolved_gas_ppm: 5, vibration_hz: 1.2, humidity_pct: 0.4 },
    crisisStart: { oil_temp_c: 2.0, winding_temp_c: 2.5, load_pct: 0, dissolved_gas_ppm: 8, vibration_hz: 0, humidity_pct: 0 },
  },
  HOSPITAL: {
    sensors: ['power_supply_v', 'backup_generator_fuel_pct', 'oxygen_pressure_bar', 'hvac_air_quality_aqi', 'structural_vibration_hz', 'water_supply_pressure_bar'],
    labels: ['Power Supply', 'Backup Fuel', 'Oxygen Pressure', 'Air Quality', 'Vibration', 'Water Pressure'],
    units: ['V', '%', 'bar', 'AQI', 'Hz', 'bar'],
    colors: ['#6366f1', '#f97316', '#ef4444', '#06b6d4', '#a855f7', '#22c55e'],
    baselines: { power_supply_v: 230, backup_generator_fuel_pct: 90, oxygen_pressure_bar: 4.5, hvac_air_quality_aqi: 30, structural_vibration_hz: 15, water_supply_pressure_bar: 3.0 },
    degradeStart: { power_supply_v: -2, backup_generator_fuel_pct: -1.5, oxygen_pressure_bar: -0.1, hvac_air_quality_aqi: 2, structural_vibration_hz: 0.5, water_supply_pressure_bar: -0.05 },
    crisisStart: { power_supply_v: -5, backup_generator_fuel_pct: -3, oxygen_pressure_bar: -0.3, hvac_air_quality_aqi: 10, structural_vibration_hz: 1.5, water_supply_pressure_bar: -0.2 },
  },
}

// ── mock data per asset category ─────────────────────────────────────────────
const generateFrames = (assetCategory) => {
  const def = SENSOR_DEFS[assetCategory]
  return Array.from({ length: 72 }, (_, i) => {
    const d = i > 45, c = i > 60
    const frame = { frame: i, hour_label: `H-${71 - i}`, timestamp: new Date(Date.now() - (71 - i) * 3600000).toISOString() }

    def.sensors.forEach((key, idx) => {
      const base = def.baselines[key]
      const degradeRate = def.degradeStart[key]
      const crisisRate = def.crisisStart[key]
      const noise = base * 0.04 // 4% noise
      frame[key] = parseFloat((
        base +
        (d ? (i - 45) * degradeRate : 0) +
        (c ? (i - 60) * crisisRate : 0) +
        (Math.random() * noise * 2 - noise)
      ).toFixed(2))
    })

    frame.risk_score = parseFloat(Math.min(96, 20 + (i > 35 ? (i - 35) * 1.1 : 0) + Math.random() * 3).toFixed(1))
    frame.is_anomaly = i >= 58
    frame.alert_fired = i === 61
    frame.is_failure_event = i === 71
    return frame
  })
}

// Normalize frames for chart display
const normalizeFrames = (frames, assetCategory) => {
  const def = SENSOR_DEFS[assetCategory]
  return frames.map(f => {
    const normalized = { frame: f.frame }
    def.sensors.forEach((key, idx) => {
      const base = def.baselines[key]
      const range = base * 1.5 // normalization range
      normalized[def.labels[idx]] = Math.max(0, Math.min(100, ((f[key] - base * 0.5) / range) * 100))
    })
    return normalized
  })
}

const EVENT_LOG = [
  { frame: 0, severity: 'normal', icon: '🟢', message: 'Normal operation — all sensors within baseline' },
  { frame: 18, severity: 'normal', icon: '📊', message: 'Routine monitoring — no anomalies detected' },
  { frame: 35, severity: 'warning', icon: '📈', message: 'Gradual upward drift detected in primary sensors' },
  { frame: 45, severity: 'warning', icon: '⚠️', message: 'Multi-sensor degradation trend identified' },
  { frame: 52, severity: 'warning', icon: '🔍', message: 'Correlated anomaly — multiple sensors rising' },
  { frame: 58, severity: 'critical', icon: '🚨', message: 'Anomaly threshold crossed — reconstruction error: 0.87' },
  { frame: 61, severity: 'alert', icon: '📱', message: 'ALERT FIRED — Risk: 76.8 — SMS dispatched to engineer' },
  { frame: 65, severity: 'critical', icon: '🔴', message: 'Risk elevated to CRITICAL — score: 84.2' },
  { frame: 68, severity: 'critical', icon: '⚡', message: 'Primary stress indicators exceeding safe threshold' },
  { frame: 71, severity: 'failure', icon: '❌', message: 'FAILURE EVENT — Maximum degradation reached' },
]

const SEV_COLORS = {
  normal: { border: '#22c55e', bg: 'rgba(34,197,94,0.05)', text: '#86efac' },
  warning: { border: '#eab308', bg: 'rgba(234,179,8,0.05)', text: '#fde047' },
  alert: { border: '#ef4444', bg: 'rgba(239,68,68,0.10)', text: '#fca5a5' },
  critical: { border: '#f97316', bg: 'rgba(249,115,22,0.05)', text: '#fdba74' },
  failure: { border: '#ef4444', bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
}

// Asset IDs will be fetched from MongoDB
const FALLBACK_ASSET_IDS = ['BRIDGE_001']

// ── inline style tokens ───────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: '#020817', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter, sans-serif', color: '#f1f5f9' },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' },
  cardSm: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  col: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { color: '#64748b', fontSize: '12px' },
  h1: { fontSize: '24px', fontWeight: '700', color: '#f1f5f9', margin: 0 },
  h2: { fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 },
  muted: { color: '#94a3b8', fontSize: '13px' },
  pill: (bg, color, border) => ({ background: bg, color, border: `1px solid ${border}`, borderRadius: '999px', padding: '2px 12px', fontSize: '11px', fontWeight: '600', display: 'inline-block' }),
  btn: { background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' },
  btnPrimary: { background: '#4f46e5', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' },
  chip: { background: '#1e293b', borderRadius: '8px', padding: '8px', textAlign: 'center' },
}

// ── gauge component ───────────────────────────────────────────────────────────
const RiskGauge = ({ score }) => {
  const color = getRiskColor(score)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg viewBox="0 0 220 130" style={{ width: '100%', maxWidth: '220px', overflow: 'visible' }}>
          <filter id={`glow-replay`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <path d="M 30 110 A 80 80 0 0 1 190 110"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="14"
            strokeLinecap="round" />
          <path d="M 30 110 A 80 80 0 0 1 190 110"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - (score || 0)}
            filter={`url(#glow-replay)`}
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', top: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '38px', fontWeight: '800', color: color, lineHeight: '1', textShadow: `0 0 15px ${color}50` }}>
            {score.toFixed(1)}
          </span>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '700', letterSpacing: '0.5px', marginTop: '4px' }}>
            Risk Score
          </span>
        </div>
      </div>
      <span style={{ background: color + '15', color, border: `1px solid ${color}30`, borderRadius: '999px', padding: '4px 14px', fontSize: '11px', fontWeight: '700', marginTop: '12px' }}>
        {getRiskLevel(score)}
      </span>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function FailureReplay() {
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [asset, setAsset] = useState('')
  const [assetList, setAssetList] = useState([])
  const intervalRef = useRef(null)
  const logRef = useRef(null)

  useEffect(() => {
    Promise.all([getAssets(), getRiskScores()])
      .then(([assetsData, scoresData]) => {
        const list = Array.isArray(assetsData) ? assetsData : []
        const scores = Array.isArray(scoresData) ? scoresData : []
        const scoreMap = {}
        scores.forEach(s => { scoreMap[s.asset_id] = s.risk_score || 0 })

        const criticalList = list.filter(a => (scoreMap[a.asset_id] || 0) >= 80)
        setAssetList(criticalList)
        if (criticalList.length > 0 && !asset) setAsset(criticalList[0].asset_id)
      })
      .catch(err => console.error('Failed to fetch assets/scores:', err))
  }, [])

  const currentAssetDoc = assetList.find(a => a.asset_id === asset)
  const assetCategory = normalizeType(currentAssetDoc?.asset_type || 'bridge')
  const sensorDef = SENSOR_DEFS[assetCategory]
  const FRAMES = useRef(generateFrames(assetCategory))

  // Regenerate frames when asset changes
  useEffect(() => {
    const doc = assetList.find(a => a.asset_id === asset)
    const cat = normalizeType(doc?.asset_type || 'bridge')
    FRAMES.current = generateFrames(cat)
  }, [asset, assetList])

  const normalizedData = normalizeFrames(FRAMES.current, assetCategory)
  const frame = FRAMES.current[currentFrame]

  // Build sensor color map dynamically
  const sensorColors = {}
  sensorDef.labels.forEach((label, i) => { sensorColors[label] = sensorDef.colors[i] })

  const reset = () => { setIsPlaying(false); setCurrentFrame(0) }
  const seek = f => setCurrentFrame(Math.max(0, Math.min(71, f)))

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame(p => { if (p >= 71) { setIsPlaying(false); return 71 } return p + 1 })
      }, 1000 / speed)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, speed])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [currentFrame])

  const statusInfo = () => {
    if (currentFrame < 58) return { label: '🟢 Normal Operation', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' }
    if (currentFrame < 61) return { label: '⚠️ Anomaly Detected', color: '#eab308', bg: 'rgba(234,179,8,0.1)' }
    if (currentFrame === 61) return { label: '🚨 ALERT FIRED', color: '#ef4444', bg: 'rgba(239,68,68,0.2)' }
    if (currentFrame < 71) return { label: '🔴 Critical Degradation', color: '#f97316', bg: 'rgba(249,115,22,0.1)' }
    return { label: '❌ FAILURE EVENT', color: '#ef4444', bg: 'rgba(239,68,68,0.2)' }
  }

  const st = statusInfo()
  const progressPct = (currentFrame / 71) * 100
  const visibleEvents = EVENT_LOG.filter(e => e.frame <= currentFrame)

  // Build sensor chips dynamically from the current asset's sensors
  const sensorChips = sensorDef.sensors.map((key, i) => ({
    label: sensorDef.labels[i],
    value: frame?.[key],
    unit: sensorDef.units[i],
    color: sensorDef.colors[i],
  }))

  return (
    <div style={S.page}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={S.label}>InfraWatch / Replay</p>
          <h1 style={{ ...S.h1, display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <Play size={22} color="#818cf8" />
            Failure Event Replay
          </h1>
          <p style={{ ...S.muted, marginTop: '4px' }}>Historical black box — replay how a failure built up over 72 hours</p>
        </div>
        <select value={asset} onChange={e => { setAsset(e.target.value); reset() }}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer' }}>
          {assetList.length === 0 ? <option value="">No Critical Assets...</option> : assetList.map(a => <option key={a.asset_id} value={a.asset_id}>{a.asset_id} ({a.city || a.asset_type})</option>)}
        </select>
      </div>

      {/* HERO CARD */}
      <div style={{ ...S.card, background: 'linear-gradient(135deg,#0f172a 0%,#1a0a2e 50%,#0a1628 100%)', borderTop: '3px solid #6366f1' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <span style={S.pill('rgba(6,182,212,0.1)', '#22d3ee', 'rgba(6,182,212,0.3)')}>⚡ EARLY WARNING SYSTEM</span>
            <div style={{ fontSize: '52px', fontWeight: '900', color: '#f97316', margin: '12px 0 8px', lineHeight: 1 }}>
              2.6 Hours Early
            </div>
            <p style={S.muted}>System detected infrastructure failure before it occurred</p>
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={S.pill('rgba(99,102,241,0.1)', '#818cf8', 'rgba(99,102,241,0.3)')}>
                {assetCategory} Sensors
              </span>
              {sensorDef.labels.slice(0, 3).map(l => (
                <span key={l} style={{ color: '#64748b', fontSize: '10px', background: '#1e293b', borderRadius: '4px', padding: '2px 6px' }}>{l}</span>
              ))}
              <span style={{ color: '#475569', fontSize: '10px' }}>+{sensorDef.labels.length - 3} more</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '10px', padding: '16px 20px', textAlign: 'center', minWidth: '130px' }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>🔔</div>
              <div style={S.label}>Alert Triggered</div>
              <div style={{ color: '#f97316', fontSize: '20px', fontWeight: '700' }}>11:45 AM</div>
              <div style={S.label}>Jan 15, 2024</div>
            </div>
            <div style={{ color: '#475569', fontSize: '24px', fontWeight: '700' }}>→</div>
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '16px 20px', textAlign: 'center', minWidth: '130px' }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>❌</div>
              <div style={S.label}>Failure Occurred</div>
              <div style={{ color: '#ef4444', fontSize: '20px', fontWeight: '700' }}>2:23 PM</div>
              <div style={S.label}>Jan 15, 2024</div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTROLS CARD */}
      <div style={S.cardSm}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={15} color="#818cf8" />
            <span style={{ color: '#e2e8f0', fontWeight: '500', fontSize: '14px' }}>{asset}</span>
            <span style={S.label}>• 72 frames • 72 hours • {sensorDef.sensors.length} sensors</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button style={S.btn} onClick={reset}><ChevronsLeft size={13} />Reset</button>
            <button style={S.btn} onClick={() => seek(currentFrame - 10)}><SkipBack size={13} />-10</button>
            <button style={S.btnPrimary} onClick={() => setIsPlaying(p => !p)}>
              {isPlaying ? <><Pause size={14} />Pause</> : <><Play size={14} />Play</>}
            </button>
            <button style={S.btn} onClick={() => seek(currentFrame + 10)}><SkipForward size={13} />+10</button>
            <button style={S.btn} onClick={() => seek(71)}><ChevronsRight size={13} />End</button>
          </div>
          <div style={{ display: 'flex', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '3px', gap: '2px' }}>
            {[0.5, 1, 2, 5].map(s => (
              <button key={s} onClick={() => setSpeed(s)}
                style={{ ...S.btn, border: 'none', padding: '4px 10px', fontSize: '11px', background: speed === s ? '#4f46e5' : 'transparent', color: speed === s ? '#fff' : '#94a3b8', borderRadius: '6px' }}>
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '5px' }}>
            <span>Frame {currentFrame + 1} / 72</span>
            <span style={{ color: '#94a3b8' }}>{frame?.hour_label}</span>
            <span style={{ color: isPlaying ? '#22c55e' : '#475569' }}>{isPlaying ? '● LIVE' : '⏸ PAUSED'}</span>
          </div>
          <div style={{ position: 'relative', height: '10px', background: '#1e293b', borderRadius: '999px', overflow: 'hidden', cursor: 'pointer', border: '1px solid #334155' }}
            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); seek(Math.floor(((e.clientX - r.left) / r.width) * 71)) }}>
            <div style={{ position: 'absolute', top: 0, height: '100%', background: 'rgba(249,115,22,0.2)', left: `${(58 / 71) * 100}%`, width: `${(13 / 71) * 100}%` }} />
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: '999px', transition: 'width 0.3s', width: `${progressPct}%`, background: 'linear-gradient(90deg,#22c55e 0%,#eab308 50%,#f97316 75%,#ef4444 100%)' }} />
            <div style={{ position: 'absolute', top: 0, width: '2px', height: '100%', background: 'rgba(239,68,68,0.5)', left: '99%' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', marginTop: '4px' }}>
            <span>T-72h Start</span>
            <span style={{ color: 'rgba(249,115,22,0.7)' }}>⚠ Anomaly Zone</span>
            <span style={{ color: 'rgba(239,68,68,0.7)' }}>❌ Failure</span>
          </div>
        </div>
      </div>

      {/* SENSOR CHART — dynamic per asset type */}
      <div style={S.card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h2 style={S.h2}>{assetCategory} Sensor Timeline</h2>
            <p style={{ ...S.muted, marginTop: '3px' }}>Normalized readings (0–100%) across 72-hour window — {sensorDef.sensors.length} {assetCategory.toLowerCase()}-specific sensors</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {sensorDef.labels.map((name, i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '14px', height: '2px', borderRadius: '2px', background: sensorDef.colors[i] }} />
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>{name}</span>
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={normalizedData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="frame" stroke="#334155" tick={{ fill: '#475569', fontSize: 10 }} tickFormatter={v => `H${v}`} />
            <YAxis stroke="#334155" tick={{ fill: '#475569', fontSize: 10 }} tickFormatter={v => `${Math.round(v)}%`} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '12px' }}
              formatter={(val, name) => [`${val.toFixed(1)}%`, name]} />
            <ReferenceArea x1={58} x2={71} fill="#f97316" fillOpacity={0.07} />
            <ReferenceLine x={currentFrame} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={2} />
            {sensorDef.labels.map((label, i) => (
              <Line key={label} type="monotone" dataKey={label} stroke={sensorDef.colors[i]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* BOTTOM ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '20px' }}>

        {/* GAUGE CARD */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Activity size={15} color="#818cf8" />
            <h2 style={S.h2}>Live Risk Score</h2>
          </div>
          <RiskGauge score={frame?.risk_score || 0} />
          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <div style={{ ...S.label, marginBottom: '8px' }}>
              {frame ? new Date(frame.timestamp).toLocaleTimeString() : '--'}
            </div>
            <div style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}40`, borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: '500', display: 'inline-block' }}>
              {st.label}
            </div>
          </div>
          {/* Dynamic sensor chips based on asset type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '16px' }}>
            {sensorChips.map(chip => (
              <div key={chip.label} style={S.chip}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '3px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: chip.color }} />
                  <span style={{ color: '#64748b', fontSize: '10px' }}>{chip.label}</span>
                </div>
                <div style={{ color: '#f1f5f9', fontSize: '11px', fontFamily: 'monospace', fontWeight: '700' }}>
                  {chip.value?.toFixed(1)}<span style={{ color: '#475569', fontWeight: '400' }}> {chip.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* EVENT LOG */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ScrollText size={15} color="#818cf8" />
              <h2 style={S.h2}>System Event Log</h2>
            </div>
            {isPlaying && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#22c55e', fontSize: '11px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Live
              </span>
            )}
          </div>
          <div ref={logRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', maxHeight: '320px', paddingRight: '4px' }}>
            {visibleEvents.length === 0
              ? <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Press Play to start the replay...</div>
              : visibleEvents.map((entry, i) => {
                const sc = SEV_COLORS[entry.severity]
                return (
                  <div key={i} style={{ borderLeft: `3px solid ${sc.border}`, background: sc.bg, borderRadius: '0 8px 8px 0', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '14px', lineHeight: 1, marginTop: '1px' }}>{entry.icon}</span>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ color: sc.text, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>{entry.severity}</span>
                            <span style={{ color: '#475569', fontSize: '10px' }}>Frame {entry.frame} • H-{71 - entry.frame}</span>
                          </div>
                          <p style={{ color: '#cbd5e1', fontSize: '12px', margin: 0, lineHeight: '1.4' }}>{entry.message}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            }
          </div>
        </div>
      </div>
    </div>
  )
}