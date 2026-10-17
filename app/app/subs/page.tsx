'use client';
/**
 * Subs & Vendors — the company-wide directory of everyone the GC pays.
 *
 * WHY THIS PAGE DID NOT EXIST, AND WHY THAT MATTERED.
 * The subcontractors table is tenant-wide: a sub entered on one job is on file
 * for every job after it, with their trade, license, insurance expiry, W-9
 * status and prequalification. /api/subcontractors has served that list the
 * whole time. Nothing rendered it. The only place a GC could see their own
 * subs was the invite dropdown inside a single bid package — so the directory
 * that the award gate reads, that compliance reports on and that QuickBooks
 * syncs against was invisible to the person who built it.
 *
 * "Who am I working with, and are they papered up" is a question a GC asks
 * weekly. It had no screen.
 *
 * SCOPE, deliberately: this is OUTSIDE a job, so it is a directory of things —
 * who they are, what they do, whether their paperwork is current. What a sub is
 * doing ON a job stays on the job, at /app/projects/[id]/subs, where the
 * contract amounts and awarded packages live. The two answer different
 * questions and must not be merged into one screen that answers neither.
 *
 * NOT catalog vendors. catalog_vendors is a price column on the 223-item
 * catalog — sixteen suppliers you compare prices across, never award work to,
 * never chase a W-9 from. It belongs in Catalog and stays there. The word
 * "Vendors" is in this page's name because THIS table holds them too: its own
 * trade list carries Ready-Mix, Trucking / Hauling and Testing & Inspection,
 * which are vendors a GC contracts with.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DataTable, type Column } from '@/components/ui/kit';
import { StatusPill } from '@/components/ui/Status';
import Link from 'next/link';
import { useOpenRecord } from '@/lib/ui/open-on-new';
import {
  UsersThree, ShieldCheck, WarningCircle, SealCheck, Buildings,
  MagnifyingGlass, Phone, EnvelopeSimple, IdentificationCard, Package, Check, X, Warning,
} from '@phosphor-icons/react';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty,
  goldButtonStyle,
} from '@/components/ui/premium';
import { SkeletonRow } from '../../../components/ui/Skeleton';

const GOLD = 'var(--brand-primary)', CARD = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)';
const TEXT = 'var(--text-primary)', DIM = 'var(--text-secondary)', GREEN = 'var(--success)', RED = 'var(--danger)', AMBER = 'var(--warning)';

interface Sub {
  id: string;
  company_name: string | null;
  trade: string | null;
  contact_name: string | null;
  email: string | null;
  contact_email: string | null;
  phone: string | null;
  contact_phone: string | null;
  license_number: string | null;
  license_expiry: string | null;
  insurance_expiry: string | null;
  w9_on_file: boolean | null;
  status: string | null;
  prequalified: boolean | null;
  total_awarded: number | null;
  blacklisted: boolean | null;
}

/** A calendar day carries no timezone, so it must not be given one —
 *  `new Date('2026-10-14')` is midnight UTC and formats a day early west of
 *  Greenwich. Same reason the bid jacket needed this. */
function parseDay(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Expiry read the way a GC reads it: gone, going, or fine. */
function expiryState(iso: string | null): { label: string; status: 'not_on_file' | 'expired' | 'expiring' | 'active' } {
  const d = parseDay(iso);
  if (!d) return { label: 'Not on File', status: 'not_on_file' };
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Expired ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, status: 'expired' };
  if (days <= 30) return { label: `${days}d left`, status: 'expiring' };
  return { label: `Through ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`, status: 'active' };
}

const PILL_ICON = {
  good: <Check size={11} weight="bold" />,
  warn: <Warning size={11} weight="fill" />,
  bad: <X size={11} weight="bold" />,
} as const;
const iconFor = (status: string) => status === 'active' || status === 'on_file' ? PILL_ICON.good : status === 'expiring' || status === 'pending' ? PILL_ICON.warn : PILL_ICON.bad;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

