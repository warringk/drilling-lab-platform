/**
 * Schema Map API — live database stats
 * GET /api/schema/stats — collection counts, sizes, index info
 * GET /api/schema/silver-stats — TimescaleDB silver layer stats
 */
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

router.get('/stats', async (req, res) => {
  try {
    const db = req.db;
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    // Get all collection names
    const collections = await db.listCollections().toArray();
    const collectionNames = collections
      .map(c => c.name)
      .filter(n => !n.startsWith('system.') && !n.startsWith('_deprecated_') && !n.startsWith('_archive_'));

    // Get stats for each collection in parallel
    const statsPromises = collectionNames.map(async (name) => {
      try {
        const stats = await db.command({ collStats: name });
        const coll = db.collection(name);
        
        // Get index info
        const indexes = await coll.indexes().catch(() => []);
        
        // Get a sample doc for field discovery
        const sampleDoc = await coll.findOne({}, { projection: { _id: 0 } });
        const fields = sampleDoc ? Object.entries(sampleDoc).map(([key, val]) => ({
          name: key,
          type: val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val === 'object' && val instanceof Date ? 'datetime' : typeof val === 'object' ? 'object' : typeof val,
        })) : [];

        return {
          name,
          count: stats.count || 0,
          sizeBytes: stats.size || 0,
          storageSizeBytes: stats.storageSize || 0,
          indexCount: indexes.length,
          indexes: indexes.map(idx => ({
            name: idx.name,
            keys: Object.keys(idx.key),
            unique: idx.unique || false,
          })),
          fields,
          capped: stats.capped || false,
        };
      } catch (err) {
        return {
          name,
          count: 0,
          sizeBytes: 0,
          error: err.message,
        };
      }
    });

    const allStats = await Promise.all(statsPromises);

    // Get database-level stats
    const dbStats = await db.command({ dbStats: 1 });

    res.json({
      database: dbStats.db,
      collections: allStats.sort((a, b) => b.count - a.count),
      totals: {
        collections: allStats.length,
        documents: allStats.reduce((sum, s) => sum + (s.count || 0), 0),
        dataSizeBytes: dbStats.dataSize || 0,
        storageSizeBytes: dbStats.storageSize || 0,
        indexSizeBytes: dbStats.indexSize || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Schema stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// TimescaleDB connection pool
const pgPool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'drilling_lab',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  max: 5
});

// GET /api/schema/silver-stats - Live TimescaleDB silver layer statistics
router.get('/silver-stats', async (req, res) => {
  try {
    // Query for all silver schema tables
    const tablesQuery = `
      SELECT 
        schemaname,
        tablename
      FROM pg_tables
      WHERE schemaname = 'silver'
      ORDER BY tablename
    `;
    
    const tablesResult = await pgPool.query(tablesQuery);
    const tables = tablesResult.rows;
    
    // Get hypertable info
    const hypertablesQuery = `
      SELECT 
        hypertable_schema,
        hypertable_name,
        num_dimensions,
        num_chunks,
        compression_enabled
      FROM timescaledb_information.hypertables
      WHERE hypertable_schema = 'silver'
    `;
    
    const hypertablesResult = await pgPool.query(hypertablesQuery);
    const hypertableMap = {};
    hypertablesResult.rows.forEach(h => {
      hypertableMap[h.hypertable_name] = {
        isHypertable: true,
        numChunks: h.num_chunks,
        compressionEnabled: h.compression_enabled
      };
    });
    
    // Get continuous aggregates info
    const caggsQuery = `
      SELECT 
        view_schema,
        view_name,
        materialized_only,
        compression_enabled
      FROM timescaledb_information.continuous_aggregates
      WHERE view_schema = 'silver'
    `;
    
    const caggsResult = await pgPool.query(caggsQuery);
    const caggMap = {};
    caggsResult.rows.forEach(c => {
      caggMap[c.view_name] = {
        isContinuousAgg: true,
        materializedOnly: c.materialized_only,
        compressionEnabled: c.compression_enabled
      };
    });
    
    // Get compression stats if available
    const compressionQuery = `
      SELECT 
        hypertable_schema,
        hypertable_name,
        ROUND(CAST(total_chunks AS numeric) / NULLIF(number_compressed_chunks, 0), 2) as compression_ratio,
        number_compressed_chunks,
        uncompressed_heap_size,
        compressed_heap_size
      FROM timescaledb_information.compression_settings cs
      JOIN timescaledb_information.hypertables h 
        ON cs.hypertable_schema = h.hypertable_schema 
        AND cs.hypertable_name = h.hypertable_name
      WHERE cs.hypertable_schema = 'silver'
    `.trim();
    
    let compressionMap = {};
    try {
      const compressionResult = await pgPool.query(compressionQuery);
      compressionResult.rows.forEach(c => {
        compressionMap[c.hypertable_name] = {
          compressionRatio: c.compression_ratio,
          compressedChunks: c.number_compressed_chunks,
          uncompressedSize: c.uncompressed_heap_size,
          compressedSize: c.compressed_heap_size
        };
      });
    } catch (err) {
      console.log('Compression stats not available:', err.message);
    }
    
    // Get stats for each table
    const statsPromises = tables.map(async (table) => {
      const tableName = table.tablename;
      const fullName = `silver.${tableName}`;
      
      try {
        // Get approximate row count (fast)
        const countQuery = `
          SELECT reltuples::bigint as approximate_count
          FROM pg_class
          WHERE oid = '${fullName}'::regclass
        `;
        const countResult = await pgPool.query(countQuery);
        const rowCount = countResult.rows[0]?.approximate_count || 0;
        
        // Get table size
        const sizeQuery = `
          SELECT 
            pg_total_relation_size('${fullName}') as total_size,
            pg_relation_size('${fullName}') as table_size,
            pg_indexes_size('${fullName}') as indexes_size
        `;
        const sizeResult = await pgPool.query(sizeQuery);
        const sizes = sizeResult.rows[0];
        
        // Determine table type
        let tableType = 'table';
        if (caggMap[tableName]) {
          tableType = 'continuous_agg';
        } else if (hypertableMap[tableName]) {
          tableType = 'hypertable';
        }
        
        return {
          name: fullName,
          tableName: tableName,
          type: tableType,
          rowCount: parseInt(rowCount) || 0,
          totalSizeBytes: parseInt(sizes.total_size) || 0,
          tableSizeBytes: parseInt(sizes.table_size) || 0,
          indexesSizeBytes: parseInt(sizes.indexes_size) || 0,
          ...hypertableMap[tableName],
          ...caggMap[tableName],
          ...compressionMap[tableName]
        };
      } catch (err) {
        console.error(`Error getting stats for ${fullName}:`, err.message);
        return {
          name: fullName,
          tableName: tableName,
          type: 'table',
          rowCount: 0,
          totalSizeBytes: 0,
          error: err.message
        };
      }
    });
    
    const allStats = await Promise.all(statsPromises);
    
    // Calculate totals
    const totals = {
      tables: allStats.length,
      hypertables: allStats.filter(s => s.isHypertable).length,
      continuousAggs: allStats.filter(s => s.isContinuousAgg).length,
      totalRows: allStats.reduce((sum, s) => sum + (s.rowCount || 0), 0),
      totalSizeBytes: allStats.reduce((sum, s) => sum + (s.totalSizeBytes || 0), 0),
      compressedTables: allStats.filter(s => s.compressionEnabled).length
    };
    
    res.json({
      schema: 'silver',
      tables: allStats.sort((a, b) => b.rowCount - a.rowCount),
      totals,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Silver stats error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
