/**
 * Shared PostgreSQL (TimescaleDB) connection pool.
 *
 * All API routes that query the silver layer should import this
 * instead of creating their own Pool instance.
 *
 * Usage:
 *   const pool = require('../db');
 *   const result = await pool.query('SELECT ...', [params]);
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'drilling_lab',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  max: 10
});

// TimescaleDB workaround: disable vectorized aggregation (bug with varchar columns)
pool.on('connect', (client) => {
  client.query('SET timescaledb.enable_vectorized_aggregation = off').catch(() => {});
});

module.exports = pool;
