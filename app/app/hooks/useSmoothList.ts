'use client'
import { useState, useEffect, useRef } from 'react'

interface SmoothItem<T> {
  data: T
  state: 'entering' | 'visible' | 'leaving'
  key: string
}

export function useSmoothList<T extends { id: string }>(
  items: T[] | null | undefined,
  animDurationMs = 250
) {
  const [smoothItems, setSmoothItems] = useState<SmoothItem<T>[]>([])
  const prevIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!items) return
    const currentIds = new Set(items.map(i => i.id))
    const newIds = items.filter(i => !prevIds.current.has(i.id)).map(i => i.id)
    const removedIds = [...prevIds.current].filter(id => !currentIds.has(id))

    setSmoothItems(prev => {
      const withLeaving = prev.map(si =>
        removedIds.includes(si.key)
          ? { ...si, state: 'leaving' as const }
          : si
      )
      const withNew = [
        ...withLeaving,
        ...items
          .filter(i => newIds.includes(i.id))
          .map(i => ({ data: i, state: 'entering' as const, key: i.id }))
      ]
      return withNew.map(si => {
        const fresh = items.find(i => i.id === si.key)
        return fresh && si.state !== 'leaving'
          ? { ...si, data: fresh, state: 'visible' as const }
          : si
      })
    })

    prevIds.current = currentIds

    if (newIds.length > 0) {
      setTimeout(() => {
        setSmoothItems(prev => prev.map(si =>
          si.state === 'entering' ? { ...si, state: 'visible' } : si
        ))
      }, 16)
    }

    if (removedIds.length > 0) {
      setTimeout(() => {
        setSmoothItems(prev => prev.filter(si => si.state !== 'leaving'))
      }, animDurationMs)
    }
  }, [items, animDurationMs])

  const getItemStyle = (state: SmoothItem<T>['state']): React.CSSProperties => ({
    opacity: state === 'entering' ? 0 : state === 'leaving' ? 0 : 1,
    transform: state === 'entering'
      ? 'translateY(-8px) scale(0.98)'
      : state === 'leaving'
      ? 'translateY(8px) scale(0.98)'
      : 'none',
    transition: `opacity ${animDurationMs}ms ease, transform ${animDurationMs}ms ease`,
    pointerEvents: state === 'leaving' ? 'none' : 'auto',
    overflow: state === 'leaving' ? 'hidden' : 'visible',
    maxHeight: state === 'leaving' ? '0' : '500px',
  })

  return { smoothItems, getItemStyle }
}
