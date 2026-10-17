'use client';
/**
 * /accept-invite?token=... — Public team-invite acceptance page.
 *
 * Backed by /api/team/accept-invite (GET verify, POST redeem). No app-shell auth:
 * a brand-new invitee who has never logged in can still land here, read who invited
 * them, and be guided to sign up / log in with the invited email before accepting.
 *
 * Branded gold-on-navy, phosphor icons (no emoji), responsive.
 */
import { useHydrated } from '@/lib/use-hydrated';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { clearOfflineCopies } from '@/lib/offline/worker';
import {
  EnvelopeSimple, Buildings, UserCircle, Briefcase, CheckCircle, WarningCircle,
  ClockCountdown, SealCheck, SignIn, UserPlus, ArrowRight, ShieldCheck,
} from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)',
  BORDER = 'rgba(255,255,255,0.12)', DIM = 'var(--text-secondary)', TEXT = '#FFFFFF',
  RED = '#F87171', GREEN = '#4ADE80';

type Reason = 'pending' | 'accepted' | 'expired' | 'invalid' | 'error';
interface Invite {
  valid: boolean;
  reason: Reason;
  email: string;
  name?: string | null;
  role: string;
  company: string;
  inviterName: string;
  projectId: string | null;
  projectName: string | null;
}
interface Me { id: string; email: string; name: string }

const card: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
  padding: '32px 28px', boxShadow: '0 8px 32px rgba(0,0,0,.25)',
};

