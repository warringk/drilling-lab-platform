const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Paths to project tracker data
const DATA_DIR = '/home/kurt/platform-backbone/data/project-tracker';
const SCRIPTS_DIR = '/home/kurt/platform-backbone/skills/orchestration/project-tracker/scripts';

// Helper to read JSON file safely
async function readJsonFile(filepath) {
  try {
    const content = await fs.readFile(filepath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

// GET /api/project-tracker/state - Current project state
router.get('/state', async (req, res) => {
  try {
    const state = await readJsonFile(path.join(DATA_DIR, 'state.json'));
    res.json(state || { projects: {}, last_updated: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/ledger - Generate fresh project ledger
router.get('/ledger', async (req, res) => {
  try {
    const recent = parseInt(req.query.recent) || 50;
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/project_ledger.py --recent ${recent} --output /tmp/api-ledger.json`,
      { timeout: 60000 }
    );
    const ledger = await readJsonFile('/tmp/api-ledger.json');
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/usage - Usage statistics
router.get('/usage', async (req, res) => {
  try {
    const recent = parseInt(req.query.recent) || 30;
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/extract_usage.py --recent ${recent} --output /tmp/api-usage.json`,
      { timeout: 60000 }
    );
    const usage = await readJsonFile('/tmp/api-usage.json');
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/clarifications - Pending clarifications
router.get('/clarifications', async (req, res) => {
  try {
    const queue = await readJsonFile(path.join(DATA_DIR, 'clarification-queue.json'));
    if (!queue) {
      return res.json({ pending: 0, items: [] });
    }
    const pending = queue.items?.filter(i => i.status === 'pending') || [];
    res.json({ 
      pending: pending.length, 
      items: pending.slice(0, 10) // Return first 10
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/project-tracker/clarifications/resolve - Resolve a clarification
router.post('/clarifications/resolve', async (req, res) => {
  try {
    const { sessionId, projects } = req.body;
    if (!sessionId || !projects) {
      return res.status(400).json({ error: 'sessionId and projects required' });
    }
    const projectsStr = Array.isArray(projects) ? projects.join(',') : projects;
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/request_clarification.py --resolve "${sessionId}" "${projectsStr}" --json`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(stdout));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/summary - Quick summary stats
router.get('/summary', async (req, res) => {
  try {
    // Run quick extraction
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/extract_usage.py --recent 20 --output /tmp/api-summary.json`,
      { timeout: 30000 }
    );
    const usage = await readJsonFile('/tmp/api-summary.json');
    const state = await readJsonFile(path.join(DATA_DIR, 'state.json'));
    const queue = await readJsonFile(path.join(DATA_DIR, 'clarification-queue.json'));
    
    const pendingClarifications = queue?.items?.filter(i => i.status === 'pending')?.length || 0;
    
    res.json({
      lastUpdated: state?.last_updated || new Date().toISOString(),
      totalProjects: Object.keys(state?.projects || {}).length,
      sessionsAnalyzed: usage?.sessions?.length || 0,
      totalTokens: usage?.totals?.input_tokens + usage?.totals?.output_tokens || 0,
      totalCost: usage?.totals?.cost_usd || 0,
      pendingClarifications,
      modelBreakdown: usage?.model_breakdown || {}
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/learnings - Self-learning analysis
router.get('/learnings', async (req, res) => {
  try {
    const recent = parseInt(req.query.recent) || 30;
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/learning_analyzer.py --recent ${recent} --output /tmp/api-learnings.json`,
      { timeout: 120000 }
    );
    const learnings = await readJsonFile('/tmp/api-learnings.json');
    res.json(learnings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/learning-store - Persistent learning store
router.get('/learning-store', async (req, res) => {
  try {
    const store = await readJsonFile(path.join(DATA_DIR, 'learning-store.json'));
    res.json(store || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/hierarchy - Full hierarchy
router.get('/hierarchy', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/hierarchy.py export`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(stdout));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/project-tracker/hierarchy/create - Create new item
router.post('/hierarchy/create', async (req, res) => {
  try {
    const { type, parent, name, description } = req.body;
    if (!type || !name) {
      return res.status(400).json({ error: 'type and name required' });
    }
    const parentArg = parent ? `--parent "${parent}"` : '';
    const descArg = description ? `--description "${description}"` : '';
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/hierarchy.py create --type ${type} ${parentArg} --name "${name}" ${descArg}`,
      { timeout: 10000 }
    );
    res.json({ success: true, message: stdout.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/verification/pending - Get pending verifications
router.get('/verification/pending', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/verification.py --pending --json`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(stdout || '[]'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/verification/needs-revision - Get tasks needing revision
router.get('/verification/needs-revision', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/verification.py --needs-revision --json`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(stdout || '[]'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/verification/escalated - Get escalated tasks
router.get('/verification/escalated', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/verification.py --escalated --json`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(stdout || '[]'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/project-tracker/verification/submit - Submit task for verification
router.post('/verification/submit', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'taskId required' });
    }
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/verification.py --submit "${taskId}" --json`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(stdout));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/project-tracker/verification/verify - Record verification result
router.post('/verification/verify', async (req, res) => {
  try {
    const { taskId, passed, feedback, verifier } = req.body;
    if (!taskId || passed === undefined) {
      return res.status(400).json({ error: 'taskId and passed required' });
    }
    const passFlag = passed ? '--pass' : '--fail';
    const feedbackArg = feedback ? `--feedback "${feedback.replace(/"/g, '\\"')}"` : '';
    const verifierArg = verifier ? `--verifier "${verifier}"` : '';
    
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/verification.py --verify "${taskId}" ${passFlag} ${feedbackArg} ${verifierArg} --json`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(stdout));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/project-tracker/hierarchy/status - Update status
router.post('/hierarchy/status', async (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: 'id and status required' });
    }
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/hierarchy.py status --id "${id}" --set-status "${status}"`,
      { timeout: 10000 }
    );
    res.json({ success: true, message: stdout.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Activity Feed - Last 24h vectors by project (with semantic extraction)
router.get('/activity-feed', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/activity_semantic.py`,
      { timeout: 15000 }
    );
    res.json(JSON.parse(stdout));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Signal Store - Triage View
router.get('/signals/triage', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/signal_capture.py triage`,
      { timeout: 15000 }
    );
    res.json(JSON.parse(stdout));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Signal Store - Ingest from activity
router.post('/signals/ingest', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/signal_capture.py ingest`,
      { timeout: 30000 }
    );
    res.json(JSON.parse(stdout));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Signal Store - Run clustering
router.post('/signals/cluster', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `python3 ${SCRIPTS_DIR}/signal_capture.py cluster`,
      { timeout: 30000 }
    );
    res.json(JSON.parse(stdout));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Local Model Usage Stats
router.get('/local-usage', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'python3 /home/kurt/platform-backbone/data/signal-store/local_model_usage.py summary',
      { timeout: 5000 }
    );
    res.json(JSON.parse(stdout));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// Web Chat - Send message to bot
router.post('/chat/send', async (req, res) => {
  try {
    const { bot, message, sessionId } = req.body;
    if (!bot || !message) {
      return res.status(400).json({ error: 'bot and message required' });
    }
    
    // Map bot to profile
    const botProfiles = {
      'kurtarchdevbot': 'archdev',
      'main-drilling-lab': 'default',
      'pipeline-bot': 'pipeline',
      'datascience-bot': 'datascience',
      'mechanic-bot': 'mechanic',
      'playbot': 'playbot'
    };
    
    const profile = botProfiles[bot];
    if (!profile) {
      return res.status(400).json({ error: `Unknown bot: ${bot}` });
    }
    
    // Use clawdbot agent command
    const sessionArg = sessionId ? `--session-id "${sessionId}"` : '--session-id "webchat"';
    const cmd = `clawdbot --profile ${profile} agent --message "${message.replace(/"/g, '\\"')}" ${sessionArg} --json --timeout 120`;
    
    const { stdout, stderr } = await execAsync(cmd, { timeout: 130000 });
    
    try {
      const result = JSON.parse(stdout);
      res.json({
        success: true,
        response: result.response || result.content || stdout,
        sessionId: result.sessionId || 'webchat'
      });
    } catch {
      res.json({ success: true, response: stdout, sessionId: 'webchat' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/project-tracker/user-costs - Per-user cost breakdown
router.get('/user-costs', async (req, res) => {
  try {
    const recent = parseInt(req.query.recent) || 100;
    const days = req.query.days ? `--days ${parseInt(req.query.days)}` : '';
    const { stdout } = await execAsync(
      `python3 /home/kurt/platform-backbone/skills/orchestration/project-tracker/scripts/extract_user_costs.py --recent ${recent} ${days} --output /tmp/api-user-costs.json`,
      { timeout: 120000 }
    );
    const data = await readJsonFile('/tmp/api-user-costs.json');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/github-issues - Fetch open issues from GitHub
router.get('/github-issues', async (req, res) => {
  try {
    const repos = ['warringk/drilling_lab', 'warringk/drilling-lab-platform'];
    const allIssues = [];

    for (const repo of repos) {
      try {
        const { stdout } = await execAsync(
          `gh issue list --repo ${repo} --state open --json number,title,labels,createdAt,updatedAt,assignees,url --limit 30`,
          { timeout: 15000 }
        );
        const issues = JSON.parse(stdout || '[]');
        issues.forEach(i => { i.repo = repo.split('/')[1]; });
        allIssues.push(...issues);
      } catch (e) {
        // Skip repos that fail
        console.error(`Failed to fetch issues for ${repo}: ${e.message}`);
      }
    }

    // Sort by updatedAt desc
    allIssues.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({
      issues: allIssues,
      total: allIssues.length,
      fetched_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project-tracker/work-packages - Sync and return work packages
router.get('/work-packages', async (req, res) => {
  try {
    // Run sync script to update hierarchy from QUEUE.md
    await execAsync(
      `python3 ${SCRIPTS_DIR}/sync_work_packages.py`,
      { timeout: 10000 }
    );
    // Return the work packages project from hierarchy
    const hierarchy = await readJsonFile(path.join(DATA_DIR, 'hierarchy.json'));
    let wpProject = null;
    for (const goal of (hierarchy?.goals || [])) {
      for (const proj of (goal?.projects || [])) {
        if (proj.name === 'Work Packages') {
          wpProject = proj;
          break;
        }
      }
    }

    // Also read QUEUE.md raw for backlog items
    let backlog = [];
    try {
      const queueContent = await fs.readFile('/home/kurt/kurtarchdevbot/work-packages/QUEUE.md', 'utf8');
      const backlogSection = queueContent.split('📝 Backlog')[1];
      if (backlogSection) {
        backlog = backlogSection.split('\n')
          .filter(l => l.trim().startsWith('- '))
          .map(l => l.trim().substring(2));
      }
    } catch {}

    res.json({
      project: wpProject,
      backlog,
      synced_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
