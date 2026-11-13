import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

// ============================================================
//  Shared season selection
//
//  One season choice for the whole public site. The selector in
//  the nav bar sets it; Standings, Metrics, Weekly Detail,
//  Schedule and Draft all read it. The choice is kept for the
//  browser tab (sessionStorage), so a fresh visit starts on the
//  active season again.
// ============================================================

const STORAGE_KEY = 'nascarx.seasonId'
const SeasonContext = createContext(null)

function readStored() {
  try { return parseInt(window.sessionStorage.getItem(STORAGE_KEY), 10) || null } catch { return null }
}
function writeStored(id) {
  try { window.sessionStorage.setItem(STORAGE_KEY, String(id)) } catch { /* storage blocked: selection just isn't remembered */ }
}

export function SeasonProvider({ children }) {
  const [seasons,  setSeasons]  = useState([])
  const [seasonId, setSeasonIdState] = useState(null)
  const [ready,    setReady]    = useState(false)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('seasons').select('*').order('season_year', { ascending: false })
    const list = data || []
    setSeasons(list)
    setSeasonIdState(prev => {
      const want = prev ?? readStored()
      if (want && list.some(s => s.season_id === want)) return want
      return (list.find(s => s.is_active) || list[0])?.season_id ?? null
    })
    setReady(true)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const setSeasonId = useCallback(id => {
    setSeasonIdState(id)
    writeStored(id)
  }, [])

  const season       = seasons.find(s => s.season_id === seasonId) || null
  const activeSeason = seasons.find(s => s.is_active) || null

  return (
    <SeasonContext.Provider value={{
      seasons, seasonId, setSeasonId, season, activeSeason,
      isActiveSeason: !!season && season.season_id === activeSeason?.season_id,
      ready, refresh,
    }}>
      {children}
    </SeasonContext.Provider>
  )
}

export function useSeason() {
  const ctx = useContext(SeasonContext)
  if (!ctx) throw new Error('useSeason must be used inside <SeasonProvider>')
  return ctx
}

// Season tiles for the bar under the nav. Shows at most MAX_VISIBLE at a
// time (newest first); arrows scroll through the rest, and the selected
// season is always kept in view.
const MAX_VISIBLE = 5

export function SeasonTiles() {
  const { seasons, seasonId, setSeasonId } = useSeason()
  const [start, setStart] = useState(0)
  const n = seasons.length
  const maxStart = Math.max(0, n - MAX_VISIBLE)

  useEffect(() => {
    const i = seasons.findIndex(s => s.season_id === seasonId)
    if (i < 0) return
    setStart(st => (i < st ? i : i >= st + MAX_VISIBLE ? i - MAX_VISIBLE + 1 : Math.min(st, maxStart)))
  }, [seasonId, seasons, maxStart])

  if (!n) return null
  const visible = seasons.slice(start, start + MAX_VISIBLE)
  const scrolls = n > MAX_VISIBLE

  const arrow = (dir, disabled) => (
    <button
      type="button" aria-label={dir < 0 ? 'Newer seasons' : 'Older seasons'} title={dir < 0 ? 'Newer seasons' : 'Older seasons'}
      disabled={disabled}
      onClick={() => setStart(st => Math.min(maxStart, Math.max(0, st + dir)))}
      style={{
        width: 28, height: 30, borderRadius: 7, border: '1px solid var(--border2)', background: 'transparent',
        color: disabled ? '#444' : '#f5f5f5', cursor: disabled ? 'default' : 'pointer', fontSize: 16, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >{dir < 0 ? '‹' : '›'}</button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} role="group" aria-label="Season">
      <span className="hide-mobile" style={{
        fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888888', marginRight: 4,
      }}>Season</span>
      {scrolls && arrow(-1, start === 0)}
      {visible.map(s => {
        const on = s.season_id === seasonId
        return (
          <button key={s.season_id} type="button" aria-pressed={on} onClick={() => setSeasonId(s.season_id)} style={{
            padding: '5px 10px', borderRadius: 7, minWidth: 54, flexShrink: 0,
            border: `2px solid ${on ? 'var(--red)' : 'var(--border2)'}`,
            background: on ? 'rgba(232,25,44,0.14)' : 'transparent',
            color: on ? '#f5f5f5' : '#a0a0a0', cursor: 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '0.05em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.15s',
          }}>
            {s.season_year}
            {s.is_active && <span title="Current season" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />}
          </button>
        )
      })}
      {scrolls && arrow(1, start >= maxStart)}
    </div>
  )
}
