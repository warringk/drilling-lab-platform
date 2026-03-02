import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// Pipeline Issues Modal
function PipelineIssuesModal({ onClose }) {
  const [issues, setIssues] = useState({ open: [], resolved: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open')

  useEffect(() => {
    fetch('/api/metrics/pipeline-issues')
      .then(r => r.json())
      .then(data => {
        setIssues(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const currentIssues = tab === 'open' ? issues.open : issues.resolved

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--border)'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Pipeline Issues</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {issues.total_open || 0} open, {issues.total_resolved || 0} resolved
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '24px',
              cursor: 'pointer'
            }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {['open', 'resolved'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '12px',
                background: tab === t ? 'var(--bg-primary)' : 'transparent',
                border: 'none',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              {t === 'open' ? '🔴 Open' : '✅ Resolved'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Loading...
            </div>
          ) : currentIssues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>
                {tab === 'open' ? '🎉' : '📋'}
              </div>
              <p>{tab === 'open' ? 'No open issues!' : 'No resolved issues yet'}</p>
            </div>
          ) : (
            currentIssues.map((issue, i) => (
              <div key={i} style={{
                background: 'var(--bg-primary)',
                border: `1px solid ${tab === 'open' ? 'var(--error)' : 'var(--success)'}`,
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '14px' }}>{issue.title}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {issue.severity} • {new Date(issue.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {issue.symptoms && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    {issue.symptoms}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Main Transmission Chart Widget
export default function TransmissionChart() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showIssues, setShowIssues] = useState(false)

  const fetchData = () => {
    fetch('/api/metrics/transmission-rate?hours=24')
      .then(r => r.json())
      .then(result => {
        setData(result.hourly || [])
        setTotal(result.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  // Calculate current rate (last hour with data)
  const currentRate = data.filter(d => d.records > 0).slice(-1)[0]?.rate_per_min || 0

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid var(--border)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
            EDR Transmission Rate
          </h3>
          <p style={{ fontSize: '24px', fontWeight: 700 }}>
            {currentRate.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>rec/min</span>
          </p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Total: {total.toLocaleString()} records
          </p>
        </div>
        <button
          onClick={() => setShowIssues(true)}
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🔧 Issues
        </button>
      </div>

      {/* Chart */}
      <div style={{ height: '150px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            Loading...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorRecords" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="hour_label" 
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                width={45}
              />
              <Tooltip 
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value) => [value.toLocaleString() + ' records', 'Count']}
                labelFormatter={(label) => `Hour: ${label}`}
              />
              <Area 
                type="monotone" 
                dataKey="records" 
                stroke="var(--accent)" 
                strokeWidth={2}
                fill="url(#colorRecords)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Issues Modal */}
      {showIssues && <PipelineIssuesModal onClose={() => setShowIssues(false)} />}
    </div>
  )
}
