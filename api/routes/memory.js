const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// GET /api/memory/stats
router.get('/stats', async (req, res) => {
  try {
    // Run the memory tracker script with JSON output
    const { stdout, stderr } = await execAsync(
      'python3 /home/kurt/platform-backbone/scripts/memory_tracker.py --json',
      { timeout: 30000 }
    );
    
    const data = JSON.parse(stdout);
    res.json(data);
  } catch (error) {
    console.error('Memory stats error:', error);
    
    // Try to parse partial output or return error
    res.status(500).json({ 
      error: error.message,
      stderr: error.stderr || null
    });
  }
});

// GET /api/memory/history - Get token usage over time (if we track it)
router.get('/history', async (req, res) => {
  try {
    const db = req.db;
    
    // Check if we have a memory_snapshots collection
    const history = await db.collection('memory_snapshots')
      .find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    
    res.json({ history });
  } catch (error) {
    // Collection might not exist yet
    res.json({ history: [] });
  }
});

// POST /api/memory/snapshot - Save current state (for history tracking)
router.post('/snapshot', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'python3 /home/kurt/platform-backbone/scripts/memory_tracker.py --json',
      { timeout: 30000 }
    );
    
    const data = JSON.parse(stdout);
    const db = req.db;
    
    // Store snapshot with timestamp
    await db.collection('memory_snapshots').insertOne({
      ...data,
      timestamp: new Date()
    });
    
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
