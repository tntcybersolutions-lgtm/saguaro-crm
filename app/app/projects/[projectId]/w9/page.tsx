'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { T, Badge, Table } from '@/components/ui/shell';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty,
  StatStrip, FlowSteps, AutoChip,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { Users, CheckCircle, Clock, XCircle, FileText, PaperPlaneTilt, Plus, SealCheck } from '@phosphor-icons/react';

interface W9Sub {
  id: string;
  name: string;
  email: string;
  w9_status: string;
  requested_date: string | null;
  received_date: string | null;
}

const STATUS_BADGE: Record<string, 'green' | 'amber' | 'muted'> = {
  received: 'green',
  pending: 'amber',
  not_requested: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  submitted: 'Received',
  pending: 'Pending',
  not_requested: 'Not Requested',
};

// Semantic accents tuned to the cinematic dark surface (match the dashboard).
const GOLD = 'var(--brand-primary)';
const GREEN = '#2CFF7A';
const AMBER = 'var(--warning)';
const RED = '#FF3B30';

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.62)', marginBottom: 6 };
// Compact on-brand action button for in-table row actions.
const rowActionStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '6px 13px', borderRadius: 8, cursor: 'pointer',
  background: 'var(--brand-primary-12)', color: 'var(--brand-primary-strong)',
  border: '1px solid var(--brand-primary-35)', fontWeight: 700, fontSize: 12,
  whiteSpace: 'nowrap',
};

type W9Filter = 'all' | 'received' | 'pending' | 'missing';

