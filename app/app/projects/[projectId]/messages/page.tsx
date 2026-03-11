'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c';

interface Message {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  priority: string;
  read: boolean;
  project_id: string;
}

const DEMO_MESSAGES: Message[] = [
  { id: 'm-1', from: 'Chad D.', to: 'All Subs', subject: 'Kickoff meeting Monday 8am', body: 'Team — kickoff meeting at the site Monday at 8am sharp. Please confirm attendance.', date: '2026-01-08', priority: 'Normal', read: true, project_id: '' },
  { id: 'm-2', from: 'Desert Electric', to: 'Chad D.', subject: 'RFI: Panel location change', body: 'Please advise on revised panel location per updated architectural drawings Rev 3.', date: '2026-02-12', priority: 'High', read: false, project_id: '' },
  { id: 'm-3', from: 'Chad D.', to: 'AZ Plumbing', subject: 'Approval: Rev plumbing layout', body: 'Approved to proceed per revised plumbing layout submitted 2/10.', date: '2026-02-14', priority: 'Normal', read: true, project_id: '' },
  { id: 'm-4', from: 'Owner Rep', to: 'Chad D.', subject: 'Site visit request — next Thursday', body: 'We would like to schedule a site walk for Thursday afternoon. Please confirm availability.', date: '2026-03-05', priority: 'Normal', read: false, project_id: '' },
];

const EMPTY_FORM = { to: '', subject: '', body: '', priority: 'Normal' };

export default function MessagesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`);
      const json = await res.json();
      setMessages(json.messages?.length ? json.messages : DEMO_MESSAGES.map(m => ({ ...m, project_id: projectId })));
    } catch {
      setMessages(DEMO_MESSAGES.map(m => ({ ...m, project_id: projectId })));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  async function handleSend() {
    if (!form.to || !form.subject || !form.body) { setErrorMsg('To, subject, and body are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const newMsg: Message = {
      id: `m-${Date.now()}`,
      from: 'Me',
      to: form.to,
      subject: form.subject,
      body: form.body,
      date: new Date().toISOString().split('T')[0],
      priority: form.priority,
      read: true,
      project_id: projectId,
    };
    try {
      await fetch('/api/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...form }) });
    } catch { /* demo */ }
    setMessages(prev => [newMsg, ...prev]);
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Message sent.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const selectedMsg = messages.find(m => m.id === selected);
  const unread = messages.filter(m => !m.read).length;

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Messages</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Team communication — {unread} unread</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ New Message</button>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: '#ef4444', fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>New Message</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <div><label style={label}>To *</label><input type="text" value={form.to} onChange={e => setForm(p => ({ ...p, to: e.target.value }))} placeholder="Recipient or group" style={inp} /></div>
            <div><label style={label}>Priority</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={inp}>
                <option>Normal</option><option>High</option><option>Urgent</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Subject *</label><input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} style={inp} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Message *</label><textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={4} style={{ ...inp, resize: 'vertical' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSend} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Sending...' : 'Send Message'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', height: 'calc(100vh - 200px)', minHeight: 400 }}>
        {/* Message list */}
        <div style={{ width: 360, borderRight: '1px solid ' + BORDER, overflowY: 'auto', flexShrink: 0 }}>
          {loading ? <div style={{ padding: 20, color: DIM }}>Loading...</div> : messages.map(msg => (
            <div
              key={msg.id}
              onClick={() => { setSelected(msg.id); setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m)); }}
              style={{ padding: '14px 16px', borderBottom: '1px solid ' + BORDER, cursor: 'pointer', background: selected === msg.id ? 'rgba(212,160,23,.08)' : !msg.read ? 'rgba(255,255,255,.03)' : 'transparent' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: TEXT, fontWeight: !msg.read ? 700 : 500, fontSize: 13 }}>{msg.from}</span>
                <span style={{ color: DIM, fontSize: 11 }}>{msg.date}</span>
              </div>
              <div style={{ color: !msg.read ? TEXT : DIM, fontSize: 13, fontWeight: !msg.read ? 600 : 400, marginBottom: 2 }}>{msg.subject}</div>
              <div style={{ color: DIM, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.body}</div>
              {msg.priority === 'High' && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>HIGH PRIORITY</span>}
            </div>
          ))}
        </div>

        {/* Message detail */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {selectedMsg ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 8px', color: TEXT, fontSize: 18 }}>{selectedMsg.subject}</h3>
                <div style={{ fontSize: 13, color: DIM, marginBottom: 4 }}><strong style={{ color: TEXT }}>From:</strong> {selectedMsg.from}</div>
                <div style={{ fontSize: 13, color: DIM, marginBottom: 4 }}><strong style={{ color: TEXT }}>To:</strong> {selectedMsg.to}</div>
                <div style={{ fontSize: 13, color: DIM }}><strong style={{ color: TEXT }}>Date:</strong> {selectedMsg.date}</div>
              </div>
              <div style={{ background: RAISED, borderRadius: 8, padding: 20, border: '1px solid ' + BORDER, color: TEXT, fontSize: 14, lineHeight: 1.6 }}>
                {selectedMsg.body}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: DIM, marginTop: 60 }}>Select a message to read</div>
          )}
        </div>
      </div>
    </div>
  );
}
