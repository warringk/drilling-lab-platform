const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'drilling_lab',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  max: 5
});

pool.on('connect', (client) => {
  client.query('SET timescaledb.enable_vectorized_aggregation = off').catch(() => {});
});

/**
 * GET /api/rig-state/wells
 * List wells that have micro_state data
 */
router.get('/wells', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT license,
             COUNT(*) as total_rows,
             COUNT(micro_state) as enriched_rows,
             COUNT(DISTINCT micro_state) as distinct_states,
             MIN(ts) as min_ts,
             MAX(ts) as max_ts
      FROM silver.edr_1s
      WHERE micro_state IS NOT NULL
      GROUP BY license
      ORDER BY total_rows DESC
    `);

    // Enrich with MongoDB well metadata
    const db = req.db;
    const licences = result.rows.map(r => r.license);
    // Try both Canadian and American spelling
    const wells = await db.collection('nov_wells').find(
      { $or: [{ licence_number: { $in: licences } }, { license_number: { $in: licences } }] },
      { projection: { licence_number: 1, license_number: 1, well_name: 1, rig_name: 1, job_status: 1, _id: 0 } }
    ).toArray();
    const wellMap = new Map(wells.map(w => [w.licence_number || w.license_number, w]));

    const enriched = result.rows.map(row => {
      const meta = wellMap.get(row.license) || {};
      return {
        licence: row.license,
        wellName: meta.well_name || row.license,
        rig: meta.rig_name || null,
        status: meta.job_status || null,
        totalRows: parseInt(row.total_rows),
        enrichedRows: parseInt(row.enriched_rows),
        distinctStates: parseInt(row.distinct_states),
        minTs: row.min_ts,
        maxTs: row.max_ts,
      };
    });

    res.json({ wells: enriched });
  } catch (error) {
    console.error('[rigState] Wells error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/rig-state/segments/:licence
 * Returns micro_state segments (consecutive same-state rows collapsed)
 * Query params: layer=micro_state|op_mode, start, end, max_segments=5000
 */
router.get('/segments/:licence', async (req, res) => {
  try {
    const licence = decodeURIComponent(req.params.licence);
    const layer = req.query.layer || 'micro_state';
    const start = req.query.start || null;
    const end = req.query.end || null;
    const maxSegments = parseInt(req.query.max_segments) || 20000;

    // Validate layer
    const validLayers = ['micro_state', 'op_mode'];
    if (!validLayers.includes(layer)) {
      return res.status(400).json({ error: `Invalid layer. Use: ${validLayers.join(', ')}` });
    }

    // Build time filter
    let timeFilter = '';
    const params = [licence];
    if (start) {
      params.push(start);
      timeFilter += ` AND ts >= $${params.length}`;
    }
    if (end) {
      params.push(end);
      timeFilter += ` AND ts <= $${params.length}`;
    }

    // Use window function to detect state changes and aggregate into segments
    const startTime = Date.now();
    const query = `
      WITH state_changes AS (
        SELECT ts, ${layer} as state,
               LAG(${layer}) OVER (ORDER BY ts) as prev_state
        FROM silver.edr_1s
        WHERE license = $1 AND ${layer} IS NOT NULL${timeFilter}
      ),
      segments AS (
        SELECT ts, state,
               SUM(CASE WHEN state != prev_state OR prev_state IS NULL THEN 1 ELSE 0 END)
                 OVER (ORDER BY ts) as segment_id
        FROM state_changes
      )
      SELECT state,
             MIN(ts) as start_ts,
             MAX(ts) as end_ts,
             COUNT(*) as row_count,
             EXTRACT(EPOCH FROM MAX(ts) - MIN(ts)) as duration_seconds
      FROM segments
      GROUP BY segment_id, state
      ORDER BY MIN(ts)
      LIMIT ${maxSegments}
    `;

    const result = await pool.query(query, params);
    const queryTime = Date.now() - startTime;

    const segments = result.rows.map(row => ({
      state: row.state,
      startTs: row.start_ts,
      endTs: row.end_ts,
      rowCount: parseInt(row.row_count),
      durationSeconds: parseFloat(row.duration_seconds) || 0,
    }));

    // Compute summary stats
    const stateSummary = {};
    segments.forEach(s => {
      if (!stateSummary[s.state]) stateSummary[s.state] = { count: 0, totalSeconds: 0 };
      stateSummary[s.state].count++;
      stateSummary[s.state].totalSeconds += s.durationSeconds;
    });

    res.json({
      licence,
      layer,
      segmentCount: segments.length,
      queryTimeMs: queryTime,
      totalSeconds: segments.reduce((sum, s) => sum + s.durationSeconds, 0),
      stateSummary,
      segments,
    });
  } catch (error) {
    console.error('[rigState] Segments error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/rig-state/traces/:licence
 * Returns downsampled channel traces for overlay on timeline
 * Query params: start, end, channels (comma-sep), resolution (seconds, default 30)
 */
router.get('/traces/:licence', async (req, res) => {
  try {
    const licence = decodeURIComponent(req.params.licence);
    const start = req.query.start;
    const end = req.query.end;
    const resolution = parseInt(req.query.resolution) || 30;
    const channels = (req.query.channels || 'bit_depth,hook_load,rotary_rpm,standpipe_pressure').split(',');

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required' });
    }

    // Build SELECT for requested channels
    const validChannels = [
      'bit_depth', 'hole_depth', 'hook_load', 'weight_on_bit',
      'standpipe_pressure', 'rotary_rpm', 'rotary_torque',
      'flow_in', 'flow_out', 'rate_of_penetration', 'block_height'
    ];
    const selectedChannels = channels.filter(c => validChannels.includes(c));
    if (selectedChannels.length === 0) {
      return res.status(400).json({ error: 'No valid channels specified' });
    }

    const avgCols = selectedChannels.map(c => `AVG(${c}) as ${c}`).join(', ');
    const timeBucket = `${resolution} seconds`;

    const query = `
      SELECT time_bucket('${timeBucket}', ts) as ts,
             ${avgCols}
      FROM silver.edr_1s
      WHERE license = $1 AND ts >= $2 AND ts <= $3
      GROUP BY time_bucket('${timeBucket}', ts)
      ORDER BY ts
      LIMIT 10000
    `;

    const result = await pool.query(query, [licence, start, end]);

    const data = result.rows.map(row => {
      const point = { ts: row.ts };
      selectedChannels.forEach(c => {
        point[c] = row[c] != null ? parseFloat(row[c]) : null;
      });
      return point;
    });

    res.json({ licence, resolution, channels: selectedChannels, count: data.length, data });
  } catch (error) {
    console.error('[rigState] Traces error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
