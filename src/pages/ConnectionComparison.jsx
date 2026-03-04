import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Plot from 'react-plotly.js'

const API_BASE = import.meta.env.VITE_API_URL || ''
const SECTIONS = ['All', 'Surface', 'Intermediate', 'Mainhole']
const RECENCY = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: 'All', months: 0 },
]

// 28 distinct, visually separable colors — one per rig, no duplicates
const RIG_PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9a6324', '#800000', '#aaffc3', '#808000',
  '#ffd8b1', '#000075', '#a9a9a9', '#ffe119', '#e6beff',
  '#00bcd4', '#ff5722', '#8bc34a', '#607d8b', '#cddc39',
  '#795548', '#1abc9c', '#34495e',
]

// Build a stable rig→color map from the full rig list
function useRigColorMap(rigs) {
  return useMemo(() => {
    const map = {}
    rigs.forEach((r, i) => { map[r] = RIG_PALETTE[i % RIG_PALETTE.length] })
    return map
  }, [rigs])
}

// --- Section toggle row (reused per panel) ---
function SectionToggles({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {SECTIONS.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          style={{
            background: value === s ? '#3498db' : '#2a2a2a',
            color: value === s ? '#fff' : '#aaa',
            border: '1px solid #444',
            borderRadius: 4, padding: '3px 10px', fontSize: 11,
            cursor: 'pointer', fontWeight: value === s ? 600 : 400,
          }}
        >
          {s === 'Mainhole' ? 'MH' : s === 'Intermediate' ? 'Int' : s === 'Surface' ? 'Sfc' : s}
        </button>
      ))}
    </div>
  )
}

