import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// Status indicator colors
const STATUS_COLORS = {
  running: '#4ade80',
  stopped: '#f87171',
  warning: '#fbbf24',
  unknown: '#6b7280'
}

function StatCard({ label, value, subtext, color, icon }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      borderLeft: `4px solid ${color || 'var(--accent)'}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>{label}</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
          {subtext && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{subtext}</div>}
        </div>
        {icon && <span style={{ fontSize: '24px' }}>{icon}</span>}
      </div>
    </div>
  )
}

function ProgressBar({ complete, inProgress, pending, queued }) {
  const total = complete + inProgress + pending + queued
  if (total === 0) return null
  
  const completeWidth = (complete / total) * 100
  const progressWidth = (inProgress / total) * 100
  const queuedWidth = (queued / total) * 100
  
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span>Pipeline Progress</span>
        <span>{complete} / {total} wells</span>
      </div>
      <div style={{ 
        height: '12px', 
        background: 'var(--bg-primary)', 
        borderRadius: '6px', 
        overflow: 'hidden',
        display: 'flex'
      }}>
        <div style={{ width: `${completeWidth}%`, background: '#4ade80', transition: 'width 0.5s' }} title={`${complete} complete`} />
        <div style={{ width: `${progressWidth}%`, background: '#fbbf24', transition: 'width 0.5s' }} title={`${inProgress} in progress`} />
        <div style={{ width: `${queuedWidth}%`, background: '#60a5fa', transition: 'width 0.5s' }} title={`${queued} queued`} />
      </div>
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px' }}>
        <span><span style={{ color: '#4ade80' }}>●</span> Complete: {complete}</span>
        <span><span style={{ color: '#fbbf24' }}>●</span> In Progress: {inProgress}</span>
        <span><span style={{ color: '#60a5fa' }}>●</span> Queued: {queued}</span>
        <span><span style={{ color: '#6b7280' }}>●</span> Pending: {pending}</span>
      </div>
    </div>
  )
}

function WellsTable({ wells, loading }) {
  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading wells...</div>
  }
  
  if (!wells?.length) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No wells with data yet</div>
  }
  
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Well</th>
            <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Rig</th>
            <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>Records</th>
            <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>Hours</th>
            <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {wells.map((well, i) => (
            <tr key={well.licence} style={{ 
              borderBottom: '1px solid var(--border)',
              background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)'
            }}>
              <td style={{ padding: '12px 8px' }}>
                <div style={{ fontWeight: 500 }}>{well.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{well.licence}</div>
              </td>
              <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{well.rig}</td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                {well.records?.toLocaleString()}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                {well.hours}h
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: well.status === 'Active' ? 'rgba(74, 222, 128, 0.15)' : 'var(--bg-primary)',
                  color: well.status === 'Active' ? '#4ade80' : 'var(--text-muted)'
                }}>
                  {well.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RigBreakdown({ rigs }) {
  if (!rigs?.length) return null
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
      {rigs.slice(0, 8).map(rig => (
        <div key={rig.rig} style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{rig.rig}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {rig.wellsWithData} / {rig.wells} wells with data
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {rig.records?.toLocaleString()} records
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Pipeline() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('live') // 'live' or 'history'
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  
  // History data
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [dailyVolume, setDailyVolume] = useState(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/stats`)
      if (!res.ok) throw new Error('Failed to fetch pipeline stats')
      const data = await res.json()
      setStats(data)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const [histRes, volumeRes] = await Promise.all([
        fetch(`${API_BASE}/api/pipeline/history`),
        fetch(`${API_BASE}/api/pipeline/daily-volume`)
      ])
      
      if (histRes.ok) {
        const histData = await histRes.json()
        setHistoryData(histData)
      }
      
      if (volumeRes.ok) {
        const volData = await volumeRes.json()
        setDailyVolume(volData)
      }
    } catch (err) {
      console.error('Failed to fetch history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // Initial fetch and polling
  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [fetchStats])

  // Fetch history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history' && !historyData) {
      fetchHistory()
    }
  }, [activeTab, historyData, fetchHistory])

  const handleStartPipeline = async () => {
    if (!confirm('Start the ingestion pipeline?')) return
    setActionLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rigs: '142 148 570 26 571' })
      })
      const data = await res.json()
      if (data.success) {
        fetchStats()
      } else {
        alert('Failed to start: ' + data.error)
      }
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleStopPipeline = async () => {
    if (!confirm('Stop the ingestion pipeline?')) return
    setActionLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/stop`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        fetchStats()
      } else {
        alert('Failed to stop: ' + data.error)
      }
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const isRunning = stats?.ingestionRunning

  // History view components
  function HistoryRunsTable({ runs }) {
    if (!runs || runs.length === 0) {
      return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No pipeline runs recorded</div>
    }
    
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Start Time</th>
              <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>Duration</th>
              <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>Wells</th>
              <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>Records</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>Status</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Errors</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const duration = run.duration_seconds || 0
              const durationStr = duration > 3600 
                ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`
                : `${Math.floor(duration / 60)}m ${duration % 60}s`
              
              return (
                <tr key={run._id} style={{ 
                  borderBottom: '1px solid var(--border)',
                  background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)'
                }}>
                  <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontSize: '12px' }}>
                    {run.start_time ? new Date(run.start_time).toLocaleString() : 'N/A'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {durationStr}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {run.wells_processed || 0}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {(run.records_inserted || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 500,
                      background: run.success ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                      color: run.success ? '#4ade80' : '#f87171'
                    }}>
                      {run.success ? '✓ Success' : '✗ Failed'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '12px', color: run.errors > 0 ? '#f87171' : 'var(--text-muted)' }}>
                    {run.errors > 0 ? `${run.errors} errors` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  function DailyVolumeChart({ data }) {
    if (!data || data.length === 0) {
      return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No daily volume data available</div>
    }
    
    const maxRecords = Math.max(...data.map(d => d.records || 0))
    
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Daily Ingestion Volume (Last 30 Days)</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {data.length} days
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '200px' }}>
          {data.slice(0, 30).reverse().map((d, i) => {
            const height = maxRecords > 0 ? (d.records / maxRecords) * 180 : 0
            const hasErrors = d.errors > 0
            
            return (
              <div
                key={i}
                style={{ 
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  position: 'relative',
                  cursor: 'pointer'
                }}
                title={`${d.date}\n${d.records.toLocaleString()} records\n${d.wells} wells\n${d.runs} runs${hasErrors ? `\n${d.errors} errors` : ''}`}
              >
                <div style={{
                  height: `${height}px`,
                  background: hasErrors ? '#f87171' : '#3b82f6',
                  borderRadius: '2px 2px 0 0',
                  transition: 'all 0.2s',
                  opacity: 0.8
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
                />
              </div>
            )
          })}
        </div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginTop: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)' 
        }}>
          <span>← Older</span>
          <span>Recent →</span>
        </div>
        <div style={{ 
          marginTop: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          fontSize: '12px'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Total Records:</span>{' '}
            <span style={{ fontWeight: 600 }}>{data.reduce((sum, d) => sum + (d.records || 0), 0).toLocaleString()}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Avg per Day:</span>{' '}
            <span style={{ fontWeight: 600 }}>
              {Math.floor(data.reduce((sum, d) => sum + (d.records || 0), 0) / data.length).toLocaleString()}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Total Runs:</span>{' '}
            <span style={{ fontWeight: 600 }}>{data.reduce((sum, d) => sum + (d.runs || 0), 0)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)'
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '20px'
            }}
          >
            ←
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
              🛢️ Pipeline Status
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isRunning ? STATUS_COLORS.running : STATUS_COLORS.stopped,
                boxShadow: isRunning ? `0 0 8px ${STATUS_COLORS.running}` : 'none',
                animation: isRunning ? 'pulse 2s infinite' : 'none'
              }} />
            </h1>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Live data ingestion monitoring
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastUpdate && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchStats}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            🔄 Refresh
          </button>
          {isRunning ? (
            <button
              onClick={handleStopPipeline}
              disabled={actionLoading}
              style={{
                background: 'rgba(248, 113, 113, 0.15)',
                border: '1px solid #f87171',
                borderRadius: '8px',
                padding: '8px 16px',
                color: '#f87171',
                cursor: actionLoading ? 'wait' : 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              ⏹️ Stop Pipeline
            </button>
          ) : (
            <button
              onClick={handleStartPipeline}
              disabled={actionLoading}
              style={{
                background: 'rgba(74, 222, 128, 0.15)',
                border: '1px solid #4ade80',
                borderRadius: '8px',
                padding: '8px 16px',
                color: '#4ade80',
                cursor: actionLoading ? 'wait' : 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              ▶️ Start Pipeline
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {error && (
          <div style={{
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid #f87171',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            color: '#f87171'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab('live')}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: `1px solid ${activeTab === 'live' ? '#3b82f6' : 'var(--border)'}`,
              background: activeTab === 'live' ? '#3b82f620' : 'transparent',
              color: activeTab === 'live' ? '#3b82f6' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600
            }}
          >
            📊 Live Status
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: `1px solid ${activeTab === 'history' ? '#3b82f6' : 'var(--border)'}`,
              background: activeTab === 'history' ? '#3b82f620' : 'transparent',
              color: activeTab === 'history' ? '#3b82f6' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600
            }}
          >
            📅 History
          </button>
        </div>

        {/* Live View */}
        {activeTab === 'live' && (
          <>
        {/* Status Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          marginBottom: '24px'
        }}>
          <StatCard
            label="Pipeline Status"
            value={isRunning ? 'Running' : 'Stopped'}
            subtext={isRunning ? 'Ingesting data' : 'Idle'}
            color={isRunning ? STATUS_COLORS.running : STATUS_COLORS.stopped}
            icon={isRunning ? '⚡' : '⏸️'}
          />
          <StatCard
            label="Total EDR Records"
            value={stats?.totalRecords?.toLocaleString() || '—'}
            subtext={`${((stats?.totalRecords || 0) / 3600 / 24).toFixed(1)} rig-days`}
            color="var(--accent)"
            icon="📊"
          />
          <StatCard
            label="Wells with Data"
            value={stats?.wellsWithData || '—'}
            subtext={`of ${stats?.totalWells || '?'} total wells`}
            color="#60a5fa"
            icon="🛢️"
          />
          <StatCard
            label="Active Wells"
            value={stats?.activeWells || '—'}
            subtext="Currently drilling"
            color="#fbbf24"
            icon="⛏️"
          />
        </div>

        {/* Progress Bar */}
        {stats?.queue && (
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <ProgressBar 
              complete={stats.queue.complete || 0}
              inProgress={stats.queue.in_progress || 0}
              pending={stats.queue.pending || 0}
              queued={stats.queue.queued || 0}
            />
          </div>
        )}

        {/* Two Column Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Wells with Data */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: '1px solid var(--border)',
              fontWeight: 600
            }}>
              📋 Wells with Data (Top 20)
            </div>
            <WellsTable wells={stats?.wellData} loading={loading} />
          </div>

          {/* By Rig */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ 
              fontWeight: 600,
              marginBottom: '16px'
            }}>
              🚜 By Rig
            </div>
            <RigBreakdown rigs={stats?.byRig} />
          </div>
        </div>
          </>
        )}

        {/* History View */}
        {activeTab === 'history' && (
          <>
            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                <div>Loading pipeline history...</div>
              </div>
            ) : (
              <>
                {/* Daily Volume Chart */}
                {dailyVolume?.dailyVolume && (
                  <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '24px'
                  }}>
                    <DailyVolumeChart data={dailyVolume.dailyVolume} />
                  </div>
                )}

                {/* Pipeline Run History */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    padding: '16px 20px', 
                    borderBottom: '1px solid var(--border)',
                    fontWeight: 600,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>📋 Pipeline Run History</span>
                    <button
                      onClick={fetchHistory}
                      disabled={historyLoading}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '4px 12px',
                        color: 'var(--text-secondary)',
                        cursor: historyLoading ? 'wait' : 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      🔄 Refresh
                    </button>
                  </div>
                  <HistoryRunsTable runs={historyData?.runs} />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
