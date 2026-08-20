'use client'
import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setShow(true), 30000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDeferredPrompt(null)
  }

  if (!show || !deferredPrompt) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: '#16213e', border: '1px solid rgba(212,160,23,0.4)',
      borderRadius: 12, padding: '14px 20px', zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      maxWidth: 360, width: 'calc(100% - 40px)',
    }}>
      <div style={{ fontSize: 28 }}>📱</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Add to Home Screen</div>
        <div style={{ fontSize: 11, color: '#666' }}>Install Saguaro for faster access in the field</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setShow(false)}
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        <button onClick={install}
          style={{ background: '#D4A017', color: '#000', border: 'none', borderRadius: 7, padding: '6px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
          Install
        </button>
      </div>
    </div>
  )
}