// --- Multi-select rig dropdown ---
function RigMultiSelect({ rigs, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (rig) => {
    const next = new Set(selected)
    if (next.has(rig)) next.delete(rig)
    else next.add(rig)
    onChange(next)
  }

  const label = selected.size === 0
    ? 'All Rigs'
    : selected.size <= 3
      ? [...selected].join(', ')
      : `${selected.size} rigs`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: '#2a2a2a', color: '#e0e0e0', border: '1px solid #444',
          borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
          minWidth: 120, textAlign: 'left',
        }}
      >
        {label} ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100,
          background: '#2a2a2a', border: '1px solid #444', borderRadius: 6,
          maxHeight: 300, overflowY: 'auto', minWidth: 160, marginTop: 2,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          <div
            onClick={() => { onChange(new Set()); setOpen(false) }}
            style={{
              padding: '6px 12px', cursor: 'pointer', fontSize: 12,
              borderBottom: '1px solid #444',
              background: selected.size === 0 ? '#3498db' : 'transparent',
              color: selected.size === 0 ? '#fff' : '#ccc',
            }}
          >
            All Rigs
          </div>
          {rigs.map(r => (
            <div
              key={r}
              onClick={() => toggle(r)}
              style={{
                padding: '5px 12px', cursor: 'pointer', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 8,
                color: selected.has(r) ? '#fff' : '#aaa',
                background: selected.has(r) ? '#333' : 'transparent',
              }}
            >
              <span style={{
                width: 14, height: 14, borderRadius: 3,
                border: '1px solid #555', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                background: selected.has(r) ? '#3498db' : 'transparent',
                fontSize: 10, color: '#fff',
              }}>
                {selected.has(r) ? '✓' : ''}
              </span>
              Rig {r}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConnectionComparison() {
  const navigate = useNavigate()

  // Global filters
  const [rigs, setRigs] = useState([])
  const [selectedRigs, setSelectedRigs] = useState(new Set())
  const [recencyMonths, setRecencyMonths] = useState(0) // 0 = All
  const [granularity, setGranularity] = useState('month')

  // Per-panel section filters
  const [rigSection, setRigSection] = useState('All')
  const [wellSection, setWellSection] = useState('All')
  const [trendSection, setTrendSection] = useState('All')

  // Data
  const [rigStats, setRigStats] = useState([])
  const [wellStats, setWellStats] = useState([])
  const [trendData, setTrendData] = useState({ trend: [], rig_trends: {} })

  // Loading
  const [loadingRigs, setLoadingRigs] = useState(false)
  const [loadingWells, setLoadingWells] = useState(false)
  const [loadingTrend, setLoadingTrend] = useState(false)

  const rigColorMap = useRigColorMap(rigs)
  const rigParam = [...selectedRigs].join(',')
  const sinceParam = useMemo(() => {
    if (!recencyMonths) return ''
    const d = new Date()
    d.setMonth(d.getMonth() - recencyMonths)
    return d.toISOString()
  }, [recencyMonths])

  // Fetch rig list on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/connections/rigs`)
      .then(r => r.json())
      .then(d => setRigs(d.rigs || []))
      .catch(err => console.error('Failed to fetch rigs:', err))
  }, [])

  // Fetch rig stats
  useEffect(() => {
    const params = new URLSearchParams()
    if (rigParam) params.set('rig', rigParam)
    if (rigSection !== 'All') params.set('section', rigSection)
    if (sinceParam) params.set('since', sinceParam)
    const qs = params.toString() ? `?${params}` : ''

    setLoadingRigs(true)
    fetch(`${API_BASE}/api/connections/stats${qs}`)
      .then(r => r.json())
      .then(d => setRigStats(d.stats || []))
      .catch(err => console.error('stats error:', err))
      .finally(() => setLoadingRigs(false))
  }, [rigParam, rigSection, sinceParam])

  // Fetch well stats
  useEffect(() => {
    const params = new URLSearchParams()
    if (rigParam) params.set('rig', rigParam)
    if (wellSection !== 'All') params.set('section', wellSection)
    if (sinceParam) params.set('since', sinceParam)
    const qs = params.toString() ? `?${params}` : ''

    setLoadingWells(true)
    fetch(`${API_BASE}/api/connections/by-well${qs}`)
      .then(r => r.json())
      .then(d => setWellStats(d.stats || []))
      .catch(err => console.error('by-well error:', err))
      .finally(() => setLoadingWells(false))
  }, [rigParam, wellSection, sinceParam])

  // Fetch trend
  useEffect(() => {
    const params = new URLSearchParams()
    if (rigParam) params.set('rig', rigParam)
    if (trendSection !== 'All') params.set('section', trendSection)
    if (sinceParam) params.set('since', sinceParam)
    params.set('granularity', granularity)
    const qs = `?${params}`

    setLoadingTrend(true)
    fetch(`${API_BASE}/api/connections/trend${qs}`)
      .then(r => r.json())
      .then(d => setTrendData(d || { trend: [], rig_trends: {} }))
      .catch(err => console.error('trend error:', err))
      .finally(() => setLoadingTrend(false))
  }, [rigParam, trendSection, granularity, sinceParam])

  // --- Chart 1: By Rig (vertical bar) ---
  const rigChart = useMemo(() => {
    if (!rigStats.length) return { data: [], layout: {} }

    const sorted = [...rigStats] // already sorted fastest first by API

    const trace = {
      x: sorted.map(r => `Rig ${r.rig}`),
      y: sorted.map(r => r.avg_min),
      type: 'bar',
      marker: {
        color: sorted.map(r => rigColorMap[r.rig] || '#888'),
      },
      error_y: {
        type: 'data',
        symmetric: false,
        array: sorted.map(r => r.p90_min - r.avg_min),
        arrayminus: sorted.map(r => r.avg_min - r.p10_min),
        color: '#666',
        thickness: 1.5,
        width: 3,
      },
      text: sorted.map(r =>
        `Rig ${r.rig}<br>Avg: ${r.avg_min} min | Med: ${r.median_min} min<br>P10: ${r.p10_min} | P90: ${r.p90_min}<br>${r.connections} connections, ${r.wells} wells`
      ),
      hoverinfo: 'text',
    }

    const layout = {
      autosize: true,
      height: 380,
      margin: { l: 50, r: 20, t: 10, b: 60 },
      paper_bgcolor: '#1f1f1f',
      plot_bgcolor: '#1f1f1f',
      font: { color: '#e0e0e0', size: 11 },
      xaxis: {
        tickangle: -45,
        gridcolor: '#333',
        tickfont: { size: 12 },
      },
      yaxis: {
        title: 'Avg Slip-to-Slip (min)',
        gridcolor: '#333',
        zeroline: false,
      },
      bargap: 0.2,
    }

    return { data: [trace], layout }
  }, [rigStats, rigColorMap])

  // --- Chart 2: By Well (scatter strip — all wells, scrollable) ---
  const wellChart = useMemo(() => {
    if (!wellStats.length) return { data: [], layout: {} }

    const rigNames = [...new Set(wellStats.map(w => w.rig))].sort()
    const traces = rigNames.map(rig => {
      const wells = wellStats.filter(w => w.rig === rig)
      return {
        x: wells.map(w => w.well_name || w.license),
        y: wells.map(w => w.avg_min),
        mode: 'markers',
        type: 'scatter',
        name: `Rig ${rig}`,
        marker: {
          color: rigColorMap[rig] || '#888',
          size: 8,
          opacity: 0.8,
        },
        text: wells.map(w =>
          `${w.well_name || w.license}<br>Rig: ${w.rig}<br>Avg: ${w.avg_min} min | Med: ${w.median_min} min<br>${w.connections} connections`
        ),
        hoverinfo: 'text',
      }
    })

    const chartWidth = Math.max(800, wellStats.length * 22)

    const layout = {
      width: chartWidth,
      height: 400,
      margin: { l: 60, r: 30, t: 10, b: 120 },
      paper_bgcolor: '#1f1f1f',
      plot_bgcolor: '#1f1f1f',
      font: { color: '#e0e0e0', size: 11 },
      xaxis: {
        tickangle: -60,
        gridcolor: '#333',
        showticklabels: true,
        tickfont: { size: 9 },
      },
      yaxis: {
        title: 'Avg Slip-to-Slip (min)',
        gridcolor: '#333',
        zeroline: false,
      },
      legend: { orientation: 'h', y: 1.12, x: 0 },
      showlegend: rigNames.length <= 15,
    }

    return { data: traces, layout }
  }, [wellStats, rigColorMap])

  // --- Chart 3: Trend (always per-rig lines) ---
  const trendChart = useMemo(() => {
    const { rig_trends } = trendData
    const rigNames = Object.keys(rig_trends)
    if (!rigNames.length) return { data: [], layout: {} }

    // Sort rigs by total connections descending for consistent legend order
    const rigTotals = rigNames.map(r => ({
      rig: r,
      total: rig_trends[r].reduce((s, t) => s + t.connections, 0),
    }))
    rigTotals.sort((a, b) => b.total - a.total)

    const traces = rigTotals.map(({ rig }) => {
      const data = rig_trends[rig]
      return {
        x: data.map(t => t.period),
        y: data.map(t => t.avg_min),
        mode: 'lines+markers',
        name: `Rig ${rig}`,
        line: { color: rigColorMap[rig] || '#888', width: 2 },
        marker: { size: 4 },
        text: data.map(t =>
          `Rig ${rig}<br>${t.period}<br>Avg: ${t.avg_min} min | Med: ${t.median_min} min<br>${t.connections} connections`
        ),
        hoverinfo: 'text',
        type: 'scatter',
      }
    })

    const layout = {
      autosize: true,
      height: 450,
      margin: { l: 60, r: 30, t: 10, b: 50 },
      paper_bgcolor: '#1f1f1f',
      plot_bgcolor: '#1f1f1f',
      font: { color: '#e0e0e0', size: 11 },
      xaxis: { gridcolor: '#333', tickangle: -30 },
      yaxis: {
        title: 'Avg Slip-to-Slip (min)',
        gridcolor: '#333',
        zeroline: false,
      },
      legend: { orientation: 'h', y: 1.15, x: 0 },
      hovermode: 'x unified',
    }

    return { data: traces, layout }
  }, [trendData, rigColorMap])

  // Totals for header
  const totalConns = rigStats.reduce((s, r) => s + r.connections, 0)
  const totalWells = new Set(wellStats.map(w => w.license)).size
  const totalRigs = rigStats.length

  return (
    <div style={{ background: '#121212', minHeight: '100vh', color: '#e0e0e0' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <button
          onClick={() => navigate('/locker')}
          style={{
            background: 'none', border: 'none', color: '#e0e0e0',
            fontSize: 20, cursor: 'pointer', padding: '4px 8px',
          }}
        >
          ←
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Connection Comparison</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
            Drilling connection performance analysis
          </p>
        </div>
      </div>

      {/* Summary cards + global controls */}
      <div style={{
        display: 'flex', gap: 16, padding: '16px 24px', flexWrap: 'wrap', alignItems: 'center',
      }}>
        {[
          { label: 'Connections', value: totalConns.toLocaleString() },
          { label: 'Wells', value: totalWells.toLocaleString() },
          { label: 'Rigs', value: totalRigs },
        ].map(c => (
          <div key={c.label} style={{
            background: '#1e1e1e', borderRadius: 8, padding: '12px 20px',
            border: '1px solid #333', minWidth: 100,
          }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Recency */}
          <div style={{ display: 'flex', gap: 2 }}>
            {RECENCY.map(r => (
              <button
                key={r.label}
                onClick={() => setRecencyMonths(r.months)}
                style={{
                  background: recencyMonths === r.months ? '#9b59b6' : '#2a2a2a',
                  color: recencyMonths === r.months ? '#fff' : '#aaa',
                  border: '1px solid #444',
                  borderRadius: 4, padding: '5px 10px', fontSize: 12,
                  cursor: 'pointer', fontWeight: recencyMonths === r.months ? 600 : 400,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <RigMultiSelect rigs={rigs} selected={selectedRigs} onChange={setSelectedRigs} />
        </div>
      </div>

      {/* Charts */}
      <div style={{ padding: '0 24px 24px' }}>
        {/* Chart 1: By Rig */}
        <ChartCard
          title="By Rig"
          subtitle="Avg slip-to-slip time with P10–P90 range"
          loading={loadingRigs}
          controls={<SectionToggles value={rigSection} onChange={setRigSection} />}
        >
          {rigChart.data.length > 0 && (
            <Plot
              data={rigChart.data}
              layout={rigChart.layout}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%' }}
            />
          )}
        </ChartCard>

        {/* Chart 2: By Well (scrollable) */}
        <ChartCard
          title="By Well"
          subtitle={`${wellStats.length} wells — avg connection time, colored by rig`}
          loading={loadingWells}
          controls={<SectionToggles value={wellSection} onChange={setWellSection} />}
        >
          {wellChart.data.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <Plot
                data={wellChart.data}
                layout={wellChart.layout}
                config={{ responsive: false, displayModeBar: false }}
              />
            </div>
          )}
        </ChartCard>

        {/* Chart 3: Trend */}
        <ChartCard
          title={granularity === 'week' ? 'Weekly Trend' : 'Monthly Trend'}
          subtitle="Avg slip-to-slip per rig over time"
          loading={loadingTrend}
          controls={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SectionToggles value={trendSection} onChange={setTrendSection} />
              <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                {[{ key: 'month', label: 'Mo' }, { key: 'week', label: 'Wk' }].map(g => (
                  <button
                    key={g.key}
                    onClick={() => setGranularity(g.key)}
                    style={{
                      background: granularity === g.key ? '#2ecc71' : '#2a2a2a',
                      color: granularity === g.key ? '#fff' : '#aaa',
                      border: '1px solid #444',
                      borderRadius: 4, padding: '3px 10px', fontSize: 11,
                      cursor: 'pointer', fontWeight: granularity === g.key ? 600 : 400,
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          {trendChart.data.length > 0 && (
            <Plot
              data={trendChart.data}
              layout={trendChart.layout}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%' }}
            />
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, loading, controls, children }) {
  return (
    <div style={{
      background: '#1e1e1e', borderRadius: 10, border: '1px solid #333',
      marginBottom: 20, overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 20px 8px',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
          {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>{subtitle}</p>}
        </div>
        {controls && <div>{controls}</div>}
      </div>
      <div style={{ padding: '8px 12px', minHeight: 200, position: 'relative' }}>
        {loading ? (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            height: 200, color: '#666',
          }}>
            Loading...
          </div>
        ) : children}
      </div>
    </div>
  )
}
