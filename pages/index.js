import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

const MEDALS = ['🥇', '🥈', '🥉']

const th = {
  padding: '12px 16px',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  textAlign: 'center',
  background: 'var(--surface2)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

export default function StandingsPage() {
  const [standings, setStandings] = useState([])
  const [season,    setSeason]    = useState(null)
  const [lastRace,  setLastRace]  = useState(null)
  const [loading,   setLoading]   = useState(true)

  async function fetchData() {
    const { data: s } = await supabase
      .from('seasons').select('*').eq('is_active', true).single()
    setSeason(s)
    if (!s) { setLoading(false); return }

    // Base standings from materialized table
    const { data: st } = await supabase
      .from('player_standings')
      .select('*, players(player_name)')
      .eq('season_id', s.season_id)

    // Step 1: find all drivers who won (P1) in any race this season
    const { data: p1Results } = await supabase
      .from('race_results')
      .select('driver_id, races!inner(season_id)')
      .eq('races.season_id', s.season_id)
      .eq('finish_position', 1)

    // Build a map of driver_id -> total wins (same driver can win multiple races)
    const driverWinCount = {}
    ;(p1Results || []).forEach(r => {
      driverWinCount[r.driver_id] = (driverWinCount[r.driver_id] || 0) + 1
    })

    // Step 2: find which players own those winning drivers
    const { data: allPicks } = await supabase
      .from('draft_picks')
      .select('player_id, driver_id, draft_sessions!inner(season_id)')
      .eq('draft_sessions.season_id', s.season_id)

    // Match: sum total wins per player across all their drivers
    const winsMap = {}
    ;(allPicks || []).forEach(pk => {
      if (driverWinCount[pk.driver_id]) {
        winsMap[pk.player_id] = (winsMap[pk.player_id] || 0) + driverWinCount[pk.driver_id]
      }
    })

    // Enrich: add wins + adjusted_points (base minus 10 per win), then sort
    const enriched = (st || [])
      .map(row => ({
        ...row,
        wins:            winsMap[row.player_id] || 0,
        adjusted_points: row.total_points - ((winsMap[row.player_id] || 0) * 10),
      }))
      .sort((a, b) => a.adjusted_points - b.adjusted_points)

    // Gap columns
    const leaderAdj = enriched.length ? enriched[0].adjusted_points : 0
    const final = enriched.map((row, i) => ({
      ...row,
      pts_behind_leader: i === 0 ? null : row.adjusted_points - leaderAdj,
      pts_behind_next:   i === 0 ? null : row.adjusted_points - enriched[i - 1].adjusted_points,
    }))

    setStandings(final)

    const { data: r } = await supabase
      .from('races')
      .select('*')
      .eq('season_id', s.season_id)
      .eq('is_complete', true)
      .order('week_number', { ascending: false })
      .limit(1)
      .single()
    setLastRace(r)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 30000)
    return () => clearInterval(t)
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <span style={{ color: 'var(--muted)', fontFamily: "'Barlow Condensed'", fontSize: 18, letterSpacing: '0.1em' }}>
        LOADING…
      </span>
    </div>
  )

  if (!season) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🏁</div>
      <h2 style={{ fontSize: 36, color: 'var(--text)', marginBottom: 8 }}>No Active Season</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 28 }}>Head to the Admin panel to create your league.</p>
      <Link href="/admin" style={{
        textDecoration: 'none',
        background: 'var(--red)',
        color: '#fff',
        padding: '12px 28px',
        borderRadius: 8,
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontSize: 15,
      }}>Go to Admin</Link>
    </div>
  )

  return (
    <div className="fade-up">
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 52, color: 'var(--text)', margin: 0 }}>{season.season_name}</h1>
          {lastRace && (
            <span style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border2)',
              borderRadius: 6,
              padding: '3px 12px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 13,
              color: 'var(--muted)',
              letterSpacing: '0.05em',
            }}>
              Last: {lastRace.race_name}
            </span>
          )}
        </div>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Season standings &nbsp;·&nbsp;
          <span style={{ color: 'var(--green)' }}>Lower adjusted points = better rank</span>
          &nbsp;·&nbsp;
          <span style={{ color: 'var(--gold)' }}>Win bonus: −10 pts per driver win</span>
          &nbsp;·&nbsp; Updates every 30 s
        </p>
      </div>

      {/* Standings table */}
      {standings.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '60px 40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p style={{ color: 'var(--muted)', fontSize: 17 }}>
            Standings appear here after the first race results are entered.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
          marginBottom: 40,
          overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', width: 50 }}>Rank</th>
                <th style={{ ...th, textAlign: 'left' }}>Player</th>
                <th style={th}>Base Pts</th>
                <th style={th}>Wins</th>
                <th style={{ ...th, color: 'var(--gold)' }}>Adj. Pts</th>
                <th style={{ ...th, color: '#f87171' }}>− Leader</th>
                <th style={{ ...th, color: '#fb923c' }}>− Next</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => {
                const isFirst = i === 0
                return (
                  <tr key={row.standing_id} style={{
                    borderTop: '1px solid var(--border)',
                    background: isFirst ? 'rgba(245,197,24,0.06)' : 'transparent',
                  }}>
                    {/* Rank */}
                    <td style={{ padding: '14px 16px', fontSize: 22 }}>
                      {MEDALS[i] || (
                        <span style={{
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontWeight: 700,
                          color: 'var(--dim)',
                          fontSize: 16,
                        }}>#{i + 1}</span>
                      )}
                    </td>

                    {/* Player */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 700,
                        fontSize: 20,
                        color: isFirst ? 'var(--gold)' : 'var(--text)',
                        letterSpacing: '0.02em',
                      }}>
                        {row.players?.player_name}
                      </span>
                    </td>

                    {/* Base points */}
                    <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--muted)', fontFamily: "'Barlow Condensed'", fontSize: 17 }}>
                      {row.total_points}
                    </td>

                    {/* Wins */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {row.wins > 0 ? (
                        <span style={{
                          background: 'rgba(245,197,24,0.15)',
                          color: 'var(--gold)',
                          borderRadius: 6,
                          padding: '2px 10px',
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontWeight: 700,
                          fontSize: 15,
                        }}>
                          🏆 {row.wins}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--dim)', fontSize: 14 }}>—</span>
                      )}
                    </td>

                    {/* Adjusted points — primary ranking column */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 28,
                        color: isFirst ? 'var(--gold)' : 'var(--text)',
                        letterSpacing: '0.05em',
                      }}>
                        {row.adjusted_points}
                      </span>
                      {row.wins > 0 && (
                        <span style={{ color: 'var(--green)', fontSize: 11, marginLeft: 4, fontFamily: "'Barlow Condensed'", fontWeight: 700 }}>
                          −{row.wins * 10}
                        </span>
                      )}
                    </td>

                    {/* Points behind leader */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {row.pts_behind_leader === null ? (
                        <span style={{ color: 'var(--gold)', fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 14, letterSpacing: '0.05em' }}>LEADER</span>
                      ) : (
                        <span style={{ color: '#f87171', fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 17 }}>
                          +{row.pts_behind_leader}
                        </span>
                      )}
                    </td>

                    {/* Points behind next place ahead */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {row.pts_behind_next === null ? (
                        <span style={{ color: 'var(--dim)', fontSize: 13 }}>—</span>
                      ) : (
                        <span style={{ color: '#fb923c', fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 17 }}>
                          +{row.pts_behind_next}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Legend */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 24px',
            fontSize: 12,
            color: 'var(--dim)',
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: '0.04em',
          }}>
            <span><span style={{ color: 'var(--gold)' }}>Adj. Pts</span> = Base Pts − (Wins × 10)</span>
            <span><span style={{ color: '#f87171' }}>− Leader</span> = Adjusted points behind 1st place</span>
            <span><span style={{ color: '#fb923c' }}>− Next</span> = Adjusted points behind the position directly ahead</span>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {[
          { href: '/draft',   icon: '🚗', title: 'Draft Room',     desc: 'Live snake draft'           },
          { href: '/results', icon: '📊', title: 'Weekly Results', desc: 'Driver scores by race week'  },
          { href: '/admin',   icon: '⚙️', title: 'Admin Panel',    desc: 'Manage races & results'     },
        ].map(card => (
          <Link key={card.href} href={card.href} style={{
            textDecoration: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '24px 20px',
            textAlign: 'center',
            display: 'block',
            transition: 'border-color 0.15s, transform 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>{card.icon}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: 'var(--text)', letterSpacing: '0.06em', marginBottom: 4 }}>{card.title}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{card.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
