/**
 * RigStateTimeline.jsx
 * 
 * Timeline visualization for rig operational states
 * Shows color-coded state changes over time with durations
 */

import React, { useState, useEffect } from 'react';

export const RigStateTimeline = ({
  well,
  startTime,
  endTime,
  height = 120,
  showLegend = true
}) => {
  const [data, setData] = useState([]);
  const [colorMap, setColorMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Load color mappings (from Channel Agent specs)
  useEffect(() => {
    const colors = {
      'rotary_drilling': { label: 'Rotary Drilling', color: '#84cc16', category: 'productive' },
      'slide_drilling': { label: 'Slide Drilling', color: '#22c55e', category: 'productive' },
      'trip_in': { label: 'Trip In', color: '#3b82f6', category: 'non_productive' },
      'trip_out': { label: 'Trip Out', color: '#60a5fa', category: 'non_productive' },
      'reaming_down': { label: 'Reaming Down', color: '#f59e0b', category: 'non_productive' },
      'reaming_up': { label: 'Reaming Up', color: '#fbbf24', category: 'non_productive' },
      'off_bottom': { label: 'Off Bottom', color: '#64748b', category: 'idle' },
      'circulating': { label: 'Circulating', color: '#8b5cf6', category: 'non_productive' },
      'connection': { label: 'Connection', color: '#fb923c', category: 'non_productive' },
      'data_gap': { label: 'Data Gap', color: '#ef4444', category: 'error' }
    };
    setColorMap(colors);
  }, []);

  // Load rig state data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      try {
        // Build query
        const params = new URLSearchParams({
          licence: well,
          ...(startTime && { start: startTime }),
          ...(endTime && { end: endTime })
        });

        const response = await fetch(`http://localhost:8600/api/rig-state?${params}`);
        const result = await response.json();
        
        // API already returns segments with durations
        setData(result.segments || []);
      } catch (error) {
        console.error('Failed to fetch rig state data:', error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    if (well) {
      fetchData();
    }
  }, [well, startTime, endTime]);

  // Format duration for display
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (loading) {
    return <div className="animate-pulse bg-slate-800 rounded" style={{ height }} />;
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center bg-slate-800 rounded" style={{ height }}>
        <p className="text-slate-400">No rig state data available</p>
      </div>
    );
  }

  const totalDuration = data.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

  return (
    <div className="rig-state-timeline">
      {/* Timeline bars */}
      <div 
        className="relative bg-slate-900 rounded-lg overflow-hidden"
        style={{ height }}
      >
        {data.map((segment, idx) => {
          const stateInfo = colorMap[segment.state];
          if (!stateInfo) return null;

          // Calculate width percentage based on duration
          const widthPct = ((segment.duration_seconds || 0) / totalDuration) * 100;
          
          // Calculate left position
          const leftPct = data.slice(0, idx).reduce((sum, s) => {
            return sum + ((s.duration_seconds || 0) / totalDuration) * 100;
          }, 0);

          return (
            <div
              key={idx}
              className="absolute top-0 h-full transition-opacity hover:opacity-80 cursor-pointer"
              style={{
                backgroundColor: stateInfo.color,
                left: `${leftPct}%`,
                width: `${widthPct}%`
              }}
              title={`${stateInfo.label}: ${formatDuration(segment.duration_seconds || 0)}`}
            >
              {/* Show label if segment is wide enough */}
              {widthPct > 5 && (
                <div className="flex items-center justify-center h-full text-xs font-medium text-white drop-shadow">
                  {stateInfo.label}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap gap-4 mt-4">
          {Object.entries(colorMap).map(([state, info]) => (
            <div key={state} className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded"
                style={{ backgroundColor: info.color }}
              />
              <span className="text-sm text-slate-300">{info.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
