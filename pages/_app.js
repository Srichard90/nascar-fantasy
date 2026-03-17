import '../styles/globals.css'
import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV = [
  { href: '/',        label: 'Standings', icon: '🏆' },
  { href: '/draft',   label: 'Draft',     icon: '🚗' },
  { href: '/results', label: 'Results',   icon: '📊' },
  { href: '/admin',   label: 'Admin',     icon: '⚙️'  },
]

export default function App({ Component, pageProps }) {
  const router = useRouter()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Top nav */}
      <nav style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        {/* Racing stripe across very top */}
        <div className="racing-bar" />

        <div style={{
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
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 24,
              letterSpacing: '0.08em',
              color: 'var(--text)',
            }}>
              NASCAR <span style={{ color: 'var(--red)' }}>Fantasy</span>
            </span>
          </Link>

          {/* Nav links */}
          <div style={{ display: 'flex', gap: 4 }}>
            {NAV.map(n => {
              const active = router.pathname === n.href
              return (
                <Link key={n.href} href={n.href} style={{
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
                  color: active ? '#fff' : 'var(--muted)',
                  background: active ? 'var(--red)' : 'transparent',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 13 }}>{n.icon}</span>
                  <span className="hide-mobile">{n.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
        <Component {...pageProps} />
      </main>

      <style>{`
        @media (max-width: 500px) { .hide-mobile { display: none; } }
      `}</style>
    </div>
  )
}
