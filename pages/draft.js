import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PLAYER_COLORS = ['#3b82f6','#22c55e','#a855f7','#f97316','#ec4899']

function getPickOwner(pickNumber, totalPlayers, players) {
  const round      = Math.ceil(pickNumber / totalPlayers)
  const posInRound = ((pickNumber - 1) % totalPlayers) + 1
  const draftPos   = round % 2 === 1 ? posInRound : totalPlayers - posInRound + 1
  return players.find(p => p.draft_position === draftPos) || null
}

function Loader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
      <span style={{ color:'var(--muted)', fontFamily:"'Barlow Condensed'", fontSize:18, letterSpacing:'0.1em' }}>LOADING…</span>
    </div>
  )
}

// ── Season toggle buttons (shared) ────────────────────────────
function SeasonToggle({ allSeasons, seasonId, onSelect }) {
  if (!allSeasons || allSeasons.length <= 1) return null
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      <span style={{ fontFamily:"'Barlow Condensed'", fontSize:12, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', whiteSpace:'nowrap' }}>
        Season:
      </span>
      {[...allSeasons].sort((a, b) => b.season_year - a.season_year).map(s => (
        <button key={s.season_id} onClick={() => onSelect(s.season_id)} style={{
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
            <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', display:'inline-block' }} />
          )}
        </button>
      ))}
    </div>
  )
}

// ── Draft board (shared between live and historical) ──────────
function DraftBoard({ players, picks, session, swaps = [] }) {
  const teamMap = {}
  players.forEach(p => { teamMap[p.player_id] = [] })
  picks.forEach(pk => { if (teamMap[pk.player_id]) teamMap[pk.player_id].push(pk) })

  // Index swaps by player_id -> original_driver_id for quick lookup
  // Coerce to numbers to avoid string/int mismatch from Supabase
  const swapMap = {}
  swaps.forEach(sw => {
    const pid = parseInt(sw.player_id, 10)
    const did = parseInt(sw.original_driver_id, 10)
    if (!swapMap[pid]) swapMap[pid] = {}
    swapMap[pid][did] = sw
  })

  if (picks.length === 0) return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'40px 20px', textAlign:'center', color:'var(--muted)', fontSize:14 }}>
      No picks yet.
    </div>
  )

  return (
    <div style={{ overflowX:'auto' }}>
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${players.length}, minmax(170px, 1fr))`, gap:12, minWidth: players.length * 180 }}>
        {players.map((p, i) => (
          <div key={p.player_id}>
            <div style={{
              textAlign:'center',
              fontFamily:"'Barlow Condensed', sans-serif",
              fontWeight:700,
              fontSize:18,
              letterSpacing:'0.06em',
              textTransform:'uppercase',
              color: PLAYER_COLORS[i%5],
              borderBottom: `2px solid ${PLAYER_COLORS[i%5]}`,
              paddingBottom:8,
              marginBottom:10,
            }}>
              {p.player_name}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {(teamMap[p.player_id]||[])
                .sort((a,b)=>a.round_number-b.round_number)
                .map(pk => {
                  const swap = swapMap[parseInt(p.player_id,10)]?.[parseInt(pk.driver_id,10)]
                  return (
                    <div key={pk.draft_pick_id} style={{
                      background: swap ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
                      border: `1px solid ${swap ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                      borderRadius:9,
                      padding:'10px 12px',
                    }}>
                      {/* Original driver — struck through if swapped */}
                      <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                        <span style={{
                          fontWeight:600,
                          fontSize:15,
                          color: swap ? 'var(--dim)' : 'var(--text)',
                          lineHeight:1.3,
                          textDecoration: swap ? 'line-through' : 'none',
                        }}>
                          {pk.drivers?.driver_name}
                        </span>
                        {swap && (
                          <span style={{
                            background:'rgba(99,102,241,0.2)',
                            color:'#a5b4fc',
                            borderRadius:4,
                            padding:'1px 5px',
                            fontFamily:"'Barlow Condensed', sans-serif",
                            fontSize:10,
                            fontWeight:700,
                            letterSpacing:'0.06em',
                            textTransform:'uppercase',
                            flexShrink:0,
                          }}>swap</span>
                        )}
                      </div>
                      <div style={{ color:'var(--dim)', fontSize:13, marginTop:2 }}>
                        #{pk.drivers?.car_number} · R{pk.round_number}
                      </div>
                      {/* Swap driver shown below */}
                      {swap && (
                        <div style={{ marginTop:5, paddingTop:5, borderTop:'1px solid rgba(99,102,241,0.2)' }}>
                          <div style={{ fontWeight:600, fontSize:15, color:'#a5b4fc', lineHeight:1.3 }}>
                            {swap.swap_driver?.driver_name}
                          </div>
                          <div style={{ color:'rgba(165,180,252,0.6)', fontSize:11, marginTop:1 }}>
                            #{swap.swap_driver?.car_number} · from Wk {swap.start_week}
                            {swap.notes && <span style={{ color:'var(--dim)', fontStyle:'italic' }}> · {swap.notes}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              {/* Empty slots */}
              {session && Array.from({ length: (session.total_rounds||0) - (teamMap[p.player_id]?.length||0) }).map((_,j)=>(
                <div key={j} style={{
                  border:'1px dashed var(--border)',
                  borderRadius:9,
                  padding:'10px 12px',
                  textAlign:'center',
                  color:'var(--dim)',
                  fontSize:13,
                }}>
                  Round {(teamMap[p.player_id]?.length||0)+j+1}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Historical (read-only) draft view ─────────────────────────
function HistoricalDraft({ season }) {
  const [session,  setSession]  = useState(null)
  const [players,  setPlayers]  = useState([])
  const [picks,    setPicks]    = useState([])
  const [swaps,    setSwaps]    = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!season) return
    setLoading(true)
    async function load() {
      const { data: sess } = await supabase
        .from('draft_sessions').select('*').eq('season_id', season.season_id).single()
      setSession(sess)

      const { data: pl } = await supabase
        .from('players').select('*').eq('season_id', season.season_id).order('draft_position')
      setPlayers(pl || [])

      if (sess) {
        const { data: pks } = await supabase
          .from('draft_picks')
          .select('*, players(player_name), drivers(driver_name, car_number, team)')
          .eq('draft_session_id', sess.draft_session_id)
          .order('pick_number')
        setPicks(pks || [])
      }

      const { data: sw } = await supabase
        .from('driver_swaps')
        .select('*, swap_driver:drivers!driver_swaps_swap_driver_id_fkey(driver_name, car_number)')
        .eq('season_id', season.season_id)
      setSwaps(sw || [])

      setLoading(false)
    }
    load()
  }, [season])

  if (!season) return <Loader />
  if (loading) return <Loader />

  if (!session) return (
    <div style={{ textAlign:'center', padding:'48px', color:'var(--muted)', fontSize:15 }}>
      No draft session found for this season.
    </div>
  )

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        background:'var(--surface)',
        border:'1px solid var(--border)',
        borderRadius:12,
        padding:'14px 20px',
        display:'flex',
        flexWrap:'wrap',
        gap:'8px 28px',
        marginBottom:24,
        fontSize:14,
      }}>
        <span><span style={{ color:'var(--muted)' }}>Players: </span><span style={{ color:'var(--text)', fontWeight:600 }}>{players.length}</span></span>
        <span><span style={{ color:'var(--muted)' }}>Rounds: </span><span style={{ color:'var(--text)', fontWeight:600 }}>{session.total_rounds}</span></span>
        <span><span style={{ color:'var(--muted)' }}>Total picks: </span><span style={{ color:'var(--text)', fontWeight:600 }}>{picks.length}</span></span>
        <span>
          <span style={{
            background: session.is_complete ? 'rgba(34,197,94,0.15)' : 'rgba(245,197,24,0.15)',
            color: session.is_complete ? 'var(--green)' : 'var(--gold)',
            borderRadius:6,
            padding:'2px 10px',
            fontFamily:"'Barlow Condensed', sans-serif",
            fontSize:12,
            fontWeight:700,
            letterSpacing:'0.05em',
            textTransform:'uppercase',
          }}>
            {session.is_complete ? '✓ Complete' : 'In Progress'}
          </span>
        </span>
      </div>

      <DraftBoard players={players} picks={picks} session={session} swaps={swaps} />
    </div>
  )
}

