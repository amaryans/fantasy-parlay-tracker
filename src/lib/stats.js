import { americanToDecimal, impliedProbability, isCountedLeg, parlayOdds } from './odds.js'

// Per-member picking stats and parlay-placing stats, computed client side.
export function computeMemberStats({ profiles, weeks, legs }) {
  const byUser = new Map()
  for (const p of profiles) {
    byUser.set(p.id, {
      profile: p,
      legs: 0, won: 0, lost: 0, push: 0, pending: 0,
      hitRate: null,
      avgOdds: null,
      avgImplied: null,
      edge: null,            // actual hit rate minus average implied probability
      currentStreak: 0,      // positive = wins in a row, negative = losses
      bestStreak: 0,
      timesLoser: 0,
      parlaysWon: 0, parlaysLost: 0, parlaysPending: 0,
      staked: 0, returned: 0, net: 0,
      // A member "sank" a parlay when their leg lost (regardless of others).
      parlaysSunk: 0,
    })
  }

  const weekById = new Map(weeks.map((w) => [w.id, w]))
  const legsByWeek = new Map()
  for (const l of legs) {
    if (!legsByWeek.has(l.week_id)) legsByWeek.set(l.week_id, [])
    legsByWeek.get(l.week_id).push(l)
  }

  // Legs, in chronological order for streaks.
  const orderedLegs = [...legs].sort((a, b) => {
    const wa = weekById.get(a.week_id), wb = weekById.get(b.week_id)
    return (wa?.season - wb?.season) || (wa?.week - wb?.week) || 0
  })

  const oddsAcc = new Map()
  for (const leg of orderedLegs) {
    const s = byUser.get(leg.user_id)
    if (!s) continue
    s.legs += 1
    if (leg.result === 'won') s.won += 1
    else if (leg.result === 'lost') s.lost += 1
    else if (leg.result === 'push' || leg.result === 'void') s.push += 1
    else s.pending += 1

    if (leg.odds !== null && leg.odds !== undefined) {
      const acc = oddsAcc.get(leg.user_id) || { dec: 0, imp: 0, n: 0 }
      acc.dec += americanToDecimal(leg.odds)
      acc.imp += impliedProbability(leg.odds)
      acc.n += 1
      oddsAcc.set(leg.user_id, acc)
    }

    if (leg.result === 'won') {
      s.currentStreak = s.currentStreak > 0 ? s.currentStreak + 1 : 1
      s.bestStreak = Math.max(s.bestStreak, s.currentStreak)
    } else if (leg.result === 'lost') {
      s.currentStreak = s.currentStreak < 0 ? s.currentStreak - 1 : -1
      s.parlaysSunk += 1
    }
  }

  for (const [id, s] of byUser) {
    const settled = s.won + s.lost
    s.hitRate = settled ? s.won / settled : null
    const acc = oddsAcc.get(id)
    if (acc && acc.n) {
      s.avgOdds = decimalToAmericanSafe(acc.dec / acc.n)
      s.avgImplied = acc.imp / acc.n
      s.edge = s.hitRate !== null ? s.hitRate - s.avgImplied : null
    }
  }

  for (const w of weeks) {
    if (!w.loser_id) continue
    const s = byUser.get(w.loser_id)
    if (!s) continue
    s.timesLoser += 1
    const stake = Number(w.stake) || 0
    if (w.parlay_result === 'won') {
      s.parlaysWon += 1
      s.staked += stake
      const payout = w.payout !== null && w.payout !== undefined
        ? Number(w.payout)
        : (parlayOdds(legsByWeek.get(w.id) || []).decimal || 0) * stake
      s.returned += payout
    } else if (w.parlay_result === 'lost') {
      s.parlaysLost += 1
      s.staked += stake
    } else if (w.parlay_result === 'push' || w.parlay_result === 'void') {
      s.staked += stake
      s.returned += stake
    } else {
      s.parlaysPending += 1
    }
    s.net = s.returned - s.staked
  }

  return [...byUser.values()]
}

function decimalToAmericanSafe(dec) {
  if (!dec || dec <= 1) return null
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1))
}

export function computeLeagueStats({ weeks, legs }) {
  const legsByWeek = new Map()
  for (const l of legs) {
    if (!legsByWeek.has(l.week_id)) legsByWeek.set(l.week_id, [])
    legsByWeek.get(l.week_id).push(l)
  }
  let placed = 0, won = 0, lost = 0, staked = 0, returned = 0
  let biggestHit = null
  for (const w of weeks) {
    if (w.parlay_result === 'pending') continue
    const stake = Number(w.stake) || 0
    placed += 1
    staked += stake
    if (w.parlay_result === 'won') {
      won += 1
      const wl = legsByWeek.get(w.id) || []
      const payout = w.payout !== null && w.payout !== undefined
        ? Number(w.payout)
        : (parlayOdds(wl).decimal || 0) * stake
      returned += payout
      if (!biggestHit || payout > biggestHit.payout) biggestHit = { week: w, payout }
    } else if (w.parlay_result === 'lost') {
      lost += 1
    } else {
      returned += stake
    }
  }
  const settledLegs = legs.filter((l) => l.result === 'won' || l.result === 'lost')
  const wonLegs = legs.filter((l) => l.result === 'won').length
  return {
    placed, won, lost, staked, returned, net: returned - staked, biggestHit,
    legHitRate: settledLegs.length ? wonLegs / settledLegs.length : null,
    totalLegs: legs.filter(isCountedLeg).length,
  }
}

// Sort for the leaderboard: hit rate desc (min 3 settled legs to rank),
// then wins, then fewer losses.
export function rankMembers(stats) {
  return [...stats].sort((a, b) => {
    const aq = a.won + a.lost >= 3, bq = b.won + b.lost >= 3
    if (aq !== bq) return aq ? -1 : 1
    if ((b.hitRate ?? -1) !== (a.hitRate ?? -1)) return (b.hitRate ?? -1) - (a.hitRate ?? -1)
    if (b.won !== a.won) return b.won - a.won
    if (a.lost !== b.lost) return a.lost - b.lost
    return a.profile.display_name.localeCompare(b.profile.display_name)
  })
}
