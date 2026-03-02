import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, LineChart, Line, Legend 
} from 'recharts'

const API_BASE = import.meta.env.VITE_API_URL || ''

const COLORS = {
  pipeline: '#4a9eff',
  'rig-state': '#f59e0b',
  analytics: '#10b981',
  architecture: '#8b5cf6',
  infrastructure: '#ec4899',
  memory: '#06b6d4',
  client: '#84cc16',
  business: '#f43f5e',
  general: '#6b7280'
}

// Summary Cards
function SummaryCard({ title, value, subtitle, icon, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      borderTop: `3px solid ${color || 'var(--accent)'}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {title}
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700 }}>{value}</div>
          {subtitle && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {subtitle}
            </div>
          )}
        </div>
        <span style={{ fontSize: '24px' }}>{icon}</span>
      </div>
    </div>
  )
}

// Project Cost Breakdown Pie Chart
function ProjectCostPie({ data }) {
  if (!data || Object.keys(data).length === 0) {
    return <div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center' }}>No data</div>
  }
  
  const chartData = Object.entries(data).map(([name, stats]) => ({
    name,
    value: stats.cost_usd || 0,
    color: COLORS[name] || '#6b7280'
  })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, value }) => `${name}: $${value.toFixed(0)}`}
          labelLine={false}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip 
          formatter={(value) => `$${value.toFixed(2)}`}
          contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Project Activity Bar Chart
function ProjectActivityBar({ data }) {
  if (!data || Object.keys(data).length === 0) {
    return <div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center' }}>No data</div>
  }
  
  const chartData = Object.entries(data).map(([name, stats]) => ({
    name,
    sessions: stats.session_count || 0,
    tasks: stats.tasks_initiated || 0,
    completed: stats.tasks_completed || 0,
    fill: COLORS[name] || '#6b7280'
  })).sort((a, b) => b.sessions - a.sessions)
  
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical">
        <XAxis type="number" stroke="var(--text-muted)" />
        <YAxis dataKey="name" type="category" width={100} stroke="var(--text-muted)" />
        <Tooltip 
          contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        />
        <Legend />
        <Bar dataKey="sessions" fill="var(--accent)" name="Sessions" />
        <Bar dataKey="tasks" fill="var(--warning)" name="Tasks" />
        <Bar dataKey="completed" fill="var(--success)" name="Completed" />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Clarification Queue
function ClarificationQueue({ items, onResolve }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
        ✅ No pending clarifications
      </div>
    )
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {items.map((item, i) => (
        <div key={i} style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '16px',
          borderLeft: '3px solid var(--warning)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Session: {item.session_id?.slice(0, 8)}...
            </span>
            <span style={{ 
              fontSize: '11px', 
              background: 'var(--warning)', 
              color: '#000',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              {Math.round(item.confidence * 100)}% confidence
            </span>
          </div>
          <div style={{ fontSize: '13px', marginBottom: '8px' }}>
            Suggested: {item.suggested_projects?.join(', ')}
          </div>
          <div style={{ 
            fontSize: '12px', 
            color: 'var(--text-secondary)',
            background: 'var(--bg-secondary)',
            padding: '8px',
            borderRadius: '4px',
            maxHeight: '60px',
            overflow: 'hidden'
          }}>
            {item.summary_preview?.slice(0, 150)}...
          </div>
        </div>
      ))}
    </div>
  )
}

// Model Usage Breakdown
function ModelBreakdown({ data }) {
  if (!data || Object.keys(data).length === 0) return null
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Object.entries(data).map(([model, stats]) => (
        <div key={model} style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px',
          background: 'var(--bg-primary)',
          borderRadius: '8px'
        }}>
          <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{model}</span>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
            <span>{stats.sessions} sessions</span>
            <span style={{ color: 'var(--accent)' }}>${stats.cost?.toFixed(2)}</span>
            <span style={{ color: 'var(--text-muted)' }}>{(stats.tokens / 1000).toFixed(0)}K tokens</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// Hierarchical Tree View
function HierarchyTree({ goals, onStatusChange }) {
  const [expanded, setExpanded] = useState({})
  
  const toggle = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }
  
  const statusColors = {
    active: 'var(--warning)',
    complete: 'var(--success)',
    pending: 'var(--text-muted)',
    blocked: 'var(--error)',
    planning: 'var(--accent)'
  }
  
  if (!goals || goals.length === 0) {
    return <div style={{ color: 'var(--text-muted)', padding: '20px' }}>No goals yet</div>
  }
  
  return (
    <div style={{ fontSize: '13px' }}>
      {goals.map(goal => (
        <div key={goal.id} style={{ marginBottom: '16px' }}>
          {/* Goal */}
          <div 
            onClick={() => toggle(goal.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              background: 'var(--bg-primary)',
              borderRadius: '8px',
              cursor: 'pointer',
              borderLeft: `3px solid ${statusColors[goal.status] || 'var(--border)'}`
            }}
          >
            <span>{expanded[goal.id] ? '▼' : '▶'}</span>
            <span>🎯</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{goal.name}</span>
            <span style={{ 
              fontSize: '11px', 
              background: statusColors[goal.status],
              color: goal.status === 'active' ? '#000' : '#fff',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>{goal.status}</span>
            <span style={{ color: 'var(--success)', fontSize: '12px' }}>
              ${goal.attribution_rollup?.cost_usd?.toFixed(2) || '0.00'}
            </span>
          </div>
          
          {/* Projects */}
          {expanded[goal.id] && goal.projects?.map(project => (
            <div key={project.id} style={{ marginLeft: '24px', marginTop: '8px' }}>
              <div 
                onClick={() => toggle(project.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                <span>{expanded[project.id] ? '▼' : '▶'}</span>
                <span>📁</span>
                <span style={{ flex: 1 }}>{project.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {Math.round(project.progress || 0)}%
                </span>
                <span style={{ color: 'var(--success)', fontSize: '12px' }}>
                  ${project.attribution_rollup?.cost_usd?.toFixed(2) || '0.00'}
                </span>
              </div>
              
              {/* Tasks */}
              {expanded[project.id] && project.tasks?.map(task => (
                <div key={task.id} style={{ marginLeft: '24px', marginTop: '6px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    background: 'var(--bg-elevated)',
                    borderRadius: '4px'
                  }}>
                    <span style={{ 
                      width: '16px', 
                      height: '16px', 
                      borderRadius: '4px',
                      border: task.status === 'complete' ? 'none' : '2px solid var(--border)',
                      background: task.status === 'complete' ? 'var(--success)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                    onClick={() => onStatusChange?.(task.id, task.status === 'complete' ? 'active' : 'complete')}
                    >
                      {task.status === 'complete' ? '✓' : ''}
                    </span>
                    <span style={{ 
                      flex: 1,
                      textDecoration: task.status === 'complete' ? 'line-through' : 'none',
                      color: task.status === 'complete' ? 'var(--text-muted)' : 'inherit'
                    }}>{task.name}</span>
                    {task.assigned_bot && (
                      <span style={{ 
                        fontSize: '10px', 
                        background: 'var(--accent)',
                        color: '#fff',
                        padding: '2px 6px',
                        borderRadius: '3px'
                      }}>🤖 {task.assigned_bot}</span>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      ${task.attribution_rollup?.cost_usd?.toFixed(2) || '0'}
                    </span>
                  </div>
                  
                  {/* Subtasks */}
                  {task.subtasks?.map(st => (
                    <div key={st.id} style={{
                      marginLeft: '24px',
                      marginTop: '4px',
                      padding: '6px 8px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>{st.type === 'snag' ? '🚧' : '🔧'}</span>
                      <span>{st.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// User Costs Tab Component
function UserCostsTab({ userCosts, loading, onLoad }) {
  useEffect(() => {
    if (!userCosts && !loading) onLoad()
  }, [])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
      Loading user cost data across all bots...
    </div>
  }

  if (!userCosts) {
    return <div style={{ textAlign: 'center', padding: '60px' }}>
      <button onClick={onLoad} style={{
        padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--border)',
        background: 'var(--accent)', color: '#000', fontWeight: 600, cursor: 'pointer'
      }}>Load User Costs</button>
    </div>
  }

  const { totals, users, by_bot, by_model, by_day } = userCosts
  const USER_COLORS = ['#4a9eff', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e']

  // Daily cost data for chart
  const dayEntries = Object.entries(by_day || {}).slice(-14)
  const dailyData = dayEntries.map(([day, stats]) => ({
    name: day.slice(5), // MM-DD
    cost: stats.cost,
    sessions: stats.sessions,
    tokens: Math.round(stats.tokens / 1000)
  }))

  return (
    <>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <SummaryCard title="Total Cost" value={`$${totals.cost_usd.toFixed(2)}`} subtitle="All bots combined" icon="💰" color="#10b981" />
        <SummaryCard title="Total Tokens" value={`${(totals.tokens / 1000).toFixed(0)}K`} subtitle="Input + Output" icon="🔢" color="#4a9eff" />
        <SummaryCard title="Users Tracked" value={totals.unique_users} subtitle="Unique users" icon="👥" color="#8b5cf6" />
        <SummaryCard title="Sessions" value={totals.sessions} subtitle="Across all bots" icon="💬" color="#f59e0b" />
      </div>

      {/* Per-User Breakdown */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '20px', marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>👥 Cost by User</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text-muted)' }}>User</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Cost</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Tokens</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Sessions</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Messages</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text-muted)' }}>Bots Used</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text-muted)' }}>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const totalTokens = u.total_tokens_in + u.total_tokens_out
                const costPct = totals.cost_usd > 0 ? (u.total_cost / totals.cost_usd * 100) : 0
                return (
                  <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: USER_COLORS[i % USER_COLORS.length],
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '14px', fontWeight: 600, color: '#000', flexShrink: 0
                        }}>{u.name[0]}</div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{u.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>id:{u.user_id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 8px' }}>
                      <div style={{ fontWeight: 600, color: '#10b981' }}>${u.total_cost.toFixed(2)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{costPct.toFixed(1)}%</div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 8px' }}>
                      <div>{(totalTokens / 1000).toFixed(0)}K</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {(u.total_tokens_in / 1000).toFixed(0)}K in / {(u.total_tokens_out / 1000).toFixed(0)}K out
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 8px' }}>{u.session_count}</td>
                    <td style={{ textAlign: 'right', padding: '12px 8px' }}>{u.total_messages}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {u.bots_used.map(bot => (
                          <span key={bot} style={{
                            background: 'var(--bg-primary)', border: '1px solid var(--border)',
                            borderRadius: '4px', padding: '2px 6px', fontSize: '11px'
                          }}>{bot.replace('-bot', '').replace('kurt', '')}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {u.last_seen ? new Date(u.last_seen).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost by Bot + Cost by Model side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* By Bot */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '20px'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>🤖 Cost by Bot</h3>
          {Object.entries(by_bot || {})
            .sort(([,a], [,b]) => b.cost - a.cost)
            .map(([bot, stats]) => {
              const pct = totals.cost_usd > 0 ? (stats.cost / totals.cost_usd * 100) : 0
              return (
                <div key={bot} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>{bot}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>${stats.cost.toFixed(2)}</span>
                  </div>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#4a9eff', borderRadius: '4px' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {stats.sessions} sessions · {(stats.tokens / 1000).toFixed(0)}K tokens
                  </div>
                </div>
              )
            })}
        </div>

        {/* By Model */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '20px'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>🧠 Cost by Model</h3>
          {Object.entries(by_model || {})
            .sort(([,a], [,b]) => b.cost - a.cost)
            .map(([model, stats]) => {
              const pct = totals.cost_usd > 0 ? (stats.cost / totals.cost_usd * 100) : 0
              return (
                <div key={model} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>{model || 'unknown'}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>${stats.cost.toFixed(2)}</span>
                  </div>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#8b5cf6', borderRadius: '4px' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {stats.sessions} sessions
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Daily Cost Trend */}
      {dailyData.length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '20px'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>📈 Daily Cost Trend (Last 14 Days)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyData}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px' }}
                formatter={(value, name) => name === 'cost' ? `$${value.toFixed(2)}` : value}
              />
              <Bar dataKey="cost" fill="#10b981" radius={[4, 4, 0, 0]} name="Cost ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '16px' }}>
        <button onClick={onLoad} style={{
          padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px'
        }}>🔄 Refresh User Costs</button>
      </div>
    </>
  )
}

// Main Page
export default function AIIntelligence() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activityFeed, setActivityFeed] = useState(null)
  const [signalTriage, setSignalTriage] = useState(null)
  const [localUsage, setLocalUsage] = useState(null)
  const [summary, setSummary] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [clarifications, setClarifications] = useState({ pending: 0, items: [] })
  const [hierarchy, setHierarchy] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [learnings, setLearnings] = useState(null)
  const [learningStore, setLearningStore] = useState(null)
  const [userCosts, setUserCosts] = useState(null)
  const [userCostsLoading, setUserCostsLoading] = useState(false)
  
  useEffect(() => {
    loadData()
  }, [])
  
  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // Load summary
      const summaryRes = await fetch(`${API_BASE}/api/project-tracker/summary`)
      if (summaryRes.ok) {
        setSummary(await summaryRes.json())
      }
      
      // Load ledger
      const ledgerRes = await fetch(`${API_BASE}/api/project-tracker/ledger?recent=50`)
      if (ledgerRes.ok) {
        setLedger(await ledgerRes.json())
      }
      
      // Load clarifications
      const clarRes = await fetch(`${API_BASE}/api/project-tracker/clarifications`)
      if (clarRes.ok) {
        setClarifications(await clarRes.json())
      }
      
      // Load hierarchy
      const hierRes = await fetch(`${API_BASE}/api/project-tracker/hierarchy`)
      if (hierRes.ok) {
        setHierarchy(await hierRes.json())
      }
      
      // Load learnings
      const learnRes = await fetch(`${API_BASE}/api/project-tracker/learnings?recent=30`)
      if (learnRes.ok) {
        setLearnings(await learnRes.json())
      }
      
      // Load learning store
      const storeRes = await fetch(`${API_BASE}/api/project-tracker/learning-store`)
      if (storeRes.ok) {
        setLearningStore(await storeRes.json())
      }
      
      // Load activity feed
      const activityRes = await fetch(`${API_BASE}/api/project-tracker/activity-feed?hours=24`)
      if (activityRes.ok) {
        setActivityFeed(await activityRes.json())
      }
      
      // Load signal triage
      const triageRes = await fetch(`${API_BASE}/api/project-tracker/signals/triage`)
      if (triageRes.ok) {
        setSignalTriage(await triageRes.json())
      }
      
      // Load local model usage
      const usageRes = await fetch(`${API_BASE}/api/project-tracker/local-usage`)
      if (usageRes.ok) {
        setLocalUsage(await usageRes.json())
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  
  async function handleStatusChange(id, newStatus) {
    try {
      await fetch(`${API_BASE}/api/project-tracker/hierarchy/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      })
      loadData() // Refresh
    } catch (err) {
      console.error('Status update failed:', err)
    }
  }
  
  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'var(--bg-primary)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>🧠</div>
          <div style={{ color: 'var(--text-muted)' }}>Loading AI Intelligence...</div>
        </div>
      </div>
    )
  }
  
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>
            🧠 AI Project Intelligence
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Track projects, costs, and resource usage across all AI sessions
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={loadData}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '10px 16px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            🔄 Refresh
          </button>
          <button 
            onClick={() => navigate('/projects')}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#fff'
            }}
          >
            📋 Projects Board
          </button>
        </div>
      </div>
      
      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '4px', 
        marginBottom: '24px',
        background: 'var(--bg-secondary)',
        padding: '4px',
        borderRadius: '8px',
        width: 'fit-content'
      }}>
        {[
          { id: 'overview', label: '📊 Overview' },
          { id: 'users', label: '👥 Users' },
          { id: 'activity', label: '📡 Activity Feed' },
          { id: 'triage', label: '📥 Signal Triage' },
          { id: 'hierarchy', label: '🌳 Hierarchy' },
          { id: 'learnings', label: '🧠 Learnings' },
          { id: 'costs', label: '💰 Costs' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid var(--error)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          color: 'var(--error)'
        }}>
          Error: {error}
        </div>
      )}
      
      {/* ACTIVITY FEED TAB */}
      {activeTab === 'activity' && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
              📡 Activity Vectors — Last 24h
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {activityFeed?.totalActivities || 0} activities tracked
            </div>
          </div>
          
          {/* Vector Summary Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '12px',
            marginBottom: '24px'
          }}>
            {activityFeed?.vectors?.map((v, i) => (
              <div key={i} style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '16px',
                borderLeft: `4px solid ${['#4a9eff', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i % 5]}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600 }}>{v.topic}</span>
                  <span style={{ 
                    fontSize: '20px', 
                    fontWeight: 700, 
                    background: 'var(--bg-secondary)',
                    padding: '2px 10px',
                    borderRadius: '12px'
                  }}>{v.count}</span>
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                  fontStyle: 'italic',
                  lineHeight: '1.4'
                }}>
                  "{v.latestSemantic}"
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                  <span>{v.bots?.join(', ')}</span>
                  <span>{v.lastActivity ? new Date(v.lastActivity).toLocaleTimeString() : ''}</span>
                </div>
              </div>
            ))}
          </div>
          
          {/* Recent Activity Timeline */}
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Recent Activity Timeline</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activityFeed?.recentActivity?.slice(0, 15).map((act, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '12px 14px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                borderLeft: `3px solid ${i === 0 ? '#10b981' : '#6b7280'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                  <span style={{ fontWeight: 600 }}>{act.bot}</span>
                  <span style={{ 
                    background: 'var(--bg-secondary)', 
                    padding: '2px 8px', 
                    borderRadius: '4px',
                    fontSize: '10px'
                  }}>
                    {act.topic}
                  </span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: '11px' }}>
                    {new Date(act.updatedAtISO).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ 
                  fontSize: '13px', 
                  color: 'var(--text-secondary)',
                  lineHeight: '1.4'
                }}>
                  {act.semantic}
                </div>
              </div>
            ))}
          </div>
          
          {(!activityFeed?.recentActivity || activityFeed.recentActivity.length === 0) && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No activity in the last 24 hours
            </div>
          )}
        </div>
      )}
      
      {/* SIGNAL TRIAGE TAB */}
      {activeTab === 'triage' && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
              📥 Signal Triage — Ideas Inbox
            </h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {signalTriage?.total_signals || 0} total signals
              </span>
              <button
                onClick={async () => {
                  await fetch(`${API_BASE}/api/project-tracker/signals/ingest`, { method: 'POST' });
                  await fetch(`${API_BASE}/api/project-tracker/signals/cluster`, { method: 'POST' });
                  loadData();
                }}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🔄 Refresh & Cluster
              </button>
            </div>
          </div>
          
          {/* Three Column Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            
            {/* INBOX Column */}
            <div>
              <h4 style={{ 
                fontSize: '13px', 
                fontWeight: 600, 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ 
                  background: '#f59e0b', 
                  color: '#000',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px'
                }}>{signalTriage?.inbox_count || 0}</span>
                Inbox (Unclassified)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {signalTriage?.inbox?.map((sig, i) => {
                  const botToTelegram = {
                    'kurtarchdevbot': 'KurtArchDevBot',
                    'main-drilling-lab': 'DrillingLabBot',
                    'pipeline-bot': 'PiperDrillingLabBot',
                    'datascience-bot': 'datascikiwibot',
                    'mechanic-bot': 'MechanicKurtBot',
                    'playbot': 'kurt_play_bot'
                  };
                  const tgBot = botToTelegram[sig.source_bot];
                  return (
                  <div 
                    key={sig.id} 
                    onClick={() => window.location.href = `/#/chat?bot=${sig.source_bot}&context=${encodeURIComponent(sig.text)}`}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '10px',
                      borderLeft: '3px solid #f59e0b',
                      cursor: tgBot ? 'pointer' : 'default',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseOver={(e) => tgBot && (e.currentTarget.style.background = 'var(--bg-secondary)')}
                    onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg)'}
                  >
                    <div style={{ fontSize: '12px', marginBottom: '4px' }}>{sig.text}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span>{sig.source_bot}</span>
                      <span>•</span>
                      <span>{sig.topic}</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>💬 Open chat</span>
                    </div>
                  </div>
                  );
                })}
                {(!signalTriage?.inbox || signalTriage.inbox.length === 0) && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '20px', textAlign: 'center' }}>
                    No signals in inbox
                  </div>
                )}
              </div>
            </div>
            
            {/* EMERGING THEMES Column */}
            <div>
              <h4 style={{ 
                fontSize: '13px', 
                fontWeight: 600, 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ 
                  background: '#8b5cf6', 
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px'
                }}>{signalTriage?.emerging_themes?.length || 0}</span>
                Emerging Themes
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {signalTriage?.emerging_themes?.map((cluster, i) => (
                  <div key={cluster.id} style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '10px',
                    borderLeft: '3px solid #8b5cf6'
                  }}>
                    <div style={{ fontWeight: 500, fontSize: '12px', marginBottom: '6px' }}>{cluster.theme}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      {cluster.count} related signals
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {cluster.signal_texts?.slice(0, 2).map((t, j) => (
                        <div key={j} style={{ marginTop: '4px' }}>• {t.slice(0, 60)}...</div>
                      ))}
                    </div>
                  </div>
                ))}
                {(!signalTriage?.emerging_themes || signalTriage.emerging_themes.length === 0) && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '20px', textAlign: 'center' }}>
                    No emerging themes yet
                  </div>
                )}
              </div>
            </div>
            
            {/* READY FOR PROMOTION Column */}
            <div>
              <h4 style={{ 
                fontSize: '13px', 
                fontWeight: 600, 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ 
                  background: '#10b981', 
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px'
                }}>{signalTriage?.ready_for_promotion?.length || 0}</span>
                Ready for Promotion
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {signalTriage?.ready_for_promotion?.map((cluster, i) => (
                  <div key={cluster.id} style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '10px',
                    borderLeft: '3px solid #10b981'
                  }}>
                    <div style={{ fontWeight: 500, fontSize: '12px', marginBottom: '6px' }}>{cluster.theme}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      {cluster.count} signals — strong theme
                    </div>
                    <button style={{
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}>
                      Promote to Project →
                    </button>
                  </div>
                ))}
                {(!signalTriage?.ready_for_promotion || signalTriage.ready_for_promotion.length === 0) && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '20px', textAlign: 'center' }}>
                    No themes ready yet
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Flow Diagram */}
          <div style={{ 
            marginTop: '24px', 
            padding: '16px', 
            background: 'var(--bg)', 
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--text-muted)'
          }}>
            <span style={{ color: '#f59e0b' }}>📥 Inbox</span>
            <span style={{ margin: '0 12px' }}>→</span>
            <span style={{ color: '#8b5cf6' }}>🔮 Emerging Themes</span>
            <span style={{ margin: '0 12px' }}>→</span>
            <span style={{ color: '#10b981' }}>✓ Ready</span>
            <span style={{ margin: '0 12px' }}>→</span>
            <span style={{ color: 'var(--accent)' }}>🎯 Hierarchy</span>
          </div>
        </div>
      )}
      
      {/* HIERARCHY TAB */}
      {activeTab === 'hierarchy' && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
              🎯 Goals → 📁 Projects → 📋 Tasks
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {hierarchy?.summary?.goals || 0} goals · {hierarchy?.summary?.projects || 0} projects · {hierarchy?.summary?.tasks || 0} tasks
            </div>
          </div>
          <HierarchyTree 
            goals={hierarchy?.goals} 
            onStatusChange={handleStatusChange}
          />
          <div style={{ 
            marginTop: '16px', 
            paddingTop: '16px', 
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: 'var(--text-muted)'
          }}>
            <span>Total attributed: ${hierarchy?.summary?.total_cost?.toFixed(2) || '0.00'}</span>
            <span>{(hierarchy?.summary?.total_tokens || 0).toLocaleString()} tokens</span>
            <span>Bots: {hierarchy?.summary?.bots_involved?.join(', ') || 'None'}</span>
          </div>
        </div>
      )}
      
      {/* LEARNINGS TAB */}
      {activeTab === 'learnings' && (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Signal Summary */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px'
          }}>
            <SummaryCard 
              title="Successes" 
              value={learnings?.totals?.successes || 0}
              icon="✅"
              color="var(--success)"
            />
            <SummaryCard 
              title="Tool Failures" 
              value={learnings?.totals?.tool_failures || 0}
              icon="🔧"
              color="var(--error)"
            />
            <SummaryCard 
              title="Corrections" 
              value={learnings?.totals?.corrections || 0}
              icon="✏️"
              color="var(--warning)"
            />
            <SummaryCard 
              title="Context Loss" 
              value={learnings?.totals?.context_loss || 0}
              icon="🧠"
              color="var(--accent)"
            />
            <SummaryCard 
              title="Pain Points" 
              value={learnings?.totals?.pain_points || 0}
              icon="😣"
              color="var(--error)"
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
            {/* Tool Failure Breakdown */}
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
                🔧 Tool Failure Breakdown
              </h3>
              {learnings?.tool_failure_categories && Object.keys(learnings.tool_failure_categories).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(learnings.tool_failure_categories)
                    .sort(([,a], [,b]) => b - a)
                    .map(([cat, count]) => (
                      <div key={cat} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: 'var(--bg-primary)',
                        borderRadius: '6px'
                      }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{cat}</span>
                        <span style={{ 
                          background: 'var(--error)',
                          color: '#fff',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>{count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  ✅ No tool failures detected
                </div>
              )}
            </div>
            
            {/* Improvement Opportunities */}
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
                💡 Improvement Opportunities
              </h3>
              {learnings?.improvement_opportunities?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {learnings.improvement_opportunities.map((opp, i) => (
                    <div key={i} style={{
                      padding: '12px',
                      background: 'var(--bg-primary)',
                      borderRadius: '8px',
                      borderLeft: '3px solid var(--warning)'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '13px' }}>
                        {opp.area}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        {opp.signal}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--accent)' }}>
                        → {opp.suggestion}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  ✅ No issues detected
                </div>
              )}
            </div>
          </div>
          
          {/* Learning Store */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              📚 Learning Store
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {/* Tool Playbooks */}
              <div style={{ 
                background: 'var(--bg-primary)', 
                borderRadius: '8px', 
                padding: '16px' 
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)' }}>
                  🔧 Tool Playbooks
                </h4>
                {learningStore?.tool_playbooks && Object.entries(learningStore.tool_playbooks).map(([name, pb]) => (
                  <div key={name} style={{ marginBottom: '12px', fontSize: '12px' }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{name}</div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{pb.recovery}</div>
                  </div>
                ))}
              </div>
              
              {/* User Preferences */}
              <div style={{ 
                background: 'var(--bg-primary)', 
                borderRadius: '8px', 
                padding: '16px' 
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)' }}>
                  👤 User Preferences
                </h4>
                {learningStore?.user_preferences?.kurt && (
                  <div style={{ fontSize: '12px' }}>
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Verbosity:</span> {learningStore.user_preferences.kurt.verbosity}
                    </div>
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Style:</span> {learningStore.user_preferences.kurt.confirmation_style}
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Format:</span> {learningStore.user_preferences.kurt.preferred_format}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Skill Gaps */}
              <div style={{ 
                background: 'var(--bg-primary)', 
                borderRadius: '8px', 
                padding: '16px' 
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--warning)' }}>
                  📈 Skill Gaps
                </h4>
                {learningStore?.skill_gaps?.map((gap, i) => (
                  <div key={i} style={{ marginBottom: '10px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600 }}>{gap.topic}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{gap.signal}</div>
                  </div>
                ))}
              </div>
              
              {/* Improvement History */}
              <div style={{ 
                background: 'var(--bg-primary)', 
                borderRadius: '8px', 
                padding: '16px' 
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--success)' }}>
                  📜 Improvement History
                </h4>
                {learningStore?.improvement_history?.map((imp, i) => (
                  <div key={i} style={{ marginBottom: '10px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{imp.area}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{imp.date}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>{imp.action}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <SummaryCard 
          title="Total Cost" 
          value={`$${(summary?.totalCost || 0).toFixed(2)}`}
          subtitle="Last 50 sessions"
          icon="💰"
          color="var(--success)"
        />
        <SummaryCard 
          title="Tokens Used" 
          value={`${((summary?.totalTokens || 0) / 1000).toFixed(0)}K`}
          subtitle="Input + Output"
          icon="🎟️"
          color="var(--accent)"
        />
        <SummaryCard 
          title="Projects Tracked" 
          value={summary?.totalProjects || 0}
          subtitle="Active categories"
          icon="📁"
          color="var(--warning)"
        />
        <SummaryCard 
          title="Clarifications" 
          value={clarifications?.pending || 0}
          subtitle="Needs review"
          icon="❓"
          color={clarifications?.pending > 0 ? 'var(--error)' : 'var(--success)'}
        />
        <SummaryCard 
          title="Local Model Calls" 
          value={localUsage?.totals?.embedding_calls || 0}
          subtitle={`${localUsage?.totals?.embedding_tokens || 0} tokens • $${localUsage?.cloud_equivalent_usd?.toFixed(4) || '0.00'} saved`}
          icon="🏠"
          color="#10b981"
        />
      </div>
      
      {/* Local Usage Details */}
      {localUsage && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🏠 Local Model Usage (Legion Ollama)
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
              vs cloud APIs
            </span>
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            {Object.entries(localUsage.by_model || {}).map(([model, stats]) => (
              <div key={model} style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>{model}</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{stats.embedding_calls || 0}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {stats.embedding_tokens || 0} tokens
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#10b981', marginTop: '12px' }}>
            💚 {localUsage.savings_note}
          </div>
        </div>
      )}
      
      {/* Charts Row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px',
        marginBottom: '24px'
      }}>
        {/* Cost by Project */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            💰 Cost by Project
          </h3>
          <ProjectCostPie data={ledger?.projects} />
        </div>
        
        {/* Activity by Project */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            📊 Activity by Project
          </h3>
          <ProjectActivityBar data={ledger?.projects} />
        </div>
      </div>
      
      {/* Bottom Row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '24px'
      }}>
        {/* Model Usage */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            🤖 Model Usage
          </h3>
          <ModelBreakdown data={summary?.modelBreakdown} />
        </div>
        
        {/* Clarification Queue */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            ❓ Needs Clarification
          </h3>
          <ClarificationQueue items={clarifications?.items} />
        </div>
      </div>
        </>
      )}
      
      {/* COSTS TAB */}
      {activeTab === 'costs' && (
        <>
      {/* Project Details Table */}
      {ledger?.projects && Object.keys(ledger.projects).length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px',
          marginTop: '24px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            📋 Project Details
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text-muted)' }}>Project</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Sessions</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Cost</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Tokens</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Tasks</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Completed</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>$/Session</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(ledger.projects)
                  .sort(([,a], [,b]) => b.cost_usd - a.cost_usd)
                  .map(([name, stats]) => (
                    <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ 
                          display: 'inline-block',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: COLORS[name] || '#6b7280',
                          marginRight: '8px'
                        }}></span>
                        {name}
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px 8px' }}>{stats.session_count}</td>
                      <td style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--success)' }}>
                        ${stats.cost_usd?.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px 8px' }}>
                        {(stats.total_tokens / 1000).toFixed(0)}K
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px 8px' }}>{stats.tasks_initiated}</td>
                      <td style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--accent)' }}>
                        {stats.tasks_completed}
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>
                        ${stats.avg_cost_per_session?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <UserCostsTab 
          userCosts={userCosts} 
          loading={userCostsLoading}
          onLoad={async () => {
            setUserCostsLoading(true)
            try {
              const res = await fetch(`${API_BASE}/api/project-tracker/user-costs?recent=100`)
              if (res.ok) setUserCosts(await res.json())
            } catch (e) { console.error(e) }
            finally { setUserCostsLoading(false) }
          }}
        />
      )}
      
      {/* Footer */}
      <div style={{ 
        marginTop: '24px', 
        textAlign: 'center', 
        color: 'var(--text-muted)',
        fontSize: '12px'
      }}>
        Last updated: {summary?.lastUpdated ? new Date(summary.lastUpdated).toLocaleString() : 'Never'}
        {' · '}
        Sessions analyzed: {ledger?.sessions_analyzed || 0}
      </div>
    </div>
  )
}
