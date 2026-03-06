import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import bridgeData from '../data/bridge_data.json'
import {
  Box, RotateCcw, ZoomIn, ZoomOut, Layers,
  Activity, AlertTriangle, Eye, Download, Play, Pause
} from 'lucide-react'

// ── risk coloring ─────────────────────────────────────────────────────────────
const getRiskColor = s => s >= 80 ? '#ef4444' : s >= 60 ? '#f97316' : s >= 40 ? '#eab308' : '#22c55e'
const getRiskHex   = s => s >= 80 ? 0xef4444  : s >= 60 ? 0xf97316  : s >= 40 ? 0xeab308  : 0x22c55e

// Assign mock stress per frame (in real app: from ML/sensor data)
const mockFrameStress = (frameId, riskScore) => {
  const seed  = (frameId * 137 + 42) % 100
  const base  = riskScore * 0.6
  return Math.min(99, base + seed * 0.4)
}

// ── style tokens ──────────────────────────────────────────────────────────────
const S = {
  page:  { minHeight:'100vh', background:'#020817', padding:'24px',
           fontFamily:'Inter, sans-serif', color:'#f1f5f9',
           display:'flex', flexDirection:'column', gap:'20px' },
  card:  { background:'#0f172a', border:'1px solid #1e293b',
           borderRadius:'12px', padding:'20px' },
  lbl:   { color:'#64748b', fontSize:'11px' },
  h2:    { fontSize:'14px', fontWeight:'600', color:'#f1f5f9', margin:'0 0 4px' },
  muted: { color:'#94a3b8', fontSize:'12px', margin:0 },
  btn:   { background:'#1e293b', border:'1px solid #334155', color:'#cbd5e1',
           borderRadius:'8px', padding:'7px 14px', fontSize:'12px',
           fontWeight:'500', cursor:'pointer',
           display:'flex', alignItems:'center', gap:'5px' },
  btnActive: { background:'#4f46e5', border:'1px solid #6366f1', color:'#fff' },
}

