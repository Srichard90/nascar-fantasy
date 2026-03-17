import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PLAYER_COLORS = [
  'bg-blue-900/40 border-blue-600',
  'bg-green-900/40 border-green-600',
  'bg-purple-900/40 border-purple-600',
  'bg-orange-900/40 border-orange-600',
  'bg-pink-900/40 border-pink-600',
]

export default function ResultsPage() {
  const [season,         setSeason]         = useState(null)
  const [races,          setRaces]          = useState([])
  const [selectedRaceId, setSelectedRaceId] = useState(null)
  const [weekData,       setWeekData]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [weekLoading,    setWeekLoading]    = useState(false)

  useEffect(() => {
    async function init() {
      const { data: s } = await supabase.from('seasons').select('*').eq('is_active', true).single()
      setSeason(s)
      if (!s) { setLoading(false); return }
      const { data: r } = await supabase.from('races').select('*')
        .eq('season_id', s.season_id).eq('is_complete', true).order('week_number', { ascending: false })
      setRaces(r || [])
      if (r && r.length > 0) setSelectedRaceId(r[0].race_id)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!selectedRaceId || !season) return
    async function fetchWeek() {
      setWeekLoading(true)
      const { data: players } = await supabase.from('players').select('*').eq('season_id', season.season_id).order('player_name')
      const { data: picks }   = await supabase.from('draft_picks')
        .select('*, drivers(driver_name, car_number), draft_sessions!inner(season_id)')
        .eq('draft_sessions.season_id', season.season_id)
      const { data: results } = await supabase.from('race_results').select('*, drivers(driver_name)').eq('race_id', selectedRaceId)
      const { data: scores }  = await supabase.from('player_weekly_scores').select('*').eq('race_id', selectedRaceId)

      const resultMap = {}; (results || []).forEach(r => { resultMap[r.driver_id] = r })
      const scoreMap  = {}; (scores  || []).forEach(s => { scoreMap[s.player_id]  = s })

      const playerData = (players || []).map(p => {
        const myPicks = (picks || []).filter(pk => pk.player_id === p.player_id)
        const drivers = myPicks.map(pk => ({
          driver_id:   pk.driver_id,
          driver_name: pk.drivers?.driver_name,
          car_number:  pk.drivers?.car_number,
          result:      resultMap[pk.driver_id] || null,
        })).sort((a, b) => {
          if (!a.result && !b.result) return 0
          if (!a.result) return 1
          if (!b.result) return -1
          return a.result.finish_position - b.result.finish_position
        })
        return {
          player: p,
          drivers,
          weeklyTotal:   scoreMap[p.player_id]?.total_points ?? null,
          driversScored: scoreMap[p.player_id]?.drivers_scored ?? 0,
        }
      }).sort((a, b) => {
        if (a.weeklyTotal === null) return 1
        if (b.weeklyTotal === null) return -1
        return a.weeklyTotal - b.weeklyTotal
      })

      setWeekData(playerData)
      setWeekLoading(false)
    }
    fetchWeek()
  }, [selectedRaceId, season])

  const selectedRace = races.find(r => r.race_id === selectedRaceId)

  if (loading) return <div className="flex items-center justify-center py-24"><div className="text-gray-400 animate-pulse">Loading results…</div></div>
  if (!season) return <div className="text-center py-24"><p className="text-gray-400">No active season found.</p></div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-yellow-400">Weekly Results</h1>
        <p className="text-gray-400 text-sm mt-1">{season.season_name}</p>
      </div>

      {races.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">🏎️</div>
          <p className="text-gray-400 text-lg">No completed races yet.</p>
          <p className="text-gray-500 text-sm mt-1">Results will appear here once the admin enters finish positions.</p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-3 items-center">
            <label className="text-gray-400 text-sm font-medium">Select race:</label>
            <select value={selectedRaceId || ''} onChange={e => setSelectedRaceId(parseInt(e.target.value, 10))}
              className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-red-500">
              {races.map(r => (
                <option key={r.race_id} value={r.race_id}>Week {r.week_number} — {r.race_name}</option>
              ))}
            </select>
          </div>

          {selectedRace && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-3 mb-5 flex flex-wrap gap-5 text-sm">
              <span><span className="text-gray-400">Race: </span><span className="text-white font-semibold">{selectedRace.race_name}</span></span>
              {selectedRace.track_name && <span><span className="text-gray-400">Track: </span><span className="text-white">{selectedRace.track_name}</span></span>}
              {selectedRace.race_date  && <span><span className="text-gray-400">Date: </span><span className="text-white">{selectedRace.race_date}</span></span>}
              <span><span className="text-gray-400">Week: </span><span className="text-yellow-400 font-bold">{selectedRace.week_number}</span></span>
            </div>
          )}

          {weekLoading ? (
            <div className="text-center py-12 text-gray-400 animate-pulse">Loading…</div>
          ) : (
            <>
              {/* Weekly summary bar */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden mb-6">
                <div className="bg-red-700 px-5 py-2 text-sm font-semibold uppercase tracking-wider">
                  Week {selectedRace?.week_number} Rankings
                </div>
                <div className="flex flex-wrap divide-x divide-gray-700">
                  {weekData.map((pd, i) => (
                    <div key={pd.player.player_id} className="flex-1 min-w-[100px] px-4 py-3 text-center">
                      <div className="text-xs text-gray-400 mb-1">
                        {i === 0 ? '🏆 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `#${i+1} `}
                        {pd.player.player_name}
                      </div>
                      <div className="text-2xl font-extrabold text-yellow-400">{pd.weeklyTotal ?? '—'}</div>
                      <div className="text-xs text-gray-500">{pd.driversScored} scored</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-player cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {weekData.map((pd, i) => (
                  <div key={pd.player.player_id} className={`border rounded-xl overflow-hidden ${PLAYER_COLORS[i % PLAYER_COLORS.length]}`}>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-lg">{pd.player.player_name}</div>
                        <div className="text-xs text-gray-400">{pd.driversScored} of {pd.drivers.length} scored</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-extrabold text-yellow-400">{pd.weeklyTotal ?? '—'}</div>
                        <div className="text-xs text-gray-400">week pts</div>
                      </div>
                    </div>
                    <div className="bg-gray-900/60">
                      {pd.drivers.map(d => (
                        <div key={d.driver_id} className="flex items-center justify-between px-4 py-2 border-t border-gray-700/60 text-sm">
                          <div>
                            <span className="text-white font-medium">{d.driver_name}</span>
                            <span className="text-yellow-500 text-xs ml-1">#{d.car_number}</span>
                          </div>
                          <div>
                            {d.result ? (
                              <div className="flex items-center gap-1.5">
                                {d.result.dnf && <span className="text-red-400 text-xs font-bold">DNF</span>}
                                <span className={`font-bold text-base ${
                                  d.result.finish_position <= 5  ? 'text-green-400' :
                                  d.result.finish_position <= 10 ? 'text-yellow-400' :
                                  d.result.finish_position <= 20 ? 'text-white' : 'text-gray-400'
                                }`}>P{d.result.finish_position}</span>
                              </div>
                            ) : (
                              <span className="text-gray-600 text-xs italic">no result</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
