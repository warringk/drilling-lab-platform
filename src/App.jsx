import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider } from './contexts/UserContext'
import { DashboardProvider } from './contexts/DashboardContext'
import LandingSelector from './pages/LandingSelector'
import CommandCenter from './pages/landing/CommandCenter'
import ConversationalHub from './pages/landing/ConversationalHub'
import CardDashboard from './pages/landing/CardDashboard'
import Workspace from './pages/Workspace'
import Welcome from './pages/auth/Welcome'
import Locker from './pages/Locker'
import Projects from './pages/Projects'
import Pipeline from './pages/Pipeline'
import Memory from './pages/Memory'
import AIIntelligence from './pages/AIIntelligence'
import WebChat from './pages/WebChat'
import EDRTagger from './pages/EDRTagger'
import SchemaMap from './pages/SchemaMap'
import LiveStream from './pages/LiveStream'
// import Charts from './pages/Charts' - removed
import RigStateTest from './pages/RigStateTest'
import MudAnalysisSimple from './pages/dashboards/MudAnalysisSimple'
import sessions from './api/sessions'
import './styles/global.css'

function ProtectedRoute({ children }) {
  // Check session token first (persistent), then fallback to localStorage
  const hasSession = sessions.isAuthenticated
  const userData = localStorage.getItem('user_data')
  if (!hasSession && !userData) {
    return <Navigate to="/welcome" replace />
  }
  return children
}

export default function App() {
  return (
    <UserProvider>
      <DashboardProvider>
        <HashRouter>
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            
            <Route path="/locker" element={
              <ProtectedRoute>
                <Locker />
              </ProtectedRoute>
            } />
            
            <Route path="/demo" element={<LandingSelector />} />
            <Route path="/command-center" element={<CommandCenter />} />
            <Route path="/conversational" element={<ConversationalHub />} />
            <Route path="/cards" element={<CardDashboard />} />
            <Route path="/workspace/:category" element={<Workspace />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/pipeline" element={
              <ProtectedRoute>
                <Pipeline />
              </ProtectedRoute>
            } />
            <Route path="/memory" element={
              <ProtectedRoute>
                <Memory />
              </ProtectedRoute>
            } />
            <Route path="/ai-intelligence" element={
              <ProtectedRoute>
                <AIIntelligence />
              </ProtectedRoute>
            } />
            <Route path="/chat" element={
              <ProtectedRoute>
                <WebChat />
              </ProtectedRoute>
            } />
            <Route path="/edr-tagger" element={
              <ProtectedRoute>
                <EDRTagger />
              </ProtectedRoute>
            } />
            <Route path="/schema-map" element={
              <ProtectedRoute>
                <SchemaMap />
              </ProtectedRoute>
            } />
            <Route path="/live-stream" element={
              <ProtectedRoute>
                <LiveStream />
              </ProtectedRoute>
            } />
            <Route path="/rig-state-test" element={
              <ProtectedRoute>
                <RigStateTest />
              </ProtectedRoute>
            } />
            <Route path="/mud-analysis" element={
              <ProtectedRoute>
                <MudAnalysisSimple />
              </ProtectedRoute>
            } />
            
            <Route path="/" element={<AuthRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </DashboardProvider>
    </UserProvider>
  )
}

function AuthRedirect() {
  // If user has a valid session token or local data, go to locker
  const hasSession = sessions.isAuthenticated
  const userData = localStorage.getItem('user_data')
  
  if (hasSession || userData) {
    return <Navigate to="/locker" replace />
  }
  
  // No session — send to welcome/login
  return <Navigate to="/welcome" replace />
}
