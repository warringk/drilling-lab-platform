import { useState, useMemo, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// ═══════════════════════════════════════════════════════════════════════════
// DRILLING LAB — DATABASE SCHEMA MAP (Live)
// ═══════════════════════════════════════════════════════════════════════════

// ── Schema Definitions (enrichment metadata) ──────────────────────────────

const COLLECTION_META = {
  nov_wells: {
    category: 'core',
    description: 'Well metadata — master well list from NOV WellData API',
    relations: ['nov_edr_raw_1second', 'nov_timelog', 'nov_bha_summaries'],
    keyFields: ['job_id', 'licence_number'],
    fkFields: {},
  },
  nov_edr_raw_1second: {
    category: 'timeseries',
    description: 'Raw 1-second EDR data from NOV — nested channels object (300+ raw channels). Source of truth.',
    relations: [],
    keyFields: ['licence_number', 'timestamp'],
    fkFields: { job_id: 'nov_wells.job_id' },
    note: 'All derived time-series now in TimescaleDB silver layer',
  },
  nov_timelog: {
    category: 'core',
    description: 'Time-based activity log from NOV (DDR-style) — activity codes & details',
    relations: [],
    keyFields: ['licence_number', 'start_ts'],
    fkFields: { job_id: 'nov_wells.job_id' },
  },
  nov_bha_summaries: {
    category: 'core',
    description: 'Bottom Hole Assembly summary per run — hole section, OD, length',
    relations: ['nov_bha_summaries_components'],
    keyFields: ['job_id', 'assembly_no'],
    fkFields: { job_id: 'nov_wells.job_id' },
  },
  nov_bha_summaries_components: {
    category: 'core',
    description: 'Individual BHA components per assembly — description, OD, length',
    relations: [],
    keyFields: ['job_id', 'assembly_no'],
    fkFields: { job_id: 'nov_wells.job_id', assembly_no: 'nov_bha_summaries.assembly_no' },
  },
  nov_bit_records: {
    category: 'core',
    description: 'Bit records — usage, grading, performance, jets, dull grade',
    relations: [],
    keyFields: ['job_id', 'bit_no'],
    fkFields: { job_id: 'nov_wells.job_id' },
  },
  nov_mud_motor_details: {
    category: 'core',
    description: 'Mud motor specs extracted from BHA descriptions',
    relations: [],
    keyFields: ['job_id', 'assembly_no'],
    fkFields: { job_id: 'nov_wells.job_id' },
  },
  nov_notes: {
    category: 'core',
    description: 'Free-text notes from NOV — daily reports, observations, categories',
    relations: [],
    keyFields: ['note_id'],
    fkFields: { job_id: 'nov_wells.job_id' },
  },
  las_data: {
    category: 'core',
    description: 'LAS well log data (MWD/LWD curves) — DEPT, ROPA, DVER, etc.',
    relations: [],
    keyFields: ['uwi'],
    fkFields: {},
  },
  channel_index: {
    category: 'system',
    description: 'Available EDR channels per well/rig — count, list, beyond channels',
    relations: [],
    keyFields: ['licence_number'],
    fkFields: { job_id: 'nov_wells.job_id' },
  },
  pipeline_runs: {
    category: 'system',
    description: 'Pipeline execution history — wells processed, records inserted, errors',
    relations: [],
    keyFields: [],
    fkFields: {},
  },
  pipeline_health_log: {
    category: 'system',
    description: 'Pipeline health check results & alerts',
    relations: [],
    keyFields: [],
    fkFields: {},
  },
  data_quality_spud_mismatches: {
    category: 'system',
    description: 'Data quality flags — spud date discrepancies between timelog and EDR',
    relations: [],
    keyFields: ['job_id'],
    fkFields: {},
  },
  drill_pipe_library: {
    category: 'system',
    description: 'Drill pipe specs library — type, grade, OD, weight',
    relations: [],
    keyFields: [],
    fkFields: {},
  },
  bot_resource_logs: {
    category: 'system',
    description: 'Clawdbot resource usage logs — memory, status',
    relations: [],
    keyFields: [],
    fkFields: {},
  },
  clawdbot_sessions: {
    category: 'system',
    description: 'Clawdbot chat session records',
    relations: [],
    keyFields: [],
    fkFields: {},
  },
  clawdbot_health_logs: {
    category: 'system',
    description: 'Clawdbot health check logs',
    relations: [],
    keyFields: [],
    fkFields: {},
  },
}

const SILVER_TABLES = [
  // ── Core Derived Time-Series ──
  {
    name: 'silver.wells',
    type: 'dimension',
    description: 'Denormalized well metadata for fast joins',
    fields: ['licence (PK)', 'well_name', 'rig_name', 'operator', 'surface_lat/lon', 'spud_date', 'has_mpd/has_edr', 'phase timestamps', 'total_depth_m', 'total_edr_records'],
  },
  {
    name: 'silver.edr_1s',
    type: 'hypertable',
    description: 'Canonical 1-second EDR — the core analytical time-series',
    fields: ['ts + licence (PK)', 'bit_depth', 'hole_depth', 'rop/wob/torque/rpm', 'flow_in/flow_out/spp', 'mpd_bp/mpd_density', 'op_mode', 'emd', 'flow_diff'],
    note: 'Compressed after 7 days • Replaces MongoDB edr_canonical_1s',
  },
  {
    name: 'silver.atomic_states',
    type: 'hypertable',
    description: 'Atomic boolean states — physical facts per second',
    fields: ['ts + licence (PK)', 'bit_on_bottom', 'rotating', 'pumping', 'block_moving_up/down', 'block_stationary', 'mpd_active', 'version'],
    note: 'Compressed after 7 days • Replaces MongoDB atomic_states_1s',
  },
  {
    name: 'silver.rig_state',
    type: 'hypertable',
    description: 'Classified rig state — operational mode per second',
    fields: ['ts + licence (PK)', 'rig_state', 'operational_mode', 'drilling_phase', 'trip_id', 'operation_id', 'bit_on_bottom/pumps_on/rotating', 'off_bottom_m', 'block_weight_klbf'],
    note: 'Compressed after 7 days • Replaces MongoDB rig_state_1s',
  },
  {
    name: 'silver.operations',
    type: 'hypertable',
    description: 'Operation events — drill, circulate, trip segments',
    fields: ['licence + op_id', 'op_type', 'parent_trip_id', 'start_ts/end_ts', 'duration_s', 'start_depth/end_depth'],
    note: 'Replaces MongoDB rig_state_operations',
  },
  {
    name: 'silver.trips',
    type: 'hypertable',
    description: 'Trip events with depth bounds & surface flags',
    fields: ['licence + trip_id', 'trip_type', 'start_ts/end_ts', 'duration_s', 'depth range', 'reached_surface', 'returned_to_bottom'],
    note: 'Replaces MongoDB rig_state_trips',
  },
  {
    name: 'silver.phase_timebounds',
    type: 'hypertable',
    description: 'Drilling phase boundaries (Surface, Intermediate, Mainhole)',
    fields: ['licence + phase_name', 'start_ts/end_ts', 'source', 'operational_hours/days', 'adjusted'],
    note: 'Replaces MongoDB api_phase_timebounds + derived_phase_timebounds',
  },
  // ── Aggregates ──
  {
    name: 'silver.edr_1min',
    type: 'continuous_agg',
    description: '1-minute rollup — fast charting',
    fields: ['ts + licence', 'rop_avg/max', 'wob/torque/rpm avg', 'flow avg', 'mpd stats', 'state %', 'sample_count'],
    note: 'Auto-refreshes every 1 minute',
  },
  {
    name: 'silver.edr_5min',
    type: 'continuous_agg',
    description: '5-minute rollup — dashboards & trends',
    fields: ['ts + licence', 'depth_drilled', 'rop percentiles (p50/p95)', 'drilling params', 'flow_diff stats', 'op_mode'],
    note: 'Auto-refreshes every 5 minutes',
  },
  {
    name: 'silver.edr_1hr',
    type: 'continuous_agg',
    description: '1-hour rollup — historical analysis',
    fields: ['ts + licence', 'depth_drilled', 'rop stats', 'sec_drilling/tripping/rotating', 'sample_count'],
    note: 'Auto-refreshes every 1 hour',
  },
  {
    name: 'silver.edr_daily',
    type: 'continuous_agg',
    description: 'Daily rollup — KPIs & reporting',
    fields: ['ts + licence', 'depth_drilled', 'rop percentiles', 'hrs_drilling/tripping/connections', 'data_coverage'],
    note: 'Auto-refreshes every 1 day',
  },
  // ── Analysis & Platform ──
  {
    name: 'silver.connections',
    type: 'hypertable',
    description: 'Connection event metrics (MPD breathing analysis)',
    fields: ['licence + seq', 'start_ts/end_ts', 'bit_depth', 'p_max/p_end/p_trend_mean', 'delta_backpressure', 'trend_class', 'kick_risk_score'],
    note: 'Compressed after 30 days',
  },
  {
    name: 'silver.stands',
    type: 'hypertable',
    description: 'Per-stand drilling metrics',
    fields: ['licence + stand_number', 'depth_start/end', 'rop_avg/max', 'wob/torque/rpm avg', 'connection_time_sec'],
  },
  {
    name: 'silver.chat_messages',
    type: 'hypertable',
    description: 'Context-aware chat message history with scene/item tracking',
    fields: ['id + created_at', 'user_name', 'message', 'scene', 'item_type/id', 'response_text', 'action_taken'],
    note: 'Compressed after 90 days',
  },
  {
    name: 'silver.sync_state',
    type: 'table',
    description: 'MongoDB → Silver sync tracking per well',
    fields: ['licence (PK)', 'last_synced_ts', 'records_synced', 'status'],
  },
]

// ── Config ────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  core:       { label: 'Core Data (NOV)', color: '#3b82f6', icon: '🗄️' },
  timeseries: { label: 'Time Series',     color: '#8b5cf6', icon: '📈' },
  derived:    { label: 'Derived / Enriched', color: '#10b981', icon: '⚙️' },
  system:     { label: 'System / Pipeline',  color: '#6b7280', icon: '🔧' },
}

