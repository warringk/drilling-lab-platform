import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

const ALL_COLUMNS = [
  { id: 'wellName', label: 'Well', group: 'info', align: 'left', default: true },
  { id: 'rig', label: 'Rig', group: 'info', align: 'left', default: true },
  { id: 'operator', label: 'Operator', group: 'info', align: 'left', default: false },
  { id: 'licence', label: 'Licence', group: 'info', align: 'left', default: false },
  { id: 'field', label: 'Field', group: 'info', align: 'left', default: false },
  { id: 'formation', label: 'Formation', group: 'info', align: 'left', default: false },
  { id: 'sections', label: 'Sections', group: 'info', align: 'left', default: true, noSort: true },
  { id: 'spudDate', label: 'Spud Date', group: 'info', align: 'left', fmt: 'date', default: true },
  { id: 'mudChecks', label: 'Mud Checks', group: 'mud', align: 'right', fmt: 'int', default: true },
  { id: 'avgDensity', label: 'Density (kg/m³)', group: 'mud', align: 'right', fmt: 'int', default: true },
  { id: 'avgViscosity', label: 'Viscosity (s)', group: 'mud', align: 'right', fmt: 'dec1', default: true },
  { id: 'avgPV', label: 'PV (cP)', group: 'mud', align: 'right', fmt: 'dec1', default: true },
  { id: 'avgYP', label: 'YP (Pa)', group: 'mud', align: 'right', fmt: 'dec1', default: false },
  { id: 'avgPH', label: 'pH', group: 'mud', align: 'right', fmt: 'dec1', default: false },
  { id: 'maxDepth', label: 'Max Depth (m)', group: 'depth', align: 'right', fmt: 'int', default: true },
  { id: 'totalCost', label: 'Total Cost ($)', group: 'cost', align: 'right', fmt: 'currency', default: true },
  { id: 'costPerMeter', label: '$/m', group: 'cost', align: 'right', fmt: 'dec2', default: false },
  { id: 'productCost', label: 'Product Cost ($)', group: 'cost', align: 'right', fmt: 'currency', default: false },
  { id: 'totalLoss', label: 'Total Loss (m³)', group: 'losses', align: 'right', fmt: 'dec1', default: false },
];

const KPI_OPTIONS = ALL_COLUMNS.filter(c => c.fmt && !['mudChecks'].includes(c.id));

const COLUMN_GROUPS = [
  { id: 'info', label: 'Well Info' },
  { id: 'mud', label: 'Mud Properties' },
  { id: 'depth', label: 'Depth' },
  { id: 'cost', label: 'Costs' },
  { id: 'losses', label: 'Losses' },
];

const QUARTERS = [
  { id: 1, label: 'Q1', months: [0, 1, 2] },
  { id: 2, label: 'Q2', months: [3, 4, 5] },
  { id: 3, label: 'Q3', months: [6, 7, 8] },
  { id: 4, label: 'Q4', months: [9, 10, 11] },
];

