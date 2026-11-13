import { supabase } from './supabase'

// ============================================================
//  Public league stats for one season.
//
//  Scoring (matches the update_scores_after_result trigger):
//    weekly base  = sum of finish positions of a player's drivers
//                   that week (a driver with no result adds 0)
//    weekly adj   = base − 10 × (number of that player's drivers who won)
//    lower is better.
//
//  Swaps and injury subs are resolved week by week, so a driver
//  only counts for a player in the weeks he was actually on the team.
// ============================================================

export const WIN_BONUS = 10

// Player colors follow the player (alphabetical by name), not the
// standings position, so a player keeps one color on every page.
// Validated as a set on the dark surface (#161616), all pairs:
// CVD ΔE 8.4, normal-vision ΔE 18.6, all ≥ 3:1 contrast.
// Order maps to players alphabetically: Andrea violet, Nancy pink, Steve amber, Tom teal.
export const PLAYER_PALETTE = ['#7a6ce0', '#d55181', '#c98500', '#20a4b8']
const OVERFLOW_COLOR = '#8a8a8a'

export function playerColorMap(players) {
  const names = [...new Set((players || []).map(p => p.player_name))].sort((a, b) => a.localeCompare(b))
  const map = {}
  names.forEach((n, i) => { map[n] = PLAYER_PALETTE[i] ?? OVERFLOW_COLOR })
  return map
}

// ── Loading ─────────────────────────────────────────────────────

async function fetchAllResults(seasonId) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('race_results')
      .select('race_result_id, race_id, driver_id, finish_position, races!inner(season_id)')
      .eq('races.season_id', seasonId)
      .order('race_result_id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export async function loadSeasonData(seasonId) {
  const [players, session, drivers, races, swaps, subs, results] = await Promise.all([
    supabase.from('players').select('player_id, player_name, draft_position').eq('season_id', seasonId).order('draft_position'),
    supabase.from('draft_sessions').select('draft_session_id, total_rounds, is_complete').eq('season_id', seasonId).maybeSingle(),
    supabase.from('drivers').select('driver_id, driver_name, car_number, team').eq('season_id', seasonId),
    supabase.from('races').select('race_id, week_number, race_name, track_name, race_date, is_complete').eq('season_id', seasonId).order('week_number'),
    supabase.from('driver_swaps').select('player_id, original_driver_id, swap_driver_id, start_week').eq('season_id', seasonId),
    supabase.from('driver_substitutions').select('player_id, original_driver_id, sub_driver_id, start_week, end_week').eq('season_id', seasonId),
    fetchAllResults(seasonId),
  ])
  const sess = session.data
  const picks = sess
    ? (await supabase.from('draft_picks')
        .select('draft_pick_id, player_id, driver_id, round_number, pick_number')
        .eq('draft_session_id', sess.draft_session_id)
        .order('pick_number')).data || []
    : []
  return {
    players: players.data || [],
    session: sess || null,
    drivers: drivers.data || [],
    races:   races.data || [],
    swaps:   swaps.data || [],
    subs:    subs.data || [],
    picks,
    results,
  }
}

// ── Helpers ─────────────────────────────────────────────────────

const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
export const round1 = x => (x == null || Number.isNaN(x) ? null : Math.round(x * 10) / 10)

export function effectiveDriver(pick, week, swaps, subs) {
  const swap = swaps.find(s => s.player_id === pick.player_id && s.original_driver_id === pick.driver_id && s.start_week <= week)
  if (swap) return { driverId: swap.swap_driver_id, label: 'swap' }
  const sub = subs.find(s => s.player_id === pick.player_id && s.original_driver_id === pick.driver_id &&
    s.start_week <= week && (s.end_week == null || s.end_week >= week))
  if (sub) return { driverId: sub.sub_driver_id, label: 'sub' }
  return { driverId: pick.driver_id, label: null }
}

function newLine() {
  return { starts: 0, base: 0, wins: 0, top5: 0, top10: 0, bad: 0, finishes: [] }
}
function addFinish(line, pos) {
  line.starts++; line.base += pos; line.finishes.push(pos)
  if (pos === 1) line.wins++
  if (pos <= 5) line.top5++
  if (pos <= 10) line.top10++
  if (pos >= 30) line.bad++
}
function finishLine(line) {
  return { ...line, adj: line.base - WIN_BONUS * line.wins, avgFinish: round1(avg(line.finishes)) }
}

