/**
 * Section KPIs — operation time breakdowns per drilling section.
 *
 * GET /api/section-kpis/:license
 *   Returns all sections for a well with operation-type hour breakdowns.
 *
 * GET /api/section-kpis/compare?licenses=X,Y,Z&section=Intermediate
 *   Compare the same section across multiple wells.
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const wellsService = require('../wellsService');

/**
 * Build section KPIs for a single well.
 * Clips operations to section time boundaries.
 */
async function buildSectionKpis(license) {
  const well = await wellsService.getByLicense(license);
  if (!well) return null;

  const phases = well.drilling_phases || [];
  if (phases.length === 0) {
    return { license, well_name: well.well_name, rig: well.rig, sections: [] };
  }

  // Fetch all operations for this well
  const opsResult = await pool.query(
    `SELECT operation_id, operation_type, start_ts, end_ts, duration_sec,
            start_depth_m, end_depth_m, min_depth_m, max_depth_m
     FROM silver.operation_events
     WHERE license = $1
     ORDER BY start_ts`,
    [license]
  );
  const ops = opsResult.rows;

  const sections = phases.map(phase => {
    const sectionStart = new Date(phase.start_date).getTime();
    const sectionEnd = new Date(phase.end_date).getTime();
    const totalHours = (sectionEnd - sectionStart) / 3600000;

    // Find overlapping operations and clip durations
    const buckets = {}; // operation_type -> { hours, count }

    for (const op of ops) {
      const opStart = new Date(op.start_ts).getTime();
      const opEnd = new Date(op.end_ts).getTime();

      // Check overlap
      if (opStart >= sectionEnd || opEnd <= sectionStart) continue;

      const clippedMs = Math.min(opEnd, sectionEnd) - Math.max(opStart, sectionStart);
      const clippedHours = clippedMs / 3600000;
      const type = op.operation_type;

      if (!buckets[type]) buckets[type] = { hours: 0, count: 0 };
      buckets[type].hours += clippedHours;
      buckets[type].count += 1;
    }

    // Build sorted operations array
    const operations = Object.entries(buckets)
      .map(([type, { hours, count }]) => ({
        type,
        hours: Math.round(hours * 10) / 10,
        count,
        pct: totalHours > 0 ? Math.round((hours / totalHours) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.hours - a.hours);

    return {
      section: phase.section,
      start_date: phase.start_date,
      end_date: phase.end_date,
      total_hours: Math.round(totalHours * 10) / 10,
      operations
    };
  });

  return { license, well_name: well.well_name, rig: well.rig, sections };
}

// ── GET /:license — single well section KPIs ────────────────────────
router.get('/compare', async (req, res) => {
  // Must be declared before /:license to avoid route shadowing
  try {
    const { licenses, section } = req.query;
    if (!licenses || !section) {
      return res.status(400).json({ error: 'licenses and section query params required' });
    }

    const licenseList = licenses.split(',').map(l => l.trim()).filter(Boolean);
    if (licenseList.length === 0) {
      return res.status(400).json({ error: 'No valid licenses provided' });
    }

    const results = await Promise.all(licenseList.map(l => buildSectionKpis(l)));

    const wells = results
      .filter(r => r !== null)
      .map(r => {
        const match = r.sections.find(s => s.section === section);
        return {
          license: r.license,
          well_name: r.well_name,
          rig: r.rig,
          section: match || null
        };
      })
      .filter(w => w.section !== null);

    res.json({ section, wells });
  } catch (error) {
    console.error('[section-kpis/compare] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /:license/segments?start=&end= — raw operation segments for depth chart strip
router.get('/:license/segments', async (req, res) => {
  try {
    const { license } = req.params;
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required' });
    }
    const result = await pool.query(
      `SELECT operation_id, operation_type,
              GREATEST(start_ts, $2::timestamptz) AS start_ts,
              LEAST(end_ts, $3::timestamptz)      AS end_ts
       FROM silver.operation_events
       WHERE license = $1 AND end_ts > $2 AND start_ts < $3
       ORDER BY start_ts`,
      [license, start, end]
    );
    res.json({ license, segments: result.rows });
  } catch (error) {
    console.error('[section-kpis/segments] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:license', async (req, res) => {
  try {
    const result = await buildSectionKpis(req.params.license);
    if (!result) {
      return res.status(404).json({ error: 'Well not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('[section-kpis] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
