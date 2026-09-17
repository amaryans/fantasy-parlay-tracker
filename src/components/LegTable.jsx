import { useState } from 'react'
import { useLeague } from '../context/LeagueContext.jsx'
import { parseAmerican } from '../lib/odds.js'
import { isLocked } from '../lib/week.js'
import { Odds, ResultBadge, ResultSelect } from './Badges.jsx'
import LegForm from './LegForm.jsx'

const MARKET_LABEL = { spread: 'Spread', moneyline: 'ML', total: 'Total', prop: 'Prop', other: 'Other' }

// Every member gets a row, so it is obvious who still owes a pick.
export default function LegTable({ week, editable = true }) {
  const { me, profiles, settings, legsForWeek, updateLeg, deleteLeg } = useLeague()
  const [editing, setEditing] = useState(null)   // leg id being edited
  const [addingFor, setAddingFor] = useState(null) // user id
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const legs = legsForWeek(week.id)
  const locked = isLocked(week)
  const legByUser = new Map(legs.map((l) => [l.user_id, l]))

  const rows = profiles
    .filter((p) => settings?.loser_adds_leg || p.id !== week.loser_id)
    .map((p) => ({ profile: p, leg: legByUser.get(p.id) ?? null }))
    .sort((a, b) => {
      if (a.profile.id === me.id) return -1
      if (b.profile.id === me.id) return 1
      return a.profile.display_name.localeCompare(b.profile.display_name)
    })

  async function act(id, fn) {
    setBusy(id)
    setError(null)
    try { await fn() } catch (err) { setError(err.message) } finally { setBusy(null) }
  }

  async function setOdds(leg, raw) {
    const parsed = parseAmerican(raw)
    if (Number.isNaN(parsed)) { setError('Odds should look like -110 or +150.'); return }
    if (parsed === leg.odds) return
    await act(leg.id, () => updateLeg(leg.id, { odds: parsed }))
  }

  return (
    <div className="stack">
      {error && <div className="banner error">{error}</div>}
      <div className="table-wrap">
        <table className="legs-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Pick</th>
              <th className="num">Odds</th>
              <th>Result</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ profile, leg }) => (
              <tr key={profile.id} className={profile.id === me.id ? 'me' : ''}>
                <td className="nowrap member">
                  {profile.display_name}
                  {profile.id === me.id && <span className="muted small"> (you)</span>}
                </td>
                <td className="pick">
                  {leg ? (
                    <>
                      <div>{leg.pick}</div>
                      <div className="muted small">
                        {leg.game ? `${leg.game} · ` : ''}{MARKET_LABEL[leg.market]}
                      </div>
                    </>
                  ) : (
                    <span className="muted">No pick yet</span>
                  )}
                </td>
                <td className="num odds-cell">
                  {leg && editable && !locked ? (
                    <input
                      aria-label={`Odds for ${profile.display_name}`}
                      key={leg.odds ?? 'blank'}
                      defaultValue={leg.odds ?? ''}
                      placeholder="—"
                      inputMode="numeric"
                      style={{ width: '5.5rem', textAlign: 'right' }}
                      onBlur={(e) => setOdds(leg, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                    />
                  ) : leg ? <Odds value={leg.odds} /> : '—'}
                </td>
                <td className="result-cell">
                  {leg && editable ? (
                    <ResultSelect
                      label={`Result for ${profile.display_name}`}
                      value={leg.result}
                      disabled={busy === leg.id}
                      onChange={(r) => act(leg.id, () => updateLeg(leg.id, { result: r }))}
                    />
                  ) : leg ? <ResultBadge result={leg.result} /> : null}
                </td>
                {editable && (
                  <td className="nowrap right actions">
                    {leg && !locked && (
                      <>
                        <button className="small" onClick={() => setEditing(editing === leg.id ? null : leg.id)}>Edit</button>
                        <button
                          className="small danger"
                          disabled={busy === leg.id}
                          onClick={() => { if (confirm(`Remove ${profile.display_name}'s leg?`)) act(leg.id, () => deleteLeg(leg.id)) }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {!leg && !locked && (
                      <button className="small primary" onClick={() => setAddingFor(addingFor === profile.id ? null : profile.id)}>
                        {profile.id === me.id ? 'Add my leg' : 'Enter for them'}
                      </button>
                    )}
                    {locked && <span className="badge locked">locked</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="card">
          <h3>Edit leg</h3>
          <LegForm week={week} leg={legs.find((l) => l.id === editing)} onDone={() => setEditing(null)} />
        </div>
      )}
      {addingFor && (
        <div className="card">
          <h3>{addingFor === me.id ? 'Your leg' : `Leg for ${profiles.find((p) => p.id === addingFor)?.display_name}`}</h3>
          <LegForm week={week} forUserId={addingFor} onDone={() => setAddingFor(null)} />
        </div>
      )}
    </div>
  )
}
