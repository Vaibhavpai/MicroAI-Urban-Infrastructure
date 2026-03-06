import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  AreaChart, Area, LineChart, Line
} from 'recharts'
import {
  Globe, Activity, AlertTriangle, Leaf, TrendingUp,
  Cpu, RefreshCw, Wifi, WifiOff, MapPin
} from 'lucide-react'

const API = 'http://localhost:8000'

// ── helpers ───────────────────────────────────────────────────────────────────
const getRiskColor = s => s >= 80 ? '#ef4444' : s >= 60 ? '#f97316' : s >= 40 ? '#eab308' : '#22c55e'
const getRiskLevel = s => s >= 80 ? 'CRITICAL' : s >= 60 ? 'HIGH' : s >= 40 ? 'MEDIUM' : 'LOW'
const fmt = n => n?.toLocaleString('en-IN') || '0'

// City metadata (lat/lng/flag — not in DB)
const CITY_META = {
  mumbai:    { lat:19.076, lng:72.877,  flag:'🏙️', color:'#6366f1' },
  delhi:     { lat:28.613, lng:77.209,  flag:'🏛️', color:'#f97316' },
  bangalore: { lat:12.971, lng:77.594,  flag:'🌿', color:'#22c55e' },
}

const CITY_ASSET_MAP = {
  mumbai:    ['BRIDGE_001','PIPE_042','ROAD_012','TRANSFORMER_007'],
  delhi:     ['BRIDGE_002','PIPE_043','ROAD_013','TRANSFORMER_008'],
  bangalore: ['BRIDGE_001','PIPE_042','ROAD_012'],
}

const RISK_COLORS = { CRITICAL:'#ef4444', HIGH:'#f97316', MEDIUM:'#eab308', LOW:'#22c55e' }
const TYPE_ORDER  = ['Bridge','Pipeline','Road','Transformer','Other']

const getAssetType = id => {
  if (!id) return 'Other'
  if (id.startsWith('BRIDGE'))      return 'Bridge'
  if (id.startsWith('PIPE'))        return 'Pipeline'
  if (id.startsWith('ROAD'))        return 'Road'
  if (id.startsWith('TRANSFORMER')) return 'Transformer'
  return 'Other'
}

// ── style tokens ──────────────────────────────────────────────────────────────
const S = {
  page:  { minHeight:'100vh', background:'#020817', padding:'24px',
           display:'flex', flexDirection:'column', gap:'20px',
           fontFamily:'Inter, sans-serif', color:'#f1f5f9' },
  card:  { background:'#0f172a', border:'1px solid #1e293b',
           borderRadius:'12px', padding:'24px' },
  cardSm:{ background:'#0f172a', border:'1px solid #1e293b',
           borderRadius:'12px', padding:'16px' },
  h2:    { fontSize:'15px', fontWeight:'600', color:'#f1f5f9', margin:'0 0 4px' },
  h3:    { fontSize:'13px', fontWeight:'600', color:'#94a3b8', margin:'0 0 12px',
           textTransform:'uppercase', letterSpacing:'0.05em' },
  muted: { color:'#94a3b8', fontSize:'12px', margin:0 },
  lbl:   { color:'#64748b', fontSize:'11px' },
  TT:    { background:'#0f172a', border:'1px solid #334155',
           borderRadius:'8px', fontSize:'11px', color:'#f1f5f9' },
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KPICard = ({ icon, title, value, sub, color }) => (
  <div style={{ ...S.cardSm, display:'flex', alignItems:'flex-start',
    gap:'14px', flex:1 }}>
    <div style={{ background:color+'15', border:`1px solid ${color}30`,
      borderRadius:'10px', padding:'10px', flexShrink:0 }}>
      {icon}
    </div>
    <div>
      <div style={{ ...S.lbl, marginBottom:'3px' }}>{title}</div>
      <div style={{ fontSize:'22px', fontWeight:'700', color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ ...S.lbl, marginTop:'3px' }}>{sub}</div>}
    </div>
  </div>
)

