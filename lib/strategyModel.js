// ============================================================
//  Draft Strategy Board — projection model (server-side only)
//
//  Scoring recap (see supabase_schema.sql + pages/index.js):
//    a player's season score = sum of their drivers' finish positions,
//    minus 10 per race win. Lower is better. Because it is a season-long
//    sum, only a driver's *expected* finish matters — week-to-week variance
//    averages out over 36 races.
//
//  Projection method (chosen by backtesting on this league's own data):
//    1. Recency-weighted average finish across the available history
//       (most recent season weighted heaviest, weighted by races run).
//    2. Shrink toward the field average (regression to the mean).
//    3. Same treatment for win rate; expected fantasy points per race
//       = projected avg finish − 10 × projected win rate.
//  Extrapolating year-over-year trends was tested and made predictions
//  WORSE (improvement tends to reverse), so trends are shown, not projected.
// ============================================================

export const WIN_BONUS = 10
export const RACES_PER_SEASON = 36

// Recency weights: index 0 = most recent season of history.
const RECENCY_WEIGHTS = [0.55, 0.30, 0.15]
// Fraction of a driver's deviation from the field mean that we keep.
const SHRINK_MULTI_SEASON = 0.85
const SHRINK_ONE_SEASON   = 0.75
const SHRINK_WINS         = 0.70

export const TRACK_TYPES = {
  SS:    'Superspeedway',
  RC:    'Road / Street',
  SHORT: 'Short & Flat',
  INT:   'Intermediate',
}

