/**
 * Connection Comparison API
 *
 * Queries MongoDB nov_connections collection for drilling connection
 * performance analysis. Section linkage via section_summaries collection.
 */
const express = require('express');
const router = express.Router();

// --- Section linkage helpers ---

function normalizeSectionName(section) {
  if (!section) return 'Unknown';
  const s = section.toLowerCase();
  if (s.includes('surface') || s === 'section 1') return 'Surface';
  if (s.includes('intermediate') || s === 'section 2') return 'Intermediate';
  if (s.includes('mainhole') || s.includes('production') || s === 'section 3' || s === 'section 4') return 'Mainhole';
  return 'Other';
}

/**
 * Fetch section_summaries for a set of jobIds, build lookup map.
 * Returns Map<jobId, [{startTime, endTime, section}]>
 */
async function buildSectionMap(db, jobIds) {
  if (!jobIds.length) return new Map();

  const docs = await db.collection('section_summaries').find(
    { jobId: { $in: jobIds } },
    { projection: { jobId: 1, section: 1, startTime: 1, endTime: 1 } }
  ).toArray();

  const map = new Map();
  for (const doc of docs) {
    const jid = doc.jobId;
    if (!map.has(jid)) map.set(jid, []);
    map.get(jid).push({
      startTime: new Date(doc.startTime),
      endTime: new Date(doc.endTime),
      section: normalizeSectionName(doc.section),
    });
  }
  return map;
}

/**
 * Tag each connection with its normalized section using timestamp overlap.
 */
function tagSections(connections, sectionMap) {
  for (const conn of connections) {
    conn._section = 'Unknown';
    const sections = sectionMap.get(conn.job_id);
    if (!sections || !conn.slip_to_slip_from) continue;

    const t = new Date(conn.slip_to_slip_from);
    for (const sec of sections) {
      if (t >= sec.startTime && t <= sec.endTime) {
        conn._section = sec.section;
        break;
      }
    }
  }
}

// --- Stats helpers ---