// ── 3D Bridge Viewer ──────────────────────────────────────────────────────────
const BridgeViewer = ({ riskScore, highlightMode, isAnimating }) => {
  const mountRef  = useRef(null)
  const sceneRef  = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const frameRef  = useRef(null)
  const isDragging= useRef(false)
  const lastMouse = useRef({ x:0, y:0 })
  const rotRef    = useRef({ x: 0.3, y: 0.5 })
  const zoomRef   = useRef(320)
  const animTimeRef = useRef(0)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const W = mount.clientWidth
    const H = mount.clientHeight

    // ── scene ──────────────────────────────────────────────────────────────
    const scene    = new THREE.Scene()
    scene.background= new THREE.Color(0x020817)
    scene.fog       = new THREE.Fog(0x020817, 400, 900)
    sceneRef.current= scene

    // ── camera ─────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000)
    camera.position.set(168, 80, zoomRef.current)
    camera.lookAt(168, 20, 0)
    cameraRef.current = camera

    // ── renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias:true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // ── lights ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(200, 300, 200)
    dirLight.castShadow = true
    scene.add(dirLight)
    const dirLight2 = new THREE.DirectionalLight(0x4466ff, 0.3)
    dirLight2.position.set(-200, 100, -100)
    scene.add(dirLight2)

    // ── grid ───────────────────────────────────────────────────────────────
    const grid = new THREE.GridHelper(600, 30, 0x1e293b, 0x1e293b)
    grid.position.set(168, -2, 0)
    scene.add(grid)

    // ── joint map ──────────────────────────────────────────────────────────
    const jointMap = {}
    bridgeData.joints.forEach(j => {
      jointMap[j.id] = new THREE.Vector3(j.x, j.z, j.y)
    })

    // ── support markers ────────────────────────────────────────────────────
    bridgeData.supports.forEach(sid => {
      const pos = jointMap[sid]
      if (!pos) return
      const geo  = new THREE.CylinderGeometry(3, 5, 8, 8)
      const mat  = new THREE.MeshStandardMaterial({ color:0x6366f1, roughness:0.3 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(pos.x, pos.y - 4, pos.z)
      scene.add(mesh)
    })

    // ── joint spheres ──────────────────────────────────────────────────────
    bridgeData.joints.forEach(j => {
      const pos     = jointMap[j.id]
      const isSupport = bridgeData.supports.includes(j.id)
      const geo     = new THREE.SphereGeometry(isSupport ? 3.5 : 2, 10, 10)
      const color   = isSupport ? 0x6366f1 : 0x94a3b8
      const mat     = new THREE.MeshStandardMaterial({
        color, roughness:0.4, metalness:0.6
      })
      const mesh    = new THREE.Mesh(geo, mat)
      mesh.position.copy(pos)
      mesh.userData  = { type:'joint', id:j.id, isSupport }
      scene.add(mesh)
    })

    // ── frame members (beams) ──────────────────────────────────────────────
    bridgeData.frames.forEach(f => {
      const pI = jointMap[f.i]
      const pJ = jointMap[f.j]
      if (!pI || !pJ) return

      const stress = mockFrameStress(f.id, riskScore)
      const color  = highlightMode === 'stress'
        ? getRiskHex(stress)
        : highlightMode === 'uniform'
          ? 0x6366f1
          : 0x334155

      const dir    = new THREE.Vector3().subVectors(pJ, pI)
      const length = dir.length()
      const mid    = new THREE.Vector3().addVectors(pI, pJ).multiplyScalar(0.5)

      const geo    = new THREE.CylinderGeometry(0.9, 0.9, length, 6)
      const mat    = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.7,
        emissive:  highlightMode === 'stress' && stress > 70
          ? new THREE.Color(getRiskHex(stress)) : new THREE.Color(0x000000),
        emissiveIntensity: stress > 70 ? 0.15 : 0,
      })
      const mesh   = new THREE.Mesh(geo, mat)
      mesh.position.copy(mid)

      // orient cylinder along direction
      const axis   = new THREE.Vector3(0, 1, 0)
      const normDir= dir.clone().normalize()
      const quat   = new THREE.Quaternion().setFromUnitVectors(axis, normDir)
      mesh.setRotationFromQuaternion(quat)
      mesh.userData= { type:'frame', id:f.id, stress }
      mesh.castShadow = true
      scene.add(mesh)
    })

    // ── deck panels (area elements) ────────────────────────────────────────
    bridgeData.areas.forEach(a => {
      const pts = [a.j1, a.j2, a.j3, a.j4].map(id => jointMap[id]).filter(Boolean)
      if (pts.length < 4) return
      const geo  = new THREE.BufferGeometry()
      const verts= new Float32Array([
        ...pts[0].toArray(), ...pts[1].toArray(), ...pts[2].toArray(),
        ...pts[0].toArray(), ...pts[2].toArray(), ...pts[3].toArray(),
      ])
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
      geo.computeVertexNormals()
      const mat  = new THREE.MeshStandardMaterial({
        color: 0x1e293b, side: THREE.DoubleSide,
        transparent:true, opacity:0.6, roughness:0.8
      })
      const mesh = new THREE.Mesh(geo, mat)
      scene.add(mesh)
    })

    // ── animate ────────────────────────────────────────────────────────────
    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      animTimeRef.current += 0.01

      // auto-rotate if animating
      if (isAnimating) {
        rotRef.current.y += 0.003
      }

      // vibration effect based on risk
      if (riskScore > 60) {
        const amp = (riskScore - 60) / 40 * 0.15
        scene.position.y = Math.sin(animTimeRef.current * 8) * amp
      }

      // camera orbit
      const r   = zoomRef.current
      const rx  = rotRef.current.x
      const ry  = rotRef.current.y
      camera.position.x = 168 + r * Math.sin(ry) * Math.cos(rx)
      camera.position.y = 20  + r * Math.sin(rx)
      camera.position.z = r   * Math.cos(ry) * Math.cos(rx)
      camera.lookAt(168, 20, 0)

      renderer.render(scene, camera)
    }
    animate()
    frameRef.current = () => cancelAnimationFrame(animId)

    // ── mouse controls ─────────────────────────────────────────────────────
    const onMouseDown = e => {
      isDragging.current = true
      lastMouse.current  = { x:e.clientX, y:e.clientY }
    }
    const onMouseMove = e => {
      if (!isDragging.current) return
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      rotRef.current.y += dx * 0.005
      rotRef.current.x  = Math.max(-1.2, Math.min(1.2,
        rotRef.current.x - dy * 0.005))
      lastMouse.current = { x:e.clientX, y:e.clientY }
    }
    const onMouseUp  = () => { isDragging.current = false }
    const onWheel    = e => {
      zoomRef.current = Math.max(80, Math.min(600,
        zoomRef.current + e.deltaY * 0.3))
    }

    mount.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    mount.addEventListener('wheel', onWheel, { passive:true })

    // ── resize ─────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      frameRef.current?.()
      mount.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
      mount.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [riskScore, highlightMode, isAnimating])

  return (
    <div ref={mountRef} style={{ width:'100%', height:'100%',
      cursor:'grab', borderRadius:'10px', overflow:'hidden' }}/>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function BridgeCAD() {
  const [riskScore,     setRiskScore]     = useState(67)
  const [highlightMode, setHighlightMode] = useState('stress')
  const [isAnimating,   setIsAnimating]   = useState(true)
  const [selectedAsset, setSelectedAsset] = useState('BRIDGE_001')
  const [showStats,     setShowStats]     = useState(true)

  const ASSETS = ['BRIDGE_001', 'BRIDGE_002']

  // Mock per-asset risk (in real app: fetch from /predict/{id})
  const ASSET_RISK = { BRIDGE_001: 67, BRIDGE_002: 42 }
  const currentRisk = ASSET_RISK[selectedAsset] ?? riskScore

  const riskColor = getRiskColor(currentRisk)
  const totalJoints = bridgeData.joints.length
  const totalFrames = bridgeData.frames.length
  const totalAreas  = bridgeData.areas.length
  const criticalMembers = bridgeData.frames
    .filter(f => mockFrameStress(f.id, currentRisk) >= 80).length
  const highMembers     = bridgeData.frames
    .filter(f => {
      const s = mockFrameStress(f.id, currentRisk)
      return s >= 60 && s < 80
    }).length

  // stress distribution for chart-like display
  const stressGroups = {
    critical: criticalMembers,
    high:     highMembers,
    medium:   bridgeData.frames.filter(f => {
      const s = mockFrameStress(f.id, currentRisk)
      return s >= 40 && s < 60
    }).length,
    low: bridgeData.frames.filter(f => mockFrameStress(f.id, currentRisk) < 40).length,
  }

  return (
    <div style={S.page}>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'flex-start', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <p style={{ ...S.lbl, marginBottom:'4px' }}>InfraWatch / CAD Viewer</p>
          <h1 style={{ fontSize:'24px', fontWeight:'700', color:'#f1f5f9',
            margin:'0 0 4px', display:'flex', alignItems:'center', gap:'10px' }}>
            <Box size={22} color="#818cf8"/>
            Bridge Structural CAD
          </h1>
          <p style={S.muted}>
            3D finite-element model · {totalJoints} joints · {totalFrames} members ·{' '}
            {totalAreas} deck panels
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
          {/* asset selector */}
          <select value={selectedAsset}
            onChange={e => setSelectedAsset(e.target.value)}
            style={{ background:'#1e293b', border:'1px solid #334155',
              color:'#f1f5f9', borderRadius:'8px', padding:'7px 28px 7px 12px',
              fontSize:'12px', cursor:'pointer', outline:'none',
              appearance:'none',
              backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
            {ASSETS.map(id => (
              <option key={id} value={id}
                style={{ background:'#1e293b' }}>
                🌉 {id}
              </option>
            ))}
          </select>

          {/* risk score override */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px',
            background:'#1e293b', border:'1px solid #334155',
            borderRadius:'8px', padding:'6px 12px' }}>
            <span style={S.lbl}>Risk Override:</span>
            <input type="range" min="0" max="99" value={riskScore}
              onChange={e => setRiskScore(parseInt(e.target.value))}
              style={{ width:'80px', accentColor:'#6366f1', cursor:'pointer' }}/>
            <span style={{ color:riskColor, fontSize:'12px',
              fontWeight:'700', minWidth:'28px' }}>{riskScore}</span>
          </div>

          <button onClick={() => setIsAnimating(p => !p)}
            style={{ ...S.btn, ...(isAnimating ? S.btnActive : {}) }}>
            {isAnimating ? <Pause size={13}/> : <Play size={13}/>}
            {isAnimating ? 'Pause' : 'Rotate'}
          </button>

          <button onClick={() => setShowStats(p => !p)} style={S.btn}>
            <Eye size={13}/> Stats
          </button>
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ display:'grid',
        gridTemplateColumns: showStats ? '1fr 280px' : '1fr',
        gap:'16px', alignItems:'start' }}>

        {/* ── 3D VIEWER ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

          {/* viewer controls bar */}
          <div style={{ ...S.card, padding:'12px 16px',
            display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
            <span style={S.lbl}>Highlight Mode:</span>
            {[
              { key:'stress',  label:'⚠ Stress Map' },
              { key:'uniform', label:'◆ Uniform' },
              { key:'dark',    label:'◼ Wireframe' },
            ].map(m => (
              <button key={m.key}
                onClick={() => setHighlightMode(m.key)}
                style={{ ...S.btn,
                  ...(highlightMode===m.key ? S.btnActive : {}),
                  padding:'5px 12px', fontSize:'11px' }}>
                {m.label}
              </button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex',
              alignItems:'center', gap:'12px' }}>
              {[
                { color:'#22c55e', label:'Low (<40)' },
                { color:'#eab308', label:'Medium (40-60)' },
                { color:'#f97316', label:'High (60-80)' },
                { color:'#ef4444', label:'Critical (>80)' },
              ].map(item => (
                <div key={item.label} style={{ display:'flex',
                  alignItems:'center', gap:'4px' }}>
                  <div style={{ width:'8px', height:'8px', borderRadius:'2px',
                    background:item.color }}/>
                  <span style={{ color:'#64748b', fontSize:'10px' }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* THREE.js canvas */}
          <div style={{ ...S.card, padding:0, height:'520px',
            overflow:'hidden', position:'relative',
            border:`1px solid ${riskColor}30` }}>
            <BridgeViewer
              riskScore={currentRisk}
              highlightMode={highlightMode}
              isAnimating={isAnimating}
            />
            {/* overlay badges */}
            <div style={{ position:'absolute', top:12, left:12,
              display:'flex', flexDirection:'column', gap:'6px',
              pointerEvents:'none' }}>
              <div style={{ background:'rgba(2,8,23,0.85)',
                border:`1px solid ${riskColor}50`, borderRadius:'8px',
                padding:'6px 12px', backdropFilter:'blur(8px)' }}>
                <div style={S.lbl}>Overall Risk</div>
                <div style={{ color:riskColor, fontSize:'22px',
                  fontWeight:'800', lineHeight:1 }}>
                  {currentRisk}
                </div>
              </div>
              {criticalMembers > 0 && (
                <div style={{ background:'rgba(239,68,68,0.15)',
                  border:'1px solid rgba(239,68,68,0.4)', borderRadius:'8px',
                  padding:'6px 12px', backdropFilter:'blur(8px)',
                  display:'flex', alignItems:'center', gap:'6px' }}>
                  <AlertTriangle size={12} color="#ef4444"/>
                  <span style={{ color:'#fca5a5', fontSize:'11px',
                    fontWeight:'600' }}>
                    {criticalMembers} critical members
                  </span>
                </div>
              )}
            </div>
            {/* interaction hint */}
            <div style={{ position:'absolute', bottom:12, right:12,
              color:'#334155', fontSize:'10px', pointerEvents:'none',
              textAlign:'right' }}>
              Drag to rotate · Scroll to zoom
            </div>
          </div>
        </div>

        {/* ── STATS PANEL ── */}
        {showStats && (
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

            {/* structural summary */}
            <div style={S.card}>
              <h2 style={S.h2}>Structural Summary</h2>
              <p style={{ ...S.muted, marginBottom:'14px' }}>
                {selectedAsset} · FEM Model
              </p>
              {[
                { label:'Total Joints',    value:totalJoints, color:'#818cf8' },
                { label:'Frame Members',   value:totalFrames, color:'#06b6d4' },
                { label:'Deck Panels',     value:totalAreas,  color:'#94a3b8' },
                { label:'Support Points',  value:bridgeData.supports.length, color:'#22c55e' },
                { label:'Span Length',     value:'336 m',     color:'#94a3b8' },
                { label:'Deck Width',      value:'28 m',      color:'#94a3b8' },
              ].map(item => (
                <div key={item.label} style={{ display:'flex',
                  justifyContent:'space-between', alignItems:'center',
                  padding:'7px 0', borderBottom:'1px solid #1e293b' }}>
                  <span style={S.lbl}>{item.label}</span>
                  <span style={{ color:item.color, fontSize:'13px',
                    fontWeight:'600' }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* member stress distribution */}
            <div style={S.card}>
              <h2 style={{ ...S.h2, marginBottom:'12px' }}>
                Member Stress Distribution
              </h2>
              {Object.entries(stressGroups).map(([level, count]) => {
                const colors = {
                  critical:'#ef4444', high:'#f97316',
                  medium:'#eab308',   low:'#22c55e'
                }
                const pct = Math.round((count / totalFrames) * 100)
                return (
                  <div key={level} style={{ marginBottom:'10px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between',
                      marginBottom:'4px' }}>
                      <span style={{ color:colors[level], fontSize:'11px',
                        fontWeight:'600', textTransform:'capitalize' }}>
                        {level}
                      </span>
                      <span style={{ color:'#94a3b8', fontSize:'11px',
                        fontFamily:'monospace' }}>
                        {count} / {totalFrames} ({pct}%)
                      </span>
                    </div>
                    <div style={{ background:'#1e293b', borderRadius:'999px',
                      height:'5px', overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%',
                        background:colors[level], borderRadius:'999px',
                        transition:'width 0.5s ease' }}/>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* top stressed members */}
            <div style={S.card}>
              <h2 style={{ ...S.h2, marginBottom:'12px' }}>
                Top Stressed Members
              </h2>
              {bridgeData.frames
                .map(f => ({ ...f, stress: mockFrameStress(f.id, currentRisk) }))
                .sort((a,b) => b.stress - a.stress)
                .slice(0,6)
                .map(f => {
                  const c = getRiskColor(f.stress)
                  return (
                    <div key={f.id} style={{ display:'flex',
                      alignItems:'center', gap:'8px', marginBottom:'8px',
                      background:'#1e293b', borderRadius:'6px',
                      padding:'7px 10px',
                      borderLeft:`3px solid ${c}` }}>
                      <div style={{ flex:1 }}>
                        <div style={{ color:'#e2e8f0', fontSize:'11px',
                          fontWeight:'500' }}>
                          Member #{f.id}
                        </div>
                        <div style={{ color:'#475569', fontSize:'10px' }}>
                          J{f.i} → J{f.j}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ color:c, fontSize:'13px',
                          fontWeight:'700' }}>
                          {f.stress.toFixed(1)}
                        </div>
                        <div style={{ color:'#475569', fontSize:'9px' }}>
                          stress
                        </div>
                      </div>
                    </div>
                  )
                })
              }
            </div>

            {/* support conditions */}
            <div style={S.card}>
              <h2 style={{ ...S.h2, marginBottom:'12px' }}>
                Support Conditions
              </h2>
              {bridgeData.supports.map(sid => {
                const j = bridgeData.joints.find(jt => jt.id === sid)
                return (
                  <div key={sid} style={{ display:'flex',
                    justifyContent:'space-between', alignItems:'center',
                    padding:'6px 0', borderBottom:'1px solid #1e293b' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%',
                        background:'#6366f1' }}/>
                      <span style={{ color:'#e2e8f0', fontSize:'11px' }}>
                        Joint {sid}
                      </span>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ color:'#94a3b8', fontSize:'10px',
                        fontFamily:'monospace' }}>
                        ({j?.x ?? 0}, {j?.z ?? 0})
                      </div>
                      <div style={{ color:'#22c55e', fontSize:'9px',
                        fontWeight:'600' }}>
                        FIXED
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── SENSOR + RISK TIMELINE ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

        {/* joint coordinate table */}
        <div style={S.card}>
          <h2 style={{ ...S.h2, marginBottom:'12px' }}>
            Critical Joint Coordinates
          </h2>
          <div style={{ overflowY:'auto', maxHeight:'220px' }}>
            <table style={{ width:'100%', borderCollapse:'collapse',
              fontSize:'11px' }}>
              <thead>
                <tr>
                  {['Joint','X (m)','Y (m)','Z (m)','Status'].map(h => (
                    <th key={h} style={{ padding:'6px 8px', textAlign:'left',
                      color:'#475569', fontSize:'10px', fontWeight:'600',
                      textTransform:'uppercase', letterSpacing:'0.04em',
                      borderBottom:'1px solid #1e293b', position:'sticky',
                      top:0, background:'#0f172a' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bridgeData.joints.map((j,i) => {
                  const isSupport = bridgeData.supports.includes(j.id)
                  return (
                    <tr key={j.id} style={{ background: i%2===0
                      ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <td style={{ padding:'5px 8px', color:
                        isSupport ? '#818cf8' : '#e2e8f0',
                        fontWeight: isSupport ? '600' : '400' }}>
                        {j.id}
                      </td>
                      <td style={{ padding:'5px 8px', color:'#94a3b8',
                        fontFamily:'monospace' }}>{j.x}</td>
                      <td style={{ padding:'5px 8px', color:'#94a3b8',
                        fontFamily:'monospace' }}>{j.y}</td>
                      <td style={{ padding:'5px 8px', color:'#94a3b8',
                        fontFamily:'monospace' }}>{j.z}</td>
                      <td style={{ padding:'5px 8px' }}>
                        {isSupport
                          ? <span style={{ background:'rgba(99,102,241,0.15)',
                              color:'#818cf8', borderRadius:'999px',
                              padding:'1px 6px', fontSize:'9px',
                              fontWeight:'700' }}>SUPPORT</span>
                          : <span style={{ color:'#334155', fontSize:'9px' }}>
                              free
                            </span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* frame member table */}
        <div style={S.card}>
          <h2 style={{ ...S.h2, marginBottom:'12px' }}>
            Frame Member Stress Analysis
          </h2>
          <div style={{ overflowY:'auto', maxHeight:'220px' }}>
            <table style={{ width:'100%', borderCollapse:'collapse',
              fontSize:'11px' }}>
              <thead>
                <tr>
                  {['ID','From','To','Stress','Level'].map(h => (
                    <th key={h} style={{ padding:'6px 8px', textAlign:'left',
                      color:'#475569', fontSize:'10px', fontWeight:'600',
                      textTransform:'uppercase', letterSpacing:'0.04em',
                      borderBottom:'1px solid #1e293b', position:'sticky',
                      top:0, background:'#0f172a' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bridgeData.frames
                  .map(f => ({
                    ...f, stress: mockFrameStress(f.id, currentRisk)
                  }))
                  .sort((a,b) => b.stress - a.stress)
                  .map((f, i) => {
                    const c = getRiskColor(f.stress)
                    return (
                      <tr key={f.id} style={{ background: i%2===0
                        ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <td style={{ padding:'5px 8px', color:'#94a3b8',
                          fontFamily:'monospace' }}>#{f.id}</td>
                        <td style={{ padding:'5px 8px', color:'#64748b',
                          fontFamily:'monospace' }}>J{f.i}</td>
                        <td style={{ padding:'5px 8px', color:'#64748b',
                          fontFamily:'monospace' }}>J{f.j}</td>
                        <td style={{ padding:'5px 8px' }}>
                          <div style={{ display:'flex', alignItems:'center',
                            gap:'6px' }}>
                            <div style={{ width:'40px', background:'#1e293b',
                              borderRadius:'999px', height:'3px' }}>
                              <div style={{ width:`${f.stress}%`, height:'100%',
                                background:c, borderRadius:'999px' }}/>
                            </div>
                            <span style={{ color:c, fontFamily:'monospace',
                              fontWeight:'600' }}>
                              {f.stress.toFixed(0)}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding:'5px 8px' }}>
                          <span style={{ background:c+'20', color:c,
                            borderRadius:'999px', padding:'1px 6px',
                            fontSize:'9px', fontWeight:'700' }}>
                            {f.stress >= 80 ? 'CRIT'
                              : f.stress >= 60 ? 'HIGH'
                              : f.stress >= 40 ? 'MED' : 'LOW'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}