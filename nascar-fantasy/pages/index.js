import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

export default function StandingsPage() {
  const [standings,   setStandings]   = useState([])
  const [season,      setSeason]      = useState(null)
  const [recentRace,  setRecentRace]  = useState(null)
  const [loading,     setLoading]     = useState(true)

  async function fetchData() {
    const { data: s } = await supabase
      .from('seasons').select('*').eq('is_active', true).single()
    setSeason(s)
    if (!s) { setLoading(false); return }

    const { data: st } = await supabase
      .from('player_standings')
      .select('*, players(player_name)')
      .eq('season_id', s.season_id)
      .order('total_points', { ascending: true })
    setStandings(st || [])

    const { data: r } = await supabase
      .from('races')
      .select('*')
      .eq('season_id', s.season_id)
      .eq('is_complete', true)
      .order('week_number', { ascending: false })
      .limit(1)
      .single()
    setRecentRace(r)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 30000)
    return () => clearInterval(t)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-gray-400 text-lg animate-pulse">Loading standings…</div>
    </div>
  )

  if (!season) return (
    <div className="text-center py-24">
      <div className="text-6xl mb-4">🏁</div>
      <h2 className="text-2xl font-bold text-gray-300 mb-2">No active season</h2>
      <p className="text-gray-500 mb-6">Set up your league in the Admin panel first.</p>
      <Link href="/admin" className="bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-2 rounded-lg transition">
        Go to Admin
      </Link>
    </div>
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-yellow-400 tracking-wide">{season.season_name}</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Season Standings &mdash; <span className="text-green-400">Lower points = better position</span>
          {recentRace && <span className="ml-2 text-gray-500">· Last race: {recentRace.race_name}</span>}
        </p>
      </div>

      {standings.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-10 text-center border border-gray-700">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-400 text-lg">Standings will appear here after the first race results are entered.</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden shadow-2xl border border-gray-700 mb-8">
          <table className="w-full">
            <thead>
              <tr className="bg-red-700">
                <th className="px-5 py-3 text-left text-sm font-semibold uppercase tracking-wider">Rank</th>
                <th className="px-5 py-3 text-left text-sm font-semibold uppercase tracking-wider">Player</th>
                <th className="px-5 py-3 text-center text-sm font-semibold uppercase tracking-wider">Total Pts</th>
                <th className="px-5 py-3 text-center text-sm font-semibold uppercase tracking-wider hidden sm:table-cell">Weeks</th>
                <th className="px-5 py-3 text-center text-sm font-semibold uppercase tracking-wider hidden sm:table-cell">Best Week</th>
                <th className="px-5 py-3 text-center text-sm font-semibold uppercase tracking-wider hidden sm:table-cell">Avg/Wk</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.standing_id}
                  className={`border-t border-gray-700 transition-colors ${i === 0 ? 'bg-yellow-900/30' : 'hover:bg-gray-700/40'}`}>
                  <td className="px-5 py-4 font-bold text-xl">
                    {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </td>
                  <td className="px-5 py-4 font-semibold text-white">{row.players?.player_name}</td>
                  <td className="px-5 py-4 text-center font-mono text-xl font-bold text-yellow-400">{row.total_points}</td>
                  <td className="px-5 py-4 text-center text-gray-300 hidden sm:table-cell">{row.weeks_scored}</td>
                  <td className="px-5 py-4 text-center text-green-400 font-semibold hidden sm:table-cell">{row.best_week ?? '—'}</td>
                  <td className="px-5 py-4 text-center text-gray-300 hidden sm:table-cell">
                    {row.weeks_scored > 0 ? (row.total_points / row.weeks_scored).toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: '/draft',   icon: '🚗', title: 'Draft Room',     desc: 'Live snake draft — pick your drivers'  },
          { href: '/results', icon: '📊', title: 'Weekly Results', desc: 'See driver scores by race week'         },
          { href: '/admin',   icon: '⚙️', title: 'Admin Panel',    desc: 'Enter races and finish positions'       },
        ].map(card => (
          <Link key={card.href} href={card.href}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-red-600 rounded-xl p-5 text-center transition-all group">
            <div className="text-3xl mb-2">{card.icon}</div>
            <div className="font-bold text-yellow-400 group-hover:text-yellow-300 mb-1">{card.title}</div>
            <div className="text-gray-500 text-sm">{card.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
