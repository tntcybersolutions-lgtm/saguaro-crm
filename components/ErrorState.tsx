'use client'
import React from 'react'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Failed to load', message, onRetry }: ErrorStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '64px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'rgba(248,81,73,.1)',
        border: '1px solid rgba(248,81,73,.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        marginBottom: 16,
      }}>
        <span role="img" aria-label="warning">&#9888;&#65039;</span>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3', margin: '0 0 8px' }}>{title}</h3>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 20px', maxWidth: 320, lineHeight: 1.6 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#e6edf3',
            borderRadius: 8,
            padding: '10px 20px',
            fontSize: 14,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Try Again
        </button>
      )}
    </div>
  )
}
