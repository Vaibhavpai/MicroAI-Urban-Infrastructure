// src/pages/RoadScan.jsx
import { useState, useRef, useCallback } from 'react'
import { ScanLine, Upload, Zap, AlertTriangle, Activity, ShieldAlert, Image as FileImage, Info } from 'lucide-react'
import './RoadScan.css'

const GROQ_MODEL   = 'meta-llama/llama-4-scout-17b-16e-instruct'
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''

// ── helpers ───────────────────────────────────────────────────────────────────
const GRADE_CFG = {
  Good:     { color: 'var(--emerald)', bar: 88, label: 'SURFACE IN GOOD CONDITION — ROUTINE MAINTENANCE' },
  Fair:     { color: 'var(--amber)', bar: 55, label: 'MODERATE WEAR — MONITOR CLOSELY' },
  Poor:     { color: 'var(--rose)', bar: 28, label: 'SIGNIFICANT DAMAGE — REPAIRS RECOMMENDED' },
  Critical: { color: '#ef4444', bar: 8,  label: 'SEVERE DETERIORATION — IMMEDIATE ACTION REQUIRED' },
}

const SEV_COLOR = {
  none: 'var(--text-dim)', low: 'var(--emerald)', medium: 'var(--amber)', high: 'var(--rose)', critical: '#ef4444'
}

const LOADING_STEPS = [
  'Initializing vision model...',
  'Extracting surface topology...',
  'Quantifying damage extent...',
  'Estimating failure horizon...',
  'Finalizing assessment report...'
]

