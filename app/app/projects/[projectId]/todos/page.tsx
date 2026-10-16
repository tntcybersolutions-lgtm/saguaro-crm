'use client';
/**
 * Project To-Dos — the small field actions with an owner and a due date.
 *
 * Reads   GET   /api/projects/:id/todos
 *         GET   /api/projects/:id/team          (assignee suggestions)
 * Create  POST  /api/projects/:id/todos         { title, description, assigned_to, due_date, priority, status:'open' }
 * Done    PATCH /api/todos/:id/complete
 */
import { jsonRequest } from '@/lib/list-view';
import { useEditRights } from '@/lib/hooks/usePermissions';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, Tabs, DataTable, EmptyState, Select,
  FormModal, Field, Input, DateInput, Textarea, FormGrid, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { Clipboard, Check, Plus, CheckCircle, CalendarBlank, WarningCircle, Fire, ChartPieSlice, ListChecks } from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { localDay } from '@/lib/calendar-day';

interface TodoItem {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  due_date: string;
  priority: string;
  complete: boolean;
  project_id: string;
}

type FilterTab = 'all' | 'active' | 'completed';

const PRIORITY_TONE: Record<string, BadgeTone> = { high: 'overdue', medium: 'under_contract', low: 'neutral' };
const PRIORITIES = ['high', 'medium', 'low'];
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

interface TeamMember { id: string; name: string; email: string; role: string; }