function percentile(sorted, p) {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function computeStats(durations) {
  if (!durations.length) return null;
  const sorted = durations.slice().sort((a, b) => a - b);
  // Remove p99 outliers
  const p99 = percentile(sorted, 0.99);
  const filtered = sorted.filter(d => d <= p99);
  if (filtered.length < 3) return null;

  const sum = filtered.reduce((a, b) => a + b, 0);
  const avg = sum / filtered.length;
  const mid = Math.floor(filtered.length / 2);
  const median = filtered.length % 2 === 0
    ? (filtered[mid - 1] + filtered[mid]) / 2
    : filtered[mid];

  return {
    connections: filtered.length,
    avg_min: +(avg / 60).toFixed(2),
    median_min: +(median / 60).toFixed(2),
    p10_min: +(percentile(filtered, 0.10) / 60).toFixed(2),
    p90_min: +(percentile(filtered, 0.90) / 60).toFixed(2),
  };
}

// --- Base query + section-aware fetch ---

const BASE_FILTER = {
  connection_type: 'Drilling',
  slip_to_slip_duration: { $gt: 0 },
};

const BASE_PROJ = {
  job_id: 1, rig_name: 1, licence_number: 1, well_name: 1,
  slip_to_slip_duration: 1, slip_to_slip_from: 1,
  connection_number: 1,
  weight_to_weight_duration: 1, weight_to_slip_duration: 1, slip_to_weight_duration: 1,
  in_slips_bit_position: 1,
};

/**
 * Fetch connections with optional rig filter, tag with sections,
 * optionally filter by section. Returns tagged array.
 */
async function fetchTaggedConnections(db, { rig, section, since } = {}) {
  const filter = { ...BASE_FILTER };
  if (rig) {
    const rigList = Array.isArray(rig) ? rig : rig.split(',').map(r => r.trim()).filter(Boolean);
    filter.rig_name = rigList.length === 1 ? rigList[0] : { $in: rigList };
  }
  if (since) {
    // slip_to_slip_from is stored as ISO string — compare as string
    filter.slip_to_slip_from = { $gte: since };
  }

  const connections = await db.collection('nov_connections')
    .find(filter, { projection: BASE_PROJ })
    .toArray();

  // Build section map from unique job_ids
  const jobIds = [...new Set(connections.map(c => c.job_id).filter(Boolean))];
  const sectionMap = await buildSectionMap(db, jobIds);
  tagSections(connections, sectionMap);

  // Filter by section if requested
  if (section) {
    return connections.filter(c => c._section === section);
  }
  return connections;
}

// ============================================================
// GET /api/connections/rigs — distinct rig names
// ============================================================
router.get('/rigs', async (req, res) => {
  try {
    const rigs = await req.db.collection('nov_connections').distinct('rig_name', BASE_FILTER);
    const sorted = rigs.filter(Boolean).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '')) || 0;
      const nb = parseInt(b.replace(/\D/g, '')) || 0;
      return na - nb || a.localeCompare(b);
    });
    res.json({ rigs: sorted });
  } catch (err) {
    console.error('connections/rigs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/connections/stats?rig=&section= — per-rig rankings
// ============================================================
router.get('/stats', async (req, res) => {
  try {
    const { rig, section, since } = req.query;
    const connections = await fetchTaggedConnections(req.db, { rig, section, since });

    // Group by rig
    const byRig = {};
    for (const c of connections) {
      const r = c.rig_name || 'Unknown';
      if (!byRig[r]) byRig[r] = { durations: [], wells: new Set() };
      byRig[r].durations.push(c.slip_to_slip_duration);
      if (c.licence_number) byRig[r].wells.add(c.licence_number);
    }

    const stats = [];
    for (const [rigName, data] of Object.entries(byRig)) {
      const s = computeStats(data.durations);
      if (!s) continue;
      stats.push({ rig: rigName, wells: data.wells.size, ...s });
    }

    stats.sort((a, b) => a.avg_min - b.avg_min);
    res.json({ stats, total_connections: connections.length });
  } catch (err) {
    console.error('connections/stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/connections/by-well?rig=&section= — per-well rankings
// ============================================================
router.get('/by-well', async (req, res) => {
  try {
    const { rig, section, since } = req.query;
    const connections = await fetchTaggedConnections(req.db, { rig, section, since });

    // Group by licence
    const byWell = {};
    for (const c of connections) {
      const lic = c.licence_number || 'Unknown';
      if (!byWell[lic]) byWell[lic] = { durations: [], well_name: c.well_name, rig: c.rig_name, first_date: null };
      byWell[lic].durations.push(c.slip_to_slip_duration);
      const ts = c.slip_to_slip_from ? new Date(c.slip_to_slip_from) : null;
      if (ts && (!byWell[lic].first_date || ts < byWell[lic].first_date)) {
        byWell[lic].first_date = ts;
      }
    }

    const stats = [];
    for (const [license, data] of Object.entries(byWell)) {
      const s = computeStats(data.durations);
      if (!s) continue;
      stats.push({ license, well_name: data.well_name, rig: data.rig, first_date: data.first_date, ...s });
    }

    stats.sort((a, b) => (a.first_date || 0) - (b.first_date || 0));
    res.json({ stats, total_wells: stats.length });
  } catch (err) {
    console.error('connections/by-well error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/connections/trend?rig=&section=&granularity=month
// ============================================================
router.get('/trend', async (req, res) => {
  try {
    const { rig, section, granularity, since } = req.query;
    const weekly = granularity === 'week';
    const connections = await fetchTaggedConnections(req.db, { rig, section, since });

    // Group by period (and optionally by rig for "All Rigs" view)
    const byPeriodRig = {};
    const byPeriod = {};

    for (const c of connections) {
      if (!c.slip_to_slip_from) continue;
      const d = new Date(c.slip_to_slip_from);
      let period;
      if (weekly) {
        // ISO week: get Monday of that week
        const day = d.getUTCDay() || 7;
        const monday = new Date(d);
        monday.setUTCDate(d.getUTCDate() - day + 1);
        period = monday.toISOString().slice(0, 10);
      } else {
        period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      }

      // Overall
      if (!byPeriod[period]) byPeriod[period] = [];
      byPeriod[period].push(c.slip_to_slip_duration);

      // Per rig (for multi-line view)
      const rigKey = c.rig_name || 'Unknown';
      const prKey = `${period}|${rigKey}`;
      if (!byPeriodRig[prKey]) byPeriodRig[prKey] = { period, rig: rigKey, durations: [] };
      byPeriodRig[prKey].durations.push(c.slip_to_slip_duration);
    }

    // Overall trend
    const trend = [];
    for (const [period, durations] of Object.entries(byPeriod)) {
      const s = computeStats(durations);
      if (!s) continue;
      trend.push({ period, ...s });
    }
    trend.sort((a, b) => a.period.localeCompare(b.period));

    // Per-rig trend — always built, all rigs present in data
    let rigTrends = {};
    for (const val of Object.values(byPeriodRig)) {
      if (!rigTrends[val.rig]) rigTrends[val.rig] = [];
      const s = computeStats(val.durations);
      if (s) rigTrends[val.rig].push({ period: val.period, ...s });
    }
    for (const r of Object.keys(rigTrends)) {
      rigTrends[r].sort((a, b) => a.period.localeCompare(b.period));
    }

    res.json({ trend, rig_trends: rigTrends });
  } catch (err) {
    console.error('connections/trend error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/connections/well/:license — individual connections
// ============================================================
router.get('/well/:license', async (req, res) => {
  try {
    const { license } = req.params;
    const filter = {
      ...BASE_FILTER,
      licence_number: license,
    };

    const docs = await req.db.collection('nov_connections')
      .find(filter, { projection: BASE_PROJ })
      .sort({ slip_to_slip_from: 1 })
      .toArray();

    // Tag with sections
    const jobIds = [...new Set(docs.map(c => c.job_id).filter(Boolean))];
    const sectionMap = await buildSectionMap(req.db, jobIds);
    tagSections(docs, sectionMap);

    const connections = docs.map(c => ({
      connection_number: c.connection_number,
      slip_to_slip_sec: c.slip_to_slip_duration,
      w2w_sec: c.weight_to_weight_duration,
      w2s_sec: c.weight_to_slip_duration,
      s2w_sec: c.slip_to_weight_duration,
      depth: c.in_slips_bit_position,
      timestamp: c.slip_to_slip_from,
      section: c._section,
    }));

    res.json({ license, connections, count: connections.length });
  } catch (err) {
    console.error('connections/well error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
