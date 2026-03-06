import { useState, useEffect, useRef } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip
} from 'recharts'
import { FlaskConical, RotateCcw, Zap, TrendingUp, TrendingDown, Minus, Download } from 'lucide-react'
import { getAssets, getWhatifSummary } from '../api/client'

// ── helpers ───────────────────────────────────────────────────────────────────
const getRiskColor = s => s >= 80 ? '#ef4444' : s >= 60 ? '#f97316' : s >= 40 ? '#eab308' : '#22c55e'
const getRiskLevel = s => s >= 80 ? 'CRITICAL' : s >= 60 ? 'HIGH' : s >= 40 ? 'MEDIUM' : 'LOW'


// Map MongoDB asset_type → sensor config key
const TYPE_MAP = { bridge: 'BRIDGE', pipeline: 'PIPE', road: 'ROAD', transformer: 'TRANSFORMER', hospital: 'HOSPITAL' }
const normalizeType = (assetType) => TYPE_MAP[assetType] || TYPE_MAP[assetType?.toLowerCase()] || 'BRIDGE'

// ── Asset-type-specific sensor configs ────────────────────────────────────────
const SENSOR_CONFIGS_BY_TYPE = {
  BRIDGE: [
    { key: 'vibration_hz', label: 'Vibration', unit: 'Hz', min: 0, max: 150, step: 0.1, color: '#6366f1' },
    { key: 'deflection_mm', label: 'Deflection', unit: 'mm', min: 0, max: 50, step: 0.1, color: '#f97316' },
    { key: 'stress_load_kn', label: 'Stress Load', unit: 'kN', min: 0, max: 2000, step: 1, color: '#ef4444' },
    { key: 'wind_speed_kmh', label: 'Wind Speed', unit: 'km/h', min: 0, max: 120, step: 0.1, color: '#06b6d4' },
    { key: 'crack_width_mm', label: 'Crack Width', unit: 'mm', min: 0, max: 5, step: 0.01, color: '#a855f7' },
    { key: 'acoustic_emission_db', label: 'Acoustic', unit: 'dB', min: 0, max: 120, step: 0.1, color: '#22c55e' },
  ],
  PIPE: [
    { key: 'flow_rate_lps', label: 'Flow Rate', unit: 'L/s', min: 0, max: 200, step: 0.1, color: '#6366f1' },
    { key: 'pressure_bar', label: 'Pressure', unit: 'bar', min: 0, max: 25, step: 0.1, color: '#f97316' },
    { key: 'temperature_c', label: 'Temperature', unit: '°C', min: -10, max: 80, step: 0.1, color: '#ef4444' },
    { key: 'corrosion_mm', label: 'Corrosion', unit: 'mm', min: 0, max: 10, step: 0.01, color: '#06b6d4' },
    { key: 'moisture_pct', label: 'Moisture', unit: '%', min: 0, max: 100, step: 0.1, color: '#a855f7' },
    { key: 'ph_level', label: 'pH Level', unit: 'pH', min: 0, max: 14, step: 0.01, color: '#22c55e' },
  ],
  ROAD: [
    { key: 'surface_temp_c', label: 'Surface Temp', unit: '°C', min: -10, max: 80, step: 0.1, color: '#6366f1' },
    { key: 'rutting_depth_mm', label: 'Rutting', unit: 'mm', min: 0, max: 30, step: 0.1, color: '#f97316' },
    { key: 'traffic_load_kn', label: 'Traffic Load', unit: 'kN', min: 0, max: 2000, step: 1, color: '#ef4444' },
    { key: 'moisture_pct', label: 'Moisture', unit: '%', min: 0, max: 100, step: 0.1, color: '#06b6d4' },
    { key: 'roughness_iri', label: 'Roughness', unit: 'IRI', min: 0, max: 12, step: 0.1, color: '#a855f7' },
    { key: 'deflection_mm', label: 'Deflection', unit: 'mm', min: 0, max: 5, step: 0.01, color: '#22c55e' },
  ],
  TRANSFORMER: [
    { key: 'oil_temp_c', label: 'Oil Temp', unit: '°C', min: 0, max: 120, step: 0.1, color: '#6366f1' },
    { key: 'winding_temp_c', label: 'Winding Temp', unit: '°C', min: 0, max: 150, step: 0.1, color: '#f97316' },
    { key: 'load_pct', label: 'Load', unit: '%', min: 0, max: 120, step: 0.1, color: '#ef4444' },
    { key: 'dissolved_gas_ppm', label: 'DGA', unit: 'ppm', min: 0, max: 500, step: 1, color: '#06b6d4' },
    { key: 'vibration_hz', label: 'Vibration', unit: 'Hz', min: 0, max: 150, step: 0.1, color: '#a855f7' },
    { key: 'humidity_pct', label: 'Humidity', unit: '%', min: 0, max: 100, step: 0.1, color: '#22c55e' },
  ],
  HOSPITAL: [
    { key: 'power_supply_v', label: 'Power Supply', unit: 'V', min: 0, max: 250, step: 1, color: '#6366f1' },
    { key: 'backup_generator_fuel_pct', label: 'Backup Fuel', unit: '%', min: 0, max: 100, step: 1, color: '#f97316' },
    { key: 'oxygen_pressure_bar', label: 'Oxygen Pressure', unit: 'bar', min: 0, max: 10, step: 0.1, color: '#ef4444' },
    { key: 'hvac_air_quality_aqi', label: 'Air Quality', unit: 'AQI', min: 0, max: 300, step: 1, color: '#06b6d4' },
    { key: 'structural_vibration_hz', label: 'Vibration', unit: 'Hz', min: 0, max: 100, step: 0.1, color: '#a855f7' },
    { key: 'water_supply_pressure_bar', label: 'Water Pressure', unit: 'bar', min: 0, max: 10, step: 0.1, color: '#22c55e' },
  ],
}

