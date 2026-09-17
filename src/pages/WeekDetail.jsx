import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.jsx'
import { deriveParlayResult, formatMoney, parlayOdds, potentialPayout } from '../lib/odds.js'
import { formatDateTime, isLocked, toLocalInputValue, weekLabel } from '../lib/week.js'
import { MemberSelect, ResultBadge } from '../components/Badges.jsx'
import LegForm from '../components/LegForm.jsx'
import LegTable from '../components/LegTable.jsx'
import ParlaySummary from '../components/ParlaySummary.jsx'
import { useSleeperLowScore } from '../components/SleeperLowScore.jsx'

export default function WeekDetail() {
  const { season, week: weekNum } = useParams()
  const { findWeek, legsForWeek, profiles, settings, me, isCommissioner, nameOf, updateWeek, deleteWeek } = useLeague()
  const navigate = useNavigate()
  const location = useLocation()
  const week = findWeek(season, weekNum)

  // The odds board hands us a prefilled leg via router state.
  const [prefill, setPrefill] = useState(location.state?.prefill ?? null)
  useEffect(() => {
    if (location.state?.prefill) {
      setPrefill(location.state.prefill)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

  if (!week) {
    return (
      <div className="card">
        <h1>{weekLabel(Number(weekNum))} · {season}</h1>
        <p className="muted">This week hasn't been created yet.</p>
        <Link to="/weeks" className="btn">Go to weeks</Link>
      </div>
    )
  }

  const legs = legsForWeek(week.id)
  const locked = isLocked(week)
  const derived = deriveParlayResult(legs)
  const eligible = profiles.filter((p) => settings.loser_adds_leg || p.id !== week.loser_id)
  const myLeg = legs.find((l) => l.user_id === me.id)
  const iAmLoser = week.loser_id === me.id
  const iPick = settings.loser_adds_leg || !iAmLoser
  // The placer manages their parlay; commissioners manage everything; and
  // while nobody is tagged yet anyone can tag the loser.
  const canManage = isCommissioner || iAmLoser || !week.loser_id

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h1>{weekLabel(week.week)} · {week.season}</h1>
          <div className="row">
            {locked && <span className="badge locked">Locked</span>}
            <ResultBadge result={week.parlay_result !== 'pending' ? week.parlay_result : derived} />
          </div>
        </div>
        <p className="muted small">
          {week.loser_id ? <>Placed by <strong>{nameOf(week.loser_id)}</strong>{week.low_score ? ` (scored ${week.low_score})` : ''}.</> : 'Nobody tagged as the loser yet.'}
          {week.lock_at ? ` Picks lock ${formatDateTime(week.lock_at)}.` : ''}
          {week.notes ? ` ${week.notes}` : ''}
        </p>
        <ParlaySummary legs={legs} stake={week.stake} expectedLegs={eligible.length} />
      </div>

      {prefill && iPick && (
        <div className="card">
          <h3>{myLeg ? 'Replace your leg with this line' : 'Your leg from the odds board'}</h3>
          <LegForm week={week} leg={myLeg ?? null} prefill={prefill} forUserId={me.id} onDone={() => setPrefill(null)} />
        </div>
      )}
      {prefill && !iPick && (
        <div className="card">
          <p className="muted small">You're placing the parlay this week and the league has the placer sitting out, so this line has to belong to someone else.</p>
          {isCommissioner
            ? <LegForm week={week} prefill={prefill} allowMemberChoice onDone={() => setPrefill(null)} />
            : <button onClick={() => setPrefill(null)}>OK</button>}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Legs</h2>
          <Link to={`/board?season=${week.season}&week=${week.week}`} className="small">Odds board</Link>
        </div>
        <LegTable week={week} />
      </div>

      {canManage && (
        <WeekSettings
          week={week} legs={legs} profiles={profiles} isCommissioner={isCommissioner} iAmLoser={iAmLoser}
          updateWeek={updateWeek} deleteWeek={deleteWeek} navigate={navigate} derived={derived}
        />
      )}
    </div>
  )
}

function WeekSettings({ week, legs, profiles, isCommissioner, iAmLoser, updateWeek, deleteWeek, navigate, derived }) {
  const { settings } = useLeague()
  const low = useSleeperLowScore(week.week - 1)
  const initial = () => ({
    loser_id: week.loser_id,
    low_score: week.low_score ?? '',
    stake: week.stake,
    lock_at: toLocalInputValue(week.lock_at),
    parlay_result: week.parlay_result,
    payout: week.payout ?? '',
    notes: week.notes ?? '',
  })
  const [form, setForm] = useState(initial)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setForm(initial()) }, [week]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const suggestedPayout = potentialPayout(form.stake, legs)
  const loserHasLeg = !settings.loser_adds_leg && form.loser_id && legs.some((l) => l.user_id === form.loser_id)
  const canTagLoser = isCommissioner || !week.loser_id
  const canEditBet = isCommissioner || iAmLoser

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const fields = {}
      if (canTagLoser) { fields.loser_id = form.loser_id || null; fields.low_score = form.low_score === '' ? null : Number(form.low_score) }
      if (canEditBet) {
        fields.stake = Number(form.stake) || 0
        fields.low_score = form.low_score === '' ? null : Number(form.low_score)
        fields.parlay_result = form.parlay_result
        fields.payout = form.payout === '' ? null : Number(form.payout)
        fields.notes = form.notes.trim() || null
      }
      if (isCommissioner) fields.lock_at = form.lock_at ? new Date(form.lock_at).toISOString() : null
      await updateWeek(week.id, fields)
      setMsg({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete ${weekLabel(week.week)} and its ${legs.length} legs? This cannot be undone.`)) return
    await deleteWeek(week.id)
    navigate('/weeks')
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>Week settings</h2>
      {!isCommissioner && iAmLoser && <p className="muted small">You're placing this week's parlay, so you set the stake and settle the result.</p>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="f-placing-the-parlay-lowest-score">Placing the parlay (lowest score)</label>
          <MemberSelect id="f-placing-the-parlay-lowest-score" value={form.loser_id} onChange={(v) => setForm((f) => ({ ...f, loser_id: v }))} profiles={profiles} placeholder="Not decided" disabled={!canTagLoser} />
          {loserHasLeg && <span className="small error">This member already has a leg this week and the placer sits out. Remove it first.</span>}
          {low.result && canTagLoser && low.result.profile?.id !== form.loser_id && (
            <span className="small muted">
              Sleeper: {low.result.displayName} scored {low.result.points} in {weekLabel(low.result.week)}.{' '}
              {low.result.profile
                ? <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, loser_id: low.result.profile.id, low_score: low.result.points }))}>Use it</button>
                : '(not linked to a member)'}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="f-their-fantasy-score">Their fantasy score</label>
          <input id="f-their-fantasy-score" type="number" step="0.01" value={form.low_score} onChange={set('low_score')} placeholder="e.g. 78.42" disabled={!canTagLoser && !canEditBet} />
        </div>
        <div className="field">
          <label htmlFor="f-stake">Stake ($)</label>
          <input id="f-stake" type="number" step="0.01" min="0" value={form.stake} onChange={set('stake')} disabled={!canEditBet} />
        </div>
        <div className="field">
          <label htmlFor="f-lock-picks-at">Lock picks at</label>
          <input id="f-lock-picks-at" type="datetime-local" value={form.lock_at} onChange={set('lock_at')} disabled={!isCommissioner} />
          <span className="small muted">Currently {formatDateTime(week.lock_at)}{isCommissioner ? '' : ' (commissioner only)'}</span>
        </div>
        <div className="field">
          <label htmlFor="f-parlay-result">Parlay result</label>
          <select id="f-parlay-result" value={form.parlay_result} onChange={set('parlay_result')} disabled={!canEditBet}>
            {['pending', 'won', 'lost', 'push', 'void'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {canEditBet && derived !== 'pending' && derived !== form.parlay_result && (
            <span className="small muted">Legs suggest: <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, parlay_result: derived }))}>{derived}</button></span>
          )}
        </div>
        <div className="field">
          <label htmlFor="f-actual-payout-if-won">Actual payout ($, if won)</label>
          <input id="f-actual-payout-if-won" type="number" step="0.01" min="0" value={form.payout} onChange={set('payout')} placeholder={suggestedPayout ? suggestedPayout.toFixed(2) : ''} disabled={!canEditBet} />
          {canEditBet && suggestedPayout && form.payout === '' && (
            <span className="small muted">
              At {parlayOdds(legs).decimal.toFixed(2)}x the book should pay {formatMoney(suggestedPayout)}.{' '}
              <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, payout: suggestedPayout.toFixed(2) }))}>Use it</button>
            </span>
          )}
        </div>
        <div className="field wide">
          <label htmlFor="f-notes">Notes</label>
          <textarea id="f-notes" rows={2} value={form.notes} onChange={set('notes')} placeholder="Book used, screenshot link, trash talk…" disabled={!canEditBet} />
        </div>
      </div>
      {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
      <div className="row between">
        {isCommissioner ? <button type="button" className="danger" onClick={remove}>Delete week</button> : <span />}
        <button type="submit" className="primary" disabled={busy || loserHasLeg}>{busy ? 'Saving…' : 'Save week'}</button>
      </div>
    </form>
  )
}
