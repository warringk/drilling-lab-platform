import { Link } from 'react-router-dom'

export default function LandingSelector() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '40px'
    }}>
      <h1 className="logo-hemi" style={{ fontSize: '24px' }}>drillinglab.ai</h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: '-20px' }}>Choose a landing page concept</p>
      
      <div style={{ display: 'flex', gap: '20px' }}>
        <Link to="/command-center" className="btn" style={{ padding: '20px 40px' }}>
          🎯 Command Center
          <br/><small style={{ color: 'var(--text-muted)' }}>Mission control style</small>
        </Link>
        
        <Link to="/conversational" className="btn" style={{ padding: '20px 40px' }}>
          💬 Conversational Hub
          <br/><small style={{ color: 'var(--text-muted)' }}>Chat-first interface</small>
        </Link>
        
        <Link to="/cards" className="btn" style={{ padding: '20px 40px' }}>
          🃏 Card Dashboard
          <br/><small style={{ color: 'var(--text-muted)' }}>Clean card layout</small>
        </Link>
      </div>
    </div>
  )
}
