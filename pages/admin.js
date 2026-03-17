import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/* ── Password gate ─────────────────────────────────────────── */
function PasswordGate({ onUnlock }) {
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
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
    if (res.ok) { sessionStorage.setItem('nascar_admin', '1'); onUnlock() }
    else setErr('Incorrect password.')
  }

  return (
    <div className="flex items-center justify-center py-24">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="text-xl font-bold text-white">Admin Access</h2>
          <p className="text-gray-400 text-sm mt-1">Enter the admin password</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input type="password" placeholder="Password" value={pwd} onChange={e => setPwd(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-red-500" />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button type="submit" disabled={busy || !pwd}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-semibold py-2.5 rounded-lg transition">
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ── Tab button ────────────────────────────────────────────── */
function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
        active ? 'bg-gray-800 border-red-500 text-white' : 'bg-gray-900 border-transparent text-gray-400 hover:text-white'
      }`}>
      {children}
    </button>
  )
}

/* ── Admin panel ───────────────────────────────────────────── */
function AdminPanel() {
  const [tab,     setTab]     = useState('setup')
  const [season,  setSeason]  = useState(null)
  const [players, setPlayers] = useState([])
  const [session, setSession] = useState(null)
  const [races,   setRaces]   = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg,     setMsg]     = useState('')

  async function load() {
    const { data: s } = await supabase.from('seasons').select('*').eq('is_active', true).single()
    setSeason(s)
    if (s) {
      const { data: pl }   = await supabase.from('players').select('*').eq('season_id', s.season_id).order('draft_position')
      const { data: sess } = await supabase.from('draft_sessions').select('*').eq('season_id', s.season_id).single()
      const { data: r }    = await supabase.from('races').select('*').eq('season_id', s.season_id).order('week_number')
      setPlayers(pl || []); setSession(sess); setRaces(r || [])
    }
    const { data: drv } = await supabase.from('drivers').select('*').eq('is_active', true).order('driver_name')
    setDrivers(drv || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function flash(t) { setMsg(t); setTimeout(() => setMsg(''), 4000) }

  if (loading) return <div className="text-center py-12 text-gray-400 animate-pulse">Loading…</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-yellow-400">Admin Panel</h1>
        {season && <p className="text-gray-400 text-sm mt-1">{season.season_name}</p>}
      </div>
      {msg && <div className="bg-green-900/40 border border-green-600 text-green-300 rounded-lg px-4 py-3 mb-4 text-sm">✅ {msg}</div>}

      <div className="flex gap-1 mb-0 border-b border-gray-700">
        <Tab active={tab==='setup'}   onClick={() => setTab('setup')}>⚙️ Setup</Tab>
        <Tab active={tab==='races'}   onClick={() => setTab('races')}>🏎️ Races</Tab>
        <Tab active={tab==='results'} onClick={() => setTab('results')}>📋 Results</Tab>
      </div>
      <div className="bg-gray-800 border border-gray-700 border-t-0 rounded-b-xl rounded-tr-xl p-6">
        {tab === 'setup'   && <SetupTab   season={season} players={players} session={session} reload={load} flash={flash} />}
        {tab === 'races'   && <RacesTab   season={season} races={races} reload={load} flash={flash} />}
        {tab === 'results' && <ResultsTab season={season} races={races} drivers={drivers} session={session} reload={load} flash={flash} />}
      </div>
    </div>
  )
}

/* ── SETUP TAB ─────────────────────────────────────────────── */
function SetupTab({ season, players, session, reload, flash }) {
  const [yearVal, setYearVal] = useState(new Date().getFullYear())
  const [nameVal, setNameVal] = useState('')
  const [pName,   setPName]   = useState('')
  const [pPos,    setPPos]    = useState('')
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState('')

  async function createSeason() {
    setBusy(true); setErr('')
    await supabase.from('seasons').update({ is_active: false }).eq('is_active', true)
    const { error } = await supabase.from('seasons').insert({ season_year: yearVal, season_name: nameVal, is_active: true })
    setBusy(false)
    if (error) { setErr(error.message); return }
    flash('Season created!'); reload()
  }

  async function addPlayer() {
    setBusy(true); setErr('')
    const { error } = await supabase.from('players').insert({
      season_id: season.season_id, player_name: pName, draft_position: parseInt(pPos, 10),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setPName(''); setPPos(''); flash(`Player "${pName}" added!`); reload()
  }

  async function removePlayer(id) {
    await supabase.from('players').delete().eq('player_id', id)
    flash('Player removed.'); reload()
  }

  async function startDraft() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('start_draft_session')
    setBusy(false)
    if (error || !data?.success) { setErr(data?.error || error?.message); return }
    flash(`Draft started! ${data.total_rounds} rounds, ${data.total_players} players.`); reload()
  }

  const canStart = players.length >= 2 && 20 % players.length === 0 && !session

  return (
    <div className="space-y-8 max-w-lg">
      {err && <p className="text-red-400 text-sm bg-red-900/30 border border-red-700 rounded px-3 py-2">{err}</p>}

      <section>
        <h3 className="text-lg font-bold text-white mb-3">1. Season</h3>
        {season ? (
          <div className="bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-sm">
            <span className="text-green-400 font-semibold">✓ Active: </span>
            <span className="text-white">{season.season_name} ({season.season_year})</span>
          </div>
        ) : (
          <div className="space-y-3">
            <input type="number" placeholder="Year (e.g. 2025)" value={yearVal} onChange={e => setYearVal(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
            <input type="text" placeholder="Season name (e.g. 2025 Cup Fantasy)" value={nameVal} onChange={e => setNameVal(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
            <button onClick={createSeason} disabled={busy || !nameVal}
              className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
              Create Season
            </button>
          </div>
        )}
      </section>

      {season && (
        <section>
          <h3 className="text-lg font-bold text-white mb-1">2. Players</h3>
          <p className="text-gray-500 text-xs mb-3">Use 4 players (5 rounds each) or 5 players (4 rounds each). Number slots starting at 1.</p>
          {players.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {players.map(p => (
                <div key={p.player_id} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                  <span className="font-semibold text-white">{p.player_name} <span className="text-gray-500 font-normal">— slot #{p.draft_position}</span></span>
                  {!session && <button onClick={() => removePlayer(p.player_id)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>}
                </div>
              ))}
            </div>
          )}
          {!session && (
            <div className="flex gap-2">
              <input type="text" placeholder="Player name" value={pName} onChange={e => setPName(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
              <input type="number" placeholder="Slot" value={pPos} onChange={e => setPPos(e.target.value)} min={1} max={10}
                className="w-16 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
              <button onClick={addPlayer} disabled={busy || !pName || !pPos}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">Add</button>
            </div>
          )}
        </section>
      )}

      {season && !session && (
        <section>
          <h3 className="text-lg font-bold text-white mb-2">3. Start Draft</h3>
          {canStart ? (
            <>
              <p className="text-green-400 text-sm mb-3">✓ Ready — {players.length} players, {20 / players.length} rounds each</p>
              <button onClick={startDraft} disabled={busy}
                className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-bold px-6 py-2.5 rounded-lg transition">
                🚦 Start Draft
              </button>
            </>
          ) : (
            <p className="text-yellow-500 text-sm">
              {players.length < 2 ? 'Add at least 2 players.' : `${players.length} players doesn't divide evenly into 20. Use 4 or 5 players.`}
            </p>
          )}
        </section>
      )}

      {session && (
        <section>
          <h3 className="text-lg font-bold text-white mb-2">3. Draft Status</h3>
          <div className="bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-sm">
            <span className={session.is_complete ? 'text-green-400' : 'text-yellow-400'}>
              {session.is_complete ? '✓ Draft complete' : '🔄 Draft in progress'}
            </span>
            <span className="text-gray-400 ml-2">
              · Pick {session.current_pick_num - 1}/{session.total_drivers} · {session.total_rounds} rounds
            </span>
          </div>
        </section>
      )}
    </div>
  )
}

