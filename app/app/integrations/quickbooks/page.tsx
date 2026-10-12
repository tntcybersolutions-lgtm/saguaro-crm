'use client';
/**
 * QuickBooks Online — connect, send, disconnect.
 *
 * Every control here does something real on the server:
 *   Connect / Reconnect  → GET /api/integrations/quickbooks?action=connect, in
 *                          THIS window (the iPhone app is a webview; popups
 *                          never open there). The server holds the Intuit keys
 *                          and the CSRF state — the browser holds neither.
 *   Send to QuickBooks   → POST /api/integrations/quickbooks/sync with the
 *                          record types ticked; one result per record comes back.
 *   Invoice start date   → POST { action: 'settings', startDate }.
 *   Disconnect           → POST { action: 'disconnect' }: revoked at Intuit,
 *                          tokens cleared.
 * The old direction (pull / bi-directional) and frequency (hourly / daily /
 * real-time) buttons are gone: nothing imported from QuickBooks and nothing
 * ever ran on a schedule. Bills are gone: they could not be sent correctly.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, Pill, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { Plugs, ArrowsClockwise, ArrowSquareOut } from '@phosphor-icons/react';
import { QBO_RETURN_MESSAGES, QBO_PAGE_PATH } from '@/lib/quickbooks/return-codes';

const GOLD = 'var(--brand-primary)';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';
const LINE = 'rgba(255,255,255,0.08)';

type Entity = 'customers' | 'vendors' | 'invoices';
type Counts = { created: number; linked: number; skipped: number; failed: number };
type HistoryEntry = { at: string; by: string; entities: Entity[]; counts: Counts; errors: { label: string; message: string }[]; remaining: number };
type Status = {
  configured: boolean;
  environment: 'sandbox' | 'production';
  connected: boolean;
  status: string | null;
  needsReconnect: boolean;
  reconnectReason: string | null;
  companyName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  startDate: string | null;
  itemName: string | null;
  history: HistoryEntry[];
  pending: { invoices: number; invoicesBeforeStart: number; vendors: number; customers: number } | null;
  canManage: boolean;
};
type RecordResult = { entity: 'customer' | 'vendor' | 'invoice'; id: string; label: string; outcome: 'created' | 'linked' | 'skipped' | 'failed'; qboId?: string; message?: string };
type RunResponse = {
  ok?: boolean;
  results?: RecordResult[];
  counts?: Counts;
  remaining?: Record<Entity, number>;
  beforeStart?: number;
  needsReconnect?: boolean;
  error?: string;
};

const btn44: React.CSSProperties = { minHeight: 44 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function when(d: string | null): string {
  if (!d) return 'Never';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function day(d: string | null): string {
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function countLine(c: Counts): string {
  const parts = [
    c.created ? `${c.created} added` : '',
    c.linked ? `${c.linked} linked` : '',
    c.skipped ? `${c.skipped} skipped` : '',
    c.failed ? `${c.failed} failed` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nothing to send';
}

const OUTCOME_TONE: Record<RecordResult['outcome'], 'green' | 'neutral' | 'amber' | 'red'> = { created: 'green', linked: 'neutral', skipped: 'amber', failed: 'red' };
const OUTCOME_WORD: Record<RecordResult['outcome'], string> = { created: 'Added', linked: 'Linked', skipped: 'Skipped', failed: 'Failed' };
const ENTITY_WORD: Record<RecordResult['entity'], string> = { customer: 'Customer', vendor: 'Vendor', invoice: 'Invoice' };

function SkeletonRow({ h = 52 }: { h?: number }) {
  return <div className="pmSkeleton" style={{ height: h, borderRadius: 10, background: 'rgba(255,255,255,0.05)', marginBottom: 10 }} />;
}

export default function QuickBooksPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<null | 'connect' | 'sync' | 'disconnect' | 'date'>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [send, setSend] = useState<Record<Entity, boolean>>({ invoices: true, vendors: true, customers: true });
  const [lastRun, setLastRun] = useState<RunResponse | null>(null);
  const [startDraft, setStartDraft] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/integrations/quickbooks?action=status');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load QuickBooks.');
      setSt(data as Status);
      setStartDraft((data as Status).startDate ?? '');
    } catch (e) {
      console.error(e);
      setLoadError(humanError(e, 'Could not load QuickBooks. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Back from Intuit with the browser's Back button: the page comes out of the
  // back-forward cache still saying "Opening Intuit…". Make it pressable again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { setBusy(null); load(); } };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [load]);

  // Back from Intuit: ?qb=<code> says how it went.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('qb');
    if (!code) return;
    const m = (QBO_RETURN_MESSAGES as Record<string, { ok: boolean; msg: string }>)[code];
    setToast(m ? { ok: m.ok, msg: m.msg } : { ok: false, msg: 'QuickBooks could not be connected. Please try again.' });
    window.history.replaceState({}, '', QBO_PAGE_PATH);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  function connect() {
    setBusy('connect');
    // Same window, on purpose — see the header comment.
    window.location.href = '/api/integrations/quickbooks?action=connect';
  }

  async function sync() {
    const entities = (['customers', 'vendors', 'invoices'] as Entity[]).filter((e) => send[e]);
    if (!entities.length) { setToast({ ok: false, msg: 'Tick at least one thing to send.' }); return; }
    setBusy('sync');
    setLastRun(null);
    try {
      const res = await fetch('/api/integrations/quickbooks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities }),
      });
      const data = (await res.json().catch(() => ({}))) as RunResponse;
      if (Array.isArray(data.results)) setLastRun(data);
      if (!res.ok) {
        setToast({ ok: false, msg: data.error || 'QuickBooks sync failed. Please try again.' });
      } else {
        const c = data.counts ?? { created: 0, linked: 0, skipped: 0, failed: 0 };
        const left = data.remaining ? data.remaining.customers + data.remaining.vendors + data.remaining.invoices : 0;
        setToast({
          ok: c.failed === 0,
          msg: `${countLine(c)}.${left ? ` ${plural(left, 'record')} left — press Send again.` : ''}`,
        });
      }
    } catch (e) {
      console.error(e);
      setToast({ ok: false, msg: 'QuickBooks sync failed — check your connection and try again.' });
    }
    setBusy(null);
    load();
  }

  async function saveStart(value: string | null) {
    setBusy('date');
    try {
      const res = await fetch('/api/integrations/quickbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settings', startDate: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the start date.');
      setToast({ ok: true, msg: value ? `Pay apps dated ${day(value)} or later will be invoiced.` : 'Every approved, certified or paid pay app will be invoiced.' });
      await load();
    } catch (e) {
      console.error(e);
      setToast({ ok: false, msg: humanError(e, 'Could not save the start date.') });
      setStartDraft(st?.startDate ?? '');
    }
    setBusy(null);
  }

  async function disconnect() {
    const yes = await confirmDialog({
      title: 'Disconnect QuickBooks?',
      message: 'Saguaro stops sending to QuickBooks and Intuit revokes its access. Invoices and vendors already in QuickBooks stay there.',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!yes) return;
    setBusy('disconnect');
    try {
      const res = await fetch('/api/integrations/quickbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not disconnect QuickBooks.');
      setToast({ ok: !data.warning, msg: data.message || 'QuickBooks disconnected.' });
      setLastRun(null);
      await load();
    } catch (e) {
      console.error(e);
      setToast({ ok: false, msg: humanError(e, 'Could not disconnect QuickBooks.') });
    }
    setBusy(null);
  }

  const connected = !!st?.connected;
  const canManage = !!st?.canManage;
  const p = st?.pending;
  const sandbox = st?.environment === 'sandbox';

  const connectButton = (label: string) => (
    <button type="button" onClick={connect} disabled={busy === 'connect'} className="pmBtn"
      style={{ ...goldButtonStyle, ...btn44, opacity: busy === 'connect' ? 0.6 : 1 }}>
      <Plugs size={16} weight="fill" /> {busy === 'connect' ? 'Opening Intuit…' : label}
    </button>
  );

  const failuresFirst = (lastRun?.results ?? []).slice().sort((a, b) => Number(b.outcome === 'failed') - Number(a.outcome === 'failed'));

  return (
    <PremiumSurface maxWidth={2200}>
      {toast && (
        <div role="status" style={{
          position: 'fixed', top: 16, left: 16, right: 16, margin: '0 auto', maxWidth: 560, zIndex: 1000,
          padding: '14px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, lineHeight: 1.45,
          background: 'var(--bg-surface)', border: `1px solid ${toast.ok ? GREEN : RED}`, color: toast.ok ? GREEN : RED,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 20, minWidth: 44, minHeight: 44 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 14, color: DIM }}>
        <Link href="/app/integrations" style={{ color: 'var(--link)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Integrations</Link>
        <span>/</span>
        <span style={{ color: TEXT }}>QuickBooks Online</span>
      </div>

      <ModuleHero
        title="QuickBooks"
        accent="Online"
        subtitle={connected
          ? `Connected to ${st?.companyName || 'your QuickBooks company'}${sandbox ? ' (sandbox)' : ''}.`
          : 'Send approved pay apps to QuickBooks as invoices, and your subs as vendors.'}
      />

      {loading && <SectionCard><SkeletonRow /><SkeletonRow /><SkeletonRow h={120} /></SectionCard>}

      {!loading && loadError && (
        <SectionCard>
          <PremiumEmpty tone="error" title="QuickBooks didn't load." description={loadError}
            action={<button type="button" onClick={() => { setLoading(true); load(); }} className="pmBtn" style={{ ...ghostButtonStyle, ...btn44 }}>Try again</button>} />
        </SectionCard>
      )}

      {!loading && st && !st.configured && !connected && (
        <SectionCard>
          <PremiumEmpty
            title="QuickBooks isn't set up on this server yet."
            description="The Intuit app keys have not been added to the hosting settings. Once they are, this page connects in one step."
            action={<Link href="/app/integrations" className="pmBtn" style={{ ...ghostButtonStyle, ...btn44 }}>Back to integrations</Link>}
          />
        </SectionCard>
      )}

      {!loading && st && st.configured && !connected && (
        <SectionCard>
          {st.needsReconnect ? (
            <PremiumEmpty
              tone="error"
              title="QuickBooks needs to be connected again."
              description={`${st.reconnectReason || 'The authorization expired or was revoked.'} Nothing is sent until it is reconnected; records already in QuickBooks stay linked.`}
              action={canManage ? connectButton('Reconnect QuickBooks') : undefined}
            />
          ) : (
            <PremiumEmpty
              title="Connect QuickBooks Online."
              description={`You sign in at Intuit and pick the company${sandbox ? ' (sandbox)' : ''}. Saguaro then sends approved pay apps as invoices to each job's owner, and your subs as vendors.`}
              action={canManage ? connectButton('Connect QuickBooks') : undefined}
            />
          )}
          {!canManage && <p style={{ margin: '10px 0 0', fontSize: 14, color: DIM }}>Only a company admin can connect QuickBooks.</p>}
        </SectionCard>
      )}

      {!loading && st && connected && (
        <>
          <StatStrip items={[
            { label: 'Company', value: st.companyName || 'Connected', sub: sandbox ? 'Sandbox' : `Since ${when(st.connectedAt)}`, accent: GREEN },
            { label: 'Pay apps to invoice', value: String(p?.invoices ?? 0), sub: st.startDate ? `Dated ${day(st.startDate)} or later` : 'Approved, certified or paid' },
            { label: 'Subs to add', value: String(p?.vendors ?? 0), sub: 'Not in QuickBooks yet' },
            { label: 'Last send', value: st.lastSyncAt ? when(st.lastSyncAt) : 'Never', sub: st.history[0] ? countLine(st.history[0].counts) : 'Nothing sent yet' },
          ]} />

          {canManage ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18, marginBottom: 24 }}>
              <SectionCard title="What to send" subtitle="Tick what this press of Send includes. Nothing already in QuickBooks is sent twice.">
                {([
                  { key: 'invoices', label: 'Pay apps → Invoices', sub: `${plural(p?.invoices ?? 0, 'pay app')} ready. Amount is the current payment due (G702 line 8), billed to the job's owner.` },
                  { key: 'vendors', label: 'Subs → Vendors', sub: `${plural(p?.vendors ?? 0, 'sub')} not in QuickBooks yet. A vendor with the same name is linked, not duplicated.` },
                  { key: 'customers', label: 'Job owners → Customers', sub: `${plural(p?.customers ?? 0, 'owner')} not linked yet. Owners are also added with their first invoice.` },
                ] as { key: Entity; label: string; sub: string }[]).map((row) => (
                  <label key={row.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 4px', minHeight: 44, cursor: 'pointer', borderBottom: `1px solid ${LINE}` }}>
                    <input type="checkbox" checked={send[row.key]} onChange={(e) => setSend((s) => ({ ...s, [row.key]: e.target.checked }))}
                      style={{ accentColor: GOLD, width: 20, height: 20, marginTop: 2, flexShrink: 0 }} />
                    <span>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: TEXT }}>{row.label}</span>
                      <span style={{ display: 'block', fontSize: 13, color: DIM, marginTop: 2, lineHeight: 1.45 }}>{row.sub}</span>
                    </span>
                  </label>
                ))}
                <div style={{ marginTop: 14 }}>
                  <button type="button" onClick={sync} disabled={busy === 'sync'} className="pmBtn"
                    style={{ ...goldButtonStyle, ...btn44, width: '100%', opacity: busy === 'sync' ? 0.6 : 1 }}>
                    <ArrowsClockwise size={16} weight="bold" /> {busy === 'sync' ? 'Sending to QuickBooks…' : 'Send to QuickBooks'}
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Invoice pay apps from" subtitle="Pay apps dated before this are not sent, so invoices the office already keyed into QuickBooks are not billed twice.">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={startDraft}
                    onChange={(e) => setStartDraft(e.target.value)}
                    aria-label="Invoice pay apps dated on or after"
                    style={{ flex: '1 1 180px', minHeight: 44, padding: '8px 12px', fontSize: 16, borderRadius: 10, background: 'var(--bg-surface-2)', color: TEXT, border: `1px solid ${LINE}`, colorScheme: 'dark', boxSizing: 'border-box' }}
                  />
                  <button type="button" onClick={() => saveStart(startDraft || null)} disabled={busy === 'date' || (startDraft || null) === (st.startDate ?? null)} className="pmBtn"
                    style={{ ...goldButtonStyle, ...btn44, opacity: busy === 'date' || (startDraft || null) === (st.startDate ?? null) ? 0.5 : 1 }}>
                    Save date
                  </button>
                  {st.startDate && (
                    <button type="button" onClick={() => { setStartDraft(''); saveStart(null); }} disabled={busy === 'date'} className="pmBtn" style={{ ...ghostButtonStyle, ...btn44 }}>
                      Send all
                    </button>
                  )}
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 14, color: DIM, lineHeight: 1.5 }}>
                  {st.startDate
                    ? (p?.invoicesBeforeStart
                      ? `${plural(p.invoicesBeforeStart, 'earlier pay app')} dated before ${day(st.startDate)} ${p.invoicesBeforeStart === 1 ? 'is' : 'are'} held back. Move the date back to send ${p.invoicesBeforeStart === 1 ? 'it' : 'them'}.`
                      : `No pay apps are held back by this date.`)
                    : 'No start date — every approved, certified or paid pay app not yet in QuickBooks is sent.'}
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: DIM, lineHeight: 1.5 }}>
                  Invoices post to the QuickBooks item {st.itemName ? <b style={{ color: TEXT }}>{st.itemName}</b> : <>named <b style={{ color: TEXT }}>Progress Billing</b> (or <b style={{ color: TEXT }}>Services</b>; Saguaro creates Progress Billing if neither exists)</>}. A paid pay app arrives as an open invoice — receive the payment against it in QuickBooks.
                </p>
              </SectionCard>
            </div>
          ) : (
            <SectionCard style={{ marginBottom: 24 }}>
              <p style={{ margin: 0, fontSize: 14, color: DIM }}>Only a company admin can send to or disconnect QuickBooks.</p>
            </SectionCard>
          )}

          {lastRun && failuresFirst.length > 0 && (
            <SectionCard title="This send" subtitle={lastRun.counts ? countLine(lastRun.counts) : undefined} style={{ marginBottom: 24 }}>
              {failuresFirst.map((r, i) => (
                <div key={`${r.entity}-${r.id}-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
                  <Pill tone={OUTCOME_TONE[r.outcome]}>{OUTCOME_WORD[r.outcome]}</Pill>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{ENTITY_WORD[r.entity]} · {r.label}</div>
                    {(r.message || r.qboId) && (
                      <div style={{ fontSize: 13, color: r.outcome === 'failed' ? RED : DIM, marginTop: 2, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                        {r.message || `QuickBooks id ${r.qboId}`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </SectionCard>
          )}

          <SectionCard title="Send history" subtitle="The last 25 sends." style={{ marginBottom: 24 }}>
            {st.history.length === 0 ? (
              <PremiumEmpty compact title="Nothing sent yet." description={canManage ? 'Press Send to QuickBooks to make the first send.' : undefined} />
            ) : st.history.map((h) => (
              <div key={h.at} style={{ padding: '10px 0', borderBottom: `1px solid ${LINE}` }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{when(h.at)}</span>
                  <Pill tone={h.counts.failed ? 'red' : 'green'}>{h.counts.failed ? `${h.counts.failed} failed` : 'All sent'}</Pill>
                </div>
                <div style={{ fontSize: 13, color: DIM, marginTop: 4, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  {countLine(h.counts)} · {h.entities.join(', ')}{h.by ? ` · by ${h.by.split('@')[0]}` : ''}{h.remaining ? ` · ${h.remaining} left for the next send` : ''}
                </div>
                {h.errors.slice(0, 3).map((e, i) => (
                  <div key={i} style={{ fontSize: 13, color: RED, marginTop: 4, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{e.label}: {e.message}</div>
                ))}
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Connection" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', fontSize: 14, color: DIM, lineHeight: 1.5 }}>
                {st.companyName || 'QuickBooks company'}{sandbox ? ' (sandbox)' : ''} · connected {when(st.connectedAt)}. Access renews by itself; if Intuit ever ends it, this page asks you to reconnect.
              </div>
              <a href={sandbox ? 'https://app.sandbox.qbo.intuit.com/app/invoices' : 'https://app.qbo.intuit.com/app/invoices'} target="_blank" rel="noreferrer" className="pmBtn" style={{ ...ghostButtonStyle, ...btn44 }}>
                <ArrowSquareOut size={15} weight="bold" /> Open QuickBooks
              </a>
              {canManage && (
                <button type="button" onClick={disconnect} disabled={busy === 'disconnect'} className="pmBtn"
                  style={{ ...ghostButtonStyle, ...btn44, color: RED, borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)', opacity: busy === 'disconnect' ? 0.6 : 1 }}>
                  {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                </button>
              )}
            </div>
          </SectionCard>
        </>
      )}
    </PremiumSurface>
  );
}
