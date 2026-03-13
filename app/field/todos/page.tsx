'use client';
/**
 * Saguaro Field — Action Items / Todo List
 * Full-featured task management for construction projects.
 * Kanban tabs, priority reorder, batch ops, offline queue.
 */
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
const STATUSES   = ['open', 'in_progress', 'completed', 'cancelled'] as const;
const CATEGORIES = ['general', 'safety', 'quality', 'design', 'procurement', 'scheduling', 'closeout'] as const;

const PRIORITY_LABELS: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const PRIORITY_COLORS: Record<string, string> = { critical: RED, high: AMBER, medium: BLUE, low: DIM };
const STATUS_LABELS: Record<string, string>   = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_COLORS: Record<string, string>   = { open: RED, in_progress: AMBER, completed: GREEN, cancelled: DIM };
const CATEGORY_LABELS: Record<string, string> = { general: 'General', safety: 'Safety', quality: 'Quality', design: 'Design', procurement: 'Procurement', scheduling: 'Scheduling', closeout: 'Closeout' };

type TabKey = 'open' | 'in_progress' | 'completed';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

interface TodoItem {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  due_date: string;
  priority: string;
  status: string;
  category: string;
  completed_at: string | null;
  completed_by: string | null;
  linked_module: string | null;
  linked_id: string | null;
  notes: string;
  created_at: string;
}

type SortField = 'due_date' | 'priority' | 'created_at' | 'status';
type ViewMode = 'list' | 'category';

/* ─── Helpers ─── */
function daysUntil(dateStr: string): number {
  if (!dateStr) return Infinity;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / 86400000);
}

function countdownLabel(dateStr: string): string {
  if (!dateStr) return '';
  const d = daysUntil(dateStr);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `${d}d left`;
}

function countdownColor(dateStr: string): string {
  const d = daysUntil(dateStr);
  if (d < 0) return RED;
  if (d <= 2) return AMBER;
  return DIM;
}

function isOverdue(item: TodoItem): boolean {
  return !!item.due_date && daysUntil(item.due_date) < 0 && item.status !== 'completed' && item.status !== 'cancelled';
}

function isCompletedToday(item: TodoItem): boolean {
  if (!item.completed_at) return false;
  const today = new Date().toISOString().slice(0, 10);
  return item.completed_at.slice(0, 10) === today;
}

const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function apiCall(url: string, method: string, body?: object) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function offlineFetch(url: string, method: string, body?: object) {
  try {
    const res = await apiCall(url, method, body);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    await enqueue({ url, method, body: body ? JSON.stringify(body) : null, contentType: 'application/json', isFormData: false });
    return null;
  }
}

/* ─── Confirm Dialog ─── */
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)' }}>
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, maxWidth: 340, width: '90%' }}>
        <p style={{ margin: '0 0 20px', fontSize: 15, color: TEXT, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, background: RED, border: 'none', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Summary Stats Bar ─── */
function StatsBar({ todos }: { todos: TodoItem[] }) {
  const total = todos.length;
  const open = todos.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const overdue = todos.filter(t => isOverdue(t)).length;
  const doneToday = todos.filter(t => isCompletedToday(t)).length;
  const stats = [
    { label: 'Total', value: total, color: GOLD },
    { label: 'Open', value: open, color: BLUE },
    { label: 'Overdue', value: overdue, color: RED },
    { label: 'Done Today', value: doneToday, color: GREEN },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Quick Add Bar ─── */
function QuickAddBar({ onAdd }: { onAdd: (title: string, dueDate: string) => void }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), dueDate);
    setTitle(''); setDueDate('');
  };
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
      <input
        value={title} onChange={e => setTitle(e.target.value)} placeholder="Quick add item..."
        onKeyDown={e => e.key === 'Enter' && submit()}
        style={{ flex: 1, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 14, outline: 'none' }}
      />
      <input
        type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
        style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 10px', color: TEXT, fontSize: 13, outline: 'none', minWidth: 130 }}
      />
      <button onClick={submit} style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '12px 18px', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
    </div>
  );
}

