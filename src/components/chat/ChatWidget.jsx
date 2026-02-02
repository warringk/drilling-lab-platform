import { useState, useRef, useEffect } from 'react'
import { useUser } from '../../contexts/UserContext'

export default function ChatWidget() {
  const { user, suggestions } = useUser()
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: `Hello ${user.name}! I'm connected to your Telegram chat. How can I help?`, time: new Date() }
  ])
  const chatRef = useRef()

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight)
  }, [messages])

  const sendMessage = () => {
    if (!message.trim()) return
    setMessages([...messages, { role: 'user', text: message, time: new Date() }])
    setMessage('')
    
    setTimeout(() => {
      setMessages(m => [...m, { 
        role: 'assistant', 
        text: "I'll help you with that. Let me check the relevant data...", 
        time: new Date() 
      }])
    }, 800)
  }

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'var(--bg-primary)'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '8px', height: '8px',
          borderRadius: '50%',
          background: 'var(--success)',
          boxShadow: '0 0 8px var(--success)'
        }} />
        <div>
          <div style={{ fontWeight: 500, fontSize: '14px' }}>AI Assistant</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Connected to Telegram</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
          }}>
            <div style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)',
              color: msg.role === 'user' ? '#000' : 'var(--text-primary)',
              fontSize: '13px',
              lineHeight: '1.5'
            }}>
              {msg.text}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {suggestions.slice(0, 3).map((s, i) => (
            <button 
              key={i}
              onClick={() => setMessage(s)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Message..."
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '13px',
              borderRadius: '8px'
            }}
          />
          <button onClick={sendMessage} className="btn btn-primary" style={{ padding: '10px 16px' }}>
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
