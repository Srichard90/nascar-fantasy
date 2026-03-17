import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PLAYER_COLORS = [
  'border-blue-500 text-blue-400',
  'border-green-500 text-green-400',
  'border-purple-500 text-purple-400',
  'border-orange-500 text-orange-400',
  'border-pink-500 text-pink-400',
]

function getPickOwner(pickNumber, totalPlayers, players) {
  const round      = Math.ceil(pickNumber / totalPlayers)
  const posInRound = ((pickNumber - 1) % totalPlayers) + 1
  const draftPos   = round % 2 === 1 ? posInRound : totalPlayers - posInRound + 1
  return players.find(p => p.draft_position === draftPos) || null
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

  const fetchAll = useCallback(async () => {
    const { data: s } = await supabase.from('seasons').select('*').eq('is_active', true).single()
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

    const { data: drv } = await supabase.from('drivers').select('*').eq('is_active', true).order('driver_name')
    const taken = new Set((pks || []).map(p => p.driver_id))
    setAvailable((drv || []).filter(d => !taken.has(d.driver_id)))
    setLoading(false)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('nascar_my_player_id')
    if (saved) setMyPlayer(parseInt(saved, 10))
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('draft_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_sessions' }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [fetchAll])

  async function makePick(driver) {
    if (!myPlayer || picking) return
    setError('')
    setPicking(true)
    const { data, error: e } = await supabase.rpc('make_draft_pick', {
      p_player_id: myPlayer,
      p_driver_id: driver.driver_id,
    })
    setPicking(false)
    if (e || !data?.success) setError(data?.error || e?.message || 'Pick failed.')
  }

  const totalPlayers     = session?.total_players || 0
  const currentPickNum   = session?.current_pick_num || 1
  const totalPicks       = session?.total_drivers || 20
  const isComplete       = session?.is_complete || false
  const currentTurn      = session && !isComplete && players.length ? getPickOwner(currentPickNum, totalPlayers, players) : null
  const isMyTurn         = currentTurn?.player_id === myPlayer

  const filtered = available.filter(d =>
    d.driver_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.car_number || '').includes(search) ||
    (d.team || '').toLowerCase().includes(search.toLowerCase())
  )

  const teamMap = {}
  players.forEach(p => { teamMap[p.player_id] = [] })
  picks.forEach(pk => { if (teamMap[pk.player_id]) teamMap[pk.player_id].push(pk) })

  if (loading) return <div className="flex items-center justify-center py-24"><div className="text-gray-400 animate-pulse">Loading draft room…</div></div>
  if (!season) return <div className="text-center py-24"><p className="text-gray-400">No active season. Go to Admin to set up your league.</p></div>
  if (!session) return (
    <div className="text-center py-24">
      <div className="text-5xl mb-3">🚗</div>
      <p className="text-gray-400 text-lg">Draft hasn&apos;t started yet.</p>
      <p className="text-gray-500 text-sm mt-1">The admin needs to add players and start the draft.</p>
    </div>
  )

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold text-yellow-400">Draft Room</h1>
        <p className="text-gray-400 text-sm mt-1">{season.season_name}</p>
      </div>

      {/* "I am" selector */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-5 flex flex-wrap gap-2 items-center">
        <span className="text-gray-400 text-sm font-medium">I am:</span>
        {players.map((p, i) => (
          <button key={p.player_id} onClick={() => {
            setMyPlayer(p.player_id)
            localStorage.setItem('nascar_my_player_id', p.player_id)
          }}
            className={`px-4 py-1.5 rounded-full border-2 text-sm font-semibold transition-all ${
              myPlayer === p.player_id
                ? `${PLAYER_COLORS[i % PLAYER_COLORS.length]} bg-gray-700`
                : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}>
            {p.player_name}
          </button>
        ))}
        {!myPlayer && <span className="text-yellow-500 text-sm">← Select your name</span>}
      </div>

      {/* Status bar */}
      <div className={`rounded-xl p-5 mb-5 border-2 ${
        isComplete ? 'bg-green-900/30 border-green-600' :
        isMyTurn   ? 'bg-yellow-900/40 border-yellow-500 animate-pulse' :
                     'bg-gray-800 border-gray-700'
      }`}>
        {isComplete ? (
          <div className="text-center">
            <p className="text-green-400 font-bold text-xl">🏁 Draft Complete!</p>
            <p className="text-gray-400 text-sm mt-1">All 20 drivers have been selected.</p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Now Picking</div>
              <div className={`text-2xl font-extrabold ${isMyTurn ? 'text-yellow-400' : 'text-white'}`}>
                {currentTurn?.player_name || '—'}{isMyTurn && ' (You!)'}
              </div>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <div className="text-xs text-gray-400 uppercase">Pick</div>
                <div className="text-xl font-bold">{currentPickNum}/{totalPicks}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase">Round</div>
                <div className="text-xl font-bold">{Math.ceil(currentPickNum / totalPlayers)}/{session.total_rounds}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase">Left</div>
                <div className="text-xl font-bold">{available.length}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-600 text-red-300 rounded-lg px-4 py-3 mb-4 text-sm">⚠️ {error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Available drivers */}
        {!isComplete && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">Available Drivers</h2>
              <span className="text-gray-500 text-sm">{available.length} left</span>
            </div>
            <input type="text" placeholder="Search name, #, or team…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 mb-2 focus:outline-none focus:border-red-500" />
            <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
              {filtered.map(d => (
                <div key={d.driver_id} className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 flex items-center justify-between hover:border-gray-500 transition-colors">
                  <div>
                    <span className="font-semibold text-white">{d.driver_name}</span>
                    <span className="text-yellow-500 text-sm ml-1.5">#{d.car_number}</span>
                    <div className="text-gray-500 text-xs">{d.team}</div>
                  </div>
                  {isMyTurn && myPlayer && (
                    <button onClick={() => makePick(d)} disabled={picking}
                      className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition ml-3 whitespace-nowrap">
                      {picking ? '…' : 'Draft'}
                    </button>
                  )}
                </div>
              ))}
              {filtered.length === 0 && <div className="text-center text-gray-500 py-8">No matches.</div>}
            </div>
          </div>
        )}

        {/* Draft board */}
        <div className={isComplete ? 'lg:col-span-2' : ''}>
          <h2 className="text-lg font-bold mb-3">Draft Board</h2>
          {picks.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center text-gray-500">No picks yet — draft is ready to begin!</div>
          ) : (
            <div className={`grid gap-3 ${players.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-5'}`}>
              {players.map((p, i) => (
                <div key={p.player_id}>
                  <div className={`text-center text-xs font-bold uppercase tracking-wider pb-1.5 mb-2 border-b-2 ${PLAYER_COLORS[i % PLAYER_COLORS.length].split(' ')[0]} text-white truncate`}>
                    {p.player_name}
                  </div>
                  <div className="space-y-1">
                    {(teamMap[p.player_id] || []).sort((a, b) => a.round_number - b.round_number).map(pk => (
                      <div key={pk.draft_pick_id} className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs">
                        <div className="font-semibold text-white leading-tight">{pk.drivers?.driver_name}</div>
                        <div className="text-gray-500">#{pk.drivers?.car_number} · R{pk.round_number}</div>
                      </div>
                    ))}
                    {Array.from({ length: session.total_rounds - (teamMap[p.player_id]?.length || 0) }).map((_, j) => (
                      <div key={j} className="border border-dashed border-gray-700 rounded px-2 py-1.5 text-xs text-gray-600 text-center">
                        Round {(teamMap[p.player_id]?.length || 0) + j + 1}
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
