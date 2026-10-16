'use client';
/**
 * /portals/proposal/[token] — the customer reads the proposal and signs it.
 *
 * Customer-facing, so it is a white document page (CLAUDE.md §4 allows white on
 * /portals/) branded with the contractor's name and logo, not Saguaro's app
 * chrome. Built for a phone first: the signature pad runs the full width,
 * every input is 16px (no iOS zoom), every target is at least 44px.
 *
 * What is shown is the frozen snapshot the link was sent with, and its SHA-256
 * fingerprint. Signing posts that fingerprint back; the server refuses if the
 * content is not exactly what was shown. Accept & Sign needs the typed full
 * name, a drawn signature (or the typed name adopted as the signature) and the
 * ESIGN / UETA consent box. Decline takes an optional reason.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/SignaturePad';
import { money, type ProposalSnapshot } from '@/lib/proposal-esign-core';

type Loaded =
  | { state: 'loading' }
  | { state: 'open'; proposal: ProposalSnapshot; content_hash: string; signer: { name: string; email: string; title: string | null }; message: string | null; expires_at: string; consent_text: string }
  | { state: 'signed'; company?: string; title?: string; signed_at?: string; signed_name?: string }
  | { state: 'declined'; company?: string; title?: string }
  | { state: 'voided' | 'expired' | 'invalid' | 'error'; company?: string; error?: string };

type Done = null | { kind: 'signed'; at: string; hash: string } | { kind: 'declined' };

const fmtDay = (v: string | null | undefined) => {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};
const fmtWhen = (v: string) => new Date(v).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The typed name, drawn as an image, when the signer adopts it as their signature. */
function typedSignaturePng(name: string): string {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 220;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#0f172a';
  let size = 96;
  ctx.font = `italic ${size}px "Snell Roundhand", "Segoe Script", "Brush Script MT", Georgia, serif`;
  while (size > 36 && ctx.measureText(name).width > c.width - 60) { size -= 4; ctx.font = `italic ${size}px "Snell Roundhand", "Segoe Script", "Brush Script MT", Georgia, serif`; }
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 30, c.height / 2);
  return c.toDataURL('image/png');
}

