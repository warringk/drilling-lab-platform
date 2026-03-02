import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '../../contexts/UserContext'

export default function CardDashboard() {
  const { user, memory, chatHistory, addChatMessage, suggestions, isLoaded } = useUser()
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState([])
  const chatRef = useRef()

  // Initialize with context-aware greeting
  useEffect(() => {
    if (isLoaded && messages.length === 0) {
      const greeting = buildGreeting()
      setMessages([{ role: 'assistant', text: greeting, time: new Date() }])
    }
  }, [isLoaded])

  // Auto-scroll chat
  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight)
  }, [messages])

  function buildGreeting() {
    const hour = new Date().getHours()
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    
    let greeting = `${timeGreeting}, ${user.name}.`
    
    if (memory.context.currentFocus) {
      greeting += ` Last time we were working on: **${memory.context.currentFocus}**.`
    }
    
    if (memory.context.activeTasks?.length) {
      const pending = memory.context.activeTasks.filter(t => t.status === 'pending').length
      if (pending > 0) {
        greeting += ` You have ${pending} pending task${pending > 1 ? 's' : ''}.`
      }
    }
    
    greeting += ' How can I help?'
    return greeting
  }

  function sendMessage() {
    if (!inputValue.trim()) return
    
    // Add user message
    const userMsg = { role: 'user', text: inputValue, time: new Date() }
    setMessages(prev => [...prev, userMsg])
    addChatMessage('user', inputValue)
    setInputValue('')

    // Simulate AI response (will connect to real backend)
    setTimeout(() => {
      const response = { 
        role: 'assistant', 
        text: "I'll help with that. Let me check the relevant context...",
        time: new Date()
      }
      setMessages(prev => [...prev, response])
      addChatMessage('assistant', response.text)
    }, 800)
  }

  if (!isLoaded) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
  }

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'var(--bg-primary)'
    }}>
      {/* ===== HEADER ZONE (Fixed) ===== */}
      <header style={{ 
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 className="logo-hemi" style={{ fontSize: '18px' }}>
            drillinglab.ai
          </h1>
          <span style={{ 
            fontSize: '11px', 
            color: 'var(--text-muted)',
            padding: '4px 8px',
            background: 'var(--bg-secondary)',
            borderRadius: '4px'
          }}>
            {memory.context.currentFocus || 'Dashboard'}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Status indicators */}
          <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span>🟢 Systems OK</span>
            <span>•</span>
            <span>{memory.context.activeTasks?.length || 0} tasks</span>
          </div>
          
          {/* User */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '6px 12px',
            background: 'var(--bg-secondary)',
            borderRadius: '20px'
          }}>
            <span style={{ fontSize: '13px' }}>{user.name}</span>
            <div style={{
              width: '28px', height: '28px', 
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 600, color: '#000'
            }}>
              {user.name[0]}
            </div>
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* ===== PRIMARY ZONE (Left/Center) ===== */}
        <div style={{ 
          flex: 1, 
          padding: '24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          
          {/* Context Card - Shows current state */}
          <div style={{
            padding: '20px 24px',
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Context
            </div>
            <div style={{ fontSize: '15px', lineHeight: 1.6 }}>
              {memory.summary || 'No context loaded yet.'}
            </div>
            {memory.context.recentTopics?.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {memory.context.recentTopics.slice(0, 4).map((topic, i) => (
                  <span key={i} style={{
                    padding: '4px 10px',
                    background: 'var(--bg-primary)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)'
                  }}>
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Workspace Cards Grid */}
          <div>
            <div style={{ 
              fontSize: '12px', 
              color: 'var(--text-muted)', 
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Workspaces
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '16px'
            }}>
              {user.workspaces.map(ws => (
                <Link
                  key={ws.id}
                  to={`/workspace/${ws.id}`}
                  style={{
                    padding: '20px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = ws.color
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '12px' }}>{ws.icon}</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>{ws.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {ws.pinned ? '📌 Pinned' : 'Open workspace →'}
                  </div>
                </Link>
              ))}
              
              {/* Add Workspace Card */}
              <button
                style={{
                  padding: '20px',
                  background: 'transparent',
                  borderRadius: '12px',
                  border: '1px dashed var(--border)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-secondary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>➕</div>
                <div style={{ fontSize: '14px' }}>Add Workspace</div>
              </button>
            </div>
          </div>

          {/* Active Tasks Quick View */}
          {memory.context.activeTasks?.length > 0 && (
            <div style={{
              padding: '20px 24px',
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ 
                fontSize: '12px', 
                color: 'var(--text-muted)', 
                marginBottom: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Active Tasks
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {memory.context.activeTasks.map(task => (
                  <div key={task.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    background: 'var(--bg-primary)',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}>
                    <span style={{ 
                      color: task.status === 'in_progress' ? 'var(--accent)' : 'var(--text-muted)' 
                    }}>
                      {task.status === 'in_progress' ? '●' : '○'}
                    </span>
                    <span>{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== CHAT ZONE (Right - Fixed) ===== */}
        <div style={{
          width: '380px',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-primary)'
        }}>
          {/* Chat Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{
              width: '8px', height: '8px',
              borderRadius: '50%',
              background: 'var(--success)',
              boxShadow: '0 0 8px var(--success)'
            }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>AI Assistant</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Synced with Telegram • Memory active
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatRef} style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%'
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: msg.role === 'user' ? '#000' : 'var(--text-primary)',
                  fontSize: '14px',
                  lineHeight: 1.5
                }}>
                  {msg.text}
                </div>
                <div style={{ 
                  fontSize: '10px', 
                  color: 'var(--text-muted)', 
                  marginTop: '4px',
                  textAlign: msg.role === 'user' ? 'right' : 'left'
                }}>
                  {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>

          {/* Suggestions */}
          <div style={{ 
            padding: '12px 16px', 
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setInputValue(s)}
                style={{
                  padding: '6px 12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-muted)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Message..."
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  fontSize: '14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)'
                }}
              />
              <button 
                onClick={sendMessage}
                style={{
                  padding: '12px 18px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#000',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
