'use client';
/**
 * W-9 Requests — collect W-9s from every vendor and sub on the job. The bid-award
 * gate refuses to award to a sub with no W-9 on file, so this unblocks buyout.
 *
 * Reads  GET  /api/projects/:id                          (contract subs)
 *        GET  /api/documents/w9-request?projectId=       (request trail)
 * Sends  POST /api/documents/w9-request  { projectId, subId?, vendorName, vendorEmail }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select,
  FormModal, Field, Input, FormGrid, ItemList, ItemRow, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FileText, PaperPlaneTilt, Plus, SealCheck, UsersThree, Hourglass, WarningCircle } from '@phosphor-icons/react';
import { localDay } from '@/lib/calendar-day';

interface W9Sub {
  id: string;
  name: string;
  email: string;
  w9_status: string;
  requested_date: string | null;
  received_date: string | null;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  received: 'ongoing',
  submitted: 'ongoing',
  pending: 'lead',
  not_requested: 'overdue',
};

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  submitted: 'Received',
  pending: 'Pending',
  not_requested: 'Not Requested',
};

const fmtDay = (v: string | null) => (v ? new Date(`${v}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

type W9Filter = 'all' | 'received' | 'pending' | 'missing';

export default function W9Page() {
  const params = useParams();
  const projectId = params.projectId as string;
  const base = `/app/projects/${projectId}`;
  const [subs, setSubs] = useState<W9Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, show } = useToast(4000);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Which slice of the roster the table shows — the stat tiles drive this so a
  // tap on "Pending" drills the list to exactly those rows.
  const [filter, setFilter] = useState<W9Filter>('all');
  const toggleFilter = (f: W9Filter) => setFilter(prev => (prev === f ? 'all' : f));

  // Project intelligence — roster + bid packages from one snapshot.
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
  const q = search.trim().toLowerCase();
  const filteredSubs = subs.filter(s => matchesFilter(s) && (!q || `${s.name} ${s.email}`.toLowerCase().includes(q)));
  const FILTER_LABEL: Record<W9Filter, string> = { all: 'All subs', received: 'W-9 received', pending: 'W-9 pending', missing: 'W-9 missing' };

  // Roster subs with no W-9 trail here at all — surfaced so the bid-award gate
  // ("W-9 not on file" blocks award) never surprises anyone at buyout.
  const rosterNorm = (v: any) => String(v || '').toLowerCase().trim();
  const ctxSubs = (ctx?.subs || []) as any[];
  const trackedKeys = new Set(subs.flatMap(s => [rosterNorm(s.email), rosterNorm(s.name)]).filter(Boolean));
  const untrackedRoster = ctxSubs.filter(s => !trackedKeys.has(rosterNorm(s.email)) && !trackedKeys.has(rosterNorm(s.companyName)));
  const fmt = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }));

  async function requestW9(subId: string, subName: string, subEmail: string) {
    if (!subEmail.trim()) {
      show(`No email on file for ${subName || 'this vendor'}. Use "Send W-9 request" to enter one.`, 'bad');
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
      setSubs(prev => prev.map(s => s.id === subId ? { ...s, w9_status: 'pending', requested_date: localDay() } : s));
      show(`W-9 request sent to ${subName}.`);
    } catch {
      show(`Could not send the W-9 request to ${subName}. Please try again.`, 'bad');
    }
    setRequestingId(null);
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
      show(`W-9 request sent to ${formEmail}.`);
      setFormName('');
      setFormEmail('');
      setShowForm(false);
      fetchSubs();
    } catch {
      show('Could not send the W-9 request. Please try again.', 'bad');
    }
    setSending(false);
  }

  const stats: StatItem[] = [
    { label: 'Subs', value: totalSubs, icon: <UsersThree size={15} />, active: filter === 'all', onClick: () => setFilter('all') },
    { label: 'W-9 received', value: receivedCount, tone: receivedCount > 0 ? 'good' : 'default', icon: <SealCheck size={15} />, active: filter === 'received', onClick: () => toggleFilter('received') },
    { label: 'W-9 pending', value: pendingCount, tone: pendingCount > 0 ? 'warn' : 'default', icon: <Hourglass size={15} />, active: filter === 'pending', onClick: () => toggleFilter('pending') },
    { label: 'W-9 missing', value: missingCount, tone: missingCount > 0 ? 'bad' : 'default', icon: <WarningCircle size={15} />, sub: missingCount > 0 ? 'Blocks bid award' : undefined, active: filter === 'missing', onClick: () => toggleFilter('missing') },
  ];

  const columns: Column<W9Sub>[] = [
    { key: 'name', header: 'Sub name', primary: true, render: (s) => s.name || 'Unnamed sub' },
    { key: 'email', header: 'Email', render: (s) => s.email ? <a className="k-link" href={`mailto:${s.email}`} onClick={(e) => e.stopPropagation()}>{s.email}</a> : '' },
    { key: 'w9_status', header: 'W-9 status', phone: 'show', accessor: (s) => STATUS_LABEL[s.w9_status] || s.w9_status, render: (s) => <Badge tone={STATUS_TONE[s.w9_status] || 'neutral'} dot>{STATUS_LABEL[s.w9_status] || s.w9_status}</Badge> },
    { key: 'requested_date', header: 'Requested', accessor: (s) => s.requested_date || '', render: (s) => fmtDay(s.requested_date) },
    { key: 'received_date', header: 'Received', phone: 'show', accessor: (s) => s.received_date || '', render: (s) => s.received_date ? <span style={{ color: 'var(--success)' }}>{fmtDay(s.received_date)}</span> : '' },
  ];

  const rowActions = (s: W9Sub): Action[] => [
    {
      label: requestingId === s.id ? 'Sending…' : s.w9_status === 'pending' ? 'Resend' : 'Request W-9',
      icon: <PaperPlaneTilt size={14} />,
      onClick: () => requestW9(s.id, s.name, s.email),
      inline: true,
      hidden: !(s.w9_status === 'not_requested' || s.w9_status === 'pending'),
      disabled: requestingId === s.id,
    },
  ];

  const openForm = () => setShowForm(true);
  const formValid = !!formName.trim() && !!formEmail.trim();

  return (
    <div className="w9Ws">
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'W-9 Requests' },
        ]}
        title="W-9 requests"
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Send W-9 request</Button>}
      >
        {!loading && (totalSubs > 0 || untrackedRoster.length > 0) && <StatRow items={stats} />}

        {/* Roster gaps — subs on the project with no W-9 trail at all */}
        {!loading && untrackedRoster.length > 0 && (
          <Card title="On the roster, never asked" subtitle={`${untrackedRoster.length} sub${untrackedRoster.length === 1 ? '' : 's'} with no W-9 · blocks award`} icon={<WarningCircle size={16} />}>
            <ItemList>
              {untrackedRoster.map((s: any) => (
                <ItemRow
                  key={s.id}
                  title={s.companyName}
                  desc={`${s.trade || 'Subcontractor'}${Number(s.contractAmount) > 0 ? ` · ${fmt(Number(s.contractAmount))}` : ''}`}
                  action={
                    <Button
                      size="sm"
                      icon={s.email ? <PaperPlaneTilt size={13} /> : <Plus size={13} weight="bold" />}
                      onClick={() => {
                        if (s.email) { requestW9(s.id, s.companyName || '', s.email).then(() => fetchSubs()); }
                        else { setFormName(s.companyName || ''); setFormEmail(''); setAutoFill(true); setShowForm(true); }
                      }}
                    >
                      {s.email ? 'Request W-9' : 'Add email'}
                    </Button>
                  }
                />
              ))}
            </ItemList>
          </Card>
        )}

        {!loading && subs.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by name or email…"
            filters={
              <>
                <Select aria-label="W-9 status" value={filter} onChange={e => setFilter(e.target.value as W9Filter)} style={{ width: 'auto', minWidth: 160 }}
                  options={(Object.keys(FILTER_LABEL) as W9Filter[]).map(k => ({ value: k, label: FILTER_LABEL[k] }))} />
                {(filter !== 'all' || search) && <Button variant="ghost" size="sm" onClick={() => { setFilter('all'); setSearch(''); }}>Clear</Button>}
              </>
            }
            actions={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>{filteredSubs.length} of {subs.length}</span>}
          />
        )}

        <Card flush>
          <DataTable<W9Sub>
            tableId="project-w9"
            exportName="w9-requests"
            columns={columns}
            rows={filteredSubs}
            loading={loading}
            rowKey={(s) => s.id}
            defaultSort={{ key: 'name', dir: 'asc' }}
            rowActions={rowActions}
            empty={subs.length === 0 ? (
              <EmptyState
                icon={<FileText size={22} />}
                title="No W-9s tracked yet"
                action={<Button icon={<Plus size={15} weight="bold" />} onClick={openForm}>Send a W-9 request</Button>}
              />
            ) : (
              <EmptyState title={`No subs are ${FILTER_LABEL[filter].toLowerCase()}`} action={<Button onClick={() => { setFilter('all'); setSearch(''); }}>Show all {subs.length}</Button>} />
            )}
          />
        </Card>
      </PageShell>

      <FormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Send W-9 request"
        subtitle="They get a secure link. No account needed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={sending}>Cancel</Button>
            <Button variant="primary" icon={<PaperPlaneTilt size={15} weight="fill" />} onClick={sendNewRequest} disabled={sending || !formValid}>
              {sending ? 'Sending…' : 'Send request'}
            </Button>
          </>
        }
      >
        <FormGrid cols={2}>
          {ctxSubs.length > 0 && (
            <Field label="From the project roster" span>
              <Select
                value={autoFill ? (ctxSubs.find(s => s.companyName === formName)?.id || '') : ''}
                onChange={e => {
                  const s = ctxSubs.find(x => x.id === e.target.value);
                  if (s) { setFormName(s.companyName || ''); setFormEmail(s.email || ''); setAutoFill(true); }
                  else setAutoFill(false);
                }}
                placeholder="Someone else — enter details below"
                options={ctxSubs.map((s: any) => ({ value: String(s.id), label: `${s.companyName}${s.trade ? ` — ${s.trade}` : ''}${s.email ? '' : ' (no email on file)'}` }))}
              />
            </Field>
          )}
          <Field label="Vendor / sub name" required hint={autoFill && !!formName ? 'From the roster.' : undefined}>
            <Input value={formName} onChange={e => { setFormName(e.target.value); setAutoFill(false); }} placeholder="ABC Electrical LLC" />
          </Field>
          <Field label="Email address" required hint={autoFill && !!formEmail ? 'From the roster.' : 'Until it comes back, the award gate blocks this sub.'}>
            <Input type="email" value={formEmail} onChange={e => { setFormEmail(e.target.value); setAutoFill(false); }} placeholder="accounting@vendor.com" />
          </Field>
        </FormGrid>
      </FormModal>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
