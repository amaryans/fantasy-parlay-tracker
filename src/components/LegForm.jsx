import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.jsx'
import { parseAmerican } from '../lib/odds.js'
import { MemberSelect } from './Badges.jsx'

const MARKETS = [
  ['spread', 'Spread'],
  ['moneyline', 'Moneyline'],
  ['total', 'Total (O/U)'],
  ['prop', 'Player / team prop'],
  ['other', 'Other'],
]

// Add or edit one leg. `leg` is an existing row when editing; `prefill`
// comes from the odds board; `forUserId` picks who the leg belongs to.
export default function LegForm({ week, leg = null, prefill = null, forUserId = null, allowMemberChoice = false, onDone }) {
  const { me, profiles, legsForWeek, settings, upsertLeg, updateLeg } = useLeague()
  const existingLegs = legsForWeek(week.id)
  const uid = useId()

  const [userId, setUserId] = useState(leg?.user_id ?? forUserId ?? me.id)
  const [game, setGame] = useState(leg?.game ?? prefill?.game ?? '')
  const [market, setMarket] = useState(leg?.market ?? prefill?.market ?? 'spread')
  const [pick, setPick] = useState(leg?.pick ?? prefill?.pick ?? '')
  const [odds, setOdds] = useState(leg?.odds ?? prefill?.odds ?? '')
  const [gameId] = useState(leg?.game_id ?? prefill?.game_id ?? null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (prefill) {
      setGame(prefill.game ?? '')
      setMarket(prefill.market ?? 'spread')
      setPick(prefill.pick ?? '')
      setOdds(prefill.odds ?? '')
    }
  }, [prefill])

  const excluded = existingLegs.filter((l) => l.id !== leg?.id).map((l) => l.user_id)
  if (!settings?.loser_adds_leg && week.loser_id) excluded.push(week.loser_id)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const parsed = parseAmerican(odds)
    if (Number.isNaN(parsed)) {
      setError('Odds should be American style, like -110 or +150 (or leave blank to fill in later).')
      return
    }
    if (!pick.trim()) {
      setError('Describe the pick, e.g. "Ravens -3.5" or "Over 47.5".')
      return
    }
    setSaving(true)
    try {
      const fields = { game: game.trim() || null, market, pick: pick.trim(), odds: parsed, game_id: gameId }
      if (leg) await updateLeg(leg.id, fields)
      else await upsertLeg({ ...fields, week_id: week.id, user_id: userId })
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      {(allowMemberChoice || (!leg && userId !== me.id)) && (
        <div className="field">
          <label htmlFor={`${uid}-whose-leg`}>Whose leg</label>
          <MemberSelect id={`${uid}-whose-leg`} value={userId} onChange={setUserId} profiles={profiles} exclude={excluded} disabled={Boolean(leg)} />
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${uid}-game`}>Game</label>
          <input id={`${uid}-game`} value={game} onChange={(e) => setGame(e.target.value)} placeholder="Chiefs @ Ravens" />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-type`}>Type</label>
          <select id={`${uid}-type`} value={market} onChange={(e) => setMarket(e.target.value)}>
            {MARKETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-pick`}>Pick</label>
          <input id={`${uid}-pick`} value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Ravens -3.5" required />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-odds-american`}>Odds (American)</label>
          <input id={`${uid}-odds-american`} value={odds} onChange={(e) => setOdds(e.target.value)} placeholder="-110" inputMode="numeric" />
        </div>
      </div>
      {error && <div className="error small">{error}</div>}
      <div className="row between">
        <span className="small muted">
          Not sure of the line? <Link to={`/board?season=${week.season}&week=${week.week}`}>Pick from the odds board</Link>
          {' '}or leave odds blank and anyone can fill them in later.
        </span>
        <div className="row">
          {onDone && <button type="button" onClick={onDone}>Cancel</button>}
          <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : leg ? 'Save leg' : 'Add leg'}</button>
        </div>
      </div>
    </form>
  )
}
