import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PLAYER_COLORS = ['#3b82f6','#22c55e','#a855f7','#f97316','#ec4899']
const METRICS = [
  { id: 'bestworst',  label: 'Best & Worst Driver',       icon: '🏅' },
  { id: 'draftperf',  label: 'Draft Performance',          icon: '🎯' },
  { id: 'drafteff',   label: 'Draft Position Efficiency',  icon: '⚡' },
]

// ── Shared cell style helpers ──────────────────────────────────
function heatColor(val, min, max, invert = false) {
  // invert=false: low = green (good in our scoring system)
  // For draft performance rank: 1 = best = green
  if (val === null || val === undefined) return 'transparent'
  const ratio = max === min ? 0.5 : (val - min) / (max - min)
  const r = invert ? ratio : 1 - ratio
  // green (#22c55e) to red (#ef4444) via neutral
  const g = Math.round(34 + (197 - 34) * (1 - r))
  const red = Math.round(239 + (34 - 239) * (1 - r))
  return `rgba(${red},${g},78,0.18)`
}

function ordinal(n) {
  if (!n) return '—'
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function MetricsPage() {
  const [allSeasons,  setAllSeasons]  = useState([])
  const [seasonId,    setSeasonId]    = useState(null)
  const [season,      setSeason]      = useState(null)
  const [metric,      setMetric]      = useState('bestworst')
  const [loading,     setLoading]     = useState(true)
  const [dataLoad,    setDataLoad]    = useState(false)

  // Core data
  const [players,     setPlayers]     = useState([])  // season players ordered by draft_position
  const [picks,       setPicks]       = useState([])  // draft picks with driver info
  const [driverTotals, setDriverTotals] = useState({}) // driver_id -> total finish pts (season)
  const [driverRanks,  setDriverRanks]  = useState({}) // driver_id -> rank among all drafted drivers

  // Load seasons
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

  // Load data when season changes
  useEffect(() => {
    if (!seasonId) return
    const s = allSeasons.find(x => x.season_id === seasonId)
    setSeason(s || null)
    setDataLoad(true)
    let cancelled = false

    async function load() {
      try {
        // Players sorted by draft position
        const { data: pl } = await supabase
          .from('players').select('*')
          .eq('season_id', seasonId)
          .order('draft_position')

        // Draft session
        const { data: sess } = await supabase
          .from('draft_sessions').select('draft_session_id')
          .eq('season_id', seasonId).single()

        // Picks with driver info
        const { data: pks } = sess
          ? await supabase
              .from('draft_picks')
              .select('*, drivers(driver_name, car_number)')
              .eq('draft_session_id', sess.draft_session_id)
              .order('pick_number')
          : { data: [] }

        // All completed races for this season
        const { data: races } = await supabase
          .from('races').select('race_id')
          .eq('season_id', seasonId)
          .eq('is_complete', true)

        // All results for those races
        let allResults = []
        if (races && races.length) {
          await Promise.all(races.map(async race => {
            const { data: res } = await supabase
              .from('race_results')
              .select('driver_id, finish_position')
              .eq('race_id', race.race_id)
            if (!cancelled) allResults = allResults.concat(res || [])
          }))
        }

        if (cancelled) return

        // Sum finish positions per driver (lower = better)
        const totals = {}
        allResults.forEach(r => {
          totals[r.driver_id] = (totals[r.driver_id] || 0) + r.finish_position
        })

        // Only rank drivers who were actually drafted this season
        const draftedDriverIds = (pks || []).map(p => p.driver_id)
        const draftedWithTotals = draftedDriverIds
          .filter(id => totals[id] !== undefined)
          .map(id => ({ id, total: totals[id] }))
          .sort((a, b) => a.total - b.total)

        const ranks = {}
        draftedWithTotals.forEach((d, i) => { ranks[d.id] = i + 1 })

        setPlayers(pl || [])
        setPicks(pks || [])
        setDriverTotals(totals)
        setDriverRanks(ranks)
      } catch (err) {
        console.error('Metrics load error:', err)
      } finally {
        if (!cancelled) { setDataLoad(false); setLoading(false) }
      }
    }

    load()
    return () => { cancelled = true }
  }, [seasonId, allSeasons])

  // ── Derived data ───────────────────────────────────────────────

  // Per-player picks, grouped and ordered by round (pick_number within player)
  function playerPicksByRound(playerId) {
    return picks
      .filter(p => p.player_id === playerId)
      .sort((a, b) => a.round_number - b.round_number)
  }

  // Number of rounds (max picks any player has)
  const maxRounds = players.length
    ? Math.max(...players.map(p => playerPicksByRound(p.player_id).length), 0)
    : 0

  const ordinalLabels = ['First','Second','Third','Fourth','Fifth','Sixth',
    'Seventh','Eighth','Ninth','Tenth']

  // ── Season toggle ──────────────────────────────────────────────
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

  return (
    <div className="fade-up">
      {/* Header row */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:48, color:'var(--text)', margin:0 }}>Metrics</h1>
          <p style={{ color:'var(--muted)', fontSize:14, marginTop:4 }}>{season?.season_name}</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'flex-end' }}>
          <SeasonToggle />
          {/* Metric selector */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
            {METRICS.map(m => (
              <button key={m.id} onClick={()=>setMetric(m.id)} style={{
                padding:'7px 16px', borderRadius:8,
                border:`2px solid ${metric===m.id ? 'var(--red)' : 'var(--border2)'}`,
                background: metric===m.id ? 'rgba(232,25,44,0.12)' : 'var(--surface)',
                color: metric===m.id ? 'var(--text)' : 'var(--muted)',
                fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700, fontSize:13,
                letterSpacing:'0.05em', textTransform:'uppercase', cursor:'pointer', transition:'all 0.15s',
                display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
              }}>
                <span>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {dataLoad ? (
        <div style={{ textAlign:'center', padding:'60px', color:'var(--muted)', fontFamily:"'Barlow Condensed'", letterSpacing:'0.1em', fontSize:16 }}>LOADING…</div>
      ) : picks.length === 0 ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'60px', textAlign:'center' }}>
          <p style={{ color:'var(--muted)', fontSize:16 }}>No draft data found for this season.</p>
        </div>
      ) : (
        <>
          {/* ── METRIC 1: Best & Worst Driver ── */}
          {metric === 'bestworst' && (
            <div>
              <h2 style={{ fontSize:30, color:'var(--text)', margin:'0 0 6px' }}>Best &amp; Worst Driver</h2>
              <p style={{ color:'var(--muted)', fontSize:13, margin:'0 0 20px' }}>
                Based on total accumulated finish position points this season — lower is better.
              </p>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      {['Player','Best Driver','Total Pts','Rank','Worst Driver','Total Pts','Rank'].map((h,i) => (
                        <th key={i} style={{
                          padding:'12px 16px', background:'var(--surface2)',
                          borderBottom:'1px solid var(--border)',
                          fontFamily:"'Barlow Condensed', sans-serif",
                          fontSize:13, fontWeight:700, letterSpacing:'0.08em',
                          textTransform:'uppercase', color:'var(--muted)',
                          textAlign: i === 0 ? 'left' : 'center',
                          whiteSpace:'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((pl, pi) => {
                      const myPicks = playerPicksByRound(pl.player_id)
                      const withTotals = myPicks
                        .filter(p => driverTotals[p.driver_id] !== undefined)
                        .map(p => ({ ...p, total: driverTotals[p.driver_id], rank: driverRanks[p.driver_id] }))
                        .sort((a,b) => a.total - b.total)

                      const best  = withTotals[0]
                      const worst = withTotals[withTotals.length - 1]

                      return (
                        <tr key={pl.player_id} style={{ borderTop:'1px solid var(--border)' }}>
                          <td style={{ padding:'14px 16px', fontFamily:"'Barlow Condensed', sans-serif", fontSize:18, fontWeight:700, color:PLAYER_COLORS[pi%5], letterSpacing:'0.03em', textTransform:'uppercase' }}>
                            {pl.player_name}
                          </td>
                          {/* Best */}
                          <td style={{ padding:'14px 16px', textAlign:'center' }}>
                            <div style={{ fontWeight:600, color:'var(--green)', fontSize:15 }}>{best?.drivers?.driver_name || '—'}</div>
                            <div style={{ color:'var(--gold)', fontSize:12 }}>#{best?.drivers?.car_number}</div>
                          </td>
                          <td style={{ padding:'14px 16px', textAlign:'center', fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'var(--green)' }}>
                            {best?.total ?? '—'}
                          </td>
                          <td style={{ padding:'14px 16px', textAlign:'center', fontFamily:"'Barlow Condensed', sans-serif", fontSize:15, fontWeight:700, color:'var(--green)' }}>
                            {best?.rank ? ordinal(best.rank) : '—'}
                          </td>
                          {/* Worst */}
                          <td style={{ padding:'14px 16px', textAlign:'center' }}>
                            <div style={{ fontWeight:600, color:'#f87171', fontSize:15 }}>{worst?.drivers?.driver_name || '—'}</div>
                            <div style={{ color:'var(--gold)', fontSize:12 }}>#{worst?.drivers?.car_number}</div>
                          </td>
                          <td style={{ padding:'14px 16px', textAlign:'center', fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#f87171' }}>
                            {worst?.total ?? '—'}
                          </td>
                          <td style={{ padding:'14px 16px', textAlign:'center', fontFamily:"'Barlow Condensed', sans-serif", fontSize:15, fontWeight:700, color:'#f87171' }}>
                            {worst?.rank ? ordinal(worst.rank) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── METRIC 2: Draft Performance ── */}
          {metric === 'draftperf' && (() => {
            // Collect all rank values for heat coloring
            const allRanks = []
            players.forEach(pl => {
              playerPicksByRound(pl.player_id).forEach(p => {
                if (driverRanks[p.driver_id]) allRanks.push(driverRanks[p.driver_id])
              })
            })
            const minRank = Math.min(...allRanks)
            const maxRank = Math.max(...allRanks)

            return (
              <div>
                <h2 style={{ fontSize:30, color:'var(--text)', margin:'0 0 6px' }}>Draft Performance</h2>
                <p style={{ color:'var(--muted)', fontSize:13, margin:'0 0 20px' }}>
                  Current overall rank of each drafted driver among all {picks.length} drafted drivers this season — lower is better.
                </p>
                <div style={{ overflowX:'auto', borderRadius:14, border:'1px solid var(--border)' }}>
                  <table style={{ borderCollapse:'collapse', width:'100%', minWidth: 140 + players.length * 120 }}>
                    <thead>
                      <tr>
                        <th style={{ padding:'12px 20px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', borderRight:'1px solid var(--border)', fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', textAlign:'left', whiteSpace:'nowrap', width:140 }}>
                          Pick
                        </th>
                        {players.map((pl, pi) => (
                          <th key={pl.player_id} style={{ padding:'12px 16px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', borderRight:'1px solid var(--border)', fontFamily:"'Barlow Condensed', sans-serif", fontSize:15, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:PLAYER_COLORS[pi%5], textAlign:'center', whiteSpace:'nowrap' }}>
                            {pl.player_name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxRounds }).map((_, roundIdx) => (
                        <tr key={roundIdx} style={{ borderTop:'1px solid var(--border)' }}>
                          <td style={{ padding:'12px 20px', borderRight:'1px solid var(--border)', fontFamily:"'Barlow Condensed', sans-serif", fontSize:14, fontWeight:700, color:'var(--muted)', letterSpacing:'0.05em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
                            {ordinalLabels[roundIdx] || `Pick ${roundIdx+1}`} Pick
                          </td>
                          {players.map((pl, pi) => {
                            const myPicks = playerPicksByRound(pl.player_id)
                            const pick = myPicks[roundIdx]
                            const rank = pick ? driverRanks[pick.driver_id] : null
                            const bg   = rank ? heatColor(rank, minRank, maxRank) : 'transparent'
                            return (
                              <td key={pl.player_id} style={{ padding:'12px 16px', borderRight:'1px solid var(--border)', textAlign:'center', background: bg }}>
                                {pick ? (
                                  <div>
                                    <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:26, color: rank <= 5 ? 'var(--green)' : rank <= 10 ? 'var(--gold)' : 'var(--text)', letterSpacing:'0.04em', lineHeight:1 }}>
                                      {rank ?? '—'}
                                    </div>
                                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                                      {pick.drivers?.driver_name}
                                    </div>
                                    <div style={{ fontSize:10, color:'var(--dim)' }}>#{pick.drivers?.car_number}</div>
                                  </div>
                                ) : <span style={{ color:'var(--dim)' }}>—</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop:12, fontSize:13, color:'var(--muted)', fontFamily:"'Barlow Condensed', sans-serif", letterSpacing:'0.04em', display:'flex', gap:20, flexWrap:'wrap' }}>
                  <span><span style={{ color:'var(--green)' }}>■</span> Top 5 rank</span>
                  <span><span style={{ color:'var(--gold)' }}>■</span> Top 10 rank</span>
                  <span>Heat shading: green = low rank (best), red = high rank (worst)</span>
                </div>
              </div>
            )
          })()}

          {/* ── METRIC 3: Draft Position Efficiency ── */}
          {metric === 'drafteff' && (() => {
            // efficiency = rank / pick_position_overall
            // pick_position_overall = round_number for that player's picks
            // (1st pick = round 1, 2nd pick = round 2, etc.)
            const allEff = []
            players.forEach(pl => {
              playerPicksByRound(pl.player_id).forEach((p, idx) => {
                const rank = driverRanks[p.driver_id]
                if (rank) {
                  const pickPos = idx + 1
                  allEff.push(rank / pickPos)
                }
              })
            })
            const minEff = Math.min(...allEff)
            const maxEff = Math.max(...allEff)

            return (
              <div>
                <h2 style={{ fontSize:30, color:'var(--text)', margin:'0 0 6px' }}>Draft Position Efficiency</h2>
                <p style={{ color:'var(--muted)', fontSize:13, margin:'0 0 20px' }}>
                  Current driver rank ÷ draft pick number. A value of <strong style={{ color:'var(--text)' }}>1.0</strong> means the driver is ranked exactly where they were drafted. <strong style={{ color:'var(--green)' }}>Below 1.0</strong> = outperforming draft position. <strong style={{ color:'#f87171' }}>Above 1.0</strong> = underperforming.
                </p>
                <div style={{ overflowX:'auto', borderRadius:14, border:'1px solid var(--border)' }}>
                  <table style={{ borderCollapse:'collapse', width:'100%', minWidth: 140 + players.length * 120 }}>
                    <thead>
                      <tr>
                        <th style={{ padding:'12px 20px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', borderRight:'1px solid var(--border)', fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', textAlign:'left', whiteSpace:'nowrap', width:140 }}>
                          Pick
                        </th>
                        {players.map((pl, pi) => (
                          <th key={pl.player_id} style={{ padding:'12px 16px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', borderRight:'1px solid var(--border)', fontFamily:"'Barlow Condensed', sans-serif", fontSize:15, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:PLAYER_COLORS[pi%5], textAlign:'center', whiteSpace:'nowrap' }}>
                            {pl.player_name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxRounds }).map((_, roundIdx) => (
                        <tr key={roundIdx} style={{ borderTop:'1px solid var(--border)' }}>
                          <td style={{ padding:'12px 20px', borderRight:'1px solid var(--border)', fontFamily:"'Barlow Condensed', sans-serif", fontSize:14, fontWeight:700, color:'var(--muted)', letterSpacing:'0.05em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
                            {ordinalLabels[roundIdx] || `Pick ${roundIdx+1}`} Pick
                          </td>
                          {players.map((pl, pi) => {
                            const myPicks = playerPicksByRound(pl.player_id)
                            const pick = myPicks[roundIdx]
                            const rank = pick ? driverRanks[pick.driver_id] : null
                            const pickPos = roundIdx + 1
                            const eff = rank ? (rank / pickPos) : null

                            // Heat: low eff (< 1) = green (good), high eff = red (bad)
                            const bg = eff !== null ? heatColor(eff, minEff, maxEff) : 'transparent'

                            // Color text based on whether above/below 1.0
                            const textColor = eff === null ? 'var(--dim)'
                              : eff <= 1   ? 'var(--green)'
                              : eff <= 2   ? 'var(--text)'
                              : '#f87171'

                            return (
                              <td key={pl.player_id} style={{ padding:'12px 16px', borderRight:'1px solid var(--border)', textAlign:'center', background: bg }}>
                                {pick && eff !== null ? (
                                  <div>
                                    <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:26, color: textColor, letterSpacing:'0.04em', lineHeight:1 }}>
                                      {eff.toFixed(2)}
                                    </div>
                                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                                      {pick.drivers?.driver_name}
                                    </div>
                                    <div style={{ fontSize:10, color:'var(--dim)' }}>
                                      Rank {rank} ÷ Pick {pickPos}
                                    </div>
                                  </div>
                                ) : pick ? (
                                  <div>
                                    <div style={{ fontSize:11, color:'var(--dim)' }}>{pick.drivers?.driver_name}</div>
                                    <div style={{ fontSize:10, color:'var(--dim)' }}>no results</div>
                                  </div>
                                ) : <span style={{ color:'var(--dim)' }}>—</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop:12, fontSize:13, color:'var(--muted)', fontFamily:"'Barlow Condensed', sans-serif", letterSpacing:'0.04em', display:'flex', gap:20, flexWrap:'wrap' }}>
                  <span><span style={{ color:'var(--green)' }}>■</span> ≤ 1.0 — outperforming draft position</span>
                  <span><span style={{ color:'#f87171' }}>■</span> &gt; 2.0 — significantly underperforming</span>
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
