import { createContext, useContext, useState, useEffect } from 'react'

const DashboardContext = createContext()

// Widget types we support
export const WIDGET_TYPES = {
  METRIC: 'metric',      // Single number KPI
  CHART: 'chart',        // Line, bar, scatter charts
  TABLE: 'table',        // Data table
  TEXT: 'text',          // Markdown/text widget
  PLOTLY: 'plotly'       // Interactive Plotly charts
}

// Default widget configs by type
export const DEFAULT_WIDGET_CONFIG = {
  metric: { value: 0, unit: '', trend: null, color: '#4a9eff' },
  chart: { chartType: 'line', data: [], xAxis: '', yAxis: '' },
  table: { columns: [], rows: [] },
  text: { content: '' },
  plotly: { data: [], layout: {} }
}

export function DashboardProvider({ children }) {
  const [dashboards, setDashboards] = useState([])
  const [activeDashboard, setActiveDashboard] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load dashboards from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('user_dashboards')
    if (saved) {
      const parsed = JSON.parse(saved)
      setDashboards(parsed)
      if (parsed.length > 0) {
        setActiveDashboard(parsed[0])
      }
    }
    setIsLoaded(true)
  }, [])

  // Save to localStorage whenever dashboards change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('user_dashboards', JSON.stringify(dashboards))
    }
  }, [dashboards, isLoaded])

  // Create a new dashboard
  function createDashboard(name) {
    const newDashboard = {
      id: 'dash_' + Date.now(),
      name: name || 'New Dashboard',
      widgets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    setDashboards(prev => [...prev, newDashboard])
    setActiveDashboard(newDashboard)
    return newDashboard
  }

  // Delete a dashboard
  function deleteDashboard(id) {
    setDashboards(prev => prev.filter(d => d.id !== id))
    if (activeDashboard?.id === id) {
      setActiveDashboard(dashboards.find(d => d.id !== id) || null)
    }
  }

  // Rename a dashboard
  function renameDashboard(id, name) {
    setDashboards(prev => prev.map(d => 
      d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d
    ))
    if (activeDashboard?.id === id) {
      setActiveDashboard(prev => ({ ...prev, name }))
    }
  }

  // Add widget to active dashboard
  function addWidget(widget) {
    if (!activeDashboard) return null
    
    const newWidget = {
      id: 'widget_' + Date.now(),
      ...widget,
      position: widget.position || { x: 0, y: 0, w: 4, h: 3 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    const updatedDashboard = {
      ...activeDashboard,
      widgets: [...activeDashboard.widgets, newWidget],
      updatedAt: new Date().toISOString()
    }
    
    setActiveDashboard(updatedDashboard)
    setDashboards(prev => prev.map(d => 
      d.id === activeDashboard.id ? updatedDashboard : d
    ))
    
    return newWidget
  }

  // Update a widget
  function updateWidget(widgetId, updates) {
    if (!activeDashboard) return
    
    const updatedWidgets = activeDashboard.widgets.map(w =>
      w.id === widgetId ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w
    )
    
    const updatedDashboard = {
      ...activeDashboard,
      widgets: updatedWidgets,
      updatedAt: new Date().toISOString()
    }
    
    setActiveDashboard(updatedDashboard)
    setDashboards(prev => prev.map(d =>
      d.id === activeDashboard.id ? updatedDashboard : d
    ))
  }

  // Delete a widget
  function deleteWidget(widgetId) {
    if (!activeDashboard) return
    
    const updatedDashboard = {
      ...activeDashboard,
      widgets: activeDashboard.widgets.filter(w => w.id !== widgetId),
      updatedAt: new Date().toISOString()
    }
    
    setActiveDashboard(updatedDashboard)
    setDashboards(prev => prev.map(d =>
      d.id === activeDashboard.id ? updatedDashboard : d
    ))
  }

  // Update widget positions (from drag/resize)
  function updateWidgetPositions(layouts) {
    if (!activeDashboard) return
    
    const updatedWidgets = activeDashboard.widgets.map(w => {
      const layout = layouts.find(l => l.i === w.id)
      if (layout) {
        return { ...w, position: { x: layout.x, y: layout.y, w: layout.w, h: layout.h } }
      }
      return w
    })
    
    const updatedDashboard = {
      ...activeDashboard,
      widgets: updatedWidgets,
      updatedAt: new Date().toISOString()
    }
    
    setActiveDashboard(updatedDashboard)
    setDashboards(prev => prev.map(d =>
      d.id === activeDashboard.id ? updatedDashboard : d
    ))
  }

  return (
    <DashboardContext.Provider value={{
      dashboards,
      activeDashboard,
      setActiveDashboard,
      createDashboard,
      deleteDashboard,
      renameDashboard,
      addWidget,
      updateWidget,
      deleteWidget,
      updateWidgetPositions,
      isLoaded
    }}>
      {children}
    </DashboardContext.Provider>
  )
}

export const useDashboard = () => useContext(DashboardContext)
