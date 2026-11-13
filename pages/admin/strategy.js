import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { slotForPick, recommend } from '../../lib/draftSim'

// ============================================================
//  Draft Strategy Board (admin only, second password)
//  All numbers come from /api/strategy/data, which checks the admin
//  session AND the board password on the server.
// ============================================================

const TT = { SS: 'Superspeedway', RC: 'Road / Street', SHORT: 'Short & Flat', INT: 'Intermediate' }

const card = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
}
const lbl = {
  fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--muted)',
}
const inp = {
  background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 8, padding: '9px 12px',
  color: 'var(--text)', fontSize: 14, outline: 'none',
}
const btn = (variant = 'red') => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 18px',
  borderRadius: 8, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13,
  letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer',
  background: variant === 'red' ? 'var(--red)' : variant === 'gold' ? 'var(--gold)' : 'var(--surface2)',
  color: variant === 'gold' ? '#000' : '#fff',
  border: variant === 'ghost' ? '1px solid var(--border2)' : 'none',
})
const th = {
  ...lbl, fontSize: 11, padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)',
}
const td = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 14, whiteSpace: 'nowrap' }

const fmt = (x, d = 1) => (x == null ? '—' : Number(x).toFixed(d))
const signed = (x, d = 1) => (x == null ? '—' : (x > 0 ? '+' : '') + Number(x).toFixed(d))

// Finish-position heat: green (good, low) → red (bad, high).
function heat(v, lo = 8, hi = 28) {
  if (v == null) return 'transparent'
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
  const hue = 130 - 130 * t
  return `hsla(${hue}, 70%, 45%, 0.22)`
}

function Badge({ children, color = 'var(--muted)', title }) {
  return (
    <span title={title} style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      fontFamily: "'Barlow Condensed', sans-serif", color, border: `1px solid ${color}`, borderRadius: 5,
      padding: '0 5px', marginLeft: 6, lineHeight: '16px', opacity: 0.9,
    }}>{children}</span>
  )
}

