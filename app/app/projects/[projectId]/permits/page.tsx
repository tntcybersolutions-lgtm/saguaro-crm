'use client';
/**
 * Permits & Approvals — Pass 4, on the RFIs reference layout (dense table + detail).
 *
 * Anatomy: title + one primary action (Add Permit) → StatRow (the AHJ
 * lifecycle: Applied / Issued / Inspections / Closed, plus the expiry watch —
 * each tile filters the register) → Toolbar → workspace split: the permit
 * register on the left and, when a row is selected, the permit beside a
 * 320–384px details rail. Phone: stacked. The composer opens in a FormModal.
 * The architect / AHJ correspondence log stays below the register.
 *
 * Status is the stored stage flipped to Expired once past expiry — the AHJ
 * decides everything else; nothing here auto-advances a permit.
 *
 * Every read / write is the one this screen already used:
 *   list    GET  /api/projects/[id]/permits
 *   create  POST /api/permits/create
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { Clipboard, Plus, X, Warning, ClipboardText } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState,
  FormModal, Field, Input, Select, FormGrid, DetailList, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowSteps, InsightRow, AutoChip } from '@/components/ui/premium';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import PermitCorrespondence from '@/components/PermitCorrespondence';
import { layout } from '@/lib/design-tokens';

interface Permit {
  id: string;
  permit_type: string;
  permit_number: string;
  issuing_authority: string;
  applied_date: string;
  issued_date: string | null;
  expiry_date: string | null;
  fee: number;
  status: string;
  project_id: string;
}

const TYPES = ['Building', 'Electrical', 'Plumbing', 'Mechanical', 'Fire', 'Grading'];

/** One status → one badge. Applied amber (the AHJ owes a decision), Issued
 *  green, Inspections blue, Closed grey, Expired red — from lib/status-colors. */
function statusBadge(s: string): { label: string; tone: BadgeTone } {
  if (s === 'issued') return { label: 'Issued', tone: 'ongoing' };
  if (s === 'inspections') return { label: 'Inspections', tone: 'lead' };
  if (s === 'closed') return { label: 'Closed', tone: 'closed' };
  if (s === 'expired') return { label: 'Expired', tone: 'overdue' };
  return { label: 'Applied', tone: 'under_contract' };
}
const STATUS_RANK: Record<string, number> = { applied: 0, issued: 1, inspections: 2, closed: 3, expired: 4 };
type StatusFilter = 'all' | 'applied' | 'issued' | 'inspections' | 'closed' | 'expired' | 'expiring';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) => money.format(Number(n) || 0);
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDate = (d?: string | null) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const EMPTY_FORM = {
  permit_type: 'Building',
  number: '',
  authority: '',
  fee: 0,
  applied_date: '',
  issued_date: '',
  expiry_date: '',
};

