'use client';
/**
 * Crew Timesheets — the job's time entries for a week, with approve / reject.
 *
 * Every read / write is the one this screen already used:
 *   list     GET   /api/projects/[id]/timesheets?week=current|last|all
 *   create   POST  /api/timesheets/create            (lands as pending)
 *   decide   PATCH /api/timesheets/[id]/status       { status: 'approved' | 'rejected' }
 */
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useParams } from 'next/navigation';
import { Clock, Plus, ListNumbers, HourglassMedium, CheckCircle, XCircle, CurrencyDollar, WarningCircle } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Tabs, Toolbar, DataTable, EmptyState,
  FormModal, FormGrid, Field, Input, Select, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { localDay } from '@/lib/calendar-day';
import { addDays } from '@/lib/time-zone';

interface TimeEntry {
  id: string;
  employee: string;
  date: string;
  regular_hrs: number;
  ot_hrs: number;
  classification: string;
  status: string;
  project_id: string;
  /** "PTO" / "Sick" … on a leave row (its regular / OT are 0), else null. */
  leave_label?: string | null;
  /** Punched with no signal and sent later — the times came from the phone. */
  sent_late?: boolean;
  /** Leave hours (hours_worked) on a leave row, else null. */
  leave_hrs?: number | null;
}

type WeekFilter = 'current' | 'last' | 'all';
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  // The local Monday's own day — toISOString() was the UTC day, which after 7 PM in Iowa is Tuesday.
  return localDay(d);
}

const CLASSIFICATIONS = ['Laborer', 'Carpenter', 'Electrician', 'Plumber', 'Ironworker', 'Operator', 'Superintendent', 'Foreman'];

/** A blank entry dated today on this device — fresh each time, not frozen at page load (or at the server's UTC day). */
const emptyForm = () => ({ employee: '', date: localDay(), regular_hrs: 8, ot_hrs: 0, classification: 'Laborer', costCode: '' });

const fmt = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }));
const fmtHrs = (n: number) => `${(Number(n) || 0).toFixed(1)}h`;
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDate = (d?: string | null) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const workedHrs = (e: TimeEntry) => (Number(e.regular_hrs) || 0) + (Number(e.ot_hrs) || 0);

