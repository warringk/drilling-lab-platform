// API utilities for Drilling Lab Platform

const API_BASE = '/api';

// Get current user ID from localStorage
export function getUserId() {
  const userData = localStorage.getItem('user_data');
  if (!userData) return null;
  return JSON.parse(userData).id;
}

// Storage OAuth - redirect to login
export function connectGoogleDrive() {
  const userId = getUserId();
  if (!userId) {
    alert('Please log in first');
    return;
  }
  window.location.href = `${API_BASE}/auth/google/login?userId=${encodeURIComponent(userId)}`;
}

export function connectOneDrive() {
  const userId = getUserId();
  if (!userId) {
    alert('Please log in first');
    return;
  }
  window.location.href = `${API_BASE}/auth/onedrive/login?userId=${encodeURIComponent(userId)}`;
}

// Check storage connection status
export async function checkStorageStatus(provider) {
  const userId = getUserId();
  if (!userId) return { connected: false };
  
  try {
    const res = await fetch(`${API_BASE}/auth/status/${provider}?userId=${encodeURIComponent(userId)}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to check storage status:', e);
    return { connected: false };
  }
}

// List files from storage
export async function listFiles(provider, path = '') {
  const userId = getUserId();
  if (!userId) return { files: [], error: 'Not logged in' };
  
  try {
    const endpoint = provider === 'google' 
      ? `${API_BASE}/storage/google/files?userId=${encodeURIComponent(userId)}&folderId=${encodeURIComponent(path)}`
      : `${API_BASE}/storage/onedrive/files?userId=${encodeURIComponent(userId)}&path=${encodeURIComponent(path)}`;
    
    const res = await fetch(endpoint);
    return await res.json();
  } catch (e) {
    console.error('Failed to list files:', e);
    return { files: [], error: e.message };
  }
}

// Disconnect storage
export async function disconnectStorage(provider) {
  const userId = getUserId();
  if (!userId) return { success: false };
  
  try {
    const res = await fetch(`${API_BASE}/auth/disconnect/${provider}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}
