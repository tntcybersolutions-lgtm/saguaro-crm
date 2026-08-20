'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface TrialInfo {
  plan: string
  days_remaining: number | null
  project_count: number
  jacket_count: number
}

const GOLD = '#d4a017'
const RED = '#f85149'
const DIM = '#8b949e'

export function TrialBanner() {
  const pathname = usePathname()
  const [info, setInfo] = useState<TrialInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check sessionStorage for cached data
    const cached = sessionStorage.getItem('saguaro-trial-info')
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (Date.now() - parsed._ts < 300_000) { // 5 min cache
          setInfo(parsed)
          return
        }
      } catch { /* refetch */ }
    }

    fetch('/api/tenant/summary')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data) return
        const d = json.data
        const trialInfo: TrialInfo = {
          plan: d.tenant.plan,
          days_remaining: d.tenant.days_remaining,
          project_count: d.project_count || 0,
          jacket_count: d.jacket_count || 0,
        }
        setInfo(trialInfo)
        sessionStorage.setItem('saguaro-trial-info', JSON.stringify({ ...trialInfo, _ts: Date.now() }))
      })
      .catch(() => { /* silent */ })
  }, [])

  // Check dismissal from sessionStorage
  useEffect(() => {
    const dismissedAt = sessionStorage.getItem('saguaro-trial-dismissed')
    if (dismissedAt) {
      const ts = Number(dismissedAt)
      // Re-show after 24 hours
      if (Date.now() - ts < 86_400_000) {
        setDismissed(true)
      }
    }
  }, [])

  // Don't show on certain pages
  if (pathname?.startsWith('/upgrade') || pathname?.startsWith('/login') || pathname?.startsWith('/signup')) {
    return null
  }

  // Don't show if not trial or no data
  if (!info || info.plan !== 'trial' || info.days_remaining === null) return null
  if (dismissed) return null

  const days = info.days_remaining

  // Hidden when > 14 days
  if (days > 14) return null

  const handleDismiss = () => {
    setDismissed(true)
    sessionStorage.setItem('saguaro-trial-dismissed', String(Date.now()))
  }

  const workText = [
    info.project_count > 0 ? `${info.project_count} project${info.project_count !== 1 ? 's' : ''}` : null,
    info.jacket_count > 0 ? `${info.jacket_count} bid package${info.jacket_count !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' and ')

  // 1-3 days: urgent red
  if (days <= 3) {
    return (
      <div style={{
        background: '#1a0808', borderBottom: `1px solid ${RED}`,
        padding: '10px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, fontSize: 13,
      }}>
        <div style={{ color: RED, fontWeight: 600 }}>
          Trial ends in {days} day{days !== 1 ? 's' : ''}. All your work will be locked.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Link href="/upgrade" style={{
            background: RED, color: '#fff', padding: '6px 16px',
            borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}>
            {workText ? `Keep my ${workText} — Upgrade Now` : 'Upgrade Now'}
          </Link>
          <button onClick={handleDismiss} style={{
            background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16, padding: 0,
          }}>
            ×
          </button>
        </div>
      </div>
    )
  }

  // 4-7 days: amber warning
  if (days <= 7) {
    return (
      <div style={{
        background: '#1a1000', borderBottom: `1px solid ${GOLD}`,
        padding: '10px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, fontSize: 13,
      }}>
        <div style={{ color: '#e6edf3' }}>
          <span style={{ marginRight: 6 }}>⚠️</span>
          Trial ends in {days} days
          {workText ? ` — Your ${workText} are saved.` : '.'}
          {' '}Upgrade now to keep access.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Link href="/upgrade" style={{
            background: GOLD, color: '#0d1117', padding: '6px 16px',
            borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}>
            Upgrade — $399/mo
          </Link>
          <button onClick={handleDismiss} style={{
            background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16, padding: 0,
          }}>
            ×
          </button>
        </div>
      </div>
    )
  }

  // 8-14 days: subtle reminder
  return (
    <div style={{
      background: '#161b22', borderBottom: '1px solid #30363d',
      padding: '8px 24px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 16, fontSize: 13,
    }}>
      <div style={{ color: DIM }}>
        Your trial ends in {days} days
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Link href="/upgrade" style={{
          color: GOLD, fontSize: 12, fontWeight: 600, textDecoration: 'none',
        }}>
          Upgrade to keep your work →
        </Link>
        <button onClick={handleDismiss} style={{
          background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16, padding: 0,
        }}>
          ×
        </button>
      </div>
    </div>
  )
}