export default function ProposalSigningPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Loaded>({ state: 'loading' });
  const [done, setDone] = useState<Done>(null);

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [drawn, setDrawn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<null | 'sign' | 'decline'>(null);
  const [error, setError] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const pad = useRef<SignatureCanvasHandle>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portals/proposal/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (j && typeof j.state === 'string') {
        setData(j as Loaded);
        if (j.state === 'open' && j.signer?.title) setTitle(j.signer.title);
        return;
      }
      setData({ state: 'error', error: j?.error || 'This proposal could not be loaded.' });
    } catch {
      setData({ state: 'error', error: 'This proposal could not be loaded. Check your connection and try again.' });
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const sign = async () => {
    if (data.state !== 'open') return;
    setError('');
    const name = fullName.trim();
    if (name.length < 2) { setError('Type your full name.'); return; }
    let png = '';
    if (mode === 'draw') {
      if (!pad.current || pad.current.isEmpty()) { setError('Draw your signature in the box, or choose Type to use your typed name.'); return; }
      png = pad.current.toDataURL();
    } else {
      png = typedSignaturePng(name);
    }
    if (!agreed) { setError('Tick the box to agree to sign electronically.'); return; }
    setBusy('sign');
    try {
      const r = await fetch(`/api/portals/proposal/${encodeURIComponent(token)}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typed_name: name, signer_title: title.trim() || undefined, method: mode === 'draw' ? 'drawn' : 'typed', signature_png: png, consent: true, content_hash: data.content_hash }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Your signature could not be recorded. Please try again.');
      setDone({ kind: 'signed', at: j.signed_at || new Date().toISOString(), hash: data.content_hash });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your signature could not be recorded. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    setError('');
    setBusy('decline');
    try {
      const r = await fetch(`/api/portals/proposal/${encodeURIComponent(token)}/decline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Your answer could not be recorded. Please try again.');
      setDone({ kind: 'declined' });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your answer could not be recorded. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const shell = (children: React.ReactNode) => (
    <main className="pp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pp-in">{children}</div>
    </main>
  );

  if (data.state === 'loading') return shell(<p className="pp-muted pp-center">Loading the proposal…</p>);

  if (done?.kind === 'signed' && data.state === 'open') {
    return shell(
      <section className="pp-final" aria-live="polite">
        <span className="pp-check" aria-hidden>✓</span>
        <h1>Signed</h1>
        <p><b>{data.proposal.title}</b> for <b>{money(data.proposal.total)}</b> was signed on {fmtWhen(done.at)}.</p>
        <p className="pp-muted">{data.proposal.company.name} has been told. They will follow up with next steps and can send you the signed copy with its signature certificate.</p>
        <p className="pp-hash">Document fingerprint (SHA-256)<br /><code>{done.hash}</code></p>
      </section>,
    );
  }
  if (done?.kind === 'declined' && data.state === 'open') {
    return shell(
      <section className="pp-final" aria-live="polite">
        <h1>Declined</h1>
        <p>{data.proposal.company.name} has been told{reason.trim() ? ', with your reason' : ''}. You can close this page.</p>
      </section>,
    );
  }

  if (data.state !== 'open') {
    const head = data.state === 'signed' ? 'Already signed'
      : data.state === 'declined' ? 'Declined'
      : data.state === 'voided' ? 'Link withdrawn'
      : data.state === 'expired' ? 'Link expired'
      : 'Link not valid';
    const body = data.state === 'signed'
      ? `${data.title || 'This proposal'} was signed${data.signed_name ? ` by ${data.signed_name}` : ''}${data.signed_at ? ` on ${fmtWhen(data.signed_at)}` : ''}. A signing link works once.`
      : data.state === 'declined' ? `${data.title || 'This proposal'} was declined. If that was a mistake, ask ${data.company || 'the sender'} for a new link.`
      : ('error' in data && data.error) || 'Ask the sender for a new link.';
    return shell(
      <section className="pp-final">
        {'company' in data && data.company ? <p className="pp-eyebrow">{data.company}</p> : null}
        <h1>{head}</h1>
        <p>{body}</p>
      </section>,
    );
  }

  const p = data.proposal;
  const canSign = fullName.trim().length >= 2 && agreed && (mode === 'type' || drawn) && !busy;

  return shell(
    <>
      <header className="pp-head">
        <div className="pp-brand">
          {/* The contractor's own logo from their branding settings: any host, any size. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.company.logo_url ? <img src={p.company.logo_url} alt="" className="pp-logo" /> : null}
          <span>{p.company.name}</span>
        </div>
        <p className="pp-eyebrow">Proposal{p.number ? ` · ${p.number}` : ''}</p>
        <h1>{p.title}</h1>
        <dl className="pp-facts">
          <div><dt>Prepared for</dt><dd>{[p.prepared_for.name, p.prepared_for.company].filter(Boolean).join(', ')}</dd></div>
          {p.project_name ? <div><dt>Project</dt><dd>{p.project_name}</dd></div> : null}
          <div><dt>Issued</dt><dd>{fmtDay(p.sent_at)}</dd></div>
          {p.valid_until ? <div><dt>Valid until</dt><dd>{fmtDay(p.valid_until)}</dd></div> : null}
        </dl>
      </header>

      <section className="pp-total" aria-label="Total">
        <span>Total</span>
        <b>{money(p.total)}</b>
      </section>

      {data.message ? <blockquote className="pp-note">{data.message}<cite>— {p.company.name}</cite></blockquote> : null}
      {p.introduction ? <section className="pp-sec"><h2>Introduction</h2><p>{p.introduction}</p></section> : null}

      {p.line_items.length > 0 && (
        <section className="pp-sec">
          <h2>Line items</h2>
          <table className="pp-lines">
            <thead><tr><th>Description</th><th className="r">Qty</th><th>Unit</th><th className="r">Unit price</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {p.line_items.map((l, i) => (
                <tr key={i}>
                  <td data-l="Description">{l.description || '—'}</td>
                  <td data-l="Qty" className="r">{l.quantity}</td>
                  <td data-l="Unit">{l.unit || '—'}</td>
                  <td data-l="Unit price" className="r">{money(l.unit_price)}</td>
                  <td data-l="Amount" className="r"><b>{money(l.amount)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4}>Total</td><td className="r"><b>{money(p.total)}</b></td></tr></tfoot>
          </table>
        </section>
      )}

      {p.scope ? <section className="pp-sec"><h2>Scope of work</h2><p>{p.scope}</p></section> : null}
      {p.payment_terms ? <section className="pp-sec"><h2>Payment terms</h2><p>{p.payment_terms}</p></section> : null}
      {p.exclusions ? <section className="pp-sec"><h2>Exclusions</h2><p>{p.exclusions}</p></section> : null}

      <p className="pp-hash">Document fingerprint (SHA-256): <code>{data.content_hash}</code></p>

      {!declining ? (
        <section className="pp-sign" aria-labelledby="pp-sign-h">
          <h2 id="pp-sign-h">Accept &amp; Sign</h2>
          <label className="pp-field">
            <span>Your full legal name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder={data.signer.name} maxLength={120} />
          </label>
          <label className="pp-field">
            <span>Title (optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" placeholder="e.g. Owner" maxLength={120} />
          </label>

          <div className="pp-seg" role="tablist" aria-label="How to sign">
            <button type="button" role="tab" aria-selected={mode === 'draw'} onClick={() => setMode('draw')}>Draw</button>
            <button type="button" role="tab" aria-selected={mode === 'type'} onClick={() => setMode('type')}>Type</button>
          </div>
          {mode === 'draw' ? (
            <div className="pp-pad">
              <SignatureCanvas ref={pad} height={190} onChange={(d) => setDrawn(!!d)} />
              <button type="button" className="pp-link" onClick={() => { pad.current?.clear(); setDrawn(false); }}>Clear signature</button>
            </div>
          ) : (
            <div className="pp-typed" aria-label="Your typed signature">{fullName.trim() || data.signer.name}</div>
          )}

          <label className="pp-consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>{data.consent_text}</span>
          </label>

          {error ? <p className="pp-err" role="alert">{error}</p> : null}

          <button type="button" className="pp-btn" onClick={() => void sign()} disabled={!canSign} aria-busy={busy === 'sign'}>
            {busy === 'sign' ? 'Signing…' : `Accept & Sign · ${money(p.total)}`}
          </button>
          <p className="pp-muted pp-small">Signing as {data.signer.email}. Your name, the time, your IP address and device are recorded with your signature. This link expires {fmtDay(data.expires_at)}.</p>
          <button type="button" className="pp-btn-2" onClick={() => { setError(''); setDeclining(true); }}>Decline</button>
        </section>
      ) : (
        <section className="pp-sign" aria-labelledby="pp-decline-h">
          <h2 id="pp-decline-h">Decline this proposal</h2>
          <label className="pp-field">
            <span>Why? (optional — {p.company.name} will see this)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={2000} />
          </label>
          {error ? <p className="pp-err" role="alert">{error}</p> : null}
          <button type="button" className="pp-btn pp-btn-danger" onClick={() => void decline()} disabled={!!busy} aria-busy={busy === 'decline'}>
            {busy === 'decline' ? 'Sending…' : 'Decline Proposal'}
          </button>
          <button type="button" className="pp-btn-2" onClick={() => { setError(''); setDeclining(false); }} disabled={!!busy}>Back to signing</button>
        </section>
      )}
      <p className="pp-muted pp-small pp-center">Sent with Saguaro Control Systems</p>
    </>,
  );
}

/* White document page. Ink #0f172a, body #1e293b, labels #475569, rules
   #cbd5e1 — the document palette (lib/document-palette). */
const CSS = `
html,body{background:#ffffff}
.pp{min-height:100vh;background:#ffffff;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;-webkit-text-size-adjust:100%}
.pp-in{max-width:760px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(40px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.pp h1{margin:4px 0 12px;font-size:28px;line-height:1.2;color:#0f172a;font-weight:800;letter-spacing:-.01em}
.pp h2{margin:0 0 8px;font-size:17px;color:#0f172a;font-weight:750}
.pp p{margin:0 0 10px}
.pp-muted{color:#475569}
.pp-small{font-size:14px}
.pp-center{text-align:center}
.pp-head{padding-bottom:16px;border-bottom:2px solid #0f172a}
.pp-brand{display:flex;align-items:center;gap:12px;font-weight:800;font-size:18px;color:#0f172a;margin-bottom:18px}
.pp-logo{height:40px;width:auto;max-width:160px;object-fit:contain}
.pp-eyebrow{margin:0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#475569}
.pp-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px 20px;margin:0}
.pp-facts dt{font-size:13px;color:#475569}
.pp-facts dd{margin:0;font-weight:650;color:#0f172a}
.pp-total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:18px 0;border-bottom:1px solid #cbd5e1}
.pp-total span{font-size:15px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em}
.pp-total b{font-size:32px;color:#0f172a;font-variant-numeric:tabular-nums}
.pp-note{margin:18px 0 0;padding:4px 0 4px 14px;border-left:3px solid #0f172a;color:#1e293b;white-space:pre-wrap}
.pp-note cite{display:block;margin-top:6px;font-style:normal;font-size:14px;color:#475569}
.pp-sec{padding:18px 0;border-bottom:1px solid #cbd5e1}
.pp-sec p{white-space:pre-wrap}
.pp-lines{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
.pp-lines th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#475569;text-align:left;padding:8px 6px;border-bottom:1px solid #cbd5e1}
.pp-lines td{padding:10px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
.pp-lines .r{text-align:right}
.pp-lines tfoot td{border-bottom:0;font-weight:700;color:#0f172a;padding-top:12px}
.pp-hash{margin:16px 0 0;font-size:13px;color:#475569;overflow-wrap:anywhere}
.pp-hash code{font-size:12px;color:#1e293b}
.pp-sign{margin-top:22px;padding-top:18px;border-top:2px solid #0f172a;display:flex;flex-direction:column;gap:14px}
.pp-field{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:650;color:#0f172a}
.pp-field input,.pp-field textarea{font:inherit;font-size:16px;font-weight:400;color:#0f172a;background:#ffffff;border:1px solid #94a3b8;border-radius:10px;padding:12px 14px;min-height:48px;width:100%;box-sizing:border-box}
.pp-field input:focus,.pp-field textarea:focus{outline:2px solid #0f172a;outline-offset:1px}
.pp-seg{display:flex;border:1px solid #94a3b8;border-radius:10px;padding:3px;gap:3px}
.pp-seg button{flex:1;min-height:44px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:16px;font-weight:650;color:#1e293b;cursor:pointer}
.pp-seg button[aria-selected=true]{background:#0f172a;color:#ffffff}
.pp-pad{display:flex;flex-direction:column;gap:6px}
.pp-pad canvas{border:1px solid #94a3b8}
.pp-typed{min-height:120px;display:flex;align-items:center;padding:0 18px;border:1px solid #94a3b8;border-radius:12px;font-family:"Snell Roundhand","Segoe Script","Brush Script MT",Georgia,serif;font-style:italic;font-size:40px;color:#0f172a;overflow-wrap:anywhere}
.pp-link{align-self:flex-start;min-height:44px;border:0;background:none;padding:0 2px;font:inherit;font-size:15px;color:#0f172a;text-decoration:underline;cursor:pointer}
.pp-consent{display:flex;gap:12px;align-items:flex-start;font-size:15px;color:#1e293b;cursor:pointer;padding:6px 0}
.pp-consent input{width:24px;height:24px;flex:none;margin:2px 0 0;accent-color:#0f172a}
.pp-err{margin:0;padding:10px 12px;border-left:3px solid #b91c1c;background:#fee2e2;color:#7f1d1d;font-size:15px}
.pp-btn{min-height:56px;width:100%;border:0;border-radius:12px;background:#0f172a;color:#ffffff;font:inherit;font-size:18px;font-weight:750;cursor:pointer}
.pp-btn:disabled{background:#cbd5e1;color:#475569;cursor:not-allowed}
.pp-btn-danger{background:#b91c1c}
.pp-btn-2{min-height:48px;width:100%;border:1px solid #94a3b8;border-radius:12px;background:#ffffff;color:#0f172a;font:inherit;font-size:16px;font-weight:650;cursor:pointer}
.pp-final{padding:48px 0;text-align:center}
.pp-final p{max-width:520px;margin:0 auto 12px}
.pp-check{display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#dcfce7;color:#15803d;font-size:34px;font-weight:800;margin-bottom:8px}
@media (max-width:600px){
  .pp h1{font-size:24px}
  .pp-total b{font-size:28px}
  .pp-lines thead{display:none}
  .pp-lines,.pp-lines tbody,.pp-lines tr,.pp-lines td{display:block;width:100%}
  .pp-lines tr{padding:10px 0;border-bottom:1px solid #e2e8f0}
  .pp-lines td{border:0;padding:2px 0;display:flex;justify-content:space-between;gap:12px;text-align:right}
  .pp-lines td::before{content:attr(data-l);color:#475569;font-size:13px;text-align:left}
  .pp-lines td[data-l=Description]{display:block;text-align:left;font-weight:650;color:#0f172a;padding-bottom:4px}
  .pp-lines td[data-l=Description]::before{content:none}
  .pp-lines tfoot,.pp-lines tfoot tr{display:block}
  .pp-lines tfoot td{display:flex;justify-content:space-between}
}
`;
