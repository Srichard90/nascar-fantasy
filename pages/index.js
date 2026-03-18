import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

// ── Constants ──────────────────────────────────────────────────
const MEDALS       = ['🥇', '🥈', '🥉']
const PLAYER_COLORS = ['#3b82f6','#22c55e','#a855f7','#f97316','#ec4899']

const th = {
  padding: '12px 16px',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  textAlign: 'center',
  background: 'var(--surface2)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

function posColor(pos) {
  if (!pos) return 'var(--dim)'
  if (pos <= 3)  return '#f5c518'
  if (pos <= 10) return '#22c55e'
  if (pos <= 20) return 'var(--text)'
  return 'var(--muted)'
}

// ── Main page ──────────────────────────────────────────────────
export default function StandingsPage() {
  // Season selector
  const [allSeasons,  setAllSeasons]  = useState([])
  const [seasonId,    setSeasonId]    = useState(null)
  const [season,      setSeason]      = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [dataLoading, setDataLoading] = useState(false)

  // Standings state
  const [standings,   setStandings]   = useState([])
  const [lastRace,    setLastRace]    = useState(null)

  // Weekly results state
  const [races,       setRaces]       = useState([])
  const [raceId,      setRaceId]      = useState(null)
  const [weekData,    setWeekData]    = useState([])
  const [racesLoad,   setRacesLoad]   = useState(false)
  const [weekLoad,    setWeekLoad]    = useState(false)

  // ── Load all seasons on mount ────────────────────────────────
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

  // ── Fetch standings for selected season ──────────────────────
  const fetchStandings = useCallback(async (sid) => {
    if (!sid) return
    const s = allSeasons.find(x => x.season_id === sid)
    setSeason(s || null)

    const { data: st } = await supabase
      .from('player_standings')
      .select('*, players(player_name)')
      .eq('season_id', sid)

    const { data: p1Results } = await supabase
      .from('race_results')
      .select('driver_id, races!inner(season_id, week_number)')
      .eq('races.season_id', sid)
      .eq('finish_position', 1)

    const { data: allPicks } = await supabase
      .from('draft_picks')
      .select('player_id, driver_id, draft_sessions!inner(season_id)')
      .eq('draft_sessions.season_id', sid)

    const { data: swaps } = await supabase
      .from('driver_swaps').select('*').eq('season_id', sid)
    const { data: subs } = await supabase
      .from('driver_substitutions').select('*').eq('season_id', sid)

    const driverWinCount = {}
    ;(p1Results || []).forEach(r => {
      driverWinCount[r.driver_id] = (driverWinCount[r.driver_id] || 0) + 1
    })

    const winsMap = {}
    ;(p1Results || []).forEach(win => {
      const winDriverId = win.driver_id
      const weekNumber  = win.races?.week_number
      ;(allPicks || []).forEach(pk => {
        const swap = (swaps || []).find(s =>
          s.player_id === pk.player_id && s.original_driver_id === pk.driver_id && s.start_week <= weekNumber)
        const sub = !swap && (subs || []).find(s =>
          s.player_id === pk.player_id && s.original_driver_id === pk.driver_id &&
          s.start_week <= weekNumber && (s.end_week === null || s.end_week >= weekNumber))
        const eff = swap ? swap.swap_driver_id : sub ? sub.sub_driver_id : pk.driver_id
        if (eff === winDriverId) winsMap[pk.player_id] = (winsMap[pk.player_id] || 0) + 1
      })
    })

    const enriched = (st || [])
      .map(row => ({
        ...row,
        wins:            winsMap[row.player_id] || 0,
        adjusted_points: row.total_points - ((winsMap[row.player_id] || 0) * 10),
      }))
      .sort((a, b) => a.adjusted_points - b.adjusted_points)

    const leaderAdj = enriched.length ? enriched[0].adjusted_points : 0
    setStandings(enriched.map((row, i) => ({
      ...row,
      pts_behind_leader: i === 0 ? null : row.adjusted_points - leaderAdj,
      pts_behind_next:   i === 0 ? null : row.adjusted_points - enriched[i - 1].adjusted_points,
    })))

    const { data: r } = await supabase
      .from('races').select('*')
      .eq('season_id', sid).eq('is_complete', true)
      .order('week_number', { ascending: false }).limit(1).single()
    setLastRace(r)
  }, [allSeasons])

  // ── Fetch races for selected season ──────────────────────────
  const fetchRaces = useCallback(async (sid) => {
    setRacesLoad(true)
    setRaceId(null)
    setWeekData([])
    const { data: r } = await supabase
      .from('races').select('*')
      .eq('season_id', sid).eq('is_complete', true)
      .order('week_number', { ascending: false })
    setRaces(r || [])
    if (r && r.length) setRaceId(r[0].race_id)
    setRacesLoad(false)
  }, [])

  // ── When seasonId changes, load both standings and races ─────
  useEffect(() => {
    if (!seasonId || !allSeasons.length) return
    setDataLoading(true)
    Promise.all([fetchStandings(seasonId), fetchRaces(seasonId)])
      .finally(() => { setDataLoading(false); setLoading(false) })
  }, [seasonId, allSeasons, fetchStandings, fetchRaces])

  // ── Fetch week data when raceId changes ───────────────────────
  const fetchWeek = useCallback(async () => {
    if (!raceId || !seasonId) return
    setWeekLoad(true)
    const currentRace = races.find(r => r.race_id === raceId)

    const { data: players }      = await supabase.from('players').select('*').eq('season_id', seasonId).order('player_name')
    const { data: draftSession } = await supabase.from('draft_sessions').select('draft_session_id').eq('season_id', seasonId).single()
    const { data: picks }        = draftSession
      ? await supabase.from('draft_picks').select('*, drivers(driver_name, car_number)').eq('draft_session_id', draftSession.draft_session_id)
      : { data: [] }
    const { data: results }      = await supabase.from('race_results').select('*').eq('race_id', raceId)
    const { data: scores }       = await supabase.from('player_weekly_scores').select('*').eq('race_id', raceId)
    const { data: swaps }        = await supabase.from('driver_swaps').select('*, swap_driver:drivers!driver_swaps_swap_driver_id_fkey(driver_name, car_number)').eq('season_id', seasonId)
    const { data: subs }         = await supabase.from('driver_substitutions').select('*, sub_driver:drivers!driver_substitutions_sub_driver_id_fkey(driver_name, car_number)').eq('season_id', seasonId)

    const resMap   = {}; (results || []).forEach(r => { resMap[r.driver_id] = r })
    const scoreMap = {}; (scores  || []).forEach(s => { scoreMap[s.player_id] = s })

    function effectiveDriver(pick, weekNumber) {
      const swap = (swaps || []).find(s => s.player_id === pick.player_id && s.original_driver_id === pick.driver_id && s.start_week <= weekNumber)
      if (swap) return { driver_id: swap.swap_driver_id, name: swap.swap_driver?.driver_name, num: swap.swap_driver?.car_number, label: 'swap' }
      const sub = (subs || []).find(s => s.player_id === pick.player_id && s.original_driver_id === pick.driver_id && s.start_week <= weekNumber && (s.end_week === null || s.end_week >= weekNumber))
      if (sub) return { driver_id: sub.sub_driver_id, name: sub.sub_driver?.driver_name, num: sub.sub_driver?.car_number, label: 'sub' }
      return { driver_id: pick.driver_id, name: pick.drivers?.driver_name, num: pick.drivers?.car_number, label: null }
    }

    const pd = (players || []).map(p => {
      const myPicks = (picks || []).filter(pk => pk.player_id === p.player_id)
      const drivers = myPicks.map(pk => {
        const eff = effectiveDriver(pk, currentRace?.week_number || 0)
        return { ...eff, original_name: eff.label ? pk.drivers?.driver_name : null, result: resMap[eff.driver_id] || null }
      }).sort((a, b) => {
        if (!a.result && !b.result) return 0
        if (!a.result) return 1; if (!b.result) return -1
        return a.result.finish_position - b.result.finish_position
      })
      return { player: p, drivers, total: scoreMap[p.player_id]?.total_points ?? null, scored: scoreMap[p.player_id]?.drivers_scored ?? 0 }
    }).sort((a, b) => { if (a.total === null) return 1; if (b.total === null) return -1; return a.total - b.total })

    setWeekData(pd)
    setWeekLoad(false)
  }, [raceId, seasonId, races])

  useEffect(() => { fetchWeek() }, [fetchWeek])

  const isActiveSeason = allSeasons.find(s => s.is_active)?.season_id === seasonId
  const race           = races.find(r => r.race_id === raceId)

  // ── Season toggle ────────────────────────────────────────────
  function SeasonToggle() {
    if (allSeasons.length <= 1) return null
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <span style={{ fontFamily:"'Barlow Condensed'", fontSize:12, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', whiteSpace:'nowrap' }}>Season:</span>
        {[...allSeasons].sort((a,b)=>b.season_year-a.season_year).map(s=>(
          <button key={s.season_id} onClick={()=>setSeasonId(s.season_id)} style={{
            padding:'6px 14px', borderRadius:8,
            border:`2px solid ${seasonId===s.season_id ? 'var(--red)' : 'var(--border2)'}`,
            background: seasonId===s.season_id ? 'rgba(232,25,44,0.12)' : 'transparent',
            color: seasonId===s.season_id ? 'var(--text)' : 'var(--muted)',
            fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700, fontSize:14,
            letterSpacing:'0.05em', cursor:'pointer', transition:'all 0.15s',
            display:'flex', alignItems:'center', gap:6,
          }}>
            {s.season_year}
            {s.is_active && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', display:'inline-block' }} />}
          </button>
        ))}
      </div>
    )
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
      <span style={{ color:'var(--muted)', fontFamily:"'Barlow Condensed'", fontSize:18, letterSpacing:'0.1em' }}>LOADING…</span>
    </div>
  )

  if (!allSeasons.length) return (
    <div style={{ textAlign:'center', padding:'80px 20px' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>🏁</div>
      <h2 style={{ fontSize:36, color:'var(--text)', marginBottom:8 }}>No Active Season</h2>
      <p style={{ color:'var(--muted)', marginBottom:28 }}>Head to the Admin panel to create your league.</p>
      <Link href="/admin" style={{ textDecoration:'none', background:'var(--red)', color:'#fff', padding:'12px 28px', borderRadius:8, fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', fontSize:15 }}>Go to Admin</Link>
    </div>
  )

  return (
    <div className="fade-up">

      {/* ── Page header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:48, color:'var(--text)', margin:0 }}>
            {season?.season_name || '—'}
            {!isActiveSeason && (
              <span style={{ marginLeft:12, fontFamily:"'Barlow Condensed', sans-serif", fontSize:16, color:'var(--muted)', fontWeight:400, letterSpacing:'0.06em', textTransform:'uppercase' }}>Archive</span>
            )}
          </h1>
          <p style={{ color:'var(--muted)', marginTop:6, fontSize:14 }}>
            Season standings &nbsp;·&nbsp;
            <span style={{ color:'var(--green)' }}>Lower adjusted points = better rank</span>
            &nbsp;·&nbsp;
            <span style={{ color:'var(--gold)' }}>Win bonus: −10 pts per driver win</span>
          </p>
        </div>
        <SeasonToggle />
      </div>

      {dataLoading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'var(--muted)', fontFamily:"'Barlow Condensed'", letterSpacing:'0.1em', fontSize:16 }}>LOADING…</div>
      ) : (
        <>
          {/* ── Standings table ── */}
          {standings.length === 0 ? (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'60px 40px', textAlign:'center', marginBottom:40 }}>
              <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
              <p style={{ color:'var(--muted)', fontSize:17 }}>No standings yet for this season.</p>
            </div>
          ) : (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', marginBottom:40, overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign:'left', width:50 }}>Rank</th>
                    <th style={{ ...th, textAlign:'left' }}>Player</th>
                    <th style={th}>Base Pts</th>
                    <th style={th}>Wins</th>
                    <th style={{ ...th, color:'var(--gold)' }}>Adj. Pts</th>
                    <th style={{ ...th, color:'#f87171' }}>− Leader</th>
                    <th style={{ ...th, color:'#fb923c' }}>− Next</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, i) => {
                    const isFirst = i === 0
                    return (
                      <tr key={row.standing_id} style={{ borderTop:'1px solid var(--border)', background: isFirst ? 'rgba(245,197,24,0.06)' : 'transparent' }}>
                        <td style={{ padding:'14px 16px', fontSize:22 }}>
                          {MEDALS[i] || <span style={{ fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700, color:'var(--dim)', fontSize:16 }}>#{i+1}</span>}
                        </td>
                        <td style={{ padding:'14px 16px' }}>
                          <span style={{ fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700, fontSize:20, color: isFirst ? 'var(--gold)' : 'var(--text)', letterSpacing:'0.02em' }}>
                            {row.players?.player_name}
                          </span>
                        </td>
                        <td style={{ padding:'14px 16px', textAlign:'center', color:'var(--muted)', fontFamily:"'Barlow Condensed'", fontSize:17 }}>{row.total_points}</td>
                        <td style={{ padding:'14px 16px', textAlign:'center' }}>
                          {row.wins > 0
                            ? <span style={{ background:'rgba(245,197,24,0.15)', color:'var(--gold)', borderRadius:6, padding:'2px 10px', fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700, fontSize:15 }}>🏆 {row.wins}</span>
                            : <span style={{ color:'var(--dim)', fontSize:14 }}>—</span>}
                        </td>
                        <td style={{ padding:'14px 16px', textAlign:'center' }}>
                          <span style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:28, color: isFirst ? 'var(--gold)' : 'var(--text)', letterSpacing:'0.05em' }}>{row.adjusted_points}</span>
                        </td>
                        <td style={{ padding:'14px 16px', textAlign:'center' }}>
                          {row.pts_behind_leader === null
                            ? <span style={{ color:'var(--gold)', fontFamily:"'Barlow Condensed'", fontWeight:700, fontSize:14, letterSpacing:'0.05em' }}>LEADER</span>
                            : <span style={{ color:'#f87171', fontFamily:"'Barlow Condensed'", fontWeight:700, fontSize:17 }}>+{row.pts_behind_leader}</span>}
                        </td>
                        <td style={{ padding:'14px 16px', textAlign:'center' }}>
                          {row.pts_behind_next === null
                            ? <span style={{ color:'var(--dim)', fontSize:13 }}>—</span>
                            : <span style={{ color:'#fb923c', fontFamily:"'Barlow Condensed'", fontWeight:700, fontSize:17 }}>+{row.pts_behind_next}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ borderTop:'1px solid var(--border)', padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:'6px 24px', fontSize:15, color:'var(--muted)', fontFamily:"'Barlow Condensed', sans-serif", letterSpacing:'0.04em' }}>
                <span><span style={{ color:'var(--gold)' }}>Adj. Pts</span> = Base Pts − (Wins × 10)</span>
                <span><span style={{ color:'#f87171' }}>− Leader</span> = Adjusted points behind 1st place</span>
                <span><span style={{ color:'#fb923c' }}>− Next</span> = Adjusted points behind the position directly ahead</span>
              </div>
            </div>
          )}

          {/* ── Divider ── */}
          <div style={{ borderTop:'1px solid var(--border)', marginBottom:32 }} />

          {/* ── Weekly Results section ── */}
          <div style={{ marginBottom:20 }}>
            <h2 style={{ fontSize:36, color:'var(--text)', margin:'0 0 6px' }}>Weekly Results</h2>
          </div>

          {racesLoad ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--muted)', fontFamily:"'Barlow Condensed'", letterSpacing:'0.1em' }}>LOADING…</div>
          ) : races.length === 0 ? (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'40px', textAlign:'center' }}>
              <p style={{ color:'var(--muted)', fontSize:16 }}>No completed races yet this season.</p>
            </div>
          ) : (
            <>
              {/* Race selector */}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                <label style={{ color:'var(--muted)', fontFamily:"'Barlow Condensed'", fontSize:13, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' }}>Race:</label>
                <select
                  value={raceId || ''}
                  onChange={e => setRaceId(parseInt(e.target.value, 10))}
                  style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:8, padding:'9px 14px', color:'var(--text)', fontSize:14, fontFamily:"'Barlow', sans-serif", outline:'none', cursor:'pointer', maxWidth:'100%' }}
                >
                  {races.map(r => (
                    <option key={r.race_id} value={r.race_id}>Week {r.week_number} — {r.race_name}</option>
                  ))}
                </select>
              </div>

              {/* Race info banner */}
              {race && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 20px', display:'flex', flexWrap:'wrap', gap:'8px 28px', marginBottom:24, fontSize:14 }}>
                  <span><span style={{ color:'var(--muted)' }}>Race: </span><strong style={{ color:'var(--text)' }}>{race.race_name}</strong></span>
                  {race.track_name  && <span><span style={{ color:'var(--muted)' }}>Track: </span><span style={{ color:'var(--text)' }}>{race.track_name}</span></span>}
                  {race.race_date   && <span><span style={{ color:'var(--muted)' }}>Date: </span><span style={{ color:'var(--text)' }}>{race.race_date}</span></span>}
                  {race.race_time   && <span><span style={{ color:'var(--muted)' }}>Time: </span><span style={{ color:'var(--text)' }}>{race.race_time}</span></span>}
                  {race.tv_network  && <span><span style={{ color:'var(--muted)' }}>TV: </span><span style={{ color:'var(--text)' }}>{race.tv_network}</span></span>}
                  <span><span style={{ color:'var(--muted)' }}>Week: </span><span style={{ color:'var(--gold)', fontWeight:700 }}>{race.week_number}</span></span>
                </div>
              )}

              {weekLoad ? (
                <div style={{ textAlign:'center', padding:'48px', color:'var(--muted)', fontFamily:"'Barlow Condensed'", letterSpacing:'0.1em' }}>LOADING WEEK DATA…</div>
              ) : weekData.length > 0 ? (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  {/* Header bar */}
                  <div style={{ background:'#5a0a12', padding:'8px 20px', fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'#ffffff' }}>
                    Week {race?.week_number} Rankings
                  </div>

                  {/* True 2D grid */}
                  <div style={{
                    display:'grid',
                    gridTemplateColumns:`repeat(${weekData.length}, 1fr)`,
                    gridTemplateRows:`auto repeat(${Math.max(...weekData.map(pd=>pd.drivers.length))}, auto)`,
                    borderTop:'1px solid var(--border)',
                    overflowX:'auto',
                  }}>
                    {/* Header cells */}
                    {weekData.map((pd, i) => (
                      <div key={`hdr-${pd.player.player_id}`} style={{
                        padding:'14px 16px',
                        borderBottom:`2px solid ${PLAYER_COLORS[i%5]}`,
                        borderRight: i < weekData.length-1 ? '1px solid var(--border)' : 'none',
                        display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
                      }}>
                        <div>
                          <div style={{ fontSize:11, color:'var(--muted)', fontFamily:"'Barlow Condensed'", letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:2 }}>
                            {i===0?'🏆':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                          </div>
                          <div style={{ fontFamily:"'Barlow Condensed'", fontSize:20, fontWeight:700, color:PLAYER_COLORS[i%5], letterSpacing:'0.04em', textTransform:'uppercase' }}>
                            {pd.player.player_name}
                          </div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontFamily:"'Bebas Neue'", fontSize:30, color: i===0 ? 'var(--gold)' : 'var(--text)', letterSpacing:'0.04em', lineHeight:1 }}>
                            {pd.total ?? '—'}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Driver rows */}
                    {Array.from({ length: Math.max(...weekData.map(pd=>pd.drivers.length)) }).map((_, rowIdx) => (
                      weekData.map((pd, i) => {
                        const d = pd.drivers[rowIdx]
                        return (
                          <div key={`drv-${pd.player.player_id}-${rowIdx}`} style={{
                            display:'flex', justifyContent:'space-between', alignItems:'center',
                            padding:'10px 16px', borderBottom:'1px solid var(--border)',
                            borderRight: i < weekData.length-1 ? '1px solid var(--border)' : 'none',
                            gap:8, minHeight:56,
                          }}>
                            {d ? (
                              <>
                                <div style={{ minWidth:0 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                                    <span style={{ color:'var(--text)', fontWeight:500, fontSize:16 }}>{d.name}</span>
                                    <span style={{ color:'var(--gold)', fontSize:12 }}>#{d.num}</span>
                                    {d.label==='swap' && <span style={{ background:'rgba(99,102,241,0.2)', color:'#a5b4fc', borderRadius:4, padding:'1px 6px', fontFamily:"'Barlow Condensed'", fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' }}>swap</span>}
                                    {d.label==='sub'  && <span style={{ background:'rgba(245,197,24,0.15)', color:'var(--gold)', borderRadius:4, padding:'1px 6px', fontFamily:"'Barlow Condensed'", fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' }}>sub</span>}
                                  </div>
                                  {d.original_name && <div style={{ color:'var(--dim)', fontSize:11, marginTop:2 }}>replaces {d.original_name}</div>}
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                                  {d.result?.dnf && <span style={{ color:'var(--red)', fontSize:11, fontFamily:"'Barlow Condensed'", fontWeight:700, letterSpacing:'0.06em' }}>DNF</span>}
                                  {d.result
                                    ? <span style={{ fontFamily:"'Bebas Neue'", fontSize:22, color:posColor(d.result.finish_position), letterSpacing:'0.04em', minWidth:32, textAlign:'right' }}>P{d.result.finish_position}</span>
                                    : <span style={{ color:'var(--dim)', fontSize:12, fontStyle:'italic' }}>—</span>}
                                </div>
                              </>
                            ) : null}
                          </div>
                        )
                      })
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}