function Spinner({ size = 18, color = '#101722' }: { size?: number; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `2px solid rgba(255,255,255,.35)`, borderTopColor: color,
      borderRadius: '50%', animation: 'spin .6s linear infinite',
    }} />
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
      <span style={{ color: 'var(--text-primary)', display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: DIM }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  const [token, setToken] = useState('');
  const hydrated = useHydrated();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')?.trim() || '';
    setToken(t);
    if (!t) {
      setInvite({ valid: false, reason: 'invalid' } as Invite);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [inviteRes, meRes] = await Promise.all([
          fetch(`/api/team/accept-invite?token=${encodeURIComponent(t)}`),
          fetch('/api/auth/me', { credentials: 'include' }),
        ]);
        const inviteData = await inviteRes.json().catch(() => null);
        if (inviteData) { setInvite(inviteData); if (inviteData.name) setFullName(String(inviteData.name)); }
        else setInvite({ valid: false, reason: 'error' } as Invite);
        if (meRes.ok) setMe(await meRes.json().catch(() => null));
      } catch {
        setInvite({ valid: false, reason: 'error' } as Invite);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAccept() {
    setAccepting(true); setError('');
    try {
      const res = await fetch('/api/team/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not accept the invitation.');
        // Reflect terminal states in the UI.
        if (data.reason === 'expired') setInvite(p => p ? { ...p, reason: 'expired', valid: false } : p);
        if (data.reason === 'already_accepted') setInvite(p => p ? { ...p, reason: 'accepted', valid: false } : p);
        if (data.reason === 'not_authenticated') setMe(null);
        setAccepting(false);
        return;
      }
      setAccepted(true);
      setTimeout(() => { window.location.href = data.redirect || '/app'; }, 1600);
    } catch {
      setError('Something went wrong. Please try again.');
      setAccepting(false);
    }
  }

  /** New invitee: set a password and join the inviting company in one step. */
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== password2) { setError("The two passwords don't match."); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/team/accept-invite/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password, fullName: fullName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't set up your account. Please try again.");
        return;
      }
      setAccepted(true);
      setTimeout(() => { window.location.href = data.redirect || '/app'; }, 1400);
    } catch {
      setError('No connection. Check your internet and try again.');
    } finally {
      setCreating(false);
    }
  }

  // Absolute return path so login/signup can bring the invitee back here.
  const returnPath = token ? `/accept-invite?token=${encodeURIComponent(token)}` : '/accept-invite';
  const loginHref = (email?: string) =>
    `/login?next=${encodeURIComponent(returnPath)}${email ? `&email=${encodeURIComponent(email)}` : ''}`;

  async function switchAccount(email: string) {
    clearOfflineCopies(); // the last account's drafts and offline copies stay with it
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = loginHref(email);
  }

  const emailMatches = !!(me && invite && me.email?.toLowerCase().trim() === invite.email?.toLowerCase().trim());

  return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <nav style={{ padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }} aria-label="Saguaro Control Systems — home">
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 4 }} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.01em', background: `var(--brand-primary)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Saguaro</span>
            <span style={{ fontSize: 12, color: DIM, letterSpacing: .5, fontWeight: 600 }}>Control Systems</span>
          </span>
        </Link>
        <Link href="/login" style={{ fontSize: 13, color: DIM, textDecoration: 'none', fontWeight: 600 }}>
          Have an account? <span style={{ color: 'var(--text-primary)' }}>Sign In →</span>
        </Link>
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
        <div style={{ width: '100%', maxWidth: 460 }}>

          {/* ── Loading ── */}
          {loading && (
            <div style={{ ...card, textAlign: 'center', padding: '48px 28px' }}>
              <Spinner size={26} color="var(--text-secondary)" />
              <p style={{ color: DIM, fontSize: 14, marginTop: 16 }}>Verifying your invitation…</p>
            </div>
          )}

          {/* ── Invalid ── */}
          {!loading && invite && invite.reason === 'invalid' && (
            <StateCard
              icon={<WarningCircle size={48} weight="duotone" color={RED} />}
              title="Invitation Not Found"
              body="This invitation link is invalid or has already been removed. Ask your teammate to send a fresh invite."
              cta={<Link href="/login" style={ctaSecondary}>Go to Sign In</Link>}
            />
          )}

          {/* ── Generic error ── */}
          {!loading && invite && invite.reason === 'error' && (
            <StateCard
              icon={<WarningCircle size={48} weight="duotone" color={RED} />}
              title="Something Went Wrong"
              body="We couldn't load this invitation right now. Please refresh the page or try again in a moment."
              cta={<button onClick={() => window.location.reload()} style={ctaSecondary}>Retry</button>}
            />
          )}

          {/* ── Expired ── */}
          {!loading && invite && invite.reason === 'expired' && (
            <StateCard
              icon={<ClockCountdown size={48} weight="duotone" color="var(--text-secondary)" />}
              title="This Invitation Expired"
              body={`Invitations are valid for 7 days. Ask ${invite.inviterName || 'your teammate'} to send you a new invite to ${invite.company || 'the team'}.`}
              cta={<Link href="/login" style={ctaSecondary}>Go to Sign In</Link>}
            />
          )}

          {/* ── Already accepted ── */}
          {!loading && invite && invite.reason === 'accepted' && !accepted && (
            <StateCard
              icon={<SealCheck size={48} weight="duotone" color={GREEN} />}
              title="Already Accepted"
              body={`This invitation to join ${invite.company || 'the team'} has already been accepted. Sign in to get to work.`}
              cta={<Link href="/login" style={ctaPrimary}>Sign In <ArrowRight size={16} weight="bold" /></Link>}
            />
          )}

          {/* ── Success ── */}
          {accepted && (
            <StateCard
              icon={<CheckCircle size={48} weight="fill" color={GREEN} />}
              title="You're In"
              body={`Welcome to ${invite?.company || 'the team'}. Taking you to your dashboard…`}
              cta={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 13 }}><Spinner size={14} color="var(--text-secondary)" /> Redirecting…</span>}
            />
          )}

          {/* ── Pending / valid ── */}
          {!loading && invite && invite.reason === 'pending' && !accepted && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ display: 'inline-flex', width: 60, height: 60, borderRadius: 14, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Buildings size={30} weight="duotone" color="var(--text-secondary)" />
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 6px', color: TEXT }}>
                  Join {invite.company}
                </h1>
                <p style={{ color: DIM, fontSize: 14, margin: 0 }}>
                  <strong style={{ color: TEXT }}>{invite.inviterName}</strong> invited you to collaborate on Saguaro Control Systems.
                </p>
              </div>

              <div style={card}>
                {/* Invite details */}
                <div style={{ marginBottom: 20 }}>
                  <DetailRow icon={<Buildings size={20} weight="duotone" />} label="Company" value={invite.company} />
                  <DetailRow icon={<ShieldCheck size={20} weight="duotone" />} label="Your Role" value={invite.role} />
                  <DetailRow icon={<EnvelopeSimple size={20} weight="duotone" />} label="Invited Email" value={invite.email} />
                  <DetailRow icon={<UserCircle size={20} weight="duotone" />} label="Invited By" value={invite.inviterName} />
                  {invite.projectId && (
                    <DetailRow icon={<Briefcase size={20} weight="duotone" />} label="Project" value={invite.projectName || 'Project Team'} />
                  )}
                </div>

                {error && (
                  <div style={errorBox}>
                    <WarningCircle size={16} weight="fill" color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Logged in, email matches → accept */}
                {emailMatches && (
                  <button onClick={handleAccept} disabled={accepting} style={{ ...ctaPrimary, width: '100%', justifyContent: 'center', opacity: accepting ? .7 : 1, cursor: accepting ? 'not-allowed' : 'pointer' }}>
                    {accepting ? <><Spinner /> Accepting…</> : <>Accept Invitation <ArrowRight size={16} weight="bold" /></>}
                  </button>
                )}

                {/* Logged in, WRONG account → switch */}
                {me && !emailMatches && (
                  <>
                    <div style={{ ...noticeBox }}>
                      You're signed in as <strong style={{ color: TEXT }}>{me.email}</strong>, but this invite is for <strong style={{ color: TEXT }}>{invite.email}</strong>. Sign in with the invited email to accept.
                    </div>
                    <button onClick={() => switchAccount(invite.email)} style={{ ...ctaPrimary, width: '100%', justifyContent: 'center' }}>
                      <SignIn size={16} weight="bold" /> Sign In as {invite.email}
                    </button>
                  </>
                )}

                {/* Not logged in → set a password here and join (no separate company signup) */}
                {!me && (
                  <form method="post" onSubmit={handleCreateAccount}>
                    <label style={fieldLabel} htmlFor="inv-name">Your Name</label>
                    <input id="inv-name" value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" style={fieldInput} placeholder="First and last name" />
                    <label style={fieldLabel} htmlFor="inv-pw">Create a Password</label>
                    <input id="inv-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" style={fieldInput} placeholder="At least 8 characters" />
                    <label style={fieldLabel} htmlFor="inv-pw2">Confirm Password</label>
                    <input id="inv-pw2" type="password" value={password2} onChange={e => setPassword2(e.target.value)} autoComplete="new-password" style={{ ...fieldInput, marginBottom: 18 }} placeholder="Type it again" />
                    <button type="submit" disabled={creating || !hydrated} style={{ ...ctaPrimary, width: '100%', justifyContent: 'center', opacity: creating ? .7 : 1, cursor: creating ? 'not-allowed' : 'pointer' }}>
                      {creating ? <><Spinner /> Setting Up…</> : <><UserPlus size={16} weight="bold" /> Set Password &amp; Join {invite.company}</>}
                    </button>
                    <a href={loginHref(invite.email)} style={{ ...ctaSecondary, width: '100%', justifyContent: 'center', marginTop: 10 }}>
                      <SignIn size={16} weight="bold" /> I Already Have an Account
                    </a>
                  </form>
                )}
              </div>
            </>
          )}

          {/* Trust footer */}
          <div style={{ marginTop: 20, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={13} weight="duotone" color="rgba(203,213,225,0.6)" />
            <span style={{ fontSize: 12, color: 'rgba(203,213,225,0.6)', fontWeight: 600 }}>
              Secure Invitation · Saguaro Control Systems
            </span>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────
function StateCard({ icon, title, body, cta }: { icon: React.ReactNode; title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '40px 28px' }}>
      <div style={{ marginBottom: 18 }}>{icon}</div>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: TEXT, margin: '0 0 10px' }}>{title}</h1>
      <p style={{ color: DIM, fontSize: 14, lineHeight: 1.55, margin: '0 0 22px' }}>{body}</p>
      {cta}
    </div>
  );
}

const ctaPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px',
  background: GOLD, border: 'none', borderRadius: 9, color: '#101722',
  fontSize: 14, fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
};
const ctaSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px',
  background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 9,
  color: TEXT, fontSize: 14, fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
};
const errorBox: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(248,113,113,.1)',
  border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: '10px 14px',
  marginBottom: 16, fontSize: 13, color: RED, lineHeight: 1.45,
};
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: DIM, margin: '0 0 6px' };
const fieldInput: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box', padding: '12px 14px', marginBottom: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: 9,
  color: TEXT, fontSize: 16, outline: 'none',
};
const noticeBox: React.CSSProperties = {
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 8, padding: '11px 14px', marginBottom: 14, fontSize: 13,
  color: DIM, lineHeight: 1.5,
};
