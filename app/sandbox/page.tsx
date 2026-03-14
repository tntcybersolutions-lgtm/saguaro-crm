'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { CONTRACTOR_TRADES as TRADES } from '@/lib/contractor-trades';

const DARK = '#0d1117';
const GOLD = '#F59E0B';
const TEXT = '#F8FAFC';
const DIM = '#CBD5E1';
const BORDER = '#1E3A5F';
const RAISED = '#0F172A';
const GREEN = '#22c55e';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  background: '#0a0f16',
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  color: TEXT,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: DIM,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 6,
};

function CheckCircle({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill={GREEN} fillOpacity="0.15" />
      <circle cx="24" cy="24" r="18" fill={GREEN} fillOpacity="0.25" />
      <circle cx="24" cy="24" r="13" fill={GREEN} />
      <polyline points="16,24 21,30 32,18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function GreenCheck({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="8" cy="8" r="8" fill={GREEN} fillOpacity="0.15" />
      <polyline points="4.5,8 7,10.5 11.5,5.5" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function GoldBullet() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="9" cy="9" r="9" fill={GOLD} fillOpacity="0.15" />
      <circle cx="9" cy="9" r="4" fill={GOLD} />
    </svg>
  );
}

function PulseDot() {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0, marginTop: 5 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: GREEN, opacity: 0.4,
        animation: 'pulse-ring 1.8s ease-out infinite',
      }} />
      <span style={{
        position: 'relative', display: 'inline-flex', width: 10, height: 10,
        borderRadius: '50%', background: GREEN,
      }} />
    </span>
  );
}

