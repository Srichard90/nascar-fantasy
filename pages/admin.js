import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Shared input style (prevents off-screen shift) ─────────────
const inp = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg)',
  border: '1px solid var(--border2)',
  borderRadius: 8,
  padding: '10px 14px',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: "'Barlow', sans-serif",
  outline: 'none',
}

const btn = (variant='red') => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '10px 22px',
  borderRadius: 8,
  border: 'none',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  background: variant==='red' ? 'var(--red)' : variant==='green' ? 'var(--green)' : variant==='gold' ? 'var(--gold)' : 'var(--surface2)',
  color: variant==='green'||variant==='gold' ? '#000' : '#fff',
  border: variant==='ghost' ? '1px solid var(--border2)' : 'none',
  transition: 'opacity 0.15s',
})

const lbl = {
  display: 'block',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 6,
}

// ── Password gate ──────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [pwd,  setPwd]  = useState('')
  const [err,  setErr]  = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const res = await fetch('/api/verify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    })
    setBusy(false)
    if (res.ok) { sessionStorage.setItem('nascar_admin','1'); onUnlock() }
    else setErr('Incorrect password — check your Vercel env variable ADMIN_PASSWORD.')
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:42, marginBottom:10 }}>🔒</div>
          <h2 style={{ fontSize:32, color:'var(--text)', margin:0 }}>Admin Access</h2>
          <p style={{ color:'var(--muted)', fontSize:14, marginTop:6 }}>Enter your admin password</p>
        </div>
        <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={lbl}>Password</label>
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="••••••••"
              style={inp}
              autoFocus
            />
          </div>
          {err && <div style={{ background:'rgba(232,25,44,0.12)', border:'1px solid rgba(232,25,44,0.3)', color:'#ff6b7a', borderRadius:7, padding:'10px 14px', fontSize:13 }}>{err}</div>}
          <button type="submit" disabled={busy||!pwd} style={{ ...btn('red'), width:'100%', padding:'12px', opacity: busy||!pwd ? 0.4 : 1 }}>
            {busy ? 'Checking…' : 'Unlock Admin'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Tab button ─────────────────────────────────────────────────
function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 22px',
      background: active ? 'var(--surface)' : 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid var(--red)' : '2px solid transparent',
      color: active ? 'var(--text)' : 'var(--muted)',
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 700,
      fontSize: 14,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      cursor: 'pointer',
      transition: 'all 0.15s',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  )
}

