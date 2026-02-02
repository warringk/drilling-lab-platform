import { createContext, useContext, useState, useEffect } from 'react'

const UserContext = createContext()

export function UserProvider({ children }) {
  const [user, setUser] = useState({
    name: 'Kurt',
    role: 'founder',
    categories: [
      { id: 'business', name: 'Business Planning', icon: '📊', color: '#4a9eff' },
      { id: 'drilling', name: 'Drilling Analytics', icon: '🛢️', color: '#4ade80' },
      { id: 'dev', name: 'Software Development', icon: '💻', color: '#a78bfa' },
      { id: 'files', name: 'File Storage', icon: '📁', color: '#fbbf24' }
    ],
    recentActivity: [],
    lastConversation: null
  })

  const [chatHistory, setChatHistory] = useState([])
  const [suggestions, setSuggestions] = useState([
    'Check EDR data freshness',
    'Review pending tasks',
    'Pipeline sync status',
    'Weekly analytics report'
  ])

  return (
    <UserContext.Provider value={{ user, setUser, chatHistory, setChatHistory, suggestions, setSuggestions }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
