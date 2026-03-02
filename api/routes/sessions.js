const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// JWT secret - should be in env in production
const JWT_SECRET = process.env.JWT_SECRET || 'drilling-lab-session-secret-change-me';
const SESSION_EXPIRY_DAYS = 90; // "Stay logged in" = 90 days

/**
 * Session-based auth for persistent login across devices.
 * 
 * Flow:
 * 1. User logs in (invite code + profile) → server creates session + JWT
 * 2. JWT stored in localStorage on client
 * 3. On load, client sends JWT → server validates → returns user + group config
 * 4. JWT is long-lived (90 days) with refresh mechanism
 * 5. Same user on another device → same flow, gets same profile from DB
 */

// Middleware: extract and validate session token
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No session token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Check session still exists in DB
    const session = await req.db.collection('user_sessions').findOne({
      _id: payload.sessionId,
      revoked: { $ne: true }
    });

    if (!session) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }

    // Load user from DB
    const user = await req.db.collection('users').findOne({ id: session.userId });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Load user group config
    let groupConfig = null;
    if (user.group_id) {
      groupConfig = await req.db.collection('user_groups').findOne({ id: user.group_id });
    }

    req.user = user;
    req.session = session;
    req.groupConfig = groupConfig;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Optional auth - doesn't fail if no token, just sets req.user
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const session = await req.db.collection('user_sessions').findOne({
      _id: payload.sessionId,
      revoked: { $ne: true }
    });
    if (session) {
      const user = await req.db.collection('users').findOne({ id: session.userId });
      if (user) {
        let groupConfig = null;
        if (user.group_id) {
          groupConfig = await req.db.collection('user_groups').findOne({ id: user.group_id });
        }
        req.user = user;
        req.session = session;
        req.groupConfig = groupConfig;
      }
    }
  } catch (err) {
    // Silently continue without auth
  }
  next();
}

// ─── LOGIN / REGISTER ─────────────────────────

/**
 * POST /api/sessions/login
 * Login with email. If user exists, create session.
 * If new user with valid invite, create user + session.
 */
