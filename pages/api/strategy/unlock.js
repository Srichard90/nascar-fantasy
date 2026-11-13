import {
  getAdminUser, passwordMatches, setUnlockCookie, clearUnlockCookie, isConfigured, noStore,
} from '../../../lib/strategyAuth'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// POST { password }  → unlock (requires admin login)
// DELETE             → lock again
export default async function handler(req, res) {
  noStore(res)

  if (req.method === 'DELETE') {
    clearUnlockCookie(res)
    return res.status(200).json({ ok: true })
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Strategy board password is not configured on the server (STRATEGY_BOARD_PASSWORD).' })
  }

  const user = await getAdminUser(req)
  if (!user) return res.status(401).json({ error: 'Admin login required.', code: 'login' })

  if (!passwordMatches(req.body?.password)) {
    await sleep(800) // slow down guessing
    return res.status(403).json({ error: 'Incorrect password.' })
  }

  setUnlockCookie(res, user.id)
  return res.status(200).json({ ok: true })
}