const fmtVal = (value, fmt) => {
  if (value == null) return '-';
  switch (fmt) {
    case 'int': return Math.round(value).toLocaleString();
    case 'dec1': return (Math.round(value * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case 'dec2': return (Math.round(value * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'currency': return '$' + Math.round(value).toLocaleString();
    case 'date': return value ? new Date(value).toLocaleDateString('en-CA') : '-';
    default: return String(value ?? '-');
  }
};

function wellInPeriod(well, year, quarter) {
  if (!year) return true;
  const spud = well.spudDate ? new Date(well.spudDate) : null;
  if (!spud) return well.year === year;
  if (!quarter) return spud.getFullYear() === year;
  const q = QUARTERS.find(q => q.id === quarter);
  return spud.getFullYear() === year && q.months.includes(spud.getMonth());
}

const chipStyle = (active) => ({
  padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: 500,
  cursor: 'pointer', transition: 'all 0.15s',
  border: active ? '1px solid #6366f1' : '1px solid #374151',
  background: active ? '#4f46e5' : 'transparent',
  color: active ? '#fff' : '#9ca3af',
});

const MudAnalysisSimple = () => {
  const navigate = useNavigate();
  const [wellData, setWellData] = useState([]);
  const [rigs, setRigs] = useState([]);
  const [operators, setOperators] = useState([]);
  const [years, setYears] = useState([]);
  const [yearCounts, setYearCounts] = useState({});
  const [sections, setSections] = useState([]);
  const [sectionCounts, setSectionCounts] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedRigs, setSelectedRigs] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState(null);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedKPI, setSelectedKPI] = useState('avgDensity');

  // Column visibility
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = localStorage.getItem('mudAnalysis_cols_v3');
      if (saved) return JSON.parse(saved);
    } catch {}
    return ALL_COLUMNS.filter(c => c.default).map(c => c.id);
  });
  const [showColPicker, setShowColPicker] = useState(false);

  // Sort
  const [sortCol, setSortCol] = useState('totalCost');
  const [sortDir, setSortDir] = useState('desc');

  // Pagination
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => { loadData(); }, []);
  useEffect(() => { localStorage.setItem('mudAnalysis_cols_v3', JSON.stringify(visibleCols)); }, [visibleCols]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [wellsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/mud-analysis/wells`),
        fetch(`${API_BASE}/api/mud-analysis/summary`),
      ]);
      if (!wellsRes.ok || !summaryRes.ok) throw new Error('Failed to fetch data');
      const wellsData = await wellsRes.json();
      const summaryData = await summaryRes.json();
      setWellData(wellsData.wells || []);
      setRigs(wellsData.rigs || []);
      setOperators(wellsData.operators || []);
      setYears(wellsData.years || []);
      setYearCounts(wellsData.yearCounts || {});
      setSections(wellsData.sections || []);
      setSectionCounts(wellsData.sectionCounts || {});
      setSummary(summaryData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filtered + sorted
  const filteredData = useMemo(() => {
    let data = wellData;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(w =>
        w.wellName?.toLowerCase().includes(q) ||
        w.licence?.toLowerCase().includes(q) ||
        w.field?.toLowerCase().includes(q) ||
        w.rig?.toLowerCase().includes(q)
      );
    }
    if (selectedRigs.length > 0) {
      data = data.filter(w => selectedRigs.includes(w.rig || '__none__'));
    }
    if (selectedYear) {
      data = data.filter(w => wellInPeriod(w, selectedYear, selectedQuarter));
    }
    if (selectedOperator) {
      data = data.filter(w => w.operator === selectedOperator);
    }
    if (selectedSection) {
      data = data.filter(w => (w.sections || []).includes(selectedSection));
      // Override cost/loss/depth with section-specific values
      data = data.map(w => {
        const sd = (w.bySection || {})[selectedSection];
        if (!sd) return w;
        return {
          ...w,
          totalCost: sd.cost,
          costPerMeter: sd.costPerM,
          totalLoss: sd.loss,
          maxDepth: sd.depth,
        };
      });
    }
    data = [...data].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol.includes('Date') || sortCol === 'minDate' || sortCol === 'maxDate') {
        va = va ? new Date(va).getTime() : (sortDir === 'asc' ? Infinity : -Infinity);
        vb = vb ? new Date(vb).getTime() : (sortDir === 'asc' ? Infinity : -Infinity);
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      va = va ?? (sortDir === 'asc' ? Infinity : -Infinity);
      vb = vb ?? (sortDir === 'asc' ? Infinity : -Infinity);
      if (typeof va === 'string') return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return data;
  }, [wellData, search, selectedRigs, selectedYear, selectedQuarter, selectedOperator, selectedSection, sortCol, sortDir]);

  useEffect(() => { setPage(0); }, [search, selectedRigs, selectedYear, selectedQuarter, selectedOperator, selectedSection, sortCol, sortDir]);

  const pagedData = filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  // KPI stats
  const currentKPI = ALL_COLUMNS.find(c => c.id === selectedKPI);
  const kpiValues = filteredData.map(w => w[selectedKPI]).filter(v => v != null && isFinite(v));
  const hasKpiData = kpiValues.length > 0;
  const avg = hasKpiData ? kpiValues.reduce((a, b) => a + b, 0) / kpiValues.length : null;
  const min = hasKpiData ? Math.min(...kpiValues) : null;
  const max = hasKpiData ? Math.max(...kpiValues) : null;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const toggleCol = (id) => {
    setVisibleCols(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const activeCols = ALL_COLUMNS.filter(c => visibleCols.includes(c.id));

  const clearAllFilters = () => {
    setSearch('');
    setSelectedRigs([]);
    setSelectedYear(null);
    setSelectedQuarter(null);
    setSelectedOperator(null);
    setSelectedSection(null);
  };

  const hasFilters = search || selectedRigs.length > 0 || selectedYear || selectedOperator || selectedSection;

  if (loading) return <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Loading EnerTrax drilling fluids data...</div>;
  if (error) return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <div style={{ color: '#ef4444', marginBottom: '12px' }}>Error: {error}</div>
      <button onClick={loadData} style={{ padding: '8px 16px', background: '#4f46e5', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>Retry</button>
    </div>
  );

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1500px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid #374151', borderRadius: '6px', cursor: 'pointer', color: '#e5e7eb', fontSize: '16px', padding: '4px 10px' }} title="Back">&larr;</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '2px' }}>Drilling Fluids</h1>
          <p style={{ color: '#9ca3af', fontSize: '13px' }}>
            {summary ? `${summary.totalWells.toLocaleString()} wells | ${summary.totalMudChecks.toLocaleString()} mud checks | $${Math.round(summary.totalCost / 1e6)}M total cost | 2018\u20132026` : ''}
          </p>
        </div>
        {hasFilters && (
          <button onClick={clearAllFilters} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #374151', background: '#1f2937', color: '#f87171', fontSize: '12px', cursor: 'pointer' }}>
            Clear All Filters
          </button>
        )}
      </div>

      {/* Year Navigation */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '4px', fontWeight: 600 }}>Year:</span>
          <button onClick={() => { setSelectedYear(null); setSelectedQuarter(null); }} style={chipStyle(!selectedYear)}>
            All Years
          </button>
          {years.map(y => (
            <button key={y} onClick={() => { setSelectedYear(y); setSelectedQuarter(null); }}
              style={chipStyle(selectedYear === y)}>
              {y} <span style={{ opacity: 0.6, fontSize: '10px' }}>({yearCounts[y] || 0})</span>
            </button>
          ))}
        </div>
        {selectedYear && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: '50px' }}>
            <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '4px' }}>Quarter:</span>
            <button onClick={() => setSelectedQuarter(null)} style={chipStyle(!selectedQuarter)}>Full Year</button>
            {QUARTERS.map(q => (
              <button key={q.id} onClick={() => setSelectedQuarter(q.id)} style={chipStyle(selectedQuarter === q.id)}>{q.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Rig + Section + Operator + Search */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        {/* Rig chips — show top rigs only to avoid overcrowding */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '2px', fontWeight: 600 }}>Rig:</span>
          {rigs.map(r => {
            const active = selectedRigs.includes(r);
            const count = wellData.filter(w => w.rig === r).length;
            if (count < 10 && !active) return null;
            return (
              <button key={r}
                onClick={() => setSelectedRigs(prev => active ? prev.filter(x => x !== r) : [...prev, r])}
                style={chipStyle(active)}>
                {r} <span style={{ opacity: 0.6, fontSize: '10px' }}>({count})</span>
              </button>
            );
          })}
          {selectedRigs.length > 0 && (
            <button onClick={() => setSelectedRigs([])}
              style={{ padding: '3px 8px', borderRadius: '12px', border: 'none', background: '#374151', color: '#9ca3af', fontSize: '11px', cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>

        {/* Section chips — show main sections only */}
        {sections.length > 0 && (() => {
          const mainSections = ['Surface', 'Top Hole', 'Intermediate', 'Main Hole', 'Completions'];
          const shown = sections.filter(s => mainSections.includes(s));
          return (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', borderLeft: '1px solid #374151', paddingLeft: '10px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '2px', fontWeight: 600 }}>Section:</span>
              {shown.map(s => (
                <button key={s} onClick={() => setSelectedSection(prev => prev === s ? null : s)}
                  style={chipStyle(selectedSection === s)}>
                  {s} <span style={{ opacity: 0.6, fontSize: '10px' }}>({sectionCounts[s] || 0})</span>
                </button>
              ))}
            </div>
          );
        })()}

        <div style={{ flex: 1 }} />

        {/* Operator */}
        {operators.length > 1 && (
          <select value={selectedOperator || ''} onChange={e => setSelectedOperator(e.target.value || null)}
            style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #374151', background: '#111827', color: '#e5e7eb', fontSize: '12px' }}>
            <option value="">All Operators</option>
            {operators.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        )}

        {/* Search */}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search well, licence, field, rig..."
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #374151', background: '#111827', color: '#e5e7eb', fontSize: '13px', width: '240px' }} />

        {/* Columns */}
        <button onClick={() => setShowColPicker(!showColPicker)}
          style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
            border: '1px solid #374151', background: showColPicker ? '#4f46e5' : '#1f2937', color: showColPicker ? '#fff' : '#d1d5db' }}>
          Columns
        </button>
      </div>

      {/* Column Picker */}
      {showColPicker && (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {COLUMN_GROUPS.map(group => {
              const cols = ALL_COLUMNS.filter(c => c.group === group.id);
              return (
                <div key={group.id}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.label}</div>
                  {cols.map(col => (
                    <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#d1d5db', marginBottom: '4px' }}>
                      <input type="checkbox" checked={visibleCols.includes(col.id)} onChange={() => toggleCol(col.id)} style={{ accentColor: '#6366f1' }} />
                      {col.label}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Selector + Stats */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          {KPI_OPTIONS.map(kpi => (
            <button key={kpi.id}
              onClick={() => {
                setSelectedKPI(kpi.id);
                setSortCol(kpi.id);
                setSortDir('desc');
                setVisibleCols(prev => prev.includes(kpi.id) ? prev : [...prev, kpi.id]);
              }}
              style={{
                padding: '4px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                border: selectedKPI === kpi.id ? '2px solid #6366f1' : '1px solid #374151',
                background: selectedKPI === kpi.id ? '#4f46e5' : '#1f2937',
                color: selectedKPI === kpi.id ? '#fff' : '#d1d5db',
              }}
            >{kpi.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {currentKPI && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ background: '#1f2937', padding: '6px 14px', borderRadius: '8px', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{filteredData.length.toLocaleString()}</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>Wells</div>
            </div>
            <div style={{ background: '#1f2937', padding: '6px 14px', borderRadius: '8px', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{hasKpiData ? fmtVal(avg, currentKPI.fmt) : '-'}</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>Avg {hasKpiData ? `(${kpiValues.length})` : ''}</div>
            </div>
            <div style={{ background: '#1f2937', padding: '6px 14px', borderRadius: '8px', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: hasKpiData ? '#10b981' : '#4b5563' }}>{hasKpiData ? fmtVal(min, currentKPI.fmt) : '-'}</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>Min</div>
            </div>
            <div style={{ background: '#1f2937', padding: '6px 14px', borderRadius: '8px', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: hasKpiData ? '#ef4444' : '#4b5563' }}>{hasKpiData ? fmtVal(max, currentKPI.fmt) : '-'}</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>Max</div>
            </div>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div style={{ background: '#1f2937', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #374151' }}>
                {activeCols.map(col => (
                  <th key={col.id} onClick={col.noSort ? undefined : () => handleSort(col.id)}
                    style={{
                      textAlign: col.align || 'right', padding: '10px 12px', cursor: col.noSort ? 'default' : 'pointer',
                      userSelect: 'none', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 600,
                      background: sortCol === col.id ? '#374151' : 'transparent',
                      color: sortCol === col.id ? '#e5e7eb' : '#9ca3af',
                    }}>
                    {col.label}{sortCol === col.id ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedData.length === 0 ? (
                <tr>
                  <td colSpan={activeCols.length} style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                    No wells match the current filters.{' '}
                    <button onClick={clearAllFilters} style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear filters</button>
                  </td>
                </tr>
              ) : pagedData.map(well => (
                <tr key={well.id} style={{ borderBottom: '1px solid #1a2332' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#273344'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {activeCols.map(col => {
                    if (col.id === 'wellName') return (
                      <td key={col.id} style={{ padding: '8px 12px', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                        {well.wellName}
                      </td>
                    );
                    if (col.id === 'rig') return (
                      <td key={col.id} style={{ padding: '8px 12px', fontSize: '13px' }}>
                        {well.rig ? <span style={{ color: '#60a5fa', fontWeight: 600 }}>{well.rig}</span> : <span style={{ color: '#4b5563' }}>-</span>}
                      </td>
                    );
                    if (col.id === 'sections') {
                      const secs = well.sections || [];
                      const colors = { 'Surface': '#34d399', 'Top Hole': '#86efac', 'Intermediate': '#fbbf24', 'Main Hole': '#f87171', 'Pilot': '#a78bfa', 'Completions': '#67e8f9' };
                      return (
                        <td key={col.id} style={{ padding: '8px 12px', fontSize: '12px' }}>
                          {secs.length > 0 ? secs.map(s => (
                            <span key={s} style={{ display: 'inline-block', marginRight: '3px', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: `${colors[s] || '#6b7280'}22`, color: colors[s] || '#6b7280' }}>
                              {s === 'Intermediate' ? 'Int' : s === 'Main Hole' ? 'Main' : s}
                            </span>
                          )) : <span style={{ color: '#4b5563' }}>-</span>}
                        </td>
                      );
                    }
                    if (['operator', 'licence', 'field', 'formation'].includes(col.id)) return (
                      <td key={col.id} style={{ padding: '8px 12px', fontSize: '13px', color: '#9ca3af', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {well[col.id] || '-'}
                      </td>
                    );
                    const val = well[col.id];
                    return (
                      <td key={col.id} style={{
                        padding: '8px 12px', textAlign: 'right', fontSize: '13px',
                        fontWeight: sortCol === col.id ? 600 : 400,
                        color: val == null ? '#4b5563' : undefined,
                      }}>
                        {fmtVal(val, col.fmt)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#9ca3af' }}>
          <span>{filteredData.length.toLocaleString()} wells{hasFilters ? ' (filtered)' : ''}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #374151', background: page === 0 ? '#111827' : '#1f2937', color: page === 0 ? '#4b5563' : '#d1d5db', cursor: page === 0 ? 'default' : 'pointer', fontSize: '12px' }}>Prev</button>
              <span>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #374151', background: page >= totalPages - 1 ? '#111827' : '#1f2937', color: page >= totalPages - 1 ? '#4b5563' : '#d1d5db', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: '12px' }}>Next</button>
            </div>
          )}
        </div>
      </div>

      {/* Data source note */}
      <div style={{ marginTop: '12px', padding: '10px 14px', background: '#111827', borderRadius: '6px', fontSize: '11px', color: '#6b7280', lineHeight: '1.5' }}>
        <strong>Source:</strong> EnerTrax drilling fluids database. {summary ? `${summary.totalWells.toLocaleString()} wells, ${summary.totalMudChecks.toLocaleString()} mud checks, $${Math.round(summary.totalCost / 1e6)}M total mud cost.` : ''}
        {' '}Operators: Veren Inc. + Whitecap Resources. Properties: density, funnel viscosity, PV, YP, pH + chemistry. Sections with depth, cost, and loss tracking.
      </div>
    </div>
  );
};

export default MudAnalysisSimple;
