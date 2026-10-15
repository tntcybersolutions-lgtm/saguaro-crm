'use client';
/**
 * Commitments — every subcontract and purchase order on the job in one grid:
 * original, approved changes, revised, billed, paid, remaining and retainage,
 * with totals, grouping, saved views and export from the shared DataTable.
 *
 * Reads  GET /api/projects/:id/commitments   (lib/commitments roll-up)
 * Opens  /items/contracts/:id and /items/purchase_orders/:id (full record pages)
 * New    the contracts and purchase-order screens, which own creation.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { Handshake, Plus, Receipt, Wallet, Scales, ArrowSquareOut, WarningCircle, ShoppingCart } from '@phosphor-icons/react';
import type { CommitmentRow } from '@/lib/commitments';

const fmt = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const DEAD = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected']);

function tone(s: string): BadgeTone {
  if (DEAD.has(s)) return 'closed';
  if (['executed', 'approved', 'received', 'active'].includes(s)) return 'ongoing';
  if (['complete', 'completed', 'closed'].includes(s)) return 'completed';
  if (['sent', 'out_for_signature', 'pending'].includes(s)) return 'under_contract';
  return 'neutral';
}
const label = (s: string) => { const t = (s || 'draft').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

type KindFilter = 'all' | 'Subcontract' | 'Purchase order';
type StateFilter = 'all' | 'live' | 'draft' | 'over' | 'void';

export default function CommitmentsPage() {
  const { projectId } = useParams() as { projectId: string };
  const router = useRouter();
  const { ctx } = useProjectContext(projectId);
  const [rows, setRows] = useState<CommitmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [state, setState] = useState<StateFilter>('live');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/commitments`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't load commitments");
      setRows(j.commitments || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load commitments");
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const live = useMemo(() => rows.filter((r) => !DEAD.has(r.status)), [rows]);
  const sum = (list: CommitmentRow[], k: keyof CommitmentRow) => list.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const overBilled = live.filter((r) => r.revised > 0 && r.billed > r.revised);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false;
      if (state === 'live' && DEAD.has(r.status)) return false;
      if (state === 'draft' && r.status !== 'draft') return false;
      if (state === 'void' && !DEAD.has(r.status)) return false;
      if (state === 'over' && !(r.revised > 0 && r.billed > r.revised)) return false;
      if (!q) return true;
      return [r.number, r.vendor, r.title, r.kind, r.status].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [rows, search, kind, state]);

  const stats: StatItem[] = [
    { label: 'Committed', value: loading ? '—' : fmt(sum(live, 'revised')), sub: loading ? undefined : `${live.length} live · ${fmt(sum(live, 'approved_changes'))} in changes`, icon: <Handshake size={15} />, onClick: () => setState('live'), active: state === 'live' },
    { label: 'Billed to date', value: loading ? '—' : fmt(sum(live, 'billed')), sub: loading ? undefined : `${fmt(sum(live, 'paid'))} paid`, icon: <Receipt size={15} /> },
    { label: 'Remaining', value: loading ? '—' : fmt(sum(live, 'remaining')), sub: 'Left to bill on live commitments', icon: <Wallet size={15} /> },
    { label: 'Retainage held', value: loading ? '—' : fmt(sum(live, 'retainage_held')), icon: <Scales size={15} /> },
    { label: 'Over-billed', value: loading ? '—' : String(overBilled.length), sub: loading ? undefined : overBilled.length ? 'Billed past the revised amount' : 'None', tone: overBilled.length ? 'bad' : 'default', icon: <WarningCircle size={15} />, onClick: () => setState('over'), active: state === 'over' },
  ];

  const columns: Column<CommitmentRow>[] = [
    { key: 'number', header: '#', width: 110, accessor: (r) => r.number || '', render: (r) => r.number || '—', groupable: false },
    { key: 'vendor', header: 'Company', primary: true, phone: 'show' },
    { key: 'title', header: 'Title', render: (r) => r.title || '—' },
    { key: 'kind', header: 'Type', render: (r) => r.kind },
    { key: 'status', header: 'Status', phone: 'show', render: (r) => <Badge tone={tone(r.status)} dot>{label(r.status)}</Badge> },
    { key: 'original', header: 'Original', align: 'right', total: 'sum', format: fmt, render: (r) => fmt(r.original) },
    { key: 'approved_changes', header: 'Approved changes', align: 'right', total: 'sum', format: fmt, render: (r) => r.approved_changes ? <span style={{ color: 'var(--warning)' }}>{(r.approved_changes > 0 ? '+' : '') + fmt(r.approved_changes)}</span> : '—' },
    { key: 'revised', header: 'Revised', align: 'right', total: 'sum', format: fmt, phone: 'show', render: (r) => <strong>{fmt(r.revised)}</strong> },
    { key: 'billed', header: 'Billed', align: 'right', total: 'sum', format: fmt, render: (r) => <span title={r.billed_source === 'bills' ? "From this company's bills on the job" : 'Entered on the commitment'} style={{ color: r.revised > 0 && r.billed > r.revised ? 'var(--danger)' : undefined }}>{r.billed ? fmt(r.billed) : '—'}</span> },
    { key: 'percent_billed', header: '% billed', align: 'right', render: (r) => (r.revised > 0 ? `${r.percent_billed}%` : '—') },
    { key: 'paid', header: 'Paid', align: 'right', total: 'sum', format: fmt, render: (r) => (r.paid ? fmt(r.paid) : '—') },
    { key: 'remaining', header: 'Remaining', align: 'right', total: 'sum', format: fmt, render: (r) => <span style={{ color: r.remaining < 0 ? 'var(--danger)' : undefined }}>{fmt(r.remaining)}</span> },
    { key: 'retainage_held', header: 'Retainage', align: 'right', total: 'sum', format: fmt, hidden: true, render: (r) => (r.retainage_held ? fmt(r.retainage_held) : '—') },
    { key: 'executed_date', header: 'Executed / issued', hidden: true, render: (r) => r.executed_date ? new Date(`${r.executed_date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
  ];

  const base = `/app/projects/${projectId}`;
  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Commitments' },
      ]}
      title="Commitments"
      subtitle="Every subcontract and purchase order on the job: what you owe, what's billed, what's left."
      actions={
        <>
          <Button icon={<ShoppingCart size={15} />} href={`${base}/purchase-orders`}>New purchase order</Button>
          <Button variant="primary" icon={<Plus size={15} weight="bold" />} href={`${base}/contracts`}>New subcontract</Button>
        </>
      }
    >
      {!error && <StatRow items={stats} />}

      {!loading && !error && rows.length > 0 && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by number, company or title…"
          filters={
            <>
              <Select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} style={{ width: 'auto', minWidth: 170 }}
                options={[{ value: 'all', label: 'All types' }, { value: 'Subcontract', label: 'Subcontracts' }, { value: 'Purchase order', label: 'Purchase orders' }]} />
              <Select aria-label="Status" value={state} onChange={(e) => setState(e.target.value as StateFilter)} style={{ width: 'auto', minWidth: 170 }}
                options={[{ value: 'live', label: 'Live (not void)' }, { value: 'all', label: 'All statuses' }, { value: 'draft', label: 'Drafts' }, { value: 'over', label: 'Over-billed' }, { value: 'void', label: 'Void / cancelled' }]} />
            </>
          }
        />
      )}

      {error ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load commitments" text={error} action={<Button onClick={() => { setLoading(true); load(); }}>Try again</Button>} />
      ) : (
        <DataTable<CommitmentRow>
          tableId="project-commitments"
          exportName="commitments"
          columns={columns}
          rows={shown}
          loading={loading}
          rowKey={(r) => `${r.source}:${r.id}`}
          defaultSort={{ key: 'number', dir: 'asc' }}
          onRowClick={(r) => router.push(r.href)}
          rowActions={(r) => [{ label: 'Open', icon: <ArrowSquareOut size={14} />, href: r.href }]}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={<Handshake size={22} />}
                title="No commitments on this job yet"
                text="Award a bid package, write a subcontract or issue a purchase order and it lands here with its billing."
                action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} href={`${base}/contracts`}>New subcontract</Button>}
              />
            ) : (
              <EmptyState title="Nothing matches" text="Change the search or the filters." action={<Button onClick={() => { setSearch(''); setKind('all'); setState('all'); }}>Clear filters</Button>} />
            )
          }
        />
      )}
    </PageShell>
  );
}
