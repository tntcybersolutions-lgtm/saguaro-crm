'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

type InlineEditType = 'text' | 'number' | 'currency' | 'date' | 'select' | 'textarea'

interface InlineEditOption {
  value: string
  label: string
}

interface InlineEditProps {
  value: string | number | null
  type?: InlineEditType
  options?: InlineEditOption[]
  placeholder?: string
  onSave: (newValue: string | number) => Promise<void> | void
  formatDisplay?: (v: string | number | null) => string
  disabled?: boolean
  emptyText?: string
  prefix?: string
  suffix?: string
}

export function InlineEdit({
  value, type = 'text', options = [], placeholder = 'Click to edit',
  onSave, formatDisplay, disabled = false,
  emptyText = 'Click to edit', prefix, suffix,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  const displayValue = formatDisplay
    ? formatDisplay(value)
    : value != null && value !== ''
    ? (type === 'currency'
        ? '$' + Number(value).toLocaleString()
        : String(value))
    : null

  const startEdit = () => {
    if (disabled || saving) return
    setEditing(true)
    setLocalValue(value != null ? String(value) : '')
    setError(null)
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select()
      }
    }
  }, [editing])

  const handleSave = useCallback(async () => {
    if (!editing) return
    const trimmed = localValue.trim()

    if (type === 'number' || type === 'currency') {
      const n = parseFloat(trimmed.replace(/[^0-9.-]/g, ''))
      if (isNaN(n)) { setError('Enter a valid number'); return }
    }

    const normalizedNew = type === 'currency' || type === 'number'
      ? parseFloat(trimmed.replace(/[^0-9.-]/g, ''))
      : trimmed
    const normalizedOld = type === 'currency' || type === 'number'
      ? parseFloat(String(value || 0))
      : String(value || '')
    if (String(normalizedNew) === String(normalizedOld)) {
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      await onSave(normalizedNew)
      setEditing(false)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [editing, localValue, type, value, onSave])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      setEditing(false)
      setLocalValue('')
      setError(null)
    }
    if (e.key === 'Tab') {
      handleSave()
    }
  }

  if (editing) {
    const inputStyle: React.CSSProperties = {
      background: '#0d1117',
      border: '2px solid #388bfd',
      borderRadius: 5,
      color: '#e6edf3',
      fontSize: 13,
      padding: '4px 8px',
      fontFamily: 'inherit',
      outline: 'none',
      width: '100%',
      boxShadow: '0 0 0 3px rgba(56,139,253,0.1)',
    }

    const sharedProps = {
      ref: inputRef as React.Ref<never>,
      value: localValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setLocalValue(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: handleSave,
      disabled: saving,
      style: inputStyle,
    }

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        {prefix && (
          <span style={{
            position: 'absolute', left: 8, top: '50%',
            transform: 'translateY(-50%)', color: '#8b949e', fontSize: 12,
            zIndex: 1, pointerEvents: 'none',
          }}>{prefix}</span>
        )}
        {type === 'select' ? (
          <select {...sharedProps} style={{
            ...inputStyle,
            paddingLeft: prefix ? 20 : 8,
          }}>
            {options.map(opt => (
              <option key={opt.value} value={opt.value}
                style={{ background: '#1c2128', color: '#e6edf3' }}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea {...(sharedProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
          />
        ) : (
          <input
            {...(sharedProps as React.InputHTMLAttributes<HTMLInputElement>)}
            type={type === 'date' ? 'date' : 'text'}
            placeholder={placeholder}
            style={{
              ...inputStyle,
              paddingLeft: prefix ? 20 : 8,
              paddingRight: suffix ? 32 : 8,
            }}
          />
        )}
        {suffix && (
          <span style={{
            position: 'absolute', right: 8, top: '50%',
            transform: 'translateY(-50%)', color: '#8b949e', fontSize: 11,
          }}>{suffix}</span>
        )}
        {saving && (
          <span style={{
            position: 'absolute', right: suffix ? 48 : 8, top: '50%',
            transform: 'translateY(-50%)', fontSize: 11, color: '#388bfd',
          }}>saving...</span>
        )}
        {error && (
          <div style={{
            position: 'absolute', top: '100%', left: 0,
            background: '#1a0808', border: '1px solid #f85149',
            borderRadius: 4, padding: '3px 8px',
            fontSize: 11, color: '#f85149', zIndex: 10,
            whiteSpace: 'nowrap',
          }}>{error}</div>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={startEdit}
      title={disabled ? undefined : 'Click to edit'}
      className={!disabled ? 'inline-edit-hover' : undefined}
      style={{
        cursor: disabled ? 'default' : 'text',
        padding: '3px 6px',
        borderRadius: 4,
        border: '1px solid transparent',
        transition: 'all 0.15s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 40,
      }}
    >
      {displayValue ? (
        <span style={{ fontSize: 13, color: '#e6edf3' }}>
          {prefix && <span style={{ color: '#8b949e' }}>{prefix}</span>}
          {displayValue}
          {suffix && <span style={{ color: '#8b949e' }}> {suffix}</span>}
        </span>
      ) : (
        <span style={{ fontSize: 12, color: '#484f58', fontStyle: 'italic' }}>
          {emptyText}
        </span>
      )}
      {!disabled && (
        <span style={{ fontSize: 10, color: '#484f58', opacity: 0.6 }}>&#9998;</span>
      )}
    </div>
  )
}
