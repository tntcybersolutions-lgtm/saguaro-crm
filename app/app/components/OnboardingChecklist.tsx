'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

/* ── Types ──────────────────────────────────────────────────────── */
interface OnboardingSteps {
  account_created: boolean
  project_created: boolean
  takeoff_uploaded: boolean
  jacket_generated: boolean
  pdf_downloaded: boolean
}

interface TenantSummary {
  project_count: number
  takeoff_count: number
  jacket_count: number
  has_meaningful_work: boolean
  tenant: {
    plan: string
    days_remaining: number | null
    trial_expired: boolean
    settings: {
      onboarding_completed?: boolean
      onboarding_completed_at?: string
      onboarding_steps?: OnboardingSteps
    }
  }
}

interface StepDefinition {
  key: keyof OnboardingSteps
  label: string
  description: string
  completedDescription: string
  actionLabel: string | null
  actionHref: string | null
  completedActionLabel: string | null
  completedActionHref: string | null
  estimatedTime: string | null
}

/* ── Tokens ─────────────────────────────────────────────────────── */
const WHITE = '#e6edf3'
const DIM = '#8b949e'
const GREEN = '#2ea043'
const GOLD = '#d4a017'
const BLUE = '#388bfd'
const RED = '#EF4444'

/* ── Component ──────────────────────────────────────────────────── */
export function OnboardingChecklist() {
  const [summary, setSummary] = useState<TenantSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [seedingDemo, setSeedingDemo] = useState(false)
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  const prevStepsRef = useRef<OnboardingSteps | null>(null)

  // ── Load + auto-sync ──
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/tenant/summary')
        if (!res.ok) { setLoading(false); return }
        const { data } = await res.json()
        setSummary(data)

        // Auto-detect steps that are complete based on live counts
        const steps = data.tenant.settings.onboarding_steps || {} as OnboardingSteps
        const updates: Partial<Record<string, boolean>> = {}

        if (!steps.project_created && data.project_count > 0)
          updates.project_created = true
        if (!steps.takeoff_uploaded && data.takeoff_count > 0)
          updates.takeoff_uploaded = true
        if (!steps.jacket_generated && data.jacket_count > 0)
          updates.jacket_generated = true

        if (Object.keys(updates).length > 0) {
          fetch('/api/tenant/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: { onboarding_steps: updates } }),
          }).catch(console.error)

          setSummary(prev => {
            if (!prev) return prev
            return {
              ...prev,
              tenant: {
                ...prev.tenant,
                settings: {
                  ...prev.tenant.settings,
                  onboarding_steps: {
                    ...prev.tenant.settings.onboarding_steps,
                    ...updates,
                  } as OnboardingSteps,
                },
              },
            }
          })
        }
      } catch (e) {
        console.error('[OnboardingChecklist] load failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Detect newly completed steps ──
  useEffect(() => {
    if (!summary) return
    const currentSteps = summary.tenant.settings.onboarding_steps
    if (!currentSteps) return

    if (prevStepsRef.current) {
      const newlyDone = new Set<string>()
      for (const key of Object.keys(currentSteps) as (keyof OnboardingSteps)[]) {
        if (currentSteps[key] && !prevStepsRef.current[key]) {
          newlyDone.add(key)
        }
      }
      if (newlyDone.size > 0) {
        setJustCompleted(newlyDone)
        setTimeout(() => setJustCompleted(new Set()), 2000)
      }
    }
    prevStepsRef.current = { ...currentSteps }
  }, [summary])

  // ── Render guards ──
  if (loading) return null
  if (dismissed) return null
  if (summary?.tenant.settings.onboarding_completed) return null
  if (!summary) return null

  const steps = summary.tenant.settings.onboarding_steps || {
    account_created: true,
    project_created: false,
    takeoff_uploaded: false,
    jacket_generated: false,
    pdf_downloaded: false,
  }

  const STEPS: StepDefinition[] = [
    {
      key: 'account_created',
      label: 'Create your account',
      description: "You're in. Welcome to Saguaro CRM.",
      completedDescription: 'Account created and verified.',
      actionLabel: null, actionHref: null,
      completedActionLabel: null, completedActionHref: null,
      estimatedTime: null,
    },
    {
      key: 'project_created',
      label: 'Create your first project',
      description: 'Add project details: name, address, owner, architect, and PM contact.',
      completedDescription: `${summary.project_count || 1} project${summary.project_count !== 1 ? 's' : ''} created.`,
      actionLabel: 'Create Project', actionHref: '/app/projects/new',
      completedActionLabel: 'View Projects', completedActionHref: '/app/projects',
      estimatedTime: '2 minutes',
    },
    {
      key: 'takeoff_uploaded',
      label: 'Upload a construction plan set',
      description: 'Sage AI reads every page and extracts every quantity automatically. Works on any PDF plan set.',
      completedDescription: `${summary.takeoff_count || 1} plan set${summary.takeoff_count !== 1 ? 's' : ''} extracted by Sage AI.`,
      actionLabel: 'Go to Takeoffs', actionHref: '/app/projects',
      completedActionLabel: 'View Takeoffs', completedActionHref: '/app/projects',
      estimatedTime: '45 seconds',
    },
    {
      key: 'jacket_generated',
      label: 'Generate your first bid jacket PDF',
      description: 'Sage writes the complete scope of work, instructions to bidders, and all legal sections. One click.',
      completedDescription: `${summary.jacket_count || 1} bid jacket PDF${summary.jacket_count !== 1 ? 's' : ''} generated.`,
      actionLabel: 'Go to Bid Packages', actionHref: '/app/projects',
      completedActionLabel: 'View Bid Packages', completedActionHref: '/app/projects',
      estimatedTime: '1 minute',
    },
    {
      key: 'pdf_downloaded',
      label: 'Download your bid jacket PDF',
      description: 'Hold a real professional construction bid document with your company name on it.',
      completedDescription: 'First bid jacket downloaded.',
      actionLabel: null, actionHref: null,
      completedActionLabel: null, completedActionHref: null,
      estimatedTime: null,
    },
  ]

  const completedCount = Object.values(steps).filter(Boolean).length
  const totalSteps = 5
  const progressPct = Math.round((completedCount / totalSteps) * 100)
  const allComplete = completedCount === totalSteps

  // Find the first incomplete step
  const activeIndex = STEPS.findIndex(s => !steps[s.key])

  const handleSkip = async () => {
    setDismissed(true)
    fetch('/api/tenant/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { onboarding_completed: true } }),
    }).catch(console.error)
  }

  const handleSeedDemo = async () => {
    setSeedingDemo(true)
    try {
      const res = await fetch('/api/onboarding/seed-demo', { method: 'POST' })
      if (res.ok) {
        window.location.reload()
      } else {
        const err = await res.json()
        console.error('[OnboardingChecklist] seed-demo failed:', err)
      }
    } catch (e) {
      console.error('[OnboardingChecklist] seed-demo error:', e)
    } finally {
      setSeedingDemo(false)
    }
  }

  // ── Confetti particle ──
  const confettiColors = [GOLD, GREEN, BLUE, RED, WHITE]
  const ConfettiParticle = ({ index }: { index: number }) => (
    <div style={{
      position: 'absolute' as const,
      width: 8, height: 8,
      borderRadius: index % 2 === 0 ? '50%' : 2,
      background: confettiColors[index % confettiColors.length],
      left: `${5 + (index * 4.5)}%`,
      top: '50%',
      animation: `confettiFall${index % 3} ${0.8 + (index % 5) * 0.15}s ease-out forwards`,
      animationDelay: `${index * 0.05}s`,
      opacity: 0,
    }} />
  )

  // ── Celebration card ──
  if (allComplete || celebrating) {
    if (!celebrating) setCelebrating(true)
    return (
      <div style={{
        background: 'linear-gradient(135deg, #0a1f0f 0%, #0d1117 100%)',
        border: `1px solid ${GOLD}`,
        borderRadius: 12, padding: 24, marginBottom: 24,
        position: 'relative', overflow: 'hidden',
      }}>
        <style>{`
          @keyframes confettiFall0 { 0% { opacity:1; transform: translateY(0) rotate(0deg); } 100% { opacity:0; transform: translateY(-80px) rotate(180deg); } }
          @keyframes confettiFall1 { 0% { opacity:1; transform: translateY(0) rotate(0deg); } 100% { opacity:0; transform: translateY(-100px) translateX(20px) rotate(270deg); } }
          @keyframes confettiFall2 { 0% { opacity:1; transform: translateY(0) rotate(0deg); } 100% { opacity:0; transform: translateY(-60px) translateX(-15px) rotate(135deg); } }
          @keyframes celebBounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        `}</style>
        {Array.from({ length: 20 }, (_, i) => <ConfettiParticle key={i} index={i} />)}
        <div style={{ fontSize: 20, fontWeight: 800, color: GREEN, marginBottom: 8, animation: 'celebBounce 0.6s ease' }}>
          You{"'"}ve completed onboarding
        </div>
        <p style={{ color: DIM, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          You just did in 5 minutes what takes 2 hours manually.
          Your first professional bid jacket is ready to send to subs.
        </p>
        {summary.tenant.days_remaining !== null && (
          <p style={{
            color: summary.tenant.days_remaining < 7 ? RED : DIM,
            fontSize: 13, marginBottom: 16,
          }}>
            Trial: {summary.tenant.days_remaining} day{summary.tenant.days_remaining !== 1 ? 's' : ''} remaining
          </p>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/app/projects" style={{
            padding: '10px 20px', background: '#161b22', border: `1px solid #30363d`,
            borderRadius: 6, color: WHITE, textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}>
            Explore all features
          </Link>
          <Link href="/upgrade" style={{
            padding: '10px 20px', background: GOLD, color: '#0d1117',
            borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 700,
          }}>
            Upgrade to Gold — $499/mo
          </Link>
        </div>
      </div>
    )
  }

  // ── Main checklist ──
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a1f0f 0%, #0d1117 100%)',
      border: `1px solid ${GREEN}`,
      borderRadius: 12, padding: 24, marginBottom: 24,
    }}>
      <style>{`
        @keyframes obPulse {
          0%, 100% { border-color: ${GOLD}; box-shadow: 0 0 0 0 rgba(212,160,23,0); }
          50% { border-color: #f0c040; box-shadow: 0 0 0 6px rgba(212,160,23,0.15); }
        }
        @keyframes activePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(212,160,23,0); border-color: ${GOLD}; }
          50% { box-shadow: 0 0 0 6px rgba(212,160,23,0.15); border-color: #f0c040; }
        }
        @keyframes stepComplete {
          0% { transform: scale(1); background: transparent; }
          30% { transform: scale(1.02); background: rgba(46,160,67,0.15); }
          100% { transform: scale(1); background: transparent; }
        }
        @keyframes progressWave {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: WHITE, marginBottom: 4 }}>
            Welcome to Saguaro CRM
          </div>
          <div style={{ fontSize: 13, color: DIM }}>
            Get to your first professional bid jacket in under 5 minutes.
          </div>
        </div>
        <button
          onClick={handleSkip}
          style={{
            background: 'none', border: 'none', color: DIM, fontSize: 12,
            cursor: 'pointer', padding: '4px 8px', whiteSpace: 'nowrap',
          }}
        >
          Skip — I{"'"}ll explore on my own
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: DIM, marginBottom: 6 }}>
          {completedCount} of {totalSteps} steps complete
        </div>
        <div style={{ height: 8, background: '#30363d', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progressPct}%`,
            background: progressPct < 100
              ? `linear-gradient(90deg, ${GREEN} 0%, #3dd456 50%, ${GREEN} 100%)`
              : GREEN,
            backgroundSize: '200% 100%',
            animation: progressPct < 100 ? 'progressWave 2s linear infinite' : undefined,
            borderRadius: 4, transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STEPS.map((step, i) => {
          const isComplete = steps[step.key]
          const isActive = i === activeIndex
          const isLocked = i > activeIndex && activeIndex >= 0

          const wasJustCompleted = justCompleted.has(step.key)

          return (
            <div
              key={step.key}
              style={{
                padding: '12px 16px', borderRadius: 8,
                borderLeft: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
                background: isActive ? 'rgba(212,160,23,0.06)' : 'transparent',
                animation: wasJustCompleted
                  ? 'stepComplete 1s ease forwards'
                  : isActive
                    ? 'activePulse 2s ease-in-out infinite'
                    : undefined,
                opacity: isLocked ? 0.5 : 1,
                transition: 'opacity 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>
                    {isComplete ? '✅' : isActive ? '⬜' : '○'}
                  </span>
                  <span style={{
                    fontSize: isActive ? 15 : 14, fontWeight: isActive ? 700 : 500,
                    color: isComplete ? WHITE : isActive ? WHITE : DIM,
                  }}>
                    {step.label}
                  </span>
                </div>
                {isComplete && step.completedActionLabel && step.completedActionHref && (
                  <Link href={step.completedActionHref} style={{
                    fontSize: 12, color: BLUE, textDecoration: 'none',
                  }}>
                    {step.completedActionLabel} →
                  </Link>
                )}
                {isActive && step.actionLabel && step.actionHref && (
                  <Link href={step.actionHref} style={{
                    padding: '6px 14px', background: BLUE, color: '#fff',
                    borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none',
                  }}>
                    {step.actionLabel}
                  </Link>
                )}
              </div>
              <div style={{ marginLeft: 26, marginTop: 2, fontSize: 12, color: DIM }}>
                {isComplete
                  ? step.completedDescription
                  : isLocked
                    ? 'Complete the step above first'
                    : step.description}
              </div>
              {isActive && step.estimatedTime && (
                <div style={{ marginLeft: 26, marginTop: 4, fontSize: 11, color: DIM }}>
                  Estimated time: {step.estimatedTime}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Demo seed */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #30363d', textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: DIM }}>
          New to construction management software?{' '}
          <button
            onClick={handleSeedDemo}
            disabled={seedingDemo}
            style={{
              background: 'none', border: 'none', color: BLUE, fontSize: 12,
              cursor: seedingDemo ? 'not-allowed' : 'pointer', textDecoration: 'underline',
              opacity: seedingDemo ? 0.5 : 1,
            }}
          >
            {seedingDemo ? 'Loading demo...' : 'Load a demo project'}
          </button>
          {' '}to see Saguaro with sample data.
        </span>
      </div>
    </div>
  )
}
