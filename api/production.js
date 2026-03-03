/**
 * Production server for app.drillinglab.ai
 * Serves static dist/ + API routes on port 8501
 * Behind Cloudflare Access + Cloudflared tunnel
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// MongoDB connection
let db;
let fluidsDb;
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const dbName = 'drilling_lab';

async function connectMongo() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);
  fluidsDb = client.db('drilling_fluids');
  console.log('Connected to MongoDB (drilling_lab + drilling_fluids)');

  // Ensure indexes for session auth
  await db.collection('user_sessions').createIndex({ userId: 1, revoked: 1 });
  await db.collection('user_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
  await db.collection('user_groups').createIndex({ id: 1 }, { unique: true });
  console.log('Session indexes ready');

  return db;
}

// Make db available to routes
app.use((req, res, next) => {
  req.db = db;
  req.fluidsDb = fluidsDb;
  next();
});

// Serve screenshots
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')));

// API Routes
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/user', require('./routes/user'));
app.use('/api/pipeline', require('./routes/pipeline'));
app.use('/api/memory', require('./routes/memory'));
app.use('/api/router', require('./routes/router'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/project-tracker', require('./routes/projectTracker'));
app.use('/api/edr-tags', require('./routes/edrTags'));
app.use('/api/nov', require('./routes/novWells'));
app.use('/api/wells', require('./routes/wells'));
app.use('/api/ts/edr', require('./routes/edrTimescale'));
app.use('/api/schema', require('./routes/schema'));
app.use('/api/mud-analysis', require('./routes/mud-analysis'));
app.use('/api/charts', require('./routes/charts'));
app.use('/api/rig-state', require('./routes/rigState'));
app.use('/api/section-kpis', require('./routes/sectionKpis'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: 'production' });
});

// Serve static dist/ for the frontend (SPA)
const distPath = path.join(__dirname, '..');
app.use(express.static(distPath));

// SPA fallback — all non-API routes serve index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PROD_PORT || 8505;

connectMongo().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Production server running on port ${PORT}`);
    console.log(`   Serving: ${distPath}`);
    console.log(`   API: /api/*`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

module.exports = app;