export default function W9Page() {
  const params = useParams();
  const projectId = params.projectId as string;
  const base = `/app/projects/${projectId}`;
  const [subs, setSubs] = useState<W9Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  // Which slice of the roster the table shows. The stat cards above drive this
  // so a click on "W9 Pending" drills the list to exactly those rows, instead
  // of the number being a dead decoration.
  const [filter, setFilter] = useState<W9Filter>('all');
  const tableRef = React.useRef<HTMLDivElement | null>(null);
  const setFilterAndScroll = (f: W9Filter) => {
    setFilter(prev => (prev === f ? 'all' : f));
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  // Project intelligence — roster + bid packages from one snapshot. W-9s are
  // not paperwork for its own sake: the bid-award gate refuses to award to a
  // sub with no W-9 on file, so coverage here is what unblocks buyout.
  const { ctx } = useProjectContext(projectId);
  const [autoFill, setAutoFill] = useState(false);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      // The project "subs" come from the contracts table (vendor_name only, no
      // w9_status columns). The real W-9 state lives in w9_requests — merge it
      // in so a sent request actually reflects as Pending/Received and survives
      // reload (the old code read a nonexistent contracts.w9_status and always
      // showed "not_requested").
      const [projRes, w9Res] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/documents/w9-request?projectId=${projectId}`),
      ]);
      const data = await projRes.json().catch(() => ({}));
      const w9Data = await w9Res.json().catch(() => ({}));
      const subList = data.subs || data.subcontractors || [];
      const w9reqs: any[] = w9Data.w9Requests || [];

      const norm = (v: any) => String(v || '').toLowerCase().trim();
      // Requests arrive newest-first; keep the newest per key.
      const byName = new Map<string, any>();
      const byEmail = new Map<string, any>();
      for (const r of w9reqs) {
        const n = norm(r.vendor_name); const e = norm(r.vendor_email);
        if (n && !byName.has(n)) byName.set(n, r);
        if (e && !byEmail.has(e)) byEmail.set(e, r);
      }
      const statusOf = (r: any) =>
        (r.status === 'submitted' || r.status === 'received') ? 'received' : 'pending';
      const dateOnly = (v: any) => (v ? String(v).split('T')[0] : null);

      const rows: W9Sub[] = subList.map((s: any) => {
        const name = s.vendor_name || s.name || s.company_name || '';
        const email = s.vendor_email || s.email || s.contact_email || '';
        const match = (email && byEmail.get(norm(email))) || (name && byName.get(norm(name))) || null;
        return {
          id: s.id || s.sub_id || `s-${Math.random()}`,
          name,
          email,
          w9_status: match ? statusOf(match) : 'not_requested',
          requested_date: match ? dateOnly(match.created_at) : null,
          received_date: match ? dateOnly(match.submitted_at) : null,
        };
      });

      // Include standalone vendor requests (sent via the form, not tied to a
      // contract) so they are visible too.
      const seen = new Set(rows.map((r) => norm(r.email) || norm(r.name)));
      for (const r of w9reqs) {
        const key = norm(r.vendor_email) || norm(r.vendor_name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        rows.push({
          id: r.id,
          name: r.vendor_name || '',
          email: r.vendor_email || '',
          w9_status: statusOf(r),
          requested_date: dateOnly(r.created_at),
          received_date: dateOnly(r.submitted_at),
        });
      }
      setSubs(rows);
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const totalSubs = subs.length;
  const receivedCount = subs.filter(s => s.w9_status === 'received' || s.w9_status === 'submitted').length;
  const pendingCount = subs.filter(s => s.w9_status === 'pending').length;
  const missingCount = subs.filter(s => s.w9_status === 'not_requested').length;

  const matchesFilter = (s: W9Sub) => {
    if (filter === 'all') return true;
    if (filter === 'received') return s.w9_status === 'received' || s.w9_status === 'submitted';
    if (filter === 'pending') return s.w9_status === 'pending';
    return s.w9_status === 'not_requested'; // 'missing'
  };
  const filteredSubs = subs.filter(matchesFilter);
  const FILTER_LABEL: Record<W9Filter, string> = { all: 'All subs', received: 'W-9 received', pending: 'W-9 pending', missing: 'W-9 missing' };

  // Roster subs with no W-9 trail here at all — surfaced so the bid-award gate
  // ("W-9 not on file" blocks award) never surprises anyone at buyout.
  const rosterNorm = (v: any) => String(v || '').toLowerCase().trim();
  const ctxSubs = (ctx?.subs || []) as any[];
  const trackedKeys = new Set(subs.flatMap(s => [rosterNorm(s.email), rosterNorm(s.name)]).filter(Boolean));
  const untrackedRoster = ctxSubs.filter(s => !trackedKeys.has(rosterNorm(s.email)) && !trackedKeys.has(rosterNorm(s.companyName)));
  const bidPackages = (ctx?.bidPackages || []) as any[];
  const awardedPkgs = bidPackages.filter(p => String(p.status || '').toLowerCase() === 'awarded').length;
  const openPkgs = Math.max(0, bidPackages.length - awardedPkgs);
  const subCommitted = ctxSubs.reduce((t, s) => t + (Number(s.contractAmount) || 0), 0);
  const fmt = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }));

  async function requestW9(subId: string, subName: string, subEmail: string) {
    if (!subEmail.trim()) {
      setToast(`No email on file for ${subName || 'this vendor'}. Use "Send W-9 Request" to enter one.`);
      setTimeout(() => setToast(''), 4000);
      return;
    }
    setRequestingId(subId);
    try {
      const res = await fetch('/api/documents/w9-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, subId, vendorName: subName, vendorEmail: subEmail }),
      });
      if (!res.ok) throw new Error('request failed');
      setSubs(prev => prev.map(s => s.id === subId ? { ...s, w9_status: 'pending', requested_date: new Date().toISOString().split('T')[0] } : s));
      setToast(`W-9 request sent to ${subName}.`);
    } catch {
      setToast(`Could not send the W-9 request to ${subName}. Please try again.`);
    }
    setRequestingId(null);
    setTimeout(() => setToast(''), 4000);
  }

  async function sendNewRequest() {
    if (!formName.trim() || !formEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/documents/w9-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, vendorName: formName, vendorEmail: formEmail }),
      });
      if (!res.ok) throw new Error('request failed');
      setToast(`W-9 request sent to ${formEmail}.`);
      setFormName('');
      setFormEmail('');
      setShowForm(false);
      fetchSubs();
    } catch {
      setToast('Could not send the W-9 request. Please try again.');
    }
    setSending(false);
    setTimeout(() => setToast(''), 4000);
  }

  const formValid = !!formName.trim() && !!formEmail.trim();

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="W-9 Requests"
        eyebrowIcon={<FileText size={13} weight="fill" style={{ color: GOLD }} />}
        title="W-9"
        accent="Requests"
        subtitle="Collect W-9 forms from vendors and subcontractors."
        actions={
          <button
            onClick={() => setShowForm(p => !p)}
            className="pmBtn"
            style={showForm ? ghostButtonStyle : goldButtonStyle}
          >
            {showForm ? 'Cancel' : <><Plus size={15} weight="bold" /> Send W-9 Request</>}
          </button>
        }
      />

      {/* Project context strip — roster, commitments, and the award gate */}
      {ctx && (
        <StatStrip items={[
          { label: 'Roster Subs', value: String(ctxSubs.length), icon: <Users size={12} style={{ color: GOLD }} />, sub: 'Open the subcontractor list', href: `${base}/subs` },
          { label: 'Sub Commitments', value: fmt(subCommitted), sub: 'Awarded value — open budget', href: `${base}/budget` },
          { label: 'W-9 Coverage', value: `${receivedCount} of ${totalSubs || ctxSubs.length}`, accent: receivedCount > 0 && receivedCount >= (totalSubs || ctxSubs.length) ? GREEN : AMBER, sub: 'Show the ones on file', onClick: () => setFilterAndScroll('received') },
          { label: 'Bid Packages', value: `${awardedPkgs} awarded`, sub: openPkgs > 0 ? `${openPkgs} open — open bid packages` : 'Open bid packages', href: `${base}/bid-packages` },
          { label: 'Not Yet Asked', value: String(missingCount + untrackedRoster.length), accent: missingCount + untrackedRoster.length > 0 ? RED : GREEN, sub: missingCount + untrackedRoster.length > 0 ? 'Show who still needs asking' : 'Everyone has been asked', onClick: () => setFilterAndScroll('missing') },
        ]} />
      )}

      {/* Stats — each card is a live filter on the W-9 Status list below.
          Click "W9 Pending" and the table drills to exactly those rows. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard icon={<Users size={19} weight="duotone" style={{ color: GOLD }} />} label="Total Subs" value={String(totalSubs)} accent={GOLD} active={filter === 'all'} onClick={() => setFilterAndScroll('all')} delay={0.02} />
        <StatCard icon={<CheckCircle size={19} weight="duotone" style={{ color: GREEN }} />} label="W-9 Received" value={String(receivedCount)} accent={GREEN} active={filter === 'received'} onClick={() => setFilterAndScroll('received')} delay={0.06} />
        <StatCard icon={<Clock size={19} weight="duotone" style={{ color: AMBER }} />} label="W-9 Pending" value={String(pendingCount)} accent={AMBER} active={filter === 'pending'} onClick={() => setFilterAndScroll('pending')} delay={0.10} />
        <StatCard icon={<XCircle size={19} weight="duotone" style={{ color: RED }} />} label="W-9 Missing" value={String(missingCount)} accent={RED} active={filter === 'missing'} onClick={() => setFilterAndScroll('missing')} delay={0.14} />
      </div>

      {toast && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(44,255,122,0.3)`, borderRadius: 10, color: T.green, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* Send Form */}
      {showForm && (
        <SectionCard
          title="Send W-9 Request"
          icon={<PaperPlaneTilt size={17} weight="duotone" style={{ color: GOLD }} />}
          style={{ marginBottom: 24 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {ctxSubs.length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>From the Project Roster</label>
                <select
                  value={autoFill ? (ctxSubs.find(s => s.companyName === formName)?.id || '') : ''}
                  onChange={e => {
                    const s = ctxSubs.find(x => x.id === e.target.value);
                    if (s) { setFormName(s.companyName || ''); setFormEmail(s.email || ''); setAutoFill(true); }
                    else setAutoFill(false);
                  }}
                  style={inp}
                >
                  <option value="">Someone else — enter details below</option>
                  {ctxSubs.map((s: any) => <option key={s.id} value={s.id}>{s.companyName}{s.trade ? ` — ${s.trade}` : ''}{s.email ? '' : ' (no email on file)'}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Vendor / Sub Name *{autoFill && !!formName && <AutoChip label="Roster" />}</label>
              <input value={formName} onChange={e => { setFormName(e.target.value); setAutoFill(false); }} placeholder="ABC Electrical LLC" style={inp} />
            </div>
            <div>
              <label style={lbl}>Email Address *{autoFill && !!formEmail && <AutoChip label="Roster" />}</label>
              <input type="email" value={formEmail} onChange={e => { setFormEmail(e.target.value); setAutoFill(false); }} placeholder="accounting@vendor.com" style={inp} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', marginTop: 12, padding: '10px 14px', background: T.goldDim, border: `1px solid ${T.borderGold}`, borderRadius: 10 }}>
            The vendor gets an email with a secure link to submit their W-9. Once it comes back it is marked on file — until then, the bid-award gate flags this sub with &quot;W-9 not on file&quot; and blocks award.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              onClick={sendNewRequest}
              disabled={sending || !formValid}
              className="pmBtn"
              style={{ ...goldButtonStyle, opacity: (sending || !formValid) ? 0.5 : 1, cursor: (sending || !formValid) ? 'not-allowed' : 'pointer' }}
            >
              <PaperPlaneTilt size={15} weight="fill" /> {sending ? 'Sending…' : 'Send Request'}
            </button>
            <button onClick={() => setShowForm(false)} className="pmBtn" style={ghostButtonStyle}>Cancel</button>
          </div>
        </SectionCard>
      )}

      {/* Roster gaps — subs on the project with no W-9 trail at all */}
      {!loading && untrackedRoster.length > 0 && (
        <SectionCard
          title="On the Roster, Never Asked"
          subtitle="On the project with no W-9 on record. The award gate will flag these."
          icon={<SealCheck size={17} weight="duotone" style={{ color: AMBER }} />}
          style={{ marginBottom: 24 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {untrackedRoster.map((s: any) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.companyName}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{s.trade || 'Subcontractor'}{Number(s.contractAmount) > 0 ? ` · ${fmt(Number(s.contractAmount))}` : ''}</div>
                </div>
                <button
                  className="pmBtn"
                  style={rowActionStyle}
                  onClick={() => {
                    if (s.email) { requestW9(s.id, s.companyName || '', s.email).then(() => fetchSubs()); }
                    else { setFormName(s.companyName || ''); setFormEmail(''); setAutoFill(true); setShowForm(true); }
                  }}
                >
                  {s.email ? 'Request W-9' : 'Add Email'}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Table */}
      <div ref={tableRef} style={{ scrollMarginTop: 80 }} />
      {filter !== 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '9px 14px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 13, color: T.white }}>
          <span>Showing <strong style={{ color: GOLD }}>{FILTER_LABEL[filter]}</strong> — {filteredSubs.length} of {subs.length}</span>
          <button onClick={() => setFilter('all')} className="pmBtn" style={{ ...rowActionStyle, marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', color: T.white, border: `1px solid ${T.border}` }}>Clear Filter</button>
        </div>
      )}
      <SectionCard title="W-9 Status" icon={<FileText size={17} weight="duotone" style={{ color: GOLD }} />} flush>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.62)' }}>Loading…</div>
        ) : subs.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 340px' : '1fr', alignItems: 'stretch' }}>
            <PremiumEmpty
              icon={<FileText size={30} weight="duotone" style={{ color: GOLD }} />}
              title="No W-9s Tracked Yet"
              description={ctxSubs.length > 0
                ? `${ctxSubs.length} sub${ctxSubs.length === 1 ? '' : 's'} on the roster and none have been asked for a W-9 yet. A missing W-9 blocks bid award — collect them now and buyout never stalls.`
                : 'Vendors appear here as you award bid packages and sign contracts. A missing W-9 blocks bid award, so requests usually go out at buyout.'}
              action={
                <button onClick={() => setShowForm(true)} className="pmBtn" style={goldButtonStyle}>
                  <Plus size={15} weight="bold" /> Send First W-9 Request
                </button>
              }
            />
            {ctx && (
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', padding: '22px 24px' }}>
                <FlowSteps steps={[
                  { title: 'Request Goes Out', desc: 'The vendor gets an email with a secure submission link — no account needed.' },
                  { title: 'Vendor Submits', desc: 'The completed W-9 lands here and the vendor is marked on file.' },
                  { title: 'Award Gate Clears', desc: 'Bid packages refuse to award to a sub with no W-9 — on file means buyout proceeds.' },
                  { title: '1099s at Year End', desc: 'TINs are on record before the first check is cut, not chased in January.' },
                ]} />
              </div>
            )}
          </div>
        ) : filteredSubs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.62)', fontSize: 13 }}>
            No subs are <strong style={{ color: GOLD }}>{FILTER_LABEL[filter].toLowerCase()}</strong>.{' '}
            <button onClick={() => setFilter('all')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary-strong)', cursor: 'pointer', fontWeight: 700, fontSize: 13, textDecoration: 'underline', padding: 0 }}>Show All {subs.length}</button>
          </div>
        ) : (
          <div style={{ padding: '4px 8px 8px' }}>
            <Table
              headers={['Sub Name', 'Email', 'W-9 Status', 'Requested Date', 'Received Date', 'Actions']}
              rows={filteredSubs.map(s => [
                <span key="n" style={{ fontWeight: 600 }}>{s.name}</span>,
                <span key="e" style={{ color: T.muted }}>{s.email}</span>,
                <Badge key="st" label={STATUS_LABEL[s.w9_status] || s.w9_status} color={STATUS_BADGE[s.w9_status] || 'muted'} />,
                <span key="rd" style={{ color: T.muted }}>{s.requested_date || '—'}</span>,
                <span key="rv" style={{ color: s.received_date ? T.green : T.muted }}>{s.received_date || '—'}</span>,
                <div key="act">
                  {(s.w9_status === 'not_requested' || s.w9_status === 'pending') && (
                    <button
                      onClick={() => requestW9(s.id, s.name, s.email)}
                      disabled={requestingId === s.id}
                      className="pmBtn"
                      style={{ ...rowActionStyle, opacity: requestingId === s.id ? 0.5 : 1, cursor: requestingId === s.id ? 'not-allowed' : 'pointer' }}
                    >
                      {requestingId === s.id ? 'Sending…' : s.w9_status === 'pending' ? 'Resend' : 'Request W-9'}
                    </button>
                  )}
                  {(s.w9_status === 'received' || s.w9_status === 'submitted') && (
                    <span style={{ fontSize: 12, color: T.green, fontWeight: 600 }}>Submitted</span>
                  )}
                </div>,
              ])}
            />
          </div>
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
