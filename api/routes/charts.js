const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'drilling_lab',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres'
});

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

module.exports = router;