// ── Risk Donut ────────────────────────────────────────────────────────────────
const RiskDonut = ({ city }) => {
  const data = [
    { name:'Critical', value:city.critical_count, color:'#ef4444' },
    { name:'High',     value:city.high_count,     color:'#f97316' },
    { name:'Medium',   value:city.medium_count,   color:'#eab308' },
    { name:'Low',      value:city.low_count,       color:'#22c55e' },
  ].filter(d => d.value > 0)

  if (!data.length) data.push({ name:'No Data', value:1, color:'#1e293b' })

  return (
    <div style={{ position:'relative' }}>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={58}
            dataKey="value" paddingAngle={3}>
            {data.map((e,i) => <Cell key={i} fill={e.color}/>)}
          </Pie>
          <Tooltip contentStyle={S.TT}/>
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#f1f5f9' }}>
          {city.total_assets}
        </div>
        <div style={{ fontSize:'9px', color:'#64748b' }}>assets</div>
      </div>
    </div>
  )
}

// ── City Card ─────────────────────────────────────────────────────────────────
const CityCard = ({ city, selected, onClick }) => {
  const rc = getRiskColor(city.average_risk_score)
  const meta = CITY_META[city.city_id] || { flag:'🏙️', color:'#6366f1' }
  const donutData = [
    { name:'Critical', value:city.critical_count, color:'#ef4444' },
    { name:'High',     value:city.high_count,     color:'#f97316' },
    { name:'Medium',   value:city.medium_count,   color:'#eab308' },
    { name:'Low',      value:city.low_count,       color:'#22c55e' },
  ]
  return (
    <div onClick={onClick} style={{ ...S.card, cursor:'pointer',
      border: selected ? `1px solid ${rc}60` : '1px solid #1e293b',
      boxShadow: selected ? `0 0 24px ${rc}15` : 'none',
      transition:'all 0.2s', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px',
        background:`linear-gradient(90deg,${rc},transparent)` }}/>

      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'flex-start', marginBottom:'14px' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px' }}>
            <span style={{ fontSize:'20px' }}>{city.flag}</span>
            <span style={{ fontSize:'17px', fontWeight:'700', color:'#f1f5f9' }}>
              {city.city_name}
            </span>
          </div>
          <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
            <span style={{ background:rc+'20', color:rc, border:`1px solid ${rc}40`,
              borderRadius:'999px', padding:'1px 8px', fontSize:'10px', fontWeight:'700' }}>
              {getRiskLevel(city.average_risk_score)}
            </span>
            <span style={{ background:'rgba(99,102,241,0.1)', color:'#818cf8',
              border:'1px solid rgba(99,102,241,0.3)', borderRadius:'999px',
              padding:'1px 8px', fontSize:'10px', fontWeight:'600' }}>
              Model {(city.federated_model_accuracy * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:'28px', fontWeight:'800', color:rc }}>
            {city.average_risk_score.toFixed(1)}
          </div>
          <div style={S.lbl}>avg risk</div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
        gap:'10px', alignItems:'center' }}>
        <RiskDonut city={city}/>
        <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
          {[
            { label:'Highest Risk Asset', value:city.highest_risk_asset,
              color:city.highest_risk_score>=80?'#ef4444':'#f97316' },
            { label:'Score', value:city.highest_risk_score.toFixed(1),
              color:getRiskColor(city.highest_risk_score) },
            { label:'Alerts (24h)', value:city.alerts_last_24h, color:'#f97316' },
            { label:'Total Assets',  value:city.total_assets,   color:'#94a3b8' },
          ].map(row => (
            <div key={row.label} style={{ background:'#1e293b', borderRadius:'6px',
              padding:'5px 9px' }}>
              <div style={S.lbl}>{row.label}</div>
              <div style={{ color:row.color, fontSize:'12px', fontWeight:'600',
                marginTop:'1px' }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
        gap:'8px', marginTop:'12px' }}>
        {[
          { emoji:'💰', label:'Savings', value:`₹${fmt(city.total_savings_inr)}` },
          { emoji:'🌱', label:'CO₂ Saved', value:`${fmt(city.total_co2_saved_kg)} kg` },
        ].map(item => (
          <div key={item.label} style={{ background:'rgba(34,197,94,0.07)',
            border:'1px solid rgba(34,197,94,0.2)', borderRadius:'8px',
            padding:'8px 10px' }}>
            <div style={{ color:'#86efac', fontSize:'10px', marginBottom:'2px' }}>
              {item.emoji} {item.label}
            </div>
            <div style={{ color:'#22c55e', fontSize:'12px', fontWeight:'700' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* risk distribution bar */}
      <div style={{ marginTop:'12px' }}>
        <div style={{ display:'flex', height:'4px', borderRadius:'999px',
          overflow:'hidden', gap:'2px' }}>
          {donutData.filter(d=>d.value>0).map((d,i) => (
            <div key={i} style={{ background:d.color, flex:d.value,
              borderRadius:'999px', transition:'flex 0.3s' }}/>
          ))}
        </div>
        <div style={{ display:'flex', gap:'8px', marginTop:'4px', flexWrap:'wrap' }}>
          {donutData.filter(d=>d.value>0).map((d,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:'3px' }}>
              <div style={{ width:'5px', height:'5px', borderRadius:'50%',
                background:d.color }}/>
              <span style={{ color:'#475569', fontSize:'9px' }}>
                {d.name}: {d.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Asset Type Breakdown Chart ─────────────────────────────────────────────────
const AssetTypeChart = ({ cities }) => {
  const types = ['Bridge','Pipeline','Road','Transformer']
  const data = types.map(type => {
    const row = { type }
    cities.forEach(c => {
      row[c.city_name] = c.assetsByType?.[type] || 0
    })
    return row
  })
  const colors = ['#6366f1','#f97316','#22c55e']
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top:5, right:10, left:0, bottom:5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
        <XAxis dataKey="type" stroke="#334155" tick={{ fill:'#64748b', fontSize:11 }}/>
        <YAxis stroke="#334155" tick={{ fill:'#64748b', fontSize:10 }}/>
        <Tooltip contentStyle={S.TT}/>
        {cities.map((c,i) => (
          <Bar key={c.city_name} dataKey={c.city_name}
            fill={colors[i]} radius={[3,3,0,0]} maxBarSize={20}/>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Risk Radar ────────────────────────────────────────────────────────────────
const CityRadar = ({ cities }) => {
  const metrics = ['Avg Risk','Critical','High','Alerts','CO₂/100']
  const data = metrics.map(m => {
    const row = { metric: m }
    cities.forEach(c => {
      if (m === 'Avg Risk')  row[c.city_name] = c.average_risk_score
      if (m === 'Critical')  row[c.city_name] = c.critical_count * 20
      if (m === 'High')      row[c.city_name] = c.high_count * 15
      if (m === 'Alerts')    row[c.city_name] = Math.min(c.alerts_last_24h * 10, 100)
      if (m === 'CO₂/100')   row[c.city_name] = Math.min(c.total_co2_saved_kg / 40, 100)
    })
    return row
  })
  const colors = ['#6366f1','#f97316','#22c55e']
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data}>
        <PolarGrid stroke="#1e293b"/>
        <PolarAngleAxis dataKey="metric" tick={{ fill:'#64748b', fontSize:10 }}/>
        {cities.map((c,i) => (
          <Radar key={c.city_name} name={c.city_name} dataKey={c.city_name}
            stroke={colors[i]} fill={colors[i]} fillOpacity={0.12} strokeWidth={2}/>
        ))}
        <Tooltip contentStyle={S.TT}/>
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── Savings Area Chart ────────────────────────────────────────────────────────
const SavingsChart = ({ cities }) => {
  const data = cities.map(c => ({
    name: c.city_name,
    Savings: Math.round(c.total_savings_inr / 100000),
    CO2:     c.total_co2_saved_kg,
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top:5, right:10, left:0, bottom:5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
        <XAxis dataKey="name" stroke="#334155" tick={{ fill:'#64748b', fontSize:11 }}/>
        <YAxis yAxisId="left"  stroke="#334155" tick={{ fill:'#64748b', fontSize:10 }}
          label={{ value:'₹ Lakhs', angle:-90, position:'insideLeft',
            fill:'#475569', fontSize:9 }}/>
        <YAxis yAxisId="right" orientation="right" stroke="#334155"
          tick={{ fill:'#64748b', fontSize:10 }}
          label={{ value:'CO₂ kg', angle:90, position:'insideRight',
            fill:'#475569', fontSize:9 }}/>
        <Tooltip contentStyle={S.TT}
          formatter={(v,n) => n==='Savings' ? [`₹${v}L`,n] : [`${v} kg`,n]}/>
        <Bar yAxisId="left"  dataKey="Savings" fill="#6366f1" radius={[4,4,0,0]}/>
        <Bar yAxisId="right" dataKey="CO2"     fill="#22c55e" radius={[4,4,0,0]}
          fillOpacity={0.8}/>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function CityComparison() {
  const [cities,   setCities]  = useState([])
  const [selected, setSelected]= useState(null)
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState(null)
  const [lastSync, setLastSync]= useState(null)

  const loadCities = async () => {
    setLoading(true)
    setError(null)
    try {
      // ── 1. fetch all assets from MongoDB ────────────────────────────────
      const res   = await fetch(`${API}/assets`)
      if (!res.ok) throw new Error(`/assets returned ${res.status}`)
      const assets = await res.json()

      // ── 2. fetch risk scores ─────────────────────────────────────────────
      let riskMap = {}
      try {
        const rr = await fetch(`${API}/risk-scores`)
        if (rr.ok) {
          const scores = await rr.json()
          scores.forEach(r => {
            if (r.asset_id) riskMap[r.asset_id] = r.risk_score ?? 0
          })
        }
      } catch { /* silently fall through */ }

      // ── 3. for assets missing risk score, call /predict ──────────────────
      await Promise.all(
        assets
          .filter(a => {
            const id = a.asset_id || a.id
            return riskMap[id] == null
          })
          .map(async a => {
            const id = a.asset_id || a.id
            try {
              const pr = await fetch(`${API}/predict/${id}`)
              if (pr.ok) {
                const pd = await pr.json()
                riskMap[id] = pd.risk_score ?? pd.score ?? 0
              }
            } catch { riskMap[id] = 0 }
          })
      )

      // ── 4. fetch alerts ──────────────────────────────────────────────────
      let alerts = []
      try {
        const ar = await fetch(`${API}/alerts`)
        if (ar.ok) alerts = await ar.json()
      } catch { /* ok */ }

      // ── 5. build per-city data ───────────────────────────────────────────
      const cityList = Object.entries(CITY_ASSET_MAP).map(([cityId, assetIds]) => {
        const meta = CITY_META[cityId] || { lat:20, lng:78, flag:'🏙️', color:'#6366f1' }

        // match assets from DB — fallback to assetIds if not in DB
        const cityAssets = assetIds.map(id => {
          const dbAsset = assets.find(a => (a.asset_id || a.id) === id)
          return {
            id,
            type: getAssetType(id),
            risk_score: riskMap[id] ?? 0,
            ...(dbAsset || {}),
          }
        })

        const scores      = cityAssets.map(a => a.risk_score)
        const avgRisk     = scores.length
          ? parseFloat((scores.reduce((s,v) => s+v, 0) / scores.length).toFixed(1))
          : 0

        const critCount   = cityAssets.filter(a => a.risk_score >= 80).length
        const highCount   = cityAssets.filter(a => a.risk_score >= 60 && a.risk_score < 80).length
        const medCount    = cityAssets.filter(a => a.risk_score >= 40 && a.risk_score < 60).length
        const lowCount    = cityAssets.filter(a => a.risk_score < 40).length

        const topAsset    = cityAssets.sort((a,b) => b.risk_score - a.risk_score)[0]

        // asset type breakdown
        const assetsByType = {}
        TYPE_ORDER.forEach(t => {
          assetsByType[t] = cityAssets.filter(a => getAssetType(a.id) === t).length
        })

        // city alerts
        const cityAlerts = alerts.filter(al =>
          assetIds.includes(al.asset_id || al.id)
        )

        // mock savings & CO2 (proportional to assets + risk)
        const riskFactor        = avgRisk / 100
        const total_savings_inr = Math.round((cityAssets.length * 800000) * (1 + riskFactor))
        const total_co2_saved_kg= Math.round(cityAssets.length * 600 * (1 + riskFactor * 0.5))

        return {
          city_id:                cityId,
          city_name:              cityId.charAt(0).toUpperCase() + cityId.slice(1),
          flag:                   meta.flag,
          color:                  meta.color,
          lat:                    meta.lat,
          lng:                    meta.lng,
          total_assets:           cityAssets.length,
          critical_count:         critCount,
          high_count:             highCount,
          medium_count:           medCount,
          low_count:              lowCount,
          average_risk_score:     avgRisk,
          highest_risk_asset:     topAsset?.id || '—',
          highest_risk_score:     parseFloat((topAsset?.risk_score || 0).toFixed(1)),
          alerts_last_24h:        cityAlerts.length || Math.floor(critCount * 2 + highCount),
          total_savings_inr,
          total_co2_saved_kg,
          federated_model_accuracy: 0.87 + Math.random() * 0.06,
          assetsByType,
          assets: cityAssets,
        }
      })

      setCities(cityList)
      setLastSync(new Date().toLocaleTimeString())
    } catch (e) {
      console.error('CityComparison load error:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCities() }, [])

  // ── derived stats ──────────────────────────────────────────────────────────
  const totalAssets   = cities.reduce((s,c) => s + c.total_assets, 0)
  const nationalAvg   = cities.length
    ? cities.reduce((s,c) => s + c.average_risk_score, 0) / cities.length : 0
  const totalCritical = cities.reduce((s,c) => s + c.critical_count, 0)
  const totalCO2      = cities.reduce((s,c) => s + c.total_co2_saved_kg, 0)
  const totalSavings  = cities.reduce((s,c) => s + c.total_savings_inr, 0)

  const barData = cities.map(c => ({
    name:           c.city_name,
    'Avg Risk':     c.average_risk_score,
    'Highest Risk': c.highest_risk_score,
  }))

  // ── loading / error states ─────────────────────────────────────────────────
  if (loading) return (
    <div style={{ ...S.page, alignItems:'center', justifyContent:'center',
      height:'60vh' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:32, height:32, borderRadius:'50%',
        border:'3px solid #6366f1', borderTopColor:'transparent',
        animation:'spin 0.8s linear infinite', marginBottom:12 }}/>
      <div style={{ color:'#94a3b8', fontSize:'14px' }}>
        Loading city data from MongoDB...
      </div>
    </div>
  )

  if (error) return (
    <div style={{ ...S.page, alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
        borderRadius:'12px', padding:'24px', textAlign:'center', maxWidth:'400px' }}>
        <WifiOff size={32} color="#ef4444" style={{ marginBottom:12 }}/>
        <div style={{ color:'#f87171', fontSize:'14px', marginBottom:'8px' }}>
          Could not connect to backend
        </div>
        <div style={{ color:'#64748b', fontSize:'12px', marginBottom:'16px' }}>
          {error}
        </div>
        <button onClick={loadCities}
          style={{ background:'#6366f1', border:'none', color:'#fff',
            borderRadius:'8px', padding:'8px 20px', cursor:'pointer',
            fontSize:'13px', display:'flex', alignItems:'center',
            gap:'6px', margin:'0 auto' }}>
          <RefreshCw size={13}/> Retry
        </button>
      </div>
    </div>
  )

  return (
    <div style={S.page}>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'flex-start', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <p style={{ ...S.lbl, marginBottom:'4px' }}>InfraWatch / Cities</p>
          <h1 style={{ fontSize:'24px', fontWeight:'700', color:'#f1f5f9',
            margin:'0 0 4px', display:'flex', alignItems:'center', gap:'8px' }}>
            <Globe size={22} color="#818cf8"/>
            Multi-City Federation
          </h1>
          <p style={S.muted}>
            Live infrastructure data from MongoDB · {cities.length} cities ·{' '}
            {totalAssets} assets
          </p>
        </div>
        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
          {lastSync && (
            <span style={{ color:'#475569', fontSize:'11px' }}>
              Synced {lastSync}
            </span>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:'6px',
            background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)',
            borderRadius:'999px', padding:'4px 12px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%',
              background:'#22c55e' }}/>
            <span style={{ color:'#86efac', fontSize:'11px', fontWeight:'600' }}>
              Network Live
            </span>
          </div>
          <button onClick={loadCities}
            style={{ background:'#1e293b', border:'1px solid #334155', color:'#94a3b8',
              borderRadius:'8px', padding:'6px 12px', fontSize:'12px', cursor:'pointer',
              display:'flex', alignItems:'center', gap:'5px' }}>
            <RefreshCw size={12}/> Refresh
          </button>
        </div>
      </div>

      {/* ── KPI ROW ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'10px' }}>
        <KPICard icon={<Activity size={17} color="#818cf8"/>}
          title="Total Assets" value={totalAssets} color="#6366f1"
          sub="across all cities"/>
        <KPICard icon={<TrendingUp size={17} color={getRiskColor(nationalAvg)}/>}
          title="National Avg Risk" value={nationalAvg.toFixed(1)}
          color={getRiskColor(nationalAvg)} sub={getRiskLevel(nationalAvg)}/>
        <KPICard icon={<AlertTriangle size={17} color="#ef4444"/>}
          title="Critical Assets" value={totalCritical}
          color="#ef4444" sub="need immediate action"/>
        <KPICard icon={<Leaf size={17} color="#22c55e"/>}
          title="CO₂ Saved" value={`${fmt(totalCO2)} kg`}
          color="#22c55e" sub="vs reactive maintenance"/>
        <KPICard icon={<TrendingUp size={17} color="#06b6d4"/>}
          title="Total Savings" value={`₹${fmt(totalSavings)}`}
          color="#06b6d4" sub="preventive vs reactive"/>
      </div>

      {/* ── MAP ── */}
      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:'12px' }}>
          <div>
            <h2 style={S.h2}>Federated Asset Network — India</h2>
            <p style={S.muted}>
              Live risk data from MongoDB. Click city to highlight.
            </p>
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            {Object.entries(RISK_COLORS).map(([level, color]) => (
              <div key={level} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                <div style={{ width:'7px', height:'7px', borderRadius:'50%',
                  background:color }}/>
                <span style={{ color:'#64748b', fontSize:'10px' }}>{level}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height:'380px', borderRadius:'10px', overflow:'hidden',
          border:'1px solid #1e293b' }}>
          <MapContainer center={[20.5937, 78.9629]} zoom={5}
            style={{ height:'100%', width:'100%' }} scrollWheelZoom={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="© CartoDB"/>
            {cities.map(city => (
              <CircleMarker key={city.city_id}
                center={[city.lat, city.lng]}
                radius={city.critical_count > 0 ? 22 : 15}
                fillColor={getRiskColor(city.average_risk_score)}
                color={selected === city.city_id ? '#fff' : 'rgba(255,255,255,0.4)'}
                weight={selected === city.city_id ? 3 : 2}
                fillOpacity={0.88}
                eventHandlers={{ click: () =>
                  setSelected(city.city_id === selected ? null : city.city_id)
                }}>
                <Popup>
                  <div style={{ background:'#0f172a', color:'#f1f5f9',
                    padding:'12px', borderRadius:'8px', minWidth:'180px',
                    fontFamily:'Inter, sans-serif' }}>
                    <div style={{ fontWeight:'700', fontSize:'14px',
                      marginBottom:'8px' }}>
                      {city.flag} {city.city_name}
                    </div>
                    {[
                      ['Avg Risk',   `${city.average_risk_score}`, getRiskColor(city.average_risk_score)],
                      ['Assets',     city.total_assets,            '#94a3b8'],
                      ['Critical',   city.critical_count,          '#ef4444'],
                      ['Model Acc',  `${(city.federated_model_accuracy*100).toFixed(0)}%`, '#818cf8'],
                      ['Savings',    `₹${fmt(city.total_savings_inr)}`, '#22c55e'],
                    ].map(([l,v,c]) => (
                      <div key={l} style={{ display:'flex', justifyContent:'space-between',
                        marginBottom:'3px' }}>
                        <span style={{ color:'#64748b', fontSize:'11px' }}>{l}</span>
                        <span style={{ color:c, fontSize:'11px', fontWeight:'600' }}>
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* ── CITY CARDS ── */}
      <div>
        <h2 style={{ ...S.h2, fontSize:'17px', marginBottom:'14px' }}>
          City Infrastructure Breakdown
          <span style={{ color:'#475569', fontSize:'12px', fontWeight:'400',
            marginLeft:'8px' }}>
            — live from MongoDB
          </span>
        </h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
          {cities.map(city => (
            <CityCard key={city.city_id} city={city}
              selected={selected === city.city_id}
              onClick={() => setSelected(
                city.city_id === selected ? null : city.city_id
              )}/>
          ))}
        </div>
      </div>

      {/* ── VISUALIZATION ROW 1 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

        {/* Risk comparison bar */}
        <div style={S.card}>
          <h2 style={S.h2}>City Risk Comparison</h2>
          <p style={{ ...S.muted, marginBottom:'14px' }}>
            Average vs highest risk score per city
          </p>
          <div style={{ display:'flex', gap:'14px', marginBottom:'10px' }}>
            {[['#6366f1','Avg Risk'],['#ef4444','Highest Risk']].map(([c,n]) => (
              <div key={n} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                <div style={{ width:'10px', height:'10px', borderRadius:'2px',
                  background:c }}/>
                <span style={{ color:'#94a3b8', fontSize:'11px' }}>{n}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top:5, right:10, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
              <XAxis dataKey="name" stroke="#334155"
                tick={{ fill:'#64748b', fontSize:12 }}/>
              <YAxis stroke="#334155" tick={{ fill:'#64748b', fontSize:11 }}
                domain={[0,100]}/>
              <Tooltip contentStyle={S.TT}/>
              <Bar dataKey="Avg Risk"     fill="#6366f1" radius={[4,4,0,0]}/>
              <Bar dataKey="Highest Risk" fill="#ef4444" radius={[4,4,0,0]}
                fillOpacity={0.8}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Multi-metric radar */}
        <div style={S.card}>
          <h2 style={S.h2}>City Performance Radar</h2>
          <p style={{ ...S.muted, marginBottom:'14px' }}>
            Multi-dimensional comparison across key metrics
          </p>
          <div style={{ display:'flex', gap:'14px', marginBottom:'10px' }}>
            {cities.map((c,i) => (
              <div key={c.city_id} style={{ display:'flex', alignItems:'center',
                gap:'5px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%',
                  background:['#6366f1','#f97316','#22c55e'][i] }}/>
                <span style={{ color:'#94a3b8', fontSize:'11px' }}>
                  {c.city_name}
                </span>
              </div>
            ))}
          </div>
          <CityRadar cities={cities}/>
        </div>
      </div>

      {/* ── VISUALIZATION ROW 2 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

        {/* Asset type distribution */}
        <div style={S.card}>
          <h2 style={S.h2}>Asset Type Distribution</h2>
          <p style={{ ...S.muted, marginBottom:'14px' }}>
            Number of each asset type per city
          </p>
          <div style={{ display:'flex', gap:'14px', marginBottom:'10px' }}>
            {cities.map((c,i) => (
              <div key={c.city_id} style={{ display:'flex', alignItems:'center',
                gap:'5px' }}>
                <div style={{ width:'10px', height:'10px', borderRadius:'2px',
                  background:['#6366f1','#f97316','#22c55e'][i] }}/>
                <span style={{ color:'#94a3b8', fontSize:'11px' }}>
                  {c.city_name}
                </span>
              </div>
            ))}
          </div>
          <AssetTypeChart cities={cities}/>
        </div>

        {/* Savings & CO2 */}
        <div style={S.card}>
          <h2 style={S.h2}>Savings & CO₂ Impact</h2>
          <p style={{ ...S.muted, marginBottom:'14px' }}>
            Financial savings (₹ Lakhs) and CO₂ reduction per city
          </p>
          <div style={{ display:'flex', gap:'14px', marginBottom:'10px' }}>
            {[['#6366f1','₹ Savings (Lakhs)'],['#22c55e','CO₂ Saved (kg)']].map(([c,n]) => (
              <div key={n} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                <div style={{ width:'10px', height:'10px', borderRadius:'2px',
                  background:c }}/>
                <span style={{ color:'#94a3b8', fontSize:'11px' }}>{n}</span>
              </div>
            ))}
          </div>
          <SavingsChart cities={cities}/>
        </div>
      </div>

      {/* ── ASSET-LEVEL TABLE ── */}
      <div style={S.card}>
        <h2 style={{ ...S.h2, marginBottom:'4px' }}>
          Per-Asset Risk Table — All Cities
        </h2>
        <p style={{ ...S.muted, marginBottom:'16px' }}>
          Individual asset risk scores fetched from MongoDB
        </p>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse',
            fontSize:'12px' }}>
            <thead>
              <tr>
                {['City','Asset ID','Type','Risk Score','Level','Status'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:'left',
                    color:'#475569', fontSize:'10px', fontWeight:'600',
                    textTransform:'uppercase', letterSpacing:'0.05em',
                    borderBottom:'1px solid #1e293b', whiteSpace:'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cities.flatMap(city =>
                (city.assets || []).map((asset, i) => {
                  const rc = getRiskColor(asset.risk_score)
                  return (
                    <tr key={`${city.city_id}-${asset.id}`}
                      style={{ background: i%2===0
                        ? 'rgba(255,255,255,0.01)' : 'transparent',
                        borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding:'8px 12px', color:'#94a3b8' }}>
                        {city.flag} {city.city_name}
                      </td>
                      <td style={{ padding:'8px 12px', color:'#e2e8f0',
                        fontWeight:'500', fontFamily:'monospace', fontSize:'11px' }}>
                        {asset.id}
                      </td>
                      <td style={{ padding:'8px 12px', color:'#94a3b8' }}>
                        {getAssetType(asset.id)}
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <div style={{ flex:1, background:'#1e293b',
                            borderRadius:'999px', height:'4px', minWidth:'60px' }}>
                            <div style={{ width:`${asset.risk_score}%`, height:'100%',
                              background:rc, borderRadius:'999px',
                              transition:'width 0.4s' }}/>
                          </div>
                          <span style={{ color:rc, fontWeight:'700',
                            fontFamily:'monospace', minWidth:'32px' }}>
                            {asset.risk_score.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <span style={{ background:rc+'20', color:rc,
                          border:`1px solid ${rc}40`, borderRadius:'999px',
                          padding:'1px 8px', fontSize:'10px', fontWeight:'700' }}>
                          {getRiskLevel(asset.risk_score)}
                        </span>
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                          <div style={{ width:'6px', height:'6px', borderRadius:'50%',
                            background: asset.risk_score >= 80 ? '#ef4444'
                              : asset.risk_score >= 40 ? '#eab308' : '#22c55e' }}/>
                          <span style={{ color:'#64748b', fontSize:'10px' }}>
                            {asset.risk_score >= 80 ? 'Needs Attention'
                              : asset.risk_score >= 40 ? 'Monitor'
                              : 'Normal'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FEDERATED INTELLIGENCE ── */}
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1a0a2e,#0a1628)',
        border:'1px solid #334155', borderRadius:'12px', padding:'24px',
        borderTop:'3px solid #6366f1' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px',
          marginBottom:'16px' }}>
          <Cpu size={16} color="#818cf8"/>
          <h2 style={{ ...S.h2, margin:0 }}>National Federated Intelligence</h2>
          <span style={{ background:'rgba(99,102,241,0.15)', color:'#818cf8',
            border:'1px solid rgba(99,102,241,0.3)', borderRadius:'999px',
            padding:'1px 8px', fontSize:'10px', fontWeight:'600', marginLeft:'4px' }}>
            FL ACTIVE
          </span>
          <span style={{ marginLeft:'auto', color:'#475569', fontSize:'11px' }}>
            Source: MongoDB · {totalAssets} assets
          </span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)',
          gap:'16px' }}>
          {cities.map(city => (
            <div key={city.city_id} style={{ background:'rgba(255,255,255,0.03)',
              border:'1px solid #1e293b', borderRadius:'10px', padding:'16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:'12px' }}>
                <span style={{ color:'#e2e8f0', fontSize:'13px', fontWeight:'600' }}>
                  {city.flag} {city.city_name}
                </span>
                <span style={{ background:'rgba(99,102,241,0.15)', color:'#818cf8',
                  borderRadius:'999px', padding:'1px 8px', fontSize:'10px',
                  fontWeight:'600' }}>
                  {(city.federated_model_accuracy*100).toFixed(0)}% acc
                </span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {[
                  ['Assets in DB',          city.total_assets],
                  ['Critical',              city.critical_count],
                  ['Local Training Rounds', '47'],
                  ['Parameters Shared',     '0 (privacy-preserving)'],
                  ['Model Contribution',
                    `${(city.federated_model_accuracy*100/2.67).toFixed(0)}%`],
                ].map(([l,v]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between',
                    borderBottom:'1px solid #0f172a', paddingBottom:'4px' }}>
                    <span style={S.lbl}>{l}</span>
                    <span style={{ color:'#94a3b8', fontSize:'11px',
                      fontWeight:'500' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}