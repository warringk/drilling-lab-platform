import { useState, useRef, useEffect } from 'react'
import GridLayout from 'react-grid-layout'
import { useDashboard, WIDGET_TYPES } from '../../contexts/DashboardContext'
import WidgetRenderer from '../../components/widgets/WidgetRenderer'
import WidgetBuilder from '../../components/widgets/WidgetBuilder'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

export default function DashboardView() {
  const { 
    activeDashboard, 
    updateWidgetPositions,
    deleteWidget 
  } = useDashboard()
  
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingWidget, setEditingWidget] = useState(null)
  const [containerWidth, setContainerWidth] = useState(1200)
  const containerRef = useRef()

  // Track container width for responsive grid
  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver(entries => {
        setContainerWidth(entries[0].contentRect.width)
      })
      observer.observe(containerRef.current)
      return () => observer.disconnect()
    }
  }, [])

  if (!activeDashboard) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%',
        color: 'var(--text-muted)',
        padding: '40px'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
        <h2 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>No Dashboard Selected</h2>
        <p>Create a new dashboard or select one from the sidebar</p>
      </div>
    )
  }

  const layout = activeDashboard.widgets.map(w => ({
    i: w.id,
    x: w.position?.x || 0,
    y: w.position?.y || 0,
    w: w.position?.w || 4,
    h: w.position?.h || 3,
    minW: 2,
    minH: 2
  }))

  function handleLayoutChange(newLayout) {
    updateWidgetPositions(newLayout)
  }

  function handleEditWidget(widget) {
    setEditingWidget(widget)
    setShowBuilder(true)
  }

  function handleDeleteWidget(widgetId) {
    if (confirm('Delete this widget?')) {
      deleteWidget(widgetId)
    }
  }

  function handleBuilderClose() {
    setShowBuilder(false)
    setEditingWidget(null)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Dashboard Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 500 }}>{activeDashboard.name}</h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {activeDashboard.widgets.length} widget{activeDashboard.widgets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          style={{
            padding: '10px 20px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>+</span> Add Widget
        </button>
      </div>

      {/* Dashboard Grid */}
      <div 
        ref={containerRef}
        style={{ 
          flex: 1, 
          overflow: 'auto', 
          padding: '16px',
          background: 'var(--bg-primary)'
        }}
      >
        {activeDashboard.widgets.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '300px',
            border: '2px dashed var(--border)',
            borderRadius: '12px',
            color: 'var(--text-muted)'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📈</div>
            <p style={{ marginBottom: '16px' }}>This dashboard is empty</p>
            <button
              onClick={() => setShowBuilder(true)}
              style={{
                padding: '10px 20px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              Add your first widget
            </button>
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            cols={12}
            rowHeight={80}
            width={containerWidth - 32}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".widget-drag-handle"
            isResizable={true}
            compactType="vertical"
            preventCollision={false}
          >
            {activeDashboard.widgets.map(widget => (
              <div key={widget.id} style={{ overflow: 'hidden' }}>
                <WidgetRenderer
                  widget={widget}
                  onEdit={() => handleEditWidget(widget)}
                  onDelete={() => handleDeleteWidget(widget.id)}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Widget Builder Modal */}
      {showBuilder && (
        <WidgetBuilder
          editingWidget={editingWidget}
          onClose={handleBuilderClose}
        />
      )}
    </div>
  )
}
