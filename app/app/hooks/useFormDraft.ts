'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface UseFormDraftOptions<T> {
  key: string
  initialValues: T
  debounceMs?: number
  onRestore?: (values: T) => void
}

interface UseFormDraftReturn<T> {
  values: T
  setValues: (update: Partial<T> | ((prev: T) => T)) => void
  setField: (field: keyof T, value: T[keyof T]) => void
  clearDraft: () => void
  hasDraft: boolean
  isDirty: boolean
  lastSaved: Date | null
}

export function useFormDraft<T extends Record<string, unknown>>({
  key,
  initialValues,
  debounceMs = 800,
  onRestore,
}: UseFormDraftOptions<T>): UseFormDraftReturn<T> {
  const [values, setValuesState] = useState<T>(initialValues)
  const [hasDraft, setHasDraft] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)
  const isInitialized = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(`saguaro-draft-${key}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.__savedAt && Date.now() - parsed.__savedAt < 86400000) {
          const { __savedAt: _, ...draftValues } = parsed
          setValuesState({ ...initialValues, ...(draftValues as Partial<T>) })
          setHasDraft(true)
          onRestore?.({ ...initialValues, ...(draftValues as Partial<T>) })
        } else {
          localStorage.removeItem(`saguaro-draft-${key}`)
        }
      }
    } catch { /* ignore parse errors */ }
    isInitialized.current = true
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveDraft = useCallback((vals: T) => {
    if (!isInitialized.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(`saguaro-draft-${key}`, JSON.stringify({
          ...vals,
          __savedAt: Date.now(),
        }))
        setLastSaved(new Date())
      } catch { /* storage full */ }
    }, debounceMs)
  }, [key, debounceMs])

  const setValues = useCallback((update: Partial<T> | ((prev: T) => T)) => {
    setValuesState(prev => {
      const next = typeof update === 'function'
        ? update(prev) : { ...prev, ...update }
      setIsDirty(true)
      saveDraft(next)
      return next
    })
  }, [saveDraft])

  const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues({ [field]: value } as unknown as Partial<T>)
  }, [setValues])

  const clearDraft = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`saguaro-draft-${key}`)
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setValuesState(initialValues)
    setHasDraft(false)
    setIsDirty(false)
    setLastSaved(null)
  }, [key, initialValues])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  return { values, setValues, setField, clearDraft, hasDraft, isDirty, lastSaved }
}
