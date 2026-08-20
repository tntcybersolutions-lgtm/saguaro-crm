'use client'
import { useState, useEffect, useCallback } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration?: number
}

function dispatchToast(message: string, type: ToastType = 'success', duration = 4000) {
  if (typeof window === 'undefined') return
  const id = Math.random().toString(36).slice(2)
  window.dispatchEvent(new CustomEvent('saguaro-toast', {
    detail: { id, type, message, duration }
  }))
}

export const toast = {
  success: (msg: string) => dispatchToast(msg, 'success'),
  error:   (msg: string) => dispatchToast(msg, 'error', 6000),
  info:    (msg: string) => dispatchToast(msg, 'info'),
  warning: (msg: string) => dispatchToast(msg, 'warning', 5000),
}

export function useToast() {
  const show = useCallback((message: string, type: ToastType = 'success', duration = 4000) => {
    dispatchToast(message, type, duration)
  }, [])

  return {
    success: (msg: string) => show(msg, 'success'),
    error:   (msg: string) => show(msg, 'error', 6000),
    info:    (msg: string) => show(msg, 'info'),
    warning: (msg: string) => show(msg, 'warning', 5000),
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const toast = (e as CustomEvent).detail as ToastItem
      setToasts(prev => [...prev, toast])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id))
      }, toast.duration || 4000)
    }
    window.addEventListener('saguaro-toast', handler)
    return () => window.removeEventListener('saguaro-toast', handler)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <div key={toast.id} style={{
          background:
            toast.type === 'success' ? '#0d2818' :
            toast.type === 'error'   ? '#1a0808' :
            toast.type === 'warning' ? '#1a1000' :
                                       '#0d1b2a',
          border: `1px solid ${
            toast.type === 'success' ? '#2ea043' :
            toast.type === 'error'   ? '#f85149' :
            toast.type === 'warning' ? '#d4a017' :
                                       '#388bfd'
          }`,
          color: '#e6edf3',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 14,
          maxWidth: 360,
          pointerEvents: 'auto',
          animation: 'toastIn 0.3s ease',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>
            {toast.type === 'success' ? '✅' :
             toast.type === 'error'   ? '❌' :
             toast.type === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          {toast.message}
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
