'use client';
/**
 * /portals/lead/[key] — the contractor's hosted "request a quote" form. The
 * link is shared or put behind a button on their website; a form pasted into
 * their own site posts to the same API and lands back here on ?sent=1.
 * Every submission becomes a New lead in their CRM (lib/lead-intake).
 */
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { LEAD_BUDGETS, LEAD_PROJECT_TYPES, LEAD_TIMELINES } from '@/lib/lead-intake';

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-secondary)';
const BORDER = 'rgba(255,255,255,0.14)';
const FIELD = 'var(--bg-solid-2)';

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '12px 14px', borderRadius: 10,
  border: `1px solid ${BORDER}`, background: FIELD, color: TEXT, fontSize: 16,
};
const label: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 6px' };

function LeadForm() {
  const { key } = useParams<{ key: string }>();
  const search = useSearchParams();
  const [company, setCompany] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'sent'>(search.get('sent') ? 'sent' : 'loading');
  const [error, setError] = useState<string | null>(search.get('error'));
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());
  const [f, setF] = useState({ name: '', email: '', phone: '', address: '', project_type: '', budget: '', timeline: '', message: '', website: '' });

  useEffect(() => {
    fetch(`/api/portal/lead/${key}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setState('gone'); return; }
        setCompany(j.company);
        setState((s) => (s === 'sent' ? 'sent' : 'ready'));
      })
      .catch(() => setState('gone'));
  }, [key]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`/api/portal/lead/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, started_at: started.current }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Your request could not be sent. Please try again.');
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your request could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px 16px calc(32px + env(safe-area-inset-bottom))' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {state === 'loading' && <div style={{ textAlign: 'center', color: DIM, paddingTop: 60 }}>Loading…</div>}

        {state === 'gone' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <WarningCircle size={40} weight="duotone" color={GOLD} />
            <h1 style={{ fontSize: 22, margin: '12px 0 6px' }}>This form is no longer active</h1>
            <p style={{ color: DIM, fontSize: 16 }}>Please contact the contractor directly.</p>
          </div>
        )}

        {state === 'sent' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <CheckCircle size={48} weight="fill" color="var(--success)" />
            <h1 style={{ fontSize: 26, margin: '12px 0 6px' }}>Thank you — we have your request</h1>
            <p style={{ color: DIM, fontSize: 16, lineHeight: 1.6 }}>{company || 'The team'} will be in touch soon to talk about your project.</p>
          </div>
        )}

        {state === 'ready' && (
          <form onSubmit={submit} noValidate={false}>
            <div style={{ fontSize: 13, fontWeight: 800, color: GOLD, letterSpacing: '.04em' }}>{company}</div>
            <h1 style={{ fontSize: 28, lineHeight: 1.2, margin: '6px 0 6px' }}>Request a quote</h1>
            <p style={{ color: DIM, fontSize: 16, margin: '0 0 22px', lineHeight: 1.55 }}>Tell us about your project and we will get back to you.</p>

            <div style={{ display: 'grid', gap: 16 }}>
              <div><label style={label} htmlFor="lf-name">Your name *</label><input id="lf-name" required autoComplete="name" value={f.name} onChange={set('name')} style={input} /></div>
              <div className="lfTwo" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={label} htmlFor="lf-email">Email</label><input id="lf-email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} style={input} /></div>
                <div><label style={label} htmlFor="lf-phone">Phone</label><input id="lf-phone" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} style={input} /></div>
              </div>
              <div><label style={label} htmlFor="lf-address">Project address</label><input id="lf-address" autoComplete="street-address" value={f.address} onChange={set('address')} style={input} /></div>
              <div><label style={label} htmlFor="lf-type">Type of project</label>
                <select id="lf-type" value={f.project_type} onChange={set('project_type')} style={input}>
                  <option value="">Choose one</option>{LEAD_PROJECT_TYPES.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div className="lfTwo" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={label} htmlFor="lf-budget">Budget</label>
                  <select id="lf-budget" value={f.budget} onChange={set('budget')} style={input}>
                    <option value="">Choose one</option>{LEAD_BUDGETS.map((o) => <option key={o}>{o}</option>)}
                  </select></div>
                <div><label style={label} htmlFor="lf-timeline">When to start</label>
                  <select id="lf-timeline" value={f.timeline} onChange={set('timeline')} style={input}>
                    <option value="">Choose one</option>{LEAD_TIMELINES.map((o) => <option key={o}>{o}</option>)}
                  </select></div>
              </div>
              <div><label style={label} htmlFor="lf-message">About your project</label>
                <textarea id="lf-message" rows={5} value={f.message} onChange={set('message')} style={{ ...input, resize: 'vertical' }} /></div>
              {/* Hidden from people; bots fill it and are dropped. */}
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set('website')} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
              <p style={{ color: DIM, fontSize: 14, margin: 0 }}>We need an email or a phone number to reach you.</p>
              {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 15, fontWeight: 700 }}>{error}</div>}
              <button type="submit" disabled={busy} style={{ minHeight: 52, borderRadius: 12, border: 'none', background: GOLD, color: 'var(--on-brand)', fontSize: 17, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Sending…' : 'Request a quote'}
              </button>
            </div>
          </form>
        )}
        <p style={{ textAlign: 'center', color: DIM, fontSize: 12, marginTop: 28 }}>Powered by Saguaro</p>
      </div>
      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 480px){.lfTwo{grid-template-columns:1fr!important}}' }} />
    </main>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function LeadFormPage() {
  return <Suspense fallback={null}><LeadForm /></Suspense>;
}