const CSS = `
.peWs > .k-page { max-width: none; }
.peCq { container: pews / inline-size; min-width: 0; }
.peSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.peSplit > * { min-width: 0; }
@container pews (min-width: 1080px) {
  .peSplit[data-open="true"] { grid-template-columns: minmax(340px, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
}
.peList .k-table th:first-child, .peList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.peList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.peList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.peList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.peList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.peNum { color: var(--text-primary); font-weight: 800; white-space: nowrap; }
.peMoney { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary); font-weight: 600; }
.peMuted { color: var(--text-tertiary); }
.peLate { color: var(--status-overdue); font-weight: 700; }
.peSoon { color: var(--status-under-contract); font-weight: 700; }
.peBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.peSection { display: flex; flex-direction: column; gap: 8px; }
.peSection + .peSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.peNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.peActions { display: flex; flex-direction: column; gap: 8px; }
.peActions .k-btn { width: 100%; justify-content: flex-start; }
.peRail { position: sticky; top: 16px; }
.peLadder { border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-surface-2); margin-bottom: 16px; }
.peWatch { display: flex; gap: 10px; align-items: flex-start; font-size: var(--fs-sm); color: var(--text-primary); line-height: 1.55; padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid rgba(255,197,61,.35); background: rgba(255,197,61,.08); }
.peWatch > svg { color: var(--status-under-contract); flex-shrink: 0; margin-top: 2px; }
.peWatch b { color: var(--status-under-contract); }
.peCorr { margin-top: 16px; }
.peDateInput { width: 100%; }
@media (max-width: 640px) {
  .peWs .k-btn, .peWs .k-stat, .peWs select.k-select, .peWs .k-input { min-height: 44px; }
  .peWs .k-table td { height: 48px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function PermitsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `permits:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast(4000);
  const [errorMsg, setErrorMsg] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const fetchPermits = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/permits`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setPermits(json.permits || []);
    } catch {
      setPermits([]);
      setLoadError('Failed to load permits.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchPermits(); }, [fetchPermits]);

  // Project intelligence — one snapshot; the register walks in knowing the job.
  const { ctx } = useProjectContext(projectId);
  const [autoF, setAutoF] = useState<{ authority?: boolean; applied?: boolean }>({});
  const [permitSearch, setPermitSearch] = useState('');
  const [permitStatusFilter, setPermitStatusFilter] = useState<StatusFilter>('all');
  const [permitTypeFilter, setPermitTypeFilter] = useState('all');

  // Jurisdiction guess from the project address — "123 Main St, Mesa, AZ 85201"
  // -> "Mesa". Only a prefill; the GC corrects it once and moves on.
  const addr = String(ctx?.project?.address || '');
  const city = (addr.split(',')[1] || '').trim().replace(/\d.*$/, '').trim();

  // Effective status: the stored stage, flipped to expired once past expiry.
  const effStatus = (p: Permit) => (p.expiry_date && p.expiry_date < today && p.status !== 'closed') ? 'expired' : (p.status || 'applied');
  const daysToExpiry = (p: Permit) => p.expiry_date ? Math.ceil((new Date(p.expiry_date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000) : null;
  const isExpiringSoon = (p: Permit) => { const d = daysToExpiry(p); const st = effStatus(p); return st !== 'closed' && st !== 'expired' && d !== null && d >= 0 && d <= 30; };

  const applied = permits.filter(p => effStatus(p) === 'applied').length;
  const issued = permits.filter(p => effStatus(p) === 'issued').length;
  const inInspections = permits.filter(p => effStatus(p) === 'inspections').length;
  const closed = permits.filter(p => effStatus(p) === 'closed').length;
  const expired = permits.filter(p => effStatus(p) === 'expired').length;
  const openCount = applied + issued + inInspections;
  const expiringSoon = permits.filter(isExpiringSoon);
  // DB numerics can round-trip as strings — always coerce before math.
  const totalFees = permits.reduce((s, p) => s + (Number(p.fee) || 0), 0);

  // Toolbar-driven view of the register. Status matches the effective (expiry-aware) status.
  const qP = permitSearch.trim().toLowerCase();
  const filteredPermits = permits.filter(p => {
    const st = effStatus(p);
    if (permitStatusFilter === 'expiring') { if (!isExpiringSoon(p)) return false; }
    else if (permitStatusFilter !== 'all' && st !== permitStatusFilter) return false;
    if (permitTypeFilter !== 'all' && p.permit_type !== permitTypeFilter) return false;
    if (!qP) return true;
    return [p.permit_number, p.issuing_authority, p.permit_type].some(v => String(v || '').toLowerCase().includes(qP));
  });
  const filtersActive = !!permitSearch || permitStatusFilter !== 'all' || permitTypeFilter !== 'all';
  const clearFilters = () => { setPermitSearch(''); setPermitStatusFilter('all'); setPermitTypeFilter('all'); };
  const toggleStatus = (s: StatusFilter) => setPermitStatusFilter(prev => (prev === s ? 'all' : s));

  async function handleSave(): Promise<boolean> {
    if (!form.number || !form.authority) {
      setErrorMsg('Permit number and agency are required.');
      return false;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/permits/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          status: 'applied',
          permit_type: form.permit_type,
          permit_number: form.number,
          issuing_authority: form.authority,
          fee: form.fee,
          applied_date: form.applied_date || null,
          issued_date: form.issued_date || null,
          expiry_date: form.expiry_date || null,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json();
      if (!json.permit) throw new Error('save failed');
      setPermits(prev => [...prev, json.permit as Permit]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      show('Permit added.');
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not save the permit. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      applied_date: today,
      authority: city ? `City of ${city}` : '',
    });
    setAutoF({ applied: true, authority: !!city });
    setShowForm(true);
    setErrorMsg('');
  }
  function closeComposer() { guard.requestClose(() => { setShowForm(false); setErrorMsg(''); }); }

  const selected = selectedId ? permits.find(p => p.id === selectedId) || null : null;
  const detailOpen = !!selected;
  useEffect(() => {
    if (!detailOpen) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [detailOpen, selectedId]);

  // ── Stat tiles: the AHJ lifecycle + the expiry watch — each filters the register ──
  const stats: StatItem[] = loading
    ? [
        { label: 'Applied', value: '—', sub: 'Loading…' },
        { label: 'Issued', value: '—', sub: 'Loading…' },
        { label: 'Expiring ≤ 30 Days', value: '—', sub: 'Loading…' },
        { label: 'Expired', value: '—', sub: 'Loading…' },
        { label: 'Fees to Date', value: '—', sub: 'Loading…' },
      ]
    : [
        { label: 'Applied', value: applied, tone: applied > 0 ? 'warn' : 'default', sub: permitStatusFilter === 'applied' ? 'Filtered — click to clear' : 'Awaiting the AHJ', onClick: () => toggleStatus('applied') },
        { label: 'Issued', value: issued, tone: issued > 0 ? 'good' : 'default', sub: permitStatusFilter === 'issued' ? 'Filtered — click to clear' : inInspections > 0 ? `+${inInspections} in inspections` : 'Work may proceed', onClick: () => toggleStatus('issued') },
        { label: 'Expiring ≤ 30 Days', value: expiringSoon.length, tone: expiringSoon.length > 0 ? 'warn' : 'default', sub: permitStatusFilter === 'expiring' ? 'Filtered — click to clear' : expiringSoon.length > 0 ? `Renew ${expiringSoon[0].permit_number} first` : 'Nothing lapsing soon', onClick: () => toggleStatus('expiring') },
        { label: 'Expired', value: expired, tone: expired > 0 ? 'bad' : 'default', sub: permitStatusFilter === 'expired' ? 'Filtered — click to clear' : expired > 0 ? 'Work at risk — renew now' : 'None lapsed', onClick: () => toggleStatus('expired') },
        { label: 'Fees to Date', value: fmtUsd(totalFees), sub: `Across ${permits.length} permit${permits.length === 1 ? '' : 's'}${closed > 0 ? ` · ${closed} closed` : ''}` },
      ];

  // ── Register columns ──
  const isSel = (p: Permit) => p.id === selectedId;
  const numCol: Column<Permit> = { key: 'permit_number', header: 'Permit #', accessor: p => p.permit_number || '', width: 150, render: p => <span className="peNum" data-sel={isSel(p) ? 'true' : undefined}>{p.permit_number || '—'}</span> };
  const typeCol: Column<Permit> = { key: 'permit_type', header: 'Type', accessor: p => p.permit_type || '', render: p => <span style={{ color: 'var(--text-primary)' }}>{p.permit_type}</span> };
  const agencyCol: Column<Permit> = { key: 'issuing_authority', phone: 'hide', header: 'Agency', accessor: p => (p.issuing_authority || '').toLowerCase(), render: p => p.issuing_authority || <span className="peMuted">—</span> };
  const statusCol: Column<Permit> = { key: 'status', phone: 'show', header: 'Status', accessor: p => STATUS_RANK[effStatus(p)] ?? 9, render: p => { const b = statusBadge(effStatus(p)); return <span className="peBadges"><Badge tone={b.tone}>{b.label}</Badge>{isExpiringSoon(p) && <Badge tone="under_contract">Expiring</Badge>}</span>; } };
  const feeCol: Column<Permit> = { key: 'fee', phone: 'show', header: 'Fee', accessor: p => Number(p.fee) || 0, align: 'right', render: p => <span className="peMoney">{fmtUsd(Number(p.fee) || 0)}</span> };
  const issuedCol: Column<Permit> = { key: 'issued_date', phone: 'hide', header: 'Issued', accessor: p => p.issued_date || '', render: p => <span className="peMuted">{fmtDate(p.issued_date)}</span> };
  const expiryCol: Column<Permit> = { key: 'expiry_date', phone: 'show', header: 'Expiry', accessor: p => p.expiry_date || '', render: p => {
    const st = effStatus(p); const d = daysToExpiry(p); const soon = isExpiringSoon(p);
    return <span className={st === 'expired' ? 'peLate' : soon ? 'peSoon' : 'peMuted'}>{fmtDate(p.expiry_date)}{st === 'expired' && d !== null ? ` · lapsed ${Math.abs(d)}d ago` : soon ? ` · ${d}d left` : ''}</span>;
  } };
  const columns: Column<Permit>[] = detailOpen ? [numCol, typeCol, statusCol, expiryCol] : [numCol, typeCol, agencyCol, statusCol, feeCol, issuedCol, expiryCol];

  // ── Detail workspace ──
  const detailWorkspace = selected && (() => {
    const st = effStatus(selected); const d = daysToExpiry(selected); const b = statusBadge(st);
    return (
      <aside ref={detailRef} className="peRail" aria-label="Permit details">
        <Card
          title={`${selected.permit_number} — ${selected.permit_type}`}
          subtitle={selected.issuing_authority || undefined}
          actions={<Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close details" title="Close details" onClick={() => setSelectedId(null)} />}
        >
          <div className="peSection">
            <div className="peBadges">
              <Badge tone={b.tone} dot>{b.label}</Badge>
              {isExpiringSoon(selected) && <Badge tone="under_contract">Expiring in {d}d</Badge>}
            </div>
            <div className="peNext">
              {st === 'applied' && 'Submitted to the AHJ — waiting on issuance.'}
              {st === 'issued' && 'Issued — work may start. Inspections on this permit live in the Inspections module.'}
              {st === 'inspections' && 'AHJ sign-offs in progress.'}
              {st === 'closed' && 'Final approval on record.'}
              {st === 'expired' && 'Lapsed — call the issuing agency before work has to stop.'}
            </div>
          </div>
          <div className="peSection">
            <DetailList items={[
              ['Permit Type', selected.permit_type],
              ['Agency', selected.issuing_authority || ''],
              ['Fee', fmtUsd(Number(selected.fee) || 0)],
              ['Applied', fmtDate(selected.applied_date)],
              ['Issued', fmtDate(selected.issued_date)],
              ['Expiry', fmtDate(selected.expiry_date)],
              ['Days to Expiry', d === null ? '—' : d < 0 ? `Lapsed ${Math.abs(d)}d ago` : `${d}d`],
            ]} />
          </div>
          <div className="peSection">
            <div className="peActions">
              <Button icon={<ClipboardText size={16} />} href={`/app/projects/${projectId}/inspections`}>Inspections on This Project</Button>
            </div>
          </div>
        </Card>
      </aside>
    );
  })();

  // ── Register body ──
  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = <EmptyState icon={<Warning size={22} />} title="Couldn't load permits" text={`${loadError} Nothing has been lost — try again.`} action={<Button onClick={fetchPermits}>Retry</Button>} />;
  } else if (!loading && permits.length === 0) {
    listBody = (
      <EmptyState
        icon={<Clipboard size={22} />}
        title="Start the permit register"
        text={city
          ? `This project sits in ${city} — most jobs need a Building permit plus separate trade permits (Electrical, Plumbing, Mechanical) before mobilization. The register tracks each one from application through inspections to closeout, and warns 30 days before anything expires.`
          : 'Most jobs need a Building permit plus separate trade permits before mobilization. The register tracks each one from application through inspections to closeout, and warns 30 days before anything expires.'}
        action={<Button icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Add First Permit</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={filteredPermits}
        rowKey={p => p.id}
        loading={loading}
        defaultSort={{ key: 'expiry_date', dir: 'asc' }}
        onRowClick={p => setSelectedId(p.id)}
        empty={<EmptyState icon={<Clipboard size={22} />} title="No permits match these filters" text="Clear the search, status, or type filter to see more." action={<Button onClick={clearFilters}>Clear Filters</Button>} />}
      />
    );
  }

  return (
    <div className="peWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `/app/projects/${projectId}/overview` },
          { label: 'Permits' },
        ]}
        title="Permits & Approvals"
        subtitle={openCount > 0 ? `${openCount} open permit${openCount === 1 ? '' : 's'}${expiringSoon.length > 0 ? ` — ${expiringSoon.length} expiring within 30 days` : ''}${city ? ` · ${city} jurisdiction` : ''}.` : `Building permits and regulatory approvals${city ? ` — ${city} jurisdiction` : ''}.`}
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Add Permit</Button>}
      >
        {!loadError && <StatRow items={stats} />}

        {expiringSoon.length > 0 && (
          <div className="peWatch" role="status">
            <Warning size={17} weight="fill" />
            <div>
              <b>{expiringSoon.length} permit{expiringSoon.length === 1 ? '' : 's'} expiring within 30 days:</b>{' '}
              {expiringSoon.map((p, i) => { const d = daysToExpiry(p); return <span key={p.id}>{i > 0 ? ' · ' : ''}<b style={{ color: 'var(--text-primary)' }}>{p.permit_number}</b> ({p.permit_type}) in {d} day{d === 1 ? '' : 's'}</span>; })}
              <span className="peMuted"> — call the issuing agency before work has to stop.</span>
            </div>
          </div>
        )}

        {!loading && !loadError && permits.length > 0 && (
          <Toolbar
            search={permitSearch}
            onSearch={setPermitSearch}
            placeholder="Search by permit number, agency, or type…"
            filters={
              <>
                <Select aria-label="Status" value={permitStatusFilter} onChange={e => setPermitStatusFilter(e.target.value as StatusFilter)} style={{ width: 'auto', minWidth: 150 }} options={[
                  { value: 'all', label: 'All Statuses' }, { value: 'applied', label: 'Applied' }, { value: 'issued', label: 'Issued' }, { value: 'inspections', label: 'Inspections' }, { value: 'closed', label: 'Closed' }, { value: 'expired', label: 'Expired' }, { value: 'expiring', label: 'Expiring ≤ 30 days' },
                ]} />
                <Select aria-label="Type" value={permitTypeFilter} onChange={e => setPermitTypeFilter(e.target.value)} style={{ width: 'auto', minWidth: 140 }} options={[{ value: 'all', label: 'All Types' }, ...TYPES]} />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="peMuted" style={{ fontSize: 'var(--fs-sm)' }}>{filteredPermits.length} of {permits.length}</span>}
          />
        )}

        <div className="peCq">
          <div className="peSplit" data-open={detailOpen ? 'true' : 'false'}>
            <div className="peList"><Card flush>{listBody}</Card></div>
            {detailWorkspace}
          </div>
        </div>

        {/* Tracked back-and-forth with the architect and the city/AHJ */}
        <div className="peCorr"><PermitCorrespondence projectId={projectId} /></div>
      </PageShell>

      {/* ── Composer ── */}
      <FormModal
        open={showForm}
        onClose={closeComposer}
        title="Add Permit"
        subtitle={city ? `Filing with the ${city} AHJ — prefilled from the project record.` : 'The permit enters the pipeline as Applied.'}
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Save Permit"
        busy={saving}
        error={errorMsg || null}
      >
        {ctx && (
          <div className="peLadder">
            <InsightRow label="Site" value={addr ? addr.split(',')[0] : '—'} />
            {city ? <InsightRow label="Jurisdiction" value={city} /> : null}
            <InsightRow label="Owner" value={ctx.defaults?.ownerName || '—'} />
            <InsightRow label="Open Permits" value={String(openCount)} />
            <InsightRow label="Expiring ≤ 30 Days" value={String(expiringSoon.length)} strong={expiringSoon.length > 0} />
          </div>
        )}
        <FormGrid cols={2}>
          <Field label="Permit Type" hint="Most jobs carry Building plus separate trade permits.">
            <Select value={form.permit_type} onChange={e => setForm(p => ({ ...p, permit_type: e.target.value }))} options={TYPES} />
          </Field>
          <Field label="Permit Number" required hint="Exactly as stamped by the AHJ — inspectors pull it up by this number.">
            <Input value={form.number} onChange={e => { setForm(p => ({ ...p, number: e.target.value })); if (errorMsg) setErrorMsg(''); }} placeholder="e.g. BLD-2026-01423" autoFocus />
          </Field>
          <Field label="Issuing Agency (AHJ)" required hint={<>{autoF.authority && <AutoChip />} {autoF.authority ? 'Guessed from the project address — correct it if another agency has jurisdiction.' : city ? `Project sits in ${city} — its building department is the usual AHJ.` : 'The authority having jurisdiction over the site.'}</>}>
            <Suggest className="k-input" value={form.authority} onChange={e => { const v = e.target.value; setAutoF(a => ({ ...a, authority: false })); setForm(p => ({ ...p, authority: v })); if (errorMsg) setErrorMsg(''); }} placeholder="e.g. City Building Department" options={['a']} />
          </Field>
          <Field label="Fee ($)" hint="Plan-check and permit fees — rolls into Fees to Date.">
            <Input type="number" step="0.01" value={form.fee} onChange={e => setForm(p => ({ ...p, fee: Number(e.target.value) }))} />
          </Field>
          <Field label="Applied Date" hint={<>{autoF.applied && <AutoChip />} Defaults to today — the permit enters the pipeline as Applied.</>}>
            <div className="peDateInput"><SaguaroDatePicker value={form.applied_date} onChange={v => { setAutoF(a => ({ ...a, applied: false })); setForm(p => ({ ...p, applied_date: v })); }} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Issue Date" hint="Leave blank until the AHJ approves — work starts at issuance.">
            <div className="peDateInput"><SaguaroDatePicker value={form.issued_date} onChange={v => setForm(p => ({ ...p, issued_date: v }))} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Expiry Date" span hint="Many AHJs lapse permits 180 days after the last passed inspection — rows flag amber 30 days out.">
            <div className="peDateInput"><SaguaroDatePicker value={form.expiry_date} onChange={v => setForm(p => ({ ...p, expiry_date: v }))} style={DATE_INPUT_STYLE} /></div>
          </Field>
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <FlowSteps title="After You Save" steps={[
            { title: 'Permit Enters the Pipeline', desc: 'Starts as Applied and moves through issuance, inspections, and closeout.' },
            { title: 'Expiry Is Watched', desc: 'The row flags amber 30 days before expiry and red once lapsed.' },
            { title: 'Inspections Log Against It', desc: 'AHJ inspections on this permit live in the Inspections module.' },
            { title: 'Fees Roll Up', desc: 'Permit fees total into the register and the project cost picture.' },
          ]} />
        </div>
      </FormModal>

      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
