import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.jsx'
import { deriveParlayResult, formatMoney, parlayOdds, potentialPayout } from '../lib/odds.js'
import { formatDateTime, isLocked, toLocalInputValue, weekLabel } from '../lib/week.js'
import { MemberSelect, ResultBadge } from '../components/Badges.jsx'
import LegForm from '../components/LegForm.jsx'
import LegTable from '../components/LegTable.jsx'
import ParlaySummary from '../components/ParlaySummary.jsx'

export default function WeekDetail() {
  const { season, week: weekNum } = useParams()
  const { findWeek, legsForWeek, profiles, settings, me, updateWeek, deleteWeek } = useLeague()
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
  const expected = profiles.filter((p) => settings.loser_adds_leg || p.id !== week.loser_id).length
  const myLeg = legs.find((l) => l.user_id === me.id)
  const iAmLoser = week.loser_id === me.id && !settings.loser_adds_leg

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
        <ParlaySummary legs={legs} stake={week.stake} expectedLegs={expected} />
      </div>

      {prefill && !iAmLoser && (
        <div className="card">
          <h3>{myLeg ? 'Replace your leg with this line' : 'Your leg from the odds board'}</h3>
          <LegForm
            week={week}
            leg={myLeg ?? null}
            prefill={prefill}
            forUserId={me.id}
            onDone={() => setPrefill(null)}
          />
        </div>
      )}
      {prefill && iAmLoser && (
        <div className="card">
          <h3>Enter this line for someone</h3>
          <p className="muted small">You're placing the parlay this week, so this leg has to belong to someone else.</p>
          <LegForm week={week} prefill={prefill} allowMemberChoice onDone={() => setPrefill(null)} />
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Legs</h2>
          <Link to={`/board?season=${week.season}&week=${week.week}`} className="small">Odds board</Link>
        </div>
        <LegTable week={week} />
      </div>

      <WeekSettings week={week} legs={legs} profiles={profiles} updateWeek={updateWeek} deleteWeek={deleteWeek} navigate={navigate} derived={derived} />
    </div>
  )
}

function WeekSettings({ week, legs, profiles, updateWeek, deleteWeek, navigate, derived }) {
  const [form, setForm] = useState({
    loser_id: week.loser_id,
    low_score: week.low_score ?? '',
    stake: week.stake,
    lock_at: toLocalInputValue(week.lock_at),
    parlay_result: week.parlay_result,
    payout: week.payout ?? '',
    notes: week.notes ?? '',
  })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setForm({
      loser_id: week.loser_id,
      low_score: week.low_score ?? '',
      stake: week.stake,
      lock_at: toLocalInputValue(week.lock_at),
      parlay_result: week.parlay_result,
      payout: week.payout ?? '',
      notes: week.notes ?? '',
    })
  }, [week])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const suggestedPayout = potentialPayout(form.stake, legs)
  const loserHasLeg = form.loser_id && legs.some((l) => l.user_id === form.loser_id)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await updateWeek(week.id, {
        loser_id: form.loser_id || null,
        low_score: form.low_score === '' ? null : Number(form.low_score),
        stake: Number(form.stake) || 0,
        lock_at: form.lock_at ? new Date(form.lock_at).toISOString() : null,
        parlay_result: form.parlay_result,
        payout: form.payout === '' ? null : Number(form.payout),
        notes: form.notes.trim() || null,
      })
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
      <div className="form-grid">
        <div className="field">
          <label htmlFor="f-placing-the-parlay-lowest-score">Placing the parlay (lowest score)</label>
          <MemberSelect id="f-placing-the-parlay-lowest-score" value={form.loser_id} onChange={(v) => setForm((f) => ({ ...f, loser_id: v }))} profiles={profiles} placeholder="Not decided" />
          {loserHasLeg && <span className="small error">This member already has a leg this week. Remove it first.</span>}
        </div>
        <div className="field">
          <label htmlFor="f-their-fantasy-score">Their fantasy score</label>
          <input id="f-their-fantasy-score" type="number" step="0.01" value={form.low_score} onChange={set('low_score')} placeholder="e.g. 78.42" />
        </div>
        <div className="field">
          <label htmlFor="f-stake">Stake ($)</label>
          <input id="f-stake" type="number" step="0.01" min="0" value={form.stake} onChange={set('stake')} />
        </div>
        <div className="field">
          <label htmlFor="f-lock-picks-at">Lock picks at</label>
          <input id="f-lock-picks-at" type="datetime-local" value={form.lock_at} onChange={set('lock_at')} />
          <span className="small muted">Currently {formatDateTime(week.lock_at)}</span>
        </div>
        <div className="field">
          <label htmlFor="f-parlay-result">Parlay result</label>
          <select id="f-parlay-result" value={form.parlay_result} onChange={set('parlay_result')}>
            {['pending', 'won', 'lost', 'push', 'void'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {derived !== 'pending' && derived !== form.parlay_result && (
            <span className="small muted">Legs suggest: <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, parlay_result: derived }))}>{derived}</button></span>
          )}
        </div>
        <div className="field">
          <label htmlFor="f-actual-payout-if-won">Actual payout ($, if won)</label>
          <input id="f-actual-payout-if-won" type="number" step="0.01" min="0" value={form.payout} onChange={set('payout')} placeholder={suggestedPayout ? suggestedPayout.toFixed(2) : ''} />
          {suggestedPayout && form.payout === '' && (
            <span className="small muted">
              At {parlayOdds(legs).decimal.toFixed(2)}x the book should pay {formatMoney(suggestedPayout)}.{' '}
              <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, payout: suggestedPayout.toFixed(2) }))}>Use it</button>
            </span>
          )}
        </div>
        <div className="field wide">
          <label htmlFor="f-notes">Notes</label>
          <textarea id="f-notes" rows={2} value={form.notes} onChange={set('notes')} placeholder="Book used, screenshot link, trash talk…" />
        </div>
      </div>
      {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
      <div className="row between">
        <button type="button" className="danger" onClick={remove}>Delete week</button>
        <button type="submit" className="primary" disabled={busy || loserHasLeg}>{busy ? 'Saving…' : 'Save week'}</button>
      </div>
    </form>
  )
}
