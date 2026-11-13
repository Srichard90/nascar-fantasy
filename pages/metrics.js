import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { useSeason } from '../lib/season'
import { loadSeasonData, computeSeasonStats, WIN_BONUS, round1 } from '../lib/league'
import SeasonRaceChart from '../components/SeasonRaceChart'

const TABS = [
  { id: 'race',    label: 'Season Race',       icon: '📈' },
  { id: 'weekly',  label: 'Weekly Wins',       icon: '⚔️' },
  { id: 'teams',   label: 'Team Breakdown',    icon: '👥' },
  { id: 'form',    label: 'Hot & Cold',        icon: '🔥' },
  { id: 'draft',   label: 'Draft Report Card', icon: '🎯' },
  { id: 'drivers', label: 'Driver Rankings',   icon: '🏁' },
]

// ── Shared styles ───────────────────────────────────────────────
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }
const th = {
  padding: '11px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
  fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', whiteSpace: 'nowrap',
}
const td = { padding: '11px 14px', textAlign: 'center', borderTop: '1px solid var(--border)', fontSize: 15, color: 'var(--text)' }
const num = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.04em' }
const label = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }
const GOOD = '#4ade80', BAD = '#f87171'

function ordinal(n) {
  if (n == null) return '—'
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
const fmt = x => (x == null ? '—' : x.toLocaleString())
const signed = x => (x == null ? '—' : x > 0 ? `+${x}` : `${x}`)

// ── Small building blocks ───────────────────────────────────────
function Section({ title, note, children, right }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 28, color: 'var(--text)', margin: 0 }}>{title}</h2>
          {note && (
            <div style={{ color: 'var(--muted)', fontSize: 14, margin: '4px 0 0', lineHeight: 1.55 }}>
              {(Array.isArray(note) ? note : [note]).map((line, i) => (
                <div key={i}>
                  {Array.isArray(line)
                    ? <><b style={{ color: 'var(--text)', fontWeight: 600 }}>{line[0]}:</b> {line[1]}</>
                    : line}
                </div>
              ))}
            </div>
          )}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function PlayerName({ name, color, size = 17 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: size, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text)' }}>{name}</span>
    </span>
  )
}

