import { useState } from 'react'
import PlotlyChartWidget from './PlotlyChartWidget'

export default function WidgetRenderer({ widget, onEdit, onDelete }) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div style={{
      height: '100%',
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Widget Header - Drag Handle */}
      <div 
        className="widget-drag-handle"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'grab',
          background: 'var(--bg-secondary)'
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{widget.title}</span>
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
            style={{
              width: '24px',
              height: '24px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
              color: 'var(--text-muted)'
            }}
          >
            ⋮
          </button>
          
          {showMenu && (
            <div 
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '4px',
                minWidth: '120px',
                zIndex: 100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => { onEdit(); setShowMenu(false) }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '13px',
                  color: 'var(--text-primary)'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => { onDelete(); setShowMenu(false) }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '13px',
                  color: '#ef4444'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                🗑️ Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Widget Content */}
      <div style={{ 
        flex: 1, 
        padding: '16px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        <WidgetContent widget={widget} />
      </div>
    </div>
  )
}

function WidgetContent({ widget }) {
  if (widget.type === 'metric') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
          fontSize: '36px', 
          fontWeight: 600, 
          color: widget.config.color || 'var(--text-primary)',
          lineHeight: 1
        }}>
          {typeof widget.config.value === 'number' 
            ? widget.config.value.toLocaleString() 
            : widget.config.value}
        </div>
        {widget.config.unit && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {widget.config.unit}
          </div>
        )}
        {widget.config.trend && (
          <div style={{ 
            fontSize: '12px', 
            color: widget.config.trend.toString().startsWith('+') ? '#4ade80' : '#ef4444',
            marginTop: '8px'
          }}>
            {widget.config.trend}
          </div>
        )}
      </div>
    )
  }

  if (widget.type === 'chart') {
    return <ChartWidget config={widget.config} />
  }

  if (widget.type === 'table') {
    return <TableWidget config={widget.config} />
  }

  if (widget.type === 'plotly') {
    return <PlotlyChartWidget config={widget.config} />
  }

  return <div style={{ color: 'var(--text-muted)' }}>Unknown widget type</div>
}

function ChartWidget({ config }) {
  const data = config.data || []
  if (data.length === 0) {
    return <span style={{ color: 'var(--text-muted)' }}>No data</span>
  }

  const width = 280
  const height = 150
  const padding = 20
  
  const maxY = Math.max(...data.map(d => d.y))
  const minY = Math.min(...data.map(d => d.y))
  const maxX = Math.max(...data.map(d => d.x))
  const minX = Math.min(...data.map(d => d.x))
  
  const scaleX = (x) => padding + ((x - minX) / (maxX - minX || 1)) * (width - 2 * padding)
  const scaleY = (y) => height - padding - ((y - minY) / (maxY - minY || 1)) * (height - 2 * padding)

  if (config.chartType === 'scatter') {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {data.map((d, i) => (
          <circle key={i} cx={scaleX(d.x)} cy={scaleY(d.y)} r={4} fill="#4a9eff" />
        ))}
      </svg>
    )
  }

  if (config.chartType === 'bar') {
    const barWidth = (width - 2 * padding) / data.length * 0.8
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {data.map((d, i) => {
          const barHeight = ((d.y - minY) / (maxY - minY || 1)) * (height - 2 * padding)
          const x = padding + (i / data.length) * (width - 2 * padding) + barWidth * 0.1
          return (
            <rect
              key={i}
              x={x}
              y={height - padding - barHeight}
              width={barWidth}
              height={barHeight}
              fill="#4a9eff"
              rx={2}
            />
          )
        })}
      </svg>
    )
  }

  // Line chart (default)
  const pathD = data.map((d, i) => 
    `${i === 0 ? 'M' : 'L'} ${scaleX(d.x)} ${scaleY(d.y)}`
  ).join(' ')

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <path d={pathD} fill="none" stroke="#4a9eff" strokeWidth={2} />
      {data.map((d, i) => (
        <circle key={i} cx={scaleX(d.x)} cy={scaleY(d.y)} r={3} fill="#4a9eff" />
      ))}
    </svg>
  )
}

function TableWidget({ config }) {
  return (
    <div style={{ width: '100%', overflow: 'auto', fontSize: '11px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {config.columns?.map((col, i) => (
              <th key={i} style={{ 
                padding: '6px 8px', 
                textAlign: 'left', 
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontWeight: 500
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.rows?.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{ 
                  padding: '6px 8px', 
                  borderBottom: '1px solid var(--border)' 
                }}>
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
