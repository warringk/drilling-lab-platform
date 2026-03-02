const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

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

// Get tags for a well
router.get('/', async (req, res) => {
  try {
    const { well } = req.query;
    const database = await getDb();
    
    const query = well ? { well_id: well } : {};
    const tags = await database.collection('edr_tags')
      .find(query)
      .sort({ start_time: -1 })
      .limit(100)
      .toArray();
    
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new tag
router.post('/', async (req, res) => {
  try {
    const { 
      well_id, well_name, rig_name, section,
      start_time, end_time, 
      category, tag, label, context,
      screenshot
    } = req.body;
    
    if (!well_id || !start_time || !end_time || !category) {
      return res.status(400).json({ error: 'Missing required fields (well_id, start_time, end_time, category)' });
    }
    
    const database = await getDb();
    
    // Save screenshot if provided
    let screenshotPath = null;
    if (screenshot && screenshot.startsWith('data:image/png;base64,')) {
      const screenshotsDir = path.join(__dirname, '../../public/screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `edr-tag-${well_id}-${timestamp}.png`;
      const filepath = path.join(screenshotsDir, filename);
      
      // Remove data URL prefix and save
      const base64Data = screenshot.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(filepath, base64Data, 'base64');
      screenshotPath = `/screenshots/${filename}`;
    }
    
    const tagDoc = {
      well_id,
      well_name: well_name || null,
      rig_name: rig_name || null,
      section: section || null,
      start_time,
      end_time,
      category,
      tag: tag || 'Note',
      label: label || tag || 'Note',
      context: context || null,
      screenshot_path: screenshotPath,
      created_at: new Date(),
      created_by: 'web_user'
    };
    
    const result = await database.collection('edr_tags').insertOne(tagDoc);
    
    res.json({ 
      success: true, 
      id: result.insertedId,
      tag: tagDoc
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a tag
router.delete('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const database = await getDb();
    
    await database.collection('edr_tags').deleteOne({ 
      _id: new ObjectId(req.params.id) 
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get tag statistics
router.get('/stats', async (req, res) => {
  try {
    const database = await getDb();
    
    const stats = await database.collection('edr_tags').aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          tags: { $addToSet: '$tag' }
        }
      }
    ]).toArray();
    
    const total = await database.collection('edr_tags').countDocuments();
    
    res.json({ total, byCategory: stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
