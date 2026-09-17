import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLeague } from '../context/LeagueContext.jsx'
import { formatDateTime, weekLabel } from '../lib/week.js'

export default function Settings() {
  const { isCommissioner } = useLeague()
  return (
    <div className="stack">
      <ProfileForm />
      {isCommissioner ? <CommissionerPanel /> : <LeagueSummary />}
      <OddsStatus />
    </div>
  )
}

function SleeperTeamSelect({ id, value, onChange, disabled }) {
  const { sleeper } = useLeague()
  const teams = sleeper.league?.teams ?? []
  return (
    <select id={id} value={value ?? ''} disabled={disabled || !teams.length} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{teams.length ? 'Not linked' : 'Sleeper not linked'}</option>
      {teams.map((t) => (
        <option key={t.userId} value={t.userId}>{t.displayName}{t.teamName ? ` · ${t.teamName}` : ''}</option>
      ))}
    </select>
  )
}

function ProfileForm() {
  const { user } = useAuth()
  const { me, sleeper, updateProfile } = useLeague()
  const [form, setForm] = useState({ display_name: me.display_name, team_name: me.team_name ?? '', sleeper_user_id: me.sleeper_user_id ?? null })
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    try {
      await updateProfile({
        display_name: form.display_name.trim(),
        team_name: form.team_name.trim() || null,
        sleeper_user_id: form.sleeper_user_id || null,
      })
      setMsg({ ok: true, text: 'Profile saved.' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>Your profile{me.is_commissioner ? <span className="badge" style={{ marginLeft: '.5rem' }}>commissioner</span> : null}</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="f-display-name">Display name</label>
          <input id="f-display-name" value={form.display_name} onChange={set('display_name')} required />
        </div>
        <div className="field">
          <label htmlFor="f-fantasy-team-name">Fantasy team name</label>
          <input id="f-fantasy-team-name" value={form.team_name} onChange={set('team_name')} />
        </div>
        <div className="field">
          <label htmlFor="f-email">Email</label>
          <input id="f-email" value={user.email} disabled />
        </div>
        {sleeper.league && (
          <div className="field">
            <label htmlFor="f-your-sleeper-team">Your Sleeper team</label>
            <SleeperTeamSelect id="f-your-sleeper-team" value={form.sleeper_user_id} onChange={(v) => setForm((f) => ({ ...f, sleeper_user_id: v }))} />
            <span className="small muted">Links you to your Sleeper roster so the loser can be found automatically.</span>
          </div>
        )}
      </div>
      {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="primary" type="submit">Save profile</button>
      </div>
    </form>
  )
}

function LeagueSummary() {
  const { settings, profiles, sleeper } = useLeague()
  const commissioners = profiles.filter((p) => p.is_commissioner).map((p) => p.display_name)
  return (
    <div className="card">
      <h2>League</h2>
      <div className="stat-tiles">
        <div className="tile"><div className="label">League</div><div className="value" style={{ fontSize: '1rem' }}>{settings.league_name}</div></div>
        <div className="tile"><div className="label">Default stake</div><div className="value">${Number(settings.default_stake).toFixed(2)}</div></div>
        <div className="tile"><div className="label">Loser picks a leg</div><div className="value">{settings.loser_adds_leg ? 'Yes' : 'No'}</div></div>
        <div className="tile"><div className="label">Sleeper</div><div className="value" style={{ fontSize: '1rem' }}>{sleeper.league ? sleeper.league.name : 'Not linked'}</div></div>
      </div>
      <p className="muted small mt">
        Commissioner{commissioners.length === 1 ? '' : 's'}: {commissioners.join(', ') || 'none'}. Only they can change league settings, member links and week lock times.
      </p>
    </div>
  )
}

function CommissionerPanel() {
  const { settings, profiles, me, sleeper, updateSettings, updateMember } = useLeague()
  const [league, setLeague] = useState({
    league_name: settings.league_name,
    invite_code: settings.invite_code,
    season: settings.season,
    season_start: settings.season_start,
    default_stake: settings.default_stake,
    loser_adds_leg: settings.loser_adds_leg,
    sleeper_league_id: settings.sleeper_league_id ?? '',
  })
  const [msg, setMsg] = useState(null)
  const [memberMsg, setMemberMsg] = useState(null)
  const set = (k) => (e) => setLeague((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function saveLeague(e) {
    e.preventDefault()
    setMsg(null)
    try {
      await updateSettings({
        league_name: league.league_name.trim(),
        invite_code: league.invite_code.trim(),
        season: Number(league.season),
        season_start: league.season_start,
        default_stake: Number(league.default_stake) || 0,
        loser_adds_leg: Boolean(league.loser_adds_leg),
        sleeper_league_id: league.sleeper_league_id.trim() || null,
      })
      setMsg({ ok: true, text: 'League settings saved.' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }

  async function member(id, fields) {
    setMemberMsg(null)
    try { await updateMember(id, fields) } catch (err) { setMemberMsg(err.message) }
  }

  // Link unlinked members to Sleeper teams whose display or team name matches.
  async function autoLink() {
    setMemberMsg(null)
    const teams = sleeper.league?.teams ?? []
    const taken = new Set(profiles.map((p) => p.sleeper_user_id).filter(Boolean))
    let linked = 0
    try {
      for (const p of profiles) {
        if (p.sleeper_user_id) continue
        const norm = (s) => (s || '').trim().toLowerCase()
        const matches = teams.filter((t) => !taken.has(t.userId) && (
          norm(t.displayName) === norm(p.display_name) || (p.team_name && norm(t.teamName) === norm(p.team_name))
        ))
        if (matches.length === 1) {
          await updateMember(p.id, { sleeper_user_id: matches[0].userId })
          taken.add(matches[0].userId)
          linked += 1
        }
      }
      setMemberMsg(linked ? `Linked ${linked} member${linked === 1 ? '' : 's'} by name.` : 'No unambiguous name matches found. Link the rest by hand.')
    } catch (err) {
      setMemberMsg(err.message)
    }
  }

  const sleeperStatus = !league.sleeper_league_id.trim()
    ? null
    : sleeper.loading ? 'Connecting to Sleeper…'
    : sleeper.error ? `Could not load that league: ${sleeper.error}`
    : sleeper.league ? `Connected: ${sleeper.league.name} (${sleeper.league.teams.length} teams, ${sleeper.league.season}, currently ${weekLabel(sleeper.league.currentWeek)})`
    : 'Save to connect.'

  return (
    <>
      <form className="card stack" onSubmit={saveLeague}>
        <h2>League settings <span className="muted small">(commissioner)</span></h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="f-league-name">League name</label>
            <input id="f-league-name" value={league.league_name} onChange={set('league_name')} required />
          </div>
          <div className="field">
            <label htmlFor="f-invite-code-needed-to-sign-up">Invite code (needed to sign up)</label>
            <input id="f-invite-code-needed-to-sign-up" value={league.invite_code} onChange={set('invite_code')} required />
          </div>
          <div className="field">
            <label htmlFor="f-season">Season</label>
            <input id="f-season" type="number" value={league.season} onChange={set('season')} required />
          </div>
          <div className="field">
            <label htmlFor="f-week-1-thursday-season-start">Week 1 Thursday (season start)</label>
            <input id="f-week-1-thursday-season-start" type="date" value={league.season_start} onChange={set('season_start')} required />
            <span className="small muted">Fallback for the current week and default lock times when Sleeper isn't linked.</span>
          </div>
          <div className="field">
            <label htmlFor="f-default-stake">Default stake ($)</label>
            <input id="f-default-stake" type="number" step="0.01" min="0" value={league.default_stake} onChange={set('default_stake')} />
            <span className="small muted">Whoever places the parlay can change it for their week.</span>
          </div>
          <div className="field checkbox-row" style={{ flexDirection: 'row', alignSelf: 'end' }}>
            <input id="loser_adds_leg" type="checkbox" checked={league.loser_adds_leg} onChange={set('loser_adds_leg')} />
            <label htmlFor="loser_adds_leg">The parlay placer also picks a leg</label>
          </div>
          <div className="field wide">
            <label htmlFor="f-sleeper-league-id">Sleeper league ID</label>
            <input id="f-sleeper-league-id" value={league.sleeper_league_id} onChange={set('sleeper_league_id')} placeholder="e.g. 1124849636478976000" inputMode="numeric" />
            <span className="small muted">
              The long number in your Sleeper league URL (sleeper.com/leagues/<strong>ID</strong>/…). Linking it fills in the weekly loser automatically.
              {sleeperStatus && <> <br />{sleeperStatus}</>}
            </span>
          </div>
        </div>
        {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" type="submit">Save league settings</button>
        </div>
      </form>

      <div className="card stack">
        <div className="card-header">
          <h2>Members <span className="muted small">(commissioner)</span></h2>
          {sleeper.league && <button className="small" onClick={autoLink}>Auto-link by name</button>}
        </div>
        <p className="muted small">
          Link each member to their Sleeper team so the low score maps to the right person. Commissioners can change league settings and week lock times; there must always be at least one.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Member</th><th>Team</th><th>Sleeper team</th><th>Commissioner</th></tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className={p.id === me.id ? 'me' : ''}>
                  <td className="nowrap">{p.display_name}</td>
                  <td className="muted">{p.team_name ?? '—'}</td>
                  <td>
                    <SleeperTeamSelect
                      id={`sleeper-${p.id}`}
                      value={p.sleeper_user_id}
                      onChange={(v) => member(p.id, { sleeper_user_id: v })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${p.display_name} is commissioner`}
                      checked={p.is_commissioner}
                      onChange={(e) => member(p.id, { is_commissioner: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {memberMsg && <div className="small">{memberMsg}</div>}
      </div>
    </>
  )
}

function OddsStatus() {
  const { games } = useLeague()
  const lastOddsPull = games.map((g) => g.updated_at).sort().at(-1)
  return (
    <div className="card">
      <h2>Automatic odds</h2>
      {lastOddsPull ? (
        <p>Lines were last pulled {formatDateTime(lastOddsPull)}. The fetch runs on a schedule from GitHub Actions; legs picked from the board can be re-priced with the refresh button next to their odds.</p>
      ) : (
        <p className="muted">No lines have been pulled yet. Odds can always be typed in by hand; to automate them, follow "Automatic odds" in the README (free API key + three GitHub secrets).</p>
      )}
    </div>
  )
}