/* ── RACES TAB ─────────────────────────────────────────────── */
function RacesTab({ season, races, reload, flash }) {
  const [wkNum, setWkNum] = useState('')
  const [rName, setRName] = useState('')
  const [tName, setTName] = useState('')
  const [rDate, setRDate] = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  const nextWeek = (races.length > 0 ? Math.max(...races.map(r => r.week_number)) : 0) + 1

  async function addRace() {
    setBusy(true); setErr('')
    const { error } = await supabase.from('races').insert({
      season_id: season.season_id, week_number: parseInt(wkNum || nextWeek, 10),
      race_name: rName, track_name: tName || null, race_date: rDate || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setWkNum(''); setRName(''); setTName(''); setRDate('')
    flash(`Race "${rName}" added!`); reload()
  }

  if (!season) return <p className="text-gray-400 text-sm">Create a season first.</p>

  return (
    <div className="max-w-lg space-y-6">
      {err && <p className="text-red-400 text-sm bg-red-900/30 border border-red-700 rounded px-3 py-2">{err}</p>}
      <section>
        <h3 className="text-lg font-bold text-white mb-3">Add New Race</h3>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-24">
              <label className="text-xs text-gray-400 block mb-1">Week #</label>
              <input type="number" value={wkNum || nextWeek} onChange={e => setWkNum(e.target.value)} min={1}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Race Name *</label>
              <input type="text" placeholder="e.g. Daytona 500" value={rName} onChange={e => setRName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
            </div>
          </div>
          <input type="text" placeholder="Track name (optional)" value={tName} onChange={e => setTName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
          <input type="date" value={rDate} onChange={e => setRDate(e.target.value)}
            className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
          <button onClick={addRace} disabled={busy || !rName}
            className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white text-sm font-semibold px-6 py-2 rounded-lg transition">
            Add Race
          </button>
        </div>
      </section>
      {races.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-white mb-3">Schedule ({races.length} races)</h3>
          <div className="space-y-1.5">
            {[...races].reverse().map(r => (
              <div key={r.race_id} className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 flex items-center justify-between text-sm">
                <div>
                  <span className="text-yellow-500 font-bold mr-2">W{r.week_number}</span>
                  <span className="text-white font-semibold">{r.race_name}</span>
                  {r.track_name && <span className="text-gray-500 ml-1.5 hidden sm:inline">· {r.track_name}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_complete ? 'bg-green-900 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                  {r.is_complete ? 'Complete' : 'Scheduled'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ── RESULTS TAB ───────────────────────────────────────────── */
function ResultsTab({ season, races, session, reload, flash }) {
  const [selectedRaceId, setSelectedRaceId] = useState('')
  const [draftedDrivers, setDraftedDrivers] = useState([])
  const [positions,      setPositions]      = useState({})
  const [dnfFlags,       setDnfFlags]       = useState({})
  const [saving,         setSaving]         = useState(false)
  const [err,            setErr]            = useState('')

  useEffect(() => {
    if (!selectedRaceId || !session) return
    async function loadPicks() {
      const { data: picks } = await supabase
        .from('draft_picks')
        .select('driver_id, drivers(driver_name, car_number, team)')
        .eq('draft_session_id', session.draft_session_id)
      setDraftedDrivers(picks || [])

      const { data: existing } = await supabase.from('race_results').select('*').eq('race_id', parseInt(selectedRaceId, 10))
      const pos = {}, dnf = {}
      ;(existing || []).forEach(r => { pos[r.driver_id] = r.finish_position; dnf[r.driver_id] = r.dnf })
      setPositions(pos); setDnfFlags(dnf)
    }
    loadPicks()
  }, [selectedRaceId, session])

  async function saveResults() {
    setSaving(true); setErr('')
    const toSave = draftedDrivers
      .filter(d => positions[d.driver_id])
      .map(d => ({
        race_id:         parseInt(selectedRaceId, 10),
        driver_id:       d.driver_id,
        finish_position: parseInt(positions[d.driver_id], 10),
        dnf:             dnfFlags[d.driver_id] || false,
      }))
    if (toSave.length === 0) { setErr('Enter at least one finish position.'); setSaving(false); return }

    const posVals = toSave.map(r => r.finish_position)
    if (new Set(posVals).size !== posVals.length) { setErr('Two drivers cannot share the same finish position.'); setSaving(false); return }

    const { error } = await supabase.from('race_results').upsert(toSave, { onConflict: 'race_id,driver_id' })
    await supabase.from('races').update({ is_complete: true }).eq('race_id', selectedRaceId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    flash(`Saved ${toSave.length} results! Standings updated automatically.`)
    reload()
  }

  if (!season)  return <p className="text-gray-400 text-sm">Create a season first.</p>
  if (!session) return <p className="text-gray-400 text-sm">Start the draft before entering results.</p>
  if (races.length === 0) return <p className="text-gray-400 text-sm">Add races first (use the Races tab).</p>

  return (
    <div className="max-w-2xl space-y-5">
      {err && <p className="text-red-400 text-sm bg-red-900/30 border border-red-700 rounded px-3 py-2">{err}</p>}
      <div>
        <label className="text-sm text-gray-400 block mb-2">Select race:</label>
        <select value={selectedRaceId} onChange={e => setSelectedRaceId(e.target.value)}
          className="bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-red-500 w-full sm:w-auto">
          <option value="">— choose a race —</option>
          {races.map(r => (
            <option key={r.race_id} value={r.race_id}>Week {r.week_number} — {r.race_name} {r.is_complete ? '✓' : ''}</option>
          ))}
        </select>
      </div>

      {selectedRaceId && draftedDrivers.length > 0 && (
        <>
          <p className="text-gray-500 text-xs">Enter each driver's official finish position. Leave blank if they didn't race. Standings update automatically on save.</p>
          <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
            <div className="grid grid-cols-12 text-xs font-semibold uppercase tracking-wider text-gray-400 bg-gray-800 px-4 py-2">
              <div className="col-span-5">Driver</div>
              <div className="col-span-3">Team</div>
              <div className="col-span-2 text-center">Finish</div>
              <div className="col-span-2 text-center">DNF</div>
            </div>
            {[...draftedDrivers].sort((a, b) => a.drivers.driver_name.localeCompare(b.drivers.driver_name)).map(d => (
              <div key={d.driver_id} className="grid grid-cols-12 items-center px-4 py-2.5 border-t border-gray-800 hover:bg-gray-800/40">
                <div className="col-span-5">
                  <span className="text-white text-sm font-medium">{d.drivers.driver_name}</span>
                  <span className="text-yellow-500 text-xs ml-1">#{d.drivers.car_number}</span>
                </div>
                <div className="col-span-3 text-gray-500 text-xs truncate pr-2">{d.drivers.team}</div>
                <div className="col-span-2 flex justify-center">
                  <input type="number" min={1} max={40} value={positions[d.driver_id] || ''} placeholder="—"
                    onChange={e => setPositions(prev => ({ ...prev, [d.driver_id]: e.target.value }))}
                    className="w-14 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-red-500" />
                </div>
                <div className="col-span-2 flex justify-center">
                  <input type="checkbox" checked={dnfFlags[d.driver_id] || false}
                    onChange={e => setDnfFlags(prev => ({ ...prev, [d.driver_id]: e.target.checked }))}
                    className="w-4 h-4 accent-red-600" />
                </div>
              </div>
            ))}
          </div>
          <button onClick={saveResults} disabled={saving}
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-bold px-8 py-2.5 rounded-lg transition">
            {saving ? 'Saving…' : '💾 Save All Results'}
          </button>
        </>
      )}
      {selectedRaceId && draftedDrivers.length === 0 && (
        <p className="text-yellow-500 text-sm">No draft picks found. Complete the draft first.</p>
      )}
    </div>
  )
}

/* ── Page export ───────────────────────────────────────────── */
export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  useEffect(() => { if (sessionStorage.getItem('nascar_admin') === '1') setAuthed(true) }, [])
  if (!authed) return <PasswordGate onUnlock={() => setAuthed(true)} />
  return <AdminPanel />
}
