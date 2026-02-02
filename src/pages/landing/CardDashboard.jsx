import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '../../contexts/UserContext'

export default function CardDashboard() {
  const { user, suggestions } = useUser()
  const [chatExpanded, setChatExpanded] = useState(false)
  const [inputValue, setInputValue] = useState('')

  const quickStats = [
    { label: 'Active Wells', value: '30', icon: '🛢️' },
    { label: 'Data Points', value: '61M', icon: '📊' },
    { label: 'Tasks', value: '5', icon: '📋' },
    { label: 'Agents Online', value: '3', icon: '🤖' }
  ]

  const recentItems = [
    { type: 'task', title: 'Backfill EDR data for Rig 142', status: 'pending' },
    { type: 'well', title: 'Well 0547628 - New data', status: 'active' },
    { type: 'alert', title: 'Data gap on Well 0512847', status: 'warning' }
  ]

  return (
    <div style={{ minHeight: '100vh', padding: '32px' }}>
      {/* Header */}
      <header style={{ 
        maxWidth: '1200px', 
        margin: '0 auto 48px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 500 }}>THE DRILLING LAB</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Welcome back, {user.name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {quickStats.map(s => (
            <div key={s.label} style={{
              padding: '8px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              textAlign: 'center',
              minWidth: '80px'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 600 }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </header>

      {/* Main Grid */}
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '24px'
      }}>
        {/* AI Chat Card - spans 8 cols */}
        <div style={{
          gridColumn: 'span 8',
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }}>
          <div style={{ 
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 500 }}>AI Assistant</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Connected to Telegram • Always learning
              </p>
            </div>
            <div style={{ 
              width: '8px', height: '8px', 
              borderRadius: '50%', 
              background: 'var(--success)',
              boxShadow: '0 0 8px var(--success)'
            }} />
          </div>
          
          <div style={{ padding: '24px', minHeight: '200px' }}>
            <div style={{
              background: 'var(--bg-primary)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              fontSize: '14px',
              lineHeight: '1.6'
            }}>
              Good morning! You have <strong>5 pending tasks</strong> and <strong>30 active wells</strong>.
              Latest data is <strong>2 hours fresh</strong>. What would you like to focus on?
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {suggestions.map((s, i) => (
                <button 
                  key={i}
                  onClick={() => setInputValue(s)}
                  style={{
                    padding: '8px 14px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '20px',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="Type a message or command..."
                style={{
                  flex: 1,
                  padding: '14px 18px',
                  borderRadius: '12px',
                  fontSize: '14px'
                }}
              />
              <button className="btn btn-primary" style={{ borderRadius: '12px', padding: '14px 20px' }}>
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Recent Activity - spans 4 cols */}
        <div style={{
          gridColumn: 'span 4',
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '20px 24px'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '16px' }}>Recent</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentItems.map((item, i) => (
              <div key={i} style={{
                padding: '12px',
                background: 'var(--bg-primary)',
                borderRadius: '8px',
                fontSize: '13px'
              }}>
                <div style={{ marginBottom: '4px' }}>{item.title}</div>
                <div style={{ 
                  fontSize: '11px', 
                  color: item.status === 'warning' ? 'var(--warning)' : 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}>
                  {item.type} • {item.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Cards */}
        {user.categories.map(cat => (
          <Link
            key={cat.id}
            to={`/workspace/${cat.id}`}
            style={{
              gridColumn: 'span 3',
              padding: '24px',
              background: 'var(--bg-secondary)',
              borderRadius: '16px',
              border: '1px solid var(--border)',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = cat.color
              e.currentTarget.style.transform = 'translateY(-4px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '16px' }}>{cat.icon}</div>
            <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px' }}>{cat.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 'auto' }}>
              Open workspace →
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
