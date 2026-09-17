import { formatAmerican } from '../lib/odds.js'

export function ResultBadge({ result }) {
  return <span className={`badge ${result}`}>{result}</span>
}

export function Odds({ value }) {
  const n = Number(value)
  const cls = value !== null && value !== undefined && n > 0 ? 'odds plus' : 'odds'
  return <span className={cls}>{formatAmerican(value)}</span>
}

const RESULTS = ['pending', 'won', 'lost', 'push', 'void']

export function ResultSelect({ value, onChange, disabled, label = 'Result' }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {RESULTS.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  )
}

export function MemberSelect({ id, value, onChange, profiles, placeholder = 'Select a member', exclude = [], disabled }) {
  return (
    <select id={id} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {profiles
        .filter((p) => !exclude.includes(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name}{p.team_name ? ` (${p.team_name})` : ''}
          </option>
        ))}
    </select>
  )
}
