import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { connectGoogleDrive as apiConnectGoogle, connectOneDrive as apiConnectOneDrive, checkStorageStatus, listFiles } from '../utils/api'
import { useDashboard } from '../contexts/DashboardContext'
import DashboardView from './dashboards/DashboardView'
import WidgetBuilder from '../components/widgets/WidgetBuilder'

export default function Locker() {
  const navigate = useNavigate()
  const { dashboards, activeDashboard, setActiveDashboard, createDashboard, addWidget } = useDashboard()
  const [user, setUser] = useState(null)
  const [memory, setMemory] = useState(null)
  const [activeTab, setActiveTabRaw] = useState('home')
  const [tabHistory, setTabHistory] = useState([])
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showNewDashboardInput, setShowNewDashboardInput] = useState(false)
  const [newDashboardName, setNewDashboardName] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [showWidgetBuilder, setShowWidgetBuilder] = useState(false)
  const [widgetPrompt, setWidgetPrompt] = useState('')
  const chatRef = useRef()

  // Tab navigation with history
  const setActiveTab = (tab) => {
    if (tab !== activeTab) {
      setTabHistory(prev => [...prev, activeTab])
      setActiveTabRaw(tab)
    }
  }
  const goBackTab = () => {
    if (tabHistory.length > 0) {
      const prev = tabHistory[tabHistory.length - 1]
      setTabHistory(h => h.slice(0, -1))
      setActiveTabRaw(prev)
    }
  }

  // Close mobile menu when tab changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [activeTab])

  useEffect(() => {
    // Load user data
    const userData = localStorage.getItem('user_data')
    const memoryData = localStorage.getItem('user_memory')

    if (!userData) {
      navigate('/welcome')
      return
    }

    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)
    setMemory(memoryData ? JSON.parse(memoryData) : null)

    // Check for OAuth callback parameters
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const storageConnected = hashParams.get('storage_connected')
    const storageError = hashParams.get('storage_error')

    if (storageConnected) {
      // Refresh storage status from backend
      checkStorageStatus(storageConnected).then(status => {
        if (status.connected) {
          const updated = { ...parsedUser }
          if (storageConnected === 'google') {
            updated.storage = { ...updated.storage, googleDrive: { connected: true, email: status.email, displayName: status.displayName } }
          } else if (storageConnected === 'onedrive') {
            updated.storage = { ...updated.storage, oneDrive: { connected: true, email: status.email, displayName: status.displayName } }
          }
          setUser(updated)
          localStorage.setItem('user_data', JSON.stringify(updated))
          setActiveTab('storage')
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: `✅ ${storageConnected === 'google' ? 'Google Drive' : 'OneDrive'} connected successfully!\n\nYou can now browse your files in the Files tab.`,
            time: new Date()
          }])
        }
      })
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname + window.location.hash.split('?')[0])
    }

    if (storageError) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `❌ Storage connection failed: ${storageError}\n\nPlease try again or contact support if the issue persists.`,
        time: new Date()
      }])
      window.history.replaceState({}, '', window.location.pathname + window.location.hash.split('?')[0])
    }

    // Initial greeting (only if no callback)
    if (!storageConnected && !storageError) {
      setTimeout(() => {
        setMessages([{
          role: 'assistant',
          text: `Welcome to your locker, ${parsedUser.name}! 🎉\n\nThis is your personal space. Let's get you set up:\n\n• Connect your cloud storage (Google Drive or OneDrive)\n• Set up your workspaces\n• Start adding your projects\n\nWhat would you like to do first?`,
          time: new Date()
        }])
      }, 300)
    }
  }, [])

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight)
  }, [messages])

  // Smart response engine
  function generateResponse(msg, userObj) {
    const lower = msg.toLowerCase()

    // Widget/dashboard creation - detect requests for metrics, charts, status displays
    const widgetKeywords = ['widget', 'chart', 'metric', 'graph', 'status', 'show me', 'display', 'kpi', 'rig', 'well', 'rop', 'depth', 'drilling', 'how many', 'total', 'count', 'average']
    const isWidgetRequest = widgetKeywords.some(kw => lower.includes(kw))

    if (isWidgetRequest && (lower.includes('want') || lower.includes('show') || lower.includes('create') || lower.includes('add') || lower.includes('need') || lower.includes('status') || lower.includes('how many'))) {
      // If on a dashboard, open widget builder
      if (activeTab === 'dashboard' && activeDashboard) {
        return {
          text: `📊 I'll help you create that widget!\n\nOpening the widget builder for "${activeDashboard.name}"...`,
          action: () => {
            setWidgetPrompt(msg)
            setShowWidgetBuilder(true)
          }
        }
      }
      // If not on a dashboard, create one first
      return {
        text: "📊 Great idea! To add widgets, you need a dashboard.\n\nLet me create one for you...",
        action: () => {
          const newDash = createDashboard('My Dashboard')
          setActiveTab('dashboard')
          setTimeout(() => {
            setWidgetPrompt(msg)
            setShowWidgetBuilder(true)
          }, 500)
        }
      }
    }

    // Storage related
    if (lower.includes('storage') || lower.includes('drive') || lower.includes('cloud') || lower.includes('onedrive') || lower.includes('google')) {
      const hasStorage = userObj.storage?.googleDrive || userObj.storage?.oneDrive
      if (hasStorage) {
        return {
          text: "You already have storage connected! 🎉\n\nYou can manage your connections in the Storage tab, or I can help you:\n\n• Browse your files\n• Upload something new\n• Create a shared folder",
          action: null
        }
      }
      return {
        text: "Let's connect your cloud storage! ☁️\n\nI'm taking you to the Storage section now. You can connect:\n\n• **Google Drive** - Access your personal or work Google files\n• **OneDrive** - Connect your Microsoft account\n\nClick the Connect button next to whichever you'd like to set up first.",
        action: () => setActiveTab('storage')
      }
    }

    // Projects related
    if (lower.includes('project') || lower.includes('workspace') || lower.includes('create') || lower.includes('new')) {
      return {
        text: "Let's set up a project! 📋\n\nI'm taking you to your Projects area. Here you can:\n\n• Create workspaces to organize your work\n• Add files and documents\n• Track progress on tasks\n\nClick the ➕ card to create your first project.",
        action: () => setActiveTab('projects')
      }
    }

    // Brain/memory related
    if (lower.includes('brain') || lower.includes('memory') || lower.includes('remember') || lower.includes('context') || lower.includes('about me')) {
      return {
        text: "Your Brain is where I learn about you! 🧠\n\nI'm taking you there now. Fill in:\n\n• **About You** - Who you are, what you do, your interests\n• **Current Focus** - What you're working on now\n\nThis helps me give you better, more personalized responses across all our conversations.",
        action: () => setActiveTab('brain')
      }
    }

    // Files related
    if (lower.includes('file') || lower.includes('document') || lower.includes('upload')) {
      const hasStorage = userObj.storage?.googleDrive || userObj.storage?.oneDrive
      if (!hasStorage) {
        return {
          text: "To manage files, you'll need to connect cloud storage first.\n\nWant me to take you to the Storage section to set that up?",
          action: null,
          suggestions: ['Yes, set up storage', 'Tell me more about storage options']
        }
      }
      return {
        text: "Let's look at your files! 📁\n\nI'm taking you to the Files section where you can browse and manage your connected storage.",
        action: () => setActiveTab('files')
      }
    }

    // Settings related
    if (lower.includes('setting') || lower.includes('account') || lower.includes('profile') || lower.includes('sign out') || lower.includes('logout')) {
      return {
        text: "Opening your Settings! ⚙️\n\nHere you can manage your account details and preferences.",
        action: () => setActiveTab('settings')
      }
    }

    // Help/navigation
    if (lower.includes('help') || lower.includes('what can') || lower.includes('how do')) {
      return {
        text: "I can help you with:\n\n• **Storage** - Connect Google Drive or OneDrive\n• **Projects** - Create and organize workspaces\n• **Files** - Browse and manage your documents\n• **Brain** - Set up your personal context so I know you better\n\nJust tell me what you'd like to do, or ask me anything!",
        action: null
      }
    }

    // Home
    if (lower.includes('home') || lower.includes('dashboard') || lower.includes('start')) {
      return {
        text: "Taking you home! 🏠",
        action: () => setActiveTab('home')
      }
    }

    // Default - conversational
    return {
      text: "I'm here to help you get set up and organized! You can ask me to:\n\n• Set up cloud storage\n• Create a new project\n• Configure your brain/memory\n• Navigate anywhere in your locker\n\nWhat would you like to do?",
      action: null
    }
  }

  async function sendMessage() {
    if (!inputValue.trim()) return

    const userMsg = { role: 'user', text: inputValue, time: new Date() }
    setMessages(prev => [...prev, userMsg])
    const msgText = inputValue
    setInputValue('')
    setIsTyping(true)

    // First check local responses (navigation, widget requests)
    const localResponse = generateResponse(msgText, user)

    if (localResponse.text !== "I'm here to help you get set up and organized! You can ask me to:\n\n• Set up cloud storage\n• Create a new project\n• Configure your brain/memory\n• Navigate anywhere in your locker\n\nWhat would you like to do?") {
      // Use local response
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: localResponse.text,
          time: new Date()
        }])
        setIsTyping(false)

        if (localResponse.action) {
          setTimeout(localResponse.action, 800)
        }
      }, 600)
      return
    }

    // Call Grok-powered chat API for intelligent responses
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? ''

      // First get routing context
      let routingContext = {}
      try {
        const routeRes = await fetch(`${API_URL}/api/router/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: msgText,
            channel: 'web',
            channelId: user?.telegramId || 'web-user',
            context: { active_tab: activeTab }
          })
        })
        if (routeRes.ok) {
          const routeData = await routeRes.json()
          routingContext = {
            domain: routeData.routing?.domain,
            entities: routeData.entities
          }
        }
      } catch (e) {
        console.log('Router not available, continuing without context')
      }

      // Call Grok chat API
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          context: {
            activeTab,
            userName: user?.name,
            dashboardName: activeDashboard?.name,
            ...routingContext
          },
          history: messages.slice(-6)
        })
      })

      if (response.ok) {
        const data = await response.json()
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: data.response,
          time: new Date(),
          domain: routingContext.domain
        }])
      } else {
        throw new Error('Chat API error')
      }
    } catch (err) {
      console.error('Chat error:', err)
      // Fallback response
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `I'm having a moment! 🤖 Try asking me to create a widget or navigate somewhere.`,
        time: new Date()
      }])
    }

    setIsTyping(false)
  }

  function connectGoogleDrive() {
    setMessages(prev => [...prev, {
      role: 'assistant',
      text: "🔄 Redirecting you to Google to authorize access...",
      time: new Date()
    }])
    setTimeout(() => apiConnectGoogle(), 500)
  }

  function connectOneDrive() {
    setMessages(prev => [...prev, {
      role: 'assistant',
      text: "🔄 Redirecting you to Microsoft to authorize access...",
      time: new Date()
    }])
    setTimeout(() => apiConnectOneDrive(), 500)
  }

  if (!user) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>

      {/* ===== MOBILE HEADER ===== */}
      <div className="mobile-nav" style={{
        display: 'none',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-secondary)'
      }}>
        <button
          onClick={() => setMobileMenuOpen(true)}
          style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '8px' }}
        >
          ☰
        </button>
        <span style={{ fontWeight: 500, fontSize: '15px' }}>
          {activeTab === 'home' && '🏠 Home'}
          {activeTab === 'projects' && '📋 Projects'}
          {activeTab === 'files' && '📁 Files'}
          {activeTab === 'storage' && '☁️ Storage'}
          {activeTab === 'brain' && '🧠 Brain'}
          {activeTab === 'dashboard' && '📊 Dashboard'}
          {activeTab === 'pipeline' && '📊 Pipeline'}
          {activeTab === 'settings' && '⚙️ Settings'}
        </span>
        <button
          onClick={() => setMobileChatOpen(true)}
          style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '8px' }}
        >
          💬
        </button>
      </div>

      {/* ===== MOBILE MENU OVERLAY ===== */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 200
        }} onClick={() => setMobileMenuOpen(false)}>
          <div
            style={{
              width: '280px',
              height: '100%',
              background: 'var(--bg-secondary)',
              padding: '20px 0',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Mobile menu content - same as sidebar */}
            <div style={{ padding: '0 16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px', height: '44px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', fontWeight: 600, color: '#000'
                }}>
                  {user.name[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '15px' }}>{user.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Your Locker</div>
                </div>
              </div>
            </div>
            <MobileNavItems
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              user={user}
              dashboards={dashboards}
              activeDashboard={activeDashboard}
              setActiveDashboard={setActiveDashboard}
              createDashboard={createDashboard}
            />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ===== DESKTOP SIDEBAR ===== */}
      <div className="desktop-sidebar" style={{
        width: '220px',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        {/* User Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', fontWeight: 600, color: '#000'
            }}>
              {user.name[0]}
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: '14px' }}>{user.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Your Locker</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          <NavItem
            icon="🏠"
            label="Home"
            active={activeTab === 'home'}
            onClick={() => setActiveTab('home')}
          />
          <NavItem
            icon="📋"
            label="My Projects"
            active={activeTab === 'projects'}
            onClick={() => setActiveTab('projects')}
          />

          {/* Dashboards Section */}
          <div style={{ marginTop: '8px', marginBottom: '4px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 12px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              <span>Dashboards</span>
              <button
                onClick={() => setShowNewDashboardInput(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0 4px'
                }}
                title="New Dashboard"
              >
                +
              </button>
            </div>

            {showNewDashboardInput && (
              <div style={{ padding: '4px 12px' }}>
                <input
                  autoFocus
                  value={newDashboardName}
                  onChange={e => setNewDashboardName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newDashboardName.trim()) {
                      createDashboard(newDashboardName.trim())
                      setNewDashboardName('')
                      setShowNewDashboardInput(false)
                      setActiveTab('dashboard')
                    }
                    if (e.key === 'Escape') {
                      setShowNewDashboardInput(false)
                      setNewDashboardName('')
                    }
                  }}
                  onBlur={() => {
                    if (!newDashboardName.trim()) {
                      setShowNewDashboardInput(false)
                    }
                  }}
                  placeholder="Dashboard name..."
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)'
                  }}
                />
              </div>
            )}

            {dashboards.map(dash => (
              <NavItem
                key={dash.id}
                icon="📊"
                label={dash.name}
                active={activeTab === 'dashboard' && activeDashboard?.id === dash.id}
                onClick={() => {
                  setActiveDashboard(dash)
                  setActiveTab('dashboard')
                }}
                indent
              />
            ))}

            {dashboards.length === 0 && !showNewDashboardInput && (
              <div style={{
                padding: '8px 12px 8px 24px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                fontStyle: 'italic'
              }}>
                No dashboards yet
              </div>
            )}
          </div>

          <NavItem
            icon="📁"
            label="My Files"
            active={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
          />
          <NavItem
            icon="☁️"
            label="Storage"
            active={activeTab === 'storage'}
            onClick={() => setActiveTab('storage')}
            badge={!user.storage?.googleDrive && !user.storage?.oneDrive ? '!' : null}
          />
          <NavItem
            icon="🧠"
            label="My Brain"
            active={activeTab === 'brain'}
            onClick={() => setActiveTab('brain')}
          />
          <NavItem
            icon="📊"
            label="Historical Pipeline"
            active={activeTab === 'pipeline'}
            onClick={() => setActiveTab('pipeline')}
          />
          <NavItem
            icon="🎯"
            label="Project Board"
            active={false}
            onClick={() => navigate('/projects')}
          />
          <NavItem
            icon="🤖"
            label="AI Intelligence"
            active={false}
            onClick={() => navigate('/ai-intelligence')}
          />
          <NavItem
            icon="💬"
            label="Web Chat"
            active={false}
            onClick={() => navigate('/chat')}
          />
          <NavItem
            icon="🏷️"
            label="EDR Tagger"
            active={false}
            onClick={() => navigate('/edr-tagger')}
          />
          <NavItem
            icon="📊"
            label="Charts"
            active={false}
            onClick={() => navigate('/charts')}
          />
          <NavItem
            icon="💰"
            label="Mud Analysis"
            active={false}
            onClick={() => navigate('/mud-analysis')}
          />
          <NavItem
            icon="📡"
            label="Live Stream"
            active={false}
            onClick={() => navigate('/live-stream')}
          />
          <NavItem 
            icon="🗺️"
            label="Schema Map"
            active={false}
            onClick={() => navigate('/schema-map')}
          />
          <NavItem 
            icon="📊"
            label="Rig State Test"
            active={false}
            onClick={() => navigate('/rig-state-test')}
          />
          
          <div style={{ margin: '12px 4px', borderTop: '1px solid var(--border)' }} />

          <NavItem
            icon="⚙️"
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          />
        </nav>

        {/* Bottom */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <div className="logo-hemi" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            drillinglab.ai
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <header style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ fontSize: '16px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeTab !== 'home' && (
              <button
                onClick={goBackTab}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => e.target.style.background = 'var(--bg-secondary)'}
                onMouseLeave={e => e.target.style.background = 'none'}
                title="Back"
              >
                ←
              </button>
            )}
            <span>
              {activeTab === 'home' && '🏠'}
              {activeTab === 'projects' && '📋'}
              {activeTab === 'files' && '📁'}
              {activeTab === 'storage' && '☁️'}
              {activeTab === 'brain' && '🧠'}
              {activeTab === 'pipeline' && '📊'}
              {activeTab === 'settings' && '⚙️'}
            </span>
            <span>
              {activeTab === 'home' && 'Home'}
              {activeTab === 'projects' && 'My Projects'}
              {activeTab === 'files' && 'My Files'}
              {activeTab === 'storage' && 'Cloud Storage'}
              {activeTab === 'brain' && 'My Brain'}
              {activeTab === 'pipeline' && 'Historical Pipeline'}
              {activeTab === 'settings' && 'Settings'}
            </span>
          </h1>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
        </header>

        {/* Content Area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Main Panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

            {activeTab === 'home' && (
              <div>
                {/* Welcome Banner */}
                <div style={{
                  padding: '24px',
                  background: 'linear-gradient(135deg, rgba(74, 158, 255, 0.1), rgba(167, 139, 250, 0.1))',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  marginBottom: '24px'
                }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>
                    Welcome back, {user.name}! 👋
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    {memory?.context?.currentFocus
                      ? `You're working on: ${memory.context.currentFocus}`
                      : "Let's get your locker set up."
                    }
                  </p>
                </div>

                {/* Setup Checklist */}
                <div style={{
                  padding: '20px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  marginBottom: '24px'
                }}>
                  <h3 style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Getting Started
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <SetupItem
                      done={!!user.storage?.googleDrive || !!user.storage?.oneDrive}
                      label="Connect cloud storage"
                      onClick={() => setActiveTab('storage')}
                    />
                    <SetupItem
                      done={user.workspaces?.length > 2}
                      label="Create your first project"
                      onClick={() => setActiveTab('projects')}
                    />
                    <SetupItem
                      done={!!memory?.summary && memory.summary.length > 50}
                      label="Set up your brain (context memory)"
                      onClick={() => setActiveTab('brain')}
                    />
                  </div>
                </div>

                {/* Quick Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <StatCard
                    icon="📋"
                    value={user.workspaces?.length || 0}
                    label="Workspaces"
                    onClick={() => setActiveTab('projects')}
                  />
                  <StatCard
                    icon="☁️"
                    value={(user.storage?.googleDrive ? 1 : 0) + (user.storage?.oneDrive ? 1 : 0)}
                    label="Storage Connected"
                    onClick={() => setActiveTab('storage')}
                  />
                  <StatCard
                    icon="💬"
                    value={messages.length}
                    label="Messages"
                  />
                </div>
              </div>
            )}

            {activeTab === 'storage' && (
              <div style={{ maxWidth: '600px' }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
                  Connect your cloud storage to access and manage your files directly from your locker.
                </p>

                {/* Google Drive */}
                <StorageCard
                  icon="📁"
                  iconBg="linear-gradient(135deg, #4285f4, #34a853)"
                  name="Google Drive"
                  description={user.storage?.googleDrive?.connected
                    ? `Connected as ${user.storage.googleDrive.email}`
                    : 'Access your Google Drive files'
                  }
                  connected={user.storage?.googleDrive?.connected}
                  onConnect={connectGoogleDrive}
                />

                {/* OneDrive */}
                <StorageCard
                  icon="☁️"
                  iconBg="linear-gradient(135deg, #0078d4, #00bcf2)"
                  name="OneDrive"
                  description={user.storage?.oneDrive?.connected
                    ? `Connected as ${user.storage.oneDrive.email}`
                    : 'Access your Microsoft OneDrive files'
                  }
                  connected={user.storage?.oneDrive?.connected}
                  onConnect={connectOneDrive}
                />
              </div>
            )}

            {activeTab === 'projects' && (
              <div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
                  Your projects live here. Create workspaces to organize your work.
                </p>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '16px'
                }}>
                  {/* Historical Pipeline - Fixed Project */}
                  <WorkspaceCard
                    workspace={{
                      id: 'pipeline-monitor',
                      icon: '📊',
                      name: 'Historical Pipeline',
                      color: '#4ade80',
                      tab: 'pipeline'
                    }}
                    onNavigate={setActiveTab}
                  />

                  {user.workspaces?.map(ws => (
                    <WorkspaceCard key={ws.id} workspace={ws} />
                  ))}

                  <button
                    style={{
                      padding: '24px 20px',
                      background: 'transparent',
                      borderRadius: '12px',
                      border: '2px dashed var(--border)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.color = 'var(--accent)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.color = 'var(--text-muted)'
                    }}
                  >
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>➕</div>
                    <div style={{ fontSize: '13px' }}>New Project</div>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'brain' && (
              <div style={{ maxWidth: '600px' }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
                  Your brain stores context about you, your projects, and your preferences.
                  This helps the AI remember you across all conversations.
                </p>

                <div style={{
                  padding: '20px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  marginBottom: '16px'
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    About You
                  </label>
                  <textarea
                    defaultValue={memory?.summary || ''}
                    placeholder="Tell the AI about yourself, your role, your interests, what you're working on..."
                    onChange={e => {
                      const updated = { ...memory, summary: e.target.value }
                      setMemory(updated)
                      localStorage.setItem('user_memory', JSON.stringify(updated))
                    }}
                    style={{
                      width: '100%',
                      minHeight: '120px',
                      padding: '12px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      resize: 'vertical',
                      lineHeight: 1.5
                    }}
                  />
                </div>

                <div style={{
                  padding: '20px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)'
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Current Focus
                  </label>
                  <input
                    defaultValue={memory?.context?.currentFocus || ''}
                    placeholder="What are you working on right now?"
                    onChange={e => {
                      const updated = {
                        ...memory,
                        context: { ...memory?.context, currentFocus: e.target.value }
                      }
                      setMemory(updated)
                      localStorage.setItem('user_memory', JSON.stringify(updated))
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'files' && (
              <FileBrowser user={user} />
            )}

            {activeTab === 'pipeline' && (
              <PipelineMonitor />
            )}

            {activeTab === 'settings' && (
              <div style={{ maxWidth: '500px' }}>
                <div style={{
                  padding: '20px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Account
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                    <div style={{
                      width: '56px', height: '56px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '22px', fontWeight: 600, color: '#000'
                    }}>
                      {user.name[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: '4px' }}>{user.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    localStorage.clear()
                    navigate('/welcome')
                  }}
                  style={{
                    padding: '10px 20px',
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Sign Out
                </button>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <DashboardView />
            )}
          </div>

          {/* Chat Panel */}
          <div
            className={`chat-panel ${mobileChatOpen ? 'mobile-open' : ''}`}
            style={{
              width: '320px',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-secondary)'
            }}
          >
            {/* Mobile close button */}
            {mobileChatOpen && (
              <button
                onClick={() => setMobileChatOpen(false)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  zIndex: 10
                }}
              >
                ✕ Close
              </button>
            )}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{
                width: '8px', height: '8px',
                borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 8px #4ade80'
              }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>AI Assistant</span>
            </div>

            <div ref={chatRef} style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {messages.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%'
                }}>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-primary)',
                    color: msg.role === 'user' ? '#000' : 'var(--text-primary)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div style={{
                  alignSelf: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: '14px 14px 14px 4px',
                  background: 'var(--bg-primary)',
                  fontSize: '13px',
                  color: 'var(--text-muted)'
                }}>
                  typing...
                </div>
              )}
            </div>

            <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Ask anything..."
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)'
                  }}
                />
                <button
                  onClick={sendMessage}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#000',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ↑
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Widget Builder Modal */}
      {showWidgetBuilder && (
        <WidgetBuilder
          initialPrompt={widgetPrompt}
          onClose={() => {
            setShowWidgetBuilder(false)
            setWidgetPrompt('')
          }}
        />
      )}
    </div>
  )
}

// ===== MOBILE NAV ITEMS =====
function MobileNavItems({ activeTab, setActiveTab, user, dashboards, activeDashboard, setActiveDashboard, createDashboard }) {
  const [showNewDash, setShowNewDash] = useState(false)
  const [newName, setNewName] = useState('')

  return (
    <nav style={{ padding: '12px' }}>
      <MobileNavItem icon="🏠" label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
      <MobileNavItem icon="📋" label="My Projects" active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />

      <div style={{ padding: '16px 12px 8px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        Dashboards
        <button onClick={() => setShowNewDash(true)} style={{ float: 'right', background: 'none', border: 'none', color: 'var(--text-muted)' }}>+</button>
      </div>
      {showNewDash && (
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newName.trim()) {
              createDashboard(newName.trim())
              setNewName('')
              setShowNewDash(false)
              setActiveTab('dashboard')
            }
            if (e.key === 'Escape') setShowNewDash(false)
          }}
          placeholder="Dashboard name..."
          style={{ width: '100%', padding: '8px', margin: '4px 0', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: '13px' }}
        />
      )}
      {dashboards.map(d => (
        <MobileNavItem
          key={d.id}
          icon="📊"
          label={d.name}
          active={activeTab === 'dashboard' && activeDashboard?.id === d.id}
          onClick={() => { setActiveDashboard(d); setActiveTab('dashboard') }}
          indent
        />
      ))}

      <MobileNavItem icon="📁" label="My Files" active={activeTab === 'files'} onClick={() => setActiveTab('files')} />
      <MobileNavItem icon="☁️" label="Storage" active={activeTab === 'storage'} onClick={() => setActiveTab('storage')} badge={!user.storage?.googleDrive && !user.storage?.oneDrive ? '!' : null} />
      <MobileNavItem icon="🧠" label="My Brain" active={activeTab === 'brain'} onClick={() => setActiveTab('brain')} />
      <MobileNavItem icon="📊" label="Historical Pipeline" active={activeTab === 'pipeline'} onClick={() => setActiveTab('pipeline')} />
      <MobileNavItem icon="🎯" label="Project Board" active={false} onClick={() => navigate('/projects')} />
      <MobileNavItem icon="🧠" label="AI Intelligence" active={false} onClick={() => navigate('/ai-intelligence')} />
      <MobileNavItem icon="💬" label="Web Chat" active={false} onClick={() => navigate('/chat')} />
      <MobileNavItem icon="🏷️" label="EDR Tagger" active={false} onClick={() => navigate('/edr-tagger')} />
      <MobileNavItem icon="💰" label="Mud Analysis" active={false} onClick={() => navigate('/mud-analysis')} />
      <MobileNavItem icon="📡" label="Live Stream" active={false} onClick={() => navigate('/live-stream')} />
      <MobileNavItem icon="📊" label="Charts" active={false} onClick={() => navigate('/charts')} />
      <MobileNavItem icon="🗺️" label="Schema Map" active={false} onClick={() => navigate('/schema-map')} />

      <div style={{ margin: '12px', borderTop: '1px solid var(--border)' }} />
      <MobileNavItem icon="⚙️" label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
    </nav>
  )
}

function MobileNavItem({ icon, label, active, onClick, badge, indent }) {
  return (
    <button onClick={onClick} style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: indent ? '12px 12px 12px 32px' : '12px',
      background: active ? 'var(--bg-primary)' : 'transparent',
      border: 'none',
      borderRadius: '8px',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      cursor: 'pointer',
      fontSize: '14px',
      marginBottom: '2px'
    }}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
      {badge && <span style={{ background: '#f97316', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>{badge}</span>}
    </button>
  )
}

// ===== HELPER COMPONENTS =====

function NavItem({ icon, label, active, onClick, badge, indent }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: indent ? '8px 12px 8px 24px' : '10px 12px',
        marginBottom: '2px',
        background: active ? 'var(--bg-primary)' : 'transparent',
        border: 'none',
        borderRadius: '8px',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: indent ? '12px' : '13px',
        transition: 'all 0.1s'
      }}
    >
      <span style={{ fontSize: '15px' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          width: '18px', height: '18px',
          background: '#f97316',
          borderRadius: '50%',
          fontSize: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 600
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}

function SetupItem({ done, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        background: 'var(--bg-primary)',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'all 0.1s'
      }}
    >
      <span style={{
        fontSize: '14px',
        color: done ? '#4ade80' : 'var(--text-muted)'
      }}>
        {done ? '✓' : '○'}
      </span>
      <span style={{
        color: done ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: done ? 'line-through' : 'none',
        fontSize: '13px'
      }}>
        {label}
      </span>
      <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '12px' }}>→</span>
    </button>
  )
}

function StatCard({ icon, value, label, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '20px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s'
      }}
    >
      <div style={{ fontSize: '20px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function StorageCard({ icon, iconBg, name, description, connected, onConnect }) {
  return (
    <div style={{
      padding: '20px',
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      marginBottom: '12px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '44px', height: '44px',
          borderRadius: '10px',
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px'
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontWeight: 500, marginBottom: '2px', fontSize: '14px' }}>{name}</div>
          <div style={{ fontSize: '12px', color: connected ? '#4ade80' : 'var(--text-muted)' }}>
            {connected ? '✓ ' : ''}{description}
          </div>
        </div>
      </div>
      <button
        onClick={onConnect}
        style={{
          padding: '8px 16px',
          background: connected ? 'transparent' : 'var(--accent)',
          border: connected ? '1px solid var(--border)' : 'none',
          borderRadius: '8px',
          color: connected ? 'var(--text-secondary)' : '#000',
          fontWeight: 500,
          cursor: 'pointer',
          fontSize: '13px'
        }}
      >
        {connected ? 'Manage' : 'Connect'}
      </button>
    </div>
  )
}

function WorkspaceCard({ workspace, onNavigate }) {
  const handleClick = () => {
    if (workspace.tab && onNavigate) {
      onNavigate(workspace.tab);
    } else if (workspace.url) {
      window.location.href = workspace.url;
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '20px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'all 0.15s'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = workspace.color || 'var(--accent)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div style={{ fontSize: '28px', marginBottom: '12px' }}>{workspace.icon}</div>
      <div style={{ fontWeight: 500, marginBottom: '4px', fontSize: '14px' }}>{workspace.name}</div>
      <div style={{ fontSize: '11px', color: workspace.url ? '#4ade80' : 'var(--text-muted)' }}>
        {workspace.url ? '● Live' : '0 items'}
      </div>
    </div>
  )
}

function FileFolder({ icon, name, color }) {
  return (
    <div style={{
      padding: '16px',
      background: 'var(--bg-secondary)',
      borderRadius: '10px',
      border: '1px solid var(--border)',
      cursor: 'pointer',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '12px', fontWeight: 500 }}>{name}</div>
    </div>
  )
}

// File Browser Component with folder navigation
function FileBrowser({ user }) {
  const [provider, setProvider] = useState(null) // 'google' | 'onedrive' | null
  const [files, setFiles] = useState([])
  const [path, setPath] = useState([]) // breadcrumb path
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function openProvider(p) {
    setProvider(p)
    // Show full path including app folder location
    const basePath = p === 'google'
      ? 'Google Drive / Drilling Lab'
      : 'OneDrive / Apps / Drilling Lab'
    setPath([{ id: '', name: basePath }])
    await loadFiles(p, '')
  }

  async function loadFiles(p, folderId) {
    setLoading(true)
    setError(null)
    try {
      const result = await listFiles(p, folderId)
      if (result.error) {
        setError(result.error)
        setFiles([])
      } else {
        setFiles(result.files || [])
      }
    } catch (e) {
      setError(e.message)
      setFiles([])
    }
    setLoading(false)
  }

  async function openFolder(folder) {
    setPath([...path, { id: folder.id, name: folder.name }])
    await loadFiles(provider, folder.id)
  }

  async function navigateTo(index) {
    const newPath = path.slice(0, index + 1)
    setPath(newPath)
    await loadFiles(provider, newPath[newPath.length - 1].id)
  }

  function goBack() {
    if (path.length <= 1) {
      setProvider(null)
      setFiles([])
      setPath([])
    } else {
      navigateTo(path.length - 2)
    }
  }

  // Storage selection view
  if (!provider) {
    if (!user.storage?.googleDrive && !user.storage?.oneDrive) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
          <p>Connect cloud storage to see your files here</p>
        </div>
      )
    }

    return (
      <div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
          Select a storage provider to browse files.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
          {user.storage?.googleDrive && (
            <button
              onClick={() => openProvider('google')}
              style={{
                padding: '24px',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📁</div>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Google Drive</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {user.storage.googleDrive.email || 'Connected'}
              </div>
            </button>
          )}
          {user.storage?.oneDrive && (
            <button
              onClick={() => openProvider('onedrive')}
              style={{
                padding: '24px',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>☁️</div>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>OneDrive</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {user.storage.oneDrive.email || 'Connected'}
              </div>
            </button>
          )}
        </div>
      </div>
    )
  }

  // File browser view
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={goBack}
          style={{
            padding: '6px 12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontSize: '13px'
          }}
        >
          ← Back
        </button>
        {path.map((p, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {i > 0 && <span style={{ color: 'var(--text-muted)' }}>/</span>}
            <button
              onClick={() => navigateTo(i)}
              style={{
                background: 'none',
                border: 'none',
                color: i === path.length - 1 ? 'var(--text-primary)' : 'var(--accent)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: i === path.length - 1 ? 500 : 400
              }}
            >
              {p.name}
            </button>
          </span>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Loading files...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '20px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Files grid */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
          {files.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              This folder is empty
            </div>
          ) : (
            files.map(file => (
              <div
                key={file.id}
                onClick={() => file.type === 'folder' ? openFolder(file) : window.open(file.webUrl, '_blank')}
                style={{
                  padding: '16px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>
                  {file.type === 'folder' ? '📁' : getFileIcon(file.mimeType)}
                </div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {file.name}
                </div>
                {file.size && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {formatFileSize(file.size)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function getFileIcon(mimeType) {
  if (!mimeType) return '📄'
  if (mimeType.includes('image')) return '🖼️'
  if (mimeType.includes('video')) return '🎬'
  if (mimeType.includes('audio')) return '🎵'
  if (mimeType.includes('pdf')) return '📕'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('document') || mimeType.includes('word')) return '📝'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️'
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️'
  return '📄'
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

// Historical Pipeline Component
function PipelineMonitor() {
  const API_BASE = import.meta.env.VITE_API_URL ?? ''
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/stats`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      setStats(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  async function handleStart() {
    if (!confirm('Start the ingestion pipeline?')) return
    setActionLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rigs: '142 148 570 26 571' })
      })
      const data = await res.json()
      if (data.success) fetchStats()
      else alert('Failed: ' + data.error)
    } catch (e) {
      alert('Error: ' + e.message)
    }
    setActionLoading(false)
  }

  async function handleStop() {
    if (!confirm('Stop the ingestion pipeline?')) return
    setActionLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/stop`, { method: 'POST' })
      const data = await res.json()
      if (data.success) fetchStats()
      else alert('Failed: ' + data.error)
    } catch (e) {
      alert('Error: ' + e.message)
    }
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        Loading historical pipeline status...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444' }}>
        Error: {error}
      </div>
    )
  }

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
        Historical EDR backfill status. Tracking data ingestion for Whitecap wells.
      </p>

      {/* Summary Stats - Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
        <div style={{
          padding: '20px',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '28px', fontWeight: 600, color: '#4ade80' }}>
            {stats?.validRecords?.toLocaleString() || stats?.totalRecords?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Valid EDR Records</div>
        </div>
        <div style={{
          padding: '20px',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--accent)' }}>
            {stats?.wellsWithData || 0}<span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>/{stats?.totalWells || 0}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Wells with Data</div>
        </div>
        <div style={{
          padding: '20px',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '28px', fontWeight: 600, color: '#a78bfa' }}>
            {stats?.wellsFullyIngested || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Wells Fully Ingested</div>
        </div>
        <div style={{
          padding: '20px',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '28px', fontWeight: 600 }}>
            {stats?.totalHours?.toFixed(0) || 0}<span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>h</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Hours of Data</div>
        </div>
      </div>

      {/* Ingestion Queue Status */}
      <div style={{
        padding: '20px',
        background: stats?.ingestionRunning ? 'rgba(74, 222, 128, 0.1)' : 'var(--bg-secondary)',
        borderRadius: '12px',
        border: stats?.ingestionRunning ? '1px solid #4ade80' : '1px solid var(--border)',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Ingestion Queue
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {stats?.ingestionRunning ? (
              <>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#4ade80'
                }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#4ade80',
                    animation: 'pulse 2s infinite'
                  }} />
                  Running
                </span>
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(248, 113, 113, 0.15)',
                    border: '1px solid #f87171',
                    borderRadius: '6px',
                    color: '#f87171',
                    fontSize: '12px',
                    cursor: actionLoading ? 'wait' : 'pointer'
                  }}
                >
                  ⏹️ Stop
                </button>
              </>
            ) : (
              <button
                onClick={handleStart}
                disabled={actionLoading}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(74, 222, 128, 0.15)',
                  border: '1px solid #4ade80',
                  borderRadius: '6px',
                  color: '#4ade80',
                  fontSize: '12px',
                  cursor: actionLoading ? 'wait' : 'pointer'
                }}
              >
                ▶️ Start Pipeline
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#4ade80' }}>{stats?.queue?.complete || 0}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Complete</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#f59e0b' }}>{stats?.queue?.in_progress || 0}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>In Progress</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--accent)' }}>{stats?.queue?.queued || 0}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Queued</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-muted)' }}>{stats?.queue?.pending || 0}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pending</div>
          </div>
        </div>
      </div>

      {/* By Rig */}
      <div style={{
        padding: '20px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        marginBottom: '16px'
      }}>
        <h3 style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Data by Rig
        </h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {stats?.byRig?.map(rig => (
            <div key={rig.rig} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px',
              background: 'var(--bg-primary)',
              borderRadius: '8px'
            }}>
              <div>
                <span style={{ fontWeight: 500 }}>Rig {rig.rig}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontSize: '13px' }}>
                  {rig.wellsWithData || 0}/{rig.wells} wells
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 500, color: rig.records > 0 ? '#4ade80' : 'var(--text-muted)' }}>
                  {rig.records?.toLocaleString() || 0}
                </span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '13px' }}>
                  records
                </span>
              </div>
            </div>
          )) || (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
              No rig data available
            </div>
          )}
        </div>
      </div>

      {/* Wells Detail */}
      {stats?.wellData?.length > 0 && (
        <div style={{
          padding: '20px',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          marginBottom: '16px'
        }}>
          <h3 style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Wells with Data (Top 20)
          </h3>
          <div style={{ display: 'grid', gap: '6px' }}>
            {stats.wellData.map(well => (
              <div key={well.licence} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                background: 'var(--bg-primary)',
                borderRadius: '6px',
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: well.records > 100000 ? '#4ade80' : well.records > 10000 ? '#f59e0b' : '#ef4444'
                  }} />
                  <span style={{ fontWeight: 500 }}>{well.licence}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Rig {well.rig}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 500 }}>{well.records?.toLocaleString()}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>({well.hours}h)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Sync */}
      <div style={{
        padding: '16px 20px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Last updated: </span>
          <span style={{ fontSize: '13px' }}>{stats?.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : 'Unknown'}</span>
        </div>
        <button
          onClick={fetchStats}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
