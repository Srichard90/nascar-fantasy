import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  th: {
    padding: '12px 20px',
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    textAlign: 'left',
    background: 'var(--surface2)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function StandingsPage() {
  const [standings, setStandings] = useState([])
  const [season,    setSeason]    = useState(null)
  const [lastRace,  setLastRace]  = useState(null)
  const [loading,   setLoading]   = useState(true)

  async function fetchData() {
    const { data: s } = await supabase.from('seasons').select('*').eq('is_active', true).single()
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
          <span style={{ color: 'var(--green)' }}>Lower points = better rank</span>
          &nbsp;·&nbsp; Updates every 30 seconds
        </p>
      </div>

      {/* Standings table */}
      {standings.length === 0 ? (
        <div style={{ ...S.card, padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p style={{ color: 'var(--muted)', fontSize: 17 }}>
            Standings appear here after the first race results are entered.
          </p>
        </div>
      ) : (
        <div style={{ ...S.card, marginBottom: 40 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 60 }}>Rank</th>
                <th style={{ ...S.th }}>Player</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Total Pts</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Races</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Best Wk</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Avg / Wk</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => {
                const isFirst = i === 0
                return (
                  <tr key={row.standing_id} style={{
                    borderTop: '1px solid var(--border)',
                    background: isFirst ? 'rgba(245,197,24,0.06)' : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    <td style={{ padding: '16px 20px', fontSize: 22 }}>
                      {MEDALS[i] || <span style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 700,
                        color: 'var(--dim)',
                        fontSize: 16,
                      }}>#{i + 1}</span>}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
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
                    <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 28,
                        color: isFirst ? 'var(--gold)' : 'var(--text)',
                        letterSpacing: '0.05em',
                      }}>
                        {row.total_points}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
                      {row.weeks_scored}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: 15 }}>
                        {row.best_week ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
                      {row.weeks_scored > 0
                        ? (row.total_points / row.weeks_scored).toFixed(1)
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {[
          { href: '/draft',   icon: '🚗', title: 'Draft Room',     desc: 'Live snake draft'          },
          { href: '/results', icon: '📊', title: 'Weekly Results', desc: 'Driver scores by race week' },
          { href: '/admin',   icon: '⚙️', title: 'Admin Panel',    desc: 'Manage races & results'    },
        ].map(card => (
          <Link key={card.href} href={card.href} style={{
            textDecoration: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '24px 20px',
            textAlign: 'center',
            transition: 'border-color 0.15s, transform 0.15s',
            display: 'block',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>{card.icon}</div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22,
              color: 'var(--text)',
              letterSpacing: '0.06em',
              marginBottom: 4,
            }}>{card.title}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{card.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
