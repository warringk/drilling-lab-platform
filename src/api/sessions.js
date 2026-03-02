/**
 * Session API client.
 * Handles persistent auth — "stay logged in" across all devices.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class SessionManager {
  constructor() {
    this.token = localStorage.getItem('session_token');
    this.listeners = new Set();
  }

  // ─── AUTH STATE ───────────────────────────

  get isAuthenticated() {
    return !!this.token;
  }

  getToken() {
    return this.token;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    this.listeners.forEach(fn => fn(this.isAuthenticated));
  }

  // ─── API HELPERS ──────────────────────────

  async _fetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      // Token expired — clear and notify
      if (data.code === 'TOKEN_EXPIRED' || data.error === 'Session expired or revoked') {
        this._clearLocal();
        this._notify();
      }
      throw new AuthError(data.error || 'Unauthorized', data.code);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new AuthError(data.error || `HTTP ${res.status}`, data.code);
    }

    return res.json();
  }

  // ─── LOGIN / REGISTER ────────────────────

  /**
   * Login or register. If user exists, just creates session.
   * If new user, needs inviteCode + name.
   */
  async login({ email, name, inviteCode }) {
    const data = await this._fetch('/sessions/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        name,
        inviteCode,
        device: this._detectDevice(),
      }),
    });

    this.token = data.token;
    localStorage.setItem('session_token', data.token);
    localStorage.setItem('session_expires', data.expiresAt);

    // Also store user data locally for fast loads
    if (data.user) {
      localStorage.setItem('user_data', JSON.stringify(data.user));
    }
    if (data.groupConfig) {
      localStorage.setItem('group_config', JSON.stringify(data.groupConfig));
    }

    this._notify();
    return data;
  }

  // ─── SESSION CHECK (app load) ────────────

  /**
   * Check if current session is still valid.
   * Called on app startup — this is the "stay logged in" check.
   * Returns user + groupConfig if valid, null if not.
   */
  async check() {
    if (!this.token) return null;

    // Local-only auto-login tokens — skip server validation, use cached data
    if (this.token.startsWith('auto_')) {
      const cachedUser = localStorage.getItem('user_data');
      if (cachedUser) {
        return { user: JSON.parse(cachedUser), groupConfig: null };
      }
      return null;
    }

    try {
      const data = await this._fetch('/sessions/me');

      // Update local cache
      if (data.user) {
        localStorage.setItem('user_data', JSON.stringify(data.user));
      }
      if (data.groupConfig) {
        localStorage.setItem('group_config', JSON.stringify(data.groupConfig));
      }

      return data;
    } catch (err) {
      if (err instanceof AuthError) {
        this._clearLocal();
        return null;
      }
      // Network error — use cached data
      const cachedUser = localStorage.getItem('user_data');
      const cachedGroup = localStorage.getItem('group_config');
      if (cachedUser) {
        return {
          user: JSON.parse(cachedUser),
          groupConfig: cachedGroup ? JSON.parse(cachedGroup) : null,
          offline: true,
        };
      }
      return null;
    }
  }

  // ─── REFRESH ──────────────────────────────

  /**
   * Refresh the session token (extends expiry).
   * Call periodically (e.g., every 7 days).
   */
  async refresh() {
    if (!this.token) return;

    try {
      const data = await this._fetch('/sessions/refresh', { method: 'POST' });
      this.token = data.token;
      localStorage.setItem('session_token', data.token);
      localStorage.setItem('session_expires', data.expiresAt);
      return data;
    } catch (err) {
      // If refresh fails, session is dead
      if (err instanceof AuthError) {
        this._clearLocal();
        this._notify();
      }
    }
  }

  // ─── LOGOUT ───────────────────────────────

  async logout() {
    try {
      await this._fetch('/sessions/logout', { method: 'POST' });
    } catch (err) {
      // Logout even if server call fails
    }
    this._clearLocal();
    this._notify();
  }

  async logoutAll() {
    try {
      const data = await this._fetch('/sessions/logout-all', { method: 'POST' });
      this._clearLocal();
      this._notify();
      return data;
    } catch (err) {
      this._clearLocal();
      this._notify();
    }
  }

  // ─── DEVICES ──────────────────────────────

  async getDevices() {
    return this._fetch('/sessions/devices');
  }

  async revokeDevice(sessionId) {
    return this._fetch(`/sessions/devices/${sessionId}`, { method: 'DELETE' });
  }

  // ─── PREFERENCES ─────────────────────────

  async updatePreferences(prefs) {
    return this._fetch('/sessions/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    });
  }

  // ─── INTERNAL ─────────────────────────────

  _clearLocal() {
    this.token = null;
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_expires');
    localStorage.removeItem('user_data');
    localStorage.removeItem('group_config');
    localStorage.removeItem('user_memory');
  }

  _detectDevice() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Web';
  }
}

class AuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

// Singleton instance
const sessions = new SessionManager();

// Auto-refresh token every 7 days if active
if (sessions.isAuthenticated) {
  const expires = localStorage.getItem('session_expires');
  if (expires) {
    const daysLeft = (new Date(expires) - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft < 60) {
      // Less than 60 days left, refresh
      sessions.refresh().catch(() => {});
    }
  }
}

export default sessions;
export { AuthError };