const SILVER_TYPE_CONFIG = {
  dimension:      { color: '#3b82f6', label: 'Dimension' },
  hypertable:     { color: '#8b5cf6', label: 'Hypertable' },
  continuous_agg: { color: '#f59e0b', label: 'Continuous Agg' },
  table:          { color: '#6b7280', label: 'Table' },
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatCount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}

function formatBytes(b) {
  if (b >= 1e12) return (b / 1e12).toFixed(1) + ' TB'
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB'
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'
  if (b >= 1e3) return (b / 1e3).toFixed(1) + ' KB'
  return b + ' B'
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  return Math.floor(diff / 86400000) + 'd ago'
}

// ── Components ────────────────────────────────────────────────────────────

function CollectionCard({ collection, meta, isSelected, onSelect }) {
  const cat = CATEGORY_CONFIG[meta?.category || 'system']
  const fields = collection.fields || []
  const keyFields = meta?.keyFields || []
  const fkFields = meta?.fkFields || {}
  
  return (
    <div
      onClick={() => onSelect(collection.name)}
      style={{
        background: isSelected ? 'var(--bg-tertiary, #1e293b)' : 'var(--bg-secondary, #0f172a)',
        border: `1px solid ${isSelected ? cat.color : 'var(--border, #334155)'}`,
        borderLeft: `4px solid ${cat.color}`,
        borderRadius: '10px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px', color: cat.color }}>{collection.name}</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{
            fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
            background: `${cat.color}20`, color: cat.color,
          }}>{formatCount(collection.count)} docs</span>
          {collection.sizeBytes > 0 && (
            <span style={{
              fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
              background: 'var(--bg-primary, #020617)', color: 'var(--text-muted, #64748b)',
            }}>{formatBytes(collection.sizeBytes)}</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.4 }}>
        {meta?.description || 'No description'}
      </div>
      {isSelected && (
        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border, #334155)', paddingTop: '12px' }}>
          {/* Indexes */}
          {collection.indexes && collection.indexes.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted, #64748b)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Indexes ({collection.indexCount})
              </div>
              {collection.indexes.map((idx, i) => (
                <div key={i} style={{ fontSize: '11px', fontFamily: 'monospace', color: idx.unique ? '#fbbf24' : 'var(--text-secondary, #94a3b8)', padding: '2px 0' }}>
                  {idx.unique ? '🔑 ' : '📇 '}{idx.name}: [{idx.keys.join(', ')}]{idx.unique ? ' UNIQUE' : ''}
                </div>
              ))}
            </div>
          )}
          {/* Fields */}
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted, #64748b)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Fields ({fields.length})
          </div>
          {fields.map((f, i) => {
            const isKey = keyFields.includes(f.name)
            const fkTarget = fkFields[f.name]
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '3px 0', fontSize: '12px', borderBottom: '1px solid var(--border, #1e293b)',
              }}>
                <span style={{ fontFamily: 'monospace', color: isKey ? '#fbbf24' : fkTarget ? '#38bdf8' : 'var(--text-primary, #e2e8f0)' }}>
                  {isKey ? '🔑 ' : fkTarget ? '🔗 ' : ''}{f.name}
                </span>
                <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '11px' }}>
                  {f.type}{fkTarget ? ` → ${fkTarget}` : ''}
                </span>
              </div>
            )
          })}
          {/* Relations */}
          {meta?.relations?.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted, #64748b)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Related</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {meta.relations.map((r, i) => (
                  <span key={i} onClick={(e) => { e.stopPropagation(); onSelect(r) }} style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '8px',
                    background: 'var(--bg-primary, #020617)', border: '1px solid var(--border, #334155)',
                    color: '#38bdf8', cursor: 'pointer', fontFamily: 'monospace',
                  }}>{r}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SilverCard({ table, liveStats }) {
  const cfg = SILVER_TYPE_CONFIG[table.type]
  
  // Merge static metadata with live stats
  const stats = liveStats || {}
  const hasLiveData = stats.rowCount !== undefined
  
  return (
    <div style={{
      background: 'var(--bg-secondary, #0f172a)',
      border: '1px solid var(--border, #334155)',
      borderLeft: `4px solid ${cfg.color}`,
      borderRadius: '10px',
      padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '13px', color: cfg.color }}>{table.name}</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{
            fontSize: '10px', padding: '2px 8px', borderRadius: '8px',
            background: `${cfg.color}20`, color: cfg.color, fontWeight: 600,
          }}>{cfg.label}</span>
          {hasLiveData && stats.rowCount > 0 && (
            <span style={{
              fontSize: '10px', padding: '2px 6px', borderRadius: '6px',
              background: 'var(--bg-primary, #020617)', color: '#10b981',
              fontFamily: 'monospace',
            }}>{formatCount(stats.rowCount)} rows</span>
          )}
        </div>
      </div>
      
      {/* Live Stats Row */}
      {hasLiveData && (
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          marginBottom: '8px',
          fontSize: '11px',
          color: 'var(--text-muted, #64748b)'
        }}>
          {stats.totalSizeBytes > 0 && (
            <span>💾 {formatBytes(stats.totalSizeBytes)}</span>
          )}
          {stats.numChunks && (
            <span>📦 {stats.numChunks} chunks</span>
          )}
          {stats.compressionEnabled && (
            <span style={{ color: '#10b981' }}>🗜️ compressed</span>
          )}
          {stats.compressionRatio && (
            <span style={{ color: '#fbbf24' }}>⚡ {stats.compressionRatio}x ratio</span>
          )}
        </div>
      )}
      
      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '8px' }}>{table.description}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {table.fields.map((f, i) => (
          <span key={i} style={{
            fontSize: '11px', padding: '2px 6px', borderRadius: '6px',
            background: 'var(--bg-primary, #020617)', color: 'var(--text-secondary, #94a3b8)',
            fontFamily: 'monospace',
          }}>{f}</span>
        ))}
      </div>
      {table.note && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', marginTop: '6px', fontStyle: 'italic' }}>
          ℹ️ {table.note}
        </div>
      )}
    </div>
  )
}

