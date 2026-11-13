import { getAdminUser, hasValidUnlock, isConfigured, noStore, serverSupabase } from '../../../lib/strategyAuth'
import { buildStrategyModel, buildDraftState } from '../../../lib/strategyModel'

// Supabase caps each response at 1000 rows, so page through big tables.
async function fetchAll(sb, table, columns) {
  const size = 1000
  let from = 0, rows = []
  for (;;) {
    const { data, error } = await sb.from(table).select(columns).order(columns.split(',')[0].trim()).range(from, from + size - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows = rows.concat(data || [])
    if (!data || data.length < size) return rows
    from += size
  }
}

// GET            → full model (projections + draft state)
// GET ?live=1    → draft state only (cheap; polled during a live draft)
export default async function handler(req, res) {
  noStore(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Strategy board password is not configured on the server (STRATEGY_BOARD_PASSWORD).' })
  }

  const user = await getAdminUser(req)
  if (!user) return res.status(401).json({ error: 'Admin login required.', code: 'login' })
  if (!hasValidUnlock(req, user.id)) return res.status(403).json({ error: 'Locked.', code: 'locked' })

  const live = req.query.live === '1'
  try {
    const sb = serverSupabase()
    const [seasons, drivers, races, sessions, picks, players, results] = await Promise.all([
      fetchAll(sb, 'seasons',        'season_id, season_year, season_name, is_active'),
      fetchAll(sb, 'drivers',        'driver_id, season_id, driver_name, car_number, team'),
      fetchAll(sb, 'races',          'race_id, season_id, week_number, track_name, is_complete'),
      fetchAll(sb, 'draft_sessions', 'draft_session_id, season_id, total_drivers, total_players, total_rounds, current_pick_num, is_complete'),
      fetchAll(sb, 'draft_picks',    'draft_pick_id, draft_session_id, player_id, driver_id, pick_number'),
      fetchAll(sb, 'players',        'player_id, season_id, player_name, draft_position'),
      live ? Promise.resolve([]) : fetchAll(sb, 'race_results', 'race_result_id, race_id, driver_id, finish_position'),
    ])
    const raw = { seasons, drivers, races, sessions, picks, players, results }
    return res.status(200).json(live ? { draft: buildDraftState(raw) } : buildStrategyModel(raw))
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
