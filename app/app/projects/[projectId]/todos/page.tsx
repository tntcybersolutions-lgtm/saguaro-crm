'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface TodoItem {
  id: string;
  task: string;
  assigned_to: string;
  due_date: string;
  priority: string;
  category: string;
  status: string;
  complete: boolean;
  project_id: string;
}

const PRIORITIES = ['High','Medium','Low'];
const CATEGORIES = ['Administrative','Field','Design','Financial','Compliance'];
const PRIORITY_COLORS: Record<string, string> = { High: RED, Medium: GOLD, Low: DIM };

const EMPTY_FORM = { task: '', assigned_to: '', due_date: '', priority: 'Medium', category: 'Administrative' };
const FILTER_TABS = ['All','Open','Due Today','Overdue','Complete'] as const;

export default function TodosPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<typeof FILTER_TABS[number]>('All');

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
    if (activeTab === 'All') return true;
    if (activeTab === 'Open') return !t.complete;
    if (activeTab === 'Complete') return t.complete;
    if (activeTab === 'Due Today') return t.due_date === today && !t.complete;
    if (activeTab === 'Overdue') return t.due_date < today && !t.complete;
    return true;
  });

  async function handleAdd() {
    if (!form.task) { setErrorMsg('Task description is required.'); return; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/todos/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, status: 'Open', complete: false, ...form }) });
      const json = await res.json();
      setTodos(prev => [json.todo || { id: `td-${Date.now()}`, project_id: projectId, status: 'Open', complete: false, ...form }, ...prev]);
    } catch {
      setTodos(prev => [{ id: `td-${Date.now()}`, project_id: projectId, status: 'Open', complete: false, ...form }, ...prev]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Task added.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleComplete(id: string) {
    try {
      await fetch(`/api/todos/${id}/complete`, { method: 'PATCH' });
    } catch { /* demo */ }
    setTodos(prev => prev.map(t => t.id === id ? { ...t, complete: !t.complete, status: !t.complete ? 'Complete' : 'Open' } : t));
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  const openCount = todos.filter(t => !t.complete).length;
  const overdueCount = todos.filter(t => t.due_date < today && !t.complete).length;
  const dueToday = todos.filter(t => t.due_date === today && !t.complete).length;

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Todos</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Project tasks and action items</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add Task</button>
      </div>

      {/* Quick stats */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Open', value: openCount, color: TEXT },
          { label: 'Due Today', value: dueToday, color: GOLD },
          { label: 'Overdue', value: overdueCount, color: overdueCount > 0 ? RED : GREEN },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, borderRadius: 8, padding: '10px 18px', border: '1px solid ' + BORDER }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: DIM }}>{k.label}</div>
          </div>
        ))}
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Task</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Task *</label><input type="text" value={form.task} onChange={e => setForm(p => ({ ...p, task: e.target.value }))} placeholder="Describe the task..." style={inp} /></div>
            <div><label style={label}>Assign To</label><input type="text" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Due Date</label><SaguaroDatePicker value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} style={inp} /></div>
            <div><label style={label}>Priority</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={inp}>
                {PRIORITIES.map(pr => <option key={pr}>{pr}</option>)}
              </select>
            </div>
            <div><label style={label}>Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inp}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleAdd} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Add Task'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 6, borderBottom: '1px solid ' + BORDER }}>
        {FILTER_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 16px', background: activeTab === tab ? GOLD : 'transparent', border: 'none', borderBottom: activeTab === tab ? `2px solid ${GOLD}` : '2px solid transparent', color: activeTab === tab ? DARK : DIM, fontSize: 13, fontWeight: activeTab === tab ? 700 : 400, cursor: 'pointer' }}>
            {tab}
            {tab === 'Overdue' && overdueCount > 0 && <span style={{ marginLeft: 6, background: RED, color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{overdueCount}</span>}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: DIM, alignSelf: 'center', paddingRight: 4 }}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ padding: '8px 24px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>No tasks in this category.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filtered.map(todo => {
              const overdue = todo.due_date < today && !todo.complete;
              return (
                <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid rgba(38,51,71,.4)', opacity: todo.complete ? 0.5 : 1 }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => handleComplete(todo.id)}
                    style={{ width: 22, height: 22, borderRadius: 5, border: '2px solid ' + (todo.complete ? GREEN : BORDER), background: todo.complete ? GREEN : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {todo.complete && <span style={{ color: DARK, fontSize: 13, fontWeight: 900 }}>✓</span>}
                  </button>
                  {/* Task */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: TEXT, fontSize: 14, fontWeight: 500, textDecoration: todo.complete ? 'line-through' : 'none' }}>{todo.task}</div>
                    <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                      <span style={{ color: CATEGORIES.includes(todo.category) ? DIM : DIM }}>{todo.category}</span>
                      {todo.assigned_to && <span> · {todo.assigned_to}</span>}
                    </div>
                  </div>
                  {/* Due date */}
                  <div style={{ fontSize: 12, color: overdue ? RED : todo.due_date === today ? GOLD : DIM, whiteSpace: 'nowrap' }}>
                    {todo.due_date ? (overdue ? 'Overdue: ' : '') + todo.due_date : '—'}
                  </div>
                  {/* Priority badge */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLORS[todo.priority] || DIM, width: 50, textAlign: 'right' }}>{todo.priority}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
