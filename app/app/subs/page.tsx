'use client';
/**
 * Subs & Vendors — the company-wide directory of everyone the GC pays.
 *
 * WHY THIS PAGE DID NOT EXIST, AND WHY THAT MATTERED.
 * The subcontractors table is tenant-wide: a sub entered on one job is on file
 * for every job after it, with their trade, licence, insurance expiry, W-9
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
import Link from 'next/link';
import {
  UsersThree, ShieldCheck, WarningCircle, SealCheck, Buildings,
  MagnifyingGlass, Phone, EnvelopeSimple, IdentificationCard, Package,
} from '@phosphor-icons/react';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty,
  goldButtonStyle,
} from '@/components/ui/premium';
import { SkeletonRow } from '../../../components/ui/Skeleton';

const GOLD = '#F59E0B', CARD = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const TEXT = '#FFFFFF', DIM = '#CBD5E1', GREEN = '#34C759', RED = '#FF3B30', AMBER = '#FF9500';

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
function expiryState(iso: string | null): { label: string; tone: string } {
  const d = parseDay(iso);
  if (!d) return { label: 'Not on file', tone: RED };
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Expired ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, tone: RED };
  if (days <= 30) return { label: `${days}d left`, tone: AMBER };
  return { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), tone: GREEN };
}

export default function SubsAndVendorsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [trade, setTrade] = useState('');

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

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return subs.filter(s => {
      if (trade && (s.trade || '') !== trade) return false;
      if (!needle) return true;
      return [s.company_name, s.trade, s.contact_name, s.email || s.contact_email]
        .some(v => (v || '').toLowerCase().includes(needle));
    });
  }, [subs, q, trade]);

  /* The number that matters is not how many subs there are, it is how many
     cannot be awarded work today. */
  const missingPaper = subs.filter(
    s => s.w9_on_file !== true || !s.insurance_expiry || (parseDay(s.insurance_expiry)?.getTime() ?? 0) < Date.now(),
  ).length;
  const prequalified = subs.filter(s => s.prequalified === true).length;

  return (
    <PremiumSurface maxWidth={1400}>
      <ModuleHero
        eyebrow="Company Directory"
        eyebrowIcon={<UsersThree size={13} weight="fill" color={GOLD} />}
        title="Subs &"
        accent="Vendors"
        subtitle="Everyone you pay — their trade, their paperwork, and whether they can be awarded work today."
      />

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 22 }}>
        <StatCard label="On file" value={String(subs.length)} sub="companies tenant-wide" icon={<Buildings size={17} weight="duotone" color={GOLD} />} />
        <StatCard label="Paperwork missing" value={String(missingPaper)} sub={missingPaper ? 'cannot be awarded without override' : 'everyone is current'} icon={<WarningCircle size={17} weight="duotone" color={missingPaper ? RED : GREEN} />} />
        <StatCard label="Prequalified" value={String(prequalified)} sub="passed prequalification" icon={<SealCheck size={17} weight="duotone" color={GOLD} />} />
        <StatCard label="Trades covered" value={String(trades.length)} sub="distinct trades on file" icon={<Package size={17} weight="duotone" color={GOLD} />} />
      </div>

      <SectionCard
        title="Directory"
        subtitle="Added from any job; available on every job after."
        icon={<UsersThree size={17} weight="duotone" color={GOLD} />}
        action={<span style={{ fontSize: 12, color: DIM }}>{shown.length} of {subs.length}</span>}
        flush
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <MagnifyingGlass size={15} weight="bold" color={DIM} style={{ position: 'absolute', left: 11, top: 11 }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search company, trade or contact"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 32px', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none' }}
            />
          </div>
          <select
            value={trade}
            onChange={e => setTrade(e.target.value)}
            style={{ padding: '9px 12px', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', minWidth: 170 }}
          >
            <option value="">All trades ({trades.length})</option>
            {trades.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: 18 }}>{[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}</div>
        ) : error ? (
          <PremiumEmpty
            icon={<WarningCircle size={30} weight="duotone" color={RED} />}
            title="Could not load your directory"
            description={error}
            tone="error"
            action={<button onClick={load} style={goldButtonStyle}>Try again</button>}
          />
        ) : subs.length === 0 ? (
          <PremiumEmpty
            icon={<UsersThree size={30} weight="duotone" color={GOLD} />}
            title="No subs or vendors on file yet"
            description="Subs are added from a job and stay on file for every job after it. Open a project, go to Subcontractors, and add the first one — it will appear here and in every bid package's invite list."
            action={<Link href="/app/projects" style={{ ...goldButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>Open a project</Link>}
          />
        ) : shown.length === 0 ? (
          <PremiumEmpty
            icon={<MagnifyingGlass size={30} weight="duotone" color={GOLD} />}
            title="Nothing matches that"
            description="No company on file matches your search or trade filter."
            action={<button onClick={() => { setQ(''); setTrade(''); }} style={goldButtonStyle}>Clear filters</button>}
          />
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Company', 'Trade', 'Contact', 'Licence', 'Insurance', 'W-9'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '11px 16px', color: DIM, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(s => {
                  const ins = expiryState(s.insurance_expiry);
                  const email = s.email || s.contact_email;
                  const phone = s.phone || s.contact_phone;
                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.055)` }}>
                      <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 700 }}>
                        {s.company_name || 'Unnamed company'}
                        {s.blacklisted && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,59,48,0.14)', color: RED, border: `1px solid rgba(255,59,48,0.3)` }}>DO NOT USE</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: DIM }}>{s.trade || '—'}</td>
                      <td style={{ padding: '12px 16px', color: DIM }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {s.contact_name && <span style={{ color: TEXT }}>{s.contact_name}</span>}
                          {email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><EnvelopeSimple size={12} weight="duotone" color={DIM} />{email}</span>}
                          {phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={12} weight="duotone" color={DIM} />{phone}</span>}
                          {!s.contact_name && !email && !phone && '—'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: DIM, whiteSpace: 'nowrap' }}>
                        {s.license_number
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IdentificationCard size={13} weight="duotone" color={DIM} />{s.license_number}</span>
                          : <span style={{ color: RED }}>Not on file</span>}
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: ins.tone, fontWeight: 600 }}>{ins.label}</td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        {s.w9_on_file === true
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: GREEN, fontWeight: 700 }}><ShieldCheck size={13} weight="fill" color={GREEN} />On file</span>
                          : <span style={{ color: RED, fontWeight: 700 }}>Missing</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
