// Helpers for American odds and parlay math.

export function americanToDecimal(odds) {
  const a = Number(odds)
  if (!a || Number.isNaN(a)) return null
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a)
}

export function decimalToAmerican(dec) {
  if (!dec || dec <= 1) return null
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1))
}

export function impliedProbability(odds) {
  const a = Number(odds)
  if (!a || Number.isNaN(a)) return null
  return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100)
}

export function formatAmerican(odds) {
  if (odds === null || odds === undefined || odds === '') return '—'
  const a = Number(odds)
  if (Number.isNaN(a)) return '—'
  return a > 0 ? `+${a}` : `${a}`
}

// Parse user input like "+150", "150", "-110", "EVEN" into an American int.
export function parseAmerican(input) {
  if (input === null || input === undefined) return null
  const s = String(input).trim().toUpperCase()
  if (s === '') return null
  if (s === 'EV' || s === 'EVEN' || s === 'PK') return 100
  const n = Number(s.replace(/^\+/, ''))
  if (Number.isNaN(n) || !Number.isInteger(n)) return NaN
  if (n > -100 && n < 100) return NaN
  return n
}

// Pushed and voided legs drop out of the parlay (standard sportsbook rule).
export function isCountedLeg(leg) {
  return leg.result !== 'push' && leg.result !== 'void'
}

export function parlayOdds(legs) {
  const counted = legs.filter(isCountedLeg)
  const priced = counted.filter((l) => l.odds !== null && l.odds !== undefined)
  const decimal = priced.reduce((acc, l) => acc * americanToDecimal(l.odds), 1)
  return {
    decimal: priced.length ? decimal : null,
    american: priced.length ? decimalToAmerican(decimal) : null,
    legCount: counted.length,
    pricedCount: priced.length,
    missingOdds: counted.length - priced.length,
  }
}

// Derive the parlay outcome from the legs. Returns 'pending' until every
// leg is settled.
export function deriveParlayResult(legs) {
  if (!legs.length) return 'pending'
  if (legs.some((l) => l.result === 'lost')) return 'lost'
  if (legs.some((l) => l.result === 'pending')) return 'pending'
  const counted = legs.filter(isCountedLeg)
  if (!counted.length) return 'push'
  return 'won'
}

export function potentialPayout(stake, legs) {
  const { decimal } = parlayOdds(legs)
  if (!decimal || !stake) return null
  return Number(stake) * decimal
}

export function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n))
}

export function formatPct(p, digits = 0) {
  if (p === null || p === undefined || Number.isNaN(p)) return '—'
  return `${(p * 100).toFixed(digits)}%`
}