function DataFlowDiagram() {
  return (
    <div style={{
      background: 'var(--bg-secondary, #0f172a)',
      border: '1px solid var(--border, #334155)',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
    }}>
      <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary, #e2e8f0)' }}>
        🔄 Data Flow Architecture
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px', lineHeight: 2.2 }}>
        <FlowBox color="#ef4444" label="NOV WellData API" sub="External Source" />
        <Arrow />
        <FlowBox color="#f59e0b" label="MongoDB" sub="Raw EDR + Documents" />
        <Arrow label="enrich" />
        <FlowBox color="#8b5cf6" label="TimescaleDB" sub="All Derived Time-Series" />
        <Arrow label="auto" />
        <FlowBox color="#10b981" label="Continuous Aggregates" sub="1min / 5min / 1hr / daily" />
        <Arrow />
        <FlowBox color="#3b82f6" label="API / Dashboard" sub="app.drillinglab.ai" />
      </div>
      <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-primary, #020617)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
        <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary, #e2e8f0)' }}>Enrichment Chain (TimescaleDB)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', color: '#f59e0b' }}>nov_edr_raw</span>
          <span>→</span>
          <span style={{ fontFamily: 'monospace', color: '#8b5cf6' }}>silver.edr_1s</span>
          <span>→</span>
          <span style={{ fontFamily: 'monospace', color: '#10b981' }}>silver.atomic_states</span>
          <span>→</span>
          <span style={{ fontFamily: 'monospace', color: '#06b6d4' }}>silver.rig_state</span>
          <span>→</span>
          <span style={{ fontFamily: 'monospace', color: '#3b82f6' }}>silver.operations + trips</span>
        </div>
      </div>
    </div>
  )
}

