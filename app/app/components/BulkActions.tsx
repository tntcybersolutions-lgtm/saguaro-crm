'use client'
import { useState } from 'react'

interface BulkAction {
  id: string
  label: string
  icon: string
  color?: 'gold' | 'green' | 'red' | 'blue' | 'purple'
  confirm?: string
  requiresInput?: {
    label: string
    placeholder: string
    type: 'text' | 'select'
    options?: Array<{ value: string; label: string }>
  }
}

interface BulkActionsProps {
  selectedIds: string[]
  totalCount: number
  actions: BulkAction[]
  onAction: (actionId: string, selectedIds: string[], inputValue?: string) => Promise<void>
  onClearSelection: () => void
  itemLabel?: string
}

export function BulkActions({
  selectedIds, totalCount, actions, onAction,
  onClearSelection, itemLabel = 'item',
}: BulkActionsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [inputAction, setInputAction] = useState<BulkAction | null>(null)
  const [inputValue, setInputValue] = useState('')

  if (selectedIds.length === 0) return null

  const handleAction = async (action: BulkAction) => {
    if (action.requiresInput) {
      setInputAction(action)
      setInputValue('')
      return
    }
    if (action.confirm) {
      if (!confirm(action.confirm.replace('{count}', String(selectedIds.length)))) return
    }
    setLoading(action.id)
    try {
      await onAction(action.id, selectedIds)
    } finally {
      setLoading(null)
    }
  }

  const handleInputConfirm = async () => {
    if (!inputAction || !inputValue.trim()) return
    setLoading(inputAction.id)
    setInputAction(null)
    try {
      await onAction(inputAction.id, selectedIds, inputValue)
    } finally {
      setLoading(null)
      setInputValue('')
    }
  }

  const colorMap = {
    gold:   { bg: 'rgba(212,160,23,0.1)',  border: 'rgba(212,160,23,0.3)',  text: '#d4a017' },
    green:  { bg: 'rgba(46,160,67,0.1)',   border: 'rgba(46,160,67,0.3)',   text: '#2ea043' },
    red:    { bg: 'rgba(248,81,73,0.1)',   border: 'rgba(248,81,73,0.3)',   text: '#f85149' },
    blue:   { bg: 'rgba(56,139,253,0.1)',  border: 'rgba(56,139,253,0.3)',  text: '#388bfd' },
    purple: { bg: 'rgba(163,113,247,0.1)', border: 'rgba(163,113,247,0.3)', text: '#a371f7' },
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 80, left: '50%',
        transform: 'translateX(-50%)',
        background: '#1c2128',
        border: '1px solid #444c56',
        borderRadius: 12, padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        zIndex: 500,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        animation: 'slideUp 0.2s ease',
        whiteSpace: 'nowrap',
      }}>
        <div style={{
          background: '#d4a017', color: '#0d1117',
          borderRadius: 6, padding: '4px 10px',
          fontSize: 12, fontWeight: 800,
          minWidth: 28, textAlign: 'center',
        }}>
          {selectedIds.length}
        </div>
        <span style={{ fontSize: 12, color: '#8b949e' }}>
          {itemLabel}{selectedIds.length !== 1 ? 's' : ''} selected
        </span>

        <div style={{ width: 1, height: 20, background: '#30363d' }} />

        {actions.map(action => {
          const c = colorMap[action.color || 'gold']
          return (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={!!loading}
              style={{
                background: loading === action.id ? 'rgba(255,255,255,0.05)' : c.bg,
                border: `1px solid ${c.border}`,
                color: loading === action.id ? '#484f58' : c.text,
                borderRadius: 6, padding: '6px 14px',
                fontSize: 12, fontWeight: 600,
                cursor: loading === action.id ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s ease',
              }}>
              <span style={{
                display: 'inline-block',
                animation: loading === action.id ? 'rotateRing 1s linear infinite' : 'none',
              }}>
                {loading === action.id ? '\u27F3' : action.icon}
              </span>
              {action.label}
            </button>
          )
        })}

        <div style={{ width: 1, height: 20, background: '#30363d' }} />

        <button
          onClick={onClearSelection}
          style={{
            background: 'transparent', border: 'none',
            color: '#6e7681', cursor: 'pointer',
            fontSize: 16, padding: '0 4px',
          }}>
          \u00d7
        </button>
      </div>

      {inputAction && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 600, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: 12, padding: 24,
            width: 400,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3', marginBottom: 16 }}>
              {inputAction.icon} {inputAction.label} &mdash; {selectedIds.length} {itemLabel}s
            </div>
            <label style={{ fontSize: 11, color: '#8b949e', display: 'block', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {inputAction.requiresInput?.label}
            </label>
            {inputAction.requiresInput?.type === 'select' ? (
              <select
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                style={{
                  width: '100%', marginBottom: 16, padding: '8px 12px',
                  background: '#0d1117', border: '1px solid #30363d',
                  borderRadius: 6, color: '#e6edf3', fontSize: 13,
                }}>
                <option value="">Select...</option>
                {inputAction.requiresInput.options?.map(opt => (
                  <option key={opt.value} value={opt.value}
                    style={{ background: '#1c2128' }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus
                placeholder={inputAction.requiresInput?.placeholder}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInputConfirm()}
                style={{
                  width: '100%', marginBottom: 16, padding: '8px 12px',
                  background: '#0d1117', border: '1px solid #30363d',
                  borderRadius: 6, color: '#e6edf3', fontSize: 13,
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleInputConfirm}
                disabled={!inputValue.trim()}
                style={{
                  background: '#d4a017', color: '#0d1117',
                  border: 'none', borderRadius: 7,
                  padding: '9px 20px', fontSize: 13,
                  fontWeight: 700, cursor: 'pointer',
                  opacity: inputValue.trim() ? 1 : 0.5,
                }}>
                Apply to {selectedIds.length} {itemLabel}s
              </button>
              <button onClick={() => { setInputAction(null); setInputValue('') }}
                style={{
                  background: 'transparent', border: '1px solid #30363d',
                  color: '#8b949e', borderRadius: 7,
                  padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
