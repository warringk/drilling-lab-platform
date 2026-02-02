import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { UserProvider } from './contexts/UserContext'
import LandingSelector from './pages/LandingSelector'
import CommandCenter from './pages/landing/CommandCenter'
import ConversationalHub from './pages/landing/ConversationalHub'
import CardDashboard from './pages/landing/CardDashboard'
import Workspace from './pages/Workspace'
import './styles/global.css'

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingSelector />} />
          <Route path="/command-center" element={<CommandCenter />} />
          <Route path="/conversational" element={<ConversationalHub />} />
          <Route path="/cards" element={<CardDashboard />} />
          <Route path="/workspace/:category" element={<Workspace />} />
        </Routes>
      </BrowserRouter>
    </UserProvider>
  )
}
