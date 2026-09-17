import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLeague } from '../context/LeagueContext.jsx'

export default function Layout() {
  const { signOut } = useAuth()
  const { settings, me, loading, error } = useLeague()

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            Loser<span>Parlay</span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>This Week</NavLink>
            <NavLink to="/weeks">Weeks</NavLink>
            <NavLink to="/board">Odds Board</NavLink>
            <NavLink to="/stats">Stats</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
          <div className="user">
            <span className="name">{me?.display_name}</span>
            <button className="small" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="main">
        {error && (
          <div className="banner error mb">
            Could not load league data: {error.message}. Has <code>supabase/schema.sql</code> been run?
          </div>
        )}
        {loading && !error ? <div className="loading">Loading {settings?.league_name ?? 'league'}…</div> : <Outlet />}
      </main>
    </>
  )
}
