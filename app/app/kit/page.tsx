'use client';

/**
 * /app/kit — the design-system reference. Renders every primitive in
 * components/ui/kit.tsx with sample rows so the look can be approved in one
 * place before pages migrate onto it (docs/DESIGN-SYSTEM-FIX-PLAN.md Phase 0).
 * Sample data only — nothing here reads or writes the database.
 *
 * Platform admins only (lib/platform-admin, the Platform Integrations rule):
 * the sample bids are made up, so a customer never sees this page. Anyone
 * else who opens the URL is sent to their home screen.
 */

import React, { useEffect, useState } from 'react';
import { IfAllowed } from '@/lib/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { Plus, DownloadSimple, Trophy, XCircle, Copy, Trash, Eye, Archive, PaperPlaneTilt, PencilSimple } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Tabs, Toolbar, DataTable, EmptyState,
  FormModal, Field, Input, Select, Textarea, DateInput, FormGrid, FormSection, ActionBar,
  type Column, type BadgeTone,
} from '@/components/ui/kit';

type SampleBid = {
  id: string;
  name: string;
  client: string;
  trade: string;
  due: string;
  value: number;
  bids: number;
  status: 'Bidding' | 'Awarded' | 'Lost' | 'Overdue' | 'Closed';
};

const SAMPLE: SampleBid[] = [
  { id: '1', name: 'Mesa Logistics Center — Shell', client: 'Copper State Dev.', trade: 'General', due: '2026-10-14', value: 4_820_000, bids: 6, status: 'Bidding' },
  { id: '2', name: 'Chandler Medical Office TI', client: 'Banner Partners', trade: 'Interiors', due: '2026-10-03', value: 1_265_000, bids: 4, status: 'Overdue' },
  { id: '3', name: 'Gilbert Elementary Modernization', client: 'GPS District', trade: 'Mechanical', due: '2026-09-22', value: 2_310_500, bids: 7, status: 'Awarded' },
  { id: '4', name: 'Scottsdale Retail Pad B', client: 'Pinnacle Retail', trade: 'Site Work', due: '2026-09-10', value: 640_000, bids: 3, status: 'Lost' },
  { id: '5', name: 'Tempe Lofts Phase II', client: 'Ash Ave Holdings', trade: 'Framing', due: '2026-10-28', value: 3_150_000, bids: 5, status: 'Bidding' },
  { id: '6', name: 'Phoenix Fire Station 62', client: 'City of Phoenix', trade: 'General', due: '2026-08-30', value: 5_900_000, bids: 9, status: 'Closed' },
];