function FlowBox({ color, label, sub }) {
  return (
    <div style={{
      padding: '8px 14px', borderRadius: '8px',
      background: `${color}15`, border: `1px solid ${color}40`,
      textAlign: 'center', minWidth: '120px',
    }}>
      <div style={{ fontWeight: 600, color, fontSize: '12px' }}>{label}</div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function Arrow({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {label && <span style={{ fontSize: '9px', color: 'var(--text-muted, #64748b)' }}>{label}</span>}
      <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '18px' }}>→</span>
    </div>
  )
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary, #0f172a)',
      border: '1px solid var(--border, #334155)',
      borderRadius: '10px',
      padding: '14px 18px',
      textAlign: 'center',
      flex: '1 1 140px',
    }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color: color || 'var(--text-primary, #e2e8f0)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>{label}</div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function SchemaMap() {
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('mongo')
  const [liveData, setLiveData] = useState(null)
  const [silverData, setSilverData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [silverLoading, setSilverLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/schema/stats`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setLiveData(data)
      setLastFetch(data.timestamp || new Date().toISOString())
    } catch (err) {
      console.error('Schema stats fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSilverStats = useCallback(async () => {
    setSilverLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/schema/silver-stats`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setSilverData(data)
    } catch (err) {
      console.error('Silver stats fetch error:', err)
    } finally {
      setSilverLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => { fetchStats() }, [fetchStats])

  // Fetch silver stats when switching to silver tab
  useEffect(() => {
    if (activeTab === 'silver' && !silverData) {
      fetchSilverStats()
    }
  }, [activeTab, silverData, fetchSilverStats])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchStats()
      if (activeTab === 'silver') {
        fetchSilverStats()
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchStats, fetchSilverStats, activeTab])

  // Merge live data with metadata
  const collections = useMemo(() => {
    if (!liveData) return []
    return liveData.collections.map(c => ({
      ...c,
      meta: COLLECTION_META[c.name] || {
        category: 'system',
        description: '',
        relations: [],
        keyFields: [],
        fkFields: {},
      },
    }))
  }, [liveData])

  const filteredCollections = useMemo(() => {
    return collections.filter(c => {
      const cat = c.meta.category
      if (filter !== 'all' && cat !== filter) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        if (!c.name.toLowerCase().includes(term) && !(c.meta.description || '').toLowerCase().includes(term)) return false
      }
      return true
    })
  }, [collections, filter, searchTerm])

  const totals = liveData?.totals || {}
  const wellCount = collections.find(c => c.name === 'nov_wells')?.count || 0
  const edrCount = collections.find(c => c.name === 'nov_edr_raw_1second')?.count || 0
  const canonicalCount = collections.find(c => c.name === 'edr_canonical_1s')?.count || 0

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary, #020617)',
      color: 'var(--text-primary, #e2e8f0)',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            🗺️ Database Schema Map
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Auto-refresh toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted, #64748b)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Auto-refresh (60s)
            </label>
            {/* Refresh button */}
            <button
              onClick={fetchStats}
              disabled={loading}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border, #334155)',
                background: loading ? 'var(--bg-tertiary, #1e293b)' : 'var(--bg-secondary, #0f172a)',
                color: loading ? 'var(--text-muted, #64748b)' : '#3b82f6',
                cursor: loading ? 'default' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            {lastFetch && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                Updated {timeAgo(lastFetch)}
              </span>
            )}
          </div>
        </div>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', margin: '0 0 20px', fontSize: '14px' }}>
          MongoDB = raw data + documents • TimescaleDB = all derived time-series • Clean two-layer architecture
        </p>

        {/* Stats Bar */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <StatBadge label="MongoDB Collections" value={totals.collections || '—'} color="#f59e0b" />
          <StatBadge label="Silver Tables" value={silverData?.totals.tables || SILVER_TABLES.length} color="#3b82f6" />
          <StatBadge label="Total Documents" value={totals.documents ? formatCount(totals.documents) : '—'} color="#8b5cf6" />
          <StatBadge label="MongoDB Size" value={totals.dataSizeBytes ? formatBytes(totals.dataSizeBytes) : '—'} color="#ef4444" />
          {silverData?.totals.totalSizeBytes && (
            <StatBadge label="TimescaleDB Size" value={formatBytes(silverData.totals.totalSizeBytes)} color="#06b6d4" />
          )}
          <StatBadge label="Wells Tracked" value={wellCount ? formatCount(wellCount) : '—'} color="#10b981" />
        </div>

        {/* Data Flow */}
        <DataFlowDiagram />

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {[
            { key: 'mongo', label: '🍃 MongoDB (Bronze)', count: totals.collections || '...' },
            { key: 'silver', label: '🐘 TimescaleDB (Silver)', count: SILVER_TABLES.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px', borderRadius: '10px',
                border: `1px solid ${activeTab === tab.key ? '#3b82f6' : 'var(--border, #334155)'}`,
                background: activeTab === tab.key ? '#3b82f620' : 'transparent',
                color: activeTab === tab.key ? '#3b82f6' : 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* MongoDB View */}
        {activeTab === 'mongo' && (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search collections..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  padding: '8px 14px', borderRadius: '8px',
                  border: '1px solid var(--border, #334155)',
                  background: 'var(--bg-secondary, #0f172a)',
                  color: 'var(--text-primary, #e2e8f0)',
                  fontSize: '13px', width: '220px', outline: 'none',
                }}
              />
              {[{ key: 'all', label: 'All' }, ...Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ key: k, label: v.icon + ' ' + v.label }))].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: '6px 14px', borderRadius: '8px',
                    border: `1px solid ${filter === f.key ? '#3b82f6' : 'var(--border, #334155)'}`,
                    background: filter === f.key ? '#3b82f620' : 'transparent',
                    color: filter === f.key ? '#3b82f6' : 'var(--text-secondary, #94a3b8)',
                    cursor: 'pointer', fontSize: '12px',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
              <span>🔑 Primary Key / Unique Index</span>
              <span>🔗 Foreign Key</span>
              <span>📇 Index</span>
              <span style={{ color: '#38bdf8' }}>↗ Click relation to navigate</span>
            </div>

            {/* Collection Grid */}
            {!liveData && loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted, #64748b)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</div>
                <div>Loading live schema data...</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '12px' }}>
                {filteredCollections.map(c => (
                  <CollectionCard
                    key={c.name}
                    collection={c}
                    meta={c.meta}
                    isSelected={selected === c.name}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Silver Layer View */}
        {activeTab === 'silver' && (
          <>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {Object.entries(SILVER_TYPE_CONFIG).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: v.color }} />
                  <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{v.label}</span>
                </div>
              ))}
            </div>

            {/* Aggregation Flow */}
            <div style={{
              background: 'var(--bg-secondary, #0f172a)',
              border: '1px solid var(--border, #334155)',
              borderRadius: '12px', padding: '16px', marginBottom: '16px', fontSize: '12px',
            }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary, #e2e8f0)' }}>⚡ Continuous Aggregation Chain</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', color: 'var(--text-secondary, #94a3b8)' }}>
                <span style={{ fontFamily: 'monospace', color: '#8b5cf6' }}>edr_1s</span>
                <span>→</span>
                <span style={{ fontFamily: 'monospace', color: '#f59e0b' }}>edr_1min</span>
                <span style={{ fontSize: '10px' }}>(refresh 1m)</span>
                <span>→</span>
                <span style={{ fontFamily: 'monospace', color: '#f59e0b' }}>edr_5min</span>
                <span style={{ fontSize: '10px' }}>(refresh 5m)</span>
                <span>→</span>
                <span style={{ fontFamily: 'monospace', color: '#f59e0b' }}>edr_1hr</span>
                <span style={{ fontSize: '10px' }}>(refresh 1h)</span>
                <span>→</span>
                <span style={{ fontFamily: 'monospace', color: '#f59e0b' }}>edr_daily</span>
                <span style={{ fontSize: '10px' }}>(refresh 1d)</span>
              </div>
            </div>

            {silverLoading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted, #64748b)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</div>
                <div>Loading TimescaleDB stats...</div>
              </div>
            ) : (
              <>
                {/* Live Stats Summary */}
                {silverData && (
                  <div style={{ 
                    display: 'flex', 
                    gap: '12px', 
                    marginBottom: '16px',
                    padding: '12px',
                    background: 'var(--bg-secondary, #0f172a)',
                    border: '1px solid var(--border, #334155)',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}>
                    <span style={{ color: 'var(--text-muted, #64748b)' }}>
                      📊 {formatCount(silverData.totals.totalRows)} total rows
                    </span>
                    <span style={{ color: 'var(--text-muted, #64748b)' }}>
                      💾 {formatBytes(silverData.totals.totalSizeBytes)}
                    </span>
                    <span style={{ color: 'var(--text-muted, #64748b)' }}>
                      📦 {silverData.totals.hypertables} hypertables
                    </span>
                    {silverData.totals.continuousAggs > 0 && (
                      <span style={{ color: 'var(--text-muted, #64748b)' }}>
                        ⚡ {silverData.totals.continuousAggs} continuous aggs
                      </span>
                    )}
                    {silverData.totals.compressedTables > 0 && (
                      <span style={{ color: '#10b981' }}>
                        🗜️ {silverData.totals.compressedTables} compressed
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                      Updated {silverData.timestamp ? timeAgo(silverData.timestamp) : 'now'}
                    </span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '12px' }}>
                  {SILVER_TABLES.map(t => {
                    // Find live stats for this table
                    const liveStats = silverData?.tables.find(lt => 
                      lt.name === t.name || lt.tableName === t.name.replace('silver.', '')
                    )
                    return <SilverCard key={t.name} table={t} liveStats={liveStats} />
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: '40px', padding: '16px', borderTop: '1px solid var(--border, #334155)', fontSize: '12px', color: 'var(--text-muted, #64748b)', textAlign: 'center' }}>
          Drilling Lab Schema Map — Live from MongoDB • {lastFetch ? new Date(lastFetch).toLocaleString() : '...'} 
          {totals.dataSizeBytes ? ` • ${formatBytes(totals.dataSizeBytes)} total` : ''}
        </div>
      </div>
    </div>
  )
}
