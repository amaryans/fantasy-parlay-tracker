import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

export function useLeagueInfo() {
  const [info, setInfo] = useState({ league_name: 'Loser Parlay Tracker', sleeper_league_id: null })
  useEffect(() => {
    supabase.rpc('public_league_info').then(({ data }) => {
      if (data?.[0]?.league_name) setInfo(data[0])
    })
  }, [])
  return info
}

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const { league_name: leagueName } = useLeagueInfo()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="card auth-card stack" onSubmit={submit}>
        <div>
          <h1>{leagueName}</h1>
          <p className="muted">Loser parlay tracker. Sign in to see this week's picks.</p>
        </div>
        <div className="field">
          <label htmlFor="f-email">Email</label>
          <input id="f-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="f-password">Password</label>
          <input id="f-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {error && <div className="error small">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="small muted center">
          New to the league? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  )
}
