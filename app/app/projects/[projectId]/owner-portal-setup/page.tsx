'use client'
import { useState, useEffect, useCallback } from 'react'
import { IntelligenceIndicator } from '@/app/app/components/IntelligenceIndicator'
import { statusBar } from '@/app/app/components/StatusBar'
import { useToast } from '@/app/app/components/Toast'

interface PortalSettings {
  id: string | null
  token: string | null
  is_active: boolean
  show_budget: boolean
  show_schedule: boolean
  show_daily_logs: boolean
  show_photos: boolean
  show_rfis: boolean
  show_submittals: boolean
  show_pay_apps: boolean
  show_weather: boolean
  custom_message: string
  branding_name: string
  access_count: number
  last_accessed_at: string | null
  expires_at: string | null
}

const DEFAULT: PortalSettings = {
  id: null, token: null, is_active: true,
  show_budget: true, show_schedule: true, show_daily_logs: true,
  show_photos: true, show_rfis: false, show_submittals: false,
  show_pay_apps: true, show_weather: true,
  custom_message: '', branding_name: '',
  access_count: 0, last_accessed_at: null, expires_at: null,
}

const VISIBILITY_OPTIONS = [
  { key: 'show_budget' as const,     label: 'Budget & Financial Status',
    desc: 'Contract value, billed %, payments received', icon: '💰',
    recommended: true },
  { key: 'show_schedule' as const,   label: 'Schedule & Milestones',
    desc: 'Upcoming milestones, completion %', icon: '📅',
    recommended: true },
  { key: 'show_daily_logs' as const, label: 'Daily Activity Summary',
    desc: 'Recent daily log summaries (no costs shown)', icon: '📋',
    recommended: true },
  { key: 'show_photos' as const,     label: 'Site Photos',
    desc: 'Featured photos from daily logs', icon: '📸',
    recommended: true },
  { key: 'show_pay_apps' as const,   label: 'Pay Application Status',
    desc: 'Current pay app amount and status', icon: '📄',
    recommended: true },
  { key: 'show_weather' as const,    label: 'Weather Conditions',
    desc: 'Today\'s weather at the project site', icon: '🌤️',
    recommended: false },
  { key: 'show_rfis' as const,       label: 'RFI Log',
    desc: 'Open RFIs — usually kept internal', icon: '❓',
    recommended: false },
  { key: 'show_submittals' as const, label: 'Submittal Log',
    desc: 'Submittal status — usually kept internal', icon: '📬',
    recommended: false },
]

