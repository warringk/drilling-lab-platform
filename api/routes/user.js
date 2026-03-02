const express = require('express');
const router = express.Router();

// Get user profile
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const user = await req.db.collection('users').findOne({ id: userId });
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Get storage connections
  const storageConnections = await req.db.collection('user_storage_tokens')
    .find({ userId })
    .project({ accessToken: 0, refreshToken: 0 }) // Don't expose tokens
    .toArray();
  
  res.json({
    ...user,
    storage: {
      googleDrive: storageConnections.find(c => c.provider === 'google') || null,
      oneDrive: storageConnections.find(c => c.provider === 'onedrive') || null
    }
  });
});

// Create or update user
router.post('/', async (req, res) => {
  const userData = req.body;
  
  if (!userData.id) {
    return res.status(400).json({ error: 'User id required' });
  }
  
  const user = {
    ...userData,
    updatedAt: new Date()
  };
  
  // Check if user exists
  const existing = await req.db.collection('users').findOne({ id: userData.id });
  
  if (!existing) {
    user.createdAt = new Date();
  }
  
  await req.db.collection('users').updateOne(
    { id: userData.id },
    { $set: user },
    { upsert: true }
  );
  
  res.json(user);
});

// Get user memory/brain
router.get('/:userId/memory', async (req, res) => {
  const { userId } = req.params;
  
  const memory = await req.db.collection('user_memory').findOne({ userId });
  
  res.json(memory || {
    userId,
    context: {
      currentFocus: '',
      recentTopics: [],
      activeTasks: []
    },
    summary: '',
    preferences: {}
  });
});

// Update user memory
router.patch('/:userId/memory', async (req, res) => {
  const { userId } = req.params;
  const updates = req.body;
  
  const result = await req.db.collection('user_memory').updateOne(
    { userId },
    { 
      $set: { 
        ...updates,
        userId,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
  
  const memory = await req.db.collection('user_memory').findOne({ userId });
  res.json(memory);
});

// Validate invite code
router.post('/validate-invite', async (req, res) => {
  const { code } = req.body;
  
  // Check invite codes collection
  const invite = await req.db.collection('invite_codes').findOne({ 
    code: code.toUpperCase(),
    $or: [
      { usedAt: null },
      { reusable: true }
    ]
  });
  
  if (invite) {
    return res.json({ valid: true, invite });
  }
  
  // Fallback to hardcoded codes for testing
  const testCodes = ['CAITLIN2024', 'KURT2024', 'DRILLINGLAB'];
  if (testCodes.includes(code.toUpperCase())) {
    return res.json({ valid: true });
  }
  
  res.json({ valid: false });
});

// Create invite code (admin)
router.post('/invite-codes', async (req, res) => {
  const { code, createdBy, reusable, expiresAt } = req.body;
  
  await req.db.collection('invite_codes').insertOne({
    code: code.toUpperCase(),
    createdBy,
    reusable: reusable || false,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdAt: new Date(),
    usedAt: null,
    usedBy: null
  });
  
  res.json({ success: true, code: code.toUpperCase() });
});

module.exports = router;