router.post('/login', async (req, res) => {
  const { email, name, inviteCode, device } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const users = req.db.collection('users');

  // Check if user exists
  let user = await users.findOne({ email: normalizedEmail });

  if (!user) {
    // New user — need invite code
    if (!inviteCode) {
      return res.status(401).json({ error: 'Invite code required for new users', code: 'INVITE_REQUIRED' });
    }

    // Validate invite
    const validInvite = await validateInviteCode(req.db, inviteCode);
    if (!validInvite) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }

    // Create user
    const userId = normalizedEmail.split('@')[0].replace(/[^a-z0-9]/g, '');
    user = {
      id: userId,
      email: normalizedEmail,
      name: name || normalizedEmail.split('@')[0],
      org_id: validInvite.org_id || null,
      group_id: validInvite.group_id || 'default',
      role: validInvite.role || 'client',
      well_access: validInvite.well_access || [],
      rig_access: validInvite.rig_access || [],
      preferences: {
        stayLoggedIn: true,
        theme: 'dark',
        timezone: 'America/Edmonton'
      },
      workspaces: [
        { id: 'projects', name: 'My Projects', icon: '📋', color: '#4a9eff', pinned: true },
        { id: 'files', name: 'My Files', icon: '📁', color: '#4ade80', pinned: true }
      ],
      inviteCode: inviteCode.toUpperCase(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await users.insertOne(user);

    // Mark invite as used (if single-use)
    if (validInvite._id) {
      await req.db.collection('invite_codes').updateOne(
        { _id: validInvite._id, reusable: { $ne: true } },
        { $set: { usedAt: new Date(), usedBy: normalizedEmail } }
      );
    }
  }

  // Create session
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const session = {
    _id: sessionId,
    userId: user.id,
    email: normalizedEmail,
    device: device || detectDevice(req),
    createdAt: new Date(),
    expiresAt,
    lastActiveAt: new Date(),
    revoked: false
  };

  await req.db.collection('user_sessions').insertOne(session);

  // Create JWT
  const token = jwt.sign(
    { sessionId, userId: user.id, email: normalizedEmail },
    JWT_SECRET,
    { expiresIn: `${SESSION_EXPIRY_DAYS}d` }
  );

  // Load group config
  let groupConfig = null;
  if (user.group_id) {
    groupConfig = await req.db.collection('user_groups').findOne({ id: user.group_id });
  }

  res.json({
    token,
    expiresAt,
    user: sanitizeUser(user),
    groupConfig
  });
});

// ─── SESSION VALIDATION ───────────────────────

/**
 * GET /api/sessions/me
 * Validate current session and return user + group config.
 * This is the "stay logged in" check — called on app load.
 */
router.get('/me', requireAuth, async (req, res) => {
  // Update last active
  await req.db.collection('user_sessions').updateOne(
    { _id: req.session._id },
    { $set: { lastActiveAt: new Date() } }
  );

  res.json({
    user: sanitizeUser(req.user),
    groupConfig: req.groupConfig,
    session: {
      id: req.session._id,
      device: req.session.device,
      expiresAt: req.session.expiresAt,
      createdAt: req.session.createdAt
    }
  });
});

// ─── TOKEN REFRESH ────────────────────────────

/**
 * POST /api/sessions/refresh
 * Extend session expiry (call periodically from client).
 */
router.post('/refresh', requireAuth, async (req, res) => {
  const newExpiry = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await req.db.collection('user_sessions').updateOne(
    { _id: req.session._id },
    { $set: { expiresAt: newExpiry, lastActiveAt: new Date() } }
  );

  // Issue new JWT
  const token = jwt.sign(
    { sessionId: req.session._id, userId: req.user.id, email: req.user.email },
    JWT_SECRET,
    { expiresIn: `${SESSION_EXPIRY_DAYS}d` }
  );

  res.json({ token, expiresAt: newExpiry });
});

// ─── LOGOUT ───────────────────────────────────

/**
 * POST /api/sessions/logout
 * Revoke current session.
 */
router.post('/logout', requireAuth, async (req, res) => {
  await req.db.collection('user_sessions').updateOne(
    { _id: req.session._id },
    { $set: { revoked: true, revokedAt: new Date() } }
  );

  res.json({ success: true });
});

/**
 * POST /api/sessions/logout-all
 * Revoke all sessions for current user (logout everywhere).
 */
router.post('/logout-all', requireAuth, async (req, res) => {
  const result = await req.db.collection('user_sessions').updateMany(
    { userId: req.user.id, revoked: { $ne: true } },
    { $set: { revoked: true, revokedAt: new Date() } }
  );

  res.json({ success: true, sessionsRevoked: result.modifiedCount });
});

// ─── DEVICE MANAGEMENT ────────────────────────

/**
 * GET /api/sessions/devices
 * List all active sessions/devices for current user.
 */
router.get('/devices', requireAuth, async (req, res) => {
  const sessions = await req.db.collection('user_sessions')
    .find({
      userId: req.user.id,
      revoked: { $ne: true },
      expiresAt: { $gt: new Date() }
    })
    .sort({ lastActiveAt: -1 })
    .toArray();

  res.json({
    devices: sessions.map(s => ({
      id: s._id,
      device: s.device,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      expiresAt: s.expiresAt,
      isCurrent: s._id === req.session._id
    }))
  });
});

/**
 * DELETE /api/sessions/devices/:sessionId
 * Revoke a specific device session.
 */
router.delete('/devices/:sessionId', requireAuth, async (req, res) => {
  const { sessionId } = req.params;

  const result = await req.db.collection('user_sessions').updateOne(
    { _id: sessionId, userId: req.user.id },
    { $set: { revoked: true, revokedAt: new Date() } }
  );

  if (result.modifiedCount === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ success: true });
});

// ─── UPDATE PREFERENCES ───────────────────────

/**
 * PATCH /api/sessions/preferences
 * Update user preferences (stay logged in, theme, etc.)
 */
router.patch('/preferences', requireAuth, async (req, res) => {
  const updates = req.body;

  // Only allow specific preference fields
  const allowed = ['stayLoggedIn', 'theme', 'timezone', 'notifications'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      filtered[`preferences.${key}`] = updates[key];
    }
  }

  if (Object.keys(filtered).length === 0) {
    return res.status(400).json({ error: 'No valid preference fields' });
  }

  await req.db.collection('users').updateOne(
    { id: req.user.id },
    { $set: { ...filtered, updatedAt: new Date() } }
  );

  const updatedUser = await req.db.collection('users').findOne({ id: req.user.id });
  res.json({ user: sanitizeUser(updatedUser) });
});

// ─── HELPERS ──────────────────────────────────

async function validateInviteCode(db, code) {
  // Check DB first
  const invite = await db.collection('invite_codes').findOne({
    code: code.toUpperCase(),
    $or: [
      { usedAt: null },
      { reusable: true }
    ]
  });

  if (invite) return invite;

  // Fallback hardcoded codes for testing
  const testCodes = ['CAITLIN2024', 'KURT2024', 'DRILLINGLAB', 'DEMO', 'CLOUDFLARE'];
  if (testCodes.includes(code.toUpperCase())) {
    return { code: code.toUpperCase(), group_id: 'platform_admin' };
  }

  return null;
}

function sanitizeUser(user) {
  const { _id, password_hash, ...safe } = user;
  return safe;
}

function detectDevice(req) {
  const ua = req.headers['user-agent'] || '';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

// Export middleware for use in other routes
router.requireAuth = requireAuth;
router.optionalAuth = optionalAuth;

module.exports = router;
