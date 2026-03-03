/**
 * Unified Wells API — queries silver.wells (TimescaleDB)
 * Serves both NOV and Pason wells to the EDR Tagger and other consumers.
 *
 * Mount: app.use('/api/wells', require('./routes/wells'));
 */

const express = require('express');
const router = express.Router();
const wellsService = require('../wellsService');

// GET /api/wells/rigs — distinct rigs, sorted numerically
router.get('/rigs', async (req, res) => {
  try {
    const rigs = await wellsService.getRigs();
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
    const wells = await wellsService.getWells(rig ? { rig } : {});

    // Map to shape EDR Tagger expects
    const mapped = wells.map(r => ({
      _id: r.license,
      licence_number: r.license,
      well_name: r.well_name,
      rig_name: r.rig,
      job_status: r.status,
      first_data_date: r.first_edr_ts,
      last_data_date: r.last_edr_ts,
      has_edr: true,
      record_count: r.record_count,
      source: r.source
    }));

    res.json({ wells: mapped, count: mapped.length });
  } catch (error) {
    console.error('wells list error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/wells/:license — single well with drilling_phases
router.get('/:license', async (req, res) => {
  try {
    const { license } = req.params;
    const r = await wellsService.getByLicense(license);

    if (!r) {
      return res.status(404).json({ error: 'Well not found' });
    }

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
      job_status: r.status,
      spud_date: r.spud_date,
      end_date: r.rig_release_date,
      total_depth_m: r.total_depth_m,
      first_data_date: r.first_edr_ts,
      last_data_date: r.last_edr_ts,
      record_count: r.record_count,
      drilling_phases: r.drilling_phases
    };

    res.json({ well });
  } catch (error) {
    console.error('wells/:license error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
