import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

export default function PlotlyChartWidget({ config }) {
  const plotRef = useRef(null)

  useEffect(() => {
    if (!plotRef.current || !config.data) return

    const data = config.data
    const layout = {
      ...config.layout,
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'rgba(0,0,0,0.2)',
      font: { color: '#e0e0e0' },
      margin: { l: 60, r: 20, t: 40, b: 60 },
      xaxis: {
        gridcolor: 'rgba(255,255,255,0.1)',
        ...config.layout?.xaxis
      },
      yaxis: {
        gridcolor: 'rgba(255,255,255,0.1)',
        ...config.layout?.yaxis
      }
    }

    Plotly.newPlot(plotRef.current, data, layout, {
      responsive: true,
      displayModeBar: false
    })

    return () => {
      if (plotRef.current) {
        Plotly.purge(plotRef.current)
      }
    }
  }, [config])

  return (
    <div 
      ref={plotRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        minHeight: '200px'
      }} 
    />
  )
}
