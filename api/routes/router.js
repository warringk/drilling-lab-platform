/**
 * Brain Router API
 * Unified message routing and brain assembly
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();

const ROUTER_PATH = '/home/kurt/platform-backbone/skills/brain-router/router.py';
const SCHEMA_PATH = '/home/kurt/platform-backbone/brain-router-schema.json';

/**
 * Call Python brain router
 */
async function callPythonRouter(message, channel, channelId, context = {}) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['-c', `
import sys
sys.path.insert(0, '/home/kurt/platform-backbone/skills/brain-router')
from router import BrainRouter
import json

router = BrainRouter()
result = router.route(
    message=${JSON.stringify(message)},
    channel=${JSON.stringify(channel)},
    channel_id=${JSON.stringify(channelId)},
    context=${JSON.stringify(context)}
)
print(json.dumps(result, default=str))
`]);

    let output = '';
    let error = '';

    py.stdout.on('data', (data) => { output += data.toString(); });
    py.stderr.on('data', (data) => { error += data.toString(); });

    py.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          resolve(JSON.parse(output.trim()));
        } catch (e) {
          reject(new Error(`Failed to parse router output: ${e.message}`));
        }
      } else {
        reject(new Error(error || 'Router process failed'));
      }
    });

    py.on('error', (err) => {
      reject(new Error(`Failed to spawn router: ${err.message}`));
    });
  });
}

/**
 * Load brain files and build system prompt
 */
async function buildSystemPrompt(brain) {
  const parts = [];

  // 1. Soul configuration
  if (brain.soul && brain.soul.config) {
    const soul = brain.soul.config;
    parts.push(`# Response Style
Tone: ${soul.tone || 'helpful'}
Style: ${soul.style || 'clear and concise'}
Priorities: ${(soul.priorities || []).join(', ')}
Never: ${(soul.never || []).join(', ')}`);
  }

  // 2. Load knowledge files
  for (const kpath of (brain.knowledge_paths || [])) {
    try {
      const content = await fs.readFile(kpath, 'utf8');
      const filename = path.basename(kpath);
      // Truncate large files
      const truncated = content.length > 10000 
        ? content.substring(0, 10000) + '\n\n[... truncated ...]'
        : content;
      parts.push(`# Knowledge: ${filename}\n${truncated}`);
    } catch (e) {
      console.warn(`Could not load knowledge file: ${kpath}`);
    }
  }

  // 3. User context from brain path
  if (brain.user && brain.user.brain_path) {
    const userBrainPath = brain.user.brain_path;
    for (const file of ['profile.md', 'context.md']) {
      try {
        const content = await fs.readFile(path.join(userBrainPath, file), 'utf8');
        parts.push(`# User ${file.replace('.md', '')}\n${content}`);
      } catch (e) {
        // User brain file not found, that's ok
      }
    }
  }

  // 4. User preferences
  if (brain.user) {
    const prefs = brain.user.preferences || {};
    parts.push(`# User Context
Role: ${brain.user.role || 'user'}
Permissions: ${(brain.user.permissions || []).join(', ')}
Preferred Units: ${prefs.units || 'metric'}
Detail Level: ${prefs.detail_level || 'standard'}`);
  }

  // 5. Available skills
  if (brain.skills && brain.skills.length > 0) {
    parts.push(`# Available Capabilities\nSkills: ${brain.skills.join(', ')}`);
  }

  // 6. Entity context
  const entities = brain.entities || {};
  if (Object.keys(entities).length > 0) {
    parts.push(`# Current Context\n${JSON.stringify(entities, null, 2)}`);
  }

  // 7. Data scope
  if (brain.data_scope && brain.data_scope.collections) {
    parts.push(`# Data Access\nCollections: ${brain.data_scope.collections.join(', ')}`);
  }

  return parts.join('\n\n---\n\n');
}

/**
 * POST /api/router/route
 * Route a message and assemble brain context
 */
router.post('/route', async (req, res) => {
  try {
    const { message, channel = 'web', channelId, context = {} } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Use channelId from request or try to get from authenticated user
    let resolvedChannelId = channelId;
    if (!resolvedChannelId && req.user) {
      // If user is authenticated, use their ID
      resolvedChannelId = req.user.telegramId || req.user.id || 'unknown';
    }
    resolvedChannelId = resolvedChannelId || 'unknown';

    // Call Python router
    const routing = await callPythonRouter(message, channel, resolvedChannelId, context);

    res.json(routing);
  } catch (error) {
    console.error('Router error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/router/brain
 * Route message and build full system prompt
 */
router.post('/brain', async (req, res) => {
  try {
    const { message, channel = 'web', channelId, context = {} } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let resolvedChannelId = channelId || (req.user ? req.user.telegramId : null) || 'unknown';

    // Get routing
    const routing = await callPythonRouter(message, channel, resolvedChannelId, context);

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(routing.brain);

    res.json({
      routing: routing.routing,
      entities: routing.entities,
      user: routing.user,
      systemPrompt,
      brain: routing.brain
    });
  } catch (error) {
    console.error('Brain assembly error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/router/schema
 * Get the current routing schema (for debugging/admin)
 */
router.get('/schema', async (req, res) => {
  try {
    const schema = await fs.readFile(SCHEMA_PATH, 'utf8');
    res.json(JSON.parse(schema));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/router/domains
 * List available domains
 */
router.get('/domains', async (req, res) => {
  try {
    const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, 'utf8'));
    const domains = Object.entries(schema.domains || {}).map(([name, config]) => ({
      name,
      description: config.description,
      keywords: config.keywords?.slice(0, 10),
      defaultAgent: config.default_agent
    }));
    res.json({ domains });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/router/health
 * Health check for router
 */
router.get('/health', async (req, res) => {
  try {
    // Quick test of the router
    const result = await callPythonRouter('test', 'health', 'health-check', {});
    res.json({ 
      status: 'ok', 
      routerWorking: !!result.routing,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
