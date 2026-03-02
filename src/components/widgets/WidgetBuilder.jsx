import { useState, useRef, useEffect } from 'react'
import { useDashboard, WIDGET_TYPES, DEFAULT_WIDGET_CONFIG } from '../../contexts/DashboardContext'

export default function WidgetBuilder({ editingWidget, onClose, initialPrompt }) {
  const { addWidget, updateWidget } = useDashboard()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewWidget, setPreviewWidget] = useState(null)
  const [hasProcessedInitial, setHasProcessedInitial] = useState(false)
  const chatRef = useRef()
  
  const isEditing = !!editingWidget

  useEffect(() => {
    // Initial message
    if (isEditing) {
      setMessages([{
        role: 'assistant',
        text: `Editing "${editingWidget.title}"\n\nDescribe what changes you'd like to make. For example:\n• "Change the color to green"\n• "Add a trend indicator"\n• "Switch to a bar chart"`,
        time: new Date()
      }])
      setPreviewWidget(editingWidget)
    } else {
      setMessages([{
        role: 'assistant',
        text: `What kind of widget would you like to create?\n\nDescribe what you want to see. For example:\n• "A metric showing total active rigs"\n• "A line chart of days vs depth"\n• "A table of recent well completions"\n• "A KPI card showing average ROP"`,
        time: new Date()
      }])
    }
  }, [])
  
  // Auto-process initial prompt from chat
  useEffect(() => {
    if (initialPrompt && !hasProcessedInitial && messages.length > 0) {
      setHasProcessedInitial(true)
      // Simulate user sending the initial prompt
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'user', text: initialPrompt, time: new Date() }])
        setIsGenerating(true)
        
        setTimeout(() => {
          const result = generateWidgetFromPrompt(initialPrompt, null)
          setPreviewWidget(result.widget)
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            text: result.message,
            time: new Date()
          }])
          setIsGenerating(false)
        }, 800)
      }, 300)
    }
  }, [initialPrompt, hasProcessedInitial, messages.length])

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight)
  }, [messages])

  async function handleSend() {
    if (!input.trim() || isGenerating) return
    
    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMessage, time: new Date() }])
    setIsGenerating(true)

    // Simulate AI processing - in production this would call your LLM API
    setTimeout(() => {
      const result = generateWidgetFromPrompt(userMessage, previewWidget)
      setPreviewWidget(result.widget)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        text: result.message,
        time: new Date()
      }])
      setIsGenerating(false)
    }, 1000)
  }

  // AI Widget Generator (simplified - replace with actual LLM call)
  function generateWidgetFromPrompt(prompt, existingWidget) {
    const lower = prompt.toLowerCase()
    
    // Detect widget type from prompt
    let type = existingWidget?.type || 'metric'
    let config = existingWidget?.config || { ...DEFAULT_WIDGET_CONFIG.metric }
    let title = existingWidget?.title || 'New Widget'
    
    // Parse intent from prompt
    if (lower.includes('chart') || lower.includes('graph') || lower.includes('plot')) {
      type = 'chart'
      config = { ...DEFAULT_WIDGET_CONFIG.chart }
      
      if (lower.includes('line')) config.chartType = 'line'
      else if (lower.includes('bar')) config.chartType = 'bar'
      else if (lower.includes('scatter') || lower.includes('days vs depth')) config.chartType = 'scatter'
      else config.chartType = 'line'
      
      // Extract axes if mentioned
      if (lower.includes('days vs depth') || lower.includes('depth vs days')) {
        title = 'Days vs Depth'
        config.xAxis = 'days'
        config.yAxis = 'depth'
        config.data = generateSampleDaysVsDepth()
      } else if (lower.includes('rop')) {
        title = 'ROP Over Time'
        config.xAxis = 'time'
        config.yAxis = 'rop'
        config.data = generateSampleROP()
      } else {
        title = 'Chart Widget'
        config.data = generateSampleChartData()
      }
    } 
    else if (lower.includes('table') || lower.includes('list')) {
      type = 'table'
      title = 'Data Table'
      config = {
        columns: ['Well', 'Status', 'Depth', 'ROP'],
        rows: [
          ['Well A-1', 'Drilling', '8,500 ft', '125 ft/hr'],
          ['Well B-2', 'Tripping', '12,200 ft', '-'],
          ['Well C-3', 'Drilling', '6,800 ft', '98 ft/hr']
        ]
      }
    }
    else if (lower.includes('metric') || lower.includes('kpi') || lower.includes('number') || lower.includes('total') || lower.includes('average') || lower.includes('count')) {
      type = 'metric'
      
      if (lower.includes('rig') || lower.includes('active')) {
        title = 'Active Rigs'
        config = { value: 12, unit: 'rigs', trend: '+2', color: '#4ade80' }
      } else if (lower.includes('rop')) {
        title = 'Avg ROP'
        config = { value: 127, unit: 'ft/hr', trend: '+5%', color: '#4a9eff' }
      } else if (lower.includes('depth')) {
        title = 'Total Depth'
        config = { value: 45600, unit: 'ft', trend: null, color: '#a78bfa' }
      } else if (lower.includes('well')) {
        title = 'Wells Completed'
        config = { value: 8, unit: 'wells', trend: '+1', color: '#fbbf24' }
      } else {
        title = 'Metric'
        config = { value: 100, unit: '', trend: null, color: '#4a9eff' }
      }
    }

    // Handle color changes
    if (lower.includes('green')) config.color = '#4ade80'
    if (lower.includes('blue')) config.color = '#4a9eff'
    if (lower.includes('red')) config.color = '#ef4444'
    if (lower.includes('purple')) config.color = '#a78bfa'
    if (lower.includes('yellow') || lower.includes('gold')) config.color = '#fbbf24'

    // Handle title changes
    const titleMatch = prompt.match(/title[:\s]+"([^"]+)"|called\s+"([^"]+)"|named\s+"([^"]+)"/i)
    if (titleMatch) {
      title = titleMatch[1] || titleMatch[2] || titleMatch[3]
    }

    const widget = {
      type,
      title,
      config,
      prompt: prompt,
      conversation: [...(existingWidget?.conversation || []), { role: 'user', text: prompt }]
    }

    return {
      widget,
      message: `Here's a preview of your ${type} widget: "${title}"\n\nLooks good? Click "Add to Dashboard" to save it, or describe any changes you'd like.`
    }
  }

  function handleAddWidget() {
    if (!previewWidget) return
    
    if (isEditing) {
      updateWidget(editingWidget.id, previewWidget)
    } else {
      addWidget(previewWidget)
    }
    onClose()
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        width: '900px',
        maxWidth: '95vw',
        height: '700px',
        maxHeight: '90vh',
        background: 'var(--bg-primary)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        display: 'flex',
        overflow: 'hidden'
      }}>
        {/* Preview Panel */}
        <div style={{
          flex: 1,
          padding: '24px',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--text-muted)' }}>
            PREVIEW
          </h3>
          
          <div style={{
            flex: 1,
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}>
            {previewWidget ? (
              <WidgetPreview widget={previewWidget} />
            ) : (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✨</div>
                <p>Describe your widget to see a preview</p>
              </div>
            )}
          </div>

          {previewWidget && (
            <button
              onClick={handleAddWidget}
              style={{
                marginTop: '16px',
                padding: '14px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '10px',
                color: '#000',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              {isEditing ? 'Save Changes' : 'Add to Dashboard'}
            </button>
          )}
        </div>

        {/* Chat Panel */}
        <div style={{
          width: '380px',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)'
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
              <h3 style={{ fontSize: '14px', fontWeight: 500 }}>
                {isEditing ? 'Edit Widget' : 'Widget Builder'}
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Describe what you want
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '28px',
                height: '28px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div 
            ref={chatRef}
            style={{ 
              flex: 1, 
              overflow: 'auto', 
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%'
              }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-primary)',
                  color: msg.role === 'user' ? '#000' : 'var(--text-primary)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap'
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '12px 12px 12px 4px',
                background: 'var(--bg-primary)',
                color: 'var(--text-muted)',
                fontSize: '13px'
              }}>
                Generating...
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Describe your widget..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  fontSize: '13px'
                }}
              />
              <button
                onClick={handleSend}
                disabled={isGenerating}
                style={{
                  padding: '10px 16px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#000',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: isGenerating ? 0.5 : 1
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

// Widget Preview Component
function WidgetPreview({ widget }) {
  if (widget.type === 'metric') {
    return (
      <div style={{ textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {widget.title}
        </div>
        <div style={{ 
          fontSize: '48px', 
          fontWeight: 600, 
          color: widget.config.color || 'var(--text-primary)'
        }}>
          {widget.config.value?.toLocaleString()}
        </div>
        {widget.config.unit && (
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {widget.config.unit}
          </div>
        )}
        {widget.config.trend && (
          <div style={{ 
            fontSize: '13px', 
            color: widget.config.trend.startsWith('+') ? '#4ade80' : '#ef4444',
            marginTop: '8px'
          }}>
            {widget.config.trend}
          </div>
        )}
      </div>
    )
  }

  if (widget.type === 'chart') {
    return (
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {widget.title}
        </div>
        <div style={{ 
          height: '200px', 
          background: 'var(--bg-primary)', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border)'
        }}>
          <SimpleChart data={widget.config.data} type={widget.config.chartType} />
        </div>
      </div>
    )
  }

  if (widget.type === 'table') {
    return (
      <div style={{ width: '100%', overflow: 'auto' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {widget.title}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              {widget.config.columns?.map((col, i) => (
                <th key={i} style={{ 
                  padding: '8px', 
                  textAlign: 'left', 
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text-muted)'
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {widget.config.rows?.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return <div>Unknown widget type</div>
}

// Simple SVG Chart
function SimpleChart({ data = [], type = 'line' }) {
  if (!data || data.length === 0) {
    return <span style={{ color: 'var(--text-muted)' }}>No data</span>
  }

  const width = 300
  const height = 160
  const padding = 20
  
  const maxY = Math.max(...data.map(d => d.y))
  const minY = Math.min(...data.map(d => d.y))
  const maxX = Math.max(...data.map(d => d.x))
  const minX = Math.min(...data.map(d => d.x))
  
  const scaleX = (x) => padding + ((x - minX) / (maxX - minX || 1)) * (width - 2 * padding)
  const scaleY = (y) => height - padding - ((y - minY) / (maxY - minY || 1)) * (height - 2 * padding)

  if (type === 'scatter') {
    return (
      <svg width={width} height={height}>
        {data.map((d, i) => (
          <circle
            key={i}
            cx={scaleX(d.x)}
            cy={scaleY(d.y)}
            r={4}
            fill="#4a9eff"
          />
        ))}
      </svg>
    )
  }

  const pathD = data.map((d, i) => 
    `${i === 0 ? 'M' : 'L'} ${scaleX(d.x)} ${scaleY(d.y)}`
  ).join(' ')

  return (
    <svg width={width} height={height}>
      <path
        d={pathD}
        fill="none"
        stroke="#4a9eff"
        strokeWidth={2}
      />
      {data.map((d, i) => (
        <circle
          key={i}
          cx={scaleX(d.x)}
          cy={scaleY(d.y)}
          r={3}
          fill="#4a9eff"
        />
      ))}
    </svg>
  )
}

// Sample data generators
function generateSampleDaysVsDepth() {
  return Array.from({ length: 15 }, (_, i) => ({
    x: i + 1,
    y: Math.floor(1000 + i * 800 + Math.random() * 200)
  }))
}

function generateSampleROP() {
  return Array.from({ length: 20 }, (_, i) => ({
    x: i,
    y: Math.floor(80 + Math.random() * 80)
  }))
}

function generateSampleChartData() {
  return Array.from({ length: 10 }, (_, i) => ({
    x: i,
    y: Math.floor(50 + Math.random() * 50)
  }))
}