// ── Flash banner ───────────────────────────────────────────────
function Flash({ msg, err }) {
  if (!msg && !err) return null
  return (
    <div style={{
      background: err ? 'rgba(232,25,44,0.12)' : 'rgba(34,197,94,0.1)',
      border: `1px solid ${err ? 'rgba(232,25,44,0.35)' : 'rgba(34,197,94,0.35)'}`,
      color: err ? '#ff6b7a' : '#4ade80',
      borderRadius: 8,
      padding: '12px 16px',
      fontSize: 14,
      marginBottom: 20,
    }}>
      {err ? '⚠️ ' : '✅ '}{msg || err}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────
function AdminPanel() {
  const [tab,     setTab]     = useState('setup')
  const [season,  setSeason]  = useState(null)
  const [players, setPlayers] = useState([])
  const [session, setSession] = useState(null)
  const [races,   setRaces]   = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [ok,      setOk]      = useState('')
  const [fail,    setFail]    = useState('')

  async function loadAll() {
    const { data: s } = await supabase.from('seasons').select('*').eq('is_active',true).single()
    setSeason(s)
    if (s) {
      const { data: pl }   = await supabase.from('players').select('*').eq('season_id',s.season_id).order('draft_position')
      const { data: sess } = await supabase.from('draft_sessions').select('*').eq('season_id',s.season_id).single()
      const { data: r }    = await supabase.from('races').select('*').eq('season_id',s.season_id).order('week_number')
      setPlayers(pl||[]); setSession(sess); setRaces(r||[])
    }
    const { data: drv } = await supabase.from('drivers').select('*').eq('is_active',true).order('driver_name')
    setDrivers(drv||[])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function flash(msg) { setOk(msg); setFail(''); setTimeout(()=>setOk(''), 5000) }
  function boom(msg)  { setFail(msg); setOk(''); setTimeout(()=>setFail(''), 8000) }

  if (loading) return (
    <div style={{ textAlign:'center', padding:'48px', color:'var(--muted)', fontFamily:"'Barlow Condensed'", letterSpacing:'0.1em' }}>LOADING…</div>
  )

  return (
    <div className="fade-up">
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:48, color:'var(--text)', margin:0 }}>Admin Panel</h1>
        {season && <p style={{ color:'var(--muted)', fontSize:14, marginTop:4 }}>{season.season_name}</p>}
      </div>

      <Flash msg={ok} err={fail} />

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:0, overflowX:'auto' }}>
        <Tab label="⚙️ Setup"    active={tab==='setup'}   onClick={()=>setTab('setup')} />
        <Tab label="🏎️ Races"   active={tab==='races'}   onClick={()=>setTab('races')} />
        <Tab label="📋 Results" active={tab==='results'} onClick={()=>setTab('results')} />
      </div>

      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: 'none',
        borderRadius: '0 0 14px 14px',
        padding: '28px 28px',
      }}>
        {tab==='setup'   && <SetupTab   season={season} players={players} session={session} reload={loadAll} flash={flash} boom={boom} />}
        {tab==='races'   && <RacesTab   season={season} races={races}     reload={loadAll} flash={flash} boom={boom} />}
        {tab==='results' && <ResultsTab season={season} races={races} drivers={drivers} session={session} reload={loadAll} flash={flash} boom={boom} />}
      </div>
    </div>
  )
}

