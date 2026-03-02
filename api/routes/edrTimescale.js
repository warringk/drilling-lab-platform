const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// PostgreSQL (TimescaleDB) — single source of truth
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'drilling_lab',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  max: 10
});

// Disable vectorized aggregation (TimescaleDB bug with varchar)
pool.on('connect', (client) => {
  client.query('SET timescaledb.enable_vectorized_aggregation = off').catch(() => {});
});

// ── STATIC ROUTES FIRST (before :licence param) ──────────────────

// GET /api/ts/edr/wells/list — all wells in silver layer
router.get('/wells/list', async (req, res) => {
  try {
    const { MongoClient } = require('mongodb');
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const mongoClient = new MongoClient(mongoUri);
    
    try {
      await mongoClient.connect();
      const db = mongoClient.db('drilling_lab');
      
      // Get all licences from TimescaleDB
      const pgResult = await pool.query(`
        SELECT license, status, records_synced, last_synced_ts
        FROM silver.sync_state
        ORDER BY license
      `);
      
      // Get well metadata from MongoDB
      const licenses = pgResult.rows.map(r => r.license);
      const wells = await db.collection('nov_wells').find(
        { licence_number: { $in: licenses } },
        { projection: { licence_number: 1, well_name: 1, rig_name: 1, job_status: 1, _id: 0 } }
      ).toArray();

      // Map metadata to sync state
      const wellMap = new Map(wells.map(w => [w.licence_number, w]));
      const enriched = pgResult.rows.map(row => {
        const meta = wellMap.get(row.license) || {};
        return {
          licence: row.license,
          well_name: meta.well_name,
          rig_name: meta.rig_name,
          job_status: meta.job_status,
          status: row.status,
          records_synced: row.records_synced,
          last_synced_ts: row.last_synced_ts
        };
      });

      res.json({
        source: 'timescaledb+mongo',
        count: enriched.length,
        wells: enriched
      });
    } finally {
      await mongoClient.close();
    }
  } catch (error) {
    console.error('[edrTimescale] Wells list error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── PARAMETERIZED ROUTES ─────────────────────────────────────────

// GET /api/ts/edr/:licence/range — time range for a well
router.get('/:licence/range', async (req, res) => {
  const { licence } = req.params;

  try {
    const result = await pool.query(
      'SELECT MIN(ts) AS min_ts, MAX(ts) AS max_ts, COUNT(*) AS count FROM silver.edr_1s WHERE license = $1',
      [licence]
    );

    if (result.rows.length === 0 || !result.rows[0].min_ts) {
      return res.json({ licence, exists: false });
    }

    const row = result.rows[0];
    res.json({
      licence,
      exists: true,
      minTs: row.min_ts,
      maxTs: row.max_ts,
      count: parseInt(row.count)
    });
  } catch (error) {
    console.error('[edrTimescale] Range error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ts/edr/:licence — EDR data from silver layer
router.get('/:licence', async (req, res) => {
  const { licence } = req.params;
  const { start, end, resolution = '30' } = req.query;
  const resSeconds = parseInt(resolution) || 30;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params required' });
  }

  try {
    const timeBucket = `${resSeconds} seconds`;

    const query = `
      SELECT
        time_bucket('${timeBucket}', ts) AS timestamp,
        AVG(hook_load)           AS hkld,
        AVG(weight_on_bit)       AS wob,
        AVG(standpipe_pressure)  AS spp,
        AVG(rotary_rpm)          AS rpm,
        AVG(rotary_torque)       AS torque,
        AVG(flow_in)             AS flow_in,
        AVG(flow_out)            AS flow_out,
        AVG(bit_depth)           AS bit_depth,
        AVG(hole_depth)          AS hole_depth,
        AVG(rate_of_penetration) AS rop,
        AVG(block_height)        AS block_height,
        MODE() WITHIN GROUP (ORDER BY micro_state) AS rig_state,
        MODE() WITHIN GROUP (ORDER BY op_mode) AS operational_mode
      FROM silver.edr_1s
      WHERE license = $1
        AND ts >= $2
        AND ts <= $3
      GROUP BY time_bucket('${timeBucket}', ts)
      ORDER BY timestamp
      LIMIT 5000
    `;

    const startTime = Date.now();
    const result = await pool.query(query, [licence, start, end]);
    const queryTime = Date.now() - startTime;

    const data = result.rows.map(row => ({
      timestamp: row.timestamp,
      hkld:         row.hkld         != null ? parseFloat(row.hkld)         : null,
      wob:          row.wob          != null ? parseFloat(row.wob)          : null,
      spp:          row.spp          != null ? parseFloat(row.spp)          : null,
      rpm:          row.rpm          != null ? parseFloat(row.rpm)          : null,
      torque:       row.torque       != null ? parseFloat(row.torque)       : null,
      flow_in:      row.flow_in      != null ? parseFloat(row.flow_in)     : null,
      flow_out:     row.flow_out     != null ? parseFloat(row.flow_out)    : null,
      bit_depth:    row.bit_depth    != null ? parseFloat(row.bit_depth)   : null,
      hole_depth:   row.hole_depth   != null ? parseFloat(row.hole_depth)  : null,
      rop:          row.rop          != null ? parseFloat(row.rop)         : null,
      block_height: row.block_height != null ? parseFloat(row.block_height): null,
      rig_state:    row.rig_state || null,
      operational_mode: row.operational_mode || null
    }));

    res.json({
      licence,
      source: 'timescaledb',
      table: 'silver.edr_1s',
      resolution: resSeconds,
      count: data.length,
      queryTimeMs: queryTime,
      data
    });
  } catch (error) {
    console.error('[edrTimescale] Query error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