function Tag({ children, tone = 'neutral' }) {
  const tones = {
    neutral: ['rgba(160,160,160,0.15)', 'var(--muted)'],
    good:    ['rgba(74,222,128,0.14)', GOOD],
    bad:     ['rgba(248,113,113,0.14)', BAD],
    gold:    ['rgba(245,197,24,0.14)', 'var(--gold)'],
    swap:    ['rgba(99,102,241,0.2)', '#a5b4fc'],
  }
  const [bg, fg] = tones[tone]
  return (
    <span style={{ background: bg, color: fg, borderRadius: 5, padding: '1px 7px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function Stat({ title, value, sub }) {
  return (
    <div>
      <div style={label}>{title}</div>
      <div style={{ ...num, fontSize: 26, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{sub}</div>}
    </div>
  )
}

function Empty({ children }) {
  return (
    <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--muted)', fontSize: 16, margin: 0 }}>{children}</p>
    </div>
  )
}

function Scroll({ children, minWidth }) {
  return (
    <div style={{ ...card, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>{children}</table>
    </div>
  )
}

function OwnerChip({ owner, stats }) {
  if (!owner) return <span style={{ color: 'var(--dim)' }}>Available</span>
  const p = stats.playerById.get(owner.playerId)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <PlayerName name={p?.player_name} color={stats.colors[p?.player_name]} size={14} />
      {owner.label && <Tag tone={owner.label === 'swap' ? 'swap' : 'gold'}>{owner.label}</Tag>}
    </span>
  )
}

// ── Tab: Season Race ────────────────────────────────────────────
function RaceTab({ s }) {
  if (!s.completed) return <Empty>No completed races yet this season.</Empty>
  const final = s.raceSeries[s.raceSeries.length - 1]
  const order = final.order
  const done = s.completed === s.totalRaces
  return (
    <>
      <Section
        title="Season Race"
        note={[
          `How far each player was behind 1st place (adjusted points) after every race. The ${done ? 'final' : 'current'} leader is on the top line.`,
          'Hover the chart for the standings after any week.',
        ]}
      >
        <div style={{ ...card, padding: '16px 12px 8px' }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', padding: '0 8px 8px' }}>
            {order.map(id => {
              const p = s.playerById.get(id)
              return <PlayerName key={id} name={p.player_name} color={s.colors[p.player_name]} size={14} />
            })}
          </div>
          <SeasonRaceChart series={s.raceSeries} players={s.players} colors={s.colors} />
        </div>
      </Section>

      <Section title="Race Summary" note={`${s.leadChanges} lead change${s.leadChanges === 1 ? '' : 's'} ${done ? 'this season' : 'so far this season'}.`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          {order.map((id, i) => {
            const p = s.playerById.get(id), r = s.raceSummary[id]
            const rows = [
              { title: 'Weeks in 1st', value: r.weeksLed, sub: `of ${s.completed} races` },
              { title: 'Biggest lead', value: r.biggestLead || '—', sub: r.biggestLeadWeek ? `points · after wk ${r.biggestLeadWeek}` : 'never led alone' },
              { title: 'Furthest behind', value: r.biggestDeficit || '—', sub: r.biggestDeficit ? 'points back of 1st' : 'never trailed' },
            ]
            return (
              <div key={id} style={{ ...card, padding: '16px 18px', borderTop: `3px solid ${s.colors[p.player_name]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <PlayerName name={p.player_name} color={s.colors[p.player_name]} size={21} />
                  <span style={{ ...label, fontSize: 13, color: i === 0 ? 'var(--gold)' : 'var(--muted)' }}>{ordinal(i + 1)}{done ? ' · final' : ''}</span>
                </div>
                {rows.map((row, k) => (
                  <div key={row.title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: k ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <div style={{ ...label, fontSize: 17 }}>{row.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>{row.sub}</div>
                    </div>
                    <div style={{ ...num, fontSize: 40, lineHeight: 1, color: 'var(--text)' }}>{row.value}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}

// ── Tab: Weekly Wins ────────────────────────────────────────────
function WeeklyTab({ s }) {
  if (!s.completed) return <Empty>No completed races yet this season.</Empty>
  const ids = [...s.players].map(p => p.player_id)
    .sort((a, b) => s.weekly[b].wins - s.weekly[a].wins || s.weekly[a].avg - s.weekly[b].avg)
  const name = id => s.playerById.get(id).player_name
  return (
    <>
      <Section title="Weekly Winners" note={[
        'The player with the lowest adjusted score each race wins the week.',
        "Hover a square to see every player's score that week.",
      ]}>
        <style>{`
          .week-grid { display: grid; grid-template-columns: repeat(20, minmax(0, 1fr)); gap: 5px; }
          @media (max-width: 640px) { .week-grid { grid-template-columns: repeat(10, minmax(0, 1fr)); } }
        `}</style>
        <div style={{ ...card, padding: 16 }}>
          <div className="week-grid">
            {s.weekWinners.map((w, wi) => {
              const shared = w.winners.length > 1
              const sc = s.weeks[wi].scores
              const lines = [...s.players].sort((a, b) => sc[a.player_id].adj - sc[b.player_id].adj)
                .map(p => `${w.winners.includes(p.player_id) ? '★ ' : '   '}${p.player_name}  ${sc[p.player_id].adj}`)
              const color = shared ? '#555' : s.colors[name(w.winners[0])]
              return (
                <div key={w.week}
                  title={`Week ${w.week} · ${w.race.race_name}${shared ? ' (tie)' : ''}\n${lines.join('\n')}`}
                  style={{ aspectRatio: '1', borderRadius: 6, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#111', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {shared ? 'T' : w.week}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
            {ids.map(id => <PlayerName key={id} name={name(id)} color={s.colors[name(id)]} size={14} />)}
            {s.weekWinners.some(w => w.winners.length > 1) && <span style={{ fontSize: 13, color: 'var(--muted)' }}><b style={{ color: 'var(--text)' }}>T</b> = tied week</span>}
          </div>
        </div>
      </Section>

      <Section title="Weekly Record">
        <Scroll minWidth={760}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Player</th>
            <th style={th}>Weekly wins</th>
            <th style={th}>Last-place weeks</th>
            <th style={th}>Avg score</th>
            <th style={th}>Best week</th>
            <th style={th}>Worst week</th>
            <th style={th}>Longest win streak</th>
          </tr></thead>
          <tbody>
            {ids.map(id => {
              const w = s.weekly[id]
              return (
                <tr key={id}>
                  <td style={{ ...td, textAlign: 'left' }}><PlayerName name={name(id)} color={s.colors[name(id)]} /></td>
                  <td style={td}><span style={num}>{w.wins}</span>{w.sharedWins > 0 && <div style={{ fontSize: 11, color: 'var(--dim)' }}>{w.sharedWins} tied</div>}</td>
                  <td style={td}><span style={{ ...num, color: 'var(--muted)' }}>{w.lasts}</span></td>
                  <td style={td}><span style={num}>{w.avg}</span></td>
                  <td style={td}><span style={num}>{w.best.score}</span><div style={{ fontSize: 12, color: 'var(--dim)' }}>Wk {w.best.week} · {w.best.race.track_name || w.best.race.race_name}</div></td>
                  <td style={td}><span style={{ ...num, color: 'var(--muted)' }}>{w.worst.score}</span><div style={{ fontSize: 12, color: 'var(--dim)' }}>Wk {w.worst.week} · {w.worst.race.track_name || w.worst.race.race_name}</div></td>
                  <td style={td}><span style={num}>{w.longestStreak}</span></td>
                </tr>
              )
            })}
          </tbody>
        </Scroll>
      </Section>

    </>
  )
}

// ── Tab: Team Breakdown ─────────────────────────────────────────
function TeamsTab({ s }) {
  if (!s.completed) return <Empty>No completed races yet this season.</Empty>
  const teams = [...s.teams].sort((a, b) => a.total - b.total)
  return (
    <Section
      title="Team Breakdown"
      note={[
        'Every driver who scored for each team, counted only for the weeks he was on it (swaps and injury subs included).',
        ['Wks', 'weeks the driver counted for the team'],
        ['Pts', `finish positions − ${WIN_BONUS} per win`],
        ['30+', 'finishes of 30th or worse'],
        ['MVP / Weak Link', 'best and worst average finish among drivers with 5+ races'],
      ]}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 500px), 1fr))', gap: 16 }}>
        {teams.map((t, i) => {
          const color = s.colors[t.player.player_name]
          return (
            <div key={t.player.player_id} style={{ ...card, overflow: 'hidden', borderTop: `3px solid ${color}` }}>
              <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <PlayerName name={t.player.player_name} color={color} size={21} />
                  <div style={{ ...label, marginTop: 2 }}>{ordinal(i + 1)} · {fmt(t.total)} adj. pts</div>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <Stat title="Avg finish" value={t.avgFinish ?? '—'} />
                  <Stat title="Wins" value={t.wins} />
                  <Stat title="Top 5" value={t.top5} />
                  <Stat title="Top 10" value={t.top10} />
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 470 }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: 'left' }}>Driver</th>
                    <th style={th} title="Weeks this driver counted for the team">Wks</th>
                    <th style={th}>Avg</th>
                    <th style={th}>Wins</th>
                    <th style={th}>T10</th>
                    <th style={th} title="Finishes of 30th or worse">30+</th>
                    <th style={th}>Pts</th>
                  </tr></thead>
                  <tbody>
                    {t.rows.map(r => (
                      <tr key={r.key}>
                        <td style={{ ...td, textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>{r.driver.driver_name}</span>
                            <span style={{ color: 'var(--gold)', fontSize: 12 }}>#{r.driver.car_number}</span>
                            {r.label && <Tag tone={r.label === 'swap' ? 'swap' : 'gold'}>{r.label}</Tag>}
                            {t.best === r.key && <Tag tone="good">MVP</Tag>}
                            {t.worst === r.key && <Tag tone="bad">Weak link</Tag>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                            Round {r.round}
                            {!r.fullSeason && (r.contiguous
                              ? ` · wk ${r.firstWeek}${r.lastWeek !== r.firstWeek ? `–${r.lastWeek}` : ''}`
                              : ` · ${r.weeksOnTeam} of ${s.completed} wks`)}
                          </div>
                        </td>
                        <td style={{ ...td, color: 'var(--muted)' }}>{r.weeksOnTeam}</td>
                        <td style={td}><span style={{ ...num, fontSize: 20 }}>{r.avgFinish ?? '—'}</span></td>
                        <td style={td}>{r.wins ? <Tag tone="gold">🏆 {r.wins}</Tag> : <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                        <td style={td}>{r.top10}</td>
                        <td style={{ ...td, color: r.bad ? 'var(--muted)' : 'var(--dim)' }}>{r.bad || '—'}</td>
                        <td style={td}><span style={{ ...num, fontSize: 20 }}>{fmt(r.adj)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── Tab: Hot & Cold ─────────────────────────────────────────────
function Trend({ delta, unit = '' }) {
  if (delta == null) return <span style={{ color: 'var(--dim)' }}>—</span>
  const up = delta > 0, flat = Math.abs(delta) < 0.5
  return (
    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, color: flat ? 'var(--muted)' : up ? GOOD : BAD, whiteSpace: 'nowrap' }}>
      {flat ? '→ steady' : up ? `▲ ${delta}${unit} better` : `▼ ${Math.abs(delta)}${unit} worse`}
    </span>
  )
}

function FormTab({ s }) {
  const f = s.form
  if (!f.ready) return <Empty>Hot &amp; Cold appears after {f.n + 3} completed races ({s.completed} so far).</Empty>
  const span = `most recent ${f.n} races`
  const hot = [...f.drivers].sort((a, b) => b.delta - a.delta).slice(0, 6).filter(d => d.delta > 0)
  const cold = [...f.drivers].sort((a, b) => a.delta - b.delta).slice(0, 6).filter(d => d.delta < 0)

  const DriverList = ({ title, items }) => (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text)' }}>{title}</div>
      {items.length === 0 ? <div style={{ padding: 16, color: 'var(--muted)' }}>Nobody right now.</div> : items.map(d => (
        <div key={d.driver.driver_id} style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{d.driver.driver_name} <span style={{ color: 'var(--gold)', fontSize: 12 }}>#{d.driver.car_number}</span></div>
            <div style={{ fontSize: 12, marginTop: 2 }}><OwnerChip owner={d.owner} stats={s} /></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, color: 'var(--text)' }}>avg <b>{d.earlier}</b> → <b>{d.recent}</b></div>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>Last {f.n}: {d.finishes.map(x => `P${x.pos}`).join(' · ')}</div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <Section title="Player Form" note={[
        `Average weekly adjusted score over the ${span} (weeks ${f.weeks[0]}–${f.weeks[f.weeks.length - 1]}) compared with the rest of the season. Lower is better.`,
        ['★', 'weekly win'],
      ]}>
        <Scroll minWidth={700}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Player</th>
            {f.weeks.map(wk => <th key={wk} style={{ ...th, padding: '11px 4px', width: 54 }}>Wk {wk}</th>)}
            <th style={th}>Last-5 avg</th>
            <th style={th}>Earlier avg</th>
            <th style={th}>Trend</th>
          </tr></thead>
          <tbody>
            {f.players.map(p => (
              <tr key={p.player.player_id}>
                <td style={{ ...td, textAlign: 'left' }}><PlayerName name={p.player.player_name} color={s.colors[p.player.player_name]} /></td>
                {p.last.map(w => (
                  <td key={w.week} style={{ ...td, padding: '11px 4px' }}>
                    <span style={{ display: 'inline-block', minWidth: 42, padding: '3px 4px', borderRadius: 6, background: 'var(--surface2)', border: `1px solid ${w.won ? 'var(--gold)' : 'var(--border)'}`, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {w.adj}{w.won ? '★' : ''}
                    </span>
                  </td>
                ))}
                <td style={td}><span style={num}>{p.recent}</span></td>
                <td style={{ ...td, color: 'var(--muted)' }}><span style={num}>{p.earlier}</span></td>
                <td style={td}><Trend delta={p.delta} unit=" pts" /></td>
              </tr>
            ))}
          </tbody>
        </Scroll>
      </Section>

      <Section title="Drivers on the Move" note={[
        `Biggest change in average finish over the ${span} compared with earlier in the season.`,
        'Only drivers with 3+ races in each stretch are included.',
      ]}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
          <DriverList title="🔥 Heating up" items={hot} />
          <DriverList title="🧊 Cooling off" items={cold} />
        </div>
      </Section>
    </>
  )
}

// ── Tab: Draft Report Card ──────────────────────────────────────
// Season-to-date. One grid built on the Draft Efficiency layout: each pick
// slot shows the efficiency ratio (current place ÷ pick number), the driver
// in the slot, his current place (highlighted, top-5 / top-10 colors) with
// the pick number.
// Above it, Roster Strength sums up each player's current drivers.
const ROUND_NAMES = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']

function placeTone(rk) {
  if (rk == null) return { bg: 'rgba(160,160,160,0.12)', fg: 'var(--muted)' }
  if (rk <= 5) return { bg: 'rgba(34,197,94,0.16)', fg: 'var(--green)' }
  if (rk <= 10) return { bg: 'rgba(245,197,24,0.16)', fg: 'var(--gold)' }
  return { bg: 'rgba(160,160,160,0.12)', fg: 'var(--text)' }
}

function DraftTab({ s }) {
  const players = [...s.players].sort((a, b) => a.draft_position - b.draft_position)
  const thru = s.completed === 0 ? null : `through week ${s.nowWeek}`

  if (!s.completed) {
    return <Empty>Draft values appear once the first race of the season is complete.</Empty>
  }

  const cells = s.draftSlots.map(slot => {
    const d = slot.driver
    const rk = d?.rank ?? null
    return { ...slot, rk, eff: rk ? rk / slot.pick.pick_number : null }
  })

  const roster = players.map(p => {
    const mine = cells.filter(c => c.pick.player_id === p.player_id && c.rk != null)
    const best = [...mine].sort((a, b) => a.eff - b.eff)[0] || null
    return {
      player: p,
      avgPlace: mine.length ? round1(mine.reduce((t, c) => t + c.rk, 0) / mine.length) : null,
      top10: mine.filter(c => c.rk <= 10).length,
      beating: mine.filter(c => c.eff <= 1).length,
      count: mine.length,
      best,
    }
  }).sort((a, b) => (a.avgPlace ?? 1e9) - (b.avgPlace ?? 1e9))

  return (
    <>
      <Section
        title="Roster Strength"
        note={[
          `Season to date (${thru}): how each player's current drivers rank among all ${s.rankedCount} drivers by adjusted points.`,
          ['Avg place', "average current place of the player's 5 drivers"],
          ['Top 10', 'drivers currently ranked in the top 10'],
          ['Beat pick', 'drivers whose current place is as good as or better than the overall pick used on them (taken 9th, now 3rd), a Draft Efficiency of 1.00 or lower'],
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          {roster.map((r, i) => (
            <div key={r.player.player_id} style={{ ...card, padding: 16, borderTop: `3px solid ${s.colors[r.player.player_name]}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <PlayerName name={r.player.player_name} color={s.colors[r.player.player_name]} size={19} />
                {i === 0 && <Tag tone="gold">Strongest</Tag>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', justifyContent: 'space-between', gap: 10 }}>
                <Stat title="Avg place" value={r.avgPlace ?? '—'} />
                <Stat title="Top 10" value={r.top10} sub={`of ${r.count}`} />
                <Stat title="Beat pick" value={r.beating} sub={`of ${r.count}`} />
              </div>
              {r.best && (
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
                  Best value: <b style={{ color: 'var(--text)' }}>{r.best.driver?.driver_name}</b> ({ordinal(r.best.rk)}, pick {r.best.pick.pick_number})
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Draft Efficiency"
        note={[
          `Current place ÷ overall pick number, ${thru}.`,
          ['Ratio', 'below 1.0 = outperforming the pick, above 1.0 = underperforming'],
          ['Place', `the driver's rank among all ${s.rankedCount} drivers by adjusted points (Base Pts − Wins × 10)`],
        ]}
      >
        <Scroll minWidth={140 + players.length * 150}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Pick</th>
            {players.map(p => <th key={p.player_id} style={th}><PlayerName name={p.player_name} color={s.colors[p.player_name]} size={18} /></th>)}
          </tr></thead>
          <tbody>
            {Array.from({ length: s.rounds }, (_, r) => (
              <tr key={r}>
                <td style={{ ...td, textAlign: 'left', ...label, fontSize: 14 }}>{ROUND_NAMES[r] || `Pick ${r + 1}`} Pick</td>
                {players.map(p => {
                  const c = cells.find(x => x.pick.player_id === p.player_id && x.pick.round_number === r + 1)
                  if (!c) return <td key={p.player_id} style={{ ...td, color: 'var(--dim)' }}>—</td>
                  const tone = placeTone(c.rk)
                  return (
                    <td key={p.player_id} style={td}>
                      <div style={{ ...num, fontSize: 26, lineHeight: 1, color: c.eff == null ? 'var(--dim)' : c.eff <= 1 ? 'var(--green)' : c.eff <= 2 ? 'var(--text)' : BAD }}>
                        {c.eff == null ? '—' : c.eff.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 14, color: c.replaced ? 'var(--gold)' : 'var(--muted)', marginTop: 3 }}>
                        {c.driver?.driver_name}{c.replaced ? ' *' : ''}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 5 }}>
                        <span style={{ background: tone.bg, color: tone.fg, borderRadius: 6, padding: '1px 8px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: '0.03em' }}>
                          {c.rk ? ordinal(c.rk) : 'no results'}
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--muted)' }}>Pick {c.pick.pick_number}</span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </Scroll>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)', display: 'flex', gap: '6px 20px', flexWrap: 'wrap' }}>
          <span><b style={{ color: 'var(--green)' }}>Ratio ≤ 1.0</b> outperforming the pick</span>
          <span><b style={{ color: BAD }}>Ratio &gt; 2.0</b> well below the pick</span>
          <span><b style={{ color: 'var(--green)' }}>Place</b> top 5 · <b style={{ color: 'var(--gold)' }}>top 10</b></span>
          <span><b style={{ color: 'var(--gold)' }}>*</b> active sub or permanent swap in this slot</span>
        </div>
      </Section>
    </>
  )
}

// ── Tab: Driver Rankings ────────────────────────────────────────
function DriversTab({ s }) {
  const [filter, setFilter] = useState('all')
  // Click-to-sort. Default: Rank. First click puts the "best" end on top
  // (dir 1 = ascending for rank/points/avg, descending for counts).
  const [sort, setSort] = useState({ key: 'rank', dir: 1 })
  const ownerName = d => (d.owner ? s.playerById.get(d.owner.playerId)?.player_name : null)
  const COLS = {
    rank:   { get: d => d.rank, asc: true },
    driver: { get: d => d.driver_name, asc: true, text: true },
    owner:  { get: d => ownerName(d), asc: true, text: true },
    avg:    { get: d => (d.starts ? d.avgFinish : null), asc: true },
    wins:   { get: d => (d.starts ? d.wins : null), asc: false },
    top5:   { get: d => (d.starts ? d.top5 : null), asc: false },
    top10:  { get: d => (d.starts ? d.top10 : null), asc: false },
    base:   { get: d => (d.starts ? d.base : null), asc: true },
    adj:    { get: d => (d.starts ? d.adj : null), asc: true },
  }
  const col = COLS[sort.key]
  const rows = s.drivers
    .filter(d => filter === 'all' || (filter === 'owned' ? d.owner : !d.owner))
    .sort((a, b) => {
      const va = col.get(a), vb = col.get(b)
      // Missing values (no results, or no owner) always sink to the bottom.
      if (va == null && vb == null) return (a.rank ?? 1e9) - (b.rank ?? 1e9)
      if (va == null) return 1
      if (vb == null) return -1
      const c = col.text ? va.localeCompare(vb) : va - vb
      return (col.asc ? c : -c) * sort.dir || (a.rank ?? 1e9) - (b.rank ?? 1e9)
    })
  const sortBy = key => setSort(prev => ({ key, dir: prev.key === key ? -prev.dir : 1 }))
  const H = ({ k, children, left, gold }) => {
    const on = sort.key === k
    const up = on && (COLS[k].asc ? sort.dir === 1 : sort.dir === -1)
    return (
      <th
        role="button" tabIndex={0}
        aria-sort={on ? (up ? 'ascending' : 'descending') : 'none'}
        onClick={() => sortBy(k)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(k) } }}
        style={{ ...th, ...(left ? { textAlign: 'left' } : {}), ...(gold ? { color: 'var(--gold)' } : {}), cursor: 'pointer', userSelect: 'none' }}
      >
        {children}
        <span style={{ marginLeft: 4, fontSize: 10, color: on ? 'var(--gold)' : 'var(--dim)' }}>{on ? (up ? '▲' : '▼') : '↕'}</span>
      </th>
    )
  }
  const asOf = s.completed ? (s.completed === s.totalRaces ? 'end of season' : `after week ${s.nowWeek}`) : 'draft day'
  return (
    <Section
      title="Driver Rankings"
      note={[
        `All drivers ranked by adjusted points (finish positions − ${WIN_BONUS} per win). Lower is better.`,
        ['Owner', `as of ${asOf}`],
        ['Sort', 'click any column header; click again to reverse'],
      ]}
      right={
        <div style={{ display: 'flex', gap: 6 }}>
          {[['all', 'All'], ['owned', 'Owned'], ['available', 'Available']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${filter === k ? 'var(--gold)' : 'var(--border2)'}`,
              background: filter === k ? 'rgba(245,197,24,0.12)' : 'transparent',
              color: filter === k ? 'var(--gold)' : 'var(--muted)',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>{l}</button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? <Empty>No drivers in this view.</Empty> : (
        <Scroll minWidth={820}>
          <thead><tr>
            <H k="rank">Rank</H>
            <H k="driver" left>Driver</H>
            <H k="owner" left>Owner</H>
            <H k="avg">Avg</H>
            <H k="wins">Wins</H>
            <H k="top5">Top 5</H>
            <H k="top10">Top 10</H>
            <H k="base">Base</H>
            <H k="adj" gold>Adj. Pts</H>
          </tr></thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.driver_id}>
                <td style={td}><span style={{ ...num, fontSize: 20, color: d.rank && d.rank <= 3 ? 'var(--gold)' : d.rank && d.rank <= 10 ? 'var(--text)' : 'var(--muted)' }}>{d.rank ?? '—'}</span></td>
                <td style={{ ...td, textAlign: 'left' }}>
                  <div><span style={{ fontWeight: 600 }}>{d.driver_name}</span> <span style={{ color: 'var(--gold)', fontSize: 12 }}>#{d.car_number}</span></div>
                  {d.team && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{d.team}</div>}
                </td>
                <td style={{ ...td, textAlign: 'left' }}><OwnerChip owner={d.owner} stats={s} /></td>
                <td style={td}>{d.avgFinish ?? '—'}</td>
                <td style={td}>{d.wins ? <Tag tone="gold">🏆 {d.wins}</Tag> : <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                <td style={td}>{d.starts ? d.top5 : '—'}</td>
                <td style={td}>{d.starts ? d.top10 : '—'}</td>
                <td style={{ ...td, color: 'var(--muted)' }}>{d.starts ? fmt(d.base) : '—'}</td>
                <td style={td}><span style={{ ...num, color: 'var(--gold)' }}>{d.starts ? fmt(d.adj) : '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </Scroll>
      )}
    </Section>
  )
}

// ── Page ────────────────────────────────────────────────────────
export default function MetricsPage() {
  const router = useRouter()
  const { seasonId, season, isActiveSeason, ready } = useSeason()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const q = ['draftperf', 'drafteff'].includes(router.query.tab) ? 'draft' : router.query.tab
  const tab = TABS.some(t => t.id === q) ? q : 'race'
  const setTab = id => router.replace({ pathname: '/metrics', query: { tab: id } }, undefined, { shallow: true, scroll: false })

  useEffect(() => {
    if (!ready) return
    if (!seasonId) { setLoading(false); return }
    let cancelled = false
    setLoading(true); setError('')
    loadSeasonData(seasonId)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) { console.error('Metrics load error:', e); setError('Could not load this season.') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [seasonId, ready])

  const stats = useMemo(() => (data ? computeSeasonStats(data) : null), [data])

  const status = !stats ? '' : stats.completed === 0
    ? 'Season not started'
    : stats.completed === stats.totalRaces ? `Final · all ${stats.totalRaces} races` : `Through week ${stats.nowWeek} of ${stats.totalRaces}`

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 48, color: 'var(--text)', margin: 0 }}>
          Metrics
          {season && !isActiveSeason && (
            <span style={{ marginLeft: 12, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, color: 'var(--muted)', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Archive</span>
          )}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          {season?.season_name}{status && <> &nbsp;·&nbsp; {status}</>}
        </p>
      </div>

      <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 14px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            border: `2px solid ${tab === t.id ? 'var(--red)' : 'var(--border2)'}`,
            background: tab === t.id ? 'rgba(232,25,44,0.12)' : 'var(--surface)',
            color: tab === t.id ? 'var(--text)' : 'var(--muted)',
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14,
            letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {loading || !ready ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: "'Barlow Condensed'", letterSpacing: '0.1em', fontSize: 16 }}>LOADING…</div>
      ) : error ? (
        <Empty>{error}</Empty>
      ) : !stats || !stats.hasDraft ? (
        <Empty>No draft yet for this season. Metrics appear once the draft is done.</Empty>
      ) : (
        <>
          {tab === 'race'    && <RaceTab s={stats} />}
          {tab === 'weekly'  && <WeeklyTab s={stats} />}
          {tab === 'teams'   && <TeamsTab s={stats} />}
          {tab === 'form'    && <FormTab s={stats} />}
          {tab === 'draft'   && <DraftTab s={stats} />}
          {tab === 'drivers' && <DriversTab s={stats} />}
        </>
      )}
    </div>
  )
}
