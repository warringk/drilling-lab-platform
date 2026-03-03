import React, { useState, useEffect, useRef, useMemo } from 'react'
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

const MODE_COLORS = {
  DRILLING: '#2ecc71',
  TRIPPING_IN: '#c0392b',
  TRIPPING_OUT: '#e74c3c',
  CIRCULATING: '#3498db',
  CONNECTION: '#f39c12',
  REAMING: '#9b59b6',
  CASING_RUN: '#ec4899',
  CEMENTING: '#f43f5e',
  WIPER_TRIP: '#14b8a6',
  OTHER: '#64748b',
  STATIONARY_ON_BOTTOM: '#95a5a6',
  BHA_HANDLING: '#f1c40f',
}

// Consistent ordering for stacked bars
const OP_ORDER = [
  'DRILLING', 'TRIPPING_IN', 'TRIPPING_OUT', 'WIPER_TRIP',
  'CASING_RUN', 'CEMENTING', 'CIRCULATING',
  'REAMING', 'CONNECTION', 'OTHER', 'STATIONARY_ON_BOTTOM', 'BHA_HANDLING'
]

const labelStyle = { fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }
const linkBtnStyle = { background: 'none', border: 'none', color: '#4a9eff', cursor: 'pointer', fontSize: '11px', padding: '2px 4px' }

