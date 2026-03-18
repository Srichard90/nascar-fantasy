import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PLAYER_COLORS = ['#3b82f6','#22c55e','#a855f7','#f97316','#ec4899']

function posColor(pos) {
  if (!pos) return 'var(--dim)'
  if (pos <= 3)  return '#f5c518'
  if (pos <= 10) return '#22c55e'
  if (pos <= 20) return 'var(--text)'
  return 'var(--muted)'
}

export default function ResultsPage() {
  const [allSeasons,  setAllSeasons]  = useState([])
  const [seasonId,    setSeasonId]    = useState(null)
  const [season,      setSeason]      = useState(null)
  const [races,       setRaces]       = useState([])
  const [raceId,      setRaceId]      = useState(null)
  const [weekData,    setWeekData]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [racesLoad,   setRacesLoad]   = useState(false)
  const [weekLoad,    setWeekLoad]    = useState(false)

  // Load all seasons once on mount
  useEffect(() => {
    async function init() {
      const { data: seasons } = await supabase
        .from('seasons').select('*').order('season_year', { ascending: false })
      setAllSeasons(seasons || [])
      const active = (seasons || []).find(s => s.is_active) || seasons?.[0]
      if (active) setSeasonId(active.season_id)
      else setLoading(false)
    }
    init()
  }, [])

  // Load races whenever season changes
  useEffect(() => {
    if (!seasonId || !allSeasons.length) return
    const s = allSeasons.find(x => x.season_id === seasonId)
    setSeason(s || null)
    setRaceId(null)
    setWeekData([])

    async function loadRaces() {
      setRacesLoad(true)
      const { data: r } = await supabase
        .from('races').select('*')
        .eq('season_id', seasonId)
        .eq('is_complete', true)
        .order('week_number', { ascending: false })
      setRaces(r || [])
      if (r && r.length) setRaceId(r[0].race_id)
      setRacesLoad(false)
      setLoading(false)
    }
    loadRaces()
  }, [seasonId, allSeasons])

  // Load week data whenever race changes
  const fetchWeek = useCallback(async () => {
    if (!raceId || !seasonId) return
    const currentRace = races.find(r => r.race_id === raceId)
    setWeekLoad(true)

    const { data: players } = await supabase
      .from('players').select('*').eq('season_id', seasonId).order('player_name')

    // Get the draft session for this season first, then fetch picks directly
    const { data: draftSession } = await supabase
      .from('draft_sessions').select('draft_session_id').eq('season_id', seasonId).single()

    const { data: picks } = draftSession
      ? await supabase
          .from('draft_picks')
          .select('*, drivers(driver_name, car_number)')
          .eq('draft_session_id', draftSession.draft_session_id)
      : { data: [] }

    const { data: results } = await supabase
      .from('race_results').select('*').eq('race_id', raceId)
    const { data: scores } = await supabase
      .from('player_weekly_scores').select('*').eq('race_id', raceId)

    // Fetch swaps and subs so the display matches the scoring
    const { data: swaps } = await supabase
      .from('driver_swaps')
      .select('*, swap_driver:drivers!driver_swaps_swap_driver_id_fkey(driver_name, car_number)')
      .eq('season_id', seasonId)
    const { data: subs } = await supabase
      .from('driver_substitutions')
      .select('*, sub_driver:drivers!driver_substitutions_sub_driver_id_fkey(driver_name, car_number)')
      .eq('season_id', seasonId)

    const resMap   = {};  (results || []).forEach(r => { resMap[r.driver_id] = r })
    const scoreMap = {};  (scores  || []).forEach(s => { scoreMap[s.player_id] = s })

    // Resolve effective driver for a given pick and week — mirrors trigger logic
    function effectiveDriver(pick, weekNumber) {
      const swap = (swaps || []).find(s =>
        s.player_id          === pick.player_id &&
        s.original_driver_id === pick.driver_id &&
        s.start_week         <= weekNumber
      )
      if (swap) return {
        driver_id: swap.swap_driver_id,
        name:      swap.swap_driver?.driver_name,
        num:       swap.swap_driver?.car_number,
        label:     'swap',
      }

      const sub = (subs || []).find(s =>
        s.player_id          === pick.player_id &&
        s.original_driver_id === pick.driver_id &&
        s.start_week         <= weekNumber &&
        (s.end_week === null || s.end_week >= weekNumber)
      )
      if (sub) return {
        driver_id: sub.sub_driver_id,
        name:      sub.sub_driver?.driver_name,
        num:       sub.sub_driver?.car_number,
        label:     'sub',
      }

      return {
        driver_id: pick.driver_id,
        name:      pick.drivers?.driver_name,
        num:       pick.drivers?.car_number,
        label:     null,
      }
    }

    const pd = (players || []).map(p => {
      const myPicks = (picks || []).filter(pk => pk.player_id === p.player_id)
      const drivers = myPicks.map(pk => {
        const eff = effectiveDriver(pk, currentRace?.week_number || 0)
        return {
          driver_id:       eff.driver_id,
          name:            eff.name,
          num:             eff.num,
          label:           eff.label,
          original_name:   eff.label ? pk.drivers?.driver_name : null,
          result:          resMap[eff.driver_id] || null,
        }
      }).sort((a, b) => {
        if (!a.result && !b.result) return 0
        if (!a.result) return 1
        if (!b.result) return -1
        return a.result.finish_position - b.result.finish_position
      })
      return {
        player: p,
        drivers,
        total:  scoreMap[p.player_id]?.total_points ?? null,
        scored: scoreMap[p.player_id]?.drivers_scored ?? 0,
      }
    }).sort((a, b) => {
      if (a.total === null) return 1
      if (b.total === null) return -1
      return a.total - b.total
    })

    setWeekData(pd)
    setWeekLoad(false)
  }, [raceId, seasonId, races])

  useEffect(() => { fetchWeek() }, [fetchWeek])

  const race             = races.find(r => r.race_id === raceId)
  const isActiveSeason   = allSeasons.find(s => s.is_active)?.season_id === seasonId

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <span style={{ color: 'var(--muted)', fontFamily: "'Barlow Condensed'", fontSize: 18, letterSpacing: '0.1em' }}>LOADING…</span>
    </div>
  )

  if (!allSeasons.length) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ color: 'var(--muted)', fontSize: 17 }}>No seasons found.</p>
    </div>
  )

  return (
    <div className="fade-up">
      {/* Header + season selector */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 48, color: 'var(--text)', margin: 0 }}>
              Weekly Results
              {!isActiveSeason && (
                <span style={{ marginLeft: 12, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, color: 'var(--muted)', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Archive
                </span>
              )}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{season?.season_name}</p>
          </div>

          {/* Season toggle */}
          {allSeasons.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                Season:
              </span>
              {[...allSeasons].sort((a, b) => b.season_year - a.season_year).map(s => (
                <button key={s.season_id} onClick={() => setSeasonId(s.season_id)} style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: `2px solid ${seasonId === s.season_id ? 'var(--red)' : 'var(--border2)'}`,
                  background: seasonId === s.season_id ? 'rgba(232,25,44,0.12)' : 'transparent',
                  color: seasonId === s.season_id ? 'var(--text)' : 'var(--muted)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  {s.season_year}
                  {s.is_active && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {racesLoad && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)', fontFamily: "'Barlow Condensed'", letterSpacing: '0.1em' }}>LOADING…</div>
      )}

      {!racesLoad && races.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏎️</div>
          <p style={{ color: 'var(--muted)', fontSize: 17 }}>No completed races for this season.</p>
        </div>
      )}

      {!racesLoad && races.length > 0 && (
        <>
          {/* Race selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <label style={{ color: 'var(--muted)', fontFamily: "'Barlow Condensed'", fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Race:</label>
            <select
              value={raceId || ''}
              onChange={e => setRaceId(parseInt(e.target.value, 10))}
              style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, padding: '9px 14px', color: 'var(--text)', fontSize: 14, fontFamily: "'Barlow', sans-serif", outline: 'none', cursor: 'pointer', maxWidth: '100%' }}
            >
              {races.map(r => (
                <option key={r.race_id} value={r.race_id}>
                  Week {r.week_number} — {r.race_name}
                </option>
              ))}
            </select>
          </div>

          {/* Race info banner */}
          {race && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: '8px 28px', marginBottom: 24, fontSize: 14 }}>
              <span><span style={{ color: 'var(--muted)' }}>Race: </span><strong style={{ color: 'var(--text)' }}>{race.race_name}</strong></span>
              {race.track_name  && <span><span style={{ color: 'var(--muted)' }}>Track: </span><span style={{ color: 'var(--text)' }}>{race.track_name}</span></span>}
              {race.race_date   && <span><span style={{ color: 'var(--muted)' }}>Date: </span><span style={{ color: 'var(--text)' }}>{race.race_date}</span></span>}
              {race.race_time   && <span><span style={{ color: 'var(--muted)' }}>Time: </span><span style={{ color: 'var(--text)' }}>{race.race_time}</span></span>}
              {race.tv_network  && <span><span style={{ color: 'var(--muted)' }}>TV: </span><span style={{ color: 'var(--text)' }}>{race.tv_network}</span></span>}
              <span><span style={{ color: 'var(--muted)' }}>Week: </span><span style={{ color: 'var(--gold)', fontWeight: 700 }}>{race.week_number}</span></span>
            </div>
          )}

          {weekLoad ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)', fontFamily: "'Barlow Condensed'", letterSpacing: '0.1em' }}>LOADING WEEK DATA…</div>
          ) : (
            <>
              {/* Week ranking bar */}
              {weekData.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
                  <div style={{ background: '#5a0a12', padding: '8px 20px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ffffff' }}>
                    Week {race?.week_number} Rankings
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weekData.length},1fr)`, borderTop: '1px solid var(--border)' }}>
                    {weekData.map((pd, i) => (
                      <div key={pd.player.player_id} style={{ padding: '16px 12px', textAlign: 'center', borderRight: i < weekData.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: 14, color: 'var(--text)', fontFamily: "'Barlow Condensed'", letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>
                          {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} {pd.player.player_name}
                        </div>
                        <div style={{ fontFamily: "'Bebas Neue'", fontSize: 32, color: i === 0 ? 'var(--gold)' : 'var(--text)', letterSpacing: '0.04em' }}>
                          {pd.total ?? '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Player cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                {weekData.map((pd, i) => (
                  <div key={pd.player.player_id} style={{ background: 'var(--surface)', border: `1px solid ${PLAYER_COLORS[i % 5]}44`, borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{ borderBottom: `2px solid ${PLAYER_COLORS[i % 5]}`, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, color: PLAYER_COLORS[i % 5], letterSpacing: '0.04em' }}>{pd.player.player_name}</div>

                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: "'Bebas Neue'", fontSize: 32, color: 'var(--gold)', letterSpacing: '0.04em' }}>{pd.total ?? '—'}</div>
                        <div style={{ color: 'var(--dim)', fontSize: 11 }}>pts</div>
                      </div>
                    </div>
                    <div>
                      {pd.drivers.map(d => (
                        <div key={d.driver_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 18px', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{d.name}</span>
                              <span style={{ color: 'var(--gold)', fontSize: 12 }}>#{d.num}</span>
                              {d.label === 'swap' && (
                                <span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', borderRadius: 4, padding: '1px 6px', fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>swap</span>
                              )}
                              {d.label === 'sub' && (
                                <span style={{ background: 'rgba(245,197,24,0.15)', color: 'var(--gold)', borderRadius: 4, padding: '1px 6px', fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>sub</span>
                              )}
                            </div>
                            {d.original_name && (
                              <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 1 }}>replaces {d.original_name}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {d.result?.dnf && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: '0.06em' }}>DNF</span>}
                            {d.result ? (
                              <span style={{ fontFamily: "'Bebas Neue'", fontSize: 22, color: posColor(d.result.finish_position), letterSpacing: '0.04em', minWidth: 36, textAlign: 'right' }}>
                                P{d.result.finish_position}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--dim)', fontSize: 12, fontStyle: 'italic' }}>no result</span>
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