// Tiny line of season averages (lower = better, drawn higher).
function Spark({ seasons, years }) {
  const ys = years.slice().reverse()
  const pts = ys.map(y => seasons[y]?.avg ?? null)
  const vals = pts.filter(v => v != null)
  if (vals.length < 2) return <span style={{ color: 'var(--dim)', fontSize: 12 }}>{vals.length ? fmt(vals[0]) : '—'}</span>
  const W = 64, H = 22, lo = 8, hi = 30
  const x = i => 4 + (i * (W - 8)) / (ys.length - 1)
  const y = v => 3 + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - 6)
  const segs = pts.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean)
  const first = vals[0], last = vals[vals.length - 1]
  const color = last < first - 1 ? 'var(--green)' : last > first + 1 ? 'var(--red)' : 'var(--muted)'
  return (
    <svg width={W} height={H} style={{ verticalAlign: 'middle' }} aria-label={pts.map(v => fmt(v)).join(' → ')}>
      <polyline points={segs.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" />
      {segs.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.2" fill={color} />)}
    </svg>
  )
}

function DraftAssistant({ drivers, takenKeys, currentPick, totalPicks, n, mySlot, onPick }) {
  const result = useMemo(
    () => recommend({ drivers, takenKeys, currentPick, totalPicks, n, mySlot }),
    [drivers, takenKeys, currentPick, totalPicks, n, mySlot],
  )

  if (!mySlot) return <div style={{ ...card, color: 'var(--muted)' }}>Choose your draft slot above to get pick recommendations.</div>
  if (currentPick > totalPicks) return <div style={{ ...card, color: 'var(--muted)' }}>The draft is complete.</div>
  if (!result) return <div style={{ ...card, color: 'var(--muted)' }}>You have no picks left in this draft.</div>
  const { myNext, goneBeforeMe, candidates, best, second, goneBetween } = result
  const onClock = myNext === currentPick

  return (
    <div style={{ ...card, borderColor: onClock ? 'var(--gold)' : 'var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={lbl}>
          {onClock ? <span style={{ color: 'var(--gold)' }}>● You're on the clock — pick #{myNext}</span>
                   : <>Your next pick: #{myNext} ({myNext - currentPick} pick{myNext - currentPick === 1 ? '' : 's'} away)</>}
        </div>
        <div style={{ ...lbl, color: 'var(--dim)' }}>{result.remaining} pick{result.remaining === 1 ? '' : 's'} left for you</div>
      </div>

      {best && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 34, lineHeight: 1 }}>
            #{best.d.carNumber} {best.d.name}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            proj. {fmt(best.d.projPts, 2)} pts/race · tier {best.d.tier}
          </div>
          {onClock && onPick && <button style={btn('gold')} onClick={() => onPick(best.d.key)}>Draft him</button>}
        </div>
      )}

      <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>
        {goneBeforeMe.length > 0 && !onClock && (
          <div>Likely gone before your turn: {goneBeforeMe.map(d => d.name).join(', ')}.</div>
        )}
        {second && (
          <div>
            If you take him, your projected next pick (#{second.pick}) is <b style={{ color: 'var(--text)' }}>{second.driver.name}</b>
            {goneBetween.length > 0 && <> — expect {goneBetween.map(d => d.name).join(', ')} to go in between</>}.
          </div>
        )}
      </div>

      {candidates.length > 1 && (
        <div style={{ marginTop: 14, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th}>Option</th><th style={th}>Pts/race</th><th style={th}>Your remaining picks (sim.)</th>
              <th style={th} title="Projected total points per race of all your remaining picks, vs the best option. Lower is better.">Δ vs best</th>
              {onClock && onPick && <th style={th}></th>}
            </tr></thead>
            <tbody>
              {candidates.map((c, i) => (
                <tr key={c.d.key}>
                  <td style={{ ...td, fontWeight: i === 0 ? 700 : 400 }}>#{c.d.carNumber} {c.d.name}</td>
                  <td style={td}>{fmt(c.d.projPts, 2)}</td>
                  <td style={{ ...td, color: 'var(--muted)', fontSize: 13 }}>{c.r.mine.map(m => m.driver.name.split(' ').slice(-1)[0]).join(' → ')}</td>
                  <td style={{ ...td, color: i === 0 ? 'var(--green)' : 'var(--muted)' }}>{i === 0 ? 'best' : signed(c.r.total - best.r.total, 2)}</td>
                  {onClock && onPick && <td style={td}><button style={{ ...btn('ghost'), padding: '4px 10px' }} onClick={() => onPick(c.d.key)}>Pick</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>
            Simulation: opponents take the driver this league would most likely draft next (past draft slots + last season's average); you take the best projection. Totals are projected points per race summed across your remaining picks.
          </div>
        </div>
      )}
    </div>
  )
}

function DriverDetail({ d, years, draftYears }) {
  return (
    <div style={{ padding: '14px 10px 18px', display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <div>
        <div style={{ ...lbl, marginBottom: 6 }}>By season</div>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>{['Year', 'Avg', 'Wins', 'Top 5', 'Top 10', '30+', 'H1', 'H2'].map(h => <th key={h} style={{ ...th, position: 'static' }}>{h}</th>)}</tr></thead>
          <tbody>
            {years.map(y => {
              const s = d.seasons[y]
              return (
                <tr key={y}>
                  <td style={td}>{y}</td>
                  {s ? <>
                    <td style={{ ...td, background: heat(s.avg) }}>{fmt(s.avg)}</td>
                    <td style={td}>{s.wins}</td><td style={td}>{s.top5}</td><td style={td}>{s.top10}</td><td style={td}>{s.bad}</td>
                    <td style={{ ...td, background: heat(s.h1) }}>{fmt(s.h1)}</td><td style={{ ...td, background: heat(s.h2) }}>{fmt(s.h2)}</td>
                  </> : <td style={{ ...td, color: 'var(--dim)' }} colSpan={7}>did not race</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div>
        <div style={{ ...lbl, marginBottom: 6 }}>By track type ({years.length}-season avg)</div>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {Object.entries(TT).map(([k, name]) => {
              const b = d.byType[k]
              const diff = b && d.careerAvg != null ? b.avg - d.careerAvg : null
              return (
                <tr key={k}>
                  <td style={td}>{name}</td>
                  <td style={{ ...td, background: heat(b?.avg) }}>{fmt(b?.avg)}</td>
                  <td style={{ ...td, color: diff == null ? 'var(--dim)' : diff < -1.5 ? 'var(--green)' : diff > 1.5 ? 'var(--red)' : 'var(--muted)', fontSize: 13 }}>
                    {diff == null ? '' : `${signed(diff)} vs his avg`}
                  </td>
                  <td style={{ ...td, color: 'var(--dim)', fontSize: 12 }}>{b ? `${b.n} races` : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.8 }}>
        <div style={{ ...lbl, marginBottom: 6 }}>Context</div>
        <div>Team: <b style={{ color: 'var(--text)' }}>{d.team || '—'}</b>{d.teamChanged && <> (was {d.prevTeam})</>}</div>
        <div>League draft slot: {draftYears.map(y => `${y}: ${d.adpByYear[y] ? '#' + d.adpByYear[y] : 'undrafted'}`).join(' · ') || '—'}</div>
        <div>Projection: {fmt(d.projAvg, 1)} avg finish, {fmt(d.projWins, 1)} wins → {fmt(d.projPts, 2)} pts/race</div>
        <div>Value over replacement: {d.vorp == null ? '—' : `${d.vorp} pts/season`}</div>
        {d.isRookie && <div style={{ color: 'var(--gold)' }}>No Cup history in this league's data — projected at the rookie baseline.</div>}
      </div>
    </div>
  )
}

// ── Draft board tab ─────────────────────────────────────────────
function DraftBoard({ m, mySlot, setMySlot, mock, setMock, liveDraft }) {
  const [sort, setSort] = useState('proj')
  const [open, setOpen] = useState(null)
  const [hideTaken, setHideTaken] = useState(false)

  const isLive = !!liveDraft?.sessionId
  const n = isLive ? liveDraft.totalPlayers : (liveDraft?.players.length || m.leaguePlayers.length || 4)
  const totalPicks = isLive ? (liveDraft.totalPlayers * liveDraft.totalRounds) : m.draftSlots
  const slotNames = useMemo(
    () => Object.fromEntries((liveDraft?.players || []).map(p => [p.slot, p.name])),
    [liveDraft],
  )

  // Taken drivers: live picks from the database, or local mock picks.
  const taken = useMemo(() => {
    const map = new Map()
    if (isLive) {
      const names = Object.fromEntries(liveDraft.players.map(p => [p.playerId, p]))
      for (const p of liveDraft.picks) map.set(p.key, { pick: p.pick, slot: names[p.playerId]?.slot, by: names[p.playerId]?.name })
    } else {
      mock.forEach((key, i) => {
        const slot = slotForPick(i + 1, n)
        map.set(key, { pick: i + 1, slot, by: slotNames[slot] || `Slot ${slot}` })
      })
    }
    return map
  }, [isLive, liveDraft, mock, n, slotNames])
  const takenKeys = useMemo(() => new Set(taken.keys()), [taken])
  const currentPick = isLive ? liveDraft.currentPick : mock.length + 1

  const onPick = !isLive ? key => setMock([...mock, key]) : null

  const rows = useMemo(() => {
    const r = m.drivers.slice()
    const by = {
      proj:   (a, b) => a.projPts - b.projPts,
      value:  (a, b) => (b.valueVsAdp ?? -99) - (a.valueVsAdp ?? -99) || a.projPts - b.projPts,
      market: (a, b) => a.marketRank - b.marketRank,
      trend:  (a, b) => (a.lastDelta ?? 99) - (b.lastDelta ?? 99),
    }[sort]
    return r.sort(by).filter(d => !(hideTaken && takenKeys.has(d.key)))
  }, [m.drivers, sort, hideTaken, takenKeys])

  const years = m.historyYears
  const myPicks = [...taken.entries()].filter(([, t]) => t.slot === mySlot)
  const myDrivers = myPicks.map(([k]) => m.drivers.find(d => d.key === k)).filter(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ ...lbl, marginBottom: 6 }}>Your draft slot</div>
          <select value={mySlot || ''} onChange={e => setMySlot(Number(e.target.value) || null)} style={inp}>
            <option value="">Choose…</option>
            {Array.from({ length: n }, (_, i) => i + 1).map(s => (
              <option key={s} value={s}>Slot {s}{slotNames[s] ? ` — ${slotNames[s]}` : ''}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', flex: 1, minWidth: 220 }}>
          {isLive
            ? <>🔴 <b style={{ color: 'var(--text)' }}>Live draft</b> — picks update automatically. Pick {Math.min(currentPick, totalPicks)} of {totalPicks}.</>
            : <>🧪 <b style={{ color: 'var(--text)' }}>Mock draft</b> — click <i>Pick</i> to mark drivers taken in draft order ({n} players, {totalPicks} picks, snake). Saved on this device only.</>}
        </div>
        {!isLive && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn('ghost')} disabled={!mock.length} onClick={() => setMock(mock.slice(0, -1))}>Undo</button>
            <button style={btn('ghost')} disabled={!mock.length} onClick={() => { if (confirm('Clear the mock draft?')) setMock([]) }}>Reset</button>
          </div>
        )}
      </div>

      <DraftAssistant drivers={m.drivers} takenKeys={takenKeys} currentPick={currentPick} totalPicks={totalPicks}
        n={n} mySlot={mySlot} onPick={onPick} />

      {myDrivers.length > 0 && (
        <div style={{ ...card, fontSize: 14 }}>
          <span style={lbl}>Your roster so far: </span>
          {myDrivers.map(d => d.name).join(', ')}
          <span style={{ color: 'var(--muted)' }}> — projected {fmt(myDrivers.reduce((s, d) => s + d.projPts, 0), 1)} pts/race combined</span>
        </div>
      )}

      <div style={{ ...card, padding: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '14px 16px' }}>
          <span style={lbl}>Sort</span>
          {[['proj', 'Projection'], ['value', 'Sleeper value'], ['market', 'Expected draft order'], ['trend', 'Last-season change']].map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)} style={{ ...btn(sort === k ? 'red' : 'ghost'), padding: '5px 12px' }}>{label}</button>
          ))}
          <label style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={hideTaken} onChange={e => setHideTaken(e.target.checked)} /> Hide taken
          </label>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '75vh', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th} title="Rank by projected fantasy points per race">#</th>
              <th style={th}>Driver</th>
              <th style={th} title="Drivers within ~0.8 pts/race of each other share a tier">Tier</th>
              <th style={th} title="Projected average finish">Proj fin</th>
              <th style={th} title="Projected wins (each win = −10 pts)">Wins</th>
              <th style={th} title="Projected fantasy points per race = avg finish − 10 × win rate. Lower is better.">Pts/race</th>
              <th style={th} title={`Season points saved vs. the best driver likely left undrafted (#${m.draftSlots + 1})`}>VORP</th>
              <th style={th} title="Average pick where this league has drafted him (undrafted counts as pick 24)">League ADP</th>
              <th style={th} title="League ADP rank minus projection rank. Positive = this league has drafted him later than he projects (sleeper).">Value</th>
              <th style={th} title="Where the simulation expects him to go next draft (ADP blended with last season's average finish)">Exp. pick</th>
              <th style={th}>{years.slice().reverse().map(y => `’${String(y).slice(2)}`).join(' → ')}</th>
              <th style={th} title="Change in average finish last season (negative = improved)">Last Δ</th>
              <th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {rows.map(d => {
                const t = taken.get(d.key)
                const isOpen = open === d.key
                return [
                  <tr key={d.key} onClick={() => setOpen(isOpen ? null : d.key)}
                    style={{ cursor: 'pointer', opacity: t ? 0.38 : 1, background: isOpen ? 'var(--surface2)' : 'transparent' }}>
                    <td style={{ ...td, color: 'var(--muted)' }}>{d.projRank}</td>
                    <td style={td}>
                      <span style={{ color: 'var(--dim)', marginRight: 6 }}>#{d.carNumber}</span>
                      <b>{d.name}</b>
                      {d.isRookie && <Badge color="var(--gold)" title="No history in league data">Rookie</Badge>}
                      {d.teamChanged && <Badge color="#60a5fa" title={`Was ${d.prevTeam}`}>New team</Badge>}
                      {d.lastDelta != null && d.lastDelta <= -2 && <Badge color="var(--green)" title="Improved 2+ places last season — expect some give-back">Improver</Badge>}
                      <div style={{ fontSize: 12, color: 'var(--dim)' }}>{d.team}</div>
                    </td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{d.tier}</td>
                    <td style={{ ...td, background: heat(d.projAvg) }}>{fmt(d.projAvg)}</td>
                    <td style={td}>{fmt(d.projWins)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmt(d.projPts, 2)}</td>
                    <td style={{ ...td, color: d.vorp > 0 ? 'var(--green)' : 'var(--muted)' }}>{d.vorp == null ? '—' : d.vorp}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{d.yearsDrafted ? fmt(d.adp) : <span style={{ color: 'var(--dim)' }}>never</span>}</td>
                    <td style={{ ...td, fontWeight: 700, color: d.valueVsAdp >= 3 ? 'var(--green)' : d.valueVsAdp <= -3 ? 'var(--red)' : 'var(--muted)' }}>
                      {signed(d.valueVsAdp, 0)}
                    </td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{d.marketRank}</td>
                    <td style={td}><Spark seasons={d.seasons} years={years} /></td>
                    <td style={{ ...td, color: d.lastDelta < 0 ? 'var(--green)' : d.lastDelta > 0 ? 'var(--red)' : 'var(--muted)' }}>{signed(d.lastDelta)}</td>
                    <td style={td} onClick={e => e.stopPropagation()}>
                      {t ? <span style={{ fontSize: 12, color: t.slot === mySlot ? 'var(--gold)' : 'var(--muted)' }}>#{t.pick} {t.slot === mySlot ? 'You' : t.by}</span>
                         : onPick ? <button style={{ ...btn('ghost'), padding: '3px 10px' }} onClick={() => onPick(d.key)}>Pick</button>
                         : <span style={{ fontSize: 12, color: 'var(--green)' }}>Available</span>}
                    </td>
                  </tr>,
                  isOpen && <tr key={d.key + '-x'}><td colSpan={13}style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    <DriverDetail d={d} years={years} draftYears={m.draftYears} />
                  </td></tr>,
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Trends & sleepers tab ───────────────────────────────────────
function DriverList({ title, note, items, render }) {
  return (
    <div style={card}>
      <h3 style={{ fontSize: 22, margin: 0 }}>{title}</h3>
      {note && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 10px' }}>{note}</p>}
      {items.length ? items.map(d => (
        <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
          <span><span style={{ color: 'var(--dim)' }}>#{d.carNumber}</span> <b>{d.name}</b></span>
          <span style={{ color: 'var(--muted)', textAlign: 'right' }}>{render(d)}</span>
        </div>
      )) : <div style={{ color: 'var(--dim)', fontSize: 14 }}>None this year.</div>}
    </div>
  )
}

function Trends({ m }) {
  const bt = m.model.backtest
  const [y0, y1] = m.historyYears
  const ds = m.drivers.filter(d => !d.isRookie)
  const undervalued = ds.filter(d => d.valueVsAdp >= 3).sort((a, b) => b.valueVsAdp - a.valueVsAdp)
  const overvalued = ds.filter(d => d.valueVsAdp <= -3).sort((a, b) => a.valueVsAdp - b.valueVsAdp)
  const improvers = ds.filter(d => d.lastDelta != null && d.lastDelta <= -1.5).sort((a, b) => a.lastDelta - b.lastDelta)
  const decliners = ds.filter(d => d.lastDelta != null && d.lastDelta >= 1.5).sort((a, b) => b.lastDelta - a.lastDelta)
  const risers = ds.filter(d => d.seasons[y0]?.h1 != null && d.seasons[y0].h2 <= d.seasons[y0].h1 - 3)
    .sort((a, b) => (a.seasons[y0].h2 - a.seasons[y0].h1) - (b.seasons[y0].h2 - b.seasons[y0].h1))
  const steady = ds.filter(d => Object.keys(d.seasons).length >= 3)
    .map(d => ({ d, spread: Math.max(...Object.values(d.seasons).map(s => s.avg)) - Math.min(...Object.values(d.seasons).map(s => s.avg)) }))
    .filter(x => x.d.projRank <= 24).sort((a, b) => a.spread - b.spread).slice(0, 6)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {bt && (
        <div style={{ ...card, borderColor: 'var(--gold)' }}>
          <h3 style={{ fontSize: 24, margin: 0, color: 'var(--gold)' }}>Does "most improved" predict next year?</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, margin: '8px 0 0' }}>
            Across {bt.deltaPairs} drivers with three seasons, the correlation between one year's change and the next year's change is
            {' '}<b style={{ color: 'var(--text)' }}>{fmt(bt.deltaCorr, 2)}</b>
            {bt.deltaCorr < 0 ? ' — improvers tended to give part of the gain back the following season.' : '.'}
            {' '}Predicting {bt.targetYear} by extending the prior trend missed by <b style={{ color: 'var(--text)' }}>{fmt(bt.trendMae, 2)}</b> places per driver;
            using last season alone missed by <b style={{ color: 'var(--text)' }}>{fmt(bt.lastSeasonMae, 2)}</b>; this board's model missed by
            {' '}<b style={{ color: 'var(--green)' }}>{fmt(bt.modelMae, 2)}</b>.
            {' '}So improvement is a reason to look closer — especially with a team change behind it — but the projection already prices in how much of it tends to stick.
            The best "sleepers" are drivers the projection likes more than this league does.
          </p>
        </div>
      )}
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <DriverList title="Sleepers: league undervalues" note="Projects well ahead of where this league has drafted him. Watch 'Exp. pick' — a big season may mean he won't slip this time."
          items={undervalued} render={d => <>
            proj #{d.projRank} · ADP {d.yearsDrafted ? fmt(d.adp) : 'never'} · <span style={{ color: 'var(--green)' }}>{signed(d.valueVsAdp, 0)}</span>
            <div style={{ fontSize: 12, color: d.marketRank > d.projRank ? 'var(--green)' : 'var(--gold)' }}>
              {d.marketRank > d.projRank ? `should still slip — exp. pick ${d.marketRank}` : `big year — likely gone early (exp. pick ${d.marketRank})`}
            </div>
          </>} />
        <DriverList title="Overvalued: league reaches" note="This league has drafted him earlier than his projection justifies."
          items={overvalued} render={d => <>proj #{d.projRank} · ADP {fmt(d.adp)} · exp. #{d.marketRank} · <span style={{ color: 'var(--red)' }}>{signed(d.valueVsAdp, 0)}</span></>} />
        <DriverList title={`Biggest improvers (${y1 ?? ''}→${y0})`} note="Your classic sleeper signal. Projection shows how much the model expects to stick."
          items={improvers} render={d => <>{fmt(d.seasons[y1]?.avg)} → {fmt(d.seasons[y0]?.avg)} <span style={{ color: 'var(--green)' }}>({signed(d.lastDelta)})</span> · proj {fmt(d.projAvg)}{d.teamChanged ? ' · new team' : ''}</>} />
        <DriverList title={`Biggest decliners (${y1 ?? ''}→${y0})`} note="Possible bounce-back candidates the league may now undervalue."
          items={decliners} render={d => <>{fmt(d.seasons[y1]?.avg)} → {fmt(d.seasons[y0]?.avg)} <span style={{ color: 'var(--red)' }}>({signed(d.lastDelta)})</span> · proj {fmt(d.projAvg)}</>} />
        <DriverList title={`Second-half risers (${y0})`} note="Finished the season 3+ places better than they started. Mixed predictive record — use as a tiebreaker."
          items={risers} render={d => <>H1 {fmt(d.seasons[y0].h1)} → H2 {fmt(d.seasons[y0].h2)}</>} />
        <DriverList title="Most consistent year to year" note="Smallest swing in season average across all seasons (top-24 projections)."
          items={steady.map(x => x.d)} render={d => <>{m.historyYears.slice().reverse().map(y => fmt(d.seasons[y]?.avg)).join(' · ')}</>} />
      </div>
    </div>
  )
}

// ── Track types tab ─────────────────────────────────────────────
function Tracks({ m }) {
  const total = Object.values(m.schedule).reduce((s, x) => s + x, 0) || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...card, fontSize: 14, color: 'var(--muted)' }}>
        <b style={{ color: 'var(--text)' }}>Schedule mix:</b>{' '}
        {Object.entries(TT).map(([k, name]) => `${name} ${m.schedule[k] || 0} (${Math.round(((m.schedule[k] || 0) / total) * 100)}%)`).join(' · ')}.
        {' '}Track-type averages cover all {m.historyYears.length} seasons. Backtesting showed they don't improve season-long projections (36 races mixes everything),
        so they're context — useful for breaking ties between similar drivers.
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>
            <th style={th}>#</th><th style={th}>Driver</th><th style={th}>Overall</th>
            {Object.values(TT).map(n => <th key={n} style={th}>{n}</th>)}
            <th style={th}>Best type</th>
          </tr></thead>
          <tbody>
            {m.drivers.map(d => {
              const types = Object.keys(TT).filter(k => d.byType[k])
              const bestK = types.sort((a, b) => d.byType[a].avg - d.byType[b].avg)[0]
              return (
                <tr key={d.key}>
                  <td style={{ ...td, color: 'var(--muted)' }}>{d.projRank}</td>
                  <td style={td}><b>{d.name}</b></td>
                  <td style={{ ...td, background: heat(d.careerAvg) }}>{fmt(d.careerAvg)}</td>
                  {Object.keys(TT).map(k => (
                    <td key={k} style={{ ...td, background: heat(d.byType[k]?.avg) }}>
                      {fmt(d.byType[k]?.avg)}
                      {d.byType[k] && d.careerAvg != null && Math.abs(d.byType[k].avg - d.careerAvg) >= 2 &&
                        <span style={{ fontSize: 11, color: d.byType[k].avg < d.careerAvg ? 'var(--green)' : 'var(--red)', marginLeft: 4 }}>
                          {signed(d.byType[k].avg - d.careerAvg, 0)}
                        </span>}
                    </td>
                  ))}
                  <td style={{ ...td, color: 'var(--muted)', fontSize: 13 }}>{bestK ? TT[bestK] : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Method tab ──────────────────────────────────────────────────
function Method({ m }) {
  const bt = m.model.backtest
  const w = m.model.recencyWeights.map((x, i) => `${m.historyYears[i]}: ${Math.round(x * 100)}%`).join(', ')
  const P = ({ children }) => <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.75, margin: '0 0 12px' }}>{children}</p>
  return (
    <div style={{ ...card, maxWidth: 820 }}>
      <h3 style={{ fontSize: 26, margin: '0 0 12px' }}>How the board works</h3>
      <P><b style={{ color: 'var(--text)' }}>Scoring.</b> Your season score is the sum of your drivers' finishing positions minus 10 per win, lower is better. Because it's a 36-race total, only a driver's <i>expected</i> finish matters — a boom-or-bust driver and a steady one with the same average are worth the same.</P>
      <P><b style={{ color: 'var(--text)' }}>Projection.</b> Weighted average finish over the last {m.historyYears.length} seasons ({w}), weighted by races run, then pulled {Math.round((1 - m.model.shrink) * 100)}% toward the field average ({fmt(m.model.fieldMean)}) because extreme seasons tend not to repeat. Wins get the same treatment. Drivers with one season are pulled harder; drivers with no history start at the league's average debut-season finish ({fmt(m.model.rookieAvg)}).</P>
      {bt && <P><b style={{ color: 'var(--text)' }}>Backtest.</b> Re-running the model without {bt.targetYear} data and comparing to what happened: average error {fmt(bt.modelMae, 2)} places per driver ({bt.drivers} drivers), vs {fmt(bt.lastSeasonMae, 2)} for "same as last year" and {fmt(bt.trendMae, 2)} for "trend continues."</P>}
      <P><b style={{ color: 'var(--text)' }}>Value over replacement (VORP).</b> {m.draftSlots} drivers get drafted, so the best driver you can't avoid ending up with is roughly the #{m.draftSlots + 1} projection ({fmt(m.model.replacement, 2)} pts/race). VORP is how many season points a driver saves you versus that.</P>
      <P><b style={{ color: 'var(--text)' }}>Sleeper value.</b> League ADP is his average draft slot in this league ({m.draftYears.join(', ')}; undrafted counts as pick {m.draftSlots + 4}). Value = ADP rank − projection rank; positive means this group has historically taken him later than he projects.</P>
      <P><b style={{ color: 'var(--text)' }}>Expected pick.</b> For simulating opponents, the board assumes the league will draft by a blend of past draft slot and last season's average finish (the number most people look at), since a driver coming off a big year probably won't slip like he used to.</P>
      <P><b style={{ color: 'var(--text)' }}>Pick recommendations.</b> For every driver you could take, the board plays out the rest of the snake draft — opponents take the next driver by league rank, you take the best projection — and recommends the pick that gives your whole remaining roster the lowest projected total. That's how it decides when to grab a driver now versus wait for him.</P>
      <P><b style={{ color: 'var(--text)' }}>Limits.</b> The data has finishing positions only (no starts, laps led or DNFs). Driver pool: {m.poolSource}. It can't know about off-season team, crew-chief or equipment changes — the "New team" badge flags the ones visible in the data, and that's where your own judgment adds the most.</P>
      <div style={{ fontSize: 12, color: 'var(--dim)' }}>Generated {new Date(m.generatedAt).toLocaleString()}</div>
    </div>
  )
}

// ── Password gate ───────────────────────────────────────────────
function PasswordGate({ onUnlock, authHeader }) {
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const h = await authHeader()
    const r = await fetch('/api/strategy/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ password: pwd }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (r.ok) onUnlock()
    else { setErr(j.error || 'Unlock failed.'); setPwd('') }
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <form onSubmit={submit} style={{ ...card, width: '100%', maxWidth: 400, padding: '36px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🧠</div>
        <h2 style={{ fontSize: 32, margin: '6px 0 4px' }}>Strategy Board</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 20px' }}>Enter the strategy board password</p>
        <input type="password" autoFocus value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••"
          style={{ ...inp, width: '100%', marginBottom: 12 }} />
        {err && <div style={{ color: '#ff6b7a', fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button type="submit" disabled={busy || !pwd} style={{ ...btn('red'), width: '100%', opacity: busy || !pwd ? 0.4 : 1 }}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <div style={{ marginTop: 16 }}><Link href="/admin" style={{ color: 'var(--muted)', fontSize: 13 }}>← Back to admin</Link></div>
      </form>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } },
}

export default function StrategyPage() {
  const [state, setState] = useState('checking') // checking | login | locked | loading | ready | error
  const [err, setErr] = useState('')
  const [m, setM] = useState(null)
  const [tab, setTab] = useState('board')
  const [mySlot, setMySlotRaw] = useState(null)
  const [mock, setMockRaw] = useState([])

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
  }, [])

  const load = useCallback(async () => {
    const h = await authHeader()
    if (!h.Authorization) { setState('login'); return }
    setState(s => (s === 'ready' ? s : 'loading'))
    const r = await fetch('/api/strategy/data', { headers: h })
    const j = await r.json().catch(() => ({}))
    if (r.status === 401) { setState('login'); return }
    if (r.status === 403) { setState('locked'); return }
    if (!r.ok) { setErr(j.error || `Error ${r.status}`); setState('error'); return }
    setM(j)
    setMySlotRaw(LS.get(`strategy.slot.${j.targetYear}`, null))
    setMockRaw(LS.get(`strategy.mock.${j.targetYear}`, []))
    setState('ready')
  }, [authHeader])

  useEffect(() => { load() }, [load])

  // Live draft: refresh picks whenever the draft tables change.
  const liveSessionId = m?.draft?.sessionId
  useEffect(() => {
    if (!liveSessionId) return
    const refresh = async () => {
      const r = await fetch('/api/strategy/data?live=1', { headers: await authHeader() })
      if (r.ok) { const j = await r.json(); setM(prev => (prev ? { ...prev, draft: j.draft } : prev)) }
    }
    const ch = supabase.channel('strategy_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_sessions' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [liveSessionId, authHeader])

  const setMySlot = v => { setMySlotRaw(v); if (m) LS.set(`strategy.slot.${m.targetYear}`, v) }
  const setMock = v => { setMockRaw(v); if (m) LS.set(`strategy.mock.${m.targetYear}`, v) }

  async function lock() {
    await fetch('/api/strategy/unlock', { method: 'DELETE' })
    setM(null); setState('locked')
  }

  if (state === 'checking' || state === 'loading') {
    return <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontFamily: "'Barlow Condensed'", letterSpacing: '0.1em' }}>LOADING…</div>
  }
  if (state === 'login') {
    return (
      <div style={{ ...card, maxWidth: 420, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <p style={{ color: 'var(--muted)' }}>Sign in to the admin console first.</p>
        <Link href="/admin" style={{ ...btn('red'), textDecoration: 'none' }}>Go to Admin</Link>
      </div>
    )
  }
  if (state === 'locked') return <PasswordGate onUnlock={load} authHeader={authHeader} />
  if (state === 'error') return <div style={{ ...card, color: '#ff6b7a' }}>⚠️ {err}</div>

  const modeText = {
    live: `Live ${m.targetYear} draft in progress`,
    predraft: `${m.targetYear} season set up — draft not started (mock mode)`,
    preview: `Preparing for ${m.targetYear} · using ${m.historyYears.join(', ')} results`,
  }[m.mode]

  const Tab = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{
      padding: '10px 18px', background: tab === id ? 'var(--surface)' : 'transparent', border: 'none',
      borderBottom: tab === id ? '2px solid var(--red)' : '2px solid transparent', color: tab === id ? 'var(--text)' : 'var(--muted)',
      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase',
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  )

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <Link href="/admin" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← Admin</Link>
          <h1 style={{ fontSize: 48, margin: 0 }}>Draft Strategy Board</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '2px 0 0' }}>{modeText}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn('ghost')} onClick={load}>Refresh</button>
          <button style={btn('ghost')} onClick={lock}>🔒 Lock</button>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 18, overflowX: 'auto' }}>
        <Tab id="board" label="🎯 Draft Board" />
        <Tab id="trends" label="📈 Trends & Sleepers" />
        <Tab id="tracks" label="🏁 Track Types" />
        <Tab id="method" label="🧮 How it works" />
      </div>

      {tab === 'board'  && <DraftBoard m={m} mySlot={mySlot} setMySlot={setMySlot} mock={mock} setMock={setMock} liveDraft={m.draft} />}
      {tab === 'trends' && <Trends m={m} />}
      {tab === 'tracks' && <Tracks m={m} />}
      {tab === 'method' && <Method m={m} />}
    </div>
  )
}