export default function SectionKpis() {
  const navigate = useNavigate()

  const [selectedSection, setSelectedSection] = useState('Intermediate')
  const [recency, setRecency] = useState(null)       // months or null for all
  const [allWells, setAllWells] = useState([])       // normalized: { license, well_name, rig, drilling_phases, last_data_date }
  const [selectedLicenses, setSelectedLicenses] = useState(new Set())
  const [compareData, setCompareData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsedRigs, setCollapsedRigs] = useState(new Set())
  const [sidebarWidth, setSidebarWidth] = useState(340)
  const [sortCol, setSortCol] = useState('total_hours')
  const [sortAsc, setSortAsc] = useState(true)
  const [visibleOps, setVisibleOps] = useState(null) // null = show all; Set of visible op types after data loads
  const [expandedWell, setExpandedWell] = useState(null) // license of expanded row
  const [depthData, setDepthData] = useState(null) // { license, timestamps, bit_depth, hole_depth }
  const [depthLoading, setDepthLoading] = useState(false)
  const resizing = useRef(false)

  // Fetch all wells on mount, then fetch drilling_phases for each
  useEffect(() => {
    fetch(`${API_BASE}/api/wells/rigs`)
      .then(r => r.json())
      .then(async (data) => {
        const rigs = data.rigs || []
        // Fetch well lists per rig
        const allResults = await Promise.all(
          rigs.map(rig =>
            fetch(`${API_BASE}/api/wells?rig=${rig}`)
              .then(r => r.json())
              .then(d => (d.wells || []).map(w => ({
                license: w.licence_number,
                well_name: w.well_name,
                rig: w.rig_name || rig,
                last_data_date: w.last_data_date,
              })))
              .catch(() => [])
          )
        )
        const wells = allResults.flat()

        // Fetch drilling_phases for all wells in parallel
        const enriched = await Promise.all(
          wells.map(async (w) => {
            try {
              const r = await fetch(`${API_BASE}/api/wells/${w.license}`)
              const d = await r.json()
              return { ...w, drilling_phases: d.well?.drilling_phases || [] }
            } catch {
              return { ...w, drilling_phases: [] }
            }
          })
        )
        setAllWells(enriched)
      })
      .catch(err => console.error('Failed to fetch wells:', err))
  }, [])

  const recencyCutoff = recency
    ? new Date(Date.now() - recency * 30 * 24 * 60 * 60 * 1000)
    : null

  // Filter wells — must have the selected section in drilling_phases
  const filteredWells = useMemo(() => {
    return allWells.filter(w => {
      const phases = w.drilling_phases || []
      const hasSection = phases.some(p => p.section === selectedSection)
      if (!hasSection) return false
      if (recencyCutoff && w.last_data_date) {
        if (new Date(w.last_data_date) < recencyCutoff) return false
      }
      if (search) {
        const q = search.toLowerCase()
        return (w.well_name || '').toLowerCase().includes(q) ||
               (w.license || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [allWells, selectedSection, search, recencyCutoff])

  // Group by rig
  const rigGroups = useMemo(() => {
    const groups = {}
    for (const w of filteredWells) {
      const rig = w.rig || 'Unknown'
      if (!groups[rig]) groups[rig] = []
      groups[rig].push(w)
    }
    return groups
  }, [filteredWells])
  const sortedRigs = Object.keys(rigGroups).sort((a, b) => Number(a) - Number(b))

  const toggleLicense = (license) => {
    setSelectedLicenses(prev => {
      const next = new Set(prev)
      next.has(license) ? next.delete(license) : next.add(license)
      return next
    })
  }

  const selectAll = () => setSelectedLicenses(new Set(filteredWells.map(w => w.license)))
  const clearAll = () => setSelectedLicenses(new Set())

  const toggleRigCollapse = (rig) => {
    setCollapsedRigs(prev => {
      const next = new Set(prev)
      next.has(rig) ? next.delete(rig) : next.add(rig)
      return next
    })
  }

  const selectRig = (rig) => {
    setSelectedLicenses(prev => {
      const next = new Set(prev)
      for (const w of rigGroups[rig]) next.add(w.license)
      return next
    })
  }

  // Clear selection when section changes
  useEffect(() => {
    setCompareData(null)
  }, [selectedSection])

  const fetchComparison = async () => {
    if (selectedLicenses.size === 0) return
    setLoading(true)
    try {
      const licenses = Array.from(selectedLicenses).join(',')
      const r = await fetch(`${API_BASE}/api/section-kpis/compare?licenses=${licenses}&section=${selectedSection}`)
      const data = await r.json()
      setCompareData(data)
    } catch (err) {
      console.error('Failed to fetch section KPIs:', err)
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
      setSidebarWidth(Math.max(200, Math.min(600, startW + ev.clientX - startX)))
    }
    const onUp = () => {
      resizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Collect all op types present in data for consistent columns
  const allOpTypes = useMemo(() => {
    if (!compareData?.wells) return []
    const types = new Set()
    for (const w of compareData.wells) {
      for (const op of (w.section?.operations || [])) {
        types.add(op.type)
      }
    }
    return OP_ORDER.filter(t => types.has(t))
  }, [compareData])

  // Reset visibleOps to all when new data loads
  useEffect(() => {
    if (allOpTypes.length > 0) setVisibleOps(new Set(allOpTypes))
  }, [allOpTypes])

  const activeOpTypes = useMemo(() => {
    if (!visibleOps) return allOpTypes
    return allOpTypes.filter(t => visibleOps.has(t))
  }, [allOpTypes, visibleOps])

  const toggleOp = (type) => {
    setVisibleOps(prev => {
      const next = new Set(prev || allOpTypes)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  // Compute visible hours sum for a well (only active ops)
  const getVisibleHours = (w) => {
    const ops = w.section?.operations || []
    return ops.reduce((sum, op) => activeOpTypes.includes(op.type) ? sum + op.hours : sum, 0)
  }

  // Sort table rows
  const sortedWells = useMemo(() => {
    if (!compareData?.wells) return []
    const wells = [...compareData.wells]
    wells.sort((a, b) => {
      let va, vb
      if (sortCol === 'total_hours') {
        va = getVisibleHours(a)
        vb = getVisibleHours(b)
      } else if (sortCol === 'well_name') {
        va = a.well_name || ''
        vb = b.well_name || ''
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
      } else if (sortCol === 'rig') {
        va = Number(a.rig) || 9999
        vb = Number(b.rig) || 9999
      } else {
        // op type column
        const aOps = a.section?.operations || []
        const bOps = b.section?.operations || []
        va = aOps.find(o => o.type === sortCol)?.hours || 0
        vb = bOps.find(o => o.type === sortCol)?.hours || 0
      }
      return sortAsc ? va - vb : vb - va
    })
    return wells
  }, [compareData, sortCol, sortAsc, activeOpTypes])

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc)
    } else {
      setSortCol(col)
      setSortAsc(col === 'well_name' || col === 'rig')
    }
  }

  // Toggle depth chart expansion for a well row
  const toggleDepthChart = async (well) => {
    const license = well.license
    if (expandedWell === license) {
      setExpandedWell(null)
      return
    }
    setExpandedWell(license)

    // Already cached?
    if (depthData?.license === license) return

    const section = well.section
    if (!section?.start_date || !section?.end_date) return

    setDepthLoading(true)
    setDepthData(null)
    try {
      const spanSec = (new Date(section.end_date) - new Date(section.start_date)) / 1000
      const res = Math.max(15, Math.ceil(spanSec / 5000))
      const startEnc = encodeURIComponent(section.start_date)
      const endEnc = encodeURIComponent(section.end_date)

      // Fetch depth traces + operation segments in parallel
      const [depthResp, segResp] = await Promise.all([
        fetch(`${API_BASE}/api/ts/edr/${license}?start=${startEnc}&end=${endEnc}&resolution=${res}`).then(r => r.json()),
        fetch(`${API_BASE}/api/section-kpis/${license}/segments?start=${startEnc}&end=${endEnc}`).then(r => r.json()),
      ])

      const rows = depthResp.data || []
      setDepthData({
        license,
        timestamps: rows.map(r => r.timestamp),
        bit_depth: rows.map(r => r.bit_depth),
        hole_depth: rows.map(r => r.hole_depth),
        segments: segResp.segments || [],
      })
    } catch (err) {
      console.error('Failed to fetch depth data:', err)
    } finally {
      setDepthLoading(false)
    }
  }

  // Build plotly stacked horizontal bars
  const { plotData, plotLayout } = useMemo(() => {
    if (!sortedWells.length) return { plotData: [], plotLayout: {} }

    // y-axis labels (bottom to top for horizontal bar)
    const yLabels = sortedWells.map(w => {
      const rig = w.rig ? `Rig ${w.rig}` : ''
      return `${w.license} ${rig}`
    }).reverse()

    // One trace per visible op type (stacked)
    const traces = activeOpTypes.map(type => {
      const hours = sortedWells.map(w => {
        const op = (w.section?.operations || []).find(o => o.type === type)
        return op ? op.hours : 0
      }).reverse()

      return {
        y: yLabels,
        x: hours,
        name: type.replace(/_/g, ' '),
        type: 'bar',
        orientation: 'h',
        marker: { color: MODE_COLORS[type] || '#64748b' },
        hovertemplate: `%{y}<br>${type}: %{x:.1f} hrs<extra></extra>`
      }
    })

    const layout = {
      barmode: 'stack',
      autosize: true,
      height: Math.max(300, sortedWells.length * 40 + 100),
      paper_bgcolor: '#1f1f1f',
      plot_bgcolor: '#1f1f1f',
      font: { color: '#e0e0e0', size: 11 },
      xaxis: {
        title: 'Hours',
        gridcolor: 'rgba(255,255,255,0.08)',
        zeroline: false
      },
      yaxis: {
        automargin: true,
        tickfont: { size: 11 }
      },
      margin: { l: 160, r: 30, t: 20, b: 50 },
      legend: {
        orientation: 'h',
        y: -0.12,
        x: 0.5,
        xanchor: 'center',
        font: { size: 11 }
      },
      hovermode: 'closest'
    }

    return { plotData: traces, plotLayout: layout }
  }, [sortedWells, activeOpTypes])

  const thStyle = {
    padding: '8px 10px',
    textAlign: 'right',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap'
  }

  const tdStyle = {
    padding: '6px 10px',
    textAlign: 'right',
    fontSize: '12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)'
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
            Section KPIs
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '2px 0 0' }}>
            Operation time breakdowns per drilling section
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
        {/* Section selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Section</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {SECTIONS.map(s => {
              const active = selectedSection === s
              return (
                <button
                  key={s}
                  onClick={() => setSelectedSection(s)}
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

        {/* Compare button */}
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
            {(selectedLicenses.size > 0 || compareData) && (
              <button
                onClick={() => { setSelectedLicenses(new Set()); setCompareData(null) }}
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

        {compareData?.wells && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'flex-end', paddingBottom: '8px' }}>
            {compareData.wells.length} wells with {selectedSection} section
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
              {search ? 'No matching wells' : `No wells have a ${selectedSection} section`}
            </div>
          )}

          {sortedRigs.map(rig => {
            const wells = rigGroups[rig]
            const collapsed = collapsedRigs.has(rig)
            const selectedCount = wells.filter(w => selectedLicenses.has(w.license)).length
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
                        const selected = selectedLicenses.has(w.license)
                        return (
                          <tr
                            key={w.license}
                            onClick={() => toggleLicense(w.license)}
                            style={{
                              cursor: 'pointer',
                              background: selected ? 'rgba(74, 158, 255, 0.12)' : 'transparent'
                            }}
                          >
                            <td style={{ width: '22px', padding: '2px 4px 2px 12px', verticalAlign: 'middle' }}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleLicense(w.license)}
                                style={{ accentColor: '#4a9eff' }}
                              />
                            </td>
                            <td style={{ padding: '2px 4px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#e0e0e0' }}>{w.well_name || w.license}</span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '6px', fontSize: '10px' }}>{w.license}</span>
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
            flexShrink: 0
          }}
        />

        {/* Main Content */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 150px)' }}>
          {!compareData && !loading && (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '15px' }}>Select wells and click Compare to see operation breakdowns</p>
            </div>
          )}

          {loading && (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '15px' }}>Loading section KPIs...</p>
            </div>
          )}

          {compareData && !loading && sortedWells.length === 0 && (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '15px' }}>No wells have operation data for the {selectedSection} section.</p>
              <p style={{ fontSize: '12px' }}>Wells need Layer 4 enrichment (enrich_operation_events.py) to show KPIs.</p>
            </div>
          )}

          {compareData && !loading && sortedWells.length > 0 && (
            <div style={{ padding: '16px 24px' }}>
              {/* Operation type toggles */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                marginBottom: '12px'
              }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginRight: '4px' }}>
                  Operations
                </span>
                {allOpTypes.map(type => {
                  const active = activeOpTypes.includes(type)
                  const color = MODE_COLORS[type] || '#64748b'
                  return (
                    <button
                      key={type}
                      onClick={() => toggleOp(type)}
                      style={{
                        padding: '4px 10px',
                        background: active ? color + '25' : 'var(--bg-secondary)',
                        color: active ? color : 'var(--text-muted)',
                        border: active ? `1px solid ${color}60` : '1px solid var(--border)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: active ? 600 : 400,
                        opacity: active ? 1 : 0.5,
                        transition: 'all 0.15s'
                      }}
                    >
                      {type.replace(/_/g, ' ')}
                    </button>
                  )
                })}
                <span style={{ marginLeft: '4px', display: 'flex', gap: '6px' }}>
                  <button onClick={() => setVisibleOps(new Set(allOpTypes))} style={linkBtnStyle}>All</button>
                  <button onClick={() => setVisibleOps(new Set())} style={linkBtnStyle}>None</button>
                </span>
              </div>

              {/* Stacked Bar Chart */}
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                padding: '12px',
                marginBottom: '16px'
              }}>
                <Plot
                  data={plotData}
                  layout={plotLayout}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Summary Table */}
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                overflow: 'auto'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th
                        onClick={() => handleSort('well_name')}
                        style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-secondary)' }}
                      >
                        Well {sortCol === 'well_name' ? (sortAsc ? '\u25B2' : '\u25BC') : ''}
                      </th>
                      <th onClick={() => handleSort('rig')} style={thStyle}>
                        Rig {sortCol === 'rig' ? (sortAsc ? '\u25B2' : '\u25BC') : ''}
                      </th>
                      <th onClick={() => handleSort('total_hours')} style={{ ...thStyle, color: '#4a9eff' }}>
                        {activeOpTypes.length < allOpTypes.length ? 'Visible hrs' : 'Total hrs'} {sortCol === 'total_hours' ? (sortAsc ? '\u25B2' : '\u25BC') : ''}
                      </th>
                      {activeOpTypes.map(type => (
                        <th
                          key={type}
                          onClick={() => handleSort(type)}
                          style={{ ...thStyle, color: MODE_COLORS[type] || 'var(--text-muted)' }}
                        >
                          {type.replace(/_/g, ' ')} {sortCol === type ? (sortAsc ? '\u25B2' : '\u25BC') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWells.map(w => {
                      const ops = w.section?.operations || []
                      const opMap = {}
                      for (const op of ops) opMap[op.type] = op
                      const isExpanded = expandedWell === w.license
                      const colCount = 3 + activeOpTypes.length
                      return (
                        <React.Fragment key={w.license}>
                          <tr
                            onClick={() => toggleDepthChart(w)}
                            style={{
                              borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)',
                              cursor: 'pointer',
                              background: isExpanded ? 'rgba(74, 158, 255, 0.06)' : 'transparent'
                            }}
                          >
                            <td style={{
                              ...tdStyle,
                              textAlign: 'left',
                              position: 'sticky',
                              left: 0,
                              background: isExpanded ? 'rgba(74, 158, 255, 0.06)' : 'var(--bg-secondary)',
                              fontWeight: 500
                            }}>
                              <span style={{ fontSize: '9px', color: '#4a9eff', marginRight: '6px' }}>
                                {isExpanded ? '\u25BC' : '\u25B6'}
                              </span>
                              <span style={{ color: '#e0e0e0' }}>{w.well_name || w.license}</span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '6px', fontSize: '10px' }}>{w.license}</span>
                            </td>
                            <td style={tdStyle}>{w.rig || '-'}</td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: '#4a9eff' }}>
                              {getVisibleHours(w).toFixed(1)}
                            </td>
                            {activeOpTypes.map(type => {
                              const op = opMap[type]
                              return (
                                <td key={type} style={tdStyle}>
                                  {op ? (
                                    <span>
                                      <span style={{ color: '#e0e0e0' }}>{op.hours.toFixed(1)}</span>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '3px' }}>
                                        ({op.pct.toFixed(0)}%)
                                      </span>
                                    </span>
                                  ) : (
                                    <span style={{ color: 'rgba(255,255,255,0.15)' }}>-</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={colCount} style={{ padding: '0 10px 10px', background: 'rgba(74, 158, 255, 0.06)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {depthLoading && (
                                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                                    Loading depth data...
                                  </div>
                                )}
                                {!depthLoading && depthData?.license === w.license && (() => {
                                  // Build operation strip shapes
                                  const segs = depthData.segments || []
                                  const stripTop = 0.0    // bottom of chart area in paper coords
                                  const stripBot = -0.08
                                  const opShapes = segs.map(seg => ({
                                    type: 'rect',
                                    xref: 'x',
                                    yref: 'paper',
                                    x0: seg.start_ts,
                                    x1: seg.end_ts,
                                    y0: stripBot,
                                    y1: stripTop,
                                    fillcolor: MODE_COLORS[seg.operation_type] || '#64748b',
                                    line: { width: 0 },
                                    layer: 'below'
                                  }))

                                  // Dense hover trace at strip midpoint so hovering shows op name
                                  const hoverX = []
                                  const hoverText = []
                                  for (const seg of segs) {
                                    const t0 = new Date(seg.start_ts).getTime()
                                    const t1 = new Date(seg.end_ts).getTime()
                                    const mid = new Date((t0 + t1) / 2).toISOString()
                                    hoverX.push(seg.start_ts, mid, seg.end_ts)
                                    const label = seg.operation_type.replace(/_/g, ' ')
                                    hoverText.push(label, label, label)
                                  }

                                  return (
                                    <Plot
                                      data={[
                                        {
                                          x: depthData.timestamps,
                                          y: depthData.bit_depth,
                                          type: 'scatter',
                                          mode: 'lines',
                                          name: 'Bit Depth',
                                          line: { color: '#4a9eff', width: 1.5 },
                                          yaxis: 'y'
                                        },
                                        {
                                          x: depthData.timestamps,
                                          y: depthData.hole_depth,
                                          type: 'scatter',
                                          mode: 'lines',
                                          name: 'Hole Depth',
                                          line: { color: '#f59e0b', width: 1.5, dash: 'dot' },
                                          yaxis: 'y'
                                        },
                                        // Invisible trace for operation strip hover
                                        {
                                          x: hoverX,
                                          y: hoverX.map(() => null),
                                          type: 'scatter',
                                          mode: 'markers',
                                          marker: { size: 1, opacity: 0 },
                                          text: hoverText,
                                          hovertemplate: '%{text}<extra></extra>',
                                          showlegend: false,
                                          yaxis: 'y'
                                        }
                                      ]}
                                      layout={{
                                        autosize: true,
                                        height: 220,
                                        paper_bgcolor: 'transparent',
                                        plot_bgcolor: 'rgba(0,0,0,0.2)',
                                        font: { color: '#e0e0e0', size: 10 },
                                        xaxis: {
                                          range: [w.section?.start_date, w.section?.end_date],
                                          gridcolor: 'rgba(255,255,255,0.06)',
                                          zeroline: false,
                                          tickformat: '%b %d\n%H:%M'
                                        },
                                        yaxis: {
                                          title: 'Depth (m)',
                                          autorange: 'reversed',
                                          gridcolor: 'rgba(255,255,255,0.06)',
                                          zeroline: false,
                                          titlefont: { size: 10 },
                                          domain: [0.12, 1]
                                        },
                                        margin: { l: 55, r: 15, t: 10, b: 35 },
                                        legend: {
                                          orientation: 'h',
                                          y: 1.12,
                                          x: 0,
                                          font: { size: 10 }
                                        },
                                        shapes: opShapes,
                                        hovermode: 'x unified',
                                        hoverlabel: {
                                          bgcolor: '#1e1e1e',
                                          bordercolor: '#444',
                                          font: { color: '#e0e0e0', size: 11 }
                                        }
                                      }}
                                      config={{ responsive: true, displayModeBar: false }}
                                      style={{ width: '100%' }}
                                    />
                                  )
                                })()}
                                {!depthLoading && (!depthData || depthData.license !== w.license) && (
                                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                                    No depth data available
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
