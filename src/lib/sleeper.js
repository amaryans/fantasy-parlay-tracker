// Read-only Sleeper API client. No key needed; the API allows browser calls.
// Docs: https://docs.sleeper.com

const BASE = 'https://api.sleeper.app/v1'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Sleeper ${res.status} for ${path}`)
  return res.json()
}

export const sleeper = {
  state: () => get('/state/nfl'),
  league: (leagueId) => get(`/league/${leagueId}`),
  users: (leagueId) => get(`/league/${leagueId}/users`),
  rosters: (leagueId) => get(`/league/${leagueId}/rosters`),
  matchups: (leagueId, week) => get(`/league/${leagueId}/matchups/${week}`),
}

// Everything the app needs about a league in one call: league info, the
// teams (user + roster joined), and the current NFL week.
export async function loadSleeperLeague(leagueId) {
  const [state, league, users, rosters] = await Promise.all([
    sleeper.state(), sleeper.league(leagueId), sleeper.users(leagueId), sleeper.rosters(leagueId),
  ])
  const userById = new Map(users.map((u) => [u.user_id, u]))
  const teams = rosters
    .map((r) => {
      const u = userById.get(r.owner_id)
      return {
        rosterId: r.roster_id,
        userId: r.owner_id,
        displayName: u?.display_name ?? `Roster ${r.roster_id}`,
        teamName: u?.metadata?.team_name ?? null,
        wins: r.settings?.wins ?? 0,
        losses: r.settings?.losses ?? 0,
      }
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  return {
    leagueId,
    name: league.name,
    season: Number(league.season),
    status: league.status,
    // Sleeper's `week` is the current NFL week; during preseason it is still 1.
    currentWeek: state.season_type === 'regular' || state.season_type === 'post' ? Number(state.week) : 1,
    seasonType: state.season_type,
    teams,
  }
}

// Lowest-scoring roster for a fantasy week. Returns null if the week has no
// scores yet (all zeros), which is what Sleeper reports before games kick off.
export async function lowestScorer(leagueId, week, teams) {
  if (!week || week < 1) return null
  const matchups = await sleeper.matchups(leagueId, week)
  const scored = matchups.filter((m) => m.points !== null && m.points !== undefined)
  if (!scored.length || scored.every((m) => Number(m.points) === 0)) return null
  const teamByRoster = new Map(teams.map((t) => [t.rosterId, t]))
  let low = null
  for (const m of scored) {
    const team = teamByRoster.get(m.roster_id)
    if (!team?.userId) continue
    if (!low || Number(m.points) < low.points) low = { ...team, points: Number(m.points), week }
  }
  return low
}
