/**
 * Shared well metadata service.
 *
 * Single source of truth for well lookups — queries silver.wells.
 * All routes that need well_name, rig, drilling_phases, etc. should
 * use these functions instead of writing their own queries.
 *
 * Usage:
 *   const wells = require('../wellsService');
 *   const rigs = await wells.getRigs();
 *   const well = await wells.getByLicense('0515925');
 */
const pool = require('./db');

/**
 * Get distinct rig names, sorted numerically.
 * @returns {string[]}
 */
async function getRigs() {
  const result = await pool.query(`
    SELECT DISTINCT rig FROM silver.wells
    WHERE rig IS NOT NULL AND rig != ''
    ORDER BY rig
  `);
  const rigs = result.rows.map(r => r.rig);
  rigs.sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b));
  });
  return rigs;
}

/**
 * List wells, optionally filtered by rig.
 * Returns the shape EDR Tagger and other consumers expect.
 * @param {Object} [filters]
 * @param {string} [filters.rig] - Filter by rig name
 * @param {number} [filters.limit=200] - Max rows when no rig filter
 * @returns {Object[]}
 */
async function getWells(filters = {}) {
  const { rig, limit = 200 } = filters;
  let result;

  if (rig) {
    result = await pool.query(`
      SELECT license, well_name, rig, status, source,
             first_edr_ts, last_edr_ts, record_count, drilling_phases
      FROM silver.wells
      WHERE rig = $1
      ORDER BY spud_date DESC NULLS LAST
    `, [rig]);
  } else {
    result = await pool.query(`
      SELECT license, well_name, rig, status, source,
             first_edr_ts, last_edr_ts, record_count, drilling_phases
      FROM silver.wells
      ORDER BY spud_date DESC NULLS LAST
      LIMIT $1
    `, [limit]);
  }

  return result.rows.map(r => ({
    license: r.license,
    well_name: r.well_name,
    rig: r.rig,
    status: r.status || 'Ended',
    source: r.source,
    first_edr_ts: r.first_edr_ts,
    last_edr_ts: r.last_edr_ts,
    record_count: Number(r.record_count) || 0,
    drilling_phases: r.drilling_phases || []
  }));
}

/**
 * Get a single well by license, including drilling_phases.
 * @param {string} license
 * @returns {Object|null}
 */
async function getByLicense(license) {
  const result = await pool.query(`
    SELECT license, well_name, uwi, rig, contractor, operator,
           source, source_id, status,
           spud_date, rig_release_date, total_depth_m,
           first_edr_ts, last_edr_ts, record_count,
           drilling_phases
    FROM silver.wells
    WHERE license = $1
  `, [license]);

  if (result.rows.length === 0) return null;

  const r = result.rows[0];
  return {
    license: r.license,
    well_name: r.well_name,
    uwi: r.uwi,
    rig: r.rig,
    contractor: r.contractor,
    operator: r.operator,
    source: r.source,
    source_id: r.source_id,
    status: r.status || 'Ended',
    spud_date: r.spud_date,
    rig_release_date: r.rig_release_date,
    total_depth_m: r.total_depth_m ? Number(r.total_depth_m) : null,
    first_edr_ts: r.first_edr_ts,
    last_edr_ts: r.last_edr_ts,
    record_count: Number(r.record_count) || 0,
    drilling_phases: r.drilling_phases || []
  };
}

/**
 * Batch lookup wells by license list. Returns a Map<license, well>.
 * Useful for enriching chart traces, segment queries, etc.
 * @param {string[]} licenses
 * @returns {Map<string, Object>}
 */
async function getByLicenses(licenses) {
  if (!licenses.length) return new Map();

  const placeholders = licenses.map((_, i) => `$${i + 1}`).join(',');
  const result = await pool.query(`
    SELECT license, well_name, rig, status, drilling_phases
    FROM silver.wells
    WHERE license IN (${placeholders})
  `, licenses);

  const map = new Map();
  for (const r of result.rows) {
    map.set(r.license, {
      license: r.license,
      well_name: r.well_name,
      rig: r.rig,
      status: r.status,
      drilling_phases: r.drilling_phases || []
    });
  }
  return map;
}

module.exports = { getRigs, getWells, getByLicense, getByLicenses };
