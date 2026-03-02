import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// Budget thresholds (tokens)
const BUDGETS = {
  total: 40000,
  core: 5000,
  memory: 6000,
  brains: 15000,
  skills: 10000
}

function getUsageColor(used, budget) {
  const pct = (used / budget) * 100
  if (pct >= 90) return '#f87171' // red
  if (pct >= 70) return '#fbbf24' // yellow
  return '#4ade80' // green
}

function UsageBar({ used, budget, label }) {
  const pct = Math.min((used / budget) * 100, 100)
  const color = getUsageColor(used, budget)
  
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'monospace' }}>
          {used.toLocaleString()} / {budget.toLocaleString()}
        </span>
      </div>
      <div style={{ 
        height: '8px', 
        background: 'var(--bg-primary)', 
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{ 
          width: `${pct}%`, 
          height: '100%', 
          background: color,
          transition: 'width 0.5s'
        }} />
      </div>
    </div>
  )
}

function WorkspaceCard({ workspace, expanded, onToggle }) {
  const total = workspace.total_tokens || 0
  const categories = workspace.by_category || {}
  const topFiles = workspace.top_files || []
  
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      overflow: 'hidden',
      marginBottom: '16px'
    }}>
      {/* Header */}
      <div 
        onClick={onToggle}
        style={{
          padding: '16px 20px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: expanded ? '1px solid var(--border)' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>🤖</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '16px' }}>{workspace.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {workspace.path}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ 
              fontSize: '24px', 
              fontWeight: 700,
              color: getUsageColor(total, BUDGETS.total)
            }}>
              {total.toLocaleString()}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>tokens</div>
          </div>
          <span style={{ 
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            fontSize: '18px',
            color: 'var(--text-muted)'
          }}>▼</span>
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div style={{ padding: '20px' }}>
          {/* Category Breakdown */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
              By Category
            </div>
            <UsageBar 
              used={categories.core || 0} 
              budget={BUDGETS.core} 
              label="Core (AGENTS.md, SOUL.md, etc)" 
            />
            <UsageBar 
              used={categories.memory || 0} 
              budget={BUDGETS.memory} 
              label="Memory (daily logs, WIP)" 
            />
            <UsageBar 
              used={categories.brains || 0} 
              budget={BUDGETS.brains} 
              label="Brains (knowledge bases)" 
            />
            <UsageBar 
              used={categories.skills || 0} 
              budget={BUDGETS.skills} 
              label="Skills (SKILL.md files)" 
            />
          </div>
          
          {/* Top Files */}
          {topFiles.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                Top Files
              </div>
              <div style={{ 
                background: 'var(--bg-primary)', 
                borderRadius: '8px', 
                padding: '12px',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                {topFiles.slice(0, 8).map((file, i) => (
                  <div key={i} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    borderBottom: i < topFiles.length - 1 ? '1px solid var(--border)' : 'none'
                  }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{file.path}</span>
                    <span style={{ color: file.tokens > 2000 ? '#fbbf24' : 'var(--text-primary)' }}>
                      {file.tokens.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, subtext, icon, color }) {
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
          <div style={{ fontSize: '28px', fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
          {subtext && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{subtext}</div>}
        </div>
        {icon && <span style={{ fontSize: '24px' }}>{icon}</span>}
      </div>
    </div>
  )
}

export default function Memory() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [expanded, setExpanded] = useState({})

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/memory/stats`)
      if (!res.ok) throw new Error('Failed to fetch memory stats')
      const json = await res.json()
      setData(json)
      setLastUpdate(new Date())
      setError(null)
      
      // Auto-expand first workspace
      if (json.workspaces?.length && Object.keys(expanded).length === 0) {
        setExpanded({ [json.workspaces[0].name]: true })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 60000) // Refresh every 60s
    return () => clearInterval(interval)
  }, [fetchStats])

  const toggleExpand = (name) => {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }))
  }

  // Calculate totals
  const totalTokens = data?.workspaces?.reduce((sum, w) => sum + (w.total_tokens || 0), 0) || 0
  const totalBytes = data?.workspaces?.reduce((sum, w) => sum + (w.total_bytes || 0), 0) || 0
  const workspaceCount = data?.workspaces?.length || 0
  const budgetPct = Math.round((totalTokens / (BUDGETS.total * workspaceCount)) * 100)

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
              🧠 Agent Memory
            </h1>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Token usage across bot workspaces
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
            disabled={loading}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: 'var(--text-primary)',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '13px'
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
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

        {loading && !data ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading memory stats...
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '16px',
              marginBottom: '32px'
            }}>
              <SummaryCard
                label="Total Tokens"
                value={totalTokens.toLocaleString()}
                subtext={`${budgetPct}% of budget`}
                color={budgetPct > 80 ? '#f87171' : budgetPct > 60 ? '#fbbf24' : '#4ade80'}
                icon="📊"
              />
              <SummaryCard
                label="Total Size"
                value={`${(totalBytes / 1024).toFixed(0)} KB`}
                subtext={`${(totalBytes / 1024 / 1024).toFixed(2)} MB`}
                color="var(--accent)"
                icon="💾"
              />
              <SummaryCard
                label="Workspaces"
                value={workspaceCount}
                subtext="Bot instances tracked"
                color="#60a5fa"
                icon="🤖"
              />
              <SummaryCard
                label="Budget Per Bot"
                value={`${BUDGETS.total.toLocaleString()}`}
                subtext="Target token limit"
                color="#a78bfa"
                icon="🎯"
              />
            </div>

            {/* Workspace Cards */}
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                Workspace Breakdown
              </h2>
              {data?.workspaces?.map(workspace => (
                <WorkspaceCard
                  key={workspace.name}
                  workspace={workspace}
                  expanded={expanded[workspace.name]}
                  onToggle={() => toggleExpand(workspace.name)}
                />
              ))}
            </div>

            {/* Budget Reference */}
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                📋 Budget Reference
              </h3>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                gap: '12px',
                fontSize: '13px'
              }}>
                <div><strong>Core:</strong> {BUDGETS.core.toLocaleString()} tokens</div>
                <div><strong>Memory:</strong> {BUDGETS.memory.toLocaleString()} tokens</div>
                <div><strong>Brains:</strong> {BUDGETS.brains.toLocaleString()} tokens</div>
                <div><strong>Skills:</strong> {BUDGETS.skills.toLocaleString()} tokens</div>
                <div><strong>Total:</strong> {BUDGETS.total.toLocaleString()} tokens</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
