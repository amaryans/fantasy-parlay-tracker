import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { LeagueProvider } from './context/LeagueContext.jsx'
import { isConfigured } from './lib/supabase.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Weeks from './pages/Weeks.jsx'
import WeekDetail from './pages/WeekDetail.jsx'
import OddsBoard from './pages/OddsBoard.jsx'
import Stats from './pages/Stats.jsx'
import Settings from './pages/Settings.jsx'

function NotConfigured() {
  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1>Almost there</h1>
        <p>
          The app is not connected to Supabase yet. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (in <code>.env</code> locally, or as repository
          variables for the GitHub Pages deploy) and rebuild. See the README for the full setup.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (!isConfigured) return <NotConfigured />
  if (loading) return <div className="loading">Loading…</div>

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <LeagueProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/weeks" element={<Weeks />} />
          <Route path="/weeks/:season/:week" element={<WeekDetail />} />
          <Route path="/board" element={<OddsBoard />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LeagueProvider>
  )
}