export default function SandboxPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [trade, setTrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/sandbox/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName, lastName, companyName: company, phone, primaryTrade: trade, referralSource: 'website' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        if (data.accessToken && typeof window !== 'undefined') {
          setTimeout(() => { window.location.href = data.sandboxUrl || '/app'; }, 2000);
        }
      } else {
        setError(data.error || 'Signup failed. Please try again.');
      }
    } catch { setError('Network error. Please try again.'); }
    setLoading(false);
  }

  // ── SUCCESS STATE ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <>
        <style>{`
          @keyframes pulse-ring {
            0% { transform: scale(1); opacity: 0.4; }
            100% { transform: scale(2.4); opacity: 0; }
          }
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        <div style={{
          minHeight: '100vh', background: DARK, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <div style={{
            maxWidth: 520, width: '100%', textAlign: 'center',
            animation: 'fade-in 0.5s ease both',
          }}>
            {/* Green check circle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <CheckCircle size={72} />
            </div>

            <h1 style={{ fontSize: 30, fontWeight: 900, color: TEXT, marginBottom: 10, lineHeight: 1.2 }}>
              Your Sandbox Is Ready!
            </h1>
            <p style={{ fontSize: 15, color: DIM, marginBottom: 32, lineHeight: 1.7 }}>
              Check your email for your instant access link. Your 14-day free trial has started — no card needed.
            </p>

            {/* Pre-loaded items */}
            <div style={{
              background: RAISED, border: `1px solid ${BORDER}`,
              borderTop: `3px solid ${GOLD}`, borderRadius: 10,
              padding: '20px 24px', marginBottom: 28, textAlign: 'left',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: GOLD, marginBottom: 14 }}>
                Pre-loaded in your sandbox
              </div>
              {[
                'Complete AI takeoff — 2,400 SF custom home (ran in 47 seconds)',
                '5 sample subcontractors with compliance tracking',
                'Bid intelligence history with win/loss analysis',
                '5 free AI runs to try on your own blueprints',
              ].map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, fontSize: 14, color: DIM, lineHeight: 1.5 }}>
                  <GreenCheck size={16} />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <Link href="/app" style={{
              display: 'block', padding: '15px 32px',
              background: `linear-gradient(135deg, ${GOLD}, #FBBF24)`,
              color: '#0d1117', borderRadius: 9, fontWeight: 900,
              fontSize: 16, textDecoration: 'none', textAlign: 'center',
              boxShadow: `0 4px 24px rgba(245,158,11,0.35)`,
              letterSpacing: 0.3,
            }}>
              Enter My Sandbox →
            </Link>
          </div>
        </div>
      </>
    );
  }

  // ── MAIN LAYOUT ────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sandbox-input:focus {
          border-color: ${GOLD} !important;
          box-shadow: 0 0 0 3px rgba(245,158,11,0.12);
        }
        .sandbox-cta:hover {
          filter: brightness(1.07);
          box-shadow: 0 6px 28px rgba(245,158,11,0.45) !important;
        }
        .sandbox-cta:active {
          transform: translateY(1px);
        }
        .left-col {
          flex: 0 0 55%;
          max-width: 55%;
        }
        .right-col {
          flex: 0 0 45%;
          max-width: 45%;
        }
        @media (max-width: 768px) {
          .split-layout {
            flex-direction: column !important;
          }
          .left-col, .right-col {
            flex: none !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .right-col {
            position: static !important;
            border-left: none !important;
            border-top: 1px solid ${BORDER};
            padding: 32px 20px !important;
          }
          .left-col {
            padding: 32px 20px !important;
          }
          .form-grid {
            grid-template-columns: 1fr !important;
          }
          .comparison-table {
            font-size: 12px !important;
          }
        }
      `}</style>

      <div style={{
        minHeight: '100vh', background: DARK,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>

        {/* ── NAV ── */}
        <nav style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 58,
          background: 'rgba(13,17,23,0.97)', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', padding: '0 28px',
          gap: 16, zIndex: 100, backdropFilter: 'blur(8px)',
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 C12 2 8 6 8 11 C8 13 9 14.5 9 14.5 L9 22 L11 22 L11 17 L13 17 L13 22 L15 22 L15 14.5 C15 14.5 16 13 16 11 C16 6 12 2 12 2Z" fill={GOLD} fillOpacity="0.9"/>
              <path d="M7 9 C7 9 4 10 4 13 L4 16 L6 16 L6 13 C6 13 7 12 8 12" stroke={GOLD} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
              <path d="M17 9 C17 9 20 10 20 13 L20 16 L18 16 L18 13 C18 13 17 12 16 12" stroke={GOLD} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
            </svg>
            <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: 2.5, color: GOLD }}>SAGUARO</span>
          </Link>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: DIM }}>Already have an account?</span>
          <Link href="/login" style={{
            fontSize: 13, fontWeight: 700, color: GOLD,
            textDecoration: 'none', padding: '6px 14px',
            border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 6,
          }}>
            Log In →
          </Link>
        </nav>

        {/* ── SPLIT LAYOUT ── */}
        <div className="split-layout" style={{
          paddingTop: 58, display: 'flex', minHeight: '100vh', alignItems: 'stretch',
        }}>

          {/* ══ LEFT: FORM ══════════════════════════════════════════════════ */}
          <div className="left-col" style={{
            padding: '48px 52px 48px 52px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            animation: 'fade-in 0.4s ease both',
          }}>

            {/* Form card */}
            <div style={{
              background: RAISED, border: `1px solid ${BORDER}`,
              borderTop: `3px solid ${GOLD}`, borderRadius: 14,
              padding: '36px 36px 28px 36px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
              maxWidth: 520,
            }}>

              {/* Header */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>
                  Free 14-Day Trial
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 900, color: TEXT, lineHeight: 1.2, margin: 0 }}>
                  Start Your Free AI Sandbox
                </h1>
                <p style={{ fontSize: 14, color: DIM, marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
                  No credit card. No commitment. Live in 60 seconds.
                </p>
              </div>

              {/* Progress indicator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                margin: '20px 0', fontSize: 12, color: DIM,
              }}>
                {[1, 2].map((s) => (
                  <React.Fragment key={s}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                      background: step >= s ? GOLD : 'rgba(255,255,255,0.06)',
                      color: step >= s ? '#0d1117' : DIM,
                      border: step >= s ? 'none' : `1px solid ${BORDER}`,
                      transition: 'all 0.2s',
                    }}>
                      {step > s ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="#0d1117" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : s}
                    </div>
                    {s < 2 && (
                      <div style={{
                        flex: 1, height: 2, borderRadius: 1,
                        background: step > s ? GOLD : 'rgba(255,255,255,0.08)',
                        transition: 'background 0.3s',
                      }} />
                    )}
                  </React.Fragment>
                ))}
                <span style={{ marginLeft: 8, fontSize: 12, color: DIM }}>
                  Step {step} of 2 →
                </span>
              </div>

              {/* Error banner */}
              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                  fontSize: 13, color: '#fca5a5', lineHeight: 1.5,
                }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSignup}>
                {step === 1 ? (
                  <>
                    {/* Step 1: Name + Email */}
                    <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                      <div>
                        <label style={labelStyle}>First Name</label>
                        <input
                          className="sandbox-input"
                          value={firstName} onChange={e => setFirstName(e.target.value)}
                          required placeholder="Jane"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Last Name</label>
                        <input
                          className="sandbox-input"
                          value={lastName} onChange={e => setLastName(e.target.value)}
                          required placeholder="Smith"
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Work Email</label>
                      <input
                        className="sandbox-input"
                        type="email" value={email} onChange={e => setEmail(e.target.value)}
                        required placeholder="you@company.com"
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label style={labelStyle}>Company Name</label>
                      <input
                        className="sandbox-input"
                        value={company} onChange={e => setCompany(e.target.value)}
                        required placeholder="ABC Construction"
                        style={inputStyle}
                      />
                    </div>

                    <button
                      type="button"
                      disabled={!firstName || !lastName || !email || !company}
                      onClick={() => setStep(2)}
                      style={{
                        width: '100%', padding: '14px 20px',
                        background: (!firstName || !lastName || !email || !company)
                          ? 'rgba(245,158,11,0.4)'
                          : `linear-gradient(135deg, ${GOLD}, #FBBF24)`,
                        border: 'none', borderRadius: 9,
                        color: '#0d1117', fontSize: 15, fontWeight: 900,
                        cursor: (!firstName || !lastName || !email || !company) ? 'not-allowed' : 'pointer',
                        marginBottom: 0,
                        transition: 'all 0.15s',
                        letterSpacing: 0.2,
                      }}
                    >
                      Continue →
                    </button>
                  </>
                ) : (
                  <>
                    {/* Step 2: Phone + Trade + Submit */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Phone (optional)</label>
                      <input
                        className="sandbox-input"
                        type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        placeholder="(555) 000-0000"
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label style={labelStyle}>Primary Trade</label>
                      <select
                        className="sandbox-input"
                        value={trade} onChange={e => setTrade(e.target.value)}
                        style={{
                          ...inputStyle,
                          color: trade ? TEXT : DIM,
                          cursor: 'pointer',
                          appearance: 'none',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23CBD5E1' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 14px center',
                          paddingRight: 36,
                        }}
                      >
                        <option value="">Select your trade...</option>
                        {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="sandbox-cta"
                      disabled={loading}
                      style={{
                        width: '100%', padding: '15px 20px',
                        background: loading
                          ? 'rgba(245,158,11,0.5)'
                          : `linear-gradient(135deg, ${GOLD}, #FBBF24)`,
                        border: 'none', borderRadius: 9,
                        color: '#0d1117', fontSize: 16, fontWeight: 900,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        boxShadow: loading ? 'none' : '0 4px 20px rgba(245,158,11,0.3)',
                        marginBottom: 12,
                        transition: 'all 0.15s',
                        letterSpacing: 0.3,
                      }}
                    >
                      {loading ? 'Creating your sandbox…' : 'Create My Free Sandbox →'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      style={{
                        background: 'none', border: 'none', color: DIM,
                        fontSize: 13, cursor: 'pointer', padding: '4px 0',
                        marginBottom: 4, textDecoration: 'underline',
                      }}
                    >
                      ← Back
                    </button>
                  </>
                )}

                {/* Legal */}
                <p style={{ fontSize: 11, color: 'rgba(203,213,225,0.5)', textAlign: 'center', marginTop: 14, marginBottom: 0, lineHeight: 1.6 }}>
                  By signing up you agree to our{' '}
                  <Link href="/terms" style={{ color: DIM, textDecoration: 'underline' }}>Terms of Service</Link>.{' '}
                  Cancel anytime.
                </p>
              </form>
            </div>

            {/* Trust row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 20,
              marginTop: 20, flexWrap: 'wrap', maxWidth: 520,
            }}>
              {[
                { icon: (
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                    <path d="M7 1L1 4v4c0 3.3 2.5 6.4 6 7 3.5-.6 6-3.7 6-7V4L7 1z" stroke={DIM} strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
                    <polyline points="4,8 6,10 10,6" stroke={GREEN} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ), text: '256-bit SSL' },
                { icon: (
                  <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
                    <rect x="1" y="6" width="11" height="9" rx="2" stroke={DIM} strokeWidth="1.2" fill="none"/>
                    <path d="M4 6V4a2.5 2.5 0 0 1 5 0v2" stroke={DIM} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                    <circle cx="6.5" cy="10.5" r="1.2" fill={GOLD}/>
                  </svg>
                ), text: 'No CC required' },
                { icon: (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <circle cx="7.5" cy="7.5" r="6.5" stroke={DIM} strokeWidth="1.2" fill="none"/>
                    <polyline points="4,7.5 6.5,10 11,5" stroke={GREEN} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ), text: 'Cancel anytime' },
              ].map(({ icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: DIM }}>
                  {icon}
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ══ RIGHT: SOCIAL PROOF ══════════════════════════════════════════ */}
          <div className="right-col" style={{
            borderLeft: `1px solid ${BORDER}`,
            padding: '0 0',
            position: 'sticky', top: 58, height: 'calc(100vh - 58px)',
            overflowY: 'auto',
          }}>
            <div style={{ padding: '40px 36px 40px 36px' }}>

              {/* ── What's in Your Sandbox ── */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: GOLD, marginBottom: 14 }}>
                  What's in Your Sandbox
                </div>
                <div style={{
                  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: '20px 22px',
                }}>
                  {[
                    { text: 'AI Blueprint Takeoff — 2,400 SF custom home', sub: 'Ran in 47 seconds' },
                    { text: '5 sample subcontractors with compliance tracking', sub: 'Ready to bid' },
                    { text: 'Bid intelligence history with win/loss analysis', sub: 'Real data included' },
                    { text: '5 free AI runs to try on YOUR blueprints', sub: 'Use your own plans' },
                    { text: 'G702 Pay App template ready to customize', sub: 'AIA standard form' },
                    { text: 'Lien waiver workflow — all 50 states activated', sub: 'Conditional & unconditional' },
                  ].map(({ text, sub }) => (
                    <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                      <GoldBullet />
                      <div>
                        <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, lineHeight: 1.4 }}>{text}</div>
                        <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Live Activity Feed ── */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: GOLD }}>
                    Live Activity
                  </div>
                  <PulseDot />
                </div>
                <div style={{
                  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
                  overflow: 'hidden',
                }}>
                  {[
                    { name: 'Carlos M.', city: 'San Antonio', action: 'just ran a takeoff', ago: '2 min ago' },
                    { name: 'Marcus T.', city: 'Phoenix', action: 'just started a trial', ago: '8 min ago' },
                    { name: 'Jennifer R.', city: 'Las Vegas', action: 'signed up', ago: '14 min ago' },
                    { name: 'Derek W.', city: 'Dallas', action: 'sent 12 bid invitations', ago: '21 min ago' },
                  ].map(({ name, city, action, ago }, i) => (
                    <div
                      key={name}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '13px 18px',
                        borderBottom: i < 3 ? `1px solid rgba(30,58,95,0.5)` : 'none',
                      }}
                    >
                      <PulseDot />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{name}</span>
                        <span style={{ fontSize: 13, color: DIM }}> from {city} </span>
                        <span style={{ fontSize: 13, color: DIM }}>{action}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(203,213,225,0.4)', whiteSpace: 'nowrap', marginTop: 2 }}>{ago}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Comparison Table ── */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: GOLD, marginBottom: 14 }}>
                  Saguaro vs. The Old Way
                </div>
                <div className="comparison-table" style={{
                  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
                  overflow: 'hidden', fontSize: 13,
                }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'rgba(245,158,11,0.06)', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}></div>
                    <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: 0.5, borderLeft: `1px solid ${BORDER}` }}>Saguaro</div>
                    <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, borderLeft: `1px solid ${BORDER}` }}>Procore Demo</div>
                  </div>
                  {/* Row 1 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid rgba(30,58,95,0.5)` }}>
                    <div style={{ padding: '12px 14px', color: DIM, fontWeight: 600 }}>Setup time</div>
                    <div style={{ padding: '12px 14px', color: GREEN, fontWeight: 700, borderLeft: `1px solid rgba(30,58,95,0.5)` }}>60 seconds</div>
                    <div style={{ padding: '12px 14px', color: 'rgba(203,213,225,0.5)', borderLeft: `1px solid rgba(30,58,95,0.5)` }}>Schedule a call (2–5 days)</div>
                  </div>
                  {/* Row 2 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div style={{ padding: '12px 14px', color: DIM, fontWeight: 600 }}>What you get</div>
                    <div style={{ padding: '12px 14px', color: GREEN, fontWeight: 700, borderLeft: `1px solid rgba(30,58,95,0.5)`, lineHeight: 1.4 }}>Full product, real AI, your data</div>
                    <div style={{ padding: '12px 14px', color: 'rgba(203,213,225,0.5)', borderLeft: `1px solid rgba(30,58,95,0.5)`, lineHeight: 1.4 }}>Guided tour with sales rep</div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </>
  );
}