const BASELINES = {
  BRIDGE_001: { vibration_hz: 52.3, deflection_mm: 12.5, stress_load_kn: 810, wind_speed_kmh: 18.0, crack_width_mm: 0.30, acoustic_emission_db: 39.2 },
  BRIDGE_002: { vibration_hz: 48.7, deflection_mm: 10.2, stress_load_kn: 760, wind_speed_kmh: 15.0, crack_width_mm: 0.20, acoustic_emission_db: 38.1 },
  PIPE_042: { flow_rate_lps: 85.0, pressure_bar: 12.3, temperature_c: 35.4, corrosion_mm: 1.20, moisture_pct: 44.1, ph_level: 7.20 },
  PIPE_043: { flow_rate_lps: 78.0, pressure_bar: 11.8, temperature_c: 33.1, corrosion_mm: 0.90, moisture_pct: 41.8, ph_level: 7.00 },
  ROAD_012: { surface_temp_c: 38.0, rutting_depth_mm: 6.5, traffic_load_kn: 950, moisture_pct: 18.7, roughness_iri: 2.80, deflection_mm: 0.45 },
  ROAD_013: { surface_temp_c: 35.0, rutting_depth_mm: 5.2, traffic_load_kn: 880, moisture_pct: 16.3, roughness_iri: 2.30, deflection_mm: 0.38 },
  TRANSFORMER_007: { oil_temp_c: 62.0, winding_temp_c: 78.0, load_pct: 72.0, dissolved_gas_ppm: 120, vibration_hz: 18.3, humidity_pct: 35.0 },
  TRANSFORMER_008: { oil_temp_c: 65.0, winding_temp_c: 82.0, load_pct: 78.0, dissolved_gas_ppm: 145, vibration_hz: 21.7, humidity_pct: 38.0 },
  HOSPITAL_001: { power_supply_v: 230, backup_generator_fuel_pct: 90.0, oxygen_pressure_bar: 4.5, hvac_air_quality_aqi: 30, structural_vibration_hz: 15.0, water_supply_pressure_bar: 3.0 },
}

// Compute mock risk from sensor values (generic: uses normalized deviation from baseline)
const computeRisk = (vals, sensorConfigs) => {
  let totalContribution = 0
  sensorConfigs.forEach(cfg => {
    const normalizedVal = (vals[cfg.key] - cfg.min) / (cfg.max - cfg.min)
    totalContribution += normalizedVal * (100 / sensorConfigs.length)
  })
  return Math.min(99, Math.max(1, totalContribution))
}

const computeTopFactors = (base, modified, sensorConfigs) => {
  return sensorConfigs.map(cfg => {
    const bv = base[cfg.key], mv = modified[cfg.key]
    const impact = Math.abs(mv - bv) / (cfg.max - cfg.min)
    const direction = mv > bv ? 'increasing' : mv < bv ? 'decreasing' : 'stable'
    return {
      feature: cfg.key, label: cfg.label, unit: cfg.unit,
      impact, direction, baseVal: bv, modVal: mv, color: cfg.color
    }
  }).sort((a, b) => b.impact - a.impact).slice(0, 3)
}

