import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SchedulePage() {
  const [season, setSeason] = useState(null)
  const [races,  setRaces]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: s } = await supabase
        .from('seasons').select('*').eq('is_active', true).single()
      setSeason(s)
      if (!s) { setLoading(false); return }

      const { data: r } = await supabase
        .from('races')
        .select('*')
        .eq('season_id', s.season_id)
        .order('week_number', { ascending: true })
      setRaces(r || [])
      setLoading(false)
    }
    load()
  }, [])

  // Find the next upcoming race for highlight
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nextRace = races.find(r => !r.is_complete)

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' })
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
      <span style={{ color:'var(--muted)', fontFamily:"'Barlow Condensed'", fontSize:18, letterSpacing:'0.1em' }}>LOADING…</span>
    </div>
  )

  if (!season) return (
    <div style={{ textAlign:'center', padding:'80px 20px' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🗓️</div>
      <p style={{ color:'var(--muted)', fontSize:17 }}>No active season found.</p>
    </div>
  )

  const completed  = races.filter(r => r.is_complete)
  const upcoming   = races.filter(r => !r.is_complete)

  return (
    <div className="fade-up">

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:48, color:'var(--text)', margin:0 }}>Race Schedule</h1>
        <p style={{ color:'var(--muted)', fontSize:14, marginTop:4 }}>
          {season.season_name} &nbsp;·&nbsp;
          <span style={{ color:'var(--green)' }}>{completed.length} completed</span>
          &nbsp;·&nbsp;
          <span style={{ color:'var(--gold)' }}>{upcoming.length} remaining</span>
        </p>
      </div>

      {races.length === 0 ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'60px', textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🏁</div>
          <p style={{ color:'var(--muted)', fontSize:17 }}>No races added for this season yet.</p>
        </div>
      ) : (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--surface2)' }}>
                {['Wk','Race','Track','Date','Time','TV','Status'].map((h, i) => (
                  <th key={h} style={{
                    padding:'12px 16px',
                    borderBottom:'2px solid var(--border)',
                    fontFamily:"'Barlow Condensed', sans-serif",
                    fontSize:13, fontWeight:700, letterSpacing:'0.08em',
                    textTransform:'uppercase', color:'var(--muted)',
                    textAlign: i === 0 ? 'center' : 'left',
                    whiteSpace:'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {races.map((r, i) => {
                const isNext = nextRace?.race_id === r.race_id
                const rowBg  = isNext
                  ? 'rgba(245,197,24,0.06)'
                  : r.is_complete
                  ? 'transparent'
                  : 'transparent'

                return (
                  <tr key={r.race_id} style={{
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    background: rowBg,
                  }}>

                    {/* Week number */}
                    <td style={{ padding:'14px 16px', textAlign:'center' }}>
                      <span style={{
                        fontFamily:"'Bebas Neue', sans-serif",
                        fontSize:20,
                        color: r.is_complete ? 'var(--dim)' : isNext ? 'var(--gold)' : 'var(--muted)',
                        letterSpacing:'0.04em',
                      }}>
                        {r.week_number}
                      </span>
                    </td>

                    {/* Race name */}
                    <td style={{ padding:'14px 16px' }}>
                      <div style={{
                        fontWeight:600,
                        fontSize:15,
                        color: r.is_complete ? 'var(--muted)' : 'var(--text)',
                      }}>
                        {isNext && (
                          <span style={{
                            background:'rgba(245,197,24,0.18)',
                            color:'var(--gold)',
                            borderRadius:4,
                            padding:'1px 7px',
                            fontFamily:"'Barlow Condensed', sans-serif",
                            fontSize:10, fontWeight:700, letterSpacing:'0.08em',
                            textTransform:'uppercase',
                            marginRight:8,
                          }}>Next</span>
                        )}
                        {r.race_name}
                      </div>
                    </td>

                    {/* Track */}
                    <td style={{ padding:'14px 16px', color:'var(--muted)', fontSize:14 }}>
                      {r.track_name || '—'}
                    </td>

                    {/* Date */}
                    <td style={{ padding:'14px 16px', color: r.is_complete ? 'var(--dim)' : 'var(--text)', fontSize:14, whiteSpace:'nowrap' }}>
                      {formatDate(r.race_date)}
                    </td>

                    {/* Time */}
                    <td style={{ padding:'14px 16px', color:'var(--muted)', fontSize:14, whiteSpace:'nowrap' }}>
                      {r.race_time || '—'}
                    </td>

                    {/* TV Network */}
                    <td style={{ padding:'14px 16px' }}>
                      {r.tv_network ? (
                        <span style={{
                          background:'var(--surface2)',
                          border:'1px solid var(--border2)',
                          borderRadius:6,
                          padding:'3px 10px',
                          fontFamily:"'Barlow Condensed', sans-serif",
                          fontSize:13, fontWeight:700, letterSpacing:'0.06em',
                          color:'var(--text)',
                        }}>
                          {r.tv_network}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Status */}
                    <td style={{ padding:'14px 16px' }}>
                      <span style={{
                        background: r.is_complete
                          ? 'rgba(34,197,94,0.12)'
                          : isNext
                          ? 'rgba(245,197,24,0.12)'
                          : 'var(--surface2)',
                        color: r.is_complete
                          ? 'var(--green)'
                          : isNext
                          ? 'var(--gold)'
                          : 'var(--dim)',
                        borderRadius:6,
                        padding:'3px 10px',
                        fontFamily:"'Barlow Condensed', sans-serif",
                        fontSize:12, fontWeight:700, letterSpacing:'0.06em',
                        textTransform:'uppercase',
                        whiteSpace:'nowrap',
                      }}>
                        {r.is_complete ? '✓ Complete' : isNext ? '⬤ Up Next' : 'Upcoming'}
                      </span>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
