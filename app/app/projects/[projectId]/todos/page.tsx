'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, T } from '@/components/ui/shell';

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

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 };

const EMPTY_FORM = { title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' };

export default function TodosPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');

  const today = new Date().toISOString().split('T')[0];

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/todos`);
      const json = await res.json();
      setTodos(json.todos || []);
    } catch {
      setTodos([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const filtered = todos.filter(t => {
    if (filter === 'active') return !t.complete;
    if (filter === 'completed') return t.complete;
    return true;
  });

  const totalCount = todos.length;
  const activeCount = todos.filter(t => !t.complete).length;
  const completedCount = todos.filter(t => t.complete).length;
  const overdueCount = todos.filter(t => t.due_date && t.due_date < today && !t.complete).length;

  async function handleAdd() {
    if (!form.title) return;
    setSaving(true);
    const newTodo: TodoItem = {
      id: `td-${Date.now()}`,
      project_id: projectId,
      title: form.title,
      description: form.description,
      assigned_to: form.assigned_to,
      due_date: form.due_date,
      priority: form.priority,
      complete: false,
    };
    try {
      const res = await fetch('/api/todos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...form, complete: false }),
      });
      const json = await res.json();
      setTodos(prev => [json.todo || newTodo, ...prev]);
    } catch {
      setTodos(prev => [newTodo, ...prev]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setToast('Task added.');
    setTimeout(() => setToast(''), 4000);
  }

  async function toggleComplete(id: string) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    try {
      await fetch(`/api/todos/${id}/complete`, { method: 'PATCH' });
    } catch { /* demo */ }
    setTodos(prev => prev.map(t => t.id === id ? { ...t, complete: !t.complete } : t));
  }

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        <SectionHeader
          title="Todos"
          sub="Project tasks and action items"
          action={<Btn onClick={() => setShowForm(p => !p)}>+ Add Task</Btn>}
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="📋" label="Total" value={String(totalCount)} />
          <StatCard icon="🔵" label="Active" value={String(activeCount)} />
          <StatCard icon="✅" label="Completed" value={String(completedCount)} />
          <StatCard icon="🚨" label="Overdue" value={String(overdueCount)} />
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {([['all', 'All'], ['active', 'Active'], ['completed', 'Completed']] as [FilterTab, string][]).map(([key, label]) => (
            <Btn key={key} variant={filter === key ? 'primary' : 'ghost'} size="sm" onClick={() => setFilter(key)}>{label}</Btn>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted, alignSelf: 'center' }}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
            {toast}
          </div>
        )}

        {/* Create Form */}
        {showForm && (
          <Card style={{ marginBottom: 24, borderColor: T.borderGold }}>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Add Task</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={lbl}>Title *</label>
                  <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Task description..." style={inp} />
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
                  <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Priority</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={inp}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Add Task'}</Btn>
                <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Todo List */}
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>No tasks in this category.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filtered.map(todo => {
                  const overdue = todo.due_date && todo.due_date < today && !todo.complete;
                  return (
                    <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${T.border}`, opacity: todo.complete ? 0.5 : 1 }}>
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleComplete(todo.id)}
                        style={{
                          width: 22, height: 22, borderRadius: 6,
                          border: `2px solid ${todo.complete ? T.green : T.border}`,
                          background: todo.complete ? T.green : 'transparent',
                          cursor: 'pointer', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {todo.complete && <span style={{ color: '#000', fontSize: 13, fontWeight: 900 }}>&#10003;</span>}
                      </button>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.white, fontSize: 14, fontWeight: 500, textDecoration: todo.complete ? 'line-through' : 'none' }}>{todo.title}</div>
                        {todo.description && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{todo.description}</div>}
                        <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                          {todo.assigned_to && <span>{todo.assigned_to}</span>}
                        </div>
                      </div>
                      {/* Due date */}
                      <span style={{ fontSize: 12, color: overdue ? T.red : T.muted, whiteSpace: 'nowrap' }}>
                        {todo.due_date ? (overdue ? 'Overdue: ' : '') + todo.due_date : '---'}
                      </span>
                      {/* Priority */}
                      <Badge label={todo.priority} color={PRIORITY_BADGE[todo.priority] || 'muted'} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