const STATUS_TONE: Record<SampleBid['status'], BadgeTone> = {
  Bidding: 'lead',
  Awarded: 'under_contract',
  Lost: 'closed',
  Overdue: 'overdue',
  Closed: 'closed',
};

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function KitPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/platform/me')
      .then((r) => (r.ok ? r.json() : { isPlatformAdmin: false }))
      .then((j: { isPlatformAdmin?: boolean }) => { if (live) setAllowed(j.isPlatformAdmin === true); })
      .catch((e) => { console.error('[kit] platform check failed', e); if (live) setAllowed(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => { if (allowed === false) router.replace('/app'); }, [allowed, router]);
  if (!allowed) return null;
  return <KitShowcase />;
}

function KitShowcase() {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [trade, setTrade] = React.useState('');
  const [modal, setModal] = React.useState(false);
  const [confirm, setConfirm] = React.useState<SampleBid | null>(null);
  const [last, setLast] = React.useState('');

  const rows = SAMPLE.filter((r) =>
    (tab === 'all' || (tab === 'open' ? r.status === 'Bidding' || r.status === 'Overdue' : tab === 'won' ? r.status === 'Awarded' : r.status === 'Lost' || r.status === 'Closed')) &&
    (!trade || r.trade === trade) &&
    (!q || `${r.name} ${r.client}`.toLowerCase().includes(q.toLowerCase())),
  );

  const columns: Column<SampleBid>[] = [
    { key: 'name', header: 'Bid Package', primary: true },
    { key: 'client', header: 'Client' },
    { key: 'trade', header: 'Trade' },
    { key: 'due', header: 'Due', render: (r) => new Date(r.due + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    { key: 'bids', header: 'Bids In', align: 'right' },
    { key: 'value', header: 'Est. Value', align: 'right', render: (r) => money(r.value) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge> },
  ];

  return (
    <PageShell
      crumbs={[{ label: 'Saguaro', href: '/app' }, { label: 'Design System' }]}
      title="Design System"
      subtitle="Every page is built from these parts. Change them here and the whole app follows. The rows below are sample data."
      actions={
        <>
          <Button icon={<DownloadSimple size={15} />}>Export</Button>
          <IfAllowed perm={['Projects', 'Edit']}><Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => setModal(true)}>New Bid Package</Button></IfAllowed>
        </>
      }
    >
      <StatRow
        items={[
          { label: 'Open Bids', value: 2, sub: '$6.1M in play' },
          { label: 'Due This Week', value: 1, sub: 'Chandler Medical TI', tone: 'warn' },
          { label: 'Win Rate (90d)', value: '38%', sub: '+6 pts vs prior', tone: 'good' },
          { label: 'Overdue Responses', value: 1, sub: 'Needs a decision', tone: 'bad' },
          { label: 'Awarded YTD', value: '$8.2M', sub: '4 packages' },
        ]}
      />

      <Card flush>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'all', label: 'All', count: SAMPLE.length },
              { key: 'open', label: 'Open', count: 3 },
              { key: 'won', label: 'Won', count: 1 },
              { key: 'closed', label: 'Lost / Closed', count: 2 },
            ]}
          />
        </div>
        <div style={{ padding: 12 }}>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder="Search bid packages…"
            filters={<Select options={['General', 'Interiors', 'Mechanical', 'Site Work', 'Framing']} placeholder="All Trades" value={trade} onChange={(e) => setTrade(e.target.value)} style={{ width: 170 }} />}
            actions={last ? <span className="k-hint">Last action: {last}</span> : undefined}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => setLast(`open ${r.name}`)}
          defaultSort={{ key: 'due', dir: 'asc' }}
          rowActions={(r) => [
            { label: 'View', icon: <Eye size={14} />, inline: true, onClick: () => setLast(`view ${r.name}`) },
            { label: 'Mark Won', icon: <Trophy size={14} />, onClick: () => setLast(`won ${r.name}`), hidden: r.status !== 'Bidding' && r.status !== 'Overdue' },
            { label: 'Mark Lost', icon: <XCircle size={14} />, onClick: () => setLast(`lost ${r.name}`), hidden: r.status !== 'Bidding' && r.status !== 'Overdue' },
            { label: 'Close', icon: <Archive size={14} />, onClick: () => setLast(`close ${r.name}`), hidden: r.status === 'Closed' },
            { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => setLast(`duplicate ${r.name}`) },
            { label: 'Delete', icon: <Trash size={14} />, tone: 'danger', onClick: () => setConfirm(r) },
          ]}
          empty={<EmptyState title="No bid packages match" text="Clear the search or pick a different trade." action={<Button onClick={() => { setQ(''); setTrade(''); setTab('all'); }}>Clear Filters</Button>} />}
        />
      </Card>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card title="Buttons" subtitle="One primary button per screen — the action the user came to take.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="secondary" size="sm">Small</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </Card>
        <Card title="Status Badges" subtitle="The six fixed status colors, plus neutral.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Badge tone="overdue" dot>Overdue</Badge>
            <Badge tone="lead" dot>Lead</Badge>
            <Badge tone="under_contract" dot>Under Contract</Badge>
            <Badge tone="ongoing" dot>Ongoing</Badge>
            <Badge tone="completed" dot>Completed</Badge>
            <Badge tone="closed" dot>Closed</Badge>
            <Badge>Draft</Badge>
          </div>
        </Card>
      </div>

      <Card title="Detail-Page Action Bar" subtitle="The same verbs as the row menu, on the record itself.">
        <ActionBar
          actions={[
            { label: 'Send to Bidders', icon: <PaperPlaneTilt size={15} />, inline: true, onClick: () => setLast('send') },
            { label: 'Edit', icon: <PencilSimple size={15} />, inline: true, onClick: () => setModal(true) },
            { label: 'Mark Won', icon: <Trophy size={15} />, onClick: () => setLast('won') },
            { label: 'Duplicate', icon: <Copy size={15} />, onClick: () => setLast('duplicate') },
            { label: 'Delete', icon: <Trash size={15} />, tone: 'danger', onClick: () => setLast('delete') },
          ]}
        >
          <Badge tone="lead" dot>Bidding</Badge>
          <span className="k-hint">Mesa Logistics Center — Shell · due Oct 14</span>
        </ActionBar>
      </Card>

      <Card title="Empty State">
        <EmptyState title="No daily logs yet" text="Log today's weather, crew and work so the owner report writes itself." action={<Button variant="primary" icon={<Plus size={15} weight="bold" />}>New Daily Log</Button>} />
      </Card>

      <FormModal
        open={modal}
        onClose={() => setModal(false)}
        title="New Bid Package"
        subtitle="Sample form — nothing is saved."
        submitLabel="Create Bid Package"
        onSubmit={() => { setModal(false); setLast('created (sample)'); }}
      >
        <FormGrid cols={2}>
          <FormSection>Package</FormSection>
          <Field label="Package Name" required span><Input placeholder="e.g. Mesa Logistics Center — Shell" /></Field>
          <Field label="Client" required><Input placeholder="Company" /></Field>
          <Field label="Trade"><Select options={['General', 'Interiors', 'Mechanical', 'Site Work', 'Framing']} placeholder="Choose a trade" /></Field>
          <Field label="Bids Due" required><DateInput /></Field>
          <Field label="Estimated Value" hint="Used for pipeline totals."><Input inputMode="decimal" placeholder="$0" /></Field>
          <FormSection>Scope</FormSection>
          <Field label="Scope Notes" span><Textarea placeholder="What's included, alternates, exclusions…" /></Field>
        </FormGrid>
      </FormModal>

      <FormModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title="Delete Bid Package?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash size={15} />} onClick={() => { setLast(`deleted ${confirm?.name} (sample)`); setConfirm(null); }}>Delete</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>{confirm?.name} and its bidder invitations will be removed. This can’t be undone.</p>
      </FormModal>
    </PageShell>
  );
}
