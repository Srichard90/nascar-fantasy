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

function Empty({ icon, title, sub }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px' }}>
      <div style={{ fontSize:52, marginBottom:12 }}>{icon}</div>
      <h2 style={{ fontSize:28, color:'var(--text)', marginBottom:8 }}>{title}</h2>
      <p style={{ color:'var(--muted)', fontSize:15 }}>{sub}</p>
    </div>
  )
}

export default function DraftPage() {
  const [season,     setSeason]     = useState(null)
  const [session,    setSession]    = useState(null)
  const [players,    setPlayers]    = useState([])
  const [picks,      setPicks]      = useState([])
  const [available,  setAvailable]  = useState([])
  const [myPlayer,   setMyPlayer]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [picking,    setPicking]    = useState(false)
  const [error,      setError]      = useState('')
  const [search,     setSearch]     = useState('')

  const fetchState = useCallback(async () => {
    const { data: s } = await supabase.from('seasons').select('*').eq('is_active',true).single()
    setSeason(s)
    if (!s) { setLoading(false); return }

    const { data: sess } = await supabase.from('draft_sessions').select('*').eq('season_id', s.season_id).single()
    setSession(sess)

    const { data: pl } = await supabase.from('players').select('*').eq('season_id', s.season_id).order('draft_position')
    setPlayers(pl || [])

    if (!sess) { setLoading(false); return }

    const { data: pks } = await supabase
      .from('draft_picks')
      .select('*, players(player_name), drivers(driver_name, car_number, team)')
      .eq('draft_session_id', sess.draft_session_id)
      .order('pick_number')
    setPicks(pks || [])

    const { data: drv } = await supabase.from('drivers').select('*').eq('is_active',true).order('driver_name')
    const taken = new Set((pks||[]).map(p=>p.driver_id))
    setAvailable((drv||[]).filter(d=>!taken.has(d.driver_id)))
    setLoading(false)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('nascar_my_player_id')
    if (saved) setMyPlayer(parseInt(saved,10))
  }, [])

  useEffect(() => {
    fetchState()
    const ch = supabase.channel('draft_rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'draft_picks'},    fetchState)
      .on('postgres_changes',{event:'*',schema:'public',table:'draft_sessions'}, fetchState)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [fetchState])

  async function makePick(driver) {
    if (!myPlayer || picking) return
    setError(''); setPicking(true)
    const { data, error: e } = await supabase.rpc('make_draft_pick',{ p_player_id:myPlayer, p_driver_id:driver.driver_id })
    setPicking(false)
    if (e || !data?.success) setError(data?.error || e?.message || 'Pick failed.')
  }

  const totalPicks    = session?.total_drivers  || 20
  const totalPlayers  = session?.total_players  || 0
  const currentPick   = session?.current_pick_num || 1
  const isComplete    = session?.is_complete || false
  const onClock       = session && !isComplete && players.length ? getPickOwner(currentPick, totalPlayers, players) : null
  const isMyTurn      = onClock?.player_id === myPlayer
  const round         = Math.ceil(currentPick / (totalPlayers||1))

  const filtered = available.filter(d =>
    d.driver_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.car_number||'').includes(search) ||
    (d.team||'').toLowerCase().includes(search.toLowerCase())
  )

  // Build team columns
  const teamMap = {}
  players.forEach(p => { teamMap[p.player_id] = [] })
  picks.forEach(pk => { if (teamMap[pk.player_id]) teamMap[pk.player_id].push(pk) })

  if (loading) return <Loader />
  if (!season)  return <Empty icon="🏁" title="No Active Season" sub="An admin needs to set up the league first." />
  if (!session) return <Empty icon="🚗" title="Draft Not Started" sub="The admin needs to add players and start the draft." />

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 48, color: 'var(--text)', margin: 0 }}>Draft Room</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{season.season_name}</p>
      </div>

      {/* "I am" row */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        marginBottom: 20,
      }}>
        <span style={{ color:'var(--muted)', fontFamily:"'Barlow Condensed'", fontSize:13, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
          I am:
        </span>
        {players.map((p, i) => {
          const active = myPlayer === p.player_id
          return (
            <button key={p.player_id} onClick={() => {
              setMyPlayer(p.player_id)
              localStorage.setItem('nascar_my_player_id', p.player_id)
            }} style={{
              padding: '6px 16px',
              borderRadius: 99,
              border: `2px solid ${active ? PLAYER_COLORS[i%5] : 'var(--border2)'}`,
              background: active ? PLAYER_COLORS[i%5]+'22' : 'transparent',
              color: active ? PLAYER_COLORS[i%5] : 'var(--muted)',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {p.player_name}
            </button>
          )
        })}
        {!myPlayer && <span style={{ color:'var(--gold)', fontSize:13 }}>← Select your name to pick</span>}
      </div>

      {/* Status card */}
      <div style={{
        background: isComplete ? 'rgba(34,197,94,0.08)' : isMyTurn ? 'rgba(232,25,44,0.1)' : 'var(--surface)',
        border: `2px solid ${isComplete ? 'var(--green)' : isMyTurn ? 'var(--red)' : 'var(--border)'}`,
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 24,
      }} className={isMyTurn ? 'on-clock' : ''}>
        {isComplete ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:4 }}>🏁</div>
            <h3 style={{ fontSize:28, color:'var(--green)', margin:0 }}>Draft Complete!</h3>
            <p style={{ color:'var(--muted)', margin:'4px 0 0', fontSize:14 }}>All 20 drivers have been selected.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:16 }}>
            <div>
              <div style={{ fontFamily:"'Barlow Condensed'", fontSize:12, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:4 }}>On the Clock</div>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize:36, color: isMyTurn ? 'var(--red)' : 'var(--text)', letterSpacing:'0.04em' }}>
                {onClock?.player_name || '—'}{isMyTurn ? " — That's You!" : ''}
              </div>
            </div>
            <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
              {[
                { label: 'Pick', value: `${currentPick} / ${totalPicks}` },
                { label: 'Round', value: `${round} / ${session.total_rounds}` },
                { label: 'Available', value: available.length },
              ].map(stat => (
                <div key={stat.label} style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:"'Barlow Condensed'", fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:2 }}>{stat.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue'", fontSize:28, color:'var(--text)', letterSpacing:'0.04em' }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Animated stripe when it's your turn */}
      {isMyTurn && <div className="racing-bar" style={{ borderRadius:4, marginBottom:20 }} />}

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
              style={{
                display:'block',
                width:'100%',
                background:'var(--bg)',
                border:'1px solid var(--border2)',
                borderRadius:8,
                padding:'10px 14px',
                color:'var(--text)',
                fontSize:14,
                marginBottom:10,
                outline:'none',
              }}
            />
            <div style={{ overflowY:'auto', maxHeight:480, display:'flex', flexDirection:'column', gap:6 }}>
              {filtered.map(d => (
                <div key={d.driver_id} style={{
                  background:'var(--surface)',
                  border:'1px solid var(--border)',
                  borderRadius:10,
                  padding:'10px 14px',
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'space-between',
                  gap:10,
                  transition:'border-color 0.15s',
                }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:600, color:'var(--text)', fontSize:15, whiteSpace:'nowrap' }}>
                      {d.driver_name}
                      <span style={{ color:'var(--gold)', fontSize:13, marginLeft:8 }}>#{d.car_number}</span>
                    </div>
                    <div style={{ color:'var(--muted)', fontSize:12, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.team}</div>
                  </div>
                  {isMyTurn && myPlayer && (
                    <button onClick={() => makePick(d)} disabled={picking} style={{
                      flexShrink:0,
                      background:'var(--red)',
                      color:'#fff',
                      border:'none',
                      borderRadius:7,
                      padding:'8px 16px',
                      fontFamily:"'Barlow Condensed', sans-serif",
                      fontWeight:700,
                      fontSize:13,
                      letterSpacing:'0.06em',
                      textTransform:'uppercase',
                      cursor:'pointer',
                      opacity: picking ? 0.5 : 1,
                    }}>
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
          {picks.length === 0 ? (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'40px 20px', textAlign:'center', color:'var(--muted)', fontSize:14 }}>
              No picks yet — draft is ready to begin!
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${players.length}, 1fr)`, gap:10, overflowX:'auto' }}>
              {players.map((p, i) => (
                <div key={p.player_id}>
                  <div style={{
                    textAlign:'center',
                    fontFamily:"'Barlow Condensed', sans-serif",
                    fontWeight:700,
                    fontSize:13,
                    letterSpacing:'0.06em',
                    textTransform:'uppercase',
                    color: PLAYER_COLORS[i%5],
                    borderBottom: `2px solid ${PLAYER_COLORS[i%5]}`,
                    paddingBottom:6,
                    marginBottom:8,
                  }}>
                    {p.player_name}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    {(teamMap[p.player_id]||[]).sort((a,b)=>a.round_number-b.round_number).map(pk=>(
                      <div key={pk.draft_pick_id} style={{
                        background:'var(--surface)',
                        border:'1px solid var(--border)',
                        borderRadius:7,
                        padding:'7px 9px',
                      }}>
                        <div style={{ fontWeight:600, fontSize:12, color:'var(--text)', lineHeight:1.3 }}>{pk.drivers?.driver_name}</div>
                        <div style={{ color:'var(--dim)', fontSize:11, marginTop:2 }}>#{pk.drivers?.car_number} · R{pk.round_number}</div>
                      </div>
                    ))}
                    {Array.from({ length: (session.total_rounds||0) - (teamMap[p.player_id]?.length||0) }).map((_,j) => (
                      <div key={j} style={{
                        border:'1px dashed var(--border)',
                        borderRadius:7,
                        padding:'7px 9px',
                        textAlign:'center',
                        color:'var(--dim)',
                        fontSize:11,
                      }}>
                        Round {(teamMap[p.player_id]?.length||0)+j+1}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
