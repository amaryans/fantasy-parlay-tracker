import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.jsx'
import { weekLabel } from '../lib/week.js'

// Loads the lowest scorer for a fantasy week from Sleeper (when linked).
export function useSleeperLowScore(fantasyWeek) {
  const { sleeper, sleeperLowestScorer } = useLeague()
  const [state, setState] = useState({ loading: false, result: null, error: null })
  useEffect(() => {
    if (!sleeper.league || !fantasyWeek || fantasyWeek < 1) { setState({ loading: false, result: null, error: null }); return }
    let active = true
    setState({ loading: true, result: null, error: null })
    sleeperLowestScorer(fantasyWeek)
      .then((result) => { if (active) setState({ loading: false, result, error: null }) })
      .catch((err) => { if (active) setState({ loading: false, result: null, error: err.message }) })
    return () => { active = false }
  }, [sleeper.league, fantasyWeek, sleeperLowestScorer])
  return { ...state, linked: Boolean(sleeper.league), sleeperError: sleeper.error }
}

export default function SleeperLowScore({ low, fantasyWeek }) {
  const { isCommissioner } = useLeague()
  if (!low.linked && !low.sleeperError) return null
  if (low.sleeperError) return <div className="banner warn small">Couldn't reach Sleeper ({low.sleeperError}). Pick the loser by hand.</div>
  if (low.loading) return <div className="muted small">Checking Sleeper for {weekLabel(fantasyWeek)} scores…</div>
  if (low.error) return <div className="banner warn small">Sleeper error: {low.error}</div>
  if (!low.result) return <div className="muted small">Sleeper doesn't have final {weekLabel(fantasyWeek)} scores yet.</div>
  return (
    <div className="banner success small">
      Sleeper: <strong>{low.result.displayName}</strong>{low.result.teamName ? ` (${low.result.teamName})` : ''} had the low score in{' '}
      {weekLabel(low.result.week)} with <strong>{low.result.points}</strong>.
      {!low.result.profile && (
        <>
          {' '}That Sleeper team isn't linked to a member yet
          {isCommissioner ? <>, <Link to="/settings">link it in Settings</Link></> : ' (ask the commissioner)'}, so pick them below.
        </>
      )}
    </div>
  )
}
