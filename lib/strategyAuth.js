// ============================================================
//  Draft Strategy Board — server-side access control
//
//  Two gates, both checked on the server for every request:
//    1. A valid Supabase Auth session (the existing admin login),
//       sent as "Authorization: Bearer <access_token>".
//    2. The strategy-board password, held only in the
//       STRATEGY_BOARD_PASSWORD environment variable. A correct entry
//       sets a signed, HttpOnly cookie bound to that admin user.
//  The password is never shipped to the browser or committed to git
//  (this repo is public).
// ============================================================
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const COOKIE_NAME = 'strategy_board'
const COOKIE_PATH = '/api/strategy'
const SESSION_SECONDS = 8 * 60 * 60

export function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

function boardPassword() {
  const p = process.env.STRATEGY_BOARD_PASSWORD
  return p && p.length >= 6 ? p : null
}

// Gate 1: is this request from a signed-in admin?
export async function getAdminUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { data, error } = await serverSupabase().auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export function passwordMatches(input) {
  const real = boardPassword()
  if (!real || typeof input !== 'string') return false
  // Hash both sides so lengths match and comparison is constant-time.
  const a = crypto.createHash('sha256').update(input).digest()
  const b = crypto.createHash('sha256').update(real).digest()
  return crypto.timingSafeEqual(a, b)
}

// The signing key is derived from the password itself, so changing the
// password in Vercel instantly invalidates every existing unlock cookie.
function sign(payload) {
  const key = crypto.createHash('sha256').update('strategy-board-v1|' + boardPassword()).digest()
  return crypto.createHmac('sha256', key).update(payload).digest('base64url')
}

function cookieAttrs(maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
}

export function setUnlockCookie(res, userId) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  const payload = `${userId}.${exp}`
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${payload}.${sign(payload)}${cookieAttrs(SESSION_SECONDS)}`)
}

export function clearUnlockCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${cookieAttrs(0)}`)
}

// Gate 2: does the request carry a valid unlock cookie for this user?
export function hasValidUnlock(req, userId) {
  if (!boardPassword()) return false
  const raw = (req.headers.cookie || '')
    .split(';').map(c => c.trim())
    .find(c => c.startsWith(COOKIE_NAME + '='))
  if (!raw) return false
  const value = raw.slice(COOKIE_NAME.length + 1)
  const parts = value.split('.')
  if (parts.length !== 3) return false
  const [uid, exp, sig] = parts
  if (uid !== userId) return false
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false
  const expected = sign(`${uid}.${exp}`)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function isConfigured() {
  return !!boardPassword()
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
}
