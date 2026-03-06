import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Globe, Activity, AlertTriangle, Leaf, TrendingUp, Cpu } from 'lucide-react'

const getRiskColor = s => s >= 80 ? '#ef4444' : s >= 60 ? '#f97316' : s >= 40 ? '#eab308' : '#22c55e'
const getRiskLevel = s => s >= 80 ? 'CRITICAL' : s >= 60 ? 'HIGH' : s >= 40 ? 'MEDIUM' : 'LOW'

const fmt = n => n?.toLocaleString('en-IN') || '0'

const MOCK_CITIES = [
  {
    city_id: 'mumbai', city_name: 'Mumbai', flag: '🏙️',
    lat: 19.076, lng: 72.877,
    total_assets: 4, critical_count: 1, high_count: 2, medium_count: 1, low_count: 0,
    average_risk_score: 67.4, highest_risk_asset: 'TRANSFORMER_007',
    highest_risk_score: 91.3, total_co2_saved_kg: 2800,
    total_savings_inr: 4800000, federated_model_accuracy: 0.89, alerts_last_24h: 3,
  },
  {
    city_id: 'delhi', city_name: 'Delhi', flag: '🏛️',
    lat: 28.613, lng: 77.209,
    total_assets: 4, critical_count: 2, high_count: 1, medium_count: 1, low_count: 0,
    average_risk_score: 74.1, highest_risk_asset: 'BRIDGE_002',
    highest_risk_score: 88.7, total_co2_saved_kg: 3200,
    total_savings_inr: 6200000, federated_model_accuracy: 0.87, alerts_last_24h: 5,
  },
  {
    city_id: 'bangalore', city_name: 'Bangalore', flag: '🌿',
    lat: 12.971, lng: 77.594,
    total_assets: 3, critical_count: 0, high_count: 1, medium_count: 2, low_count: 0,
    average_risk_score: 41.2, highest_risk_asset: 'ROAD_012',
    highest_risk_score: 61.4, total_co2_saved_kg: 1900,
    total_savings_inr: 2900000, federated_model_accuracy: 0.91, alerts_last_24h: 1,
  },
]

const RISK_COLORS = { CRITICAL:'#ef4444', HIGH:'#f97316', MEDIUM:'#eab308', LOW:'#22c55e' }