// Names drift between seasons ("A.J." vs "AJ", "Stenhouse, Jr."), so match
// drivers across seasons on a normalized key instead of driver_id.
export function normalizeName(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,']/g, '')
    .replace(/\s+(jr|sr|ii|iii)$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Track names also drift (Atlanta became "EchoPark Speedway"), so classify
// by pattern. Order matters: the Charlotte Roval must hit RC before INT.
export function trackType(trackName) {
  const t = String(trackName || '').toLowerCase()
  if (/daytona|talladega|atlanta|echopark/.test(t)) return 'SS'
  if (/circuit of the americas|sonoma|glen|roval|road course|street|mexico|coronado/.test(t)) return 'RC'
  if (/martinsville|bristol|richmond|wilkesboro|phoenix|new hampshire|iowa|world wide|gateway|dover/.test(t)) return 'SHORT'
  return 'INT'
}

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
function stdev(a) {
  if (a.length < 2) return null
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}
function corr(xs, ys) {
  const n = xs.length
  if (n < 3) return null
  const mx = mean(xs), my = mean(ys)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}
const round = (x, d = 1) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d)

// ── Per-driver, per-season stat lines ───────────────────────────
// results: [{ key, year, week, finish, trackType }]
function buildSeasonStats(results) {
  const by = new Map() // key -> year -> finishes[]
  for (const r of results) {
    if (!by.has(r.key)) by.set(r.key, new Map())
    const ym = by.get(r.key)
    if (!ym.has(r.year)) ym.set(r.year, [])
    ym.get(r.year).push(r)
  }
  const out = new Map()
  for (const [key, ym] of by) {
    const seasons = {}
    for (const [year, rows] of ym) {
      const f = rows.map(r => r.finish)
      const half = Math.max(...rows.map(r => r.week)) / 2
      const byType = {}
      for (const tt of Object.keys(TRACK_TYPES)) {
        const x = rows.filter(r => r.trackType === tt).map(r => r.finish)
        byType[tt] = x.length ? { avg: mean(x), n: x.length } : null
      }
      seasons[year] = {
        races: f.length,
        avg:   mean(f),
        wins:  f.filter(x => x === 1).length,
        top5:  f.filter(x => x <= 5).length,
        top10: f.filter(x => x <= 10).length,
        bad:   f.filter(x => x >= 30).length,
        sd:    stdev(f),
        h1:    mean(rows.filter(r => r.week <= half).map(r => r.finish)),
        h2:    mean(rows.filter(r => r.week >  half).map(r => r.finish)),
        byType,
      }
    }
    out.set(key, seasons)
  }
  return out
}

// ── Core projection ─────────────────────────────────────────────
// Projects a driver for the season after `years[0]` using seasons in
// `years` (most recent first). Returns null fields for drivers with no data.
function projectOne(seasons, years, fieldMean, fieldWinRate, rookieAvg) {
  let wSum = 0, avgAcc = 0, winAcc = 0, used = 0
  years.forEach((y, i) => {
    const s = seasons?.[y]
    if (!s || !s.races || i >= RECENCY_WEIGHTS.length) return
    const w = RECENCY_WEIGHTS[i] * Math.min(1, s.races / RACES_PER_SEASON)
    wSum   += w
    avgAcc += w * s.avg
    winAcc += w * (s.wins / s.races)
    used++
  })
  if (!used) {
    return { projAvg: rookieAvg, projWinRate: 0, seasonsUsed: 0 }
  }
  const rawAvg  = avgAcc / wSum
  const rawWins = winAcc / wSum
  const k = used >= 2 ? SHRINK_MULTI_SEASON : SHRINK_ONE_SEASON
  return {
    projAvg:     fieldMean + k * (rawAvg - fieldMean),
    projWinRate: Math.max(0, fieldWinRate + SHRINK_WINS * (rawWins - fieldWinRate)),
    seasonsUsed: used,
  }
}

function fieldNumbers(stats, year) {
  const avgs = [], winRates = []
  for (const seasons of stats.values()) {
    const s = seasons[year]
    if (s?.races) { avgs.push(s.avg); winRates.push(s.wins / s.races) }
  }
  return { fieldMean: mean(avgs), fieldWinRate: mean(winRates) }
}

// Average first-season finish of drivers who debuted after the first year
// of history — used as the projection for drivers with no history.
function rookieBaseline(stats, histYears) {
  const firstYear = Math.min(...histYears)
  const debuts = []
  for (const seasons of stats.values()) {
    const ys = Object.keys(seasons).map(Number).sort((a, b) => a - b)
    if (ys.length && ys[0] > firstYear) debuts.push(seasons[ys[0]].avg)
  }
  return debuts.length ? mean(debuts) : 25
}

// Re-run the model as if the latest season hadn't happened, and score it
// against what actually happened. Also measure how well "keep improving"
// would have done, so the board can show the evidence for its method.
function backtest(stats, histYears) {
  if (histYears.length < 2) return null
  const [target, ...prior] = histYears
  const { fieldMean, fieldWinRate } = fieldNumbers(stats, prior[0])
  const rookie = rookieBaseline(stats, prior.length ? prior : histYears)
  const modelErr = [], naiveErr = [], trendErr = []
  const d1 = [], d2 = []
  for (const seasons of stats.values()) {
    const actual = seasons[target]
    if (!actual?.races || !seasons[prior[0]]?.races) continue
    const p = projectOne(seasons, prior, fieldMean, fieldWinRate, rookie)
    modelErr.push(Math.abs(actual.avg - p.projAvg))
    naiveErr.push(Math.abs(actual.avg - seasons[prior[0]].avg))
    if (prior[1] && seasons[prior[1]]?.races) {
      const last = seasons[prior[0]].avg, before = seasons[prior[1]].avg
      trendErr.push(Math.abs(actual.avg - (last + (last - before))))
      d1.push(last - before)
      d2.push(actual.avg - last)
    }
  }
  return {
    targetYear:    target,
    drivers:       modelErr.length,
    modelMae:      round(mean(modelErr), 2),
    lastSeasonMae: round(mean(naiveErr), 2),
    trendMae:      trendErr.length ? round(mean(trendErr), 2) : null,
    // Correlation between one year's change and the next year's change.
    // Negative = improvers tend to give some of it back.
    deltaCorr:     round(corr(d1, d2), 2),
    deltaPairs:    d1.length,
  }
}

// ── Public entry point ──────────────────────────────────────────
// raw = { seasons, drivers, races, results, sessions, picks, players }
//   (straight from Supabase; see pages/api/strategy/data.js)
export function buildStrategyModel(raw) {
  const seasonById = new Map(raw.seasons.map(s => [s.season_id, s]))
  const raceById   = new Map(raw.races.map(r => [r.race_id, r]))
  const driverById = new Map(raw.drivers.map(d => [d.driver_id, d]))

  // Seasons with completed races are history.
  const completeBySeason = new Map()
  for (const r of raw.races) if (r.is_complete) completeBySeason.set(r.season_id, (completeBySeason.get(r.season_id) || 0) + 1)

  // Target season: the active season if its draft hasn't finished;
  // otherwise we're between seasons and preparing for the next one.
  const active   = raw.seasons.find(s => s.is_active) || null
  const activeSession = active ? raw.sessions.find(s => s.season_id === active.season_id) : null
  const activeHasResults = active && completeBySeason.get(active.season_id) > 0
  const target = active && !activeHasResults && !(activeSession?.is_complete)
    ? { mode: activeSession ? 'live' : 'predraft', season: active, session: activeSession || null }
    : { mode: 'preview', season: null, session: null }

  const histSeasons = raw.seasons
    .filter(s => completeBySeason.get(s.season_id) > 0 && s.season_id !== target.season?.season_id)
    .sort((a, b) => b.season_year - a.season_year)
  const histYears = histSeasons.map(s => s.season_year)
  const latestYear = histYears[0]
  const targetYear = target.season?.season_year ?? (latestYear ? latestYear + 1 : new Date().getFullYear())

  // Flatten results.
  const results = []
  for (const rr of raw.results) {
    const race = raceById.get(rr.race_id)
    const drv  = driverById.get(rr.driver_id)
    if (!race || !drv || !race.is_complete) continue
    const season = seasonById.get(race.season_id)
    if (!season || !histYears.includes(season.season_year)) continue
    results.push({
      key:       normalizeName(drv.driver_name),
      year:      season.season_year,
      week:      race.week_number,
      finish:    rr.finish_position,
      trackType: trackType(race.track_name),
    })
  }
  const stats = buildSeasonStats(results)
  const { fieldMean, fieldWinRate } = fieldNumbers(stats, latestYear)
  const rookieAvg = rookieBaseline(stats, histYears)

  // Driver identity across seasons (latest name/car/team wins).
  const identity = new Map() // key -> { year -> driverRow }
  for (const d of raw.drivers) {
    const s = seasonById.get(d.season_id)
    if (!s) continue
    const key = normalizeName(d.driver_name)
    if (!identity.has(key)) identity.set(key, {})
    identity.get(key)[s.season_year] = d
  }

  // Pool: the target season's driver list if entered, else latest season's.
  const targetDrivers = target.season ? raw.drivers.filter(d => d.season_id === target.season.season_id) : []
  const poolSeasonId  = targetDrivers.length ? target.season.season_id : histSeasons[0]?.season_id
  const poolDrivers   = raw.drivers.filter(d => d.season_id === poolSeasonId)
  const poolFromTarget = targetDrivers.length > 0

  // League draft history (ADP) by normalized name.
  const sessionSeason = new Map(raw.sessions.map(s => [s.draft_session_id, seasonById.get(s.season_id)]))
  const adpByKey = new Map() // key -> { year: pick }
  const draftYears = new Set()
  for (const p of raw.picks) {
    const s = sessionSeason.get(p.draft_session_id)
    const d = driverById.get(p.driver_id)
    if (!s || !d || s.season_id === target.season?.season_id) continue
    draftYears.add(s.season_year)
    const key = normalizeName(d.driver_name)
    if (!adpByKey.has(key)) adpByKey.set(key, {})
    adpByKey.get(key)[s.season_year] = p.pick_number
  }
  const draftYearList = [...draftYears].sort((a, b) => b - a)
  const draftSlots = raw.sessions.find(s => s.season_id === target.season?.season_id)?.total_drivers
    || raw.sessions.slice().sort((a, b) => b.draft_session_id - a.draft_session_id)[0]?.total_drivers
    || 20
  const UNDRAFTED_ADP = draftSlots + 4

  let drivers = poolDrivers.map(d => {
    const key = normalizeName(d.driver_name)
    const seasons = stats.get(key) || {}
    const proj = projectOne(seasons, histYears, fieldMean, fieldWinRate, rookieAvg)
    const ids = identity.get(key) || {}
    const latestRow = ids[latestYear]
    const prevRow   = ids[histYears[1]]
    const teamNow   = d.team || latestRow?.team || null
    const teamThen  = poolFromTarget ? latestRow?.team : prevRow?.team
    const adpHist = adpByKey.get(key) || {}
    const adpVals = draftYearList.map(y => adpHist[y] ?? UNDRAFTED_ADP)
    const yearsDrafted = draftYearList.filter(y => adpHist[y] != null).length

    const last = seasons[histYears[0]]?.avg, prev = seasons[histYears[1]]?.avg, prev2 = seasons[histYears[2]]?.avg
    const typeAgg = {}
    for (const tt of Object.keys(TRACK_TYPES)) {
      let tot = 0, n = 0
      for (const y of histYears) {
        const b = seasons[y]?.byType?.[tt]
        if (b) { tot += b.avg * b.n; n += b.n }
      }
      typeAgg[tt] = n ? { avg: round(tot / n), n } : null
    }
    const careerRaces = histYears.reduce((s, y) => s + (seasons[y]?.races || 0), 0)
    const careerAvg = careerRaces
      ? histYears.reduce((s, y) => s + (seasons[y] ? seasons[y].avg * seasons[y].races : 0), 0) / careerRaces
      : null

    return {
      key,
      driverId:   d.driver_id,
      name:       d.driver_name,
      carNumber:  d.car_number,
      team:       teamNow,
      prevTeam:   teamThen || null,
      teamChanged: !!(teamThen && teamNow && teamThen !== teamNow),
      isRookie:   proj.seasonsUsed === 0,
      seasonsUsed: proj.seasonsUsed,
      seasons: Object.fromEntries(histYears.filter(y => seasons[y]).map(y => {
        const s = seasons[y]
        return [y, {
          races: s.races, avg: round(s.avg), wins: s.wins, top5: s.top5, top10: s.top10, bad: s.bad,
          sd: round(s.sd), h1: round(s.h1), h2: round(s.h2),
        }]
      })),
      careerAvg:   round(careerAvg),
      byType:      typeAgg,
      lastDelta:   last != null && prev != null ? round(last - prev) : null,   // negative = improved
      prevDelta:   prev != null && prev2 != null ? round(prev - prev2) : null,
      projAvg:     round(proj.projAvg, 2),
      projWinRate: round(proj.projWinRate, 4),
      projWins:    round(proj.projWinRate * RACES_PER_SEASON, 1),
      projPts:     round(proj.projAvg - WIN_BONUS * proj.projWinRate, 2),
      adp:         draftYearList.length ? round(mean(adpVals), 1) : null,
      adpByYear:   adpHist,
      yearsDrafted,
    }
  })

  // Rank, replacement level, value over replacement, value vs ADP, tiers.
  drivers.sort((a, b) => a.projPts - b.projPts)
  drivers.forEach((d, i) => { d.projRank = i + 1 })
  const replacement = drivers[Math.min(draftSlots, drivers.length - 1)]?.projPts ?? null
  const byLast = drivers.slice().sort((a, b) => (a.seasons[latestYear]?.avg ?? 99) - (b.seasons[latestYear]?.avg ?? 99))
  const lastRank = new Map(byLast.map((d, i) => [d.key, i + 1]))
  for (const d of drivers) d.lastSeasonRank = d.seasons[latestYear] ? lastRank.get(d.key) : null

  // ADP rank: where this league has historically drafted him (never-drafted
  // drivers tie at the back, ordered by last season's finish).
  drivers.slice()
    .sort((a, b) => (a.adp ?? 99) - (b.adp ?? 99) || (a.lastSeasonRank ?? 99) - (b.lastSeasonRank ?? 99))
    .forEach((d, i) => { d.adpRank = d.adp != null ? i + 1 : null })

  // "Market rank": how the league is likely to draft him NEXT time — his
  // draft history blended with last season's average finish (the number
  // people look at). Used only to simulate opponents' picks.
  for (const d of drivers) {
    d.marketScore = d.yearsDrafted > 0
      ? (d.adpRank + (d.lastSeasonRank ?? drivers.length)) / 2
      : (d.lastSeasonRank ?? drivers.length) + 2
    d.vorp = replacement != null ? round((replacement - d.projPts) * RACES_PER_SEASON, 0) : null
  }
  drivers.slice().sort((a, b) => a.marketScore - b.marketScore || a.projPts - b.projPts)
    .forEach((d, i) => { d.marketRank = i + 1 })

  // Sleeper signal: projection rank vs where this league has drafted him.
  // + = the league has historically taken him later than he projects.
  for (const d of drivers) d.valueVsAdp = d.adpRank != null ? d.adpRank - d.projRank : null

  // Tiers: break on a real gap, or once a tier spans too wide a range,
  // so a dense middle of the field doesn't collapse into one tier.
  let tier = 1, tierStart = drivers[0]?.projPts
  drivers.forEach((d, i) => {
    if (i > 0 && (d.projPts - drivers[i - 1].projPts >= 0.5 || d.projPts - tierStart > 1.5)) {
      tier++
      tierStart = d.projPts
    }
    d.tier = tier
  })

  // Schedule composition for context (target season's if entered, else latest).
  const schedSeasonId = target.season && raw.races.some(r => r.season_id === target.season.season_id)
    ? target.season.season_id : histSeasons[0]?.season_id
  const schedule = {}
  for (const r of raw.races.filter(r => r.season_id === schedSeasonId)) {
    const tt = trackType(r.track_name)
    schedule[tt] = (schedule[tt] || 0) + 1
  }

  // Live draft state for the target season.
  let draft = null
  if (target.season) {
    const players = raw.players
      .filter(p => p.season_id === target.season.season_id)
      .sort((a, b) => a.draft_position - b.draft_position)
      .map(p => ({ playerId: p.player_id, name: p.player_name, slot: p.draft_position }))
    const sess = target.session
    draft = {
      seasonId:     target.season.season_id,
      sessionId:    sess?.draft_session_id ?? null,
      totalPlayers: sess?.total_players ?? players.length,
      totalRounds:  sess?.total_rounds ?? (players.length ? Math.floor(draftSlots / players.length) : null),
      currentPick:  sess?.current_pick_num ?? 1,
      isComplete:   !!sess?.is_complete,
      players,
      picks: sess ? raw.picks
        .filter(p => p.draft_session_id === sess.draft_session_id)
        .sort((a, b) => a.pick_number - b.pick_number)
        .map(p => ({ pick: p.pick_number, playerId: p.player_id, driverId: p.driver_id, key: normalizeName(driverById.get(p.driver_id)?.driver_name) }))
        : [],
    }
  }
  const lastPlayers = histSeasons[0]
    ? raw.players.filter(p => p.season_id === histSeasons[0].season_id)
        .sort((a, b) => a.draft_position - b.draft_position)
        .map(p => ({ name: p.player_name, slot: p.draft_position }))
    : []

  return {
    generatedAt: new Date().toISOString(),
    mode:        target.mode,
    targetYear,
    historyYears: histYears,
    draftYears:   draftYearList,
    poolSource:  poolFromTarget ? `${targetYear} driver list` : `${latestYear} driver list (enter the ${targetYear} drivers in Admin → Drivers to update)`,
    draftSlots,
    leaguePlayers: lastPlayers,
    model: {
      recencyWeights: RECENCY_WEIGHTS.slice(0, histYears.length),
      shrink: SHRINK_MULTI_SEASON,
      fieldMean:    round(fieldMean, 2),
      fieldWinRate: round(fieldWinRate, 4),
      rookieAvg:    round(rookieAvg, 1),
      replacement,
      backtest:     backtest(stats, histYears),
    },
    schedule,
    drivers,
    draft,
  }
}

// Only the live draft state, for cheap polling during a draft.
export function buildDraftState(raw) {
  return buildStrategyModel(raw).draft
}
