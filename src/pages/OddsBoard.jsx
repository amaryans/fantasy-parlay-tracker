import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.jsx'
import { formatAmerican } from '../lib/odds.js'
import { currentNflWeek, defaultLockAt, formatDateTime, MAX_WEEK, weekLabel } from '../lib/week.js'

// Turns raw bookmaker rows into one line per outcome: the most common
// point (spread / total) across books, with the best price at that point.
function summarise(games, oddsRows) {
  const byGame = new Map()
  for (const row of oddsRows) {
    if (!byGame.has(row.game_id)) byGame.set(row.game_id, [])
    byGame.get(row.game_id).push(row)
  }
  return games.map((g) => {
    const rows = byGame.get(g.id) || []
    const markets = {}
    for (const market of ['h2h', 'spreads', 'totals']) {
      const mrows = rows.filter((r) => r.market === market)
      const outcomes = [...new Set(mrows.map((r) => r.outcome))]
      markets[market] = outcomes.map((outcome) => {
        const orows = mrows.filter((r) => r.outcome === outcome)
        let point = null
        if (market !== 'h2h') {
          const counts = new Map()
          for (const r of orows) counts.set(r.point, (counts.get(r.point) || 0) + 1)
          point = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        }
        const atPoint = market === 'h2h' ? orows : orows.filter((r) => Number(r.point) === Number(point))
        const best = atPoint.reduce((acc, r) => (acc === null || r.price > acc.price ? r : acc), null)
        return { outcome, point, price: best?.price ?? null, bookmaker: best?.bookmaker, books: atPoint.length }
      })
    }
    // Order team outcomes away then home.
    for (const m of ['h2h', 'spreads']) {
      markets[m].sort((a, b) => (a.outcome === g.away_team ? -1 : b.outcome === g.away_team ? 1 : 0))
    }
    markets.totals.sort((a, b) => (a.outcome === 'Over' ? -1 : b.outcome === 'Over' ? 1 : 0))
    return { game: g, markets, fetchedAt: rows[0]?.fetched_at }
  })
}

function fmtPoint(p, market) {
  if (p === null || p === undefined) return ''
  const n = Number(p)
  if (market === 'spreads') return n > 0 ? `+${n}` : `${n}`
  return `${n}`
}

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

  const board = useMemo(() => summarise(weekGames, oddsRows), [weekGames, oddsRows])
  const lastFetched = board.map((b) => b.fetchedAt).filter(Boolean).sort().at(-1)

  function choose(g, market, line) {
    const gameName = `${g.away_team} @ ${g.home_team}`
    let pick, type
    if (market === 'h2h') { pick = `${line.outcome} ML`; type = 'moneyline' }
    else if (market === 'spreads') { pick = `${line.outcome} ${fmtPoint(line.point, market)}`; type = 'spread' }
    else { pick = `${line.outcome} ${fmtPoint(line.point, market)}`; type = 'total' }
    const prefill = { game: gameName, market: type, pick, odds: line.price, game_id: g.id }
    navigate(`/weeks/${season}/${weekNum}`, { state: { prefill } })
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
