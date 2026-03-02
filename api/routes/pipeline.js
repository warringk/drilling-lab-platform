const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// GET /api/pipeline/stats
// FAST VERSION: Only quick queries, no heavy aggregations on 196M docs
router.get('/stats', async (req, res) => {
  try {
    const db = req.db;
    
    // Fast: estimated counts only
    const totalRecords = await db.collection('nov_edr_raw_1s').estimatedDocumentCount();
    const wells = await db.collection('nov_wells').find({}).toArray();
    
    // Queue status (fast - small collection)
    const queueStats = await db.collection('nov_wells').aggregate([
      { $group: { _id: '$ingestion_status', count: { $sum: 1 } } }
    ]).toArray();
    const queue = { complete: 0, in_progress: 0, queued: 0, pending: 0 };
    queueStats.forEach(s => {
      if (s._id === 'complete') queue.complete = s.count;
      else if (s._id === 'in_progress') queue.in_progress = s.count;
      else if (s._id === 'queued') queue.queued = s.count;
      else queue.pending += s.count;
    });

    // Rig summary from wells metadata (fast)
    const rigMap = {};
    wells.forEach(w => {
      const rig = w.rig_name || 'Unknown';
      if (!rigMap[rig]) rigMap[rig] = { rig, wells: 0, wellsWithData: 0, records: 0, hours: 0 };
      rigMap[rig].wells++;
      const rc = w.record_count_1sec || 0;
      rigMap[rig].records += rc;
      rigMap[rig].hours += (w.hours_of_1sec_data || 0);
      if (w.has_1sec_data || w.ingestion_status === 'complete') rigMap[rig].wellsWithData++;
    });
    const byRig = Object.values(rigMap).sort((a, b) => b.records - a.records || b.wells - a.wells);

    // Check ingestion status
    let ingestionRunning = false;
    try {
      const { stdout } = await execAsync('systemctl list-units --type=service --state=running | grep ingestion@ || true');
      ingestionRunning = stdout.trim().length > 0;
    } catch (e) {}

    const activeWells = wells.filter(w => w.job_status === 'Active').length;
    const totalHours = wells.reduce((sum, w) => sum + (w.hours_of_1sec_data || 0), 0);

    // Per-well data for wells that have ingestion data
    const wellData = wells
      .filter(w => w.has_1sec_data || w.ingestion_status === 'in_progress' || w.ingestion_status === 'complete')
      .map(w => ({
        licence: w.licence_number,
        name: w.well_name || w.job_name || 'Unknown',
        rig: w.rig_name || '?',
        status: w.ingestion_status || 'unknown',
        records: w.record_count_1sec || 0,
        hours: Math.round((w.hours_of_1sec_data || 0) * 10) / 10,
        progress: w.ingestion_progress || 0,
        startedAt: w.ingestion_started_at || null,
        completedAt: w.ingestion_completed_at || null,
        error: w.ingestion_error || null,
      }))
      .sort((a, b) => {
        // In-progress first, then by records descending
        if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
        if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
        return b.records - a.records;
      });

    res.json({
      totalRecords,
      validRecords: totalRecords,
      totalWells: wells.length,
      activeWells,
      wellsWithData: queue.complete + queue.in_progress,
      wellsFullyIngested: queue.complete,
      totalHours: Math.round(totalHours),
      byRig,
      wellData,
      queue,
      ingestionRunning,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Pipeline stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/pipeline/start - Start ingestion (via systemd)
router.post('/start', async (req, res) => {
  try {
    const { rigs = '142 148 570 26' } = req.body;
    const rigsParam = rigs.replace(/[, ]+/g, '_'); // Convert to underscore-separated
    
    await execAsync(`sudo systemctl start ingestion@${rigsParam}`);
    
    res.json({ 
      success: true, 
      message: `Started ingestion for rigs: ${rigs}`,
      service: `ingestion@${rigsParam}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/pipeline/stop - Stop ingestion
router.post('/stop', async (req, res) => {
  try {
    // Find and stop any running ingestion service
    const { stdout } = await execAsync('systemctl list-units --type=service --state=running | grep ingestion@ | awk \'{print $1}\' | head -1');
    const service = stdout.trim();
    
    if (service) {
      await execAsync(`sudo systemctl stop ${service}`);
      res.json({ success: true, message: `Stopped ${service}` });
    } else {
      res.json({ success: true, message: 'No ingestion running' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pipeline/history - Pipeline run history (last 50 runs)
router.get('/history', async (req, res) => {
  try {
    const db = req.db;
    const runs = await db.collection('pipeline_runs')
      .find({})
      .sort({ start_time: -1 })
      .limit(50)
      .toArray();
    
    res.json({
      runs,
      count: runs.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Pipeline history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pipeline/health-history - Pipeline health check logs
router.get('/health-history', async (req, res) => {
  try {
    const db = req.db;
    const healthLogs = await db.collection('pipeline_health_log')
      .find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    
    res.json({
      logs: healthLogs,
      count: healthLogs.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Pipeline health history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pipeline/daily-volume - Daily ingestion volume aggregated from pipeline_runs
router.get('/daily-volume', async (req, res) => {
  try {
    const db = req.db;
    
    // Aggregate daily volume from pipeline_runs
    const dailyVolume = await db.collection('pipeline_runs').aggregate([
      {
        $match: {
          start_time: { $exists: true },
          records_inserted: { $exists: true }
        }
      },
      {
        $addFields: {
          // Convert string to date if needed, handle both formats
          start_date: {
            $cond: {
              if: { $eq: [{ $type: '$start_time' }, 'string'] },
              then: { $toDate: '$start_time' },
              else: '$start_time'
            }
          },
          error_count: {
            $cond: {
              if: { $isArray: '$errors' },
              then: { $size: '$errors' },
              else: { $cond: [{ $gt: ['$errors', 0] }, '$errors', 0] }
            }
          }
        }
      },
      {
        $addFields: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$start_date'
            }
          }
        }
      },
      {
        $group: {
          _id: '$date',
          total_records: { $sum: '$records_inserted' },
          total_wells: { $sum: '$wells_processed' },
          run_count: { $sum: 1 },
          avg_runtime: { $avg: '$duration_seconds' },
          errors: { $sum: { $cond: [{ $gt: ['$error_count', 0] }, 1, 0] } }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $limit: 90
      }
    ]).toArray();
    
    res.json({
      dailyVolume: dailyVolume.map(d => ({
        date: d._id,
        records: d.total_records || 0,
        wells: d.total_wells || 0,
        runs: d.run_count || 0,
        avgRuntime: d.avg_runtime || 0,
        errors: d.errors || 0
      })),
      count: dailyVolume.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Pipeline daily volume error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
