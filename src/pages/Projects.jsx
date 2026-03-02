import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// ═══════════════════════════════════════════════════════════
// Status & Priority configs
// ═══════════════════════════════════════════════════════════

const WP_STATUS = {
  active:   { icon: '🔄', label: 'Running', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  complete: { icon: '✅', label: 'Done',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  pending:  { icon: '📋', label: 'Ready',   color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  backlog:  { icon: '📝', label: 'Backlog', color: '#6b7280', bg: 'rgba(128,128,128,0.08)' },
}

const WP_PRIORITY = {
  critical: { label: 'P0', color: '#ef4444' },
  high:     { label: 'P1', color: '#f59e0b' },
  medium:   { label: 'P2', color: '#3b82f6' },
  normal:   { label: '',   color: 'transparent' },
}

// ═══════════════════════════════════════════════════════════
// Work Package Card
// ═══════════════════════════════════════════════════════════

function WPCard({ task }) {
  const status = WP_STATUS[task.status] || WP_STATUS.pending
  const priority = WP_PRIORITY[task.priority] || WP_PRIORITY.normal
  const [expanded, setExpanded] = useState(false)

  const wpId = task.name.match(/^(WP-\d+)/)?.[1] || ''
  const title = task.name.replace(/^WP-\d+:\s*/, '')
  const subtasks = task.subtasks || []
  const doneCount = subtasks.filter(s => s.status === 'complete').length

  const attr = task.attribution_rollup || task.attribution || {}
  const cost = attr.cost_usd || 0
  const tokens = (attr.tokens_input || 0) + (attr.tokens_output || 0)

  return (
    <div
      onClick={() => subtasks.length > 0 && setExpanded(!expanded)}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        borderLeft: `3px solid ${status.color}`,
        cursor: subtasks.length > 0 ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        overflow: 'hidden',
        marginBottom: '8px',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = status.color }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ padding: '12px 14px' }}>
        {/* Top row: badges + title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '11px', fontWeight: 700, fontFamily: 'monospace',
                color: status.color, background: status.bg,
                padding: '1px 6px', borderRadius: '4px'
              }}>{wpId}</span>
              {priority.label && (
                <span style={{
                  fontSize: '10px', fontWeight: 700,
                  color: '#fff', background: priority.color,
                  padding: '1px 5px', borderRadius: '3px'
                }}>{priority.label}</span>
              )}
              <span style={{
                fontSize: '10px', color: status.color,
                background: status.bg, padding: '1px 6px', borderRadius: '3px'
              }}>{status.label}</span>
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.3 }}>{title}</h4>
            {task.description && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>
                {task.description.slice(0, 140)}{task.description.length > 140 ? '…' : ''}
              </p>
            )}
          </div>
          <span style={{ fontSize: '16px', flexShrink: 0 }}>{status.icon}</span>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '8px', paddingTop: '6px', borderTop: '1px solid var(--border)',
          fontSize: '11px', color: 'var(--text-muted)'
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {task.assigned_bot && (
              <span style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>
                🤖 {task.assigned_bot}
              </span>
            )}
            {cost > 0 && <span style={{ color: 'var(--accent)' }}>${cost.toFixed(2)}</span>}
            {tokens > 0 && <span>{(tokens / 1000).toFixed(0)}k tok</span>}
          </div>
          {subtasks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '50px', height: '3px', background: 'var(--bg-primary)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${(doneCount / subtasks.length) * 100}%`, height: '100%', background: 'var(--success)', borderRadius: '2px' }} />
              </div>
              <span style={{ fontSize: '10px' }}>{doneCount}/{subtasks.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded subtasks */}
      {expanded && subtasks.length > 0 && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
          {subtasks.map((st, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', marginBottom: '3px', fontSize: '12px' }}>
              <span>{st.status === 'complete' ? '✅' : '⬜'}</span>
              <span style={{
                color: st.status === 'complete' ? 'var(--text-muted)' : 'var(--text-secondary)',
                textDecoration: st.status === 'complete' ? 'line-through' : 'none'
              }}>{st.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// GitHub Issue Row
// ═══════════════════════════════════════════════════════════

function IssueRow({ issue }) {
  const age = Math.floor((Date.now() - new Date(issue.updatedAt)) / 86400000)
  const ageLabel = age === 0 ? 'today' : age === 1 ? '1d ago' : `${age}d ago`

  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        marginBottom: '6px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <span style={{ fontSize: '14px', color: '#22c55e' }}>●</span>
      <span style={{
        fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace',
        minWidth: '30px'
      }}>#{issue.number}</span>
      <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{issue.title}</span>
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        {(issue.labels || []).map((l, i) => (
          <span key={i} style={{
            fontSize: '10px', padding: '1px 6px', borderRadius: '3px',
            background: 'var(--bg-primary)', color: 'var(--text-muted)',
            border: '1px solid var(--border)'
          }}>{l.name}</span>
        ))}
      </div>
      <span style={{
        fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace',
        minWidth: '50px', textAlign: 'right'
      }}>{issue.repo}</span>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '50px', textAlign: 'right' }}>
        {ageLabel}
      </span>
    </a>
  )
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export default function Projects() {
  const navigate = useNavigate()
  const [wpData, setWpData] = useState(null)
  const [issues, setIssues] = useState(null)
  const [wpLoading, setWpLoading] = useState(true)
  const [issuesLoading, setIssuesLoading] = useState(true)

  useEffect(() => {
    fetch('/api/project-tracker/work-packages')
      .then(r => r.json())
      .then(data => { setWpData(data); setWpLoading(false) })
      .catch(() => setWpLoading(false))

    fetch('/api/project-tracker/github-issues')
      .then(r => r.json())
      .then(data => { setIssues(data); setIssuesLoading(false) })
      .catch(() => setIssuesLoading(false))
  }, [])

  // Group work packages by status
  const tasks = wpData?.project?.tasks || []
  const running = tasks.filter(t => t.status === 'active')
  const ready = tasks.filter(t => t.status === 'pending')
  const done = tasks.filter(t => t.status === 'complete')
  const backlog = wpData?.backlog || []

  const ghIssues = issues?.issues || []

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <button
          onClick={() => navigate('/locker')}
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: '20px',
            cursor: 'pointer', padding: '8px'
          }}
        >←</button>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600 }}>Project Board</h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Work packages + GitHub issues
          </p>
        </div>
      </header>

      <main style={{
        flex: 1, padding: '24px',
        maxWidth: '900px', margin: '0 auto', width: '100%'
      }}>

        {/* ─── Work Packages ─── */}
        <section style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              📦 Work Packages
            </h2>
            <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
              {running.length > 0 && (
                <span style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '3px 8px', borderRadius: '10px' }}>
                  {running.length} running
                </span>
              )}
              {ready.length > 0 && (
                <span style={{ color: '#eab308', background: 'rgba(234,179,8,0.1)', padding: '3px 8px', borderRadius: '10px' }}>
                  {ready.length} ready
                </span>
              )}
              {done.length > 0 && (
                <span style={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 8px', borderRadius: '10px' }}>
                  {done.length} done
                </span>
              )}
            </div>
          </div>

          {wpLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</p>
          ) : (
            <>
              {/* Running first, then ready, then done */}
              {running.map(t => <WPCard key={t.id} task={t} />)}
              {ready.map(t => <WPCard key={t.id} task={t} />)}
              {done.map(t => <WPCard key={t.id} task={t} />)}

              {/* Backlog as compact tags */}
              {backlog.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Backlog
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {backlog.map((item, i) => (
                      <span key={i} style={{
                        fontSize: '11px', color: 'var(--text-secondary)',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        padding: '3px 8px', borderRadius: '5px'
                      }}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ─── GitHub Issues ─── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🐙 GitHub Issues
              {ghIssues.length > 0 && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {ghIssues.length} open
                </span>
              )}
            </h2>
          </div>

          {issuesLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</p>
          ) : ghIssues.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No open issues</p>
          ) : (
            ghIssues.map(issue => <IssueRow key={`${issue.repo}-${issue.number}`} issue={issue} />)
          )}
        </section>
      </main>
    </div>
  )
}