// ── The model ───────────────────────────────────────────────────

export function computeSeasonStats(data) {
  const { players, drivers, races, swaps, subs, picks, results } = data
  const driverById = new Map(drivers.map(d => [d.driver_id, d]))
  const playerById = new Map(players.map(p => [p.player_id, p]))
  const colors = playerColorMap(players)

  const done = races.filter(r => r.is_complete).sort((a, b) => a.week_number - b.week_number)
  const resByRace = new Map()
  for (const r of results) {
    if (!resByRace.has(r.race_id)) resByRace.set(r.race_id, new Map())
    resByRace.get(r.race_id).set(r.driver_id, r.finish_position)
  }

  // Driver season lines (independent of ownership).
  const driverLines = new Map(drivers.map(d => [d.driver_id, newLine()]))
  const driverByWeek = new Map(drivers.map(d => [d.driver_id, []])) // [{week, pos}]
  for (const race of done) {
    for (const [did, pos] of resByRace.get(race.race_id) || []) {
      if (!driverLines.has(did)) { driverLines.set(did, newLine()); driverByWeek.set(did, []) }
      addFinish(driverLines.get(did), pos)
      driverByWeek.get(did).push({ week: race.week_number, pos })
    }
  }

  // Weekly player scores + per-slot contributions.
  const picksByPlayer = new Map(players.map(p => [p.player_id, []]))
  for (const pk of picks) picksByPlayer.get(pk.player_id)?.push(pk)
  for (const list of picksByPlayer.values()) list.sort((a, b) => a.round_number - b.round_number)

  const contrib = new Map() // `${playerId}:${pickId}:${driverId}` -> {line, label, firstWeek, lastWeek}
  const weeks = done.map(race => {
    const res = resByRace.get(race.race_id) || new Map()
    const scores = {}
    for (const p of players) {
      let base = 0, wins = 0, scored = 0
      for (const pk of picksByPlayer.get(p.player_id) || []) {
        const eff = effectiveDriver(pk, race.week_number, swaps, subs)
        const pos = res.get(eff.driverId)
        const key = `${p.player_id}:${pk.draft_pick_id}:${eff.driverId}`
        if (!contrib.has(key)) contrib.set(key, { playerId: p.player_id, pick: pk, driverId: eff.driverId, label: eff.label, line: newLine(), weeksOnTeam: 0, firstWeek: race.week_number })
        const c = contrib.get(key)
        c.weeksOnTeam++
        c.lastWeek = race.week_number
        if (pos != null) { base += pos; scored++; if (pos === 1) wins++; addFinish(c.line, pos) }
      }
      scores[p.player_id] = { base, wins, adj: base - WIN_BONUS * wins, scored }
    }
    return { race, week: race.week_number, scores }
  })

  // ── Season race (cumulative) ──
  const ids = players.map(p => p.player_id)
  const cum = Object.fromEntries(ids.map(id => [id, 0]))
  const raceSeries = weeks.map(w => {
    for (const id of ids) cum[id] += w.scores[id].adj
    const vals = ids.map(id => cum[id])
    const best = Math.min(...vals)
    const sorted = [...ids].sort((a, b) => cum[a] - cum[b])
    const pos = {}
    for (const id of ids) pos[id] = 1 + ids.filter(o => cum[o] < cum[id]).length
    return { week: w.week, race: w.race, cum: { ...cum }, gap: Object.fromEntries(ids.map(id => [id, cum[id] - best])), pos, order: sorted }
  })

  const raceSummary = Object.fromEntries(ids.map(id => [id, { weeksLed: 0, biggestLead: 0, biggestLeadWeek: null, bestPos: null, worstPos: null, biggestDeficit: 0 }]))
  let leadChanges = 0, prevSole = null
  for (const s of raceSeries) {
    const leaders = ids.filter(id => s.pos[id] === 1)
    for (const id of ids) {
      const r = raceSummary[id]
      if (s.pos[id] === 1) r.weeksLed++
      r.bestPos = r.bestPos == null ? s.pos[id] : Math.min(r.bestPos, s.pos[id])
      r.worstPos = r.worstPos == null ? s.pos[id] : Math.max(r.worstPos, s.pos[id])
      r.biggestDeficit = Math.max(r.biggestDeficit, s.gap[id])
    }
    if (leaders.length === 1 && ids.length > 1) {
      const lid = leaders[0]
      const margin = Math.min(...ids.filter(id => id !== lid).map(id => s.cum[id])) - s.cum[lid]
      if (margin > raceSummary[lid].biggestLead) { raceSummary[lid].biggestLead = margin; raceSummary[lid].biggestLeadWeek = s.week }
      if (prevSole != null && prevSole !== lid) leadChanges++
      prevSole = lid
    }
  }

  // ── Weekly wins ──
  const weekly = Object.fromEntries(ids.map(id => [id, { wins: 0, sharedWins: 0, lasts: 0, scores: [], best: null, worst: null, streak: 0, longestStreak: 0 }]))
  const weekWinners = []
  for (const w of weeks) {
    const vals = ids.map(id => w.scores[id].adj)
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const winners = ids.filter(id => w.scores[id].adj === lo)
    weekWinners.push({ week: w.week, race: w.race, winners, score: lo })
    for (const id of ids) {
      const s = weekly[id], sc = w.scores[id].adj
      s.scores.push(sc)
      if (!s.best || sc < s.best.score) s.best = { score: sc, week: w.week, race: w.race }
      if (!s.worst || sc > s.worst.score) s.worst = { score: sc, week: w.week, race: w.race }
      if (sc === lo) { s.wins++; if (winners.length > 1) s.sharedWins++; s.streak++; s.longestStreak = Math.max(s.longestStreak, s.streak) }
      else s.streak = 0
      if (sc === hi && hi !== lo) s.lasts++
    }
  }
  for (const id of ids) weekly[id].avg = round1(avg(weekly[id].scores))

  // ── Driver table (rank by adjusted, then average finish) ──
  const driverRows = drivers.map(d => ({ ...d, ...finishLine(driverLines.get(d.driver_id) || newLine()) }))
  const ranked = driverRows.filter(d => d.starts > 0)
    .sort((a, b) => a.adj - b.adj || a.avgFinish - b.avgFinish)
  ranked.forEach((d, i) => { d.rank = i + 1 })
  const unranked = driverRows.filter(d => !d.starts)
    .sort((a, b) => (parseInt(a.car_number, 10) || 999) - (parseInt(b.car_number, 10) || 999))
  const rankById = new Map(ranked.map(d => [d.driver_id, d.rank]))

  // Rank before the latest completed race, to show week-over-week movement.
  if (done.length >= 2) {
    const lastWeek = done[done.length - 1].week_number
    const prev = driverRows.map(d => {
      const last = (driverByWeek.get(d.driver_id) || []).find(x => x.week === lastWeek)
      const starts = d.starts - (last ? 1 : 0)
      const adj = d.adj - (last ? last.pos - (last.pos === 1 ? WIN_BONUS : 0) : 0)
      const base = d.base - (last ? last.pos : 0)
      return { id: d.driver_id, starts, adj, avg: starts ? base / starts : null }
    }).filter(x => x.starts > 0).sort((a, b) => a.adj - b.adj || a.avg - b.avg)
    const prevRank = new Map(prev.map((x, i) => [x.id, i + 1]))
    for (const d of driverRows) d.prevRank = prevRank.get(d.driver_id) ?? null
  }

  // Ownership as of the latest completed week (or draft day).
  const nowWeek = done.length ? done[done.length - 1].week_number : 0
  const owner = new Map() // driverId -> { playerId, label }
  for (const pk of picks) {
    const eff = effectiveDriver(pk, nowWeek, swaps, subs)
    owner.set(eff.driverId, { playerId: pk.player_id, label: eff.label })
    if (eff.label === 'sub' && !owner.has(pk.driver_id)) owner.set(pk.driver_id, { playerId: pk.player_id, label: 'injured' })
  }
  for (const d of [...ranked, ...unranked]) d.owner = owner.get(d.driver_id) || null

  // ── Team breakdown ──
  const teams = players.map(p => {
    const rows = [...contrib.values()]
      .filter(c => c.playerId === p.player_id && c.weeksOnTeam > 0)
      .map(c => ({
        ...finishLine(c.line),
        driver: driverById.get(c.driverId) || { driver_name: 'Unknown', car_number: '' },
        key: `${c.pick.draft_pick_id}:${c.driverId}`,
        driverId: c.driverId, label: c.label, round: c.pick.round_number, pickNumber: c.pick.pick_number,
        weeksOnTeam: c.weeksOnTeam, firstWeek: c.firstWeek, lastWeek: c.lastWeek,
        contiguous: c.lastWeek - c.firstWeek + 1 === c.weeksOnTeam,
        fullSeason: c.weeksOnTeam === weeks.length,
      }))
      .sort((a, b) => a.round - b.round || a.firstWeek - b.firstWeek)
    const counted = rows.filter(r => r.starts > 0)
    // Best/worst only among drivers with a real sample (5+ races), so a
    // one-week injury sub can't take the title.
    const eligible = counted.filter(r => r.starts >= 5)
    const byAvg = [...(eligible.length >= 2 ? eligible : counted)].sort((a, b) => a.avgFinish - b.avgFinish)
    const total = weeks.reduce((s, w) => s + w.scores[p.player_id].adj, 0)
    return {
      player: p, rows, total,
      best: byAvg[0]?.key ?? null,
      worst: byAvg.length > 1 ? byAvg[byAvg.length - 1].key : null,
      wins: counted.reduce((s, r) => s + r.wins, 0),
      top5: counted.reduce((s, r) => s + r.top5, 0),
      top10: counted.reduce((s, r) => s + r.top10, 0),
      bad: counted.reduce((s, r) => s + r.bad, 0),
      avgFinish: round1(avg(counted.flatMap(r => r.finishes))),
    }
  })

  // ── Hot & cold ──
  const FORM_N = 5
  const formWeeks = weeks.slice(-FORM_N).map(w => w.week)
  const formReady = weeks.length >= FORM_N + 3
  const formSet = new Set(formWeeks)
  const playerForm = players.map(p => {
    const recent = weeks.filter(w => formSet.has(w.week)).map(w => w.scores[p.player_id].adj)
    const earlier = weeks.filter(w => !formSet.has(w.week)).map(w => w.scores[p.player_id].adj)
    const r = avg(recent), e = avg(earlier)
    return { player: p, recent: round1(r), earlier: round1(e), delta: r != null && e != null ? round1(e - r) : null,
      last: weeks.slice(-FORM_N).map(w => ({ week: w.week, adj: w.scores[p.player_id].adj, won: weekWinners.find(x => x.week === w.week)?.winners.includes(p.player_id) })) }
  }).sort((a, b) => (a.recent ?? 1e9) - (b.recent ?? 1e9))
  const driverForm = drivers.map(d => {
    const all = driverByWeek.get(d.driver_id) || []
    const recent = all.filter(x => formSet.has(x.week)).map(x => x.pos)
    const earlier = all.filter(x => !formSet.has(x.week)).map(x => x.pos)
    if (recent.length < 3 || earlier.length < 3) return null
    const r = avg(recent), e = avg(earlier)
    return { driver: d, recent: round1(r), earlier: round1(e), delta: round1(e - r), owner: owner.get(d.driver_id) || null, finishes: all.filter(x => formSet.has(x.week)) }
  }).filter(Boolean)

  // ── Draft slots (for Draft Performance / Efficiency) ──
  // Each pick slot shows the driver in it as of the latest week (a swap or
  // active sub replaces the drafted driver), like the original views.
  const draftSlots = picks.map(pk => {
    const eff = effectiveDriver(pk, nowWeek, swaps, subs)
    const d = driverRows.find(x => x.driver_id === eff.driverId)
    return { pick: pk, driver: d || driverById.get(eff.driverId) || null, replaced: eff.driverId !== pk.driver_id }
  })

  return {
    players, colors, weeks, completed: weeks.length, totalRaces: races.length, nowWeek,
    raceSeries, raceSummary, leadChanges,
    weekly, weekWinners,
    drivers: [...ranked, ...unranked], rankedCount: ranked.length,
    teams,
    form: { ready: formReady, n: FORM_N, weeks: formWeeks, players: playerForm, drivers: driverForm },
    draftSlots, rounds: Math.max(0, ...picks.map(p => p.round_number)),
    hasDraft: picks.length > 0,
    playerById,
  }
}
