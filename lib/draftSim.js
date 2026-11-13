// ============================================================
//  Snake-draft simulation for the Draft Strategy Board.
//  Pure functions; runs in the browser on the projections the
//  server returns.
// ============================================================

// Which draft slot owns overall pick `pick` in an `n`-player snake draft.
export function slotForPick(pick, n) {
  const round = Math.ceil(pick / n)
  const pos = ((pick - 1) % n) + 1
  return round % 2 === 1 ? pos : n - pos + 1
}

// Plays out the rest of the draft. Opponents take the best "market rank"
// left (how this league is likely to draft); you take the best projection.
// If `forceFirst` is set, your first pick is that driver (null if an
// opponent would take him first). Returns your picks and theirs.
export function rollout({ drivers, takenKeys, currentPick, totalPicks, n, mySlot, forceFirst }) {
  const avail = drivers.filter(d => !takenKeys.has(d.key))
  const byProj = avail.slice().sort((a, b) => a.projPts - b.projPts)
  const byMarket = avail.slice().sort((a, b) => a.marketRank - b.marketRank)
  const gone = new Set()
  const mine = [], oppTaken = []
  let forced = false
  for (let p = currentPick; p <= totalPicks; p++) {
    const isMe = slotForPick(p, n) === mySlot
    let choice
    if (isMe && forceFirst && !forced) {
      forced = true
      if (gone.has(forceFirst)) return null
      choice = byProj.find(d => d.key === forceFirst)
    } else {
      choice = (isMe ? byProj : byMarket).find(d => !gone.has(d.key))
    }
    if (!choice) break
    gone.add(choice.key)
    if (isMe) mine.push({ pick: p, driver: choice })
    else oppTaken.push({ pick: p, driver: choice })
  }
  return { mine, oppTaken, total: mine.reduce((s, m) => s + m.driver.projPts, 0) }
}

// Recommendation for your next pick: tries every driver who should still be
// there, plays out the draft for each, and ranks them by the projected total
// of your whole remaining roster (lower = better).
export function recommend({ drivers, takenKeys, currentPick, totalPicks, n, mySlot, top = 6 }) {
  if (!mySlot || currentPick > totalPicks) return null
  const base = rollout({ drivers, takenKeys, currentPick, totalPicks, n, mySlot })
  if (!base || !base.mine.length) return null
  const myNext = base.mine[0].pick
  const goneBeforeMe = base.oppTaken.filter(o => o.pick < myNext).map(o => o.driver)
  const goneKeys = new Set(goneBeforeMe.map(d => d.key))
  const candidates = drivers
    .filter(d => !takenKeys.has(d.key) && !goneKeys.has(d.key))
    .map(d => ({ d, r: rollout({ drivers, takenKeys, currentPick, totalPicks, n, mySlot, forceFirst: d.key }) }))
    .filter(c => c.r)
    .sort((a, b) => a.r.total - b.r.total || a.d.projPts - b.d.projPts)
    .slice(0, top)
  const best = candidates[0]
  const second = best?.r.mine[1]
  const goneBetween = best
    ? best.r.oppTaken.filter(o => o.pick > myNext && (!second || o.pick < second.pick)).map(o => o.driver)
    : []
  return { myNext, goneBeforeMe, candidates, best, second, goneBetween, remaining: base.mine.length }
}