/* ─── Filter / Sort Panel ─── */
function FilterPanel({
  filterPriority, setFilterPriority, filterCategory, setFilterCategory,
  filterAssignee, setFilterAssignee, filterOverdue, setFilterOverdue,
  sortField, setSortField, viewMode, setViewMode, assignees
}: {
  filterPriority: string; setFilterPriority: (v: string) => void;
  filterCategory: string; setFilterCategory: (v: string) => void;
  filterAssignee: string; setFilterAssignee: (v: string) => void;
  filterOverdue: boolean; setFilterOverdue: (v: boolean) => void;
  sortField: SortField; setSortField: (v: SortField) => void;
  viewMode: ViewMode; setViewMode: (v: ViewMode) => void;
  assignees: string[];
}) {
  const selStyle: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', color: TEXT, fontSize: 13, outline: 'none', flex: 1, minWidth: 0 };
  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={selStyle}>
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selStyle}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={selStyle}>
          <option value="">All Assignees</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: DIM, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={filterOverdue} onChange={e => setFilterOverdue(e.target.checked)} style={{ accentColor: RED }} />
          Overdue Only
        </label>
        <div style={{ flex: 1 }} />
        <select value={sortField} onChange={e => setSortField(e.target.value as SortField)} style={{ ...selStyle, flex: 'none', width: 140 }}>
          <option value="due_date">Sort: Due Date</option>
          <option value="priority">Sort: Priority</option>
          <option value="created_at">Sort: Created</option>
          <option value="status">Sort: Status</option>
        </select>
        <button
          onClick={() => setViewMode(viewMode === 'list' ? 'category' : 'list')}
          style={{ background: viewMode === 'category' ? GOLD : 'transparent', border: `1px solid ${viewMode === 'category' ? GOLD : BORDER}`, borderRadius: 8, padding: '8px 12px', color: viewMode === 'category' ? '#000' : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {viewMode === 'category' ? 'Category View' : 'List View'}
        </button>
      </div>
    </div>
  );
}

/* ─── Todo Card ─── */
function TodoCard({
  item, selected, onToggleSelect, onComplete, onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast
}: {
  item: TodoItem; selected: boolean;
  onToggleSelect: () => void; onComplete: () => void;
  onEdit: () => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
  isFirst: boolean; isLast: boolean;
}) {
  const overdue = isOverdue(item);
  const done = item.status === 'completed';
  return (
    <div style={{
      background: RAISED,
      border: `1px solid ${overdue ? RED : BORDER}`,
      borderLeft: `4px solid ${PRIORITY_COLORS[item.priority] || DIM}`,
      borderRadius: 12, padding: '14px 14px 12px', marginBottom: 8,
      opacity: done ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Select checkbox */}
        <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ marginTop: 3, accentColor: GOLD, cursor: 'pointer' }} />
        {/* Complete checkbox */}
        <div
          onClick={onComplete}
          style={{
            width: 22, height: 22, borderRadius: 6, marginTop: 1, cursor: 'pointer', flexShrink: 0,
            border: `2px solid ${done ? GREEN : BORDER}`,
            background: done ? GREEN : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {done && <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>&#10003;</span>}
        </div>
        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: TEXT, textDecoration: done ? 'line-through' : 'none' }}>{item.title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: PRIORITY_COLORS[item.priority] + '22', color: PRIORITY_COLORS[item.priority] }}>
              {PRIORITY_LABELS[item.priority] || item.priority}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: STATUS_COLORS[item.status] + '22', color: STATUS_COLORS[item.status] }}>
              {STATUS_LABELS[item.status] || item.status}
            </span>
          </div>
          {item.description && <div style={{ fontSize: 13, color: DIM, marginTop: 4, lineHeight: 1.4 }}>{item.description}</div>}
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {item.category && <span style={{ fontSize: 11, color: DIM }}>{CATEGORY_LABELS[item.category] || item.category}</span>}
            {item.assigned_to && <span style={{ fontSize: 11, color: BLUE }}>{item.assigned_to}</span>}
            {item.due_date && (
              <span style={{ fontSize: 11, color: countdownColor(item.due_date), fontWeight: overdue ? 700 : 400 }}>
                {item.due_date} &middot; {countdownLabel(item.due_date)}
              </span>
            )}
          </div>
          {item.notes && <div style={{ fontSize: 12, color: DIM, marginTop: 6, fontStyle: 'italic' }}>{item.notes}</div>}
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!isFirst && <button onClick={onMoveUp} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 6px', color: DIM, fontSize: 12, cursor: 'pointer' }} title="Move up">&uarr;</button>}
          {!isLast && <button onClick={onMoveDown} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 6px', color: DIM, fontSize: 12, cursor: 'pointer' }} title="Move down">&darr;</button>}
          <button onClick={onEdit} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 6px', color: GOLD, fontSize: 12, cursor: 'pointer' }} title="Edit">&#9998;</button>
          <button onClick={onDelete} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 6px', color: RED, fontSize: 12, cursor: 'pointer' }} title="Delete">&times;</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Create / Edit Form ─── */
function TodoForm({ initial, onSave, onCancel }: { initial?: TodoItem | null; onSave: (data: Partial<TodoItem>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to || '');
  const [dueDate, setDueDate] = useState(initial?.due_date || '');
  const [priority, setPriority] = useState(initial?.priority || 'medium');
  const [status, setStatus] = useState(initial?.status || 'open');
  const [category, setCategory] = useState(initial?.category || 'general');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [linkedModule, setLinkedModule] = useState(initial?.linked_module || '');
  const [linkedId, setLinkedId] = useState(initial?.linked_id || '');

  const inputStyle: React.CSSProperties = { width: '100%', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block', fontWeight: 600 };

  const submit = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description, assigned_to: assignedTo, due_date: dueDate, priority, status, category, notes, linked_module: linkedModule || null, linked_id: linkedId || null });
  };

  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, marginBottom: 16 }}>{initial ? 'Edit Action Item' : 'New Action Item'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="Action item title..." />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Details..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Assigned To</label>
            <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={inputStyle} placeholder="Name..." />
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Linked Module</label>
            <input value={linkedModule} onChange={e => setLinkedModule(e.target.value)} style={inputStyle} placeholder="e.g. rfi, submittal..." />
          </div>
          <div>
            <label style={labelStyle}>Linked ID</label>
            <input value={linkedId} onChange={e => setLinkedId(e.target.value)} style={inputStyle} placeholder="ID reference..." />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Additional notes..." />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} style={{ flex: 1, background: GOLD, border: 'none', borderRadius: 10, padding: 14, color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{initial ? 'Save Changes' : 'Create Item'}</button>
      </div>
    </div>
  );
}

