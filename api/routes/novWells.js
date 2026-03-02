const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'drilling_lab';

let db = null;

async function getDb() {
  if (!db) {
    const client = await MongoClient.connect(MONGO_URI);
    db = client.db(DB_NAME);
  }
  return db;
}

// Get distinct rigs
router.get('/rigs', async (req, res) => {
  try {
    const database = await getDb();
    const rigs = await database.collection('nov_wells').distinct('rig_name');
    // Sort numerically where possible
    rigs.sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a).localeCompare(String(b));
    });
    res.json({ rigs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get wells, optionally filtered by rig
router.get('/wells', async (req, res) => {
  try {
    const { rig } = req.query;
    const database = await getDb();
    
    const query = rig ? { rig_name: rig } : {};
    const wells = await database.collection('nov_wells')
      .find(query)
      .project({
        _id: 1,
        job_id: 1,
        well_name: 1,
        rig_name: 1,
        licence_number: 1,
        job_status: 1,
        start_date: 1,
        end_date: 1,
        first_data_date: 1,
        last_data_date: 1,
        has_1sec_data: 1,
        record_count_1sec: 1,
        ingestion_status: 1
      })
      .sort({ start_date: -1 })
      .limit(200)
      .toArray();
    
    res.json({ wells, count: wells.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single well details
router.get('/wells/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const database = await getDb();
    
    let query;
    try {
      query = { _id: new ObjectId(req.params.id) };
    } catch {
      query = { job_id: req.params.id };
    }
    
    const well = await database.collection('nov_wells').findOne(query);
    
    if (!well) {
      return res.status(404).json({ error: 'Well not found' });
    }
    
    res.json({ well });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get EDR data for a well
router.get('/edr/:wellId', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const database = await getDb();
    
    const { start, end, resolution = '10' } = req.query;
    const resSeconds = parseInt(resolution) || 10;
    
    // Get well to find job_id
    let wellQuery;
    try {
      wellQuery = { _id: new ObjectId(req.params.wellId) };
    } catch {
      wellQuery = { job_id: req.params.wellId };
    }
    
    const well = await database.collection('nov_wells').findOne(wellQuery);
    if (!well) {
      return res.status(404).json({ error: 'Well not found' });
    }
    
    // Build time query
    const timeQuery = { job_id: well.job_id };
    if (start) {
      timeQuery.timestamp = timeQuery.timestamp || {};
      timeQuery.timestamp.$gte = new Date(start);
    }
    if (end) {
      timeQuery.timestamp = timeQuery.timestamp || {};
      timeQuery.timestamp.$lte = new Date(end);
    }
    
    // Channel mapping (NOV names to common names)
    const channelMap = {
      'HookLoad': 'hkld',
      'BitWeight': 'wob',
      'BlockHeight': 'block_height',
      'PumpPressure': 'spp',
      'PumpSpm': 'spm',
      'TopDrvRpm': 'rpm',
      'TopDrvTorque': 'torque',
      'AnnPressure': 'ann_press',
      'MudVolume': 'mud_vol',
      'GainLoss': 'gain_loss',
      'BitDepth': 'bit_depth',
      'HoleDepth': 'hole_depth',
      'Rop': 'rop',
      'FlowIn': 'flow_in',
      'FlowOut': 'flow_out'
    };
    
    // Fetch raw data and sample in JS
    const rawData = await database.collection('nov_edr_raw_1s')
      .find(timeQuery)
      .sort({ timestamp: 1 })
      .limit(50000)
      .toArray();
    
    // Sample every N seconds and transform
    const data = [];
    let lastSample = 0;
    
    for (const doc of rawData) {
      const ts = new Date(doc.timestamp).getTime();
      if (ts - lastSample >= resSeconds * 1000) {
        const row = { timestamp: doc.timestamp };
        if (doc.channels) {
          for (const [novName, commonName] of Object.entries(channelMap)) {
            const val = doc.channels[novName];
            if (val !== undefined && val !== 'NaN' && val !== null && !isNaN(parseFloat(val))) {
              row[commonName] = parseFloat(val);
            }
          }
        }
        data.push(row);
        lastSample = ts;
        
        // Limit to 5000 points
        if (data.length >= 5000) break;
      }
    }
    
    res.json({ 
      well_id: well._id,
      job_id: well.job_id,
      well_name: well.well_name,
      resolution: resSeconds,
      count: data.length,
      data 
    });
  } catch (error) {
    console.error('EDR fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
