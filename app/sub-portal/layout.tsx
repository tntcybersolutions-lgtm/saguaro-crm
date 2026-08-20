'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const C = {
  bg: '#0f0f1a',
  card: '#16213e',
  border: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  dim: '#888888',
  gold: '#D4A017',
}

const NAV = [
  { href: '/sub-portal/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/sub-portal/pay-apps', label: 'Pay Apps', icon: '💰' },
  { href: '/sub-portal/rfis', label: 'RFIs', icon: '❓' },
]

export default function SubPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    // Skip auth check on the login page itself
    if (pathname === '/sub-portal/login') return
    const supabase = getSupabaseBrowser()
    supabase.auth.getUser().then(res => {
      if (!res.data.user) {
        router.replace('/sub-portal/login')
      } else {
        setEmail(res.data.user.email || null)
      }
    })
  }, [pathname, router])

  async function onSignOut() {
    const supabase = getSupabaseBrowser()
    await supabase.auth.signOut()
    router.replace('/sub-portal/login')
  }

  // Login page gets no chrome
  if (pathname === '/sub-portal/login') return <>{children}</>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>🔧 Subcontractor Portal</div>
          <nav style={{ display: 'flex', gap: 4 }}>
            {NAV.map(n => {
              const active = pathname.startsWith(n.href)
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  style={{
                    padding: '6px 12px', borderRadius: 6, textDecoration: 'none',
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    color: active ? C.gold : C.dim,
                    background: active ? 'rgba(212,160,23,0.12)' : 'transparent',
                  }}
                >
                  <span style={{ marginRight: 4 }}>{n.icon}</span>{n.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {email && <span style={{ color: C.dim, fontSize: 12 }}>{email}</span>}
          <button
            onClick={onSignOut}
            style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
