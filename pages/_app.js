import '../styles/globals.css'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { SeasonProvider, SeasonTiles } from '../lib/season'

const NAV = [
  { href: '/',         label: 'Standings',     icon: '🏆' },
  { href: '/metrics',  label: 'Metrics',       icon: '📈' },
  { href: '/detail',   label: 'Weekly Detail', icon: '📋' },
  { href: '/schedule', label: 'Schedule',      icon: '🗓️' },
  { href: '/draft',    label: 'Draft',         icon: '🚗' },
  { href: '/admin',    label: 'Admin',         icon: '⚙️'  },
]

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const showSeason = !router.pathname.startsWith('/admin')
  return (
    <SeasonProvider>
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Head>
        <title>NASCAR-x Fantasy</title>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏁</text></svg>" />
      </Head>

      {/* Top nav */}
      <nav style={{
        background: '#111111',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        {/* Racing stripe across very top */}
        <div className="racing-bar" />

        <div className="nav-bar" style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 58,
        }}>
          {/* Logo */}
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏁</span>
            <span className="hide-mobile" style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 24,
              letterSpacing: '0.08em',
              color: '#f5f5f5',
            }}>
              NASCAR <span style={{ color: '#cccccc' }}>Fantasy</span>
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Nav links */}
          <div style={{ display: 'flex', gap: 4 }}>
            {NAV.map(n => {
              const active = router.pathname === n.href
              return (
                <Link key={n.href} href={n.href} title={n.label} aria-label={n.label} className="nav-link" style={{
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: active ? '#f5f5f5' : '#888888',
                  background: active ? '#2e2e2e' : 'transparent',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 13 }}>{n.icon}</span>
                  <span className="nav-label">{n.label}</span>
                </Link>
              )
            })}
          </div>
          </div>
        </div>

        {/* Season bar */}
        {showSeason && (
          <div style={{ borderTop: '1px solid #1f1f1f', background: '#0d0d0d' }}>
            <div className="nav-bar" style={{ maxWidth: 1100, margin: '0 auto', padding: '7px 20px', display: 'flex', justifyContent: 'flex-end' }}>
              <SeasonTiles />
            </div>
          </div>
        )}
      </nav>

      {/* Page content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
        <Component {...pageProps} />
      </main>

      <style>{`
        @media (max-width: 640px) { .hide-mobile { display: none; } }
        @media (max-width: 960px) { .nav-label { display: none; } }
        @media (max-width: 640px) { .nav-link { padding: 6px 7px !important; } .nav-bar { padding: 0 12px !important; } }
      `}</style>
    </div>
    </SeasonProvider>
  )
}