export default function SubsAndVendorsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [trade, setTrade] = useState('');
  const [paperFilter, setPaperFilter] = useState(false);
  /* Companies set Inactive stay on file (contracts and waivers point at them)
     but leave the working list until asked for. */
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/subcontractors');
      if (!r.ok) throw new Error('Could not load your directory.');
      const d = await r.json();
      setSubs(Array.isArray(d.subs) ? d.subs : []);
    } catch (e) {
      /* An error is not emptiness. A failed fetch says so rather than
         rendering "no subcontractors yet" over a list that exists. */
      setError(e instanceof Error ? e.message : 'Could not load your directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const trades = useMemo(
    () => [...new Set(subs.map(s => (s.trade || '').trim()).filter(Boolean))].sort(),
    [subs],
  );

  /* Same reading as the Insurance pill: a COI is good through the END of its
     expiry day. Comparing midnight to "now" called a certificate that expires
     today missing while its pill said "0d left". */
  const lacksPaper = (s: Sub) => {
    if (s.w9_on_file !== true) return true;
    const st = expiryState(s.insurance_expiry).status;
    return st === 'not_on_file' || st === 'expired';
  };
  const isInactive = (s: Sub) => String(s.status || '').toLowerCase() === 'inactive';
  const inactiveCount = subs.filter(isInactive).length;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return subs.filter(s => {
      if (!showInactive && isInactive(s)) return false;
      if (paperFilter && !lacksPaper(s)) return false;
      if (trade && (s.trade || '') !== trade) return false;
      if (!needle) return true;
      return [s.company_name, s.trade, s.contact_name, s.email || s.contact_email]
        .some(v => (v || '').toLowerCase().includes(needle));
    });
  }, [subs, q, trade, paperFilter, showInactive]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Search hit (?open=<id>) lands on that company, selected and filtered to —
  // inactive ones included.
  useOpenRecord((id) => {
    const s = subs.find(x => x.id === id);
    if (!s) return;
    if (isInactive(s)) setShowInactive(true);
    if (s.company_name) setQ(s.company_name);
    setSelectedId(id);
  }, !loading);
  const columns = useMemo<Column<Sub>[]>(() => [
    {
      key: 'company_name', header: 'Company', primary: true, phone: 'show',
      accessor: s => s.company_name || '',
      render: s => (
        <span className="k-name">
          <span className="k-avatar" aria-hidden>{initials(s.company_name || '')}</span>
          <span className="k-name-text">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {s.company_name || 'Unnamed Company'}
              {s.blacklisted && <StatusPill module="paperwork" status="missing" label="Do Not Use" size="sm" icon={PILL_ICON.bad} />}
            </span>
            {s.prequalified === true && <span>Prequalified</span>}
          </span>
        </span>
      ),
    },
    { key: 'trade', header: 'Trade', phone: 'show', accessor: s => s.trade || '' , render: s => s.trade || '—' },
    {
      key: 'contact', header: 'Contact', phone: 'show',
      accessor: s => s.contact_name || s.email || s.contact_email || '',
      render: s => {
        const email = s.email || s.contact_email;
        const phone = s.phone || s.contact_phone;
        if (!s.contact_name && !email && !phone) return '—';
        return (
          <span className="k-cell-stack">
            {s.contact_name && <span style={{ color: TEXT, fontWeight: 600 }}>{s.contact_name}</span>}
            {email && <span><EnvelopeSimple size={12} weight="bold" color={DIM} />{email}</span>}
            {phone && <span><Phone size={12} weight="bold" color={DIM} />{phone}</span>}
          </span>
        );
      },
    },
    {
      key: 'license_number', header: 'License', phone: 'hide',
      accessor: s => s.license_number || '',
      render: s => s.license_number
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><IdentificationCard size={13} weight="bold" color={DIM} />{s.license_number}</span>
        : <StatusPill module="paperwork" status="not_on_file" size="sm" icon={PILL_ICON.bad} />,
    },
    {
      key: 'insurance_expiry', header: 'Insurance', phone: 'show',
      accessor: s => s.insurance_expiry || '',
      render: s => { const ins = expiryState(s.insurance_expiry); return <StatusPill module="paperwork" status={ins.status} label={ins.label} size="sm" icon={iconFor(ins.status)} />; },
    },
    {
      key: 'w9_on_file', header: 'W-9', phone: 'show',
      accessor: s => (s.w9_on_file === true ? 1 : 0),
      render: s => s.w9_on_file === true
        ? <StatusPill module="paperwork" status="on_file" size="sm" icon={PILL_ICON.good} />
        : <StatusPill module="paperwork" status="missing" size="sm" icon={PILL_ICON.bad} />,
    },
  ], []);

  /* The number that matters is not how many subs there are, it is how many
     cannot be awarded work today.

     Counted over the WORKING list — the same companies "On File" counts and the
     table shows. It used to count inactive companies too: on production the
     tile read "6 Paperwork Missing" while every one of the six was inactive,
     so tapping it filtered the table down to "Nothing matches that". A number
     that opens an empty list teaches people to stop trusting the numbers. */
  const working = subs.filter(s => !isInactive(s));
  const missingPaper = working.filter(lacksPaper).length;
  const prequalified = working.filter(s => s.prequalified === true).length;

  return (
    <PremiumSurface>
      <ModuleHero
        eyebrow="Company Directory"
        eyebrowIcon={<UsersThree size={13} weight="fill" color="var(--text-secondary)" />}
        title="Subs &"
        accent="Vendors"
        subtitle="Everyone you pay, and whether they can be awarded work today."
      />

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 22 }}>
        {/* "On File" shows them: every company (filters cleared) and the list
            brought into view. It only cleared filters, so with none set the
            tap did nothing at all. */}
        <StatCard label="On File" value={String(subs.length - inactiveCount)} sub="Companies tenant-wide" icon={<Buildings size={17} weight="duotone" color="var(--text-secondary)" />} href="#subs-directory" onClick={() => { setQ(''); setTrade(''); setPaperFilter(false); }} />
        <StatCard label="Paperwork Missing" value={String(missingPaper)} sub={missingPaper ? 'Cannot be awarded without override' : 'Everyone is current'} icon={<WarningCircle size={17} weight="duotone" color={missingPaper ? 'var(--text-primary)' : GOLD} />} tone={missingPaper ? 'bad' : undefined} active={paperFilter} onClick={() => setPaperFilter(v => !v)} />
        <StatCard label="Prequalified" value={String(prequalified)} sub="Passed prequalification" icon={<SealCheck size={17} weight="duotone" color="var(--text-secondary)" />} tone={prequalified > 0 ? 'good' : undefined} href="/app/prequalification" />
        <StatCard label="Trades Covered" value={String(trades.length)} sub="Distinct trades on file" icon={<Package size={17} weight="duotone" color="var(--text-secondary)" />} onClick={() => document.getElementById('subs-trade-filter')?.focus()} />
      </div>

      <div id="subs-directory" style={{ scrollMarginTop: 76 }} />
      <SectionCard
        title="Directory"
        icon={<UsersThree size={17} weight="duotone" color="var(--text-secondary)" />}
        action={<span style={{ fontSize: 12, color: DIM }}>{shown.length} of {showInactive ? subs.length : working.length}</span>}
        flush
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <MagnifyingGlass size={15} weight="bold" color={DIM} style={{ position: 'absolute', left: 11, top: 11 }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search company, trade or contact"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 32px', background: 'var(--bg-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none' }}
            />
          </div>
          <select
            id="subs-trade-filter"
            value={trade}
            onChange={e => setTrade(e.target.value)}
            style={{ padding: '9px 12px', background: 'var(--bg-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', minWidth: 170 }}
          >
            <option value="">All Trades ({trades.length})</option>
            {trades.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {inactiveCount > 0 && (
            <button
              type="button"
              aria-pressed={showInactive}
              onClick={() => setShowInactive(v => !v)}
              style={{ padding: '9px 12px', minHeight: 44, background: showInactive ? 'var(--selected-control-bg)' : 'var(--bg-surface-2)', color: showInactive ? 'var(--selected-control-fg)' : TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {showInactive ? 'Hide inactive' : `Show inactive (${inactiveCount})`}
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 18 }}>{[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}</div>
        ) : error ? (
          <PremiumEmpty
            icon={<WarningCircle size={30} weight="duotone" color={RED} />}
            title="Could not load your directory"
            description={error}
            tone="error"
            action={<button onClick={load} style={goldButtonStyle}>Try Again</button>}
          />
        ) : subs.length === 0 ? (
          <PremiumEmpty
            icon={<UsersThree size={30} weight="duotone" color="var(--text-secondary)" />}
            title="No subs or vendors on file yet"
            description="Subs are added from a job and stay on file for every job after it. Open a project, go to Subcontractors, and add the first one — it will appear here and in every bid package's invite list."
            action={<Link href="/app/projects" style={{ ...goldButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>Open a Project</Link>}
          />
        ) : shown.length === 0 ? (
          <PremiumEmpty
            icon={<MagnifyingGlass size={30} weight="duotone" color="var(--text-secondary)" />}
            title="Nothing matches that"
            description={paperFilter ? 'No company in this view is missing paperwork.' : 'No company on file matches your search or trade filter.'}
            action={<button type="button" onClick={() => { setQ(''); setTrade(''); setPaperFilter(false); }} style={goldButtonStyle}>Clear Filters</button>}
          />
        ) : (
          <DataTable<Sub>
            columns={columns}
            rows={shown}
            rowKey={s => s.id}
            defaultSort={{ key: 'company_name', dir: 'asc' }}
            onRowClick={s => setSelectedId(id => (id === s.id ? null : s.id))}
            isSelected={s => s.id === selectedId}
            empty="Nothing matches that."
          />
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
