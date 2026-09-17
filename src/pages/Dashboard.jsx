import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.jsx'
import { deriveParlayResult, formatMoney } from '../lib/odds.js'
import { currentNflWeek, defaultLockAt, formatDateTime, isLocked, weekLabel } from '../lib/week.js'
import { MemberSelect, ResultBadge } from '../components/Badges.jsx'
import LegTable from '../components/LegTable.jsx'
import ParlaySummary from '../components/ParlaySummary.jsx'
import SleeperLowScore, { useSleeperLowScore } from '../components/SleeperLowScore.jsx'

export default function Dashboard() {
  const {
    settings, profiles, weeks, legsForWeek, findWeek, nameOf, me, isCommissioner, sleeper,
    createWeek, updateWeek,
  } = useLeague()
  const season = settings.season
  // Sleeper knows the real NFL week; the date-based calculation is the fallback.
  const nflWeek = sleeper.league?.currentWeek ?? currentNflWeek(settings.season_start)
  const week = findWeek(season, nflWeek)
  const low = useSleeperLowScore(nflWeek - 1)

  const [loserId, setLoserId] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Pre-select the Sleeper loser once it loads.
  useEffect(() => {
    if (low.result?.profile && !loserId) setLoserId(low.result.profile.id)
  }, [low.result, loserId])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const fromSleeper = low.result?.profile && low.result.profile.id === loserId
      await createWeek({
        season,
        week: nflWeek,
        loser_id: loserId,
        low_score: fromSleeper ? low.result.points : null,
        stake: settings.default_stake,
        lock_at: defaultLockAt(settings.season_start, nflWeek).toISOString(),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const recent = weeks.filter((w) => w.parlay_result !== 'pending').slice(0, 5)

  if (!week) {
    return (
      <div className="stack">
        <div className="card">
          <div className="card-header">
            <h1>{weekLabel(nflWeek)} · {season}</h1>
          </div>
          <p>
            No parlay set up for this week yet. Whoever had the lowest score in{' '}
            {nflWeek > 1 ? weekLabel(nflWeek - 1) : 'the last matchup'} places it.
          </p>
          <SleeperLowScore low={low} fantasyWeek={nflWeek - 1} />
          <div className="form-grid mt">
            <div className="field">
              <label htmlFor="f-placing-the-parlay-lowest-fantasy-score">Placing the parlay (lowest fantasy score)</label>
              <MemberSelect id="f-placing-the-parlay-lowest-fantasy-score" value={loserId} onChange={setLoserId} profiles={profiles} placeholder="Decide later" />
            </div>
          </div>
          {error && <div className="error small mt">{error}</div>}
          <div className="row mt">
            <button className="primary" onClick={create} disabled={busy || low.loading}>
              {low.loading ? 'Checking Sleeper…' : `Start ${weekLabel(nflWeek)}`}
            </button>
            <Link to="/weeks" className="muted small">Or look at a different week</Link>
          </div>
        </div>
        <RecentResults recent={recent} nameOf={nameOf} legsForWeek={legsForWeek} />
      </div>
    )
  }

  const legs = legsForWeek(week.id)
  const eligible = profiles.filter((p) => settings.loser_adds_leg || p.id !== week.loser_id)
  const missing = eligible.filter((p) => !legs.some((l) => l.user_id === p.id))
  const derived = deriveParlayResult(legs)
  const locked = isLocked(week)
  const iAmLoser = week.loser_id === me.id
  const myLeg = legs.find((l) => l.user_id === me.id)
  const iPick = settings.loser_adds_leg || !iAmLoser
  const sleeperMismatch = low.result?.profile && week.loser_id && low.result.profile.id !== week.loser_id

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h1>{weekLabel(week.week)} · {season}</h1>
          <div className="row">
            {locked ? <span className="badge locked">Locked</span> : week.lock_at ? <span className="muted small">Locks {formatDateTime(week.lock_at)}</span> : null}
            <ResultBadge result={week.parlay_result !== 'pending' ? week.parlay_result : derived} />
            <Link className="btn small" to={`/weeks/${week.season}/${week.week}`}>Manage week</Link>
          </div>
        </div>

        {week.loser_id ? (
          <div className="loser-callout">
            <div>
              <div className="muted small">Placing the parlay{week.low_score ? ` · scored ${week.low_score}` : ''}</div>
              <div className="big">{nameOf(week.loser_id)}{iAmLoser ? ' (that\'s you)' : ''}</div>
            </div>
          </div>
        ) : (
          <div className="banner warn">
            Nobody has been tagged as the loser yet.
            {low.result?.profile ? (
              <>
                {' '}Sleeper says <strong>{low.result.profile.display_name}</strong> scored {low.result.points} in {weekLabel(low.result.week)}.{' '}
                <button className="small primary" onClick={() => updateWeek(week.id, { loser_id: low.result.profile.id, low_score: low.result.points })}>
                  Tag {low.result.profile.display_name}
                </button>
              </>
            ) : (
              <LoserPicker week={week} profiles={profiles} updateWeek={updateWeek} />
            )}
          </div>
        )}
        {sleeperMismatch && isCommissioner && (
          <div className="banner warn mt">
            Sleeper says <strong>{low.result.profile.display_name}</strong> had the low score ({low.result.points}), not {nameOf(week.loser_id)}.{' '}
            <button className="small" onClick={() => updateWeek(week.id, { loser_id: low.result.profile.id, low_score: low.result.points })}>Switch</button>
          </div>
        )}
        {sleeper.error && <div className="banner warn mt small">Couldn't reach Sleeper ({sleeper.error}). Tag the loser by hand this week.</div>}

        <div className="mt">
          <ParlaySummary legs={legs} stake={week.stake} expectedLegs={eligible.length} />
        </div>

        {!locked && iPick && !myLeg && (
          <div className="banner mt">You haven't added your leg yet. Use <strong>Add my leg</strong> below or grab a line from the <Link to={`/board?season=${week.season}&week=${week.week}`}>odds board</Link>.</div>
        )}
        {missing.length > 0 && (
          <p className="muted small mt">
            Still waiting on: {missing.map((p) => p.display_name).join(', ')}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Legs</h2>
        <LegTable week={week} />
      </div>

      <RecentResults recent={recent} nameOf={nameOf} legsForWeek={legsForWeek} />
    </div>
  )
}

function LoserPicker({ week, profiles, updateWeek }) {
  const [val, setVal] = useState(null)
  return (
    <span className="row" style={{ display: 'inline-flex', marginLeft: '.5rem' }}>
      <MemberSelect value={val} onChange={setVal} profiles={profiles} />
      <button className="small primary" disabled={!val} onClick={() => updateWeek(week.id, { loser_id: val })}>Set</button>
    </span>
  )
}

function RecentResults({ recent, nameOf, legsForWeek }) {
  if (!recent.length) return null
  return (
    <div className="card">
      <div className="card-header">
        <h2>Recent parlays</h2>
        <Link to="/stats" className="small">All stats</Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Week</th><th>Placed by</th><th className="num">Legs</th><th className="num">Stake</th><th>Result</th></tr>
          </thead>
          <tbody>
            {recent.map((w) => (
              <tr key={w.id}>
                <td><Link to={`/weeks/${w.season}/${w.week}`}>{weekLabel(w.week)}</Link></td>
                <td>{w.loser_id ? nameOf(w.loser_id) : '—'}</td>
                <td className="num">{legsForWeek(w.id).length}</td>
                <td className="num">{formatMoney(w.stake)}</td>
                <td><ResultBadge result={w.parlay_result} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
