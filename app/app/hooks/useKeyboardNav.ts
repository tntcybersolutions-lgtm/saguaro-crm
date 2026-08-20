'use client'
import { useEffect } from 'react'

interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  description: string
  action: () => void
  disabled?: boolean
}

export function useKeyboardNav(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT','TEXTAREA','SELECT'].includes(target.tagName)) return
      if (target.contentEditable === 'true') return

      for (const shortcut of shortcuts) {
        if (shortcut.disabled) continue
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatch = !shortcut.ctrl || e.ctrlKey
        const metaMatch = !shortcut.meta || e.metaKey
        const shiftMatch = !shortcut.shift || e.shiftKey
        if (keyMatch && ctrlMatch && metaMatch && shiftMatch) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}
