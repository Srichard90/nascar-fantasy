import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function posColor(pos) {
  if (!pos) return 'var(--dim)'
  if (pos === 1)  return '#f5c518'
  if (pos <= 3)   return '#f5c518'
  if (pos <= 10)  return '#22c55e'
  if (pos <= 20)  return 'var(--text)'
  return 'var(--muted)'
}

export default function WeeklyDetailPage() {
  const [allSeasons, setAllSeasons] = useState([])
  const [seasonId,   setSeasonId]   = useState(null)
  const [season,     setSeason]     = useState(null)
  const [drivers,    setDrivers]    = useState([])   // sorted by car number
  const [races,      setRaces]      = useState([])   // sorted by week_number
  const [resultMap,  setResultMap]  = useState({})   // { race_id: { driver_id: finish_position } }
  const [driverStats, setDriverStats] = useState({})   // { driver_id: { total, rank } }
  const [loading,    setLoading]    = useState(true)
  const [dataLoad,   setDataLoad]   = useState(false)

  // Load all seasons on mount
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

  // Load data whenever season changes
  useEffect(() => {
    if (!seasonId) return
    const s = allSeasons.find(x => x.season_id === seasonId)
    setSeason(s || null)
    setDataLoad(true)
    setDrivers([])
    setRaces([])
    setResultMap({})
    setDriverStats({})

    let cancelled = false

    async function load() {
      try {
        // 1. Fetch drivers
        const { data: drv, error: drvErr } = await supabase
          .from('drivers')
          .select('driver_id, driver_name, car_number, team')
          .eq('season_id', seasonId)
        if (cancelled) return
        if (drvErr) throw drvErr

        const sorted = (drv || []).sort((a, b) => {
          const na = parseInt(a.car_number, 10)
          const nb = parseInt(b.car_number, 10)
          if (!isNaN(na) && !isNaN(nb)) return na - nb
          return (a.car_number || '').localeCompare(b.car_number || '')
        })
        setDrivers(sorted)

        // 2. Fetch completed races
        const { data: raceData, error: raceErr } = await supabase
          .from('races')
          .select('race_id, week_number, race_name, track_name')
          .eq('season_id', seasonId)
          .eq('is_complete', true)
          .order('week_number', { ascending: true })
        if (cancelled) return
        if (raceErr) throw raceErr
        setRaces(raceData || [])

        // 3. Fetch results race-by-race to avoid .in() partial failures
        if (raceData && raceData.length) {
          const rm = {}

          // Fetch all in parallel then merge
          await Promise.all(raceData.map(async race => {
            const { data: res, error: resErr } = await supabase
              .from('race_results')
              .select('driver_id, finish_position, dnf')
              .eq('race_id', race.race_id)
            if (cancelled) return
            if (resErr) return // skip failed race silently
            rm[race.race_id] = {}
            ;(res || []).forEach(r => {
              rm[race.race_id][r.driver_id] = { pos: r.finish_position, dnf: r.dnf }
            })
          }))

          if (!cancelled) {
            setResultMap({ ...rm })

            // Compute season totals per driver (sum finish positions across all races)
            const totals = {}
            Object.values(rm).forEach(raceResults => {
              Object.entries(raceResults).forEach(([driverId, res]) => {
                const id = parseInt(driverId, 10)
                totals[id] = (totals[id] || 0) + res.pos
              })
            })

            // Rank all drivers by total (lower = better)
            const ranked = Object.entries(totals)
              .map(([id, total]) => ({ id: parseInt(id, 10), total }))
              .sort((a, b) => a.total - b.total)

            const stats = {}
            ranked.forEach((d, i) => { stats[d.id] = { total: d.total, rank: i + 1 } })
            setDriverStats(stats)
          }
        }
      } catch (err) {
        console.error('Weekly detail load error:', err)
      } finally {
        if (!cancelled) {
          setDataLoad(false)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [seasonId])

  const isActiveSeason = allSeasons.find(s => s.is_active)?.season_id === seasonId

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
      <span style={{ color:'var(--muted)', fontFamily:"'Barlow Condensed'", fontSize:18, letterSpacing:'0.1em' }}>LOADING…</span>
    </div>
  )

  return (
    <div className="fade-up">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:48, color:'var(--text)', margin:0 }}>
            Weekly Detail
            {!isActiveSeason && (
              <span style={{ marginLeft:12, fontFamily:"'Barlow Condensed', sans-serif", fontSize:16, color:'var(--muted)', fontWeight:400, letterSpacing:'0.06em', textTransform:'uppercase' }}>Archive</span>
            )}
          </h1>
          <p style={{ color:'var(--muted)', fontSize:14, marginTop:4 }}>
            {season?.season_name} &nbsp;·&nbsp; All drivers × all races &nbsp;·&nbsp; Sorted by car number
          </p>
        </div>

        {/* Season toggle */}
        {allSeasons.length > 1 && (
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
        )}
      </div>

      {dataLoad ? (
        <div style={{ textAlign:'center', padding:'60px', color:'var(--muted)', fontFamily:"'Barlow Condensed'", letterSpacing:'0.1em', fontSize:16 }}>LOADING…</div>
      ) : races.length === 0 ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'60px 40px', textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🏎️</div>
          <p style={{ color:'var(--muted)', fontSize:17 }}>No completed races yet this season.</p>
        </div>
      ) : (
        <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border)' }}>
          <table style={{
            borderCollapse:'collapse',
            width:'100%',
            minWidth: 260 + races.length * 90,
            tableLayout:'fixed',
          }}>
            <colgroup>
              <col style={{ width:180 }} />
              <col style={{ width:70 }} />
              <col style={{ width:80 }} />
              <col style={{ width:70 }} />
              {races.map(r => <col key={r.race_id} style={{ width:90 }} />)}
            </colgroup>

            <thead>
              {/* Row 1: Race names */}
              <tr>
                <th style={{
                  background:'var(--surface2)',
                  borderBottom:'1px solid var(--border)',
                  borderRight:'1px solid var(--border)',
                  padding:'10px 14px',
                  textAlign:'left',
                  fontFamily:"'Barlow Condensed', sans-serif",
                  fontSize:13, fontWeight:700, letterSpacing:'0.08em',
                  textTransform:'uppercase', color:'var(--muted)',
                  whiteSpace:'nowrap',
                  position:'sticky', left:0, zIndex:3,
                }}>Driver</th>
                <th style={{
                  background:'var(--surface2)',
                  borderBottom:'1px solid var(--border)',
                  borderRight:'2px solid var(--border2)',
                  padding:'10px 8px',
                  textAlign:'center',
                  fontFamily:"'Barlow Condensed', sans-serif",
                  fontSize:13, fontWeight:700, letterSpacing:'0.08em',
                  textTransform:'uppercase', color:'var(--muted)',
                  position:'sticky', left:180, zIndex:3,
                }}>#</th>
                <th style={{
                  background:'var(--surface2)',
                  borderBottom:'1px solid var(--border)',
                  borderRight:'1px solid var(--border)',
                  padding:'10px 10px',
                  textAlign:'center',
                  fontFamily:"'Barlow Condensed', sans-serif",
                  fontSize:13, fontWeight:700, letterSpacing:'0.08em',
                  textTransform:'uppercase', color:'var(--muted)',
                  whiteSpace:'nowrap',
                }}>Total Pts</th>
                <th style={{
                  background:'var(--surface2)',
                  borderBottom:'1px solid var(--border)',
                  borderRight:'2px solid var(--border2)',
                  padding:'10px 10px',
                  textAlign:'center',
                  fontFamily:"'Barlow Condensed', sans-serif",
                  fontSize:13, fontWeight:700, letterSpacing:'0.08em',
                  textTransform:'uppercase', color:'var(--muted)',
                  whiteSpace:'nowrap',
                }}>Rank</th>
                {races.map(r => (
                  <th key={r.race_id} style={{
                    background:'var(--surface2)',
                    borderBottom:'1px solid var(--border2)',
                    borderRight:'1px solid var(--border)',
                    padding:'8px 6px 4px',
                    textAlign:'center',
                    fontFamily:"'Barlow Condensed', sans-serif",
                    fontSize:11, fontWeight:700, letterSpacing:'0.05em',
                    textTransform:'uppercase', color:'var(--text)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    maxWidth:90,
                  }} title={`${r.race_name}${r.track_name ? ' — ' + r.track_name : ''}`}>
                    {r.race_name}
                  </th>
                ))}
              </tr>

              {/* Row 2: Week numbers */}
              <tr>
                <th style={{
                  background:'var(--surface2)',
                  borderBottom:'2px solid var(--border)',
                  borderRight:'1px solid var(--border)',
                  padding:'4px 14px 8px',
                  position:'sticky', left:0, zIndex:3,
                }} />
                <th style={{
                  background:'var(--surface2)',
                  borderBottom:'2px solid var(--border)',
                  borderRight:'2px solid var(--border2)',
                  padding:'4px 8px 8px',
                  position:'sticky', left:180, zIndex:3,
                }} />
                <th style={{ background:'var(--surface2)', borderBottom:'2px solid var(--border)', borderRight:'1px solid var(--border)', padding:'4px 8px 8px' }} />
                <th style={{ background:'var(--surface2)', borderBottom:'2px solid var(--border)', borderRight:'1px solid var(--border)', padding:'4px 8px 8px' }} />
                {races.map(r => (
                  <th key={r.race_id} style={{
                    background:'var(--surface2)',
                    borderBottom:'2px solid var(--border)',
                    borderRight:'1px solid var(--border)',
                    padding:'2px 6px 8px',
                    textAlign:'center',
                    fontFamily:"'Barlow Condensed', sans-serif",
                    fontSize:12, fontWeight:600, letterSpacing:'0.06em',
                    color:'var(--muted)',
                  }}>
                    Wk {r.week_number}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {drivers.map((d, di) => (
                <tr key={d.driver_id} style={{
                  background: di % 2 === 0 ? 'var(--bg)' : 'var(--surface)',
                }}>
                  {/* Driver name */}
                  <td style={{
                    padding:'9px 14px',
                    borderRight:'1px solid var(--border)',
                    borderBottom:'1px solid var(--border)',
                    fontWeight:600, fontSize:14, color:'var(--text)',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                    position:'sticky', left:0, zIndex:1,
                    background: di % 2 === 0 ? 'var(--bg)' : 'var(--surface)',
                  }}>
                    {d.driver_name}
                  </td>

                  {/* Car number */}
                  <td style={{
                    padding:'9px 8px',
                    borderRight:'2px solid var(--border2)',
                    borderBottom:'1px solid var(--border)',
                    textAlign:'center',
                    fontFamily:"'Barlow Condensed', sans-serif",
                    fontWeight:700, fontSize:14, color:'var(--gold)',
                    position:'sticky', left:180, zIndex:1,
                    background: di % 2 === 0 ? 'var(--bg)' : 'var(--surface)',
                  }}>
                    {d.car_number}
                  </td>

                  {/* Season total points */}
                  <td style={{
                    padding:'9px 10px',
                    borderRight:'1px solid var(--border)',
                    borderBottom:'1px solid var(--border)',
                    textAlign:'center',
                    fontFamily:"'Bebas Neue', sans-serif",
                    fontSize:16,
                    color: driverStats[d.driver_id] ? 'var(--text)' : 'var(--dim)',
                  }}>
                    {driverStats[d.driver_id]?.total ?? '—'}
                  </td>

                  {/* Overall rank */}
                  <td style={{
                    padding:'9px 10px',
                    borderRight:'1px solid var(--border)',
                    borderBottom:'1px solid var(--border)',
                    textAlign:'center',
                    fontFamily:"'Barlow Condensed', sans-serif",
                    fontWeight:700,
                    fontSize:14,
                    color: (() => {
                      const r = driverStats[d.driver_id]?.rank
                      if (!r) return 'var(--dim)'
                      if (r <= 3) return '#f5c518'
                      if (r <= 10) return '#22c55e'
                      return 'var(--muted)'
                    })(),
                  }}>
                    {driverStats[d.driver_id]?.rank
                      ? `${driverStats[d.driver_id].rank} / ${Object.keys(driverStats).length}`
                      : '—'}
                  </td>

                  {/* Result per race */}
                  {races.map(r => {
                    const res = resultMap[r.race_id]?.[d.driver_id]
                    return (
                      <td key={r.race_id} style={{
                        padding:'9px 6px',
                        borderRight:'1px solid var(--border)',
                        borderBottom:'1px solid var(--border)',
                        textAlign:'center',
                      }}>
                        {res ? (
                          <span style={{
                            fontFamily:"'Bebas Neue', sans-serif",
                            fontSize:16,
                            color: posColor(res.pos),
                            letterSpacing:'0.03em',
                            opacity: res.dnf ? 0.5 : 1,
                          }}>
                            {res.pos}
                          </span>
                        ) : (
                          <span style={{ color:'var(--dim)', fontSize:12 }}>—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {races.length > 0 && (
        <div style={{ marginTop:16, display:'flex', flexWrap:'wrap', gap:'6px 24px', fontSize:13, color:'var(--muted)', fontFamily:"'Barlow Condensed', sans-serif", letterSpacing:'0.04em' }}>
          <span><span style={{ color:'#f5c518' }}>■</span> Top 3</span>
          <span><span style={{ color:'#22c55e' }}>■</span> Top 10</span>
          <span><span style={{ color:'var(--text)' }}>■</span> P11–20</span>
          <span><span style={{ color:'var(--muted)' }}>■</span> P21+</span>
          <span><span style={{ color:'var(--dim)' }}>—</span> Did not race</span>
          <span>Faded number = DNF</span>
        </div>
      )}
    </div>
  )
}
