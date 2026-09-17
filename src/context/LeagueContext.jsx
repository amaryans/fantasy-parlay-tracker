import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { bestLine } from '../lib/board.js'
import { loadSleeperLeague, lowestScorer } from '../lib/sleeper.js'
import { useAuth } from './AuthContext.jsx'

const LeagueContext = createContext(null)

// Loads the whole league dataset (it is tiny: a dozen members, ~20 weeks a
// season) and exposes the mutations every page needs. Pages call reload()
// after writing.
export function LeagueProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState({
    loading: true, error: null, settings: null, profiles: [], weeks: [], legs: [], games: [],
  })

  const reload = useCallback(async () => {
    if (!user) return
    const [settings, profiles, weeks, legs, games] = await Promise.all([
      supabase.from('league_settings').select('*').eq('id', 1).single(),
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('weeks').select('*').order('season', { ascending: false }).order('week', { ascending: false }),
      supabase.from('legs').select('*').order('created_at'),
      supabase.from('games').select('*').order('commence_time'),
    ])
    const failed = [settings, profiles, weeks, legs, games].find((r) => r.error)
    if (failed) {
      setState((s) => ({ ...s, loading: false, error: failed.error }))
      return
    }
    setState({
      loading: false,
      error: null,
      settings: settings.data,
      profiles: profiles.data,
      weeks: weeks.data,
      legs: legs.data,
      games: games.data,
    })
  }, [user])

  useEffect(() => {
    if (user) reload()
  }, [user, reload])

  const me = useMemo(() => state.profiles.find((p) => p.id === user?.id) ?? null, [state.profiles, user])
  const isCommissioner = Boolean(me?.is_commissioner)

  // ---- Sleeper -----------------------------------------------------------
  // Loaded once per league id; `sleeper.error` is set when the league id is
  // wrong or Sleeper is unreachable, and the app falls back to manual mode.
  const sleeperLeagueId = state.settings?.sleeper_league_id || null
  const [sleeper, setSleeper] = useState({ loading: false, error: null, league: null })
  useEffect(() => {
    if (!sleeperLeagueId) { setSleeper({ loading: false, error: null, league: null }); return }
    let active = true
    setSleeper({ loading: true, error: null, league: null })
    loadSleeperLeague(sleeperLeagueId)
      .then((league) => { if (active) setSleeper({ loading: false, error: null, league }) })
      .catch((err) => { if (active) setSleeper({ loading: false, error: err.message, league: null }) })
    return () => { active = false }
  }, [sleeperLeagueId])

  // Lowest scorer for a fantasy week, mapped to an app member when possible.
  const sleeperLowestScorer = useCallback(async (fantasyWeek) => {
    if (!sleeper.league) return null
    const low = await lowestScorer(sleeper.league.leagueId, fantasyWeek, sleeper.league.teams)
    if (!low) return null
    const profile = state.profiles.find((p) => p.sleeper_user_id === low.userId) ?? null
    return { ...low, profile }
  }, [sleeper.league, state.profiles])

  const profileById = useCallback((id) => state.profiles.find((p) => p.id === id) ?? null, [state.profiles])
  const nameOf = useCallback((id) => profileById(id)?.display_name ?? 'Unknown', [profileById])
  const legsForWeek = useCallback((weekId) => state.legs.filter((l) => l.week_id === weekId), [state.legs])
  const findWeek = useCallback(
    (season, week) => state.weeks.find((w) => w.season === Number(season) && w.week === Number(week)) ?? null,
    [state.weeks],
  )

  // ---- mutations ---------------------------------------------------------
  async function run(query) {
    const { data, error } = await query
    if (error) throw error
    await reload()
    return data
  }

  const api = {
    createWeek: (fields) =>
      run(supabase.from('weeks').insert({ ...fields, created_by: user.id }).select().single()),
    updateWeek: (id, fields) => run(supabase.from('weeks').update(fields).eq('id', id).select().single()),
    deleteWeek: (id) => run(supabase.from('weeks').delete().eq('id', id)),
    upsertLeg: (fields) =>
      run(
        supabase
          .from('legs')
          .upsert({ ...fields, entered_by: user.id }, { onConflict: 'week_id,user_id' })
          .select()
          .single(),
      ),
    updateLeg: (id, fields) => run(supabase.from('legs').update(fields).eq('id', id).select().single()),
    deleteLeg: (id) => run(supabase.from('legs').delete().eq('id', id)),
    updateSettings: (fields) => run(supabase.from('league_settings').update(fields).eq('id', 1).select().single()),
    updateProfile: (fields) => run(supabase.from('profiles').update(fields).eq('id', user.id).select().single()),
    // Commissioner only (RLS enforces it): edit any member's profile.
    updateMember: (id, fields) => run(supabase.from('profiles').update(fields).eq('id', id).select().single()),
  }

  // Re-price a leg that came from the odds board against the latest lines.
  async function refreshLegOdds(leg) {
    if (!leg.game_id || !leg.odds_ref) throw new Error('This leg was typed in by hand, so there is no line to refresh.')
    const { data, error } = await supabase.from('game_odds').select('*').eq('game_id', leg.game_id)
    if (error) throw error
    const { market, outcome, point } = leg.odds_ref
    const line = bestLine(data, market, outcome, market === 'h2h' ? undefined : point)
    if (line.price === null) throw new Error('No book is offering that exact line any more. Update the odds by hand.')
    if (line.price !== leg.odds) await api.updateLeg(leg.id, { odds: line.price })
    return line
  }

  // Odds rows can exceed Supabase's 1000-row page, so page through them.
  async function loadOddsForWeek(season, week) {
    const gameIds = state.games.filter((g) => g.season === season && g.week === week).map((g) => g.id)
    if (!gameIds.length) return []
    const rows = []
    const page = 1000
    for (let from = 0; ; from += page) {
      const { data, error } = await supabase
        .from('game_odds')
        .select('*')
        .in('game_id', gameIds)
        .order('id')
        .range(from, from + page - 1)
      if (error) throw error
      rows.push(...data)
      if (data.length < page) break
    }
    return rows
  }

  const value = {
    ...state, me, isCommissioner, sleeper, sleeperLowestScorer, refreshLegOdds,
    reload, profileById, nameOf, legsForWeek, findWeek, loadOddsForWeek, ...api,
  }
  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>
}

export function useLeague() {
  return useContext(LeagueContext)
}