// ── style tokens ──────────────────────────────────────────────────────────────
const page  = { minHeight:'100vh', background:'#020817', padding:'24px', display:'flex', flexDirection:'column', gap:'20px', fontFamily:'Inter, sans-serif', color:'#f1f5f9' }
const card  = { background:'#0f172a', border:'1px solid #1e293b', borderRadius:'12px', padding:'24px' }
const cardSm= { background:'#0f172a', border:'1px solid #1e293b', borderRadius:'12px', padding:'16px' }
const h2    = { fontSize:'15px', fontWeight:'600', color:'#f1f5f9', margin:'0 0 4px' }
const muted = { color:'#94a3b8', fontSize:'12px', margin:0 }
const lbl   = { color:'#64748b', fontSize:'11px' }

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KPICard = ({ icon, title, value, sub, color }) => (
  <div style={{ ...cardSm, display:'flex', alignItems:'flex-start', gap:'14px', flex:1 }}>
    <div style={{ background: color+'15', border:`1px solid ${color}30`, borderRadius:'10px', padding:'10px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      {icon}
    </div>
    <div>
      <div style={{ ...lbl, marginBottom:'3px' }}>{title}</div>
      <div style={{ fontSize:'22px', fontWeight:'700', color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ ...lbl, marginTop:'3px' }}>{sub}</div>}
    </div>
  </div>
)

// ── Risk Donut ────────────────────────────────────────────────────────────────
const RiskDonut = ({ city }) => {
  const data = [
    { name:'Critical', value: city.critical_count, color:'#ef4444' },
    { name:'High',     value: city.high_count,     color:'#f97316' },
    { name:'Medium',   value: city.medium_count,   color:'#eab308' },
    { name:'Low',      value: city.low_count,       color:'#22c55e' },
  ].filter(d => d.value > 0)

  return (
    <div style={{ position:'relative' }}>
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={65}
            dataKey="value" paddingAngle={3}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
          </Pie>
          <Tooltip contentStyle={{ background:'#0f172a', border:'1px solid #334155', borderRadius:'8px', fontSize:'11px', color:'#f1f5f9' }}/>
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
        <div style={{ fontSize:'20px', fontWeight:'700', color:'#f1f5f9' }}>{city.total_assets}</div>
        <div style={{ fontSize:'9px', color:'#64748b' }}>assets</div>
      </div>
    </div>
  )
}

// ── City Card ─────────────────────────────────────────────────────────────────
const CityCard = ({ city, selected, onClick }) => {
  const riskColor = getRiskColor(city.average_risk_score)
  const riskLevel = getRiskLevel(city.average_risk_score)
  const donutData = [
    { name:'Critical', value:city.critical_count, color:'#ef4444' },
    { name:'High',     value:city.high_count,     color:'#f97316' },
    { name:'Medium',   value:city.medium_count,   color:'#eab308' },
    { name:'Low',      value:city.low_count,       color:'#22c55e' },
  ]
  const totalRisk = donutData.reduce((s,d) => s + d.value, 0)

  return (
    <div onClick={onClick} style={{ ...card, cursor:'pointer', border: selected ? `1px solid ${riskColor}60` : '1px solid #1e293b',
      boxShadow: selected ? `0 0 20px ${riskColor}15` : 'none', transition:'all 0.2s', position:'relative', overflow:'hidden' }}>

      {/* top accent bar */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:`linear-gradient(90deg, ${riskColor}, transparent)` }}/>

      {/* header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
            <span style={{ fontSize:'20px' }}>{city.flag}</span>
            <h2 style={{ ...h2, margin:0, fontSize:'17px' }}>{city.city_name}</h2>
          </div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            <span style={{ background:riskColor+'20', color:riskColor, border:`1px solid ${riskColor}40`, borderRadius:'999px', padding:'1px 8px', fontSize:'10px', fontWeight:'700' }}>
              {riskLevel}
            </span>
            <span style={{ background:'rgba(99,102,241,0.1)', color:'#818cf8', border:'1px solid rgba(99,102,241,0.3)', borderRadius:'999px', padding:'1px 8px', fontSize:'10px', fontWeight:'600' }}>
              Model {(city.federated_model_accuracy * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:'28px', fontWeight:'800', color:riskColor }}>{city.average_risk_score.toFixed(1)}</div>
          <div style={{ ...lbl }}>avg risk</div>
        </div>
      </div>

      {/* donut + stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', alignItems:'center' }}>
        <RiskDonut city={city}/>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {[
            { label:'Highest Risk', value:city.highest_risk_asset, color:city.highest_risk_score >= 80 ? '#ef4444' : '#f97316' },
            { label:'Score',        value:city.highest_risk_score.toFixed(1), color:getRiskColor(city.highest_risk_score) },
            { label:'Alerts (24h)', value:city.alerts_last_24h,   color:'#f97316' },
          ].map(row => (
            <div key={row.label} style={{ background:'#1e293b', borderRadius:'6px', padding:'6px 10px' }}>
              <div style={lbl}>{row.label}</div>
              <div style={{ color:row.color, fontSize:'12px', fontWeight:'600', marginTop:'1px' }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* savings row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginTop:'12px' }}>
        <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:'8px', padding:'8px 10px' }}>
          <div style={{ color:'#86efac', fontSize:'10px', marginBottom:'2px' }}>💰 Savings</div>
          <div style={{ color:'#22c55e', fontSize:'13px', fontWeight:'700' }}>₹{fmt(city.total_savings_inr)}</div>
        </div>
        <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:'8px', padding:'8px 10px' }}>
          <div style={{ color:'#86efac', fontSize:'10px', marginBottom:'2px' }}>🌱 CO₂ Saved</div>
          <div style={{ color:'#22c55e', fontSize:'13px', fontWeight:'700' }}>{fmt(city.total_co2_saved_kg)} kg</div>
        </div>
      </div>

      {/* risk bar */}
      <div style={{ marginTop:'12px' }}>
        <div style={{ display:'flex', height:'5px', borderRadius:'999px', overflow:'hidden', gap:'2px' }}>
          {donutData.filter(d=>d.value>0).map((d,i) => (
            <div key={i} style={{ background:d.color, flex:d.value, borderRadius:'999px', transition:'flex 0.3s' }}/>
          ))}
        </div>
        <div style={{ display:'flex', gap:'10px', marginTop:'5px', flexWrap:'wrap' }}>
          {donutData.filter(d=>d.value>0).map((d,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:'3px' }}>
              <div style={{ width:'5px', height:'5px', borderRadius:'50%', background:d.color }}/>
              <span style={{ color:'#64748b', fontSize:'9px' }}>{d.name}: {d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function CityComparison() {
  const [cities]      = useState(MOCK_CITIES)
  const [selected,    setSelected]   = useState(null)

  const totalAssets   = cities.reduce((s,c) => s + c.total_assets, 0)
  const nationalAvg   = cities.reduce((s,c) => s + c.average_risk_score, 0) / cities.length
  const totalCritical = cities.reduce((s,c) => s + c.critical_count, 0)
  const totalCO2      = cities.reduce((s,c) => s + c.total_co2_saved_kg, 0)

  const barData = cities.map(c => ({
    name: c.city_name,
    'Avg Risk':     parseFloat(c.average_risk_score.toFixed(1)),
    'Highest Risk': parseFloat(c.highest_risk_score.toFixed(1)),
  }))

  return (
    <div style={page}>

      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <p style={{ ...lbl, marginBottom:'4px' }}>InfraWatch / Cities</p>
          <h1 style={{ fontSize:'24px', fontWeight:'700', color:'#f1f5f9', margin:'0 0 4px', display:'flex', alignItems:'center', gap:'8px' }}>
            <Globe size={22} color="#818cf8"/>
            Multi-City Federation
          </h1>
          <p style={muted}>Real-time infrastructure health across India's smart cities</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:'999px', padding:'4px 12px' }}>
          <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#22c55e' }}/>
          <span style={{ color:'#86efac', fontSize:'11px', fontWeight:'600' }}>Network Live</span>
        </div>
      </div>

      {/* KPI ROW */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px' }}>
        <KPICard icon={<Activity size={18} color="#818cf8"/>}    title="Total Assets Monitored" value={totalAssets}                          color="#6366f1" sub="across all cities"/>
        <KPICard icon={<TrendingUp size={18} color={getRiskColor(nationalAvg)}/>} title="National Avg Risk" value={nationalAvg.toFixed(1)} color={getRiskColor(nationalAvg)} sub={getRiskLevel(nationalAvg)}/>
        <KPICard icon={<AlertTriangle size={18} color="#ef4444"/>} title="Total Critical Assets" value={totalCritical}                      color="#ef4444" sub="need immediate action"/>
        <KPICard icon={<Leaf size={18} color="#22c55e"/>}         title="Total CO₂ Saved"        value={`${fmt(totalCO2)} kg`}              color="#22c55e" sub="vs reactive maintenance"/>
      </div>

      {/* MAP */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
          <div>
            <h2 style={h2}>Federated Asset Network</h2>
            <p style={muted}>Click a city marker to highlight. Bubble size = critical load.</p>
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            {Object.entries(RISK_COLORS).map(([level, color]) => (
              <div key={level} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:color }}/>
                <span style={{ color:'#64748b', fontSize:'10px' }}>{level}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height:'380px', width:'100%', borderRadius:'10px', overflow:'hidden', border:'1px solid #1e293b' }}>
          <MapContainer
            center={[20.5937, 78.9629]}
            zoom={5}
            style={{ height:'100%', width:'100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="© CartoDB"
            />
            {cities.map(city => (
              <CircleMarker
                key={city.city_id}
                center={[city.lat, city.lng]}
                radius={city.critical_count > 0 ? 20 : 14}
                fillColor={getRiskColor(city.average_risk_score)}
                color="rgba(255,255,255,0.6)"
                weight={2}
                fillOpacity={0.85}
                eventHandlers={{ click: () => setSelected(city.city_id === selected ? null : city.city_id) }}
              >
                <Popup>
                  <div style={{ background:'#1e293b', color:'#f1f5f9', padding:'10px', borderRadius:'8px', minWidth:'160px', fontFamily:'Inter, sans-serif' }}>
                    <div style={{ fontWeight:'700', fontSize:'14px', marginBottom:'6px' }}>{city.flag} {city.city_name}</div>
                    <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'2px' }}>Avg Risk: <span style={{ color:getRiskColor(city.average_risk_score), fontWeight:'600' }}>{city.average_risk_score.toFixed(1)}</span></div>
                    <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'2px' }}>Critical Assets: <span style={{ color:'#ef4444', fontWeight:'600' }}>{city.critical_count}</span></div>
                    <div style={{ fontSize:'11px', color:'#94a3b8' }}>Model Acc: <span style={{ color:'#818cf8', fontWeight:'600' }}>{(city.federated_model_accuracy*100).toFixed(0)}%</span></div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* CITY CARDS */}
      <div>
        <h2 style={{ ...h2, fontSize:'17px', marginBottom:'14px' }}>City Infrastructure Breakdown</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
          {cities.map(city => (
            <CityCard key={city.city_id} city={city}
              selected={selected === city.city_id}
              onClick={() => setSelected(city.city_id === selected ? null : city.city_id)}/>
          ))}
        </div>
      </div>

      {/* COMPARISON CHART */}
      <div style={card}>
        <div style={{ marginBottom:'16px' }}>
          <h2 style={h2}>City Risk Comparison</h2>
          <p style={muted}>Average vs highest risk score per city</p>
        </div>
        <div style={{ display:'flex', gap:'16px', marginBottom:'12px' }}>
          {[['#6366f1','Avg Risk'],['#ef4444','Highest Risk']].map(([color,name]) => (
            <div key={name} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
              <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:color }}/>
              <span style={{ color:'#94a3b8', fontSize:'11px' }}>{name}</span>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} margin={{ top:5, right:20, left:0, bottom:5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
            <XAxis dataKey="name" stroke="#334155" tick={{ fill:'#64748b', fontSize:12 }}/>
            <YAxis stroke="#334155" tick={{ fill:'#64748b', fontSize:11 }} domain={[0,100]}/>
            <Tooltip contentStyle={{ background:'#0f172a', border:'1px solid #334155', borderRadius:'8px', color:'#f1f5f9', fontSize:'12px' }}/>
            <Bar dataKey="Avg Risk"     fill="#6366f1" radius={[4,4,0,0]}/>
            <Bar dataKey="Highest Risk" fill="#ef4444" radius={[4,4,0,0]} fillOpacity={0.8}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* NATIONAL SUMMARY */}
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1a0a2e,#0a1628)', border:'1px solid #334155', borderRadius:'12px', padding:'24px', borderTop:'3px solid #6366f1' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px' }}>
          <Cpu size={16} color="#818cf8"/>
          <h2 style={{ ...h2, margin:0 }}>National Federated Intelligence</h2>
          <span style={{ background:'rgba(99,102,241,0.15)', color:'#818cf8', border:'1px solid rgba(99,102,241,0.3)', borderRadius:'999px', padding:'1px 8px', fontSize:'10px', fontWeight:'600', marginLeft:'4px' }}>
            FL ACTIVE
          </span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
          {cities.map(city => (
            <div key={city.city_id} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid #1e293b', borderRadius:'10px', padding:'16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                <span style={{ color:'#e2e8f0', fontSize:'13px', fontWeight:'600' }}>{city.flag} {city.city_name}</span>
                <span style={{ background:'rgba(99,102,241,0.15)', color:'#818cf8', borderRadius:'999px', padding:'1px 8px', fontSize:'10px', fontWeight:'600' }}>
                  {(city.federated_model_accuracy*100).toFixed(0)}% acc
                </span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {[
                  { label:'Local Training Rounds', value:'47' },
                  { label:'Parameters Shared',     value:'0 (privacy-preserving)' },
                  { label:'Model Contribution',    value:`${(city.federated_model_accuracy*100/2.67).toFixed(0)}%` },
                ].map(row => (
                  <div key={row.label} style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={lbl}>{row.label}</span>
                    <span style={{ color:'#94a3b8', fontSize:'11px', fontWeight:'500' }}>{row.value}</span>
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