import { useEffect, useRef, useState } from 'react'

// Line chart of each player's adjusted-points gap to the leader after
// every completed race. The leader sits on the 0 line at the top, so a
// line dropping away means falling behind.

const M = { top: 16, right: 96, bottom: 34, left: 52 }
const HEIGHT = 340

function useWidth(ref) {
  const [w, setW] = useState(800)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

function niceStep(max, target = 5) {
  const raw = Math.max(1, max) / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
}

export default function SeasonRaceChart({ series, players, colors }) {
  const wrapRef = useRef(null)
  const width = useWidth(wrapRef)
  const [hover, setHover] = useState(null) // index into series

  const n = series.length
  const ids = players.map(p => p.player_id)
  const name = id => players.find(p => p.player_id === id)?.player_name
  const maxGap = Math.max(1, ...series.flatMap(s => ids.map(id => s.gap[id])))
  const step = niceStep(maxGap)
  const yMax = Math.ceil(maxGap / step) * step
  const iw = width - M.left - M.right
  const ih = HEIGHT - M.top - M.bottom
  const x = i => M.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = v => M.top + (v / yMax) * ih

  const yTicks = []
  for (let v = 0; v <= yMax; v += step) yTicks.push(v)
  // Week labels: as dense as fits (≥ 52px apart), always first and last.
  const perWeek = n > 1 ? iw / (n - 1) : iw
  const xEvery = [1, 2, 5, 10, 20].find(k => perWeek * k >= 52) || 20
  const xTicks = series.map((s, i) => i).filter(i =>
    i === 0 || i === n - 1 || (series[i].week % xEvery === 0 && (n - 1 - i) * perWeek >= 52 && i * perWeek >= 52))

  // End labels: spread vertically so they never overlap.
  const last = series[n - 1]
  const ends = ids.map(id => ({ id, y: y(last.gap[id]) })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 16)
  const overflow = ends.length ? ends[ends.length - 1].y - (M.top + ih) : 0
  if (overflow > 0) ends.forEach(e => { e.y -= overflow })

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * width
    const i = n <= 1 ? 0 : Math.round(((px - M.left) / iw) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  const hs = hover != null ? series[hover] : null
  const tipLeft = hs ? x(hover) : 0
  const flip = tipLeft > width * 0.6

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width} height={HEIGHT} role="img"
        aria-label="Points behind the leader after each race, by player"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        onTouchStart={e => onMove(e.touches[0] ? { clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)}
        style={{ display: 'block', touchAction: 'pan-y' }}
      >
        {/* grid + y axis */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={M.left} x2={M.left + iw} y1={y(v)} y2={y(v)} stroke="#2a2a2a" strokeWidth="1" />
            <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#a0a0a0" fontFamily="Barlow, sans-serif">
              {v === 0 ? 'Leader' : `+${v.toLocaleString()}`}
            </text>
          </g>
        ))}
        {/* x axis */}
        {xTicks.map(i => (
          <text key={i} x={x(i)} y={HEIGHT - 12} textAnchor="middle" fontSize="12" fill="#a0a0a0" fontFamily="Barlow, sans-serif">
            Wk {series[i].week}
          </text>
        ))}

        {/* crosshair */}
        {hs && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} stroke="#666" strokeWidth="1" />}

        {/* lines */}
        {ids.map(id => (
          <polyline
            key={id}
            fill="none" stroke={colors[name(id)]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            points={series.map((s, i) => `${x(i)},${y(s.gap[id])}`).join(' ')}
          />
        ))}

        {/* hover dots */}
        {hs && ids.map(id => (
          <circle key={id} cx={x(hover)} cy={y(hs.gap[id])} r="5" fill={colors[name(id)]} stroke="#161616" strokeWidth="2" />
        ))}

        {/* end dots + direct labels */}
        {ids.map(id => (
          <circle key={id} cx={x(n - 1)} cy={y(last.gap[id])} r="4.5" fill={colors[name(id)]} stroke="#161616" strokeWidth="2" />
        ))}
        {ends.map(e => (
          <text key={e.id} x={x(n - 1) + 10} y={e.y + 4} fontSize="13" fontWeight="700" fill="#f5f5f5" fontFamily="'Barlow Condensed', sans-serif" style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {name(e.id)}
          </text>
        ))}
      </svg>

      {hs && (
        <div style={{
          position: 'absolute', top: 8, pointerEvents: 'none',
          left: flip ? undefined : tipLeft + 12, right: flip ? width - tipLeft + 12 : undefined,
          background: '#1f1f1f', border: '1px solid var(--border2)', borderRadius: 10,
          padding: '10px 12px', minWidth: 190, boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            After week {hs.week}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>{hs.race.race_name}</div>
          {hs.order.map(id => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '2px 0' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[name(id)], flexShrink: 0 }} />
              <span style={{ color: 'var(--muted)', width: 18 }}>{hs.pos[id]}.</span>
              <span style={{ color: 'var(--text)', flex: 1 }}>{name(id)}</span>
              <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{hs.cum[id].toLocaleString()}</span>
              <span style={{ color: 'var(--muted)', width: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {hs.gap[id] === 0 ? '—' : `+${hs.gap[id]}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