/* ─── Main Inner Component ─── */
function TodosPageInner() {
  const params = useSearchParams();
  const projectId = params.get('projectId') || '';
  const apiBase = `/api/projects/${projectId}/todos`;

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<TodoItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{ message: string; action: () => void } | null>(null);

  // Filters
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  /* Fetch */
  const fetchTodos = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(apiBase);
      if (res.ok) {
        const data = await res.json();
        setTodos(Array.isArray(data) ? data : data.data || []);
      }
    } catch { /* offline */ }
    setLoading(false);
  };

  useEffect(() => { fetchTodos(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Derived assignees */
  const assignees = useMemo(() => {
    const s = new Set<string>();
    todos.forEach(t => { if (t.assigned_to) s.add(t.assigned_to); });
    return Array.from(s).sort();
  }, [todos]);

  /* Filtered + sorted list */
  const processed = useMemo(() => {
    let list = [...todos];
    // Tab filter
    if (activeTab === 'open') list = list.filter(t => t.status === 'open');
    else if (activeTab === 'in_progress') list = list.filter(t => t.status === 'in_progress');
    else if (activeTab === 'completed') list = list.filter(t => t.status === 'completed' || t.status === 'cancelled');
    // Additional filters
    if (filterPriority) list = list.filter(t => t.priority === filterPriority);
    if (filterCategory) list = list.filter(t => t.category === filterCategory);
    if (filterAssignee) list = list.filter(t => t.assigned_to === filterAssignee);
    if (filterOverdue) list = list.filter(t => isOverdue(t));
    // Sort
    list.sort((a, b) => {
      if (sortField === 'due_date') {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      if (sortField === 'priority') return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      if (sortField === 'created_at') return (b.created_at || '').localeCompare(a.created_at || '');
      if (sortField === 'status') return (a.status || '').localeCompare(b.status || '');
      return 0;
    });
    // Overdue items float to top (for open/in_progress tabs)
    if (activeTab !== 'completed') {
      const overdue = list.filter(t => isOverdue(t));
      const rest = list.filter(t => !isOverdue(t));
      list = [...overdue, ...rest];
    }
    return list;
  }, [todos, activeTab, filterPriority, filterCategory, filterAssignee, filterOverdue, sortField]);

  /* Grouped by category */
  const grouped = useMemo(() => {
    const map: Record<string, TodoItem[]> = {};
    processed.forEach(t => {
      const cat = t.category || 'general';
      if (!map[cat]) map[cat] = [];
      map[cat].push(t);
    });
    return map;
  }, [processed]);

  /* Quick add */
  const quickAdd = async (title: string, dueDate: string) => {
    const body = { title, description: '', assigned_to: '', due_date: dueDate, priority: 'medium', status: 'open', category: 'general', notes: '', linked_module: null, linked_id: null };
    const result = await offlineFetch(apiBase, 'POST', body);
    if (result) {
      setTodos(prev => [result, ...prev]);
    } else {
      const optimistic: TodoItem = { ...body, id: `temp-${Date.now()}`, completed_at: null, completed_by: null, created_at: new Date().toISOString() };
      setTodos(prev => [optimistic, ...prev]);
    }
  };

  /* Create */
  const createTodo = async (data: Partial<TodoItem>) => {
    const result = await offlineFetch(apiBase, 'POST', data);
    if (result) {
      setTodos(prev => [result, ...prev]);
    } else {
      const optimistic: TodoItem = { ...(data as TodoItem), id: `temp-${Date.now()}`, completed_at: null, completed_by: null, created_at: new Date().toISOString() };
      setTodos(prev => [optimistic, ...prev]);
    }
    setShowForm(false);
  };

  /* Update */
  const updateTodo = async (id: string, data: Partial<TodoItem>) => {
    const result = await offlineFetch(`${apiBase}/${id}`, 'PATCH', data);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...data, ...(result || {}) } : t));
    setEditItem(null);
  };

  /* Delete */
  const deleteTodo = async (id: string) => {
    await offlineFetch(`${apiBase}/${id}`, 'DELETE');
    setTodos(prev => prev.filter(t => t.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  /* Toggle complete */
  const toggleComplete = (item: TodoItem) => {
    if (item.status === 'completed') {
      updateTodo(item.id, { status: 'open', completed_at: null, completed_by: null });
    } else {
      updateTodo(item.id, { status: 'completed', completed_at: new Date().toISOString(), completed_by: 'current_user' });
    }
  };

  /* Batch complete */
  const batchComplete = () => {
    setConfirmAction({
      message: `Mark ${selectedIds.size} item(s) as completed?`,
      action: () => {
        selectedIds.forEach(id => {
          const t = todos.find(x => x.id === id);
          if (t && t.status !== 'completed') updateTodo(id, { status: 'completed', completed_at: new Date().toISOString(), completed_by: 'current_user' });
        });
        setSelectedIds(new Set());
        setConfirmAction(null);
      },
    });
  };

  /* Batch delete */
  const batchDelete = () => {
    setConfirmAction({
      message: `Delete ${selectedIds.size} item(s)? This cannot be undone.`,
      action: () => {
        selectedIds.forEach(id => deleteTodo(id));
        setSelectedIds(new Set());
        setConfirmAction(null);
      },
    });
  };

  /* Move up/down for priority reorder */
  const moveItem = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= processed.length) return;
    const itemA = processed[idx];
    const itemB = processed[newIdx];
    // Swap priorities
    updateTodo(itemA.id, { priority: itemB.priority });
    updateTodo(itemB.id, { priority: itemA.priority });
  };

  /* Toggle selection */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  /* Select all visible */
  const selectAllVisible = () => {
    if (selectedIds.size === processed.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processed.map(t => t.id)));
    }
  };

  /* Confirm delete single */
  const confirmDelete = (item: TodoItem) => {
    setConfirmAction({
      message: `Delete "${item.title}"? This cannot be undone.`,
      action: () => { deleteTodo(item.id); setConfirmAction(null); },
    });
  };

  /* Tab counts */
  const tabCounts = useMemo(() => ({
    open: todos.filter(t => t.status === 'open').length,
    in_progress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed' || t.status === 'cancelled').length,
  }), [todos]);

  if (!projectId) {
    return (
      <div style={{ padding: 24, color: DIM, textAlign: 'center', marginTop: 60 }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Project Selected</div>
        <div style={{ fontSize: 14 }}>Please select a project to view action items.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', padding: '16px 16px 100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>Action Items</div>
          <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Track and manage project tasks</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowFilters(v => !v)}
            style={{ background: showFilters ? GOLD : 'transparent', border: `1px solid ${showFilters ? GOLD : BORDER}`, borderRadius: 10, padding: '10px 14px', color: showFilters ? '#000' : DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Filters
          </button>
          <button
            onClick={() => { setShowForm(true); setEditItem(null); }}
            style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '10px 18px', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            + New
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <StatsBar todos={todos} />

      {/* Quick Add */}
      <QuickAddBar onAdd={quickAdd} />

      {/* Kanban Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: RAISED, borderRadius: 12, padding: 4 }}>
        {TABS.map(tab => (
          <button
            key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '12px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: activeTab === tab.key ? GOLD : 'transparent',
              color: activeTab === tab.key ? '#000' : DIM,
              fontWeight: activeTab === tab.key ? 700 : 500, fontSize: 13,
              transition: 'all .15s',
            }}
          >
            {tab.label} ({tabCounts[tab.key]})
          </button>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <FilterPanel
          filterPriority={filterPriority} setFilterPriority={setFilterPriority}
          filterCategory={filterCategory} setFilterCategory={setFilterCategory}
          filterAssignee={filterAssignee} setFilterAssignee={setFilterAssignee}
          filterOverdue={filterOverdue} setFilterOverdue={setFilterOverdue}
          sortField={sortField} setSortField={setSortField}
          viewMode={viewMode} setViewMode={setViewMode}
          assignees={assignees}
        />
      )}

      {/* Create / Edit Form */}
      {showForm && !editItem && <TodoForm onSave={createTodo} onCancel={() => setShowForm(false)} />}
      {editItem && <TodoForm initial={editItem} onSave={data => updateTodo(editItem.id, data)} onCancel={() => setEditItem(null)} />}

      {/* Batch actions */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px' }}>
          <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <div style={{ flex: 1 }} />
          <button onClick={batchComplete} style={{ background: GREEN, border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Complete All</button>
          <button onClick={batchDelete} style={{ background: RED, border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Delete All</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', color: DIM, fontSize: 12, cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      {/* Select all bar */}
      {processed.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 4 }}>
          <input type="checkbox" checked={selectedIds.size === processed.length && processed.length > 0} onChange={selectAllVisible} style={{ accentColor: GOLD, cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: DIM }}>Select all ({processed.length})</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
          <div style={{ fontSize: 14 }}>Loading action items...</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && processed.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>&#9744;</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 4 }}>No items found</div>
          <div style={{ fontSize: 13 }}>
            {filterPriority || filterCategory || filterAssignee || filterOverdue
              ? 'Try adjusting your filters.'
              : 'Create your first action item above.'}
          </div>
        </div>
      )}

      {/* Todo list — category grouped or flat */}
      {!loading && viewMode === 'category' && Object.keys(grouped).length > 0 && (
        <>
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                {CATEGORY_LABELS[cat] || cat} ({items.length})
              </div>
              {items.map((item, idx) => (
                <TodoCard
                  key={item.id} item={item}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onComplete={() => toggleComplete(item)}
                  onEdit={() => { setEditItem(item); setShowForm(false); }}
                  onDelete={() => confirmDelete(item)}
                  onMoveUp={() => moveItem(processed.indexOf(item), -1)}
                  onMoveDown={() => moveItem(processed.indexOf(item), 1)}
                  isFirst={idx === 0} isLast={idx === items.length - 1}
                />
              ))}
            </div>
          ))}
        </>
      )}

      {!loading && viewMode === 'list' && processed.map((item, idx) => (
        <TodoCard
          key={item.id} item={item}
          selected={selectedIds.has(item.id)}
          onToggleSelect={() => toggleSelect(item.id)}
          onComplete={() => toggleComplete(item)}
          onEdit={() => { setEditItem(item); setShowForm(false); }}
          onDelete={() => confirmDelete(item)}
          onMoveUp={() => moveItem(idx, -1)}
          onMoveDown={() => moveItem(idx, 1)}
          isFirst={idx === 0} isLast={idx === processed.length - 1}
        />
      ))}

      {/* Confirm dialog */}
      {confirmAction && <ConfirmDialog message={confirmAction.message} onConfirm={confirmAction.action} onCancel={() => setConfirmAction(null)} />}
    </div>
  );
}

/* ─── Default export with Suspense wrapper ─── */
export default function TodosPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8BAAC8' }}>Loading...</div>}>
      <TodosPageInner />
    </Suspense>
  );
}
