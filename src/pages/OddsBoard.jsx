import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.jsx'
import { formatPoint as fmtPoint, legFromLine, summariseBoard } from '../lib/board.js'
import { formatAmerican } from '../lib/odds.js'
import { currentNflWeek, defaultLockAt, formatDateTime, MAX_WEEK, weekLabel } from '../lib/week.js'

export default function OddsBoard() {
  const { settings, games, weeks, findWeek, createWeek, loadOddsForWeek } = useLeague()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const season = Number(params.get('season') || settings.season)
  const weekNum = Number(params.get('week') || currentNflWeek(settings.season_start))
  const week = findWeek(season, weekNum)
  const weekGames = useMemo(() => games.filter((g) => g.season === season && g.week === weekNum), [games, season, weekNum])

  const [oddsRows, setOddsRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    loadOddsForWeek(season, weekNum)
      .then((rows) => { if (active) setOddsRows(rows) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, weekNum, games])

  const board = useMemo(() => summariseBoard(weekGames, oddsRows), [weekGames, oddsRows])
  const lastFetched = board.map((b) => b.fetchedAt).filter(Boolean).sort().at(-1)

  function choose(g, market, line) {
    navigate(`/weeks/${season}/${weekNum}`, { state: { prefill: legFromLine(g, market, line) } })
  }

  async function ensureWeek() {
    await createWeek({
      season, week: weekNum, stake: settings.default_stake,
      lock_at: season === settings.season ? defaultLockAt(settings.season_start, weekNum).toISOString() : null,
    })
  }

  const availableWeeks = [...new Set(games.filter((g) => g.season === season).map((g) => g.week))].sort((a, b) => a - b)

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h1>Odds board · {weekLabel(weekNum)}</h1>
          <div className="row">
            <select
              value={weekNum}
              onChange={(e) => setParams({ season: String(season), week: e.target.value })}
              style={{ width: 'auto' }}
            >
              {Array.from({ length: MAX_WEEK }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{weekLabel(n)}{availableWeeks.includes(n) ? ' ·' : ''}</option>
              ))}
            </select>
          </div>
        </div>
        {!week && (
          <div className="banner warn mb">
            {weekLabel(weekNum)} hasn't been created yet, so picks can't be saved to it.{' '}
            <button className="small primary" onClick={ensureWeek}>Create {weekLabel(weekNum)}</button>
          </div>
        )}
        <p className="muted small">
          Lines are the consensus number with the best price across US books
          {lastFetched ? `, last pulled ${formatDateTime(lastFetched)}` : ''}. Tap a line to use it as your leg.
          Odds move, so double-check at your book before locking in.
        </p>
        {error && <div className="banner error">{error}</div>}
        {loading && <div className="loading">Loading lines…</div>}
        {!loading && !weekGames.length && (
          <div className="banner">
            No games loaded for this week. Odds come from the automated fetch described in the README,
            or you can simply type your pick and odds in by hand from the <Link to={week ? `/weeks/${season}/${weekNum}` : '/weeks'}>week page</Link>.
          </div>
        )}
        {!loading && board.map(({ game: g, markets }) => (
          <div className="game" key={g.id}>
            <div className="game-title">
              <span>{g.away_team} @ {g.home_team}</span>
              <span className="muted small">{formatDateTime(g.commence_time)}</span>
            </div>
            <div className="markets">
              {[['spreads', 'Spread'], ['h2h', 'Moneyline'], ['totals', 'Total']].map(([m, label]) => (
                <div className="market" key={m}>
                  <div className="mk">{label}</div>
                  {markets[m].length === 0 && <span className="muted small">—</span>}
                  {markets[m].map((line) => (
                    <button key={line.outcome} disabled={!week || line.price === null} onClick={() => choose(g, m, line)}>
                      <span>{line.outcome}{m !== 'h2h' ? ` ${fmtPoint(line.point, m)}` : ''}</span>
                      <span className={`odds ${line.price > 0 ? 'plus' : ''}`}>{formatAmerican(line.price)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
