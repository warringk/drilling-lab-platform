import { useState, useRef, useEffect } from 'react'
import { useUser } from '../../contexts/UserContext'
import { useLocation } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL ?? ''

export default function ChatWidget() {
  const { user, suggestions } = useUser()
  const location = useLocation()
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: `Hello ${user.name}! I'm connected to your drilling data. How can I help?`, time: new Date() }
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [currentDomain, setCurrentDomain] = useState(null)
  const chatRef = useRef()

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight)
  }, [messages])

  // Get current context from app state
  const getContext = () => ({
    active_tab: location.pathname.replace('/', '') || 'dashboard',
    active_hash: location.hash.replace('#', ''),
    timestamp: new Date().toISOString()
  })

  const sendMessage = async () => {
    if (!message.trim() || isLoading) return
    
    const userMsg = message
    setMessage('')
    setMessages(m => [...m, { role: 'user', text: userMsg, time: new Date() }])
    setIsLoading(true)

    try {
      // 1. Route the message and get brain context
      const routeRes = await fetch(`${API_URL}/api/router/brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          channel: 'web',
          channelId: user.telegramId || user.id || 'web-user',
          context: getContext()
        })
      })

      if (!routeRes.ok) throw new Error('Routing failed')
      
      const routeData = await routeRes.json()
      setCurrentDomain(routeData.routing)

      // 2. For now, show routing info + placeholder response
      // TODO: Wire to actual LLM with systemPrompt
      const domainEmoji = {
        drilling: '🛢️',
        architecture: '🏗️',
        pipeline: '📊',
        personal: '👤'
      }[routeData.routing.domain] || '🤖'

      // Simulate thinking based on domain
      const responses = {
        drilling: `${domainEmoji} I can see you're asking about drilling data. Based on my analysis of ${routeData.entities?.rig ? `Rig ${routeData.entities.rig}` : 'your wells'}...`,
        architecture: `${domainEmoji} That's an architecture question. Let me think about system design...`,
        pipeline: `${domainEmoji} Checking pipeline status for you...`,
        personal: `${domainEmoji} I'll help you with that personal task...`
      }

      // Add response with routing indicator
      setTimeout(() => {
        setMessages(m => [...m, {
          role: 'assistant',
          text: responses[routeData.routing.domain] || "I'll help you with that...",
          time: new Date(),
          domain: routeData.routing.domain,
          confidence: routeData.routing.confidence,
          entities: routeData.entities
        }])
        setIsLoading(false)
      }, 500)

    } catch (error) {
      console.error('Chat error:', error)
      setMessages(m => [...m, {
        role: 'assistant',
        text: "Sorry, I encountered an error. Please try again.",
        time: new Date(),
        error: true
      }])
      setIsLoading(false)
    }
  }

  const domainColors = {
    drilling: '#22c55e',
    architecture: '#8b5cf6',
    pipeline: '#3b82f6',
    personal: '#f59e0b'
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
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '8px', height: '8px',
            borderRadius: '50%',
            background: 'var(--success)',
            boxShadow: '0 0 8px var(--success)'
          }} />
          <div>
            <div style={{ fontWeight: 500, fontSize: '14px' }}>AI Assistant</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Unified Brain Router
            </div>
          </div>
        </div>
        
        {/* Domain indicator */}
        {currentDomain && (
          <div style={{
            padding: '4px 10px',
            borderRadius: '12px',
            background: domainColors[currentDomain.domain] + '20',
            border: `1px solid ${domainColors[currentDomain.domain]}40`,
            fontSize: '11px',
            color: domainColors[currentDomain.domain],
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>{currentDomain.domain}</span>
            <span style={{ opacity: 0.6 }}>{Math.round(currentDomain.confidence * 100)}%</span>
          </div>
        )}
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
              lineHeight: '1.5',
              borderLeft: msg.domain ? `3px solid ${domainColors[msg.domain]}` : 'none'
            }}>
              {msg.text}
              {msg.entities && Object.keys(msg.entities).length > 0 && (
                <div style={{ 
                  marginTop: '8px', 
                  paddingTop: '8px', 
                  borderTop: '1px solid var(--border)',
                  fontSize: '11px',
                  color: 'var(--text-muted)'
                }}>
                  {Object.entries(msg.entities).map(([k, v]) => (
                    <span key={k} style={{ marginRight: '8px' }}>
                      {k}: <strong>{Array.isArray(v) ? v.join(', ') : v}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ 
              fontSize: '10px', 
              color: 'var(--text-muted)', 
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {msg.domain && (
                <span style={{ color: domainColors[msg.domain] }}>
                  • {msg.domain}
                </span>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '10px 14px',
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            width: 'fit-content',
            fontSize: '13px',
            color: 'var(--text-muted)'
          }}>
            <span className="loading-dots">Thinking</span>
          </div>
        )}
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
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask about drilling, pipeline, or anything..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '13px',
              borderRadius: '8px',
              opacity: isLoading ? 0.6 : 1
            }}
          />
          <button 
            onClick={sendMessage} 
            className="btn btn-primary" 
            disabled={isLoading}
            style={{ padding: '10px 16px' }}
          >
            {isLoading ? '...' : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}