export default function OwnerPortalSetupPage({
  params,
}: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('')
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const toast = useToast()

  useEffect(() => {
    params.then(p => { setProjectId(p.projectId); load(p.projectId) })
  }, [params])

  const load = useCallback(async (pid: string) => {
    try {
      const r = await fetch(`/api/owner-portal/setup/${pid}`)
      if (r.ok) {
        const { data } = await r.json()
        if (data) setSettings(prev => ({ ...prev, ...data }))
      }
    } finally { setLoading(false) }
  }, [])

  const save = async (overrides?: Partial<PortalSettings>) => {
    setSaving(true)
    statusBar.show('portal', 'working', 'Saving portal settings...')
    try {
      const r = await fetch(`/api/owner-portal/setup/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, ...overrides }),
      })
      if (r.ok) {
        const { data } = await r.json()
        setSettings(prev => ({ ...prev, ...data }))
        statusBar.success('portal', '✓ Owner portal updated')
        toast.success('Portal settings saved')
      } else {
        statusBar.error('portal', 'Save failed')
      }
    } catch { statusBar.error('portal', 'Connection error') }
    finally { setSaving(false) }
  }

  const regenerate = async () => {
    if (!confirm('Regenerate the portal link? The old link will stop working immediately.')) return
    setRegenerating(true)
    statusBar.show('portal-regen', 'working', 'Generating new portal link...')
    try {
      const r = await fetch(`/api/owner-portal/setup/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, regenerate_token: true }),
      })
      if (r.ok) {
        const { data } = await r.json()
        setSettings(prev => ({ ...prev, ...data }))
        statusBar.success('portal-regen', '✓ New portal link generated')
        toast.success('New link generated — share the new URL with your owner')
      }
    } finally { setRegenerating(false) }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://saguarocontrol.net'
  const portalUrl = settings.token ? `${origin}/owner/${settings.token}` : null

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
      <IntelligenceIndicator variant="loading" size="lg" message="Loading portal settings..." />
    </div>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #388bfd, #a371f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: '0 0 20px rgba(56,139,253,0.3)',
          }}>🔗</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>
              Owner Portal
            </h1>
            <p style={{ fontSize: 13, color: '#8b949e', margin: 0 }}>
              Give your owner a live view — no login required
            </p>
          </div>
        </div>
      </div>

      {/* Portal Link Card */}
      <div style={{
        background: settings.token
          ? 'linear-gradient(135deg, rgba(56,139,253,0.05) 0%, #161b22 100%)'
          : '#161b22',
        border: `1px solid ${settings.token ? 'rgba(56,139,253,0.3)' : '#30363d'}`,
        borderRadius: 12, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#8b949e',
          textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 14,
        }}>
          📎 Portal Link
        </div>

        {portalUrl ? (
          <>
            <div style={{
              background: '#0d1117', border: '1px solid #30363d',
              borderRadius: 8, padding: '12px 16px',
              fontFamily: 'monospace', fontSize: 12, color: '#388bfd',
              wordBreak: 'break-all' as const, marginBottom: 12, lineHeight: 1.5,
            }}>
              {portalUrl}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button onClick={() => copy(portalUrl)} style={{
                background: copied ? 'rgba(46,160,67,0.15)' : 'rgba(56,139,253,0.1)',
                border: `1px solid ${copied ? 'rgba(46,160,67,0.3)' : 'rgba(56,139,253,0.3)'}`,
                color: copied ? '#2ea043' : '#388bfd',
                borderRadius: 7, padding: '8px 16px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                {copied ? '✓ Copied!' : '📋 Copy Link'}
              </button>
              <a href={portalUrl} target="_blank" rel="noopener noreferrer" style={{
                background: 'rgba(163,113,247,0.1)',
                border: '1px solid rgba(163,113,247,0.3)',
                color: '#a371f7', borderRadius: 7,
                padding: '8px 16px', fontSize: 12,
                fontWeight: 600, textDecoration: 'none',
                display: 'inline-block',
              }}>
                👁 Preview Portal ↗
              </a>
              <button
                onClick={() => copy(`Subject: Your Project Portal — ${origin}\n\nHi,\n\nYou can view live project updates here:\n${portalUrl}\n\nNo login required.`)}
                style={{
                  background: 'transparent', border: '1px solid #30363d',
                  color: '#8b949e', borderRadius: 7,
                  padding: '8px 14px', fontSize: 12, cursor: 'pointer',
                }}>
                📧 Copy Email Template
              </button>
              <button onClick={regenerate} disabled={regenerating} style={{
                background: 'transparent', border: '1px solid rgba(248,81,73,0.3)',
                color: '#f85149', borderRadius: 7,
                padding: '8px 14px', fontSize: 12, cursor: 'pointer',
              }}>
                {regenerating ? '⟳ Regenerating...' : '🔄 New Link'}
              </button>
            </div>

            {/* Access stats */}
            <div style={{
              display: 'flex', gap: 20, marginTop: 14, paddingTop: 14,
              borderTop: '1px solid #30363d', flexWrap: 'wrap' as const,
            }}>
              <div style={{ fontSize: 11, color: '#8b949e' }}>
                <span style={{ color: '#388bfd', fontWeight: 700 }}>
                  {settings.access_count}
                </span> {settings.access_count === 1 ? 'view' : 'views'}
              </div>
              {settings.last_accessed_at && (
                <div style={{ fontSize: 11, color: '#8b949e' }}>
                  Last viewed{' '}
                  <span style={{ color: '#e6edf3' }}>
                    {new Date(settings.last_accessed_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
              <div style={{ fontSize: 11, color: settings.is_active ? '#2ea043' : '#f85149', fontWeight: 700 }}>
                {settings.is_active ? '● Active' : '● Inactive'}
              </div>
            </div>
          </>
        ) : (
          <div style={{
            textAlign: 'center' as const, padding: '24px 0',
            color: '#8b949e', fontSize: 13,
          }}>
            <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.4 }}>🔗</div>
            Save settings below to generate your owner portal link.
          </div>
        )}
      </div>

      {/* What Owner Can See */}
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: 12, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#8b949e',
            textTransform: 'uppercase' as const, letterSpacing: '0.12em',
          }}>
            👁 What Your Owner Can See
          </div>
          <div style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>
            Toggle each section on or off. Changes take effect immediately.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {VISIBILITY_OPTIONS.map(opt => (
            <div
              key={opt.key}
              onClick={() => setSettings(p => ({ ...p, [opt.key]: !p[opt.key] }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                background: settings[opt.key]
                  ? 'rgba(46,160,67,0.06)' : '#0d1117',
                border: `1px solid ${settings[opt.key]
                  ? 'rgba(46,160,67,0.25)' : '#21262d'}`,
                borderRadius: 8, cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{opt.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: settings[opt.key] ? '#e6edf3' : '#8b949e',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {opt.label}
                  {opt.recommended && (
                    <span style={{
                      fontSize: 9, color: '#2ea043',
                      background: 'rgba(46,160,67,0.1)',
                      border: '1px solid rgba(46,160,67,0.2)',
                      borderRadius: 20, padding: '1px 5px',
                      fontWeight: 700,
                    }}>REC</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#6e7681', marginTop: 2 }}>
                  {opt.desc}
                </div>
              </div>
              <div style={{
                width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                background: settings[opt.key]
                  ? 'rgba(46,160,67,0.3)' : '#30363d',
                position: 'relative' as const,
                transition: 'background 0.2s ease',
              }}>
                <div style={{
                  position: 'absolute' as const, top: 2,
                  left: settings[opt.key] ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: settings[opt.key] ? '#2ea043' : '#6e7681',
                  transition: 'left 0.2s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Branding */}
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: 12, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#8b949e',
          textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 16,
        }}>
          ✏️ Personalize the Portal
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{
            fontSize: 11, fontWeight: 600, color: '#8b949e', display: 'block',
            marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.08em',
          }}>
            Company Name (shown in portal header)
          </label>
          <input className="s-input"
            placeholder="TNT Cyber Solutions"
            value={settings.branding_name}
            onChange={e => setSettings(p => ({ ...p, branding_name: e.target.value }))}
          />
        </div>
        <div>
          <label style={{
            fontSize: 11, fontWeight: 600, color: '#8b949e', display: 'block',
            marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.08em',
          }}>
            Welcome Message
          </label>
          <textarea className="s-input s-textarea" rows={3}
            placeholder="Welcome to your project portal. This page updates automatically as work progresses."
            value={settings.custom_message}
            onChange={e => setSettings(p => ({ ...p, custom_message: e.target.value }))}
          />
          <div style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>
            Shown at the top of the portal when your owner opens it.
          </div>
        </div>
      </div>

      {/* Save + Deactivate */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={() => save()} disabled={saving} style={{
          background: '#d4a017', color: '#0d1117', border: 'none',
          borderRadius: 8, padding: '11px 28px',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          opacity: saving ? 0.7 : 1,
          boxShadow: saving ? 'none' : '0 0 20px rgba(212,160,23,0.2)',
        }}>
          {saving ? '⟳ Saving...' : settings.token ? 'Save Changes' : '✓ Generate Portal Link'}
        </button>
        {settings.token && (
          <button
            onClick={() => save({ is_active: !settings.is_active })}
            style={{
              background: 'transparent',
              border: `1px solid ${settings.is_active ? 'rgba(248,81,73,0.3)' : 'rgba(46,160,67,0.3)'}`,
              color: settings.is_active ? '#f85149' : '#2ea043',
              borderRadius: 8, padding: '11px 16px',
              fontSize: 13, cursor: 'pointer',
            }}>
            {settings.is_active ? 'Deactivate Portal' : 'Reactivate Portal'}
          </button>
        )}
      </div>

      {/* Help text */}
      <div style={{
        marginTop: 24, padding: '16px 20px',
        background: 'rgba(56,139,253,0.05)',
        border: '1px solid rgba(56,139,253,0.15)',
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#388bfd', marginBottom: 6 }}>
          How it works
        </div>
        <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.7 }}>
          Share the portal link with your owner. They can view the project without logging in.
          The link is unique to this project and never expires unless you deactivate it.
          Toggle sections on/off at any time — changes take effect immediately.
          Your owner sees the professional view — no internal costs, no sub details.
        </div>
      </div>
    </div>
  )
}
