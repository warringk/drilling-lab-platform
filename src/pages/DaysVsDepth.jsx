import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Plot from 'react-plotly.js'

const API_BASE = import.meta.env.VITE_API_URL || ''

const SECTIONS = ['Surface', 'Intermediate', 'Mainhole']
const RECENCY_OPTIONS = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: 'All', months: null },
]

const TRACE_COLORS = [
  '#4a9eff', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6',
  '#06b6d4', '#84cc16', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#22d3ee', '#a3e635', '#fb7185', '#a78bfa'
]

export default function DaysVsDepth() {
  const navigate = useNavigate()

  const [selectedSections, setSelectedSections] = useState(new Set(['Intermediate']))
  const [recency, setRecency] = useState(null)       // months or null for all
  const [allWells, setAllWells] = useState([])        // all wells across all rigs
  const [wellPhases, setWellPhases] = useState({})    // license → drilling_phases
  const [selectedLicenses, setSelectedLicenses] = useState(new Set())
  const [traces, setTraces] = useState([])
  const [loading, setLoading] = useState(false)
  const [queryTime, setQueryTime] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(340)
  const [collapsedRigs, setCollapsedRigs] = useState(new Set())
  const [search, setSearch] = useState('')
  const resizing = useRef(false)

  const toggleSection = (s) => {
    setSelectedSections(prev => {
      const next = new Set(prev)
      if (next.has(s)) { next.delete(s) } else { next.add(s) }
      return next
    })
    setTraces([])
  }

  const sectionFilterActive = selectedSections.size > 0 && selectedSections.size < 3

  // Fetch ALL wells on mount (no rig filter)
  useEffect(() => {
    fetch(`${API_BASE}/api/wells/rigs`)
      .then(r => r.json())
      .then(async (data) => {
        const rigs = data.rigs || []
        // Fetch wells for every rig in parallel
        const allResults = await Promise.all(
          rigs.map(rig =>
            fetch(`${API_BASE}/api/wells?rig=${rig}`)
              .then(r => r.json())
              .then(d => (d.wells || []).map(w => ({ ...w, rig })))
              .catch(() => [])
          )
        )
        setAllWells(allResults.flat())
      })
      .catch(err => console.error('Failed to fetch wells:', err))
  }, [])

  // Fetch drilling_phases for all wells
  useEffect(() => {
    if (allWells.length === 0) return
    const fetchPhases = async () => {
      const phases = {}
      await Promise.all(
        allWells.map(async (w) => {
          try {
            const r = await fetch(`${API_BASE}/api/wells/${w.licence_number}`)
            const data = await r.json()
            phases[w.licence_number] = data.well?.drilling_phases || []
          } catch {
            phases[w.licence_number] = []
          }
        })
      )
      setWellPhases(phases)
    }
    fetchPhases()
  }, [allWells])

  // Recency cutoff date
  const recencyCutoff = recency
    ? new Date(Date.now() - recency * 30 * 24 * 60 * 60 * 1000)
    : null

  // Filter wells by sections + recency + search
  const filteredWells = allWells.filter(w => {
    // Section filter — well must have at least one of the selected sections
    if (sectionFilterActive) {
      const phases = wellPhases[w.licence_number] || []
      if (!phases.some(p => p.section && selectedSections.has(p.section))) return false
    }
    // Recency filter
    if (recencyCutoff && w.last_data_date) {
      if (new Date(w.last_data_date) < recencyCutoff) return false
    }
    // Search filter
    if (search) {
      const q = search.toLowerCase()
      return (w.well_name || '').toLowerCase().includes(q) ||
             (w.licence_number || '').toLowerCase().includes(q)
    }
    return true
  })

  // Group by rig
  const rigGroups = {}
  for (const w of filteredWells) {
    const rig = w.rig || 'Unknown'
    if (!rigGroups[rig]) rigGroups[rig] = []
    rigGroups[rig].push(w)
  }
  const sortedRigs = Object.keys(rigGroups).sort((a, b) => Number(a) - Number(b))

  const toggleLicense = (license) => {
    setSelectedLicenses(prev => {
      const next = new Set(prev)
      if (next.has(license)) next.delete(license)
      else next.add(license)
      return next
    })
  }

  const selectAll = () => {
    setSelectedLicenses(new Set(filteredWells.map(w => w.licence_number)))
  }

  const clearAll = () => {
    setSelectedLicenses(new Set())
  }

  const toggleRigCollapse = (rig) => {
    setCollapsedRigs(prev => {
      const next = new Set(prev)
      if (next.has(rig)) next.delete(rig)
      else next.add(rig)
      return next
    })
  }

  const selectRig = (rig) => {
    setSelectedLicenses(prev => {
      const next = new Set(prev)
      for (const w of rigGroups[rig]) next.add(w.licence_number)
      return next
    })
  }

  const fetchComparison = async () => {
    if (selectedLicenses.size === 0) return
    setLoading(true)
    const t0 = performance.now()
    try {
      const licenses = Array.from(selectedLicenses).join(',')
      const sectionParam = sectionFilterActive ? `&section=${Array.from(selectedSections).join(',')}` : ''
      const r = await fetch(`${API_BASE}/api/charts/days-depth-compare?licenses=${licenses}${sectionParam}`)
      const data = await r.json()
      setTraces(data.traces || [])
      setQueryTime(Math.round(performance.now() - t0))
    } catch (err) {
      console.error('Failed to fetch comparison:', err)
    } finally {
      setLoading(false)
    }
  }

  // Sidebar resize
  const startResize = (e) => {
    e.preventDefault()
    resizing.current = true
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev) => {
      if (!resizing.current) return
      const newW = Math.max(200, Math.min(600, startW + ev.clientX - startX))
      setSidebarWidth(newW)
    }
    const onUp = () => {
      resizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Look up rig for a license from allWells
  const rigByLicense = {}
  for (const w of allWells) rigByLicense[w.licence_number] = w.rig

  // Build plotly data
  const plotData = traces.map((t, i) => {
    const rig = rigByLicense[t.license]
    const label = rig
      ? `Rig ${rig} — ${t.well_name} (${t.license})`
      : `${t.well_name} (${t.license})`
    return {
      x: t.x,
      y: t.y,
      type: 'scatter',
      mode: 'lines',
      name: label,
      line: { color: TRACE_COLORS[i % TRACE_COLORS.length], width: 2 }
    }
  })

  const plotLayout = {
    autosize: true,
    paper_bgcolor: '#1f1f1f',
    plot_bgcolor: '#1f1f1f',
    font: { color: '#e0e0e0', size: 12 },
    xaxis: {
      title: 'Operational Days',
      gridcolor: 'rgba(255,255,255,0.08)',
      color: '#e0e0e0',
      zeroline: false
    },
    yaxis: {
      title: sectionFilterActive ? 'Section Depth (m)' : 'Hole Depth (m)',
      autorange: 'reversed',
      gridcolor: 'rgba(255,255,255,0.08)',
      color: '#e0e0e0',
      zeroline: false
    },
    margin: { l: 70, r: 30, t: 30, b: 60 },
    legend: {
      orientation: 'h',
      y: -0.15,
      x: 0.5,
      xanchor: 'center',
      font: { size: 11 }
    },
    hovermode: 'x unified'
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          &larr;
        </button>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>
            Days vs Depth
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '2px 0 0' }}>
            Compare drilling performance across wells by section
          </p>
        </div>
      </div>

      {/* Controls Bar */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Section toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Sections</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {SECTIONS.map(s => {
              const active = selectedSections.has(s)
              return (
                <button
                  key={s}
                  onClick={() => toggleSection(s)}
                  style={{
                    padding: '6px 12px',
                    background: active ? '#4a9eff' : 'var(--bg-secondary)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: active ? '1px solid #4a9eff' : '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 400
                  }}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        {/* Recency filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Recency</label>
          <div style={{ display: 'flex', gap: '3px' }}>
            {RECENCY_OPTIONS.map(opt => {
              const active = recency === opt.months
              return (
                <button
                  key={opt.label}
                  onClick={() => setRecency(opt.months)}
                  style={{
                    padding: '6px 10px',
                    background: active ? 'rgba(74, 158, 255, 0.15)' : 'var(--bg-secondary)',
                    color: active ? '#4a9eff' : 'var(--text-muted)',
                    border: active ? '1px solid rgba(74, 158, 255, 0.4)' : '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: active ? 600 : 400
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ ...labelStyle, color: 'transparent' }}>_</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchComparison}
              disabled={selectedLicenses.size === 0 || loading}
              style={{
                padding: '8px 24px',
                background: selectedLicenses.size > 0 ? '#4a9eff' : 'var(--bg-secondary)',
                color: selectedLicenses.size > 0 ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: selectedLicenses.size > 0 ? 'pointer' : 'default',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              {loading ? 'Loading...' : `Compare (${selectedLicenses.size})`}
            </button>
            {(selectedLicenses.size > 0 || traces.length > 0) && (
              <button
                onClick={() => { setSelectedLicenses(new Set()); setTraces([]); setQueryTime(null) }}
                style={{
                  padding: '8px 16px',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {queryTime !== null && traces.length > 0 && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'flex-end', paddingBottom: '8px' }}>
            {traces.length} traces in {queryTime}ms
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Well Selector Sidebar */}
        <div style={{
          width: `${sidebarWidth}px`,
          minWidth: '240px',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px',
          maxHeight: 'calc(100vh - 150px)',
          flexShrink: 0
        }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search wells..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
              boxSizing: 'border-box',
              outline: 'none',
              marginBottom: '6px'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', padding: '0 2px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {filteredWells.length} WELLS
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={selectAll} style={linkBtnStyle}>All</button>
              <button onClick={clearAll} style={linkBtnStyle}>None</button>
            </div>
          </div>

          {allWells.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
              Loading wells...
            </div>
          )}

          {filteredWells.length === 0 && allWells.length > 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
              {search ? 'No matching wells' : 'No wells match the current filters'}
            </div>
          )}

          {/* Rig groups */}
          {sortedRigs.map(rig => {
            const wells = rigGroups[rig]
            const collapsed = collapsedRigs.has(rig)
            const selectedCount = wells.filter(w => selectedLicenses.has(w.licence_number)).length
            return (
              <div key={rig} style={{ marginBottom: '2px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 2px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
                  onClick={() => toggleRigCollapse(rig)}
                >
                  <span style={{ fontSize: '9px', color: '#4a9eff', width: '10px' }}>
                    {collapsed ? '\u25B6' : '\u25BC'}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#e0e0e0', letterSpacing: '0.3px' }}>
                    Rig {rig}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({wells.length})</span>
                  {selectedCount > 0 && (
                    <span style={{ fontSize: '10px', color: '#4a9eff', marginLeft: 'auto' }}>{selectedCount}</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); selectRig(rig) }}
                    style={{ ...linkBtnStyle, marginLeft: selectedCount > 0 ? '2px' : 'auto', fontSize: '10px' }}
                  >+all</button>
                </div>
                {!collapsed && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <tbody>
                      {wells.map(w => {
                        const selected = selectedLicenses.has(w.licence_number)
                        return (
                          <tr
                            key={w.licence_number}
                            onClick={() => toggleLicense(w.licence_number)}
                            style={{
                              cursor: 'pointer',
                              background: selected ? 'rgba(74, 158, 255, 0.12)' : 'transparent'
                            }}
                          >
                            <td style={{ width: '22px', padding: '2px 4px 2px 12px', verticalAlign: 'middle' }}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleLicense(w.licence_number)}
                                style={{ accentColor: '#4a9eff' }}
                              />
                            </td>
                            <td style={{
                              padding: '2px 4px',
                              fontSize: '11px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 0
                            }}
                              title={`${w.well_name} — ${w.licence_number}`}
                            >
                              {w.well_name || 'Unknown'}
                            </td>
                            <td style={{
                              width: '62px',
                              padding: '2px 2px',
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              textAlign: 'right',
                              whiteSpace: 'nowrap'
                            }}>
                              {w.licence_number}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          style={{
            width: '4px',
            cursor: 'col-resize',
            background: 'transparent',
            flexShrink: 0,
            zIndex: 10
          }}
          onMouseEnter={e => e.target.style.background = 'rgba(74, 158, 255, 0.3)'}
          onMouseLeave={e => { if (!resizing.current) e.target.style.background = 'transparent' }}
        />

        {/* Chart Area */}
        <div style={{ flex: 1, padding: '12px', overflow: 'hidden' }}>
          {traces.length > 0 ? (
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '12px',
              height: 'calc(100vh - 190px)'
            }}>
              <Plot
                data={plotData}
                layout={plotLayout}
                config={{
                  responsive: true,
                  displayModeBar: true,
                  displaylogo: false,
                  modeBarButtonsToRemove: ['lasso2d', 'select2d']
                }}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler
              />
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 'calc(100vh - 190px)',
              color: 'var(--text-muted)',
              fontSize: '14px',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <span style={{ fontSize: '32px' }}>&#x1f4c8;</span>
              <span>Select wells and click Compare to overlay days-vs-depth curves</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  fontWeight: 600
}

const selectStyle = {
  padding: '8px 12px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '13px',
  cursor: 'pointer',
  minWidth: '140px'
}

const linkBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#4a9eff',
  fontSize: '11px',
  cursor: 'pointer',
  padding: '2px 4px'
}
