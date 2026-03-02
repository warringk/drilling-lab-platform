/**
 * Unified Wells API — queries silver.wells (TimescaleDB)
 * Serves both NOV and Pason wells to the EDR Tagger and other consumers.
 *
 * Mount: app.use('/api/wells', require('./routes/wells'));
 */

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

// GET /api/wells/rigs — distinct rigs, sorted numerically
router.get('/rigs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT rig FROM silver.wells
      WHERE rig IS NOT NULL AND rig != ''
      ORDER BY rig
    `);
    const rigs = result.rows.map(r => r.rig);

    // Sort numerically where possible (same logic as novWells.js)
    rigs.sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a).localeCompare(String(b));
    });

    res.json({ rigs });
  } catch (error) {
    console.error('wells/rigs error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/wells?rig=X — wells for a rig
// Returns shape EDR Tagger expects: _id, licence_number, well_name, rig_name, job_status, first_data_date, last_data_date, record_count
router.get('/', async (req, res) => {
  try {
    const { rig } = req.query;
    let result;

    if (rig) {
      result = await pool.query(`
        SELECT license, well_name, rig, status, source,
               first_edr_ts, last_edr_ts, record_count
        FROM silver.wells
        WHERE rig = $1
        ORDER BY spud_date DESC NULLS LAST
      `, [rig]);
    } else {
      result = await pool.query(`
        SELECT license, well_name, rig, status, source,
               first_edr_ts, last_edr_ts, record_count
        FROM silver.wells
        ORDER BY spud_date DESC NULLS LAST
        LIMIT 200
      `);
    }

    // Map to shape EDR Tagger expects
    const wells = result.rows.map(r => ({
      _id: r.license,
      licence_number: r.license,
      well_name: r.well_name,
      rig_name: r.rig,
      job_status: r.status || 'Ended',
      first_data_date: r.first_edr_ts,
      last_data_date: r.last_edr_ts,
      has_edr: true,
      record_count: Number(r.record_count) || 0,
      source: r.source
    }));

    res.json({ wells, count: wells.length });
  } catch (error) {
    console.error('wells list error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/wells/:license — single well with drilling_phases
router.get('/:license', async (req, res) => {
  try {
    const { license } = req.params;
    const result = await pool.query(`
      SELECT license, well_name, uwi, rig, contractor, operator,
             source, source_id, status,
             spud_date, rig_release_date, total_depth_m,
             first_edr_ts, last_edr_ts, record_count,
             drilling_phases
      FROM silver.wells
      WHERE license = $1
    `, [license]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Well not found' });
    }

    const r = result.rows[0];
    const well = {
      _id: r.license,
      licence_number: r.license,
      well_name: r.well_name,
      well_location: r.uwi,
      rig_name: r.rig,
      rig_contractor: r.contractor,
      operator: r.operator,
      source: r.source,
      source_id: r.source_id,
      job_status: r.status || 'Ended',
      spud_date: r.spud_date,
      end_date: r.rig_release_date,
      total_depth_m: r.total_depth_m ? Number(r.total_depth_m) : null,
      first_data_date: r.first_edr_ts,
      last_data_date: r.last_edr_ts,
      record_count: Number(r.record_count) || 0,
      drilling_phases: r.drilling_phases || []
    };

    res.json({ well });
  } catch (error) {
    console.error('wells/:license error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
