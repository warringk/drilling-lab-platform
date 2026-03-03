const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /api/rig-state/wells
 * List wells that have micro_state data.
 * Uses silver.wells for metadata + a fast DISTINCT scan for enriched licenses.
 */
router.get('/wells', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.license,
             w.well_name,
             w.rig,
             w.status,
             w.record_count,
             w.first_edr_ts as min_ts,
             w.last_edr_ts as max_ts
      FROM silver.wells w
      WHERE w.license IN (
        SELECT DISTINCT license FROM silver.edr_1s
        WHERE micro_state IS NOT NULL
      )
      ORDER BY w.record_count DESC NULLS LAST
    `);

    const enriched = result.rows.map(row => ({
      licence: row.license,
      wellName: row.well_name || row.license,
      rig: row.rig || null,
      status: row.status || null,
      totalRows: parseInt(row.record_count) || 0,
      minTs: row.min_ts,
      maxTs: row.max_ts,
    }));

    res.json({ wells: enriched });
  } catch (error) {
    console.error('[rigState] Wells error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/rig-state/segments/:licence
 * Returns micro_state segments (consecutive same-state rows collapsed).
 * Includes operational_days for x-axis alignment.
 * Query params: layer=micro_state|op_mode, start, end, max_segments=20000
 */
router.get('/segments/:licence', async (req, res) => {
  try {
    const licence = decodeURIComponent(req.params.licence);
    const layer = req.query.layer || 'micro_state';
    const start = req.query.start || null;
    const end = req.query.end || null;
    const maxSegments = parseInt(req.query.max_segments) || 20000;

    const validLayers = ['micro_state', 'op_mode'];
    if (!validLayers.includes(layer)) {
      return res.status(400).json({ error: `Invalid layer. Use: ${validLayers.join(', ')}` });
    }

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

    const startTime = Date.now();
    const query = `
      WITH state_changes AS (
        SELECT ts, operational_days, ${layer} as state,
               LAG(${layer}) OVER (ORDER BY ts) as prev_state
        FROM silver.edr_1s
        WHERE license = $1 AND ${layer} IS NOT NULL${timeFilter}
      ),
      segments AS (
        SELECT ts, operational_days, state,
               SUM(CASE WHEN state != prev_state OR prev_state IS NULL THEN 1 ELSE 0 END)
                 OVER (ORDER BY ts) as segment_id
        FROM state_changes
      )
      SELECT state,
             MIN(ts) as start_ts,
             MAX(ts) as end_ts,
             MIN(operational_days) as start_op_days,
             MAX(operational_days) as end_op_days,
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
      startOpDays: row.start_op_days != null ? parseFloat(row.start_op_days) : null,
      endOpDays: row.end_op_days != null ? parseFloat(row.end_op_days) : null,
      rowCount: parseInt(row.row_count),
      durationSeconds: parseFloat(row.duration_seconds) || 0,
    }));

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
 * Returns downsampled channel traces for overlay on timeline.
 * Always includes operational_days for x-axis.
 * Query params: start, end, channels (comma-sep), resolution (seconds, default 30)
 */
router.get('/traces/:licence', async (req, res) => {
  try {
    const licence = decodeURIComponent(req.params.licence);
    const start = req.query.start;
    const end = req.query.end;
    const resolution = parseInt(req.query.resolution) || 30;
    const channels = (req.query.channels || 'bit_depth,hole_depth,hook_load,weight_on_bit,rotary_rpm,rotary_torque,standpipe_pressure,flow_in,flow_out,rate_of_penetration,block_height').split(',');

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required' });
    }

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
             AVG(operational_days) as op_days,
             ${avgCols}
      FROM silver.edr_1s
      WHERE license = $1 AND ts >= $2 AND ts <= $3
      GROUP BY time_bucket('${timeBucket}', ts)
      ORDER BY ts
      LIMIT 10000
    `;

    const result = await pool.query(query, [licence, start, end]);

    const data = result.rows.map(row => {
      const point = {
        ts: row.ts,
        op_days: row.op_days != null ? parseFloat(row.op_days) : null
      };
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
