import '../styles/globals.css'
import Link from 'next/link'
import { useRouter } from 'next/router'

function Navbar() {
  const router = useRouter()
  const links = [
    { href: '/',        label: '🏆 Standings' },
    { href: '/draft',   label: '🚗 Draft Room' },
    { href: '/results', label: '📊 Results'    },
    { href: '/admin',   label: '⚙️ Admin'      },
  ]
  return (
    <nav className="bg-red-700 shadow-lg">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <Link href="/" className="text-yellow-400 font-extrabold text-xl tracking-wider">
          🏁 NASCAR Fantasy
        </Link>
        <div className="flex gap-1 flex-wrap">
          {links.map(l => (
            <Link key={l.href} href={l.href}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                router.pathname === l.href
                  ? 'bg-yellow-400 text-red-900'
                  : 'text-white hover:bg-red-600'
              }`}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default function App({ Component, pageProps }) {
  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Component {...pageProps} />
      </main>
    </div>
  )
}
