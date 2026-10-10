'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useParams } from 'next/navigation';
import { T, Badge } from '@/components/ui/shell';
import {
  PremiumSurface,
  ModuleHero,
  StatCard,
  SectionCard,
  PremiumEmpty,
  StatStrip,
  FlowSteps,
  InsightRow,
  AutoChip,
  goldButtonStyle,
  ghostButtonStyle,
} from '@/components/ui/premium';
import { Clipboard, Circle, CheckCircle, Warning, Check, Plus, ClockCounterClockwise } from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
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

const PRIORITY_BADGE: Record<string, 'red' | 'amber' | 'muted'> = { high: 'red', medium: 'amber', low: 'muted' };
const PRIORITIES = ['high', 'medium', 'low'];

// Desert-dusk accents (match dashboard) ---------------------------------------
const GOLD = 'var(--brand-primary)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 6 };
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--c-text-2)', marginTop: 5, lineHeight: 1.45 };

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface TeamMember { id: string; name: string; email: string; role: string; }



const EMPTY_FORM = { title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' };

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
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  // ListToolbar state — search + priority join the existing status state (sag_flt_todos).
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

  // Project intelligence — roster for the assignee select + cross-module counts.
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

  // Prefilled add flow: due a week out, medium priority.
  function openCreate() {
    const due = new Date(Date.now() + 7 * 86400000);
    setForm({ ...EMPTY_FORM, due_date: localIso(due) });
    setAuto({ due: true });
    setShowForm(true);
  }

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
  const overdueCount = todos.filter(t => t.due_date && t.due_date < today && !t.complete).length;

  const weekOut = localIso(new Date(Date.now() + 7 * 86400000));
  const dueThisWeek = todos.filter(t => !t.complete && t.due_date && t.due_date >= today && t.due_date <= weekOut).length;
  const unassigned = todos.filter(t => !t.complete && !t.assigned_to).length;
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
      setToast('Task added.');
      setTimeout(() => setToast(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setToast('Could not add the task. Please try again.');
      setTimeout(() => setToast(''), 4000);
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
      setToast('Could not update the task. Please try again.');
      setTimeout(() => setToast(''), 4000);
      fetchTodos();
    }
  }

  return (
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Tasks'}
        eyebrowIcon={<Clipboard size={13} weight="fill" style={{ color: GOLD }} />}
        title="Project"
        accent="To-Dos"
        subtitle="Project tasks and action items."
        actions={
          <button onClick={() => { if (showForm) { setShowForm(false); } else { openCreate(); } }} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> Add Task
          </button>
        }
      />

      {/* Task intelligence strip — where the work stands right now */}
      {!loading && (todos.length > 0 || ctx) && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/todos`,  label: 'Due This Week', value: String(dueThisWeek), accent: dueThisWeek > 0 ? GOLD : undefined, sub: nextDue ? `Next: ${nextDue.due_date} — ${nextDue.title.slice(0, 24)}` : 'Nothing coming due' },
          {href: `/app/projects/${projectId}/todos`,  label: 'Overdue', value: String(overdueCount), accent: overdueCount > 0 ? RED : GREEN, sub: overdueCount > 0 ? 'Needs attention today' : 'Nothing slipping' },
          {href: `/app/projects/${projectId}/todos`,  label: 'High Priority Open', value: String(highOpen), accent: highOpen > 0 ? RED : undefined, sub: highOpen > 0 ? 'Knock these out first' : 'No fires burning' },
          {href: `/app/projects/${projectId}/todos`,  label: 'Unassigned', value: String(unassigned), accent: unassigned > 0 ? GOLD : undefined, sub: unassigned > 0 ? 'No owner yet — assign below' : 'Every task has an owner' },
          {href: `/app/projects/${projectId}/todos`,  label: 'Completion', value: `${completionPct}%`, accent: completionPct >= 75 ? GREEN : undefined, sub: `${completedCount} of ${totalCount} done` },
          {href: `/app/projects/${projectId}/todos`,  label: 'Busiest Assignee', value: busiest ? busiest[0] : '—', sub: busiest ? `${busiest[1]} open task${busiest[1] === 1 ? '' : 's'}` : `${team.length + subs.length} people on the roster` },
        ]} />
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard icon={<Clipboard size={19} weight="duotone" style={{ color: GOLD }} />} label="Total" value={String(totalCount)} sub="All tasks" delay={0.02}  href={`/app/projects/${projectId}/todos`}/>
        <StatCard icon={<Circle size={19} weight="duotone" style={{ color: GOLD }} />} label="Active" value={String(activeCount)} sub="In progress" accent={activeCount > 0 ? GOLD : undefined} delay={0.06}  href={`/app/projects/${projectId}/todos`}/>
        <StatCard icon={<CheckCircle size={19} weight="duotone" style={{ color: GREEN }} />} label="Completed" value={String(completedCount)} sub="Done" accent={completedCount > 0 ? GREEN : undefined} delay={0.10}  href={`/app/projects/${projectId}/todos`}/>
        <StatCard icon={<Warning size={19} weight="duotone" style={{ color: RED }} />} label="Overdue" value={String(overdueCount)} sub="Past due" accent={overdueCount > 0 ? RED : undefined} delay={0.14}  href={`/app/projects/${projectId}/todos`}/>
      </div>

      {/* List toolbar — search + status/priority filters (replaces the old tab pills) */}
      <ListToolbar
        module="todos"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search tasks…"
        filters={[
          { key: 'status', label: 'Status', value: filter, onChange: (v: string) => setFilter(v as FilterTab), allLabel: 'All Tasks', options: [
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
          ] },
          { key: 'priority', label: 'Priority', value: priorityFilter, onChange: setPriorityFilter, allLabel: 'All Priorities', options: PRIORITIES.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) })) },
        ]}
        count={{ shown: filtered.length, total: todos.length }}
        style={{ marginBottom: 20 }}
      />

      {toast && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(44,255,122,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Add Task" icon={<Plus size={16} weight="bold" style={{ color: GOLD }} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Task description…" style={inp} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
              <div>
                <label style={lbl}>Assigned To</label>
                <input type="text" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Due Date</label>
                <SaguaroDatePicker value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Priority</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={inp}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleAdd} disabled={saving} className="pmBtn" style={{ ...goldButtonStyle, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Add Task'}</button>
              <button onClick={() => setShowForm(false)} className="pmBtn" style={ghostButtonStyle}>Cancel</button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Todo List */}
      <SectionCard title="Task List" icon={<Clipboard size={16} weight="duotone" style={{ color: GOLD }} />} flush>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-2)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <PremiumEmpty
            icon={<Clipboard size={30} weight="duotone" style={{ color: GOLD }} />}
            title={todos.length === 0 ? 'No Tasks Yet' : filter === 'completed' ? 'Nothing Completed Yet' : filter === 'active' ? 'No Active Tasks' : 'No Tasks Here'}
            description={todos.length === 0
              ? (ctx
                ? `The project already tracks ${Number(ctx?.counts?.openRfis) || 0} open RFI${(Number(ctx?.counts?.openRfis) || 0) === 1 ? '' : 's'} and ${Number(ctx?.counts?.openPunch) || 0} open punch item${(Number(ctx?.counts?.openPunch) || 0) === 1 ? '' : 's'} in their own modules — to-dos capture everything smaller: callbacks, pickups, and field reminders, each with an owner and a due date.`
                : 'To-dos capture the small field actions with an owner and a due date — callbacks, pickups, reminders. The first one takes ten seconds.')
              : filter === 'completed'
                ? `${activeCount} task${activeCount === 1 ? ' is' : 's are'} still active — completed ones land here as they are checked off.`
                : 'Every task is checked off — switch to All or Completed to see the history.'}
            action={<button onClick={openCreate} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Task</button>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map(todo => {
              const overdue = todo.due_date && todo.due_date < today && !todo.complete;
              return (
                <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: `1px solid rgba(255,255,255,0.06)`, opacity: todo.complete ? 0.5 : 1 }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleComplete(todo.id)}
                    style={{
                      width: 22, height: 22, borderRadius: 6,
                      border: `2px solid ${todo.complete ? GREEN : T.border}`,
                      background: todo.complete ? GREEN : 'transparent',
                      cursor: 'pointer', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {todo.complete && <Check size={14} weight="bold" color="var(--bg-base)" />}
                  </button>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.white, fontSize: 14, fontWeight: 500, textDecoration: todo.complete ? 'line-through' : 'none' }}>{todo.title}</div>
                    {todo.description && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{todo.description}</div>}
                    <div style={{ fontSize: 12, color: todo.assigned_to ? T.muted : 'color-mix(in srgb, var(--brand-primary) 75%, transparent)', marginTop: 2 }}>
                      {todo.assigned_to || (!todo.complete ? 'Unassigned' : '')}
                    </div>
                  </div>
                  {/* Due date */}
                  <span style={{ fontSize: 12, color: overdue ? RED : T.muted, whiteSpace: 'nowrap', fontWeight: overdue ? 700 : 400 }}>
                    {todo.due_date
                      ? overdue
                        ? `Overdue: ${todo.due_date}`
                        : todo.complete
                          ? todo.due_date
                          : todo.due_date === today
                            ? 'Due today'
                            : `${todo.due_date} (${Math.max(0, Math.round((new Date(todo.due_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000))}d)`
                      : '—'}
                  </span>
                  {/* Priority */}
                  <Badge label={todo.priority ? todo.priority.charAt(0).toUpperCase() + todo.priority.slice(1) : '—'} color={PRIORITY_BADGE[todo.priority] || 'muted'} />
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
