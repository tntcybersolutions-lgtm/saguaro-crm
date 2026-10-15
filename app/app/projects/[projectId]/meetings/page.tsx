'use client';
/**
 * Meetings — every meeting on the job (OAC, sub coordination, safety, precon,
 * internal), numbered per series, with the items still open across them.
 *
 * Reads  GET  /api/projects/:id/meetings   (meetings + item counts + stats)
 * New    POST /api/projects/:id/meetings   then opens the minutes editor
 * Opens  /app/projects/:id/meetings/:meetingId
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, FormModal, FormGrid, Field, Input,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { UsersThree, Plus, CalendarBlank, ListChecks, WarningCircle, PaperPlaneTilt, ArrowSquareOut, Database } from '@phosphor-icons/react';
import {
  MEETING_TYPES, normalizeStatus, statusLabel, typeLabel, TABLE_MISSING_CODE, TABLE_MISSING_MESSAGE,
  type MeetingStatus,
} from '@/lib/meetings';

type Row = {
  id: string;
  title: string;
  meeting_type: string;
  meeting_number: number | null;
  meeting_date: string;
  start_time: string | null;
  location: string | null;
  status: string | null;
  distributed_at: string | null;
  open_items: number;
  overdue_items: number;
  item_count: number;
};
type Stats = { upcoming: number; openItems: number; overdueItems: number; distributed: number };

const STATUS_TONE: Record<MeetingStatus, BadgeTone> = {
  scheduled: 'under_contract',
  in_progress: 'ongoing',
  minutes_draft: 'lead',
  distributed: 'completed',
};

const fmtDate = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtTime = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

type Filter = 'all' | 'upcoming' | 'open' | 'overdue' | 'distributed';

export default function MeetingsPage() {
  const { projectId } = useParams() as { projectId: string };
  const router = useRouter();
  const { ctx } = useProjectContext(projectId);
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [today, setToday] = useState('');
  const [itemsMissing, setItemsMissing] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', meeting_type: 'oac', meeting_date: '', start_time: '', location: '' });

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/meetings`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (j.code === TABLE_MISSING_CODE) { setTableMissing(true); return; }
      if (!r.ok) throw new Error(j.error || "Couldn't load meetings");
      setRows(j.meetings || []);
      setStats(j.stats || null);
      setToday(j.today || '');
      setItemsMissing(!!j.itemsMissing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load meetings");
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== 'all' && r.meeting_type !== type) return false;
      const st = normalizeStatus(r.status);
      if (filter === 'upcoming' && !(st === 'scheduled' && r.meeting_date.slice(0, 10) >= today)) return false;
      if (filter === 'open' && !r.open_items) return false;
      if (filter === 'overdue' && !r.overdue_items) return false;
      if (filter === 'distributed' && st !== 'distributed') return false;
      if (!q) return true;
      return [r.title, typeLabel(r.meeting_type), r.location, `#${r.meeting_number ?? ''}`].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [rows, search, type, filter, today]);

  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? 'all' : f));
  const v = (n: number | undefined) => (loading || !stats ? '—' : String(n ?? 0));
  const items: StatItem[] = [
    { label: 'Upcoming', value: v(stats?.upcoming), icon: <CalendarBlank size={15} />, onClick: () => toggle('upcoming'), active: filter === 'upcoming' },
    { label: 'Open items', value: itemsMissing ? '—' : v(stats?.openItems), icon: <ListChecks size={15} />, onClick: () => toggle('open'), active: filter === 'open' },
    { label: 'Overdue items', value: itemsMissing ? '—' : v(stats?.overdueItems), tone: stats?.overdueItems ? 'bad' : 'default', icon: <WarningCircle size={15} />, onClick: () => toggle('overdue'), active: filter === 'overdue' },
    { label: 'Distributed', value: v(stats?.distributed), icon: <PaperPlaneTilt size={15} />, onClick: () => toggle('distributed'), active: filter === 'distributed' },
  ];

  const columns: Column<Row>[] = [
    { key: 'meeting_number', header: '#', width: 70, align: 'right', accessor: (r) => r.meeting_number ?? 0, render: (r) => (r.meeting_number ? `#${r.meeting_number}` : '—'), groupable: false },
    { key: 'title', header: 'Meeting', primary: true, phone: 'show' },
    { key: 'meeting_type', header: 'Type', accessor: (r) => typeLabel(r.meeting_type), render: (r) => typeLabel(r.meeting_type) },
    { key: 'meeting_date', header: 'Date', phone: 'show', accessor: (r) => r.meeting_date, render: (r) => <span>{fmtDate(r.meeting_date)}{r.start_time ? ` · ${fmtTime(r.start_time)}` : ''}</span> },
    { key: 'location', header: 'Location', render: (r) => r.location || '—' },
    { key: 'status', header: 'Status', phone: 'show', accessor: (r) => statusLabel(r.status), render: (r) => <Badge tone={STATUS_TONE[normalizeStatus(r.status)]} dot>{statusLabel(r.status)}</Badge> },
    { key: 'open_items', header: 'Open items', align: 'right', total: 'sum', render: (r) => (r.open_items ? String(r.open_items) : '—') },
    { key: 'overdue_items', header: 'Overdue', align: 'right', total: 'sum', render: (r) => (r.overdue_items ? <span style={{ color: 'var(--danger)' }}>{r.overdue_items}</span> : '—') },
  ];

  async function create() {
    setFormErr(null);
    if (!form.meeting_date) { setFormErr('Date: pick the meeting date.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/meetings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't create the meeting");
      router.push(`/app/projects/${projectId}/meetings/${j.meeting.id}`);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Couldn't create the meeting");
      setBusy(false);
    }
  }

  const base = `/app/projects/${projectId}`;
  const newBtn = (
    <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => { setForm((f) => ({ ...f, meeting_date: f.meeting_date || today })); setOpen(true); }}>
      New meeting
    </Button>
  );

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Meetings' },
      ]}
      title="Meetings"
      actions={tableMissing ? undefined : newBtn}
    >
      {tableMissing ? (
        <EmptyState icon={<Database size={22} />} title={TABLE_MISSING_MESSAGE} text="supabase/migrations/20261015c_meetings.sql" />
      ) : (
        <>
          {!error && <StatRow items={items} />}
          {itemsMissing && !loading && (
            <EmptyState icon={<Database size={22} />} title={TABLE_MISSING_MESSAGE} text="Meeting items need supabase/migrations/20261015c_meetings.sql." />
          )}

          {!loading && !error && rows.length > 0 && (
            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search meetings…"
              filters={
                <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 'auto', minWidth: 170 }}
                  options={[{ value: 'all', label: 'All types' }, ...MEETING_TYPES.map((t) => ({ value: t, label: typeLabel(t) }))]} />
              }
            />
          )}

          {error ? (
            <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load meetings" text={error} action={<Button onClick={() => { setLoading(true); load(); }}>Try again</Button>} />
          ) : (
            <DataTable<Row>
              tableId="project-meetings"
              exportName="meetings"
              columns={columns}
              rows={shown}
              loading={loading}
              rowKey={(r) => r.id}
              defaultSort={{ key: 'meeting_date', dir: 'desc' }}
              onRowClick={(r) => router.push(`${base}/meetings/${r.id}`)}
              rowActions={(r) => [{ label: 'Open', icon: <ArrowSquareOut size={14} />, href: `${base}/meetings/${r.id}` }]}
              empty={
                rows.length === 0 ? (
                  <EmptyState icon={<UsersThree size={22} />} title="No meetings on this job yet" action={newBtn} />
                ) : (
                  <EmptyState title="Nothing matches" action={<Button onClick={() => { setSearch(''); setType('all'); setFilter('all'); }}>Clear filters</Button>} />
                )
              }
            />
          )}
        </>
      )}

      <FormModal open={open} onClose={() => !busy && setOpen(false)} title="New meeting" onSubmit={create} submitLabel="Create meeting" busy={busy} error={formErr}>
        <FormGrid cols={2}>
          <Field label="Type" required>
            <Select value={form.meeting_type} onChange={(e) => setForm({ ...form, meeting_type: e.target.value })}
              options={MEETING_TYPES.map((t) => ({ value: t, label: typeLabel(t) }))} />
          </Field>
          <Field label="Title">
            <Input value={form.title} placeholder={`${typeLabel(form.meeting_type)} meeting`} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Date" required>
            <Input type="date" required value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </Field>
          <Field label="Location" span>
            <Input value={form.location} placeholder="Jobsite trailer, video call…" onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
        </FormGrid>
      </FormModal>
    </PageShell>
  );
}
