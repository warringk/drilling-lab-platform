import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import html2canvas from 'html2canvas'
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  ReferenceArea, ReferenceLine, Brush, CartesianGrid 
} from 'recharts'

const API_BASE = import.meta.env.VITE_API_URL || ''

const TAG_CATEGORIES = {
  operations: {
    label: 'Operations',
    color: '#4a9eff',
    tags: ['Drilling', 'Tripping In', 'Tripping Out', 'Running Casing', 'Circulating', 'Connection', 'Reaming']
  },
  anomalies: {
    label: 'Anomalies',
    color: '#f43f5e',
    tags: ['Pressure Drop', 'Drilling Dysfunction', 'Kick Indicators', 'Losses', 'Pack-off', 'Washout', 'Stuck Pipe']
  },
  milestones: {
    label: 'Milestones',
    color: '#10b981',
    tags: ['Wear Bushing Installed', 'Reached TD', 'Bumped Floats', 'POOH Started', 'Casing Landed', 'Cement Started', 'BOP Tested']
  },
  notes: {
    label: 'Notes',
    color: '#8b5cf6',
    tags: ['Review Needed', 'Interesting Pattern', 'Training Example', 'Question']
  }
}

// Auto-calculate resolution based on time window
// Target ~1500 data points for smooth rendering
const calculateResolution = (startDate, endDate) => {
  if (!startDate || !endDate) return 10
  
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  const durationMs = end - start
  const durationHours = durationMs / (1000 * 60 * 60)
  
  // Resolution table (target ~1500 points)
  // Duration → Resolution
  if (durationHours <= 1) return 1        // 1 hour → 1 sec (3600 pts max)
  if (durationHours <= 4) return 5        // 4 hours → 5 sec (2880 pts)
  if (durationHours <= 12) return 15      // 12 hours → 15 sec (2880 pts)
  if (durationHours <= 24) return 30      // 24 hours → 30 sec (2880 pts)
  if (durationHours <= 48) return 60      // 2 days → 1 min (2880 pts)
  if (durationHours <= 96) return 120     // 4 days → 2 min (2880 pts)
  if (durationHours <= 168) return 300    // 1 week → 5 min (2016 pts)
  return 600                               // > 1 week → 10 min
}