const EMPTY_FORM = { title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' };

const CSS = `
.tdCheck { width: 26px; height: 26px; border-radius: 7px; border: 2px solid var(--border-strong); background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: var(--bg-base); }
.tdCheck[aria-checked="true"] { border-color: var(--success); background: var(--success); cursor: default; }
.tdDone { text-decoration: line-through; }
.tdDesc { font-size: 12px; color: var(--text-tertiary); white-space: normal; line-height: 1.4; }
.tdLate { color: var(--danger); font-weight: 700; white-space: nowrap; }
.tdDue { white-space: nowrap; }
.tdUnassigned { color: var(--text-tertiary); font-style: italic; }
@media (max-width: 640px) {
  .tdWs .k-btn, .tdWs .k-stat, .tdWs select.k-select, .tdWs .k-input { min-height: 44px; }
  .tdCheck { width: 32px; height: 32px; }
}
`;

export default function TodosPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `todos:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleAdd(),
  });
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast(4000);
  const rights = useEditRights('Projects');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const today = localDay(); // This device's day — toISOString() is the UTC day, tomorrow from 7 PM on in Iowa.

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/todos`);
      const json = await res.json();
      setTodos((json.todos || []).map((t: TodoItem & { status?: string }) => ({ ...t, complete: /complete/i.test(String(t.status || '')) })));
    } catch {
      setTodos([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  // Project intelligence — roster for the assignee field + cross-module counts.
  const { ctx } = useProjectContext(projectId);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [auto, setAuto] = useState<{ due?: boolean }>({});
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/team`);
        const j = await r.json();
        setTeam(Array.isArray(j.team) ? j.team : []);
      } catch { /* roster is progressive enhancement */ }
    })();
  }, [projectId]);

  const subs = (ctx?.subs || []) as { membershipId?: string; id?: string; companyName: string; trade?: string }[];
  const roster = Array.from(new Set([...team.map(m => m.name), ...subs.map(s => s.companyName)].filter(Boolean)));

  // Prefilled add flow: due a week out, medium priority.
  function openCreate() {
    const due = new Date(Date.now() + 7 * 86400000);
    setForm({ ...EMPTY_FORM, due_date: localIso(due) });
    setAuto({ due: true });
    setShowForm(true);
  }
  function closeForm() { guard.requestClose(() => setShowForm(false)); }

  const q = search.trim().toLowerCase();
  const filtered = todos.filter(t => {
    if (filter === 'active' && t.complete) return false;
    if (filter === 'completed' && !t.complete) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (!q) return true;
    return [t.title, t.description, t.assigned_to].some(v => String(v || '').toLowerCase().includes(q));
  });

  const totalCount = todos.length;
  const activeCount = todos.filter(t => !t.complete).length;
  const completedCount = todos.filter(t => t.complete).length;
  const isOverdue = (t: TodoItem) => !!t.due_date && t.due_date < today && !t.complete;
  const overdueCount = todos.filter(isOverdue).length;

  const weekOut = localIso(new Date(Date.now() + 7 * 86400000));
  const dueThisWeek = todos.filter(t => !t.complete && t.due_date && t.due_date >= today && t.due_date <= weekOut).length;
  const highOpen = todos.filter(t => !t.complete && t.priority === 'high').length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const assigneeLoads = todos.filter(t => !t.complete && t.assigned_to).reduce<Record<string, number>>((m, t) => { m[t.assigned_to] = (m[t.assigned_to] || 0) + 1; return m; }, {});
  const busiest = Object.entries(assigneeLoads).sort((a, b) => b[1] - a[1])[0] || null;
  const nextDue = todos.filter(t => !t.complete && t.due_date && t.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0] || null;

  async function handleAdd(): Promise<boolean> {
    if (!form.title) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          assigned_to: form.assigned_to,
          due_date: form.due_date || null,
          priority: form.priority,
          status: 'open',
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json();
      if (!json.todo) throw new Error('save failed');
      const t = json.todo as TodoItem & { status?: string };
      setTodos(prev => [{ ...t, complete: /complete/i.test(String(t.status || '')) }, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      show('Task added.');
      guard.clearDraft();
      return true;
    } catch {
      show('Could not add the task. Please try again.', 'bad');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(id: string) {
    const todo = todos.find(t => t.id === id);
    if (!todo || todo.complete) return;
    setTodos(prev => prev.map(t => t.id === id ? { ...t, complete: true } : t));
    try {
      const res = await fetch(`/api/todos/${id}/complete`, { method: 'PATCH' });
      if (!res.ok) throw new Error('update failed');
    } catch {
      show('Could not update the task. Please try again.', 'bad');
      fetchTodos();
    }
  }

  const stats: StatItem[] = [
    { label: 'Active', value: loading ? '—' : activeCount, icon: <ListChecks size={15} />, onClick: () => setFilter('active'), active: filter === 'active', sub: busiest ? `Most on ${busiest[0]} (${busiest[1]})` : `${team.length + subs.length} people on the roster` },
    { label: 'Due this week', value: loading ? '—' : dueThisWeek, icon: <CalendarBlank size={15} />, sub: nextDue ? `Next: ${fmtDay(nextDue.due_date)} — ${nextDue.title.slice(0, 24)}` : 'Nothing coming due' },
    { label: 'Overdue', value: loading ? '—' : overdueCount, tone: overdueCount > 0 ? 'bad' : 'good', icon: <WarningCircle size={15} />, sub: overdueCount > 0 ? 'Needs attention today' : 'Nothing slipping' },
    { label: 'High priority open', value: loading ? '—' : highOpen, tone: highOpen > 0 ? 'bad' : 'default', icon: <Fire size={15} />, onClick: () => { setFilter('active'); setPriorityFilter(priorityFilter === 'high' ? 'all' : 'high'); }, active: priorityFilter === 'high', sub: highOpen > 0 ? 'Knock these out first' : 'None open' },
    { label: 'Completion', value: loading ? '—' : `${completionPct}%`, tone: completionPct >= 75 ? 'good' : 'default', icon: <ChartPieSlice size={15} />, onClick: () => setFilter('completed'), active: filter === 'completed', sub: `${completedCount} of ${totalCount} done` },
  ];

  const dueLabel = (t: TodoItem) => {
    if (!t.due_date) return '—';
    if (isOverdue(t)) return `Overdue: ${fmtDay(t.due_date)}`;
    if (t.complete) return fmtDay(t.due_date);
    if (t.due_date === today) return 'Due today';
    const days = Math.max(0, Math.round((new Date(t.due_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000));
    return `${fmtDay(t.due_date)} (${days}d)`;
  };

  const columns: Column<TodoItem>[] = [
    {
      key: 'complete', header: 'Done', width: 56, groupable: false, accessor: (t) => (t.complete ? 1 : 0),
      render: (t) => (
        <button
          type="button"
          role="checkbox"
          aria-checked={t.complete}
          aria-label={t.complete ? `${t.title}: done` : `Mark "${t.title}" done`}
          className="tdCheck"
          onClick={(e) => { e.stopPropagation(); toggleComplete(t.id); }}
        >
          {t.complete && <Check size={15} weight="bold" />}
        </button>
      ),
    },
    {
      key: 'title', header: 'Task', primary: true, accessor: (t) => (t.title || '').toLowerCase(),
      render: (t) => (
        <div className="k-cell-stack">
          <span className={t.complete ? 'tdDone' : undefined}>{t.title}</span>
          {t.description && <div className="tdDesc">{t.description}</div>}
        </div>
      ),
    },
    { key: 'assigned_to', header: 'Assigned to', accessor: (t) => t.assigned_to || '', render: (t) => t.assigned_to || (!t.complete ? <span className="tdUnassigned">Unassigned</span> : '—') },
    { key: 'due_date', header: 'Due', phone: 'show', accessor: (t) => t.due_date || '9999', render: (t) => <span className={isOverdue(t) ? 'tdLate' : 'tdDue'}>{dueLabel(t)}</span> },
    { key: 'priority', header: 'Priority', phone: 'show', accessor: (t) => PRIORITY_RANK[t.priority] ?? 9, render: (t) => <Badge tone={PRIORITY_TONE[t.priority] || 'neutral'} dot>{cap(t.priority)}</Badge> },
  ];

  const rowActions = (t: TodoItem): Action[] => [
    { label: 'Mark done', icon: <CheckCircle size={15} />, onClick: () => toggleComplete(t.id), hidden: t.complete },
  ];

  const openRfis = Number(ctx?.counts?.openRfis) || 0;
  const openPunch = Number(ctx?.counts?.openPunch) || 0;
  const empty = todos.length === 0 ? (
    <EmptyState
      icon={<Clipboard size={22} />}
      title="No tasks yet"
      text={ctx ? `RFIs (${openRfis} open) and punch (${openPunch} open) live in their own modules — to-dos are callbacks, pickups and reminders.` : 'Callbacks, pickups and field reminders, each with an owner and a due date.'}
      action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Add task</Button>}
    />
  ) : filter === 'completed' && completedCount === 0 ? (
    <EmptyState title="Nothing completed yet" text={`${activeCount} task${activeCount === 1 ? ' is' : 's are'} still active.`} />
  ) : filter === 'active' && activeCount === 0 ? (
    <EmptyState title="No active tasks" text="Every task is checked off." action={<Button onClick={() => setFilter('all')}>Show all</Button>} />
  ) : (
    <EmptyState title="Nothing matches" text="Change the search or the filters." action={<Button onClick={() => { setSearch(''); setPriorityFilter('all'); setFilter('all'); }}>Clear filters</Button>} />
  );

  const base = `/app/projects/${projectId}`;
  return (
    <div className="tdWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'To-Dos' },
        ]}
        title="To-Dos"
        subtitle="Project tasks and action items."
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Add task</Button>}
      >
        {(todos.length > 0 || ctx || loading) && <StatRow items={stats} />}

        <Tabs
          tabs={[
            { key: 'all', label: 'All', count: totalCount },
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'completed', label: 'Completed', count: completedCount },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as FilterTab)}
        />

        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search tasks…"
          filters={
            <Select aria-label="Priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ width: 'auto', minWidth: 150 }}
              options={[{ value: 'all', label: 'All priorities' }, ...PRIORITIES.map(p => ({ value: p, label: cap(p) }))]} />
          }
          actions={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>{filtered.length} of {todos.length}</span>}
        />

        <Card flush>
          <DataTable<TodoItem>
            tableId="project-todos"
            bulkEdit={{
              noun: 'task',
              allowed: rights.edit,
              status: {
                options: [{ value: 'complete', label: 'Done' }],
                // The same route as the row's checkbox; a done task is left as it is.
                apply: (t) => t.complete ? Promise.resolve(new Response('{}', { status: 200 })) : jsonRequest(`/api/todos/${t.id}/complete`, 'PATCH'),
              },
              onDone: () => { void fetchTodos(); },
            }}
            exportName="todos"
            columns={columns}
            rows={filtered}
            loading={loading}
            rowKey={(t) => t.id}
            defaultSort={{ key: 'due_date', dir: 'asc' }}
            rowStyle={(t) => (t.complete ? { opacity: 0.55 } : undefined)}
            rowActions={rowActions}
            empty={empty}
          />
        </Card>
      </PageShell>

      <FormModal
        open={showForm}
        onClose={closeForm}
        title="Add task"
        subtitle={`${activeCount} active · ${overdueCount} overdue`}
        onSubmit={async () => { await handleAdd(); }}
        submitLabel="Add task"
        busy={saving}
      >
        <FormGrid cols={3}>
          <Field label="Title" required span>
            <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Task description…" required autoFocus />
          </Field>
          <Field label="Description" span>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
          </Field>
          <Field label="Assigned to" hint={roster.length > 0 ? `${roster.length} on the roster — start typing to match.` : undefined}>
            <Suggest className="k-input" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} options={roster} placeholder="Name or company" />
          </Field>
          <Field label="Due date" hint={auto.due && form.due_date === weekOut ? 'Defaulted a week out.' : undefined}>
            <DateInput value={form.due_date} onChange={e => { const v = e.target.value; setAuto({}); setForm(p => ({ ...p, due_date: v })); }} />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} options={PRIORITIES.map(p => ({ value: p, label: cap(p) }))} />
          </Field>
        </FormGrid>
      </FormModal>

      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
