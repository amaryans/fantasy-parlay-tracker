import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.jsx'
import { formatAmerican, formatMoney, parlayOdds } from '../lib/odds.js'
import { currentNflWeek, defaultLockAt, MAX_WEEK, weekLabel } from '../lib/week.js'
import { ResultBadge } from '../components/Badges.jsx'

export default function Weeks() {
  const { settings, weeks, legsForWeek, nameOf, createWeek } = useLeague()
  const [season, setSeason] = useState(settings.season)
  const [weekNum, setWeekNum] = useState(() => {
    const cur = currentNflWeek(settings.season_start)
    const taken = new Set(weeks.filter((w) => w.season === settings.season).map((w) => w.week))
    let n = cur
    while (taken.has(n) && n < MAX_WEEK) n += 1
    return n
  })
  const [error, setError] = useState(null)

  async function create() {
    setError(null)
    try {
      await createWeek({
        season: Number(season),
        week: Number(weekNum),
        stake: settings.default_stake,
        lock_at: Number(season) === settings.season ? defaultLockAt(settings.season_start, Number(weekNum)).toISOString() : null,
      })
    } catch (err) {
      setError(err.code === '23505' ? 'That week already exists.' : err.message)
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h1>Weeks</h1>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Placed by</th>
                <th className="num">Legs</th>
                <th className="num">Odds</th>
                <th className="num">Stake</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {weeks.length === 0 && (
                <tr><td colSpan={6} className="muted">No weeks yet. Create the first one below.</td></tr>
              )}
              {weeks.map((w) => {
                const legs = legsForWeek(w.id)
                const { american } = parlayOdds(legs)
                return (
                  <tr key={w.id}>
                    <td className="nowrap"><Link to={`/weeks/${w.season}/${w.week}`}>{weekLabel(w.week)}</Link> <span className="muted small">{w.season}</span></td>
                    <td>{w.loser_id ? nameOf(w.loser_id) : <span className="muted">—</span>}</td>
                    <td className="num">{legs.length}</td>
                    <td className="num">{formatAmerican(american)}</td>
                    <td className="num">{formatMoney(w.stake)}</td>
                    <td><ResultBadge result={w.parlay_result} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Add a week</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="f-season">Season</label>
            <input id="f-season" type="number" value={season} onChange={(e) => setSeason(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-nfl-week">NFL week</label>
            <input id="f-nfl-week" type="number" min={1} max={MAX_WEEK} value={weekNum} onChange={(e) => setWeekNum(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button className="primary" onClick={create}>Create {weekLabel(Number(weekNum))}</button>
          </div>
        </div>
        {error && <div className="error small mt">{error}</div>}
      </div>
    </div>
  )
}
