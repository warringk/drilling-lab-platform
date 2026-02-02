import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '../../contexts/UserContext'

export default function ConversationalHub() {
  const { user, suggestions } = useUser()
  const [message, setMessage] = useState('')
  const [conversation, setConversation] = useState([
    { role: 'assistant', text: `Good morning, ${user.name}. You have 5 pending tasks and 30 active wells. What would you like to focus on today?` }
  ])
  const inputRef = useRef()
  const chatRef = useRef()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight)
  }, [conversation])

  const handleSend = () => {
    if (!message.trim()) return
    setConversation([...conversation, { role: 'user', text: message }])
    setMessage('')
    // Simulate response
    setTimeout(() => {
      setConversation(c => [...c, { 
        role: 'assistant', 
        text: 'I can help with that. Let me pull up the relevant workspace for you.' 
      }])
    }, 1000)
  }

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      maxWidth: '900px',
      margin: '0 auto',
      padding: '0 24px'
    }}>
      {/* Minimal header */}
      <header style={{ padding: '24px 0', textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 400 }}>THE DRILLING LAB</h1>
      </header>

      {/* Chat area */}
      <div 
        ref={chatRef}
        style={{ 
          flex: 1, 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          paddingBottom: '24px'
        }}
      >
        {conversation.map((msg, i) => (
          <div 
            key={i}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '70%',
              padding: '16px 20px',
              borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)',
              color: msg.role === 'user' ? '#000' : 'var(--text-primary)',
              fontSize: '15px',
              lineHeight: '1.5'
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Quick access cards */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        overflowX: 'auto',
        padding: '16px 0',
        marginBottom: '16px'
      }}>
        {user.categories.map(cat => (
          <Link
            key={cat.id}
            to={`/workspace/${cat.id}`}
            style={{
              flex: '0 0 auto',
              padding: '12px 20px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '24px',
              textDecoration: 'none',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = cat.color}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <span>{cat.icon}</span>
            <span>{cat.name}</span>
          </Link>
        ))}
      </div>

      {/* Input area */}
      <div style={{ 
        padding: '24px 0',
        borderTop: '1px solid var(--border)'
      }}>
        {/* Suggestions */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          marginBottom: '16px',
          flexWrap: 'wrap'
        }}>
          {suggestions.map((s, i) => (
            <button 
              key={i}
              onClick={() => setMessage(s)}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            ref={inputRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything or describe what you want to do..."
            style={{
              flex: 1,
              padding: '16px 20px',
              fontSize: '15px',
              borderRadius: '24px',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)'
            }}
          />
          <button 
            onClick={handleSend}
            className="btn btn-primary"
            style={{ 
              borderRadius: '24px',
              padding: '16px 24px'
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
