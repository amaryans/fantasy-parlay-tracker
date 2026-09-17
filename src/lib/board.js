// Turns raw bookmaker rows into one line per outcome: the most common point
// (spread / total) across books, with the best price at that point.
export function summariseGame(game, oddsRows) {
  const markets = {}
  for (const market of ['h2h', 'spreads', 'totals']) {
    const mrows = oddsRows.filter((r) => r.market === market)
    const outcomes = [...new Set(mrows.map((r) => r.outcome))]
    markets[market] = outcomes.map((outcome) => bestLine(mrows.filter((r) => r.outcome === outcome), market, outcome))
  }
  for (const m of ['h2h', 'spreads']) {
    markets[m].sort((a, b) => (a.outcome === game.away_team ? -1 : b.outcome === game.away_team ? 1 : 0))
  }
  markets.totals.sort((a, b) => (a.outcome === 'Over' ? -1 : b.outcome === 'Over' ? 1 : 0))
  return { game, markets, fetchedAt: oddsRows[0]?.fetched_at }
}

// Best price for one outcome. If `point` is given (refreshing an existing leg)
// only books at that exact number count; otherwise use the consensus number.
export function bestLine(rows, market, outcome, point = undefined) {
  const orows = rows.filter((r) => r.market === market && r.outcome === outcome)
  let usePoint = point
  if (market !== 'h2h' && usePoint === undefined) {
    const counts = new Map()
    for (const r of orows) counts.set(r.point, (counts.get(r.point) || 0) + 1)
    usePoint = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const atPoint = market === 'h2h' ? orows : orows.filter((r) => Number(r.point) === Number(usePoint))
  const best = atPoint.reduce((acc, r) => (acc === null || r.price > acc.price ? r : acc), null)
  return { outcome, point: market === 'h2h' ? null : usePoint, price: best?.price ?? null, bookmaker: best?.bookmaker, books: atPoint.length }
}

export function summariseBoard(games, oddsRows) {
  const byGame = new Map()
  for (const row of oddsRows) {
    if (!byGame.has(row.game_id)) byGame.set(row.game_id, [])
    byGame.get(row.game_id).push(row)
  }
  return games.map((g) => summariseGame(g, byGame.get(g.id) || []))
}

export function formatPoint(p, market) {
  if (p === null || p === undefined) return ''
  const n = Number(p)
  if (market === 'spreads' || market === 'spread') return n > 0 ? `+${n}` : `${n}`
  return `${n}`
}

// Build the leg fields for a board line.
export function legFromLine(game, market, line) {
  const gameName = `${game.away_team} @ ${game.home_team}`
  let pick, type
  if (market === 'h2h') { pick = `${line.outcome} ML`; type = 'moneyline' }
  else if (market === 'spreads') { pick = `${line.outcome} ${formatPoint(line.point, market)}`; type = 'spread' }
  else { pick = `${line.outcome} ${formatPoint(line.point, market)}`; type = 'total' }
  return {
    game: gameName, market: type, pick, odds: line.price, game_id: game.id,
    odds_ref: { market, outcome: line.outcome, point: line.point },
  }
}
