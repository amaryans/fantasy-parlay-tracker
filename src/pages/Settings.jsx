import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLeague } from '../context/LeagueContext.jsx'
import { formatDateTime } from '../lib/week.js'

export default function Settings() {
  const { user } = useAuth()
  const { settings, me, games, updateSettings, updateProfile } = useLeague()

  const [league, setLeague] = useState({
    league_name: settings.league_name,
    invite_code: settings.invite_code,
    season: settings.season,
    season_start: settings.season_start,
    default_stake: settings.default_stake,
    loser_adds_leg: settings.loser_adds_leg,
  })
  const [profile, setProfile] = useState({ display_name: me.display_name, team_name: me.team_name ?? '' })
  const [leagueMsg, setLeagueMsg] = useState(null)
  const [profileMsg, setProfileMsg] = useState(null)

  const setL = (k) => (e) => setLeague((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const setP = (k) => (e) => setProfile((f) => ({ ...f, [k]: e.target.value }))

  async function saveLeague(e) {
    e.preventDefault()
    setLeagueMsg(null)
    try {
      await updateSettings({
        league_name: league.league_name.trim(),
        invite_code: league.invite_code.trim(),
        season: Number(league.season),
        season_start: league.season_start,
        default_stake: Number(league.default_stake) || 0,
        loser_adds_leg: Boolean(league.loser_adds_leg),
      })
      setLeagueMsg({ ok: true, text: 'League settings saved.' })
    } catch (err) {
      setLeagueMsg({ ok: false, text: err.message })
    }
  }

  async function saveProfile(e) {
    e.preventDefault()
    setProfileMsg(null)
    try {
      await updateProfile({ display_name: profile.display_name.trim(), team_name: profile.team_name.trim() || null })
      setProfileMsg({ ok: true, text: 'Profile saved.' })
    } catch (err) {
      setProfileMsg({ ok: false, text: err.message })
    }
  }

  const lastOddsPull = games.map((g) => g.updated_at).sort().at(-1)

  return (
    <div className="stack">
      <form className="card stack" onSubmit={saveProfile}>
        <h2>Your profile</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="f-display-name">Display name</label>
            <input id="f-display-name" value={profile.display_name} onChange={setP('display_name')} required />
          </div>
          <div className="field">
            <label htmlFor="f-fantasy-team-name">Fantasy team name</label>
            <input id="f-fantasy-team-name" value={profile.team_name} onChange={setP('team_name')} />
          </div>
          <div className="field">
            <label htmlFor="f-email">Email</label>
            <input id="f-email" value={user.email} disabled />
          </div>
        </div>
        {profileMsg && <div className={profileMsg.ok ? 'success small' : 'error small'}>{profileMsg.text}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" type="submit">Save profile</button>
        </div>
      </form>

      <form className="card stack" onSubmit={saveLeague}>
        <h2>League settings</h2>
        <p className="muted small">Everyone in the league can change these. Play nice.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="f-league-name">League name</label>
            <input id="f-league-name" value={league.league_name} onChange={setL('league_name')} required />
          </div>
          <div className="field">
            <label htmlFor="f-invite-code-needed-to-sign-up">Invite code (needed to sign up)</label>
            <input id="f-invite-code-needed-to-sign-up" value={league.invite_code} onChange={setL('invite_code')} required />
          </div>
          <div className="field">
            <label htmlFor="f-season">Season</label>
            <input id="f-season" type="number" value={league.season} onChange={setL('season')} required />
          </div>
          <div className="field">
            <label htmlFor="f-week-1-thursday-season-start">Week 1 Thursday (season start)</label>
            <input id="f-week-1-thursday-season-start" type="date" value={league.season_start} onChange={setL('season_start')} required />
            <span className="small muted">Used to work out the current NFL week.</span>
          </div>
          <div className="field">
            <label htmlFor="f-default-stake">Default stake ($)</label>
            <input id="f-default-stake" type="number" step="0.01" min="0" value={league.default_stake} onChange={setL('default_stake')} />
          </div>
          <div className="field checkbox-row" style={{ flexDirection: 'row', alignSelf: 'end' }}>
            <input id="loser_adds_leg" type="checkbox" checked={league.loser_adds_leg} onChange={setL('loser_adds_leg')} />
            <label htmlFor="loser_adds_leg">The parlay placer also picks a leg</label>
          </div>
        </div>
        {leagueMsg && <div className={leagueMsg.ok ? 'success small' : 'error small'}>{leagueMsg.text}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" type="submit">Save league settings</button>
        </div>
      </form>

      <div className="card">
        <h2>Automatic odds</h2>
        {lastOddsPull ? (
          <p>Lines were last pulled {formatDateTime(lastOddsPull)}. The fetch runs on a schedule from GitHub Actions.</p>
        ) : (
          <p className="muted">No lines have been pulled yet. Odds can always be typed in by hand; to automate them, follow the "Automatic odds" section in the README (free API key + three GitHub secrets).</p>
        )}
      </div>
    </div>
  )
}