// ── SETUP TAB ──────────────────────────────────────────────────
function SetupTab({ season, players, session, reload, flash, boom }) {
  const [year,  setYear]  = useState(new Date().getFullYear())
  const [name,  setName]  = useState('')
  const [pName, setPName] = useState('')
  const [pPos,  setPPos]  = useState('')
  const [busy,  setBusy]  = useState(false)

  async function createSeason() {
    setBusy(true)
    await supabase.from('seasons').update({is_active:false}).eq('is_active',true)
    const { error } = await supabase.from('seasons').insert({ season_year:year, season_name:name, is_active:true })
    setBusy(false)
    if (error) { boom(error.message); return }
    flash('Season created!')
    reload()
  }

  async function addPlayer() {
    setBusy(true)
    const { error } = await supabase.from('players').insert({ season_id:season.season_id, player_name:pName, draft_position:parseInt(pPos,10) })
    setBusy(false)
    if (error) { boom(error.message); return }
    setPName(''); setPPos('')
    flash(`Player "${pName}" added!`)
    reload()
  }

  async function removePlayer(id) {
    await supabase.from('players').delete().eq('player_id',id)
    flash('Player removed.')
    reload()
  }

  async function startDraft() {
    setBusy(true)
    const { data, error } = await supabase.rpc('start_draft_session')
    setBusy(false)
    if (error || !data?.success) { boom(data?.error || error?.message); return }
    flash(`Draft started! ${data.total_rounds} rounds for ${data.total_players} players.`)
    reload()
  }

  const canStart = players.length >= 2 && 20 % players.length === 0 && !session

  return (
    <div style={{ maxWidth: 520, display:'flex', flexDirection:'column', gap:32 }}>

      {/* 1. Season */}
      <section>
        <h3 style={{ fontSize:24, color:'var(--text)', margin:'0 0 14px' }}>1 — Season</h3>
        {season ? (
          <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', fontSize:14 }}>
            <span style={{ color:'var(--green)', fontWeight:600 }}>✓ Active: </span>
            <span style={{ color:'var(--text)' }}>{season.season_name} ({season.season_year})</span>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={lbl}>Year</label>
              <input type="number" value={year} onChange={e=>setYear(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Season Name</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. 2025 Cup Series Fantasy" style={inp} />
            </div>
            <button onClick={createSeason} disabled={busy||!name} style={{ ...btn('red'), opacity: busy||!name ? 0.4 : 1 }}>
              Create Season
            </button>
          </div>
        )}
      </section>

      {/* 2. Players */}
      {season && (
        <section>
          <h3 style={{ fontSize:24, color:'var(--text)', margin:'0 0 4px' }}>2 — Players</h3>
          <p style={{ color:'var(--muted)', fontSize:13, margin:'0 0 14px' }}>
            Use 4 players (5 rounds) or 5 players (4 rounds). Slot numbers must be 1, 2, 3…
          </p>

          {players.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {players.map(p => (
                <div key={p.player_id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8,
                  padding:'10px 14px', fontSize:14,
                }}>
                  <div>
                    <span style={{ fontWeight:600, color:'var(--text)' }}>{p.player_name}</span>
                    <span style={{ color:'var(--muted)', marginLeft:10 }}>Slot #{p.draft_position}</span>
                  </div>
                  {!session && (
                    <button onClick={()=>removePlayer(p.player_id)} style={{ background:'transparent', border:'none', color:'var(--red)', fontSize:13, cursor:'pointer', fontFamily:"'Barlow Condensed'", fontWeight:700, letterSpacing:'0.05em' }}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!session && (
            <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Player Name</label>
                <input type="text" value={pName} onChange={e=>setPName(e.target.value)} placeholder="e.g. Alice" style={inp} />
              </div>
              <div style={{ width:80 }}>
                <label style={lbl}>Slot #</label>
                <input type="number" value={pPos} onChange={e=>setPPos(e.target.value)} min={1} max={10} placeholder="1" style={inp} />
              </div>
              <button onClick={addPlayer} disabled={busy||!pName||!pPos} style={{ ...btn('ghost'), opacity: busy||!pName||!pPos ? 0.4 : 1, flexShrink:0 }}>
                Add
              </button>
            </div>
          )}
        </section>
      )}

      {/* 3. Start draft */}
      {season && !session && (
        <section>
          <h3 style={{ fontSize:24, color:'var(--text)', margin:'0 0 10px' }}>3 — Start Draft</h3>
          {canStart ? (
            <div>
              <p style={{ color:'var(--green)', fontSize:14, marginBottom:12 }}>
                ✓ Ready! {players.length} players · {20/players.length} rounds each
              </p>
              <button onClick={startDraft} disabled={busy} style={{ ...btn('green'), opacity: busy ? 0.4 : 1, fontSize:16, padding:'12px 28px' }}>
                🚦 Start Draft
              </button>
            </div>
          ) : (
            <p style={{ color:'var(--gold)', fontSize:14 }}>
              {players.length < 2
                ? 'Add at least 2 players first.'
                : `${players.length} players doesn't divide into 20 drivers. Use 4 or 5 players.`}
            </p>
          )}
        </section>
      )}

      {session && (
        <section>
          <h3 style={{ fontSize:24, color:'var(--text)', margin:'0 0 10px' }}>3 — Draft Status</h3>
          <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', fontSize:14 }}>
            <span style={{ color: session.is_complete ? 'var(--green)' : 'var(--gold)', fontWeight:600 }}>
              {session.is_complete ? '✓ Complete' : '🔄 In Progress'}
            </span>
            <span style={{ color:'var(--muted)', marginLeft:10 }}>
              {session.current_pick_num - 1}/{session.total_drivers} picks · {session.total_rounds} rounds
            </span>
          </div>
        </section>
      )}
    </div>
  )
}

// ── RACES TAB ──────────────────────────────────────────────────
function RacesTab({ season, races, reload, flash, boom }) {
  const [wk,   setWk]   = useState('')
  const [name, setName] = useState('')
  const [trk,  setTrk]  = useState('')
  const [dt,   setDt]   = useState('')
  const [busy, setBusy] = useState(false)

  const nextWk = races.length > 0 ? Math.max(...races.map(r=>r.week_number)) + 1 : 1

  async function addRace() {
    setBusy(true)
    const { error } = await supabase.from('races').insert({
      season_id:   season.season_id,
      week_number: parseInt(wk||nextWk, 10),
      race_name:   name,
      track_name:  trk||null,
      race_date:   dt||null,
    })
    setBusy(false)
    if (error) { boom(error.message); return }
    setName(''); setTrk(''); setDt(''); setWk('')
    flash(`Race "${name}" added!`)
    reload()
  }

  if (!season) return <p style={{ color:'var(--muted)', fontSize:14 }}>Create a season first (Setup tab).</p>

  return (
    <div style={{ maxWidth:560, display:'flex', flexDirection:'column', gap:28 }}>

      <section>
        <h3 style={{ fontSize:24, color:'var(--text)', margin:'0 0 16px' }}>Add Race</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Week #</label>
              <input type="number" value={wk||nextWk} onChange={e=>setWk(e.target.value)} min={1} style={inp} />
            </div>
            <div>
              <label style={lbl}>Race Name *</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Daytona 500" style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Track Name</label>
            <input type="text" value={trk} onChange={e=>setTrk(e.target.value)} placeholder="e.g. Daytona International Speedway" style={inp} />
          </div>
          <div>
            <label style={lbl}>Race Date</label>
            <input type="date" value={dt} onChange={e=>setDt(e.target.value)} style={{ ...inp, width:'auto', maxWidth:220 }} />
          </div>
          <div>
            <button onClick={addRace} disabled={busy||!name} style={{ ...btn('red'), opacity: busy||!name ? 0.4 : 1 }}>
              Add Race
            </button>
          </div>
        </div>
      </section>

      {races.length > 0 && (
        <section>
          <h3 style={{ fontSize:24, color:'var(--text)', margin:'0 0 14px' }}>Schedule</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[...races].reverse().map(r => (
              <div key={r.race_id} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                background:'var(--bg)', border:'1px solid var(--border)', borderRadius:9,
                padding:'11px 16px', fontSize:14, gap:10,
              }}>
                <div style={{ minWidth:0 }}>
                  <span style={{ color:'var(--gold)', fontFamily:"'Barlow Condensed'", fontWeight:700, marginRight:10 }}>W{r.week_number}</span>
                  <span style={{ color:'var(--text)', fontWeight:500 }}>{r.race_name}</span>
                  {r.track_name && <span style={{ color:'var(--muted)', fontSize:13, marginLeft:8 }}>· {r.track_name}</span>}
                </div>
                <span style={{
                  flexShrink:0,
                  background: r.is_complete ? 'rgba(34,197,94,0.15)' : 'var(--surface2)',
                  color: r.is_complete ? 'var(--green)' : 'var(--muted)',
                  borderRadius:6,
                  padding:'2px 10px',
                  fontFamily:"'Barlow Condensed', sans-serif",
                  fontSize:12,
                  fontWeight:700,
                  letterSpacing:'0.05em',
                  textTransform:'uppercase',
                }}>
                  {r.is_complete ? 'Complete' : 'Upcoming'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── RESULTS TAB ────────────────────────────────────────────────
function ResultsTab({ season, races, drivers, session, reload, flash, boom }) {
  const [raceId,  setRaceId]  = useState('')
  const [pos,     setPos]     = useState({})
  const [dnf,     setDnf]     = useState({})
  const [saving,  setSaving]  = useState(false)

  // Load existing results whenever a race is selected
  useEffect(() => {
    if (!raceId) return
    async function load() {
      const { data: existing } = await supabase
        .from('race_results').select('*').eq('race_id', parseInt(raceId, 10))
      const pm = {}, dm = {}
      ;(existing || []).forEach(r => { pm[r.driver_id] = r.finish_position; dm[r.driver_id] = r.dnf })
      setPos(pm); setDnf(dm)
    }
    load()
  }, [raceId])

  // All active drivers sorted by car number numerically
  const sortedDrivers = [...(drivers || [])].sort((a, b) => {
    const na = parseInt(a.car_number, 10)
    const nb = parseInt(b.car_number, 10)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return (a.car_number || '').localeCompare(b.car_number || '')
  })

  async function save() {
    setSaving(true)
    const rows = sortedDrivers
      .filter(d => pos[d.driver_id])
      .map(d => ({
        race_id:         parseInt(raceId, 10),
        driver_id:       d.driver_id,
        finish_position: parseInt(pos[d.driver_id], 10),
        dnf:             dnf[d.driver_id] || false,
      }))

    if (!rows.length) { boom('Enter at least one finish position.'); setSaving(false); return }

    const vals = rows.map(r => r.finish_position)
    if (new Set(vals).size !== vals.length) { boom("Two drivers can't share the same finish position."); setSaving(false); return }

    const { error } = await supabase.from('race_results').upsert(rows, { onConflict: 'race_id,driver_id' })
    await supabase.from('races').update({ is_complete: true }).eq('race_id', raceId)

    setSaving(false)
    if (error) { boom(error.message); return }
    flash(`Saved ${rows.length} results! Standings updated automatically.`)
    reload()
  }

  if (!season)       return <p style={{ color: 'var(--muted)', fontSize: 14 }}>Create a season first.</p>
  if (!races.length) return <p style={{ color: 'var(--muted)', fontSize: 14 }}>Add races first (Races tab).</p>

  return (
    <div style={{ maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label style={lbl}>Race</label>
        <select
          value={raceId}
          onChange={e => setRaceId(e.target.value)}
          style={{ ...inp, maxWidth: 420, width: '100%' }}
        >
          <option value="">— select a race —</option>
          {races.map(r => (
            <option key={r.race_id} value={r.race_id}>
              Week {r.week_number} — {r.race_name} {r.is_complete ? '✓' : ''}
            </option>
          ))}
        </select>
      </div>

      {raceId && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            All {sortedDrivers.length} drivers listed by car number. Enter finish positions for drivers who raced.
            Leave blank to skip. Standings update automatically on save.
          </p>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px 60px', gap: '0 12px', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            {['#', 'Driver', 'Finish', 'DNF'].map(h => (
              <span key={h} style={{ fontFamily: "'Barlow Condensed'", fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{h}</span>
            ))}
          </div>

          {/* Driver rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {sortedDrivers.map(d => (
              <div key={d.driver_id} style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 90px 60px',
                gap: '0 12px',
                alignItems: 'center',
                background: pos[d.driver_id] ? 'rgba(245,197,24,0.05)' : 'var(--bg)',
                border: `1px solid ${pos[d.driver_id] ? 'var(--border2)' : 'var(--border)'}`,
                borderRadius: 9,
                padding: '8px 14px',
              }}>
                <span style={{ color: 'var(--gold)', fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 15 }}>
                  #{d.car_number}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>
                  {d.driver_name}
                </span>
                <input
                  type="number"
                  min={1} max={43}
                  value={pos[d.driver_id] || ''}
                  onChange={e => setPos(prev => ({ ...prev, [d.driver_id]: e.target.value }))}
                  placeholder="—"
                  style={{ ...inp, textAlign: 'center', padding: '7px 8px', fontSize: 15, fontWeight: 700 }}
                />
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={dnf[d.driver_id] || false}
                    onChange={e => setDnf(prev => ({ ...prev, [d.driver_id]: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: 'var(--red)', cursor: 'pointer' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <button onClick={save} disabled={saving} style={{ ...btn('green'), opacity: saving ? 0.4 : 1, fontSize: 15, padding: '12px 28px' }}>
              {saving ? 'Saving…' : '💾 Save All Results'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Page export ────────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('nascar_admin')==='1') setAuthed(true)
  }, [])

  if (!authed) return <PasswordGate onUnlock={() => setAuthed(true)} />
  return <AdminPanel />
}