export default function RoadScan() {
  const [imageB64,    setImageB64]    = useState(null)
  const [imageName,   setImageName]   = useState('')
  const [imageType,   setImageType]   = useState('image/jpeg')
  const [isDragging,  setIsDragging]  = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [loadingStep, setLoadingStep] = useState([])
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState(null)
  const fileRef = useRef()

  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => {
      setImageB64(e.target.result.split(',')[1])
      setImageType(file.type)
      setImageName(file.name)
      setResult(null)
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  const onDrop = useCallback(e => {
    e.preventDefault(); setIsDragging(false)
    loadFile(e.dataTransfer.files[0])
  }, [])

  const analyze = async () => {
    if (!imageB64) return
    setLoading(true); setResult(null); setError(null); setLoadingStep([])

    LOADING_STEPS.forEach((s, i) => {
      setTimeout(() => setLoadingStep(prev => [...prev, s]), i * 900)
    })

    const prompt = `You are an expert pavement and road condition analyst with 20+ years of experience. Analyze this road image thoroughly.

Return ONLY a raw JSON object — no markdown, no backticks, no explanation. Exact structure:
{
  "condition_grade": "Good" | "Fair" | "Poor" | "Critical",
  "condition_score": <integer 0-100>,
  "years_to_failure": <number>,
  "repair_urgency": <integer 1-10>,
  "surface_type": "Asphalt" | "Concrete" | "Gravel" | "Brick" | "Dirt" | "Unknown",
  "surface_subtype": "<e.g. Hot-mix asphalt>",
  "confidence": <integer 50-99>,
  "damages": [
    { "type": "Longitudinal Cracks",   "severity": "none"|"low"|"medium"|"high"|"critical" },
    { "type": "Transverse Cracks",     "severity": "none"|"low"|"medium"|"high"|"critical" },
    { "type": "Alligator Cracking",    "severity": "none"|"low"|"medium"|"high"|"critical" },
    { "type": "Potholes",              "severity": "none"|"low"|"medium"|"high"|"critical" },
    { "type": "Rutting / Deformation", "severity": "none"|"low"|"medium"|"high"|"critical" },
    { "type": "Surface Deterioration", "severity": "none"|"low"|"medium"|"high"|"critical" },
    { "type": "Edge Damage",           "severity": "none"|"low"|"medium"|"high"|"critical" },
    { "type": "Water Damage",          "severity": "none"|"low"|"medium"|"high"|"critical" }
  ],
  "maintenance_recommendation": "<2-3 sentences of specific actionable advice>"
}
Good=15-25yrs, Fair=5-15yrs, Poor=2-8yrs, Critical=0-3yrs. Be precise and realistic.`

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${imageType};base64,${imageB64}` }
              },
              { type: 'text', text: prompt }
            ]
          }]
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData?.error?.message || `Groq API error: ${res.status}`)
      }

      const data = await res.json()
      const raw  = data.choices?.[0]?.message?.content || ''
      const clean = raw.replace(/```json|```/g, '').trim()

      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No valid JSON in response')
      setResult(JSON.parse(match[0]))

    } catch (e) {
      setError('ANALYSIS FAILED: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const cfg = result ? (GRADE_CFG[result.condition_grade] || GRADE_CFG.Fair) : null

  return (
    <div className="overview-container">
      {/* HEADER */}
      <div className="overview-header">
        <div className="header-left">
          <h1 className="page-title">
            <span className="text-gradient-cyan">RoadScan Vision</span>
            <span className="title-badge"><ScanLine size={12} /> AI Assessment</span>
          </h1>
          <p className="page-subtitle">Pavement surface condition analyzer powered by Vision AI</p>
        </div>
        <div className="header-right-actions">
          {/* Removed GROQ model identifier per request */}
        </div>
      </div>

      <div className="rs-main-grid">
        {/* LEFT COL */}
        <div className="rs-left-col">
          <div className="glass-panel">
            <div className="rs-panel-header">
              <h3><FileImage size={18} className="text-cyan" /> Submit Pavement Image</h3>
            </div>
            
            <div
              className={`rs-dropzone ${isDragging ? 'dragover' : ''} ${imageB64 ? 'has-image' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => !imageB64 && fileRef.current?.click()}>
              {!imageB64 ? (
                <>
                  <Upload size={40} className="rs-drop-icon" strokeWidth={1.5} />
                  <div className="rs-drop-text">
                    Drag and drop a surface image here<br/>
                    or <span onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>browse files</span>
                  </div>
                </>
              ) : (
                <>
                  <img className="rs-preview-img"
                    src={`data:${imageType};base64,${imageB64}`}
                    alt="Road preview"/>
                  <div className="rs-img-overlay">
                    <span>{imageName}</span>
                    <span className="text-cyan" style={{ cursor:'pointer', fontWeight:600 }}
                      onClick={e => {
                        e.stopPropagation()
                        setImageB64(null); setResult(null); setError(null)
                      }}>
                      Remove
                    </span>
                  </div>
                </>
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*"
              style={{ display:'none' }}
              onChange={e => loadFile(e.target.files[0])}/>

            {error && (
              <div className="rs-error">
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}

            <button className="rs-action-btn"
              disabled={!imageB64 || loading}
              onClick={analyze}>
              {loading ? (
                <><Activity size={18} className="animate-spin" /> Analyzing Source ...</>
              ) : (
                <><Zap size={18} /> Process Image</>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT COL */}
        <div className="rs-right-col">
          {loading && (
            <div className="glass-panel rs-loading">
              <div className="rs-scan-anim">
                <div className="rs-scan-ring"/>
                <div className="rs-scan-ring"/>
                <div className="rs-scan-ring"/>
                <ScanLine size={36} className="rs-scan-icon"/>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px', alignItems:'center' }}>
                {loadingStep.map((s,i) => (
                  <div key={i} className="rs-step">{s}</div>
                ))}
              </div>
            </div>
          )}

          {!loading && !result && (
            <div className="glass-panel rs-placeholder">
              <ShieldAlert size={56} opacity={0.3} color="var(--text-dim)"/>
              <p>Awaiting visual data.<br/>Upload an image to identify structural defects.</p>
            </div>
          )}

          {!loading && result && cfg && (
            <div className="rs-results-wrapper">
              
              <div className="glass-panel rs-grade-card">
                <div className="rs-grade-val" style={{ color: cfg.color }}>
                  {result.condition_grade.toUpperCase()}
                </div>
                <div className="rs-grade-lbl" style={{ color: cfg.color }}>
                  {cfg.label}
                </div>
                
                <div className="rs-bar-container">
                  <div className="rs-bar-labels">
                    <span>CRITICAL</span>
                    <span>POOR</span>
                    <span>FAIR</span>
                    <span>GOOD</span>
                  </div>
                  <div className="rs-bar-track">
                    <div className="rs-bar-fill" style={{
                      width: `${cfg.bar}%`,
                      background: `linear-gradient(90deg, transparent, ${cfg.color})`,
                      boxShadow: `0 0 10px ${cfg.color}40`,
                    }}/>
                  </div>
                </div>
              </div>

              <div className="rs-metrics-grid">
                <div className="rs-metric-box">
                  <div className="rs-metric-title">Failure Horizon</div>
                  <div className="rs-metric-val">{result.years_to_failure}</div>
                  <div className="rs-metric-sub">Estimated Years</div>
                </div>
                <div className="rs-metric-box">
                  <div className="rs-metric-title">Repair Urgency</div>
                  <div className="rs-metric-val text-amber">
                    {result.repair_urgency}
                    <span style={{fontSize:'1rem', color:'var(--text-muted)'}}>/10</span>
                  </div>
                  <div className="rs-urgency-dots">
                    {Array.from({length:10},(_,i) => (
                      <div key={i} className={`rs-udot${i < result.repair_urgency ? ' active' : ''}`}/>
                    ))}
                  </div>
                </div>
                <div className="rs-metric-box">
                  <div className="rs-metric-title">Surface Identified</div>
                  <div className="rs-metric-val">{result.surface_type}</div>
                  <div className="rs-metric-sub">{result.surface_subtype}</div>
                </div>
                <div className="rs-metric-box">
                  <div className="rs-metric-title">AI Confidence</div>
                  <div className="rs-metric-val text-cyan">{result.confidence}%</div>
                  <div className="rs-metric-sub">Assessment Accuracy</div>
                </div>
              </div>

              <div className="glass-panel" style={{ marginBottom: '24px' }}>
                <div className="rs-panel-header" style={{ marginBottom: '16px', paddingBottom: '12px' }}>
                  <h3><Activity size={16} className="text-cyan" /> Damage Categorization</h3>
                </div>
                <div className="rs-damage-list">
                  {result.damages.map((d,i) => (
                    <div key={i} className="rs-damage-item">
                      <div className="rs-damage-name">
                        <div className="rs-damage-dot" style={{ background: SEV_COLOR[d.severity] }}/>
                        {d.type}
                      </div>
                      <span className="rs-damage-sev" style={{
                        color: SEV_COLOR[d.severity],
                        background: `${SEV_COLOR[d.severity]}15`,
                        border: `1px solid ${SEV_COLOR[d.severity]}30`
                      }}>
                        {d.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel">
                <div className="rs-panel-header" style={{ marginBottom: '16px', paddingBottom: '12px' }}>
                  <h3><Info size={16} className="text-cyan" /> Suggested Remediation</h3>
                </div>
                <div className="rs-rec-text">
                  {result.maintenance_recommendation}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}