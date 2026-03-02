import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend 
} from 'recharts';

// Simple fetch helper
const fetchAPI = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
};

// Chart channel definitions
const CHART_CHANNELS = [
  { key: 'bit_depth', label: 'Bit Depth', color: '#06b6d4', unit: 'm', axis: 'left' },
  { key: 'hkld', label: 'Hookload', color: '#4a9eff', unit: 'kdaN', axis: 'left' },
  { key: 'wob', label: 'WOB', color: '#f59e0b', unit: 'kdaN', axis: 'left' },
  { key: 'rpm', label: 'RPM', color: '#10b981', unit: 'rpm', axis: 'right' },
  { key: 'torque', label: 'Torque', color: '#a855f7', unit: 'kNm', axis: 'right' },
  { key: 'spp', label: 'SPP', color: '#f43f5e', unit: 'kPa', axis: 'right' },
  { key: 'flow_in', label: 'Flow In', color: '#8b5cf6', unit: 'm³/min', axis: 'right' },
  { key: 'rop', label: 'ROP', color: '#84cc16', unit: 'm/hr', axis: 'right' }
];

export default function LiveStream() {
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [activeWells, setActiveWells] = useState([]);
  const [allWells, setAllWells] = useState([]);
  const [liveOnly, setLiveOnly] = useState(true);
  const [selectedWell, setSelectedWell] = useState(null);
  const [liveData, setLiveData] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [stats, setStats] = useState({ count: 0, rate: 0, lastUpdate: null });
  const [selectedChannels, setSelectedChannels] = useState(['bit_depth', 'hkld', 'rpm', 'spp', 'flow_in']);
  const eventSourceRef = useRef(null);

  // Fetch active wells on mount and when filter changes
  useEffect(() => {
    fetchActiveWells();
  }, [liveOnly]);

  const fetchActiveWells = async () => {
    try {
      const response = await fetchAPI('/api/ts/edr/wells/list');
      const wells = response.wells || [];
      setAllWells(wells);
      
      // Filter for live wells if enabled
      const filtered = liveOnly 
        ? wells.filter(w => w.job_status === 'Active')
        : wells;
      
      setActiveWells(filtered);
      
      // Reset selection if current well not in filtered list
      if (selectedWell && !filtered.find(w => w.licence === selectedWell)) {
        setSelectedWell(filtered.length > 0 ? filtered[0].licence : null);
      } else if (!selectedWell && filtered.length > 0) {
        setSelectedWell(filtered[0].licence);
      }
    } catch (error) {
      console.error('Failed to fetch wells:', error);
    }
  };

  const startStreaming = () => {
    if (!selectedWell) return;
    
    setIsStreaming(true);
    setLiveData([]);
    
    const interval = setInterval(async () => {
      try {
        const end = new Date().toISOString();
        const start = new Date(Date.now() - 5000).toISOString();
        
        const response = await fetchAPI(
          `/api/ts/edr/${selectedWell}?start=${start}&end=${end}&resolution=1`
        );
        
        if (response.data && response.data.length > 0) {
          setLiveData(prev => {
            const newData = [...prev, ...response.data].slice(-100);
            return newData;
          });
          
          setStats({
            count: response.data.length,
            rate: response.data.length / 5,
            lastUpdate: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Streaming error:', error);
      }
    }, 1000);
    
    eventSourceRef.current = interval;
  };

  const stopStreaming = () => {
    setIsStreaming(false);
    if (eventSourceRef.current) {
      clearInterval(eventSourceRef.current);
      eventSourceRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        clearInterval(eventSourceRef.current);
      }
    };
  }, []);

  const latestRecord = liveData[liveData.length - 1] || {};

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)',
      position: 'relative'
    }}>
      {/* Slide-out Nav */}
      {navOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 999
          }}
          onClick={() => setNavOpen(false)}
        />
      )}
      <div style={{
        position: 'fixed',
        top: 0,
        left: navOpen ? 0 : '-280px',
        width: '280px',
        height: '100%',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        transition: 'left 0.3s',
        zIndex: 1000,
        overflowY: 'auto'
      }}>
        <div style={{ padding: '20px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 600 }}>Navigation</h3>
          <NavLink icon="🏠" label="Home" onClick={() => navigate('/')} />
          <NavLink icon="🗄️" label="Locker" onClick={() => navigate('/locker')} />
          <NavLink icon="📊" label="Pipeline" onClick={() => navigate('/pipeline')} />
          <NavLink icon="🏷️" label="EDR Tagger" onClick={() => navigate('/edr-tagger')} />
          <NavLink icon="📡" label="Live Stream" onClick={() => {}} active />
          <NavLink icon="🎯" label="Projects" onClick={() => navigate('/projects')} />
        </div>
      </div>

      {/* Header */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <button
          onClick={() => setNavOpen(!navOpen)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          ☰
        </button>
        <h1 style={{ fontSize: '18px', fontWeight: 600, flex: 1 }}>Live EDR Streaming</h1>
        {isStreaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--success)' }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              background: 'var(--success)', 
              borderRadius: '50%',
              animation: 'pulse 2s infinite'
            }} />
            LIVE
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Controls */}
        <div className="widget" style={{ marginBottom: '20px' }}>
          <div className="widget-content" style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '200px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={liveOnly}
                  onChange={(e) => setLiveOnly(e.target.checked)}
                  disabled={isStreaming}
                  style={{ cursor: isStreaming ? 'not-allowed' : 'pointer' }}
                />
                Live Wells Only
              </label>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', marginLeft: '24px' }}>
                {activeWells.length} well{activeWells.length !== 1 ? 's' : ''} available
              </div>
            </div>
            
            <div style={{ flex: 1, minWidth: '300px' }}>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>
                Select Well
              </label>
              <select
                value={selectedWell || ''}
                onChange={(e) => setSelectedWell(e.target.value)}
                disabled={isStreaming}
                style={{
                  width: '100%',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '10px 12px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  cursor: isStreaming ? 'not-allowed' : 'pointer'
                }}
              >
                <option value="">Choose a well...</option>
                {activeWells.map(well => (
                  <option key={well.licence} value={well.licence}>
                    {well.rig_name && `Rig ${well.rig_name} - `}{well.well_name || well.licence}
                  </option>
                ))}
              </select>
            </div>

            {!isStreaming ? (
              <button
                onClick={startStreaming}
                disabled={!selectedWell}
                className="btn"
                style={{
                  background: 'var(--success)',
                  color: '#000',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '4px',
                  cursor: selectedWell ? 'pointer' : 'not-allowed',
                  opacity: selectedWell ? 1 : 0.5,
                  fontWeight: 600,
                  fontSize: '13px'
                }}
              >
                ▶ Start Stream
              </button>
            ) : (
              <button
                onClick={stopStreaming}
                className="btn"
                style={{
                  background: 'var(--error)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px'
                }}
              >
                ⏸ Stop
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {isStreaming && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <StatCard label="Data Rate" value={`${stats.rate.toFixed(1)} Hz`} />
            <StatCard label="Records" value={liveData.length} />
            <StatCard label="Last Update" value={stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleTimeString() : '-'} />
          </div>
        )}

        {/* Live Values */}
        {isStreaming && liveData.length > 0 && (
          <div className="widget" style={{ marginBottom: '20px' }}>
            <div className="widget-header">Current Values</div>
            <div className="widget-content">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                <ValueCard label="Bit Depth" value={latestRecord.bit_depth} unit="m" decimals={2} />
                <ValueCard label="Hole Depth" value={latestRecord.hole_depth} unit="m" decimals={2} />
                <ValueCard label="Hookload" value={latestRecord.hkld} unit="kdaN" decimals={1} />
                <ValueCard label="WOB" value={latestRecord.wob} unit="kdaN" decimals={1} />
                <ValueCard label="RPM" value={latestRecord.rpm} unit="rpm" decimals={0} />
                <ValueCard label="Torque" value={latestRecord.torque} unit="kNm" decimals={1} />
                <ValueCard label="SPP" value={latestRecord.spp} unit="kPa" decimals={0} />
                <ValueCard label="Flow In" value={latestRecord.flow_in} unit="m³/min" decimals={2} />
              </div>
            </div>
          </div>
        )}

        {/* Live Charts */}
        {isStreaming && liveData.length > 0 && (
          <div className="widget" style={{ marginBottom: '20px' }}>
            <div className="widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Live Traces</span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {CHART_CHANNELS.map(ch => (
                  <button
                    key={ch.key}
                    onClick={() => {
                      setSelectedChannels(prev =>
                        prev.includes(ch.key)
                          ? prev.filter(k => k !== ch.key)
                          : [...prev, ch.key]
                      );
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: selectedChannels.includes(ch.key) 
                        ? `2px solid ${ch.color}` 
                        : '2px solid var(--border)',
                      background: selectedChannels.includes(ch.key) 
                        ? `${ch.color}22` 
                        : 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: selectedChannels.includes(ch.key) ? 600 : 400,
                      transition: 'all 0.2s'
                    }}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="widget-content" style={{ height: '400px', padding: '20px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={liveData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis 
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                    stroke="var(--text-secondary)"
                    style={{ fontSize: '11px' }}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="var(--text-secondary)"
                    style={{ fontSize: '11px' }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="var(--text-secondary)"
                    style={{ fontSize: '11px' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                    labelFormatter={(ts) => new Date(ts).toLocaleString()}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '12px' }}
                    iconType="line"
                  />
                  {CHART_CHANNELS
                    .filter(ch => selectedChannels.includes(ch.key))
                    .map(ch => (
                      <Line
                        key={ch.key}
                        yAxisId={ch.axis}
                        type="monotone"
                        dataKey={ch.key}
                        stroke={ch.color}
                        strokeWidth={2}
                        dot={false}
                        name={`${ch.label} (${ch.unit})`}
                        isAnimationActive={false}
                      />
                    ))
                  }
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent Data */}
        {isStreaming && liveData.length > 0 && (
          <div className="widget">
            <div className="widget-header">Recent Data (Last 20 records)</div>
            <div className="widget-content" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Time</th>
                    <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Bit (m)</th>
                    <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Hole (m)</th>
                    <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Hook</th>
                    <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>WOB</th>
                    <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>RPM</th>
                    <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Flow</th>
                  </tr>
                </thead>
                <tbody>
                  {liveData.slice(-20).reverse().map((record, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>{new Date(record.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{record.bit_depth?.toFixed(2) || '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{record.hole_depth?.toFixed(2) || '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{record.hkld?.toFixed(1) || '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{record.wob?.toFixed(1) || '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{record.rpm?.toFixed(0) || '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{record.flow_in?.toFixed(2) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isStreaming && (
          <div className="widget" style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📡</div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Ready to Stream</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              {activeWells.length === 0 ? 'No active wells available' : 'Select a well and click Start Stream'}
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function NavLink({ icon, label, onClick, active }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '4px',
        background: active ? 'var(--bg-elevated)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: '14px',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-elevated)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="widget">
      <div className="widget-content" style={{ padding: '16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: '20px', fontWeight: 600 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function ValueCard({ label, value, unit, decimals = 2 }) {
  const displayValue = value != null 
    ? typeof value === 'number' 
      ? value.toFixed(decimals) 
      : value 
    : '-';

  return (
    <div style={{ 
      background: 'var(--bg-elevated)', 
      padding: '12px', 
      borderRadius: '6px',
      border: '1px solid var(--border)'
    }}>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>
        {displayValue}
        {unit && <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '4px' }}>{unit}</span>}
      </div>
    </div>
  );
}