const formatResolution = (seconds) => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${seconds / 60}m`
  return `${seconds / 3600}h`
}

// Channel definitions with axis assignment
// axis: 'left' for primary (depth/load), 'right' for secondary (pressure/flow)
const CHANNELS = [
  { key: 'hkld', label: 'Hookload', color: '#4a9eff', unit: 'kN', group: 'load' },
  { key: 'wob', label: 'WOB', color: '#f59e0b', unit: 'kN', group: 'load' },
  { key: 'rpm', label: 'RPM', color: '#10b981', unit: 'rpm', group: 'rotation' },
  { key: 'spp', label: 'Standpipe', color: '#f43f5e', unit: 'kPa', group: 'pressure' },
  { key: 'flow_in', label: 'Flow In', color: '#8b5cf6', unit: 'm³/min', group: 'flow' },
  { key: 'bit_depth', label: 'Bit Depth', color: '#06b6d4', unit: 'm', group: 'depth' },
  { key: 'rop', label: 'ROP', color: '#84cc16', unit: 'm/hr', group: 'rate' }
]

// Build unit-group axes from selected channels
// Returns array of { id, unit, orientation, color, channels[] }
const buildUnitAxes = (selectedChannels) => {
  const groupMap = {}
  selectedChannels.forEach(chKey => {
    const ch = CHANNELS.find(c => c.key === chKey)
    if (!ch) return
    if (!groupMap[ch.group]) {
      groupMap[ch.group] = { id: ch.group, unit: ch.unit, color: ch.color, channels: [] }
    }
    groupMap[ch.group].channels.push(ch)
  })
  const axes = Object.values(groupMap)
  // Alternate left/right positioning
  axes.forEach((ax, i) => { ax.orientation = i % 2 === 0 ? 'left' : 'right' })
  return axes
}

// Calculate domain for a single unit-group axis
const calculateGroupDomain = (data, channels) => {
  let min = Infinity, max = -Infinity
  channels.forEach(ch => {
    data.forEach(d => {
      const val = d[ch.key]
      if (val !== null && val !== undefined && !isNaN(val)) {
        const abs = Math.abs(val)
        min = Math.min(min, abs)
        max = Math.max(max, abs)
      }
    })
  })
  if (min === Infinity) return [0, 100]
  const range = max - min
  const padding = range * 0.1
  return [
    min >= 0 && min < max * 0.3 ? 0 : Math.max(0, Math.floor(min - padding)),
    Math.ceil(max + padding)
  ]
}

// Rig state definitions with colors
// Keys match Layer 2 macro states from silver.edr_1s.op_mode
const RIG_STATES = {
  drilling:    { label: 'Drilling',     color: '#10b981', short: 'DRL' },
  sliding:     { label: 'Sliding',      color: '#059669', short: 'SLD' },
  connection:  { label: 'Connection',   color: '#ec4899', short: 'CON' },
  trip_out:    { label: 'Trip Out',     color: '#f97316', short: 'TOH' },
  trip_in:     { label: 'Trip In',      color: '#f59e0b', short: 'TIH' },
  reaming:     { label: 'Reaming',      color: '#8b5cf6', short: 'REM' },
  reaming_up:  { label: 'Ream Up',      color: '#7c3aed', short: 'RMU' },
  reaming_down:{ label: 'Ream Down',    color: '#6d28d9', short: 'RMD' },
  circulating: { label: 'Circulating',  color: '#3b82f6', short: 'CIR' },
  in_slips:    { label: 'In Slips',     color: '#6b7280', short: 'SLP' },
  bha_handling:{ label: 'BHA Handling', color: '#06b6d4', short: 'BHA' },
  off_bottom:  { label: 'Off Bottom',   color: '#9ca3af', short: 'OFB' },
  data_gap:    { label: 'Data Gap',     color: '#1f2937', short: 'GAP' },
  unknown:     { label: 'Unknown',      color: '#374151', short: '???' }
}

// Operational mode definitions (higher-level activities)
// Keys match silver.rig_state.operational_mode
const OPERATIONAL_MODES = {
  DRILLING:      { label: 'Drilling',      color: '#10b981', short: 'DRL' },
  TRIPPING_IN:   { label: 'Tripping In',   color: '#3b82f6', short: 'TIH' },
  TRIPPING_OUT:  { label: 'Tripping Out',  color: '#8b5cf6', short: 'TOH' },
  REAMING:       { label: 'Reaming',       color: '#f59e0b', short: 'REM' },
  CIRCULATING:   { label: 'Circulating',   color: '#06b6d4', short: 'CIR' },
  CONNECTION:    { label: 'Connection',    color: '#ec4899', short: 'CON' },
  IN_SLIPS:      { label: 'In Slips',      color: '#6b7280', short: 'SLP' },
  BHA_HANDLING:  { label: 'BHA Handling',  color: '#14b8a6', short: 'BHA' },
  DATA_GAP:      { label: 'Data Gap',      color: '#1f2937', short: 'GAP' },
  unknown:       { label: 'Unknown',       color: '#374151', short: '???' }
}

// Analysis Templates - pre-configured channel groups for different analysis types
// Each template defines: channels to display, description, and AI analysis hooks
const ANALYSIS_TEMPLATES = {
  drilling: {
    label: '🔩 Drilling',
    desc: 'Standard drilling parameters',
    channels: ['wob', 'rpm', 'rop', 'spp', 'flow_in'],
    aiPrompt: 'Analyze drilling efficiency, look for drilling dysfunction, vibration patterns, and ROP optimization opportunities'
  },
  connections: {
    label: '🔗 Connections', 
    desc: 'Connection time analysis',
    channels: ['hkld', 'spp', 'flow_in', 'rpm'],
    aiPrompt: 'Identify connection events, calculate connection times, flag slow connections or anomalies'
  },
  trips: {
    label: '🔄 Trips',
    desc: 'Tripping operations',
    channels: ['hkld', 'bit_depth', 'spp'],
    aiPrompt: 'Analyze tripping speed, identify overpull/slackoff events, detect tight spots, flag stuck pipe indicators'
  },
  motors: {
    label: '⚙️ Motors',
    desc: 'Downhole motor performance',
    channels: ['wob', 'rpm', 'rop', 'spp', 'flow_in'],
    aiPrompt: 'Evaluate motor performance, stall detection, differential pressure analysis, motor life indicators'
  },
  hydraulics: {
    label: '💧 Hydraulics',
    desc: 'Hydraulics and ECD',
    channels: ['spp', 'flow_in', 'bit_depth'],
    aiPrompt: 'Analyze pump performance, ECD estimation, flow/pressure correlation, losses detection'
  },
  wellControl: {
    label: '⚠️ Well Control',
    desc: 'Kick/loss indicators',
    channels: ['spp', 'flow_in', 'hkld', 'bit_depth'],
    aiPrompt: 'Monitor for kick indicators, flow differential, pit gain/loss, pressure anomalies, background gas trends'
  },
  custom: {
    label: '✏️ Custom',
    desc: 'Your saved view',
    channels: [], // Loaded from localStorage
    aiPrompt: 'General analysis of selected parameters'
  }
}

// Calculate min/max per channel for normalization
const calculateChannelRanges = (data, channels) => {
  const ranges = {}
  
  if (!data || data.length === 0) return ranges
  
  channels.forEach(chKey => {
    let min = Infinity, max = -Infinity
    data.forEach(d => {
      const val = d[chKey]
      if (val !== null && val !== undefined && !isNaN(val)) {
        const absVal = Math.abs(val)
        min = Math.min(min, absVal)
        max = Math.max(max, absVal)
      }
    })
    if (min !== Infinity) {
      ranges[chKey] = { min, max, range: max - min || 1 }
    }
  })
  
  return ranges
}

// Normalize data - scale each channel to 0-100 for overlay display
const normalizeData = (data, channels, ranges) => {
  if (!data || !ranges) return data
  
  return data.map(d => {
    const normalized = { ...d }
    channels.forEach(chKey => {
      const r = ranges[chKey]
      if (r && d[chKey] !== null && d[chKey] !== undefined) {
        const absVal = Math.abs(d[chKey])
        // Normalize to 0-100 scale
        normalized[chKey] = ((absVal - r.min) / r.range) * 100
      }
    })
    return normalized
  })
}

// Calculate axis domains from data (for non-normalized mode)
const calculateAxisDomains = (data, channels) => {
  const domains = { left: [Infinity, -Infinity], right: [Infinity, -Infinity] }
  
  if (!data || data.length === 0) return { left: [0, 100], right: [0, 100] }
  
  channels.forEach(ch => {
    const channel = CHANNELS.find(c => c.key === ch)
    if (!channel) return
    
    data.forEach(d => {
      const val = d[ch]
      if (val !== null && val !== undefined && !isNaN(val)) {
        // Use absolute value for domain calculation
        const absVal = Math.abs(val)
        domains[channel.axis][0] = Math.min(domains[channel.axis][0], absVal)
        domains[channel.axis][1] = Math.max(domains[channel.axis][1], absVal)
      }
    })
  })
  
  // Add padding and nice rounding - always start from 0 for positive data
  Object.keys(domains).forEach(axis => {
    if (domains[axis][0] === Infinity) {
      domains[axis] = [0, 100]
    } else {
      const min = domains[axis][0]
      const max = domains[axis][1]
      const range = max - min
      const padding = range * 0.15 // 15% padding for better visibility
      
      // For positive drilling data, start axis at 0 if minimum is relatively small
      // This ensures we never cut off the bottom of traces
      if (min >= 0 && min < max * 0.3) {
        // Start at 0 if min is less than 30% of max
        domains[axis][0] = 0
      } else {
        // Otherwise pad below the minimum
        domains[axis][0] = Math.max(0, Math.floor((min - padding) / 10) * 10)
      }
      
      // Pad above the maximum
      domains[axis][1] = Math.ceil((max + padding) / 10) * 10
    }
  })
  
  return domains
}

// Tag Panel Component
function TagPanel({ selectionStart, selectionEnd, wellName, section, onSave, onClose, formatTime, categories }) {
  const [note, setNote] = useState('')
  const [context, setContext] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('notes')
  const [selectedTag, setSelectedTag] = useState('')
  
  const handleSave = () => {
    if (!note.trim() && !selectedTag) return
    
    onSave({
      category: selectedCategory,
      tag: selectedTag || 'Note',
      label: note.trim() || selectedTag,
      context: context.trim(),
      well_name: wellName,
      section: section
    })
    
    setNote('')
    setContext('')
    setSelectedTag('')
  }
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '400px',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      maxHeight: '80vh',
      overflowY: 'auto'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ fontWeight: 600, margin: 0 }}>🏷️ Tag Event</h3>
        <button onClick={onClose} style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '18px'
        }}>✕</button>
      </div>
      
      {/* Time Range */}
      <div style={{ 
        fontSize: '12px', 
        color: 'var(--text-muted)', 
        marginBottom: '16px',
        padding: '10px 12px',
        background: 'var(--bg)',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>⏱️ {formatTime(selectionStart)} → {formatTime(selectionEnd)}</span>
        {section && <span style={{ color: 'var(--accent)' }}>{section}</span>}
      </div>
      
      {/* Quick Tags by Category */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Quick Tags (click to select)
        </div>
        {Object.entries(categories).map(([catKey, cat]) => (
          <div key={catKey} style={{ marginBottom: '10px' }}>
            <div style={{ 
              fontSize: '10px', 
              fontWeight: 600, 
              color: cat.color,
              marginBottom: '4px',
              textTransform: 'uppercase'
            }}>
              {cat.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {cat.tags.map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    setSelectedCategory(catKey)
                    setSelectedTag(tag)
                    if (!note) setNote(tag)
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '10px',
                    border: `1px solid ${selectedTag === tag ? cat.color : 'var(--border)'}`,
                    background: selectedTag === tag ? cat.color : 'transparent',
                    color: selectedTag === tag ? '#fff' : cat.color,
                    fontSize: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Note Input */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
          Event Label / Note *
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g., Pressure spike during connection"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '13px'
          }}
        />
      </div>
      
      {/* Context / Description */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
          Context / What was happening?
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Add any additional context about this event... What were the crew doing? What might have caused this? What was the outcome?"
          rows={3}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '12px',
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
        />
      </div>
      
      {/* Category Override */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
          Category
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: '#1a1a2e',
            color: '#e0e0e0',
            fontSize: '12px'
          }}
        >
          {Object.entries(categories).map(([key, cat]) => (
            <option key={key} value={key} style={{ background: '#1a1a2e' }}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>
      
      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={!note.trim() && !selectedTag}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          border: 'none',
          background: (!note.trim() && !selectedTag) ? 'var(--border)' : 'var(--accent)',
          color: '#fff',
          fontWeight: 600,
          fontSize: '14px',
          cursor: (!note.trim() && !selectedTag) ? 'not-allowed' : 'pointer'
        }}
      >
        💾 Save Tag
      </button>
    </div>
  )
}

// Rig State Timeline Component
function RigStateTimeline({ data, viewWindow, onSelect, stateField = 'rig_state', stateDefinitions = RIG_STATES, title }) {
  const containerRef = useRef(null)
  const [hoverState, setHoverState] = useState(null)
  const [hoverX, setHoverX] = useState(0)
  
  if (!data || data.length === 0) return null
  
  // Get time range
  const startTime = viewWindow?.start 
    ? new Date(viewWindow.start).getTime() 
    : new Date(data[0]?.timestamp).getTime()
  const endTime = viewWindow?.end 
    ? new Date(viewWindow.end).getTime() 
    : new Date(data[data.length - 1]?.timestamp).getTime()
  const duration = endTime - startTime
  
  // Group consecutive states into segments
  const segments = []
  let currentState = null
  let segmentStart = null
  
  data.forEach((d, i) => {
    const state = d[stateField] || 'unknown'
    const time = new Date(d.timestamp).getTime()
    
    // Skip if outside view window
    if (time < startTime || time > endTime) return
    
    if (state !== currentState) {
      if (currentState !== null) {
        segments.push({
          state: currentState,
          start: segmentStart,
          end: time
        })
      }
      currentState = state
      segmentStart = time
    }
  })
  
  // Close final segment
  if (currentState !== null) {
    segments.push({
      state: currentState,
      start: segmentStart,
      end: endTime
    })
  }
  
  const handleMouseMove = (e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width
    const time = startTime + (duration * ratio)
    
    // Find state at this time
    const segment = segments.find(s => time >= s.start && time < s.end)
    if (segment) {
      setHoverState(segment.state)
      setHoverX(x)
    }
  }
  
  return (
    <div style={{ marginTop: '8px' }}>
      {/* Title */}
      {title && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>
          {title}
        </div>
      )}
      
      {/* Legend */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '6px', 
        flexWrap: 'wrap',
        fontSize: '10px'
      }}>
        {Object.entries(stateDefinitions).map(([key, state]) => {
          const hasState = segments.some(s => s.state === key)
          if (!hasState) return null
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                background: state.color, 
                borderRadius: '2px' 
              }} />
              <span style={{ color: 'var(--text-muted)' }}>{state.label}</span>
            </div>
          )
        })}
      </div>
      
      {/* Timeline bar */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverState(null)}
        style={{ 
          height: '24px', 
          background: 'var(--bg)', 
          borderRadius: '4px',
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'crosshair'
        }}
      >
        {segments.map((seg, i) => {
          const left = ((seg.start - startTime) / duration) * 100
          const width = ((seg.end - seg.start) / duration) * 100
          const stateInfo = stateDefinitions[seg.state] || stateDefinitions.unknown
          
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                height: '100%',
                background: stateInfo.color,
                borderRight: '1px solid var(--bg-secondary)',
                transition: 'opacity 0.1s'
              }}
              title={`${stateInfo.label}: ${new Date(seg.start).toLocaleTimeString()} - ${new Date(seg.end).toLocaleTimeString()}`}
            />
          )
        })}
        
        {/* Hover tooltip */}
        {hoverState && (
          <div style={{
            position: 'absolute',
            left: hoverX,
            top: '-24px',
            transform: 'translateX(-50%)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '10px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}>
            {stateDefinitions[hoverState]?.label || hoverState}
          </div>
        )}
      </div>
    </div>
  )
}

export default function EDRTagger() {
  const navigate = useNavigate()
  const [rigs, setRigs] = useState([])
  // Restore cached selections from localStorage
  const [selectedRig, setSelectedRig] = useState(() => {
    try { return localStorage.getItem('edrTagger_rig') || null } catch { return null }
  })
  const [wells, setWells] = useState([])
  const [selectedWell, setSelectedWell] = useState(() => {
    try { return localStorage.getItem('edrTagger_well') || null } catch { return null }
  })
  const [wellDetails, setWellDetails] = useState(null)
  const [sections, setSections] = useState([])
  const [selectedSection, setSelectedSection] = useState(() => {
    try { return localStorage.getItem('edrTagger_section') || null } catch { return null }
  })
  const [edrData, setEdrData] = useState([])
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingWells, setLoadingWells] = useState(false)
  const [selectedChannels, setSelectedChannels] = useState(() => {
    try { 
      const cached = localStorage.getItem('edrTagger_channels')
      return cached ? JSON.parse(cached) : ['hkld', 'wob', 'spp']
    } catch { return ['hkld', 'wob', 'spp'] }
  })
  const [activeTemplate, setActiveTemplate] = useState(() => {
    try { return localStorage.getItem('edrTagger_template') || null } catch { return null }
  })
  const [normalizeChannels, setNormalizeChannels] = useState(true) // Default to normalized for better multi-channel view
  
  // Selection state
  const [selecting, setSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [selectionEnd, setSelectionEnd] = useState(null)
  const [showTagPanel, setShowTagPanel] = useState(false)
  
  // Date range
  const [startDate, setStartDate] = useState(() => {
    try { return localStorage.getItem('edrTagger_startDate') || '' } catch { return '' }
  })
  const [endDate, setEndDate] = useState(() => {
    try { return localStorage.getItem('edrTagger_endDate') || '' } catch { return '' }
  })
  
  // Chart ref for screenshot
  const chartRef = useRef(null)
  
  // Zoom state - view window can be different from loaded data range
  const [viewWindow, setViewWindow] = useState({ start: null, end: null })
  const [zoomHistory, setZoomHistory] = useState([]) // for undo
  const [prefetchCache, setPrefetchCache] = useState({}) // { resolution: data }
  const [isPrefetching, setIsPrefetching] = useState(false)
  const [zoomDirection, setZoomDirection] = useState(null) // 'in' | 'out' | null
  
  // Debounce timer for zoom data fetch
  const zoomFetchTimer = useRef(null)
  const lastZoomTime = useRef(0)
  
  // Track initial mount for cache restoration
  const isInitialMount = useRef(true)
  
  // Persist selections to localStorage
  useEffect(() => {
    try {
      if (selectedRig) localStorage.setItem('edrTagger_rig', selectedRig)
      else localStorage.removeItem('edrTagger_rig')
    } catch {}
  }, [selectedRig])
  
  useEffect(() => {
    try {
      if (selectedWell) localStorage.setItem('edrTagger_well', selectedWell)
      else localStorage.removeItem('edrTagger_well')
    } catch {}
  }, [selectedWell])
  
  useEffect(() => {
    try {
      if (selectedSection) localStorage.setItem('edrTagger_section', selectedSection)
      else localStorage.removeItem('edrTagger_section')
    } catch {}
  }, [selectedSection])
  
  useEffect(() => {
    try {
      if (startDate) localStorage.setItem('edrTagger_startDate', startDate)
      if (endDate) localStorage.setItem('edrTagger_endDate', endDate)
    } catch {}
  }, [startDate, endDate])
  
  useEffect(() => {
    try {
      localStorage.setItem('edrTagger_channels', JSON.stringify(selectedChannels))
    } catch {}
  }, [selectedChannels])
  
  useEffect(() => {
    try {
      if (activeTemplate) localStorage.setItem('edrTagger_template', activeTemplate)
      else localStorage.removeItem('edrTagger_template')
    } catch {}
  }, [activeTemplate])
  
  // Apply analysis template
  const applyTemplate = (templateKey) => {
    if (templateKey === activeTemplate) {
      // Toggle off - go back to custom
      setActiveTemplate(null)
      return
    }
    
    const template = ANALYSIS_TEMPLATES[templateKey]
    if (template && template.channels.length > 0) {
      setSelectedChannels(template.channels)
      setActiveTemplate(templateKey)
    }
  }
  
  // Save current channels as custom template
  const saveAsCustom = () => {
    try {
      localStorage.setItem('edrTagger_customChannels', JSON.stringify(selectedChannels))
      ANALYSIS_TEMPLATES.custom.channels = selectedChannels
      setActiveTemplate('custom')
    } catch {}
  }
  
  // Load custom template on mount
  useEffect(() => {
    try {
      const custom = localStorage.getItem('edrTagger_customChannels')
      if (custom) ANALYSIS_TEMPLATES.custom.channels = JSON.parse(custom)
    } catch {}
  }, [])
  
  // Load rigs on mount
  useEffect(() => {
    loadRigs()
  }, [])
  
  // Load wells when rig changes
  useEffect(() => {
    if (selectedRig) {
      loadWells(selectedRig)
      // Only clear well selection if not initial mount (user changed rig)
      if (!isInitialMount.current) {
        setSelectedWell(null)
      }
    } else {
      setWells([])
      setSelectedWell(null)
    }
    isInitialMount.current = false
  }, [selectedRig])
  
  // Load well details when well changes
  useEffect(() => {
    if (selectedWell) {
      loadWellDetails(selectedWell)
    } else {
      setWellDetails(null)
    }
  }, [selectedWell])
  
  const loadRigs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/nov/rigs`)
      if (res.ok) {
        const data = await res.json()
        setRigs(data.rigs || [])
      }
    } catch (err) {
      console.error('Failed to load rigs:', err)
    }
  }
  
  const loadWells = async (rig) => {
    setLoadingWells(true)
    try {
      const res = await fetch(`${API_BASE}/api/nov/wells?rig=${encodeURIComponent(rig)}`)
      if (res.ok) {
        const data = await res.json()
        setWells(data.wells || [])
      }
    } catch (err) {
      console.error('Failed to load wells:', err)
    } finally {
      setLoadingWells(false)
    }
  }
  
  const loadWellDetails = async (wellId) => {
    try {
      const res = await fetch(`${API_BASE}/api/nov/wells/${wellId}`)
      if (res.ok) {
        const data = await res.json()
        setWellDetails(data.well)
        
        // Extract drilling phases/sections
        const phases = data.well?.drilling_phases || []
        setSections(phases)
        setSelectedSection(null)
        setStartDate('')
        setEndDate('')
        
        // If no phases, fall back to well dates
        if (phases.length === 0 && data.well?.first_data_date) {
          setStartDate(data.well.first_data_date.slice(0, 16))
          if (data.well?.last_data_date) {
            setEndDate(data.well.last_data_date.slice(0, 16))
          }
        }
      }
    } catch (err) {
      console.error('Failed to load well details:', err)
    }
  }
  
  // Handle section selection
  const handleSectionChange = (sectionName) => {
    setSelectedSection(sectionName)
    const section = sections.find(s => s.section === sectionName)
    if (section) {
      // Format dates for datetime-local input
      const startStr = new Date(section.start_date).toISOString().slice(0, 16)
      const endStr = new Date(section.end_date).toISOString().slice(0, 16)
      setStartDate(startStr)
      setEndDate(endStr)
    }
    setEdrData([])
  }
  
  const [currentResolution, setCurrentResolution] = useState(10)
  const [queryTime, setQueryTime] = useState(null)
  
  const loadEDRData = async () => {
    if (!selectedWell || !startDate || !endDate) return
    
    // Get licence from well details
    const licence = wellDetails?.licence_number
    if (!licence) {
      alert('Well licence not found')
      return
    }
    
    setLoading(true)
    setQueryTime(null)
    try {
      // Calculate optimal resolution based on time window
      const resolution = calculateResolution(startDate, endDate)
      setCurrentResolution(resolution)
      
      // Use TimescaleDB endpoint for speed
      const res = await fetch(
        `${API_BASE}/api/ts/edr/${licence}?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}&resolution=${resolution}`
      )
      if (res.ok) {
        const data = await res.json()
        setEdrData(data.data || [])
        setQueryTime(data.queryTimeMs)
        // Reset zoom state on new data load
        setViewWindow({ start: null, end: null })
        setZoomHistory([])
        setPrefetchCache({})
        console.log(`Loaded ${data.count} points in ${data.queryTimeMs}ms from ${data.table}`)
      } else {
        const err = await res.json()
        console.error('EDR load error:', err)
        alert(`Failed to load EDR: ${err.error}`)
      }
    } catch (err) {
      console.error('Failed to load EDR:', err)
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  const loadTags = async () => {
    if (!selectedWell) return
    try {
      const res = await fetch(`${API_BASE}/api/edr-tags?well=${selectedWell}`)
      if (res.ok) {
        const data = await res.json()
        setTags(data.tags || [])
      }
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  }
  
  const saveTag = async (tagData) => {
    try {
      // Capture chart screenshot
      let screenshot = null
      if (chartRef.current) {
        try {
          const canvas = await html2canvas(chartRef.current, {
            backgroundColor: '#1a1a2e',
            scale: 1.5
          })
          screenshot = canvas.toDataURL('image/png')
        } catch (err) {
          console.warn('Screenshot capture failed:', err)
        }
      }
      
      const res = await fetch(`${API_BASE}/api/edr-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          well_id: selectedWell,
          well_name: wellDetails?.well_name,
          rig_name: wellDetails?.rig_name,
          section: selectedSection,
          start_time: selectionStart,
          end_time: selectionEnd,
          screenshot,
          ...tagData
        })
      })
      if (res.ok) {
        loadTags()
        setShowTagPanel(false)
        setSelectionStart(null)
        setSelectionEnd(null)
      } else {
        const err = await res.json()
        alert(`Failed to save: ${err.error}`)
      }
    } catch (err) {
      console.error('Failed to save tag:', err)
      alert(`Error: ${err.message}`)
    }
  }
  
  // Chart mouse handlers for selection
  const handleMouseDown = (e) => {
    if (e && e.activeLabel) {
      setSelecting(true)
      setSelectionStart(e.activeLabel)
      setSelectionEnd(e.activeLabel)
    }
  }
  
  const handleMouseMove = (e) => {
    if (selecting && e && e.activeLabel) {
      setSelectionEnd(e.activeLabel)
    }
  }
  
  const handleMouseUp = () => {
    if (selecting && selectionStart && selectionEnd) {
      setSelecting(false)
      if (selectionStart !== selectionEnd) {
        setShowTagPanel(true)
      }
    }
  }
  
  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleTimeString()
  }
  
  // ========== POINTER-CENTERED ZOOM ==========
  
  // Fetch data for a specific time window
  const fetchDataForWindow = async (windowStart, windowEnd, resolution) => {
    if (!selectedWell || !wellDetails?.licence_number) return null
    
    try {
      const res = await fetch(
        `${API_BASE}/api/ts/edr/${wellDetails.licence_number}?start=${encodeURIComponent(new Date(windowStart).toISOString())}&end=${encodeURIComponent(new Date(windowEnd).toISOString())}&resolution=${resolution}`
      )
      if (res.ok) {
        const data = await res.json()
        return data.data || []
      }
    } catch (err) {
      console.error('Zoom data fetch error:', err)
    }
    return null
  }
  
  // Predict next zoom level and prefetch (uses local model)
  const predictAndPrefetch = async (direction, currentWindow) => {
    if (isPrefetching) return
    
    // Calculate adjacent resolutions to prefetch
    const currentRes = calculateResolution(currentWindow.start, currentWindow.end)
    const duration = new Date(currentWindow.end).getTime() - new Date(currentWindow.start).getTime()
    
    // Predict: if zooming in, prefetch finer resolution; if out, coarser
    let prefetchWindow
    if (direction === 'in') {
      // Predict 50% zoom in
      const newDuration = duration * 0.5
      const center = new Date(currentWindow.start).getTime() + duration / 2
      prefetchWindow = {
        start: center - newDuration / 2,
        end: center + newDuration / 2
      }
    } else {
      // Predict 50% zoom out
      const newDuration = duration * 2
      const center = new Date(currentWindow.start).getTime() + duration / 2
      prefetchWindow = {
        start: center - newDuration / 2,
        end: center + newDuration / 2
      }
    }
    
    const prefetchRes = calculateResolution(prefetchWindow.start, prefetchWindow.end)
    
    // Only prefetch if resolution changes
    if (prefetchRes !== currentRes && !prefetchCache[prefetchRes]) {
      setIsPrefetching(true)
      console.log(`🔮 Prefetching ${formatResolution(prefetchRes)} resolution...`)
      
      const data = await fetchDataForWindow(prefetchWindow.start, prefetchWindow.end, prefetchRes)
      if (data) {
        setPrefetchCache(prev => ({ ...prev, [prefetchRes]: { data, window: prefetchWindow } }))
      }
      setIsPrefetching(false)
    }
  }
  
  // Handle mouse wheel zoom - centers on pointer
  const handleWheel = (e) => {
    if (!edrData.length || !chartRef.current) return
    
    e.preventDefault()
    
    const now = Date.now()
    const ZOOM_THROTTLE = 50 // ms between zoom updates
    if (now - lastZoomTime.current < ZOOM_THROTTLE) return
    lastZoomTime.current = now
    
    // Zoom factor: scroll down = zoom out, scroll up = zoom in
    const zoomFactor = e.deltaY > 0 ? 1.25 : 0.8
    const direction = e.deltaY > 0 ? 'out' : 'in'
    setZoomDirection(direction)
    
    // Get mouse position as percentage of chart width
    const rect = chartRef.current.getBoundingClientRect()
    const mouseXRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    
    // Current view window (or full data range if no zoom yet)
    const currentStart = viewWindow.start 
      ? new Date(viewWindow.start).getTime() 
      : new Date(edrData[0]?.timestamp).getTime()
    const currentEnd = viewWindow.end 
      ? new Date(viewWindow.end).getTime() 
      : new Date(edrData[edrData.length - 1]?.timestamp).getTime()
    
    const duration = currentEnd - currentStart
    const newDuration = duration * zoomFactor
    
    // Mouse position in time (this point stays fixed under the cursor)
    const mouseTime = currentStart + (duration * mouseXRatio)
    
    // Calculate new window keeping mouse position fixed
    const newStart = mouseTime - (newDuration * mouseXRatio)
    const newEnd = mouseTime + (newDuration * (1 - mouseXRatio))
    
    // Clamp to original data bounds
    const dataStart = new Date(startDate).getTime()
    const dataEnd = new Date(endDate).getTime()
    const clampedStart = Math.max(dataStart, newStart)
    const clampedEnd = Math.min(dataEnd, newEnd)
    
    // Minimum zoom: 1 minute
    if (clampedEnd - clampedStart < 60000) return
    
    // Save to history for undo
    setZoomHistory(prev => [...prev.slice(-10), { start: currentStart, end: currentEnd }])
    
    // Update view window
    const newWindow = {
      start: new Date(clampedStart).toISOString(),
      end: new Date(clampedEnd).toISOString()
    }
    setViewWindow(newWindow)
    
    // Check if resolution needs to change
    const newResolution = calculateResolution(clampedStart, clampedEnd)
    
    // Debounce data fetch (wait for zoom to settle)
    if (zoomFetchTimer.current) clearTimeout(zoomFetchTimer.current)
    
    if (newResolution !== currentResolution) {
      // Check prefetch cache first
      if (prefetchCache[newResolution]) {
        console.log(`⚡ Using prefetched ${formatResolution(newResolution)} data!`)
        setEdrData(prefetchCache[newResolution].data)
        setCurrentResolution(newResolution)
      } else {
        // Fetch new resolution after short delay
        zoomFetchTimer.current = setTimeout(async () => {
          console.log(`📊 Fetching ${formatResolution(newResolution)} data...`)
          setLoading(true)
          const data = await fetchDataForWindow(clampedStart, clampedEnd, newResolution)
          if (data) {
            setEdrData(data)
            setCurrentResolution(newResolution)
          }
          setLoading(false)
          
          // Trigger prefetch for predicted next zoom
          predictAndPrefetch(direction, newWindow)
        }, 150)
      }
    } else {
      // Same resolution, just trigger prefetch prediction
      predictAndPrefetch(direction, newWindow)
    }
  }
  
  // Reset zoom
  const resetZoom = () => {
    setViewWindow({ start: null, end: null })
    setZoomHistory([])
    setPrefetchCache({})
    loadEDRData() // Reload original data
  }
  
  // Undo last zoom
  const undoZoom = () => {
    if (zoomHistory.length === 0) return
    const prev = zoomHistory[zoomHistory.length - 1]
    setZoomHistory(hist => hist.slice(0, -1))
    setViewWindow({
      start: new Date(prev.start).toISOString(),
      end: new Date(prev.end).toISOString()
    })
  }
  
  // Filter visible data based on view window
  const filteredData = viewWindow.start && viewWindow.end
    ? edrData.filter(d => {
        const t = new Date(d.timestamp).getTime()
        const start = new Date(viewWindow.start).getTime()
        const end = new Date(viewWindow.end).getTime()
        return t >= start && t <= end
      })
    : edrData
  
  // Transform all channel values to absolute (positive)
  const absoluteData = filteredData.map(d => {
    const transformed = { ...d }
    CHANNELS.forEach(ch => {
      if (transformed[ch.key] !== null && transformed[ch.key] !== undefined) {
        transformed[ch.key] = Math.abs(transformed[ch.key])
      }
    })
    return transformed
  })
  
  // Calculate channel ranges for normalization and tooltip display
  const channelRanges = calculateChannelRanges(absoluteData, selectedChannels)
  
  // Apply normalization if enabled (scales each channel to 0-100%)
  const visibleData = normalizeChannels
    ? normalizeData(absoluteData, selectedChannels, channelRanges)
    : absoluteData

  // Build per-unit-group axes for the currently selected channels
  const unitAxes = buildUnitAxes(selectedChannels)
  
  // ========== END ZOOM ==========
  
  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            color: 'var(--text)',
            fontSize: '16px',
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Back"
        >
          ←
        </button>
        <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
          EDR Event Tagger
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Review drilling data, tag events, train the model
        </p>
        </div>
      </div>
      
      {/* Controls */}
      <div style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        marginBottom: '20px',
        padding: '16px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--border)'
      }}>
        {/* Rig Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rig</label>
          <select
            value={selectedRig || ''}
            onChange={(e) => {
              setSelectedRig(e.target.value)
              setSelectedWell(null)
              setEdrData([])
            }}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: '#1a1a2e',
              color: '#e0e0e0',
              minWidth: '120px',
              cursor: 'pointer'
            }}
          >
            <option value="" style={{ background: '#1a1a2e', color: '#e0e0e0' }}>Select Rig...</option>
            {rigs.map(rig => (
              <option key={rig} value={rig} style={{ background: '#1a1a2e', color: '#e0e0e0' }}>Rig {rig}</option>
            ))}
          </select>
        </div>
        
        {/* Well Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Well</label>
          <select
            value={selectedWell || ''}
            onChange={(e) => {
              setSelectedWell(e.target.value)
              setEdrData([])
            }}
            disabled={!selectedRig || loadingWells}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: '#1a1a2e',
              color: '#e0e0e0',
              minWidth: '300px',
              opacity: (!selectedRig || loadingWells) ? 0.5 : 1,
              cursor: 'pointer'
            }}
          >
            <option value="" style={{ background: '#1a1a2e', color: '#e0e0e0' }}>{loadingWells ? 'Loading wells...' : 'Select Well...'}</option>
            {wells.map(w => (
              <option key={w._id} value={w._id} style={{ background: '#1a1a2e', color: '#e0e0e0' }}>
                {w.well_name} {w.job_status === 'Active' ? '🟢' : ''}
              </option>
            ))}
          </select>
        </div>
        
        {/* Section Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Section</label>
          <select
            value={selectedSection || ''}
            onChange={(e) => handleSectionChange(e.target.value)}
            disabled={!selectedWell || sections.length === 0}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: '#1a1a2e',
              color: '#e0e0e0',
              minWidth: '140px',
              opacity: (!selectedWell || sections.length === 0) ? 0.5 : 1,
              cursor: 'pointer'
            }}
          >
            <option value="" style={{ background: '#1a1a2e', color: '#e0e0e0' }}>
              {sections.length === 0 ? 'No sections' : 'Select Section...'}
            </option>
            {sections.map((s, i) => (
              <option key={i} value={s.section} style={{ background: '#1a1a2e', color: '#e0e0e0' }}>
                {s.section}
              </option>
            ))}
          </select>
        </div>
        
        {/* Date Range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Start</label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>End</label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'flex-end' }}>
          {startDate && endDate && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
              ~{formatResolution(calculateResolution(startDate, endDate))} res
            </span>
          )}
          <button
            onClick={loadEDRData}
            disabled={!selectedWell || !startDate || !endDate || loading}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: (!selectedWell || !startDate || !endDate || loading) ? 0.5 : 1
            }}
          >
            {loading ? 'Loading...' : '📊 Load Data'}
          </button>
        </div>
      </div>
      
      {/* Well Info Banner */}
      {wellDetails && (
        <div style={{
          display: 'flex',
          gap: '20px',
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '12px',
          flexWrap: 'wrap'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Well: </span>
            <span style={{ fontWeight: 600 }}>{wellDetails.well_name}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Rig: </span>
            <span>{wellDetails.rig_name}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Status: </span>
            <span style={{ color: wellDetails.job_status === 'Active' ? '#10b981' : 'var(--text)' }}>
              {wellDetails.job_status}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Data Range: </span>
            <span>{wellDetails.first_data_date?.slice(0,10)} → {wellDetails.last_data_date?.slice(0,10)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>EDR: </span>
            <span>{wellDetails.has_edr ? '✅' : '❌'}</span>
          </div>
        </div>
      )}
      
      {/* Analysis Template Selector */}
      <div style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        marginBottom: '12px',
        alignItems: 'center',
        padding: '10px 12px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border)'
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '6px' }}>
          📊 Analysis:
        </span>
        {Object.entries(ANALYSIS_TEMPLATES).filter(([k]) => k !== 'custom').map(([key, template]) => (
          <button
            key={key}
            onClick={() => applyTemplate(key)}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: activeTemplate === key ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: activeTemplate === key ? 'var(--accent)' : 'var(--bg)',
              color: activeTemplate === key ? '#fff' : 'var(--text)',
              fontWeight: activeTemplate === key ? 600 : 400,
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            title={template.desc}
          >
            {template.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button
            onClick={saveAsCustom}
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-muted)',
              fontSize: '10px',
              cursor: 'pointer'
            }}
            title="Save current channels as custom preset"
          >
            💾 Save
          </button>
          {activeTemplate && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', alignSelf: 'center' }}>
              {ANALYSIS_TEMPLATES[activeTemplate]?.desc}
            </span>
          )}
        </div>
      </div>
      
      {/* Channel Selector */}
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '16px',
        alignItems: 'center'
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>
          <span style={{ color: '#4a9eff' }}>◀ Left</span> | <span style={{ color: '#f43f5e' }}>Right ▶</span>
        </span>
        {CHANNELS.map(ch => (
          <button
            key={ch.key}
            onClick={() => {
              setSelectedChannels(prev => 
                prev.includes(ch.key) 
                  ? prev.filter(c => c !== ch.key)
                  : [...prev, ch.key]
              )
              setActiveTemplate(null) // Clear template when manually changing channels
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '16px',
              border: `2px solid ${ch.color}`,
              background: selectedChannels.includes(ch.key) ? ch.color : 'transparent',
              color: selectedChannels.includes(ch.key) ? '#fff' : ch.color,
              fontWeight: 500,
              fontSize: '12px',
              cursor: 'pointer',
              position: 'relative'
            }}
            title={`${ch.label} (${ch.unit})`}
          >
            {ch.label} <span style={{ fontSize: '10px', opacity: 0.7 }}>{ch.unit}</span>
          </button>
        ))}
        
        {/* Normalize toggle */}
        <button
          onClick={() => setNormalizeChannels(!normalizeChannels)}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: '8px',
            border: normalizeChannels ? '2px solid #10b981' : '1px solid var(--border)',
            background: normalizeChannels ? '#10b981' : 'var(--bg)',
            color: normalizeChannels ? '#fff' : 'var(--text-muted)',
            fontWeight: 500,
            fontSize: '11px',
            cursor: 'pointer'
          }}
          title="Normalize channels to 0-100% scale for better overlay"
        >
          📊 {normalizeChannels ? 'Normalized' : 'Absolute'}
        </button>
      </div>
      
      {/* Main Chart Area */}
      <div 
        ref={chartRef}
        onWheel={handleWheel}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
          cursor: edrData.length > 0 ? 'crosshair' : 'default'
        }}>
        {edrData.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '60px',
            color: 'var(--text-muted)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
            <div>Select a well and date range to load EDR data</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              Click and drag on the chart to select a time range for tagging
            </div>
          </div>
        ) : (
          <div>
            <div style={{ 
              marginBottom: '12px', 
              fontSize: '12px', 
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <span>
                {visibleData.length}/{edrData.length} points @ <span style={{ color: 'var(--accent)' }}>{formatResolution(currentResolution)}</span>
                {queryTime && <span style={{ color: '#10b981' }}> • {queryTime}ms ⚡</span>}
                {isPrefetching && <span style={{ color: '#f59e0b' }}> • 🔮 prefetching...</span>}
                {viewWindow.start && (
                  <span style={{ color: '#8b5cf6' }}> • zoomed</span>
                )}
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {viewWindow.start && (
                  <>
                    <button
                      onClick={undoZoom}
                      disabled={zoomHistory.length === 0}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        cursor: zoomHistory.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: zoomHistory.length === 0 ? 0.5 : 1
                      }}
                    >
                      ↩ Undo
                    </button>
                    <button
                      onClick={resetZoom}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 Reset
                    </button>
                  </>
                )}
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  🖱️ Scroll to zoom • Drag to select
                </span>
              </div>
            </div>
            
            <div style={{ height: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={visibleData}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={formatTime}
                    stroke="var(--text-muted)"
                    fontSize={10}
                  />
                  
                  {/* One Y-Axis per unit group */}
                  {unitAxes.map((ax, i) => (
                    <YAxis
                      key={ax.id}
                      yAxisId={ax.id}
                      orientation={ax.orientation}
                      stroke={ax.color}
                      fontSize={10}
                      width={50}
                      domain={normalizeChannels ? [0, 100] : calculateGroupDomain(absoluteData, ax.channels)}
                      label={normalizeChannels ? undefined : { value: ax.unit, angle: ax.orientation === 'left' ? -90 : 90, position: ax.orientation === 'left' ? 'insideLeft' : 'insideRight', style: { fill: ax.color, fontSize: 10 }, offset: -5 }}
                      tickFormatter={(v) => {
                        if (normalizeChannels) return `${Math.round(v)}%`
                        const abs = Math.abs(v)
                        return abs >= 10000 ? `${(abs/1000).toFixed(0)}k` : abs >= 1000 ? `${(abs/1000).toFixed(1)}k` : Number.isInteger(abs) ? abs : abs.toFixed(1)
                      }}
                    />
                  ))}
                  
                  <Tooltip 
                    contentStyle={{ 
                      background: 'var(--bg-secondary)', 
                      border: '1px solid var(--border)',
                      borderRadius: '8px'
                    }}
                    labelFormatter={(v) => new Date(v).toLocaleString()}
                    formatter={(value, name) => {
                      const ch = CHANNELS.find(c => c.label === name)
                      if (normalizeChannels && ch) {
                        // Convert normalized value back to actual value for tooltip
                        const r = channelRanges[ch.key]
                        if (r) {
                          const actual = r.min + (value / 100) * r.range
                          return [`${actual.toFixed(1)} ${ch.unit}`, name]
                        }
                      }
                      const absVal = Math.abs(value || 0)
                      return [absVal.toFixed(2) + (ch ? ` ${ch.unit}` : ''), name]
                    }}
                  />
                  
                  {selectedChannels.map(chKey => {
                    const ch = CHANNELS.find(c => c.key === chKey)
                    return ch ? (
                      <Line
                        key={ch.key}
                        type="monotone"
                        dataKey={ch.key}
                        stroke={ch.color}
                        dot={false}
                        strokeWidth={1.5}
                        name={ch.label}
                        yAxisId={ch.group}
                        connectNulls={false}
                      />
                    ) : null
                  })}
                  
                  {/* Selection highlight */}
                  {selectionStart && selectionEnd && unitAxes.length > 0 && (
                    <ReferenceArea
                      x1={selectionStart}
                      x2={selectionEnd}
                      yAxisId={unitAxes[0].id}
                      fill="var(--accent)"
                      fillOpacity={0.2}
                      stroke="var(--accent)"
                    />
                  )}

                  {/* Show existing tags */}
                  {tags.map((tag, i) => (
                    <ReferenceArea
                      key={i}
                      x1={tag.start_time}
                      x2={tag.end_time}
                      yAxisId={unitAxes.length > 0 ? unitAxes[0].id : 'load'}
                      fill={TAG_CATEGORIES[tag.category]?.color || '#888'}
                      fillOpacity={0.15}
                    />
                  ))}
                  
                  <Brush 
                    dataKey="timestamp" 
                    height={30} 
                    stroke="var(--accent)"
                    tickFormatter={formatTime}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* Rig State Timeline */}
            <RigStateTimeline 
              data={visibleData} 
              viewWindow={viewWindow}
              stateField="rig_state"
              stateDefinitions={RIG_STATES}
              title="Rig State"
            />
          </div>
        )}
      </div>
      
      {/* Tag Panel (shown when selection made) */}
      {showTagPanel && (
        <TagPanel
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          wellName={wellDetails?.well_name}
          section={selectedSection}
          onSave={saveTag}
          onClose={() => {
            setShowTagPanel(false)
            setSelectionStart(null)
            setSelectionEnd(null)
          }}
          formatTime={formatTime}
          categories={TAG_CATEGORIES}
        />
      )}
      
      {/* Tags List */}
      {tags.length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>
            📋 Tagged Events ({tags.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tags.map((tag, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                background: 'var(--bg)',
                borderRadius: '6px',
                borderLeft: `3px solid ${TAG_CATEGORIES[tag.category]?.color || '#888'}`
              }}>
                <span style={{ fontSize: '12px', fontWeight: 500 }}>{tag.label}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(tag.start_time).toLocaleString()} - {new Date(tag.end_time).toLocaleTimeString()}
                </span>
                <span style={{ 
                  marginLeft: 'auto',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: TAG_CATEGORIES[tag.category]?.color || '#888',
                  color: '#fff'
                }}>
                  {tag.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