/** One status → one badge (lib/status-colors). */
function statusBadge(s: string): { label: string; tone: BadgeTone } {
  const k = String(s || 'pending').toLowerCase();
  if (k === 'approved') return { label: 'Approved', tone: 'ongoing' };
  if (k === 'rejected') return { label: 'Rejected', tone: 'overdue' };
  if (k === 'paid') return { label: 'Paid', tone: 'completed' };
  if (k === 'draft') return { label: 'Draft', tone: 'neutral' };
  if (k === 'submitted') return { label: 'Submitted', tone: 'under_contract' };
  return { label: 'Pending', tone: 'under_contract' };
}

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function TimesheetsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `timesheets:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast(4000);
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('current');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  // Project snapshot (/api/project-context): cost codes, budget actuals, open
  // items — the entry form walks in knowing the job.
  const { ctx } = useProjectContext(projectId);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/timesheets?week=${weekFilter}`);
      const json = await res.json();
      setEntries(json.entries || []);
    } catch {
      setEntries([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, weekFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Dead-space kill (spec 4.1): an empty log opens straight into the entry
  // composer (today + 8h defaulted, roster type-ahead). One-shot per visit so
  // Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && entries.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [loading, entries.length]);

  const currentWeekStart = getWeekStart(new Date());
  const lastWeekStart = addDays(currentWeekStart, -7);

  const filtered = entries.filter(e => {
    if (weekFilter === 'all') return true;
    if (weekFilter === 'current') return e.date >= currentWeekStart;
    if (weekFilter === 'last') return e.date >= lastWeekStart && e.date < currentWeekStart;
    return true;
  });

  // Roster the system already knows — every name ever logged on this job.
  const roster = Array.from(new Set(entries.map(e => (e.employee || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  // Cost codes: real budget lines when the project has them, else the full CSI division list.
  const codeOptions: { value: string; label: string; division: string }[] = (ctx?.costCodes?.length
    ? ctx.costCodes.map((c: any) => ({ value: String(c.costCode || c.division || ''), label: `${c.costCode || c.division} — ${c.description || ''}`.trim(), division: String(c.division || '').slice(0, 2) }))
    : Object.entries(CSI_DIVISIONS).map(([code, d]) => ({ value: code, label: `${code} — ${d.name}`, division: code })));

  const totalEntries = filtered.length;
  const totalHours = filtered.reduce((s, e) => s + e.regular_hrs + e.ot_hrs, 0);
  const pendingCount = filtered.filter(e => e.status === 'pending').length;
  const approvedCount = filtered.filter(e => e.status === 'approved').length;

  // The table: this period, then the status tile / filter and the search.
  const q = search.trim().toLowerCase();
  const shown = filtered.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (!q) return true;
    return [e.employee, e.classification, e.leave_label].some(v => String(v || '').toLowerCase().includes(q));
  });
  const filtersActive = statusFilter !== 'all' || !!q;
  const clearFilters = () => { setStatusFilter('all'); setSearch(''); };
  const toggleStatus = (s: StatusFilter) => setStatusFilter(prev => (prev === s ? 'all' : s));

  async function handleSave(): Promise<boolean> {
    if (!form.employee) return false;
    setSaving(true);
    try {
      const res = await fetch('/api/timesheets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          work_date: form.date || undefined,
          status: 'pending',
          // Structured fields so the crew member, hours, and trade actually
          // persist (previously only work_description survived; hours + name
          // were dropped and the entry showed the logged-in user at 0 hrs).
          employee_name: form.employee,
          regular_hours: form.regular_hrs,
          overtime_hours: form.ot_hrs,
          trade: form.classification,
          // Cost-code attribution (additive — no existing field renamed) so the
          // approval step can post this labor against the right budget division.
          csi_division: form.costCode ? (codeOptions.find(c => c.value === form.costCode)?.division || String(form.costCode).slice(0, 2)) : undefined,
          cost_code_description: form.costCode ? (codeOptions.find(c => c.value === form.costCode)?.label || form.costCode) : undefined,
          work_description: [form.employee, form.classification, form.costCode ? (codeOptions.find(c => c.value === form.costCode)?.label || form.costCode) : ''].filter(Boolean).join(' — '),
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setShowForm(false);
      setForm(emptyForm());
      show('Timesheet entry added.');
      fetchEntries();
      guard.clearDraft();
      return true;
    } catch {
      show('Could not add the entry. Please try again.', 'bad');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(id: string, action: 'approved' | 'rejected') {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: action } : e));
    try {
      const res = await fetch(`/api/timesheets/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) throw new Error('update failed');
      show(`Timesheet ${action}.`);
    } catch {
      show('Could not update the timesheet. Please try again.', 'bad');
      fetchEntries();
    }
  }

  function openForm() { setShowForm(true); }
  /** Every close path for the entry modal (X, Cancel, Esc, backdrop) runs through the guard. */
  function closeForm() { guard.requestClose(() => setShowForm(false)); }

  const base = `/app/projects/${projectId}`;
  const stats: StatItem[] = [
    { label: 'Total Entries', value: loading ? '—' : String(totalEntries), sub: 'Logged this period', icon: <ListNumbers size={15} />, onClick: clearFilters, active: !filtersActive },
    { label: 'Total Hours', value: loading ? '—' : fmtHrs(totalHours), sub: 'Regular + overtime', icon: <Clock size={15} /> },
    { label: 'Pending Approval', value: loading ? '—' : String(pendingCount), tone: pendingCount > 0 ? 'warn' : 'default', sub: 'Awaiting review', icon: <HourglassMedium size={15} />, onClick: () => toggleStatus('pending'), active: statusFilter === 'pending' },
    { label: 'Approved', value: loading ? '—' : String(approvedCount), tone: approvedCount > 0 ? 'good' : 'default', sub: 'This period', icon: <CheckCircle size={15} />, onClick: () => toggleStatus('approved'), active: statusFilter === 'approved' },
    ...(ctx ? [{ label: 'Budget Actuals', value: fmt(Number(ctx.budget?.actual) || 0), sub: 'Approved labor posts here', icon: <CurrencyDollar size={15} />, href: `${base}/budget` } as StatItem] : []),
  ];

  const columns: Column<TimeEntry>[] = [
    { key: 'employee', header: 'Employee', primary: true, phone: 'show', accessor: e => e.employee || '', render: e => e.employee || '—' },
    { key: 'date', header: 'Date', phone: 'show', accessor: e => e.date || '', render: e => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{fmtDate(e.date)}</span>
        {e.sent_late && <Badge tone="lead">Punched offline</Badge>}
      </span>
    ) },
    /* A PTO / sick row: no worked hours. Show its leave hours and what kind of
       leave it is — it used to read as an unlabeled 0-hour shift. */
    { key: 'regular_hrs', header: 'Regular Hrs', align: 'right', phone: 'hide', total: 'sum', format: fmtHrs, accessor: e => (e.leave_label ? null : Number(e.regular_hrs) || 0), render: e => e.leave_label ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : e.regular_hrs },
    { key: 'ot_hrs', header: 'OT Hrs', align: 'right', phone: 'hide', total: 'sum', format: fmtHrs, accessor: e => (e.leave_label ? null : Number(e.ot_hrs) || 0), render: e => e.leave_label ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : <span style={{ color: e.ot_hrs > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{e.ot_hrs}</span> },
    { key: 'total_hrs', header: 'Total Hrs', align: 'right', phone: 'show', accessor: e => (e.leave_label ? Number(e.leave_hrs ?? 0) : workedHrs(e)),
      // Worked hours only — leave hours post nothing to job cost.
      total: rows => fmtHrs(rows.reduce((s, e) => s + (e.leave_label ? 0 : workedHrs(e)), 0)),
      render: e => e.leave_label
        ? <span style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }} title="Leave hours — not worked time, posts nothing to job cost">{fmtHrs(Number(e.leave_hrs ?? 0))}</span>
        : <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmtHrs(workedHrs(e))}</span> },
    { key: 'classification', header: 'Classification', phone: 'hide', accessor: e => (e.leave_label ? `${e.leave_label} · leave` : e.classification || ''), render: e => e.leave_label ? <Badge tone="neutral">{`${e.leave_label} · leave`}</Badge> : <span style={{ color: 'var(--text-secondary)' }}>{e.classification || '—'}</span> },
    { key: 'status', header: 'Status', phone: 'show', accessor: e => statusBadge(e.status).label, render: e => { const b = statusBadge(e.status); return <Badge tone={b.tone} dot>{b.label}</Badge>; } },
  ];

  const entryActions = (e: TimeEntry): Action[] => [
    { label: 'Approve', icon: <CheckCircle size={14} />, inline: true, onClick: () => handleAction(e.id, 'approved'), hidden: e.status !== 'pending' },
    { label: 'Reject', icon: <XCircle size={14} />, tone: 'danger', inline: true, onClick: () => handleAction(e.id, 'rejected'), hidden: e.status !== 'pending' },
  ];

  let body: React.ReactNode;
  if (!loading && loadError) {
    body = <EmptyState icon={<WarningCircle size={22} />} title="Couldn’t load time entries" text="Nothing has been lost — try again." action={<Button onClick={fetchEntries}>Try Again</Button>} />;
  } else if (!loading && filtered.length === 0) {
    body = (
      <EmptyState
        icon={<Clock size={22} />}
        title={entries.length === 0 ? 'No time entries yet' : 'No entries in this period'}
        text={entries.length === 0 ? 'Log the first crew entry — the roster builds as you go.' : 'Switch the week, or add one for this period.'}
        action={<Button icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add Entry</Button>}
      />
    );
  } else {
    body = (
      <DataTable<TimeEntry>
        tableId="project-timesheets"
        exportName="timesheets"
        columns={columns}
        rows={shown}
        loading={loading}
        rowKey={e => e.id}
        defaultSort={{ key: 'date', dir: 'desc' }}
        rowActions={entryActions}
        empty={<EmptyState title="No entries match" text="Change the search or the status filter." action={<Button onClick={clearFilters}>Clear Filters</Button>} />}
      />
    );
  }

  const totalForm = (Number(form.regular_hrs) || 0) + (Number(form.ot_hrs) || 0);
  const otForm = Number(form.ot_hrs) || 0;

  return (
    <>
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'Timesheets' },
        ]}
        title="Crew Timesheets"
        subtitle="Weekly crew hours — approve to post labor to job cost."
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add Entry</Button>}
      >
        <StatRow items={stats} />

        <Tabs
          tabs={[{ key: 'current', label: 'Current Week' }, { key: 'last', label: 'Last Week' }, { key: 'all', label: 'All' }]}
          value={weekFilter}
          onChange={k => setWeekFilter(k as WeekFilter)}
        />

        {!loading && !loadError && filtered.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search employee or classification…"
            filters={
              <>
                <Select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={{ width: 'auto', minWidth: 150 }}
                  options={[{ value: 'all', label: 'All Statuses' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>{shown.length} of {filtered.length}</span>}
          />
        )}

        <Card flush>{body}</Card>
      </PageShell>

      <FormModal
        open={showForm}
        onClose={closeForm}
        title="Add Timesheet Entry"
        subtitle="Lands as pending for approval."
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Save Entry"
        busy={saving}
      >
        <FormGrid cols={3}>
          <Field label="Employee" required hint={roster.length > 0 ? `${roster.length} crew name${roster.length === 1 ? '' : 's'} on file — start typing to pick.` : undefined}>
            <Suggest type="text" className="k-input" required value={form.employee} onChange={e => setForm(p => ({ ...p, employee: e.target.value }))} placeholder="Crew member name" options={roster} autoFocus />
          </Field>
          <Field label="Date" hint="Today — edit to backfill.">
            <div style={{ width: '100%' }}><SaguaroDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Classification">
            <Select value={form.classification} onChange={e => setForm(p => ({ ...p, classification: e.target.value }))} options={CLASSIFICATIONS} />
          </Field>
          <Field label="Cost Code" hint={ctx?.costCodes?.length ? 'From the project budget lines.' : 'CSI divisions.'}>
            <Select value={form.costCode} onChange={e => setForm(p => ({ ...p, costCode: e.target.value }))} placeholder="Unassigned" options={codeOptions.map(c => ({ value: c.value, label: c.label }))} />
          </Field>
          <Field label="Regular Hours" hint="Hours past 8 go in OT.">
            <Input type="number" min={0} max={24} value={form.regular_hrs} onChange={e => setForm(p => ({ ...p, regular_hrs: Number(e.target.value) }))} />
          </Field>
          <Field label="OT Hours" hint={<span style={{ color: otForm > 0 ? 'var(--warning)' : undefined }}>{`Total ${totalForm}h${otForm > 0 ? ` · ${otForm}h overtime` : ''}`}</span>}>
            <Input type="number" min={0} max={24} value={form.ot_hrs} onChange={e => setForm(p => ({ ...p, ot_hrs: Number(e.target.value) }))} />
          </Field>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </>
  );
}
