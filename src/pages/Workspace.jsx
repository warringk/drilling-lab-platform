import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import GridLayout from 'react-grid-layout'
import { useUser } from '../contexts/UserContext'
import ChatWidget from '../components/chat/ChatWidget'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

// Widget components
const WellsWidget = () => (
  <div className="widget" style={{ height: '100%' }}>
    <div className="widget-header">Wells Overview</div>
    <div className="widget-content">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 600 }}>30</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Wells</div>
        </div>
        <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 600 }}>12</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Active Today</div>
        </div>
      </div>
    </div>
  </div>
)

const TasksWidget = () => (
  <div className="widget" style={{ height: '100%' }}>
    <div className="widget-header">Tasks</div>
    <div className="widget-content" style={{ fontSize: '13px' }}>
      <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>○ Backfill EDR data for Rig 142</div>
      <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>● Configure Redis queue</div>
      <div style={{ padding: '8px 0' }}>○ Build monitoring scripts</div>
    </div>
  </div>
)

const DataFreshnessWidget = () => (
  <div className="widget" style={{ height: '100%' }}>
    <div className="widget-header">Data Freshness</div>
    <div className="widget-content" style={{ textAlign: 'center', paddingTop: '20px' }}>
      <div style={{ fontSize: '48px', fontWeight: 300 }}>2.1h</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>since last update</div>
      <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--success)' }}>● System healthy</div>
    </div>
  </div>
)

const PipelineWidget = () => (
  <div className="widget" style={{ height: '100%' }}>
    <div className="widget-header">Pipeline Status</div>
    <div className="widget-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>NOV Sync</span>
        <span style={{ color: 'var(--success)' }}>● Running</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Pason Sync</span>
        <span style={{ color: 'var(--success)' }}>● Running</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-secondary)' }}>EDR Processing</span>
        <span style={{ color: 'var(--warning)' }}>● Queue: 1.2k</span>
      </div>
    </div>
  </div>
)

const NotesWidget = () => (
  <div className="widget" style={{ height: '100%' }}>
    <div className="widget-header">Quick Notes</div>
    <div className="widget-content">
      <textarea
        placeholder="Start typing..."
        style={{
          width: '100%',
          height: 'calc(100% - 20px)',
          resize: 'none',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: '13px'
        }}
      />
    </div>
  </div>
)

const FilesWidget = () => (
  <div className="widget" style={{ height: '100%' }}>
    <div className="widget-header">Recent Files</div>
    <div className="widget-content" style={{ fontSize: '13px' }}>
      <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>📄 Q1_Business_Plan.pdf</div>
      <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>📊 Well_Analysis_Jan.xlsx</div>
      <div style={{ padding: '8px 0' }}>📝 Architecture_Notes.md</div>
    </div>
  </div>
)

const WIDGET_COMPONENTS = {
  wells: WellsWidget,
  tasks: TasksWidget,
  freshness: DataFreshnessWidget,
  pipeline: PipelineWidget,
  notes: NotesWidget,
  files: FilesWidget,
  chat: ChatWidget
}

const AVAILABLE_WIDGETS = [
  { id: 'wells', name: 'Wells Overview', icon: '🛢️' },
  { id: 'tasks', name: 'Tasks', icon: '📋' },
  { id: 'freshness', name: 'Data Freshness', icon: '⏱️' },
  { id: 'pipeline', name: 'Pipeline Status', icon: '🔧' },
  { id: 'notes', name: 'Quick Notes', icon: '📝' },
  { id: 'files', name: 'Recent Files', icon: '📁' },
  { id: 'chat', name: 'AI Chat', icon: '💬' }
]

export default function Workspace() {
  const { category } = useParams()
  const { user } = useUser()
  const cat = user.categories.find(c => c.id === category) || { name: 'Workspace', icon: '📦' }
  
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)
  const [layout, setLayout] = useState([
    { i: 'wells', x: 0, y: 0, w: 3, h: 2 },
    { i: 'tasks', x: 3, y: 0, w: 3, h: 2 },
    { i: 'freshness', x: 6, y: 0, w: 2, h: 2 },
    { i: 'chat', x: 8, y: 0, w: 4, h: 4 },
    { i: 'pipeline', x: 0, y: 2, w: 4, h: 2 }
  ])
  const [widgets, setWidgets] = useState(['wells', 'tasks', 'freshness', 'chat', 'pipeline'])

  const addWidget = (widgetId) => {
    if (widgets.includes(widgetId)) return
    setWidgets([...widgets, widgetId])
    setLayout([...layout, { i: widgetId, x: 0, y: Infinity, w: 3, h: 2 }])
    setShowWidgetPicker(false)
  }

  const removeWidget = (widgetId) => {
    setWidgets(widgets.filter(w => w !== widgetId))
    setLayout(layout.filter(l => l.i !== widgetId))
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>← Back</Link>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 500 }}>{cat.icon} {cat.name}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setShowWidgetPicker(!showWidgetPicker)}
            className="btn"
          >
            + Add Widget
          </button>
        </div>
      </header>

      {/* Widget picker dropdown */}
      {showWidgetPicker && (
        <div style={{
          position: 'absolute',
          top: '60px',
          right: '24px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '8px',
          zIndex: 100,
          minWidth: '200px'
        }}>
          {AVAILABLE_WIDGETS.filter(w => !widgets.includes(w.id)).map(w => (
            <button
              key={w.id}
              onClick={() => addWidget(w.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '13px'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span>{w.icon}</span>
              <span>{w.name}</span>
            </button>
          ))}
          {AVAILABLE_WIDGETS.filter(w => !widgets.includes(w.id)).length === 0 && (
            <div style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
              All widgets added
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, padding: '16px' }}>
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={80}
          width={window.innerWidth - 32}
          onLayoutChange={setLayout}
          draggableHandle=".widget-header"
          isResizable={true}
        >
          {widgets.map(widgetId => {
            const Widget = WIDGET_COMPONENTS[widgetId]
            return (
              <div key={widgetId} style={{ overflow: 'hidden' }}>
                <Widget />
              </div>
            )
          })}
        </GridLayout>
      </div>
    </div>
  )
}
