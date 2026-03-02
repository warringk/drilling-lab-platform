import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || ''

const BOTS = [
  { id: 'kurtarchdevbot', name: 'KurtArchDev', emoji: '🏗️', desc: 'Architecture & Strategy' },
  { id: 'main-drilling-lab', name: 'Drilling Lab', emoji: '🛢️', desc: 'Main drilling assistant' },
  { id: 'pipeline-bot', name: 'Piper', emoji: '🔧', desc: 'Pipeline operations' },
  { id: 'datascience-bot', name: 'Data Science', emoji: '📊', desc: 'Analytics & ML' },
  { id: 'mechanic-bot', name: 'Mechanic', emoji: '🔩', desc: 'General assistance' },
  { id: 'playbot', name: 'PlayBot', emoji: '🎮', desc: 'Personal assistant' },
]

export default function WebChat() {
  const [searchParams] = useSearchParams()
  const initialBot = searchParams.get('bot') || 'kurtarchdevbot'
  const contextMessage = searchParams.get('context')
  
  const [selectedBot, setSelectedBot] = useState(initialBot)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [contextSent, setContextSent] = useState(false)
  const messagesEndRef = useRef(null)
  
  const [showContextChoice, setShowContextChoice] = useState(!!contextMessage)
  
  const handlePickUpFromHere = async () => {
    setShowContextChoice(false)
    setMessages([{ 
      role: 'system', 
      content: `📋 Loading full context for: "${contextMessage}"`,
      timestamp: new Date()
    }])
    
    // Request full context pickup
    const prompt = `I want to pick up where we left off. The last thing we discussed was: "${contextMessage}"

Please retrieve any relevant context from our previous conversation and help me continue from there. What were we working on and what are the next steps?`
    
    await sendMessageWithText(prompt)
  }
  
  const handleAskAboutThis = async () => {
    setShowContextChoice(false)
    setMessages([{ 
      role: 'system', 
      content: `❓ Asking about: "${contextMessage}"`,
      timestamp: new Date()
    }])
    
    // Simple query about the topic
    const prompt = `I have a question about this topic: "${contextMessage}"

Can you help me understand or provide more information about this?`
    
    await sendMessageWithText(prompt)
  }
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  const sendMessageWithText = async (text) => {
    if (!text.trim() || loading) return
    
    const userMessage = text.trim()
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }])
    setLoading(true)
    
    try {
      const currentBotInfo = BOTS.find(b => b.id === selectedBot) || BOTS[0]
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: { domain: currentBotInfo.desc, userName: 'Kurt' },
          history: messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-6)
        })
      })

      const data = await res.json()

      if (data.error && !data.response) {
        setMessages(prev => [...prev, { role: 'error', content: data.error, timestamp: new Date() }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
          bot: selectedBot
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: err.message, timestamp: new Date() }])
    } finally {
      setLoading(false)
    }
  }
  
  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    await sendMessageWithText(text)
  }
  
  const currentBot = BOTS.find(b => b.id === selectedBot) || BOTS[0]
  
  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'var(--bg)',
      color: 'var(--text)'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        background: 'var(--bg-secondary)'
      }}>
        <span style={{ fontSize: '24px' }}>{currentBot.emoji}</span>
        <div>
          <div style={{ fontWeight: 600 }}>{currentBot.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{currentBot.desc}</div>
        </div>
        
        {/* Bot Selector */}
        <select 
          value={selectedBot}
          onChange={(e) => {
            setSelectedBot(e.target.value)
            setMessages([])
          }}
          style={{
            marginLeft: 'auto',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            cursor: 'pointer'
          }}
        >
          {BOTS.map(bot => (
            <option key={bot.id} value={bot.id}>
              {bot.emoji} {bot.name}
            </option>
          ))}
        </select>
      </div>
      
      {/* Messages */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {/* Context Choice Modal */}
        {showContextChoice && contextMessage && (
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '24px',
            margin: '20px auto',
            maxWidth: '500px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>{currentBot.emoji}</div>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Continue with {currentBot.name}</div>
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-secondary)', 
              marginBottom: '20px',
              padding: '12px',
              background: 'var(--bg)',
              borderRadius: '8px',
              fontStyle: 'italic'
            }}>
              "{contextMessage}"
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handlePickUpFromHere}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                🔄 Pick up from here
                <span style={{ fontSize: '11px', opacity: 0.8 }}>(full context)</span>
              </button>
              
              <button
                onClick={handleAskAboutThis}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                ❓ Ask about this
                <span style={{ fontSize: '11px', opacity: 0.6 }}>(quick query)</span>
              </button>
            </div>
            
            <button
              onClick={() => setShowContextChoice(false)}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Skip and start fresh
            </button>
          </div>
        )}
        
        {messages.length === 0 && !showContextChoice && (
          <div style={{ 
            textAlign: 'center', 
            color: 'var(--text-muted)', 
            marginTop: '40px' 
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>{currentBot.emoji}</div>
            <div>Start chatting with {currentBot.name}</div>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div 
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div style={{
              maxWidth: '70%',
              padding: '12px 16px',
              borderRadius: '12px',
              background: msg.role === 'user' 
                ? 'var(--accent)' 
                : msg.role === 'error'
                  ? 'var(--error)'
                  : 'var(--bg-secondary)',
              color: msg.role === 'user' ? '#fff' : 'var(--text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {msg.content}
              <div style={{ 
                fontSize: '10px', 
                opacity: 0.6, 
                marginTop: '6px',
                textAlign: msg.role === 'user' ? 'right' : 'left'
              }}>
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-muted)'
            }}>
              {currentBot.emoji} Thinking...
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        gap: '12px'
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={`Message ${currentBot.name}...`}
          disabled={loading}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '14px'
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            background: loading ? 'var(--border)' : 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
