'use client'
import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: '#F0B429',
        color: '#000',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 700,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      📡 You&apos;re offline — changes will sync when connection restores
    </div>
  )
}
