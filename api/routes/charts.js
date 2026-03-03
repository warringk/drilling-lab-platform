const express = require('express');
const router = express.Router();
const pool = require('../db');
const wellsService = require('../wellsService');

// GET /api/charts/days-depth/:license
router.get('/days-depth/:license', async (req, res) => {
  try {
    const { license } = req.params;

    const result = await pool.query(`
      SELECT
        op_days,
        hole_depth
      FROM silver.edr_10s
      WHERE license = $1
        AND hole_depth IS NOT NULL
        AND op_days IS NOT NULL
      ORDER BY op_days
    `, [license]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No data found for this well' });
    }

    // Format for Plotly
    const trace = {
      x: result.rows.map(r => r.op_days),
      y: result.rows.map(r => r.hole_depth),
      type: 'scatter',
      mode: 'lines',
      name: 'Hole Depth',
      line: { color: '#667eea', width: 2 }
    };

    const layout = {
      xaxis: { title: 'Operational Days' },
      yaxis: {
        title: 'Depth (m)',
        autorange: 'reversed'  // Deeper is down
      }
    };

    res.json({
      data: [trace],
      layout
    });

  } catch (error) {
    console.error('Error fetching days-depth data:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/charts/wells - List available wells
router.get('/wells', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT license, well_name, record_count
      FROM silver.wells
      ORDER BY license
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching wells:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/charts/days-depth-compare?licenses=X,Y,Z&section=Intermediate
// Returns downsampled days-vs-depth traces for multiple wells, optionally filtered by drilling section
router.get('/days-depth-compare', async (req, res) => {
  try {
    const { licenses, section } = req.query;
    if (!licenses) {
      return res.status(400).json({ error: 'licenses parameter required (comma-separated)' });
    }

    const licenseList = licenses.split(',').map(l => l.trim()).filter(Boolean);
    if (licenseList.length === 0) {
      return res.status(400).json({ error: 'No valid licenses provided' });
    }

    // Batch-fetch well metadata
    const wellMap = await wellsService.getByLicenses(licenseList);

    const traces = [];

    for (const license of licenseList) {
      const wellMeta = wellMap.get(license);
      const wellName = wellMeta?.well_name || license;
      const phases = wellMeta?.drilling_phases || [];

      let dateFilter = '';
      const params = [license];

      if (section) {
        // Support comma-separated sections (e.g. "Intermediate,Mainhole")
        const sectionList = section.split(',').map(s => s.trim().toLowerCase());
        const matchingPhases = phases.filter(p =>
          p.section && sectionList.includes(p.section.toLowerCase()) && p.start_date && p.end_date
        );
        if (matchingPhases.length === 0) continue; // skip — no matching sections

        if (matchingPhases.length === 1) {
          dateFilter = ` AND ts BETWEEN $2 AND $3`;
          params.push(matchingPhases[0].start_date, matchingPhases[0].end_date);
        } else {
          // Multiple sections: use OR clauses for each date range
          const clauses = matchingPhases.map((p, i) => {
            const idx = params.length + 1;
            params.push(p.start_date, p.end_date);
            return `(ts BETWEEN $${idx} AND $${idx + 1})`;
          });
          dateFilter = ` AND (${clauses.join(' OR ')})`;
        }
      }

      const query = `
        SELECT
          ROUND(operational_days::numeric, 2) AS op_day,
          MAX(hole_depth) AS depth
        FROM silver.edr_1s
        WHERE license = $1
          AND operational_days IS NOT NULL
          AND hole_depth IS NOT NULL
          ${dateFilter}
        GROUP BY ROUND(operational_days::numeric, 2)
        ORDER BY op_day
      `;

      const result = await pool.query(query, params);

      if (result.rows.length === 0) continue;

      let rows = result.rows.map(r => ({
        day: parseFloat(r.op_day),
        depth: parseFloat(r.depth)
      }));

      // Filter stale-depth readings at section boundaries.
      // When a sensor carries over a stale depth from a previous section (e.g. 3000m)
      // but the real section starts at ~600m, leading rows are far above the floor.
      if (section && rows.length > 20) {
        const sampleSize = Math.min(Math.ceil(rows.length * 0.2), 200);
        const sampleDepths = rows.slice(0, sampleSize).map(r => r.depth);
        const floorDepth = Math.min(...sampleDepths);
        let skipUntil = 0;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].depth <= floorDepth + 200) {
            skipUntil = i;
            break;
          }
        }
        if (skipUntil > 0) {
          rows = rows.slice(skipUntil);
        }
      }

      // Find where drilling actually starts — first point where depth begins advancing.
      // Skip the flat/stale sensor values at the beginning of a section.
      let drillStart = 0;
      const startDepth = rows[0].depth;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].depth > startDepth + 5) {  // 5m threshold to filter noise
          drillStart = i > 0 ? i - 1 : 0;  // include the last flat point as day-0
          break;
        }
      }

      const trimmed = rows.slice(drillStart);
      if (trimmed.length === 0) continue;

      // Normalize: day starts at 0, depth starts at 0 (relative to section start depth)
      const dayOffset = trimmed[0].day;
      const depthOffset = trimmed[0].depth;
      const x = trimmed.map(r => r.day - dayOffset);
      const y = trimmed.map(r => r.depth - depthOffset);

      traces.push({ license, well_name: wellName, x, y });
    }

    res.json({ traces });
  } catch (error) {
    console.error('Error in days-depth-compare:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
