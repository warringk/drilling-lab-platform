/**
 * RigStateTest.jsx — Rig State QC Viewer
 *
 * Stacked Plotly panels with shared x-axis (operational days):
 *   - Configurable channel panels (toggle on/off via header buttons)
 *   - Micro State color strip
 *   - Op Mode color strip
 *   - Dynamic resolution: zooming in re-fetches traces at finer resolution
 *
 * Uses /api/rig-state/ endpoints (segments + traces from silver.edr_1s).
 *
 * CLI equivalent (generates static Plotly HTML on legionraw):
 *   python3 ~/drilling_lab/scripts/viz_micro_state.py --licence 0515925
 *   python3 ~/drilling_lab/scripts/viz_micro_state_layers.py --licence 0515925
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Plot from 'react-plotly.js'

const API_BASE = import.meta.env.VITE_API_URL || ''
const ALL_CHANNELS_STR = 'bit_depth,hole_depth,block_height,hook_load,weight_on_bit,rotary_rpm,rotary_torque,standpipe_pressure,flow_in,flow_out,rate_of_penetration'

/* ── Channel definitions ─────────────────────────────────────────── *
 * Each channel gets its own panel/y-axis so scales don't collide.
 * Channels that share the same unit can share a panel (bit_depth + hole_depth).
 */
const CHANNELS = [
  { id: 'bit_depth',            label: 'Bit Depth',    unit: 'm',      panel: 'depth',    color: '#e74c3c' },
  { id: 'hole_depth',           label: 'Hole Depth',   unit: 'm',      panel: 'depth',    color: '#3498db' },
  { id: 'block_height',         label: 'Block Ht',     unit: 'm',      panel: 'blockht',  color: '#f1c40f' },
  { id: 'hook_load',            label: 'Hook Load',    unit: 'kdaN',   panel: 'hkld',     color: '#e67e22' },
  { id: 'weight_on_bit',        label: 'WOB',          unit: 'kdaN',   panel: 'wob',      color: '#2ecc71' },
  { id: 'rotary_rpm',           label: 'RPM',          unit: 'rpm',    panel: 'rpm',      color: '#3498db' },
  { id: 'rotary_torque',        label: 'Torque',       unit: 'kN·m',   panel: 'torque',   color: '#e74c3c' },
  { id: 'standpipe_pressure',   label: 'SPP',          unit: 'kPa',    panel: 'spp',      color: '#e74c3c' },
  { id: 'flow_in',              label: 'Flow In',      unit: 'm³/min', panel: 'flowin',   color: '#2ecc71' },
  { id: 'flow_out',             label: 'Flow Out',     unit: '%',      panel: 'flowout',  color: '#f39c12' },
  { id: 'rate_of_penetration',  label: 'ROP',          unit: 'm/hr',   panel: 'rop',      color: '#9b59b6' },
]

const PANEL_META = {
  depth:   { label: 'Depth',     inverted: true },
  blockht: { label: 'Block Ht' },
  hkld:    { label: 'Hook Load' },
  wob:     { label: 'WOB' },
  rpm:     { label: 'RPM' },
  torque:  { label: 'Torque' },
  spp:     { label: 'SPP' },
  flowin:  { label: 'Flow In' },
  flowout: { label: 'Flow Out' },
  rop:     { label: 'ROP' },
}

// Ordered panel list (controls top-to-bottom stacking)
const PANEL_ORDER = ['depth', 'blockht', 'hkld', 'wob', 'rpm', 'torque', 'spp', 'flowin', 'flowout', 'rop']

/* ── Presets ──────────────────────────────────────────────────────── */
const PRESETS = {
  drilling: {
    label: 'Drilling',
    channels: ['bit_depth', 'hole_depth', 'hook_load', 'weight_on_bit', 'rotary_rpm', 'standpipe_pressure', 'rate_of_penetration'],
  },
  tripping: {
    label: 'Tripping',
    channels: ['bit_depth', 'hole_depth', 'block_height', 'hook_load', 'rotary_rpm', 'rotary_torque', 'standpipe_pressure', 'flow_in'],
  },
  all: {
    label: 'All',
    channels: CHANNELS.map(c => c.id),
  },
}

const MODE_COLORS = {
  DRILLING: '#2ecc71', TRIPPING_IN: '#c0392b', TRIPPING_OUT: '#e74c3c',
  CIRCULATING: '#3498db', CONNECTION: '#f39c12', REAMING: '#9b59b6',
  CASING_RUN: '#ec4899', CEMENTING: '#f43f5e', WIPER_TRIP: '#14b8a6',
  OTHER: '#64748b', STATIONARY_ON_BOTTOM: '#95a5a6', BHA_HANDLING: '#f1c40f',
  IN_SLIPS: '#95a5a6', DATA_GAP: '#2c3e50', UNKNOWN: '#ecf0f1',
}