// ── Main draft page ────────────────────────────────────────────
export default function DraftPage() {
  const [allSeasons,  setAllSeasons]  = useState([])
  const [seasonId,    setSeasonId]    = useState(null)
  const [loading,     setLoading]     = useState(true)

  // Live draft state (active season only)
  const [session,    setSession]    = useState(null)
  const [players,    setPlayers]    = useState([])
  const [picks,      setPicks]      = useState([])
  const [swaps,      setSwaps]      = useState([])
  const [available,  setAvailable]  = useState([])
  const [picking,    setPicking]    = useState(false)
  const [error,      setError]      = useState('')
  const [search,     setSearch]     = useState('')
  const [dataLoading, setDataLoading] = useState(false)

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

  // Load active season draft data
  const fetchState = useCallback(async () => {
    const active = allSeasons.find(s => s.is_active)
    if (!active || seasonId !== active.season_id) return

    const { data: sess } = await supabase
      .from('draft_sessions').select('*').eq('season_id', active.season_id).single()
    setSession(sess)

    const { data: pl } = await supabase
      .from('players').select('*').eq('season_id', active.season_id).order('draft_position')
    setPlayers(pl || [])

    if (!sess) { setLoading(false); setDataLoading(false); return }

    const { data: pks } = await supabase
      .from('draft_picks')
      .select('*, players(player_name), drivers(driver_name, car_number, team)')
      .eq('draft_session_id', sess.draft_session_id)
      .order('pick_number')
    setPicks(pks || [])

    const { data: sw } = await supabase
      .from('driver_swaps')
      .select('*, swap_driver:drivers!driver_swaps_swap_driver_id_fkey(driver_name, car_number)')
      .eq('season_id', active.season_id)
    setSwaps(sw || [])

    const { data: drv } = await supabase
      .from('drivers').select('*').eq('season_id', active.season_id).order('driver_name')
    const taken = new Set((pks||[]).map(p=>p.driver_id))
    setAvailable((drv||[]).filter(d=>!taken.has(d.driver_id)))
    setLoading(false)
    setDataLoading(false)
  }, [allSeasons, seasonId])

  // When seasonId changes, trigger data load for active season
  useEffect(() => {
    if (!allSeasons.length || !seasonId) return
    const active = allSeasons.find(x => x.is_active)
    setDataLoading(true)
    if (seasonId === active?.season_id) {
      fetchState()
    } else {
      setLoading(false)
      setDataLoading(false)
    }
  }, [seasonId, allSeasons])

  // Realtime subscription (active season only)
  useEffect(() => {
    const active = allSeasons.find(s => s.is_active)
    if (!active || seasonId !== active.season_id) return

    fetchState()
    const ch = supabase.channel('draft_rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'draft_picks'},    fetchState)
      .on('postgres_changes',{event:'*',schema:'public',table:'draft_sessions'}, fetchState)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [fetchState, allSeasons, seasonId])

  async function makePick(driver) {
    if (!onClock || picking) return
    setError(''); setPicking(true)
    const { data, error: e } = await supabase.rpc('make_draft_pick',{ p_player_id:onClock.player_id, p_driver_id:driver.driver_id })
    setPicking(false)
    if (e || !data?.success) setError(data?.error || e?.message || 'Pick failed.')
  }

  const activeSeason  = (allSeasons || []).find(s => s.is_active)
  const isActiveSeason = activeSeason?.season_id === seasonId
  const season        = allSeasons.find(x => x.season_id === seasonId) || null
  const totalPicks    = session?.total_drivers  || 20
  const totalPlayers  = session?.total_players  || 0
  const currentPick   = session?.current_pick_num || 1
  const isComplete    = session?.is_complete || false
  const onClock       = session && !isComplete && players.length ? getPickOwner(currentPick, totalPlayers, players) : null
  const round         = Math.ceil(currentPick / (totalPlayers||1))
  const teamMap       = {}
  players.forEach(p => { teamMap[p.player_id] = [] })
  picks.forEach(pk => { if (teamMap[pk.player_id]) teamMap[pk.player_id].push(pk) })

  const filtered = available.filter(d =>
    d.driver_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.car_number||'').includes(search) ||
    (d.team||'').toLowerCase().includes(search.toLowerCase())
  )

  if (!seasonId || (loading && allSeasons.length === 0)) return <Loader />

  return (
    <div className="fade-up">
      {/* Header + season toggle */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:48, color:'var(--text)', margin:0 }}>
            Draft Room
            {!isActiveSeason && (
              <span style={{ marginLeft:12, fontFamily:"'Barlow Condensed', sans-serif", fontSize:16, color:'var(--muted)', fontWeight:400, letterSpacing:'0.06em', textTransform:'uppercase' }}>
                Archive
              </span>
            )}
          </h1>
          <p style={{ color:'var(--muted)', fontSize:14, marginTop:4 }}>{season?.season_name}</p>
        </div>
        <SeasonToggle allSeasons={allSeasons} seasonId={seasonId} onSelect={id => { setSeasonId(id); setSearch('') }} />
      </div>

      {/* Historical view */}
      {!isActiveSeason && season && (
        <HistoricalDraft season={season} />
      )}

      {/* Active season live draft */}
      {isActiveSeason && (
        <>
          {dataLoading ? <Loader /> : (
            <>
              {!session ? (
                <div style={{ textAlign:'center', padding:'60px 20px' }}>
                  <div style={{ fontSize:52, marginBottom:12 }}>🚗</div>
                  <h2 style={{ fontSize:28, color:'var(--text)', marginBottom:8 }}>Draft Not Started</h2>
                  <p style={{ color:'var(--muted)', fontSize:15 }}>The admin needs to add players and start the draft.</p>
                </div>
              ) : (
                <>
                  {/* Status card */}
                  {isComplete ? (
                    <div style={{
                      background:'rgba(34,197,94,0.08)',
                      border:'2px solid var(--green)',
                      borderRadius:14,
                      padding:'28px 24px',
                      marginBottom:24,
                      textAlign:'center',
                    }}>
                      <div style={{ fontSize:40, marginBottom:6 }}>🏁</div>
                      <h3 style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:36, color:'var(--green)', margin:'0 0 4px', letterSpacing:'0.04em' }}>Draft Complete!</h3>
                      <p style={{ color:'var(--muted)', margin:0, fontSize:14 }}>All {totalPicks} drivers have been selected.</p>
                    </div>
                  ) : (() => {
                    const clockIdx  = players.findIndex(p => p.player_id === onClock?.player_id)
                    const clockColor = clockIdx >= 0 ? PLAYER_COLORS[clockIdx % 5] : 'var(--text)'
                    return (
                      <div style={{
                        background: `${clockColor}11`,
                        border: `2px solid ${clockColor}`,
                        borderRadius:14,
                        padding:'20px 24px',
                        marginBottom:20,
                      }} className="on-clock">
                        <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:16 }}>
                          {/* On the clock */}
                          <div>
                            <div style={{ fontFamily:"'Barlow Condensed'", fontSize:12, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--muted)', marginBottom:2 }}>
                              🕐 On the Clock
                            </div>
                            <div style={{ fontFamily:"'Bebas Neue'", fontSize:42, color: clockColor, letterSpacing:'0.04em', lineHeight:1 }}>
                              {onClock?.player_name || '—'}
                            </div>
                            <div style={{ fontFamily:"'Barlow Condensed'", fontSize:13, color:'var(--muted)', marginTop:4, letterSpacing:'0.04em' }}>
                              Make your selection from the driver list
                            </div>
                          </div>
                          {/* Stats */}
                          <div style={{ display:'flex', gap:28, flexWrap:'wrap' }}>
                            {[
                              { label:'Pick',      value:`${currentPick} / ${totalPicks}` },
                              { label:'Round',     value:`${round} / ${session.total_rounds}` },
                              { label:'Available', value:available.length },
                            ].map(stat => (
                              <div key={stat.label} style={{ textAlign:'center' }}>
                                <div style={{ fontFamily:"'Barlow Condensed'", fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:2 }}>{stat.label}</div>
                                <div style={{ fontFamily:"'Bebas Neue'", fontSize:30, color:'var(--text)', letterSpacing:'0.04em' }}>{stat.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="racing-bar" style={{ borderRadius:4, marginBottom:20, display: isComplete ? 'none' : 'block' }} />

                  {error && (
                    <div style={{ background:'rgba(232,25,44,0.12)', border:'1px solid rgba(232,25,44,0.35)', color:'#ff6b7a', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:14 }}>
                      ⚠️ {error}
                    </div>
                  )}

                  <div style={{ display:'grid', gridTemplateColumns: isComplete ? '1fr' : '1fr 1fr', gap:24 }}>
                    {/* Available drivers */}
                    {!isComplete && (
                      <div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                          <h2 style={{ fontSize:24, margin:0, color:'var(--text)' }}>Available Drivers</h2>
                          <span style={{ color:'var(--muted)', fontSize:13 }}>{available.length} left</span>
                        </div>
                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search name, number, or team…"
                          style={{ display:'block', width:'100%', background:'var(--bg)', border:'1px solid var(--border2)', borderRadius:8, padding:'10px 14px', color:'var(--text)', fontSize:14, marginBottom:10, outline:'none' }}
                        />
                        <div style={{ overflowY:'auto', maxHeight:480, display:'flex', flexDirection:'column', gap:6 }}>
                          {filtered.map(d => (
                            <div key={d.driver_id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontWeight:600, color:'var(--text)', fontSize:15, whiteSpace:'nowrap' }}>
                                  {d.driver_name}
                                  <span style={{ color:'var(--gold)', fontSize:13, marginLeft:8 }}>#{d.car_number}</span>
                                </div>
                                <div style={{ color:'var(--muted)', fontSize:12, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.team}</div>
                              </div>
                              {onClock && (
                                <button onClick={() => makePick(d)} disabled={picking} style={{ flexShrink:0, background:'var(--red)', color:'#fff', border:'none', borderRadius:7, padding:'8px 16px', fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700, fontSize:13, letterSpacing:'0.06em', textTransform:'uppercase', cursor: picking ? 'not-allowed' : 'pointer', opacity: picking ? 0.5 : 1 }}>
                                  {picking ? '…' : 'Draft'}
                                </button>
                              )}
                            </div>
                          ))}
                          {filtered.length === 0 && (
                            <div style={{ textAlign:'center', color:'var(--dim)', padding:'32px 0', fontSize:14 }}>No drivers match your search.</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Draft board */}
                    <div>
                      <h2 style={{ fontSize:24, margin:'0 0 12px', color:'var(--text)' }}>Draft Board</h2>
                      <DraftBoard players={players} picks={picks} session={session} swaps={swaps} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
