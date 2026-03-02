import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '../../contexts/UserContext'
import ChatWidget from '../../components/chat/ChatWidget'

export default function CommandCenter() {
  const { user, suggestions } = useUser()
  const [chatOpen, setChatOpen] = useState(true)

  const stats = [
    { label: 'Wells Active', value: '30', trend: '+2' },
    { label: 'EDR Records', value: '61M', trend: '+1.2M' },
    { label: 'Tasks Pending', value: '5', trend: '-2' },
    { label: 'Data Freshness', value: '2h', trend: '↓' }
  ]

  const recentActivity = [
    { time: '10m ago', text: 'Pipeline sync completed for Rig 142', type: 'success' },
    { time: '1h ago', text: 'New well data received: 0547628', type: 'info' },
    { time: '3h ago', text: 'Task completed: Configure Redis queue', type: 'success' },
    { time: '5h ago', text: 'Alert: Data gap detected on Well 0512847', type: 'warning' }
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 className="logo-hemi" style={{ fontSize: '18px' }}>drillinglab.ai</h1>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Command Center</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Welcome, {user.name}</span>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--accent)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '14px'
          }}>K</div>
        </div>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left panel - Stats & Activity */}
        <div style={{ width: '320px', borderRight: '1px solid var(--border)', padding: '24px', overflowY: 'auto' }}>
          {/* Quick Stats */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '16px' }}>
              System Status
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {stats.map(s => (
                <div key={s.label} style={{
                  background: 'var(--bg-secondary)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 600 }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--success)', marginTop: '4px' }}>{s.trend}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div>
            <h3 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Recent Activity
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentActivity.map((a, i) => (
                <div key={i} style={{
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px',
                  borderLeft: `3px solid var(--${a.type === 'success' ? 'success' : a.type === 'warning' ? 'warning' : 'accent'})`
                }}>
                  <div style={{ fontSize: '13px' }}>{a.text}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{a.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center - Categories */}
        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            What would you like to work on?
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', maxWidth: '600px' }}>
            {user.categories.map(cat => (
              <Link 
                key={cat.id} 
                to={`/workspace/${cat.id}`}
                style={{
                  padding: '24px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = cat.color
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.transform = 'none'
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>{cat.icon}</div>
                <div style={{ fontSize: '16px', fontWeight: 500 }}>{cat.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Click to open workspace →
                </div>
              </Link>
            ))}
          </div>

          {/* Quick suggestions */}
          <div style={{ marginTop: '40px' }}>
            <h3 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Suggested Actions
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {suggestions.map((s, i) => (
                <button key={i} className="btn" style={{ fontSize: '12px', padding: '6px 12px' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right - Chat */}
        <div style={{
          width: chatOpen ? '400px' : '0',
          borderLeft: chatOpen ? '1px solid var(--border)' : 'none',
          transition: 'width 0.2s',
          overflow: 'hidden'
        }}>
          <ChatWidget />
        </div>
      </div>
    </div>
  )
}