// ── Gauge ─────────────────────────────────────────────────────────────────────
const RiskGauge = ({ score, label }) => {
  const color = getRiskColor(score)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>{label}</div>
      <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg viewBox="0 0 200 110" style={{ width: '100%', maxWidth: '200px', overflow: 'visible' }}>
          <filter id={`glow-${label.replace(/\s+/g, '-')}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <path d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="14"
            strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - (score || 0)}
            filter={`url(#glow-${label.replace(/\s+/g, '-')})`}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', top: '45px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '32px', fontWeight: '800', color: color, lineHeight: '1', textShadow: `0 0 15px ${color}50` }}>
            {score.toFixed(1)}
          </span>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '700', letterSpacing: '1px', marginTop: '4px' }}>
            / 100
          </span>
        </div>
      </div>
      <span style={{ background: color + '15', color, border: `1px solid ${color}30`, borderRadius: '999px', padding: '3px 12px', fontSize: '10px', fontWeight: '700', marginTop: '10px' }}>
        {getRiskLevel(score)}
      </span>
    </div>
  )
}

// ── SHAPBar ───────────────────────────────────────────────────────────────────
const SHAPBar = ({ factors, title }) => (
  <div style={{ flex: 1 }}>
    <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>{title}</div>
    {factors.map((f, i) => (
      <div key={i} style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: f.color }} />
            <span style={{ color: '#e2e8f0', fontSize: '12px' }}>{f.label}</span>
            <span style={{ color: f.direction === 'increasing' ? '#ef4444' : f.direction === 'decreasing' ? '#22c55e' : '#64748b', fontSize: '10px' }}>
              {f.direction === 'increasing' ? '↑' : f.direction === 'decreasing' ? '↓' : '→'}
            </span>
          </div>
          <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'monospace' }}>{(f.impact * 100).toFixed(1)}%</span>
        </div>
        <div style={{ background: '#1e293b', borderRadius: '999px', height: '5px', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: f.color, width: `${Math.min(f.impact * 500, 100)}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>
    ))}
  </div>
)

// ── main ──────────────────────────────────────────────────────────────────────
export default function ScenarioBuilder() {
  const [asset, setAsset] = useState('')
  const [assetList, setAssetList] = useState([])

  // Fetch assets from MongoDB on mount
  useEffect(() => {
    getAssets()
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setAssetList(list)
        if (list.length > 0 && !asset) setAsset(list[0].asset_id)
      })
      .catch(err => console.error('Failed to fetch assets:', err))
  }, [])

  const currentAssetDoc = assetList.find(a => a.asset_id === asset)
  const assetCategory = normalizeType(currentAssetDoc?.asset_type || 'bridge')
  const sensorConfigs = SENSOR_CONFIGS_BY_TYPE[assetCategory] || SENSOR_CONFIGS_BY_TYPE.BRIDGE
  const baseline = BASELINES[asset] || Object.values(BASELINES)[0] || {}
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [summaryMsg, setSummaryMsg] = useState(null)
  const debounceRef = useRef(null)

  // reset when asset changes
  useEffect(() => {
    const bl = BASELINES[asset] || {}
    // For assets not in hardcoded BASELINES, generate defaults from sensor configs
    const defaultVals = {}
    sensorConfigs.forEach(cfg => {
      defaultVals[cfg.key] = bl[cfg.key] ?? ((cfg.max - cfg.min) * 0.4 + cfg.min)
    })
    setValues(defaultVals)
  }, [asset])

  const baseRisk = computeRisk(baseline, sensorConfigs)
  const modRisk = computeRisk(values, sensorConfigs)
  const delta = modRisk - baseRisk
  const levelChanged = getRiskLevel(baseRisk) !== getRiskLevel(modRisk)
  const baseFactors = computeTopFactors(baseline, baseline, sensorConfigs)
  const modFactors = computeTopFactors(baseline, values, sensorConfigs)

  const mostImpactful = modFactors.find(f => f.impact > 0.005)

  const radarData = sensorConfigs.map(cfg => ({
    sensor: cfg.label,
    Baseline: ((baseline[cfg.key] - cfg.min) / (cfg.max - cfg.min)) * 100,
    Scenario: ((values[cfg.key] - cfg.min) / (cfg.max - cfg.min)) * 100,
  }))

  const handleSlider = (key, val) => {
    setValues(prev => ({ ...prev, [key]: parseFloat(val) }))
  }

  const handleDownload = async () => {
    setDownloading(true)
    setSummaryMsg(null)
    try {
      const summaryResult = await getWhatifSummary({
        asset_id: asset,
        asset_category: assetCategory,
        base_risk_score: baseRisk,
        mod_risk_score: modRisk,
        delta_score: delta,
        baseline_values: baseline,
        scenario_values: values,
        most_impactful_change: mostImpactful ? {
          feature: mostImpactful.label,
          impact: mostImpactful.impact,
          original_value: mostImpactful.baseVal,
          modified_value: mostImpactful.modVal
        } : null
      });

      const report = `What-If Scenario Risk Report
==============================
Asset ID: ${asset}
Category: ${assetCategory}

Risk Assessment
---------------
Baseline Risk: ${baseRisk.toFixed(1)} / 100 (${getRiskLevel(baseRisk)})
Scenario Risk: ${modRisk.toFixed(1)} / 100 (${getRiskLevel(modRisk)})
Risk Points Change: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}

Sensor Changes (Baseline -> Scenario)
--------------------------------------
${sensorConfigs.map(cfg => {
        const isChanged = Math.abs(values[cfg.key] - baseline[cfg.key]) > 0.05
        if (!isChanged) return ``
        return `${cfg.label}: ${baseline[cfg.key].toFixed(1)} ${cfg.unit} -> ${values[cfg.key].toFixed(1)} ${cfg.unit}`
      }).filter(l => l).join('\n')}

AI Scenario Summary (Powered by Gemini 2.5 Flash)
-------------------------------------------------
${summaryResult.summary || 'Summary unavailable.'}

Generated on: ${new Date().toLocaleString()}
`;

      const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Scenario_Report_${asset}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setSummaryMsg("Downloaded successfully!")
    } catch (err) {
      console.error(err)
      setSummaryMsg("Failed to generate summary.")
    } finally {
      setDownloading(false)
      setTimeout(() => setSummaryMsg(null), 3500)
    }
  }

  // style tokens
  const page = { minHeight: '100vh', background: '#020817', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter, sans-serif', color: '#f1f5f9' }
  const card = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' }
  const cardSm = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }
  const label = { color: '#64748b', fontSize: '11px' }
  const h2 = { fontSize: '15px', fontWeight: '600', color: '#f1f5f9', margin: '0 0 4px' }
  const muted = { color: '#94a3b8', fontSize: '12px', margin: 0 }

  return (
    <div style={page}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ ...label, marginBottom: '4px' }}>InfraWatch / What-If</p>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f1f5f9', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FlaskConical size={22} color="#818cf8" />
            What-If Scenario Builder
          </h1>
          <p style={muted}>Simulate sensor changes and observe real-time impact on predicted risk</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={label}>Asset</span>
            <select value={asset} onChange={e => setAsset(e.target.value)}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer', minWidth: '220px' }}>
              {assetList.map(a => <option key={a.asset_id} value={a.asset_id}>{a.asset_id} ({a.city || a.asset_type})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ ...label, fontSize: '10px', color: '#818cf8', textAlign: 'left' }}>
              {assetCategory} • {sensorConfigs.length} sensors
            </span>
            <button onClick={handleDownload} disabled={downloading}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', border: 'none', color: '#fff', borderRadius: '6px', padding: '4px 12px', fontSize: '11px', cursor: downloading ? 'wait' : 'pointer', fontWeight: 'bold' }}>
              <Download size={12} />
              {downloading ? 'Processing AI...' : 'Download & Summary'}
            </button>
          </div>
          {summaryMsg && <span style={{ fontSize: '10px', color: summaryMsg.includes('Failed') ? '#ef4444' : '#22c55e', alignSelf: 'flex-end', fontWeight: '600' }}>{summaryMsg}</span>}
        </div>
      </div>

      {/* MAIN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '20px', alignItems: 'start' }}>

        {/* LEFT — SLIDERS (dynamic per asset type) */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '16px' }}>🎛</span>
            <h2 style={h2}>Adjust {assetCategory} Sensors</h2>
          </div>
          <p style={{ ...muted, marginBottom: '20px' }}>Move sliders to explore best and worst-case scenarios for {assetCategory.toLowerCase()} infrastructure.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {sensorConfigs.map(cfg => {
              const isModified = Math.abs(values[cfg.key] - baseline[cfg.key]) > 0.05
              return (
                <div key={cfg.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.color }} />
                      <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: '500' }}>{cfg.label}</span>
                    </div>
                    <span style={{ color: isModified ? cfg.color : '#94a3b8', fontSize: '13px', fontWeight: '600', fontFamily: 'monospace', background: isModified ? cfg.color + '15' : 'transparent', padding: '1px 8px', borderRadius: '4px', border: isModified ? `1px solid ${cfg.color}30` : '1px solid transparent' }}>
                      {values[cfg.key]?.toFixed(cfg.step < 1 ? 1 : 0)}{cfg.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={cfg.min} max={cfg.max} step={cfg.step}
                    value={values[cfg.key] ?? cfg.min}
                    onChange={e => handleSlider(cfg.key, e.target.value)}
                    style={{ width: '100%', accentColor: cfg.color, cursor: 'pointer', height: '4px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span style={{ ...label, fontSize: '10px' }}>{cfg.min} {cfg.unit}</span>
                    <span style={{ ...label, fontSize: '10px' }}>{cfg.max} {cfg.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
            <button onClick={() => setValues({ ...baseline })}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}>
              <RotateCcw size={13} />Reset to Baseline
            </button>
          </div>
        </div>

        {/* RIGHT — RESULTS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* DUAL GAUGES */}
          <div style={card}>
            <h2 style={{ ...h2, marginBottom: '16px' }}>Risk Impact Analysis</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: '12px' }}>
              <RiskGauge score={baseRisk} label="Baseline Risk" />

              {/* DELTA */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ fontSize: '28px', fontWeight: '900', color: delta > 0 ? '#ef4444' : delta < 0 ? '#22c55e' : '#64748b' }}>
                  {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: delta > 0 ? '#ef4444' : delta < 0 ? '#22c55e' : '#64748b', fontFamily: 'monospace' }}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                </div>
                <div style={{ color: '#475569', fontSize: '10px' }}>pts change</div>
                {levelChanged && (
                  <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', padding: '4px 8px', textAlign: 'center', marginTop: '4px' }}>
                    <div style={{ color: '#fca5a5', fontSize: '10px', fontWeight: '600' }}>LEVEL CHANGED</div>
                    <div style={{ color: '#f87171', fontSize: '10px' }}>{getRiskLevel(baseRisk)} → {getRiskLevel(modRisk)}</div>
                  </div>
                )}
              </div>

              <RiskGauge score={modRisk} label="Scenario Risk" />
            </div>
          </div>

          {/* SHAP COMPARISON */}
          <div style={card}>
            <h2 style={{ ...h2, marginBottom: '16px' }}>SHAP Factor Comparison</h2>
            <div style={{ display: 'flex', gap: '24px' }}>
              <SHAPBar factors={baseFactors} title="Baseline Factors" />
              <div style={{ width: '1px', background: '#1e293b' }} />
              <SHAPBar factors={modFactors.map((f, i) => ({
                ...f,
                impact: f.impact > 0 ? f.impact : baseFactors[i]?.impact || 0.01
              }))} title="Modified Factors" />
            </div>
          </div>

          {/* MOST IMPACTFUL */}
          {mostImpactful && mostImpactful.impact > 0.005 && (
            <div style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Zap size={14} color="#f97316" />
                <span style={{ color: '#fb923c', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Impactful Change</span>
              </div>
              <p style={{ color: '#e2e8f0', fontSize: '13px', margin: 0 }}>
                Changing <strong style={{ color: mostImpactful.color }}>{mostImpactful.label}</strong> from{' '}
                <strong style={{ color: '#94a3b8' }}>{mostImpactful.baseVal.toFixed(1)}{mostImpactful.unit}</strong> to{' '}
                <strong style={{ color: mostImpactful.color }}>{mostImpactful.modVal.toFixed(1)}{mostImpactful.unit}</strong>{' '}
                contributed <strong style={{ color: delta > 0 ? '#ef4444' : '#22c55e' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)} risk points</strong>
              </p>
            </div>
          )}

          {/* RADAR CHART */}
          <div style={card}>
            <h2 style={{ ...h2, marginBottom: '4px' }}>{assetCategory} Sensor Sensitivity Profile</h2>
            <p style={{ ...muted, marginBottom: '12px' }}>Baseline vs scenario across all {assetCategory.toLowerCase()} sensor dimensions</p>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
              {[['#6366f1', 'Baseline'], ['#f97316', 'Scenario']].map(([color, name]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>{name}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="sensor" tick={{ fill: '#64748b', fontSize: 10 }} />
                <Radar name="Baseline" dataKey="Baseline" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={1.5} />
                <Radar name="Scenario" dataKey="Scenario" stroke="#f97316" fill="#f97316" fillOpacity={0.15} strokeWidth={1.5} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '11px' }}
                  formatter={v => [`${v.toFixed(1)}%`]} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </div>
    </div>
  )
}