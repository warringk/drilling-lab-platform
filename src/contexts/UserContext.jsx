import { createContext, useContext, useState, useEffect } from 'react'
import sessions from '../api/sessions'

const UserContext = createContext()

// Default user structure - will be loaded from memory/API
const defaultUser = {
  id: 'kurt',
  name: 'Kurt',
  role: 'founder',
  
  // Workspaces (categories) - user customizable
  workspaces: [
    { id: 'business', name: 'Business Planning', icon: '📊', color: '#4a9eff', pinned: true },
    { id: 'drilling', name: 'Drilling Analytics', icon: '🛢️', color: '#4ade80', pinned: true },
    { id: 'dev', name: 'Software Development', icon: '💻', color: '#a78bfa', pinned: true },
    { id: 'files', name: 'Files & Docs', icon: '📁', color: '#fbbf24', pinned: false }
  ],
  
  // Layout preferences
  layout: {
    chatPosition: 'right', // 'right' | 'bottom' | 'floating'
    primaryWidgets: ['activity', 'stats', 'tasks'],
    workspaceOrder: ['business', 'drilling', 'dev', 'files']
  }
}

// Memory structure
const defaultMemory = {
  context: {
    currentFocus: 'Building the Drilling Lab platform',
    recentTopics: ['Card Dashboard UI', 'Memory architecture', 'Telegram integration'],
    activeTasks: [
      { id: 1, title: 'Refine dashboard layout', status: 'in_progress' },
      { id: 2, title: 'Wire up MongoDB data', status: 'pending' },
      { id: 3, title: 'Connect chat to Telegram', status: 'pending' }
    ],
    lastInteraction: new Date().toISOString()
  },
  summary: 'Kurt is the founder of Drilling Lab, building an AI-powered drilling analytics platform. Currently focused on the web dashboard with React, integrating with existing Telegram bot infrastructure.',
  preferences: {
    responseStyle: 'concise',
    technicalLevel: 'high',
    timezone: 'America/Edmonton'
  }
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(defaultUser)
  const [memory, setMemory] = useState(defaultMemory)
  const [chatHistory, setChatHistory] = useState([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load user data and memory on mount
  useEffect(() => {
    loadUserData()
  }, [])

  async function loadUserData() {
    try {
      // Try server session first (stay logged in across devices)
      if (sessions.isAuthenticated) {
        const sessionData = await sessions.check()
        if (sessionData && sessionData.user) {
          setUser({ ...defaultUser, ...sessionData.user })
          // Store group config for route gating
          if (sessionData.groupConfig) {
            setUser(prev => ({ ...prev, groupConfig: sessionData.groupConfig }))
          }
          
          const savedMemory = localStorage.getItem('user_memory')
          if (savedMemory) setMemory(JSON.parse(savedMemory))
          
          setIsLoaded(true)
          return
        }
      }

      // Fall back to localStorage
      const savedUser = localStorage.getItem('user_data')
      const savedMemory = localStorage.getItem('user_memory')
      
      if (savedUser) setUser({ ...defaultUser, ...JSON.parse(savedUser) })
      if (savedMemory) setMemory(JSON.parse(savedMemory))
      
      setIsLoaded(true)
    } catch (e) {
      console.log('Using default user data')
      // Try localStorage as final fallback
      const savedUser = localStorage.getItem('user_data')
      if (savedUser) setUser({ ...defaultUser, ...JSON.parse(savedUser) })
      setIsLoaded(true)
    }
  }

  function updateUser(updates) {
    const updated = { ...user, ...updates }
    setUser(updated)
    localStorage.setItem('user_data', JSON.stringify(updated))
  }

  function updateMemory(updates) {
    const updated = { 
      ...memory, 
      context: { ...memory.context, ...updates.context },
      ...updates 
    }
    setMemory(updated)
    localStorage.setItem('user_memory', JSON.stringify(updated))
  }

  function addChatMessage(role, text) {
    setChatHistory(prev => [...prev, { 
      role, 
      text, 
      time: new Date(),
      channel: 'web'
    }])
  }

  // Generate contextual suggestions based on memory
  function getSuggestions() {
    const suggestions = []
    
    // Based on active tasks
    if (memory.context.activeTasks?.length) {
      suggestions.push(`Update on: ${memory.context.activeTasks[0].title}`)
    }
    
    // Based on current focus
    if (memory.context.currentFocus) {
      suggestions.push(`Continue: ${memory.context.currentFocus.slice(0, 30)}...`)
    }
    
    // Default suggestions
    suggestions.push('Check system status')
    suggestions.push('Review recent activity')
    
    return suggestions.slice(0, 4)
  }

  return (
    <UserContext.Provider value={{ 
      user, 
      setUser: updateUser,
      memory,
      updateMemory,
      chatHistory,
      addChatMessage,
      suggestions: getSuggestions(),
      isLoaded
    }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