/* ── Helper: map op_days range to timestamps using trace data ───── */
function opDaysToTimestamps(pts, minDay, maxDay) {
  let startTs = null, endTs = null
  for (const p of pts) {
    if (p.op_days == null) continue
    if (p.op_days >= minDay && !startTs) startTs = p.ts
    if (p.op_days <= maxDay) endTs = p.ts
  }
  return { startTs, endTs }
}

export default function RigStateTest() {
  const navigate = useNavigate()
  const [wells, setWells] = useState([])
  const [selectedLicence, setSelectedLicence] = useState('')
  const [loading, setLoading] = useState(false)
  const [refining, setRefining] = useState(false)
  const [traceData, setTraceData] = useState(null)      // currently displayed traces
  const [fullTraceData, setFullTraceData] = useState(null) // full-well coarse (for reset)
  const [modeData, setModeData] = useState(null)
  const [wellDetail, setWellDetail] = useState(null)
  const [info, setInfo] = useState('')
  const [xRange, setXRange] = useState(null)             // [min, max] op_days when zoomed
  const [activePreset, setActivePreset] = useState('drilling')
  const [channelState, setChannelState] = useState(() =>
    Object.fromEntries(CHANNELS.map(c => [c.id, PRESETS.drilling.channels.includes(c.id)]))
  )

  // Refs for zoom handler (avoid stale closures + prevent relayout loops)
  const fullTraceRef = useRef(null)
  const selectedLicenceRef = useRef('')
  const zoomTimerRef = useRef(null)
  const dataUpdateRef = useRef(false)

  useEffect(() => { fullTraceRef.current = fullTraceData }, [fullTraceData])
  useEffect(() => { selectedLicenceRef.current = selectedLicence }, [selectedLicence])

  const toggleChannel = useCallback((id) => {
    setChannelState(prev => ({ ...prev, [id]: !prev[id] }))
    setActivePreset(null) // clear preset highlight when manually toggling
  }, [])

  const applyPreset = useCallback((presetKey) => {
    const preset = PRESETS[presetKey]
    if (!preset) return
    setActivePreset(presetKey)
    setChannelState(Object.fromEntries(CHANNELS.map(c => [c.id, preset.channels.includes(c.id)])))
  }, [])

  // Fetch wells
  useEffect(() => {
    fetch(`${API_BASE}/api/rig-state/wells`)
      .then(r => r.json())
      .then(data => {
        const w = data.wells || []
        setWells(w)
        if (w.length > 0) setSelectedLicence(w[0].licence)
      })
      .catch(err => console.error('Failed to fetch wells:', err))
  }, [])

  // Fetch traces + segments when well changes
  useEffect(() => {
    if (!selectedLicence) return
    const well = wells.find(w => w.licence === selectedLicence)
    if (!well) return

    setLoading(true)
    setTraceData(null)
    setFullTraceData(null)
    setModeData(null)
    setWellDetail(null)
    setXRange(null)

    // Fetch well detail (drilling_phases, spud_date, etc.)
    fetch(`${API_BASE}/api/wells/${selectedLicence}`)
      .then(r => r.json())
      .then(d => setWellDetail(d.well || null))
      .catch(() => {})

    const start = well.minTs
    const end = well.maxTs

    // Compute resolution to target ~10000 points for full well
    const spanSec = (new Date(end) - new Date(start)) / 1000
    const resolution = Math.max(30, Math.ceil(spanSec / 10000))

    Promise.all([
      fetch(`${API_BASE}/api/rig-state/traces/${selectedLicence}?start=${start}&end=${end}&channels=${ALL_CHANNELS_STR}&resolution=${resolution}`)
        .then(r => r.json()),
      fetch(`${API_BASE}/api/rig-state/segments/${selectedLicence}?layer=op_mode&max_segments=20000`)
        .then(r => r.json()),
    ]).then(([traces, modes]) => {
      setTraceData(traces)
      setFullTraceData(traces)
      fullTraceRef.current = traces
      setModeData(modes)
      setInfo(`${traces.count?.toLocaleString()} pts @ ${traces.resolution}s, ${modes.segmentCount?.toLocaleString()} ops`)
    }).catch(err => {
      console.error('Failed to load data:', err)
      setInfo('Error loading data')
    }).finally(() => setLoading(false))
  }, [selectedLicence, wells])

  // Zoom handler: re-fetch traces at higher resolution for visible range
  const handleRelayout = useCallback((e) => {
    // Skip relayout events triggered by our own data updates
    if (dataUpdateRef.current) {
      dataUpdateRef.current = false
      return
    }

    // Detect autorange reset (double-click to reset zoom)
    if (e['xaxis.autorange']) {
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
      setXRange(null)
      const full = fullTraceRef.current
      if (full) {
        setTraceData(full)
        setInfo(prev => prev.replace(/ *@.*?(?=,)/, ` @ ${full.resolution}s`))
      }
      return
    }

    const r0 = e['xaxis.range[0]'] ?? e['xaxis.range']?.[0]
    const r1 = e['xaxis.range[1]'] ?? e['xaxis.range']?.[1]
    if (r0 == null || r1 == null) return

    const minDay = parseFloat(r0)
    const maxDay = parseFloat(r1)
    if (isNaN(minDay) || isNaN(maxDay)) return

    // Lock the x-axis range immediately so Plotly doesn't auto-range on data update
    setXRange([minDay, maxDay])

    // Debounce re-fetch 500ms
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
    zoomTimerRef.current = setTimeout(() => {
      const full = fullTraceRef.current
      if (!full?.data?.length) return

      // Map visible op_days range to timestamps
      const { startTs, endTs } = opDaysToTimestamps(full.data, minDay, maxDay)
      if (!startTs || !endTs) return

      const spanSec = (new Date(endTs) - new Date(startTs)) / 1000
      const newRes = Math.max(5, Math.ceil(spanSec / 8000))

      // Only re-fetch if meaningfully finer than current resolution
      if (newRes >= full.resolution * 0.7) return

      setRefining(true)
      fetch(`${API_BASE}/api/rig-state/traces/${selectedLicenceRef.current}?start=${startTs}&end=${endTs}&channels=${ALL_CHANNELS_STR}&resolution=${newRes}`)
        .then(r => r.json())
        .then(data => {
          // Flag to suppress the relayout Plotly will fire when data changes
          dataUpdateRef.current = true
          setTraceData(data)
          setInfo(prev => prev.replace(/[\d,]+ pts *@.*?(?=,)/, `${data.count?.toLocaleString()} pts @ ${data.resolution}s (zoom)`))
        })
        .catch(() => {})
        .finally(() => setRefining(false))
    }, 500)
  }, [])

  // Build Plotly data + layout
  const { plotData, plotLayout } = useMemo(() => {
    if (!traceData?.data || !modeData?.segments) {
      return { plotData: [], plotLayout: {} }
    }

    const pts = traceData.data
    const xVals = pts.map(p => p.op_days)

    // Collect active panels (only panels that have at least one visible channel)
    const activePanelSet = new Set()
    CHANNELS.forEach(ch => {
      if (channelState[ch.id]) activePanelSet.add(ch.panel)
    })
    // Keep them in the defined stacking order
    const panelList = PANEL_ORDER.filter(pid => activePanelSet.has(pid))

    // Reserve space for operation strip at bottom
    const stripHeight = 0.04
    const stripGap = 0.008
    const stripTotal = stripHeight + 2 * stripGap
    const chartTop = 1.0
    const chartBottom = stripTotal
    const availableHeight = chartTop - chartBottom

    // Allocate equal domain to each active panel
    const panelGap = 0.015
    const totalGaps = Math.max(0, panelList.length - 1) * panelGap
    const panelHeight = panelList.length > 0 ? (availableHeight - totalGaps) / panelList.length : 0

    // Map panel id -> y-axis domain and axis name
    const panelDomains = {}
    const panelAxis = {}
    panelList.forEach((pid, i) => {
      const top = chartTop - i * (panelHeight + panelGap)
      panelDomains[pid] = [top - panelHeight, top]
      panelAxis[pid] = i === 0 ? 'y' : `y${i + 1}`
    })

    // Channel traces — each channel on its panel's y-axis
    const data = []
    CHANNELS.forEach(ch => {
      if (!channelState[ch.id]) return
      const axis = panelAxis[ch.panel]
      if (!axis) return
      data.push({
        x: xVals,
        y: pts.map(p => p[ch.id]),
        name: ch.label,
        type: 'scattergl', mode: 'lines',
        line: { color: ch.color, width: 1 },
        yaxis: axis, xaxis: 'x',
        hovertemplate: `%{y:.1f} ${ch.unit}<extra>${ch.label}</extra>`,
      })
    })

    // Operation strip — continuous colored bar at bottom via layout shapes
    const opShapes = []
    for (const seg of modeData.segments) {
      if (seg.startOpDays == null || seg.endOpDays == null) continue
      opShapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: seg.startOpDays,
        x1: Math.max(seg.endOpDays, seg.startOpDays + 0.002),
        y0: stripGap,
        y1: stripGap + stripHeight,
        fillcolor: MODE_COLORS[seg.state] || '#555',
        line: { width: 0 },
        layer: 'below',
      })
    }

    // Dense hover trace for op strip — one point per xVal so tooltip always shows
    const opAxisIdx = panelList.length + 1
    const opAxisName = opAxisIdx === 1 ? 'y' : `y${opAxisIdx}`
    const opSegs = modeData.segments.filter(s => s.startOpDays != null && s.endOpDays != null)
    // Walk sorted segments and xVals together (both sorted by op_days) — O(n+m)
    const opLabels = []
    let si = 0
    for (let i = 0; i < xVals.length; i++) {
      const d = xVals[i]
      if (d == null) { opLabels.push(null); continue }
      while (si < opSegs.length && opSegs[si].endOpDays < d) si++
      if (si < opSegs.length && d >= opSegs[si].startOpDays && d <= opSegs[si].endOpDays) {
        opLabels.push(opSegs[si].state)
      } else {
        opLabels.push(null)
      }
    }
    data.push({
      x: xVals,
      y: xVals.map(() => 0.5),
      name: 'Operation',
      type: 'scatter', mode: 'markers',
      marker: { size: 1, opacity: 0 },
      text: opLabels,
      hovertemplate: '%{text}<extra>Operation</extra>',
      yaxis: opAxisName, xaxis: 'x', showlegend: false,
    })

    // Layout
    const layout = {
      autosize: true,
      paper_bgcolor: '#1a1a2e',
      plot_bgcolor: '#16213e',
      font: { color: '#eee', size: 10 },
      showlegend: false,
      hovermode: 'x',
      hoverdistance: 50,
      xaxis: {
        title: 'Operational Days',
        rangeslider: { visible: true, thickness: 0.04 },
        gridcolor: '#2c3e50',
        showspikes: true,
        spikemode: 'across',
        spikesnap: 'cursor',
        spikethickness: 1,
        spikecolor: 'rgba(255,255,255,0.4)',
        spikedash: 'solid',
        ...(xRange ? { range: xRange, autorange: false } : {}),
      },
      margin: { l: 55, r: 10, t: 10, b: 30 },
    }

    // Panel y-axes — each gets its own scale
    panelList.forEach((pid, i) => {
      const key = i === 0 ? 'yaxis' : `yaxis${i + 1}`
      const meta = PANEL_META[pid] || {}
      layout[key] = {
        title: meta.label || pid,
        domain: panelDomains[pid],
        autorange: meta.inverted ? 'reversed' : true,
        gridcolor: '#2c3e50',
        titlefont: { size: 9 },
        showspikes: true,
        spikemode: 'across',
        spikethickness: 0.5,
        spikecolor: 'rgba(255,255,255,0.2)',
        spikedash: 'dot',
      }
    })

    // Operation strip axis + shapes
    layout.shapes = opShapes
    const opKey = opAxisIdx === 1 ? 'yaxis' : `yaxis${opAxisIdx}`
    layout[opKey] = {
      title: '', domain: [stripGap, stripHeight + stripGap],
      showticklabels: false, showgrid: false, zeroline: false,
      range: [0, 1], fixedrange: true,
    }

    return { plotData: data, plotLayout: layout }
  }, [traceData, modeData, channelState, xRange])

  // Operation legend
  const modeLegend = useMemo(() => {
    if (!modeData?.stateSummary) return []
    return Object.entries(modeData.stateSummary)
      .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
      .map(([state, info]) => ({ state, color: MODE_COLORS[state] || '#555', ...info }))
  }, [modeData])

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', color: '#eee', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid #333', background: '#0f0f23',
        display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: '1px solid #444', borderRadius: '4px',
          cursor: 'pointer', color: '#ccc', fontSize: '14px', padding: '2px 8px'
        }}>&larr;</button>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#e0e0e0' }}>Rig State QC</span>

        <select
          value={selectedLicence}
          onChange={e => setSelectedLicence(e.target.value)}
          style={{
            padding: '4px 8px', background: '#1e293b', border: '1px solid #444',
            borderRadius: '4px', color: '#e0e0e0', fontSize: '12px', minWidth: '280px'
          }}
        >
          {wells.map(w => (
            <option key={w.licence} value={w.licence}>
              {w.wellName !== w.licence ? w.wellName : w.licence}
              {w.rig ? ` — Rig ${w.rig}` : ''}
            </option>
          ))}
        </select>

        {!loading && info && (
          <span style={{ fontSize: '11px', color: '#95a5a6' }}>{info}</span>
        )}
        {loading && <span style={{ fontSize: '11px', color: '#f39c12' }}>Loading...</span>}
        {refining && <span style={{ fontSize: '11px', color: '#3498db' }}>Refining...</span>}

        {/* Well dates */}
        {wellDetail && (() => {
          const fmt = (d) => {
            if (!d) return null
            const dt = new Date(d)
            return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
          }
          const phases = wellDetail.drilling_phases || []
          const spud = fmt(wellDetail.spud_date)
          const release = fmt(wellDetail.end_date)
          return (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
              {spud && <span style={{ fontSize: '10px', color: '#95a5a6' }}>Spud <span style={{ color: '#e0e0e0' }}>{spud}</span></span>}
              {release && <span style={{ fontSize: '10px', color: '#95a5a6' }}>Release <span style={{ color: '#e0e0e0' }}>{release}</span></span>}
              {phases.length > 0 && (
                <span style={{ fontSize: '10px', color: '#95a5a6', borderLeft: '1px solid #333', paddingLeft: '10px', display: 'flex', gap: '8px' }}>
                  {phases.map((p, i) => {
                    const s = fmt(p.start_date)
                    const e = fmt(p.end_date)
                    return (
                      <span key={i}>
                        <span style={{ color: '#82aaff', fontWeight: 500 }}>{p.section}</span>
                        {s && e ? <span style={{ color: '#bbb' }}> {s} – {e}</span> : null}
                      </span>
                    )
                  })}
                </span>
              )}
            </div>
          )
        })()}
      </div>

      {/* Presets + channel toggle buttons */}
      <div style={{
        padding: '5px 12px', borderBottom: '1px solid #222', background: '#0f0f23',
        display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Presets */}
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            style={{
              padding: '2px 10px', borderRadius: '3px', fontSize: '10px', fontWeight: 600,
              cursor: 'pointer',
              border: activePreset === key ? '1px solid #82aaff' : '1px solid #555',
              background: activePreset === key ? '#82aaff' : 'transparent',
              color: activePreset === key ? '#0f0f23' : '#aaa',
              transition: 'all 0.15s',
            }}
          >{preset.label}</button>
        ))}

        <span style={{ borderLeft: '1px solid #333', height: '14px', margin: '0 4px' }} />

        {/* Individual channel toggles */}
        {CHANNELS.map(ch => {
          const isOn = channelState[ch.id]
          return (
            <button
              key={ch.id}
              onClick={() => toggleChannel(ch.id)}
              style={{
                padding: '2px 8px', borderRadius: '3px', fontSize: '10px', fontWeight: 500,
                cursor: 'pointer', border: `1px solid ${ch.color}`,
                background: isOn ? ch.color : 'transparent',
                color: isOn ? '#fff' : ch.color,
                opacity: isOn ? 1 : 0.6, transition: 'all 0.15s',
              }}
            >{ch.label}</button>
          )
        })}
      </div>

      {/* Operation legend */}
      {modeLegend.length > 0 && (
        <div style={{ padding: '4px 12px', display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #222', background: '#0f0f23' }}>
          <b style={{ fontSize: '10px', color: '#95a5a6', marginRight: '2px' }}>Operations:</b>
          {modeLegend.map(s => (
            <span key={s.state} style={{
              padding: '1px 5px', borderRadius: '3px', fontSize: '9px',
              background: s.color, color: '#fff'
            }}>{s.state}</span>
          ))}
        </div>
      )}

      {/* Chart */}
      <div style={{ flex: 1 }}>
        {plotData.length > 0 ? (
          <Plot
            data={plotData}
            layout={plotLayout}
            config={{
              responsive: true, scrollZoom: true,
              displayModeBar: true, displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d']
            }}
            style={{ width: '100%', height: 'calc(100vh - 110px)' }}
            useResizeHandler
            onRelayout={handleRelayout}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 110px)', color: '#95a5a6' }}>
            {loading ? 'Loading well data...' : wells.length === 0 ? 'Loading wells...' : 'Select a well to view'}
          </div>
        )}
      </div>
    </div>
  )
}
