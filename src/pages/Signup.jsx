import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { loadSleeperLeague } from '../lib/sleeper.js'
import { useLeagueInfo } from './Login.jsx'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const info = useLeagueInfo()
  const [form, setForm] = useState({ email: '', password: '', displayName: '', teamName: '', inviteCode: '', sleeperUserId: '' })
  const [teams, setTeams] = useState([])
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  // If the league is linked to Sleeper, offer its teams so the new member
  // can pick themselves (and we can prefill their names).
  useEffect(() => {
    if (!info.sleeper_league_id) return
    let active = true
    loadSleeperLeague(info.sleeper_league_id)
      .then((league) => { if (active) setTeams(league.teams) })
      .catch(() => {})
    return () => { active = false }
  }, [info.sleeper_league_id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function chooseTeam(e) {
    const id = e.target.value
    const t = teams.find((x) => x.userId === id)
    setForm((f) => ({
      ...f,
      sleeperUserId: id,
      displayName: f.displayName || t?.displayName || '',
      teamName: f.teamName || t?.teamName || '',
    }))
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { needsConfirmation } = await signUp({
        email: form.email.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        teamName: form.teamName.trim(),
        inviteCode: form.inviteCode.trim(),
        sleeperUserId: form.sleeperUserId || null,
      })
      if (needsConfirmation) setDone(true)
      else navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="auth-shell">
        <div className="card auth-card">
          <h1>Check your email</h1>
          <p>We sent a confirmation link to <strong>{form.email}</strong>. Click it, then <Link to="/login">sign in</Link>.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <form className="card auth-card stack" onSubmit={submit}>
        <div>
          <h1>Join {info.league_name}</h1>
          <p className="muted">You need the league invite code from the commissioner.</p>
        </div>
        <div className="field">
          <label htmlFor="f-invite-code">Invite code</label>
          <input id="f-invite-code" value={form.inviteCode} onChange={set('inviteCode')} required autoCapitalize="off" />
        </div>
        {teams.length > 0 && (
          <div className="field">
            <label htmlFor="f-which-sleeper-team-are-you">Which Sleeper team are you?</label>
            <select id="f-which-sleeper-team-are-you" value={form.sleeperUserId} onChange={chooseTeam}>
              <option value="">Pick your team</option>
              {teams.map((t) => (
                <option key={t.userId} value={t.userId}>{t.displayName}{t.teamName ? ` · ${t.teamName}` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="f-your-name-shown-to-the-league">Your name (shown to the league)</label>
          <input id="f-your-name-shown-to-the-league" value={form.displayName} onChange={set('displayName')} required />
        </div>
        <div className="field">
          <label htmlFor="f-fantasy-team-name-optional">Fantasy team name (optional)</label>
          <input id="f-fantasy-team-name-optional" value={form.teamName} onChange={set('teamName')} />
        </div>
        <div className="field">
          <label htmlFor="f-email">Email</label>
          <input id="f-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="f-password">Password</label>
          <input id="f-password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={6} required />
        </div>
        {error && <div className="error small">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="small muted center">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
