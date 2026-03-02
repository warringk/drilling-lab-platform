const express = require('express');
const router = express.Router();

// Token refresh helpers
async function refreshOneDriveToken(db, userId) {
  const conn = await db.collection('user_storage_tokens').findOne({ userId, provider: 'onedrive' });
  if (!conn || !conn.refreshToken) return null;
  
  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.ONEDRIVE_CLIENT_ID,
      client_secret: process.env.ONEDRIVE_CLIENT_SECRET,
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  
  const tokens = await response.json();
  if (tokens.error) return null;
  
  await db.collection('user_storage_tokens').updateOne(
    { userId, provider: 'onedrive' },
    { 
      $set: { 
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || conn.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date()
      }
    }
  );
  
  return tokens.access_token;
}

async function refreshGoogleToken(db, userId) {
  const conn = await db.collection('user_storage_tokens').findOne({ userId, provider: 'google' });
  if (!conn || !conn.refreshToken) return null;
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  
  const tokens = await response.json();
  if (tokens.error) return null;
  
  await db.collection('user_storage_tokens').updateOne(
    { userId, provider: 'google' },
    { 
      $set: { 
        accessToken: tokens.access_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date()
      }
    }
  );
  
  return tokens.access_token;
}

async function getValidToken(db, userId, provider) {
  const conn = await db.collection('user_storage_tokens').findOne({ userId, provider });
  if (!conn) return { token: null, conn: null };
  
  let token = conn.accessToken;
  
  // Refresh if expired
  if (new Date(conn.expiresAt) < new Date(Date.now() + 5 * 60 * 1000)) {
    if (provider === 'onedrive') {
      token = await refreshOneDriveToken(db, userId);
    } else if (provider === 'google') {
      token = await refreshGoogleToken(db, userId);
    }
  }
  
  return { token, conn };
}

// ===== ONEDRIVE - APP FOLDER ONLY =====

router.get('/onedrive/files', async (req, res) => {
  const { userId, folderId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const { token, conn } = await getValidToken(req.db, userId, 'onedrive');
  if (!token) {
    return res.status(401).json({ error: 'Not connected to OneDrive', needsAuth: true });
  }
  
  try {
    // Always use approot as base - this is the app's private folder
    let endpoint;
    if (!folderId || folderId === '' || folderId === 'root') {
      // List contents of app folder root
      endpoint = 'https://graph.microsoft.com/v1.0/me/drive/special/approot/children';
    } else {
      // List contents of subfolder within app folder
      endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`;
    }
    
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(response.status).json({ error: data.error.message });
    }
    
    const files = (data.value || []).map(item => ({
      id: item.id,
      name: item.name,
      type: item.folder ? 'folder' : 'file',
      size: item.size,
      mimeType: item.file?.mimeType,
      modifiedAt: item.lastModifiedDateTime,
      webUrl: item.webUrl,
      downloadUrl: item['@microsoft.graph.downloadUrl']
    }));
    
    res.json({ 
      files, 
      folderId: folderId || 'root',
      appFolderName: conn.appFolderName || 'Apps/DrillingLab'
    });
    
  } catch (err) {
    console.error('OneDrive files error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Create folder in app folder
router.post('/onedrive/folder', async (req, res) => {
  const { userId, name, parentId } = req.body;
  
  const { token } = await getValidToken(req.db, userId, 'onedrive');
  if (!token) {
    return res.status(401).json({ error: 'Not connected', needsAuth: true });
  }
  
  try {
    const endpoint = parentId 
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`
      : 'https://graph.microsoft.com/v1.0/me/drive/special/approot/children';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename'
      })
    });
    
    const folder = await response.json();
    res.json({ success: true, folder });
    
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// ===== GOOGLE DRIVE - APP FOLDER ONLY =====

router.get('/google/files', async (req, res) => {
  const { userId, folderId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const { token, conn } = await getValidToken(req.db, userId, 'google');
  if (!token) {
    return res.status(401).json({ error: 'Not connected to Google Drive', needsAuth: true });
  }
  
  try {
    // Use app folder ID as root, or specified subfolder
    const targetFolderId = (!folderId || folderId === '' || folderId === 'root') 
      ? conn.appFolderId 
      : folderId;
    
    const query = `'${targetFolderId}' in parents and trashed = false`;
    const endpoint = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink)&orderBy=folder,name`;
    
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(response.status).json({ error: data.error.message });
    }
    
    const files = (data.files || []).map(item => ({
      id: item.id,
      name: item.name,
      type: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
      size: item.size ? parseInt(item.size) : null,
      mimeType: item.mimeType,
      modifiedAt: item.modifiedTime,
      webUrl: item.webViewLink,
      downloadUrl: item.webContentLink
    }));
    
    res.json({ 
      files, 
      folderId: targetFolderId,
      appFolderName: conn.appFolderName || 'Drilling Lab'
    });
    
  } catch (err) {
    console.error('Google Drive files error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Create folder in app folder
router.post('/google/folder', async (req, res) => {
  const { userId, name, parentId } = req.body;
  
  const { token, conn } = await getValidToken(req.db, userId, 'google');
  if (!token) {
    return res.status(401).json({ error: 'Not connected', needsAuth: true });
  }
  
  try {
    const targetParent = parentId || conn.appFolderId;
    
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [targetParent]
      })
    });
    
    const folder = await response.json();
    res.json({ success: true, folder });
    
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

module.exports = router;
