import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import sessions from '../../api/sessions'

export default function Welcome() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const inviteCode = searchParams.get('invite')
  
  const [mode, setMode] = useState('loading') // loading, returning, new, register
  const [existingUser, setExistingUser] = useState(null)
  const [code, setCode] = useState(inviteCode || '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [stayLoggedIn, setStayLoggedIn] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession()
  }, [])

  async function checkExistingSession() {
    // Try server session first (persistent across devices)
    if (sessions.isAuthenticated) {
      const data = await sessions.check()
      if (data && data.user) {
        setExistingUser(data.user)
        setMode('returning')
        return
      }
    }

    // Fall back to localStorage (legacy)
    const userData = localStorage.getItem('user_data')
    if (userData) {
      const user = JSON.parse(userData)
      setExistingUser(user)
      setMode('returning')
    } else if (inviteCode) {
      validateCode(inviteCode)
    } else {
      setMode('new')
    }
  }

  async function validateCode(codeToValidate = code) {
    if (!codeToValidate.trim()) {
      setError('Please enter your invite code')
      return
    }
    setLoading(true)
    setError('')
    
    // Valid codes (server will also validate)
    const validCodes = ['CAITLIN2024', 'KURT2024', 'DRILLINGLAB', 'DEMO', 'CLOUDFLARE']
    
    setTimeout(() => {
      if (validCodes.includes(codeToValidate.toUpperCase())) {
        setCode(codeToValidate.toUpperCase())
        setMode('register')
        setError('')
      } else {
        setError('Invalid invite code')
        setMode('new')
      }
      setLoading(false)
    }, 300)
  }

  async function createAccount() {
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email')
      return
    }
    setLoading(true)
    setError('')

    try {
      // Create account via session API (server-side)
      const data = await sessions.login({
        email: email.trim().toLowerCase(),
        name: name.trim(),
        inviteCode: code,
      })

      // Store stay-logged-in preference
      if (stayLoggedIn) {
        localStorage.setItem('stay_logged_in', 'true')
      }

      navigate('/locker')
    } catch (err) {
      // If server is down, fall back to local-only mode
      if (err.name === 'AuthError') {
        setError(err.message)
        setLoading(false)
        return
      }

      // Offline fallback — create local user
      console.warn('Server unavailable, creating local session:', err)
      const userData = {
        id: email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, ''),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        inviteCode: code,
        createdAt: new Date().toISOString(),
        preferences: { stayLoggedIn, theme: 'dark' },
        workspaces: [
          { id: 'projects', name: 'My Projects', icon: '📋', color: '#4a9eff', pinned: true },
          { id: 'files', name: 'My Files', icon: '📁', color: '#4ade80', pinned: true }
        ],
        storage: { googleDrive: null, oneDrive: null }
      }

      localStorage.setItem('user_data', JSON.stringify(userData))
      localStorage.setItem('user_memory', JSON.stringify({
        context: { currentFocus: 'Getting started with The Drilling Lab', recentTopics: [], activeTasks: [] },
        summary: `${name} just joined The Drilling Lab.`,
        preferences: {}
      }))

      navigate('/locker')
    }
  }

  async function loginExisting() {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter your email')
      return
    }
    setLoading(true)
    setError('')

    try {
      const data = await sessions.login({ email: email.trim().toLowerCase() })
      navigate('/locker')
    } catch (err) {
      if (err.code === 'INVITE_REQUIRED') {
        setError('No account found for this email. Need an invite code to register.')
      } else {
        setError(err.message || 'Login failed')
      }
      setLoading(false)
    }
  }

  function continueAsUser() {
    navigate('/locker')
  }

  function switchUser() {
    sessions.logout()
    setExistingUser(null)
    setMode('new')
  }

  // Loading state
  if (mode === 'loading') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // Returning user - one tap to continue
  if (mode === 'returning' && existingUser) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 className="logo-hemi" style={styles.logo}>drillinglab.ai</h1>
          <p style={styles.subtitle}>Welcome back!</p>
          
          <button onClick={continueAsUser} style={styles.userCard}>
            <div style={styles.avatar}>{(existingUser.name || existingUser.email || '?')[0].toUpperCase()}</div>
            <div style={styles.userInfo}>
              <div style={styles.userName}>{existingUser.name}</div>
              <div style={styles.userEmail}>{existingUser.email}</div>
            </div>
            <span style={styles.arrow}>→</span>
          </button>
          
          <button onClick={switchUser} style={styles.linkButton}>
            Use a different account
          </button>
        </div>
      </div>
    )
  }

  // New user - enter invite code
  if (mode === 'new') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 className="logo-hemi" style={styles.logo}>drillinglab.ai</h1>
          <p style={styles.subtitle}>Your personal workspace awaits</p>
          
          <div style={styles.field}>
            <label style={styles.label}>INVITE CODE</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && validateCode()}
              placeholder="Enter your invite code"
              style={styles.input}
              autoFocus
            />
          </div>
          
          {error && <div style={styles.error}>{error}</div>}
          
          <button onClick={() => validateCode()} disabled={loading} style={styles.primaryButton}>
            {loading ? 'Checking...' : 'Continue'}
          </button>

          <div style={styles.divider}>
            <span style={styles.dividerText}>or</span>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>EXISTING ACCOUNT</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loginExisting()}
              placeholder="your@email.com"
              style={styles.input}
            />
          </div>
          
          <button onClick={loginExisting} disabled={loading} style={styles.secondaryButton}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          
          <p style={styles.helpText}>
            Don't have an invite? <a href="mailto:kurt@drillinglab.ai" style={styles.link}>Request access</a>
          </p>
        </div>
      </div>
    )
  }

  // Register - enter name and email
  if (mode === 'register') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 className="logo-hemi" style={styles.logo}>drillinglab.ai</h1>
          <p style={styles.subtitle}>Your personal workspace awaits</p>
          
          <div style={styles.success}>✓ Invite code accepted</div>
          
          <div style={styles.field}>
            <label style={styles.label}>YOUR NAME</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              style={styles.input}
              autoFocus
            />
          </div>
          
          <div style={styles.field}>
            <label style={styles.label}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createAccount()}
              placeholder="your@email.com"
              style={styles.input}
            />
          </div>

          {/* Stay Logged In toggle */}
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={stayLoggedIn}
              onChange={e => setStayLoggedIn(e.target.checked)}
              style={styles.checkbox}
            />
            <span style={styles.checkboxLabel}>Stay logged in on this device</span>
          </label>
          
          {error && <div style={styles.error}>{error}</div>}
          
          <button onClick={createAccount} disabled={loading} style={styles.primaryButton}>
            {loading ? 'Creating...' : 'Create My Locker'}
          </button>
        </div>
      </div>
    )
  }
  
  return null
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'var(--bg-primary)'
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    background: 'var(--bg-secondary)',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    padding: '32px 28px',
    textAlign: 'center'
  },
  logo: {
    fontSize: '18px',
    fontWeight: 500,
    letterSpacing: '0.02em',
    marginBottom: '8px'
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '14px',
    marginBottom: '24px'
  },
  field: {
    marginBottom: '16px',
    textAlign: 'left'
  },
  label: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '15px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box'
  },
  primaryButton: {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
    fontWeight: 600,
    borderRadius: '10px',
    border: 'none',
    background: 'var(--accent)',
    color: '#000',
    cursor: 'pointer',
    marginTop: '8px'
  },
  secondaryButton: {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
    fontWeight: 500,
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    marginTop: '4px'
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '16px',
    padding: '8px'
  },
  error: {
    color: '#ef4444',
    fontSize: '13px',
    marginBottom: '12px'
  },
  success: {
    padding: '12px',
    background: 'rgba(74, 158, 255, 0.1)',
    borderRadius: '8px',
    fontSize: '13px',
    color: 'var(--accent)',
    marginBottom: '20px'
  },
  helpText: {
    marginTop: '20px',
    fontSize: '13px',
    color: 'var(--text-muted)'
  },
  link: {
    color: 'var(--accent)'
  },
  userCard: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    marginBottom: '8px'
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 600,
    color: '#000',
    flexShrink: 0
  },
  userInfo: {
    flex: 1
  },
  userName: {
    fontWeight: 500,
    fontSize: '15px',
    marginBottom: '2px'
  },
  userEmail: {
    fontSize: '13px',
    color: 'var(--text-muted)'
  },
  arrow: {
    fontSize: '18px',
    color: 'var(--text-muted)'
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '20px 0',
    gap: '12px'
  },
  dividerText: {
    color: 'var(--text-muted)',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    flex: 'none',
    padding: '0 4px',
    width: '100%',
    textAlign: 'center',
    position: 'relative'
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
    cursor: 'pointer',
    textAlign: 'left'
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: 'var(--accent)',
    cursor: 'pointer',
    flexShrink: 0
  },
  checkboxLabel: {
    fontSize: '14px',
    color: 'var(--text-secondary)'
  }
}
