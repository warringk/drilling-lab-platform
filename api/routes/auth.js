const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Environment variables
const ONEDRIVE_CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
const ONEDRIVE_CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
const ONEDRIVE_REDIRECT_URI = process.env.ONEDRIVE_REDIRECT_URI || 'https://app.drillinglab.ai/api/auth/onedrive/callback';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://app.drillinglab.ai/api/auth/google/callback';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app.drillinglab.ai';

// ===== ONEDRIVE / MICROSOFT =====
// Using AppFolder scope - only access to /Apps/DrillingLab folder

router.get('/onedrive/login', (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  if (!ONEDRIVE_CLIENT_ID) {
    return res.status(500).json({ error: 'OneDrive not configured' });
  }
  
  const state = crypto.randomBytes(16).toString('hex') + ':' + userId;
  
  // AppFolder scope - creates and accesses only /Apps/DrillingLab
  const scopes = [
    'Files.ReadWrite.AppFolder',  // Only app's folder
    'User.Read',                   // Basic profile
    'offline_access'               // Refresh tokens
  ].join(' ');
  
  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  authUrl.searchParams.set('client_id', ONEDRIVE_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', ONEDRIVE_REDIRECT_URI);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_mode', 'query');
  
  res.redirect(authUrl.toString());
});

router.get('/onedrive/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  if (error) {
    console.error('OneDrive auth error:', error, error_description);
    return res.redirect(`${FRONTEND_URL}/#/locker?storage_error=${encodeURIComponent(error_description || error)}`);
  }
  
  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/#/locker?storage_error=Missing auth code`);
  }
  
  const userId = state.split(':')[1];
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ONEDRIVE_CLIENT_ID,
        client_secret: ONEDRIVE_CLIENT_SECRET,
        code: code,
        redirect_uri: ONEDRIVE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    
    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
      console.error('Token exchange error:', tokens);
      return res.redirect(`${FRONTEND_URL}/#/locker?storage_error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }
    
    // Get user info
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const msUser = await userResponse.json();
    
    // Initialize the app folder (this creates it if it doesn't exist)
    const appFolderResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/special/approot', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const appFolder = await appFolderResponse.json();
    
    console.log('App folder created/accessed:', appFolder.name, appFolder.id);
    
    // Store tokens
    const storageDoc = {
      userId: userId,
      provider: 'onedrive',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      email: msUser.mail || msUser.userPrincipalName,
      displayName: msUser.displayName,
      appFolderId: appFolder.id,
      appFolderName: appFolder.name,
      appFolderOnly: true,  // Flag to indicate restricted access
      connectedAt: new Date(),
      updatedAt: new Date()
    };
    
    await req.db.collection('user_storage_tokens').updateOne(
      { userId, provider: 'onedrive' },
      { $set: storageDoc },
      { upsert: true }
    );
    
    console.log(`OneDrive AppFolder connected for user ${userId}`);
    res.redirect(`${FRONTEND_URL}/#/locker?storage_connected=onedrive`);
    
  } catch (err) {
    console.error('OneDrive callback error:', err);
    res.redirect(`${FRONTEND_URL}/#/locker?storage_error=${encodeURIComponent('Connection failed')}`);
  }
});

// ===== GOOGLE DRIVE =====

router.get('/google/login', (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google Drive not configured' });
  }
  
  const state = crypto.randomBytes(16).toString('hex') + ':' + userId;
  
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',      // Only files created/opened by app
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' ');
  
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  
  res.redirect(authUrl.toString());
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect(`${FRONTEND_URL}/#/locker?storage_error=${encodeURIComponent(error)}`);
  }
  
  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/#/locker?storage_error=Missing auth code`);
  }
  
  const userId = state.split(':')[1];
  
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    
    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
      return res.redirect(`${FRONTEND_URL}/#/locker?storage_error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }
    
    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const googleUser = await userResponse.json();
    
    // Create app folder in Google Drive
    const folderMetadata = {
      name: 'Drilling Lab',
      mimeType: 'application/vnd.google-apps.folder'
    };
    
    // Check if folder exists first
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='Drilling Lab' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      { headers: { 'Authorization': `Bearer ${tokens.access_token}` } }
    );
    const searchResult = await searchResponse.json();
    
    let appFolder;
    if (searchResult.files && searchResult.files.length > 0) {
      appFolder = searchResult.files[0];
    } else {
      // Create the folder
      const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderMetadata)
      });
      appFolder = await createResponse.json();
    }
    
    // Store tokens
    const storageDoc = {
      userId: userId,
      provider: 'google',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      email: googleUser.email,
      displayName: googleUser.name,
      appFolderId: appFolder.id,
      appFolderName: appFolder.name || 'Drilling Lab',
      appFolderOnly: true,
      connectedAt: new Date(),
      updatedAt: new Date()
    };
    
    await req.db.collection('user_storage_tokens').updateOne(
      { userId, provider: 'google' },
      { $set: storageDoc },
      { upsert: true }
    );
    
    console.log(`Google Drive AppFolder connected for user ${userId}`);
    res.redirect(`${FRONTEND_URL}/#/locker?storage_connected=google`);
    
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${FRONTEND_URL}/#/locker?storage_error=${encodeURIComponent('Connection failed')}`);
  }
});

// Check connection status
router.get('/status/:provider', async (req, res) => {
  const { provider } = req.params;
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const connection = await req.db.collection('user_storage_tokens').findOne({ userId, provider });
  
  if (!connection) {
    return res.json({ connected: false });
  }
  
  res.json({
    connected: true,
    email: connection.email,
    displayName: connection.displayName,
    connectedAt: connection.connectedAt,
    appFolderOnly: connection.appFolderOnly,
    appFolderName: connection.appFolderName
  });
});

// Disconnect storage
router.delete('/disconnect/:provider', async (req, res) => {
  const { provider } = req.params;
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  await req.db.collection('user_storage_tokens').deleteOne({ userId, provider });
  res.json({ success: true });
});

module.exports = router;
