'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#C8960F';
const DARK = '#0d1117';
const RAISED = '#161b22';
const BORDER = '#30363d';
const DIM = '#8B9DB8';
const TEXT = '#F0F4FF';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';

interface Thread {
  id: string;
  subject: string;
  thread_type: string;
  status: string;
  priority: string;
  sub_company: string;
  sub_contact: string;
  days_waiting: number;
  last_message_at: string;
  created_at: string;
}

interface Message {
  id: string;
  sender_type: string;
  sender_name: string;
  message_text: string;
  is_sage_generated: boolean;
  created_at: string;
}

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Awaiting Response' },
  { key: 'closed', label: 'Closed' },
];

function daysWaitingColor(days: number): string {
  if (days > 7) return RED;
  if (days > 3) return AMBER;
  return GREEN;
}

export default function CommunicationsPage() {
  const params = useParams();
  const projectId = params?.projectId as string;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newContact, setNewContact] = useState('');
  const [showSageDraft, setShowSageDraft] = useState(false);
  const [draftIntent, setDraftIntent] = useState('');
  const [sageDraft, setSageDraft] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [alsoSendEmail, setAlsoSendEmail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/comms/${projectId}?filter=${filter}`);
      const json = await res.json();
      if (json.data) setThreads(json.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId, filter]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const loadMessages = useCallback(async (thread: Thread) => {
    setSelectedThread(thread);
    setMessagesLoading(true);
    setMessages([]);
    try {
      const res = await fetch(`/api/comms/${projectId}/${thread.id}`);
      const json = await res.json();
      if (json.messages) setMessages(json.messages);
    } catch { /* ignore */ }
    setMessagesLoading(false);
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThread) return;
    setSending(true);
    try {
      const res = await fetch(`/api/comms/${projectId}/${selectedThread.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_text: replyText.trim(), send_email: alsoSendEmail }),
      });
      const json = await res.json();
      if (json.data) {
        setMessages(prev => [...prev, json.data]);
        setReplyText('');
      }
    } catch { /* ignore */ }
    setSending(false);
  };

  const handleSageDraft = async () => {
    if (!draftIntent.trim() || !selectedThread) return;
    setDraftLoading(true);
    setSageDraft('');
    try {
      const res = await fetch(`/api/comms/${projectId}/${selectedThread.id}/sage-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_intent: draftIntent.trim() }),
      });
      const json = await res.json();
      if (json.draft) {
        setSageDraft(json.draft);
        setReplyText(json.draft);
      }
    } catch { /* ignore */ }
    setDraftLoading(false);
  };

  const handleCreateThread = async () => {
    if (!newSubject.trim()) return;
    try {
      const res = await fetch(`/api/comms/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: newSubject.trim(),
          sub_company: newCompany,
          sub_contact: newContact,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setThreads(prev => [json.data, ...prev]);
        setShowNewThread(false);
        setNewSubject('');
        setNewCompany('');
        setNewContact('');
        loadMessages(json.data);
      }
    } catch { /* ignore */ }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>Sub Communications</h1>
          <p style={{ fontSize: 13, color: DIM, margin: '4px 0 0' }}>{threads.length} threads</p>
        </div>
        <button onClick={() => setShowNewThread(true)}
          style={{ padding: '8px 16px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + New Thread
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Total Threads</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: TEXT }}>{threads.length}</div>
        </div>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Awaiting Response</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: AMBER }}>
            {threads.filter(t => t.status === 'awaiting_response').length}
          </div>
        </div>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Open</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: BLUE }}>
            {threads.filter(t => t.status === 'open' || t.status === 'responded').length}
          </div>
        </div>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Closed</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: GREEN }}>
            {threads.filter(t => t.status === 'closed').length}
          </div>
        </div>
      </div>

      {/* Overdue warnings */}
      {threads.filter(t => {
        const waitDays = Math.floor((Date.now() - new Date(t.last_message_at).getTime()) / 86400000);
        return waitDays > 7 && t.status !== 'closed';
      }).length > 0 && (
        <div style={{ background: `${RED}12`, border: `1px solid ${RED}33`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: RED, fontWeight: 600 }}>
            {threads.filter(t => {
              const waitDays = Math.floor((Date.now() - new Date(t.last_message_at).getTime()) / 86400000);
              return waitDays > 7 && t.status !== 'closed';
            }).length} threads waiting 7+ days for response
          </span>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
        {FILTER_TABS.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{ padding: '8px 18px', border: 'none', borderBottom: `2px solid ${filter === t.key ? GOLD : 'transparent'}`, background: 'transparent', color: filter === t.key ? GOLD : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, height: 'calc(100vh - 240px)' }}>
        {/* Thread List */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: DIM }}>Loading...</div>
          ) : threads.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: DIM }}>No threads</div>
          ) : (
            threads.map(thread => {
              const isSelected = selectedThread?.id === thread.id;
              const waitDays = Math.floor((Date.now() - new Date(thread.last_message_at).getTime()) / 86400000);
              return (
                <div key={thread.id} onClick={() => loadMessages(thread)}
                  style={{
                    padding: '14px 16px', cursor: 'pointer',
                    background: isSelected ? `${GOLD}15` : 'transparent',
                    borderBottom: `1px solid ${BORDER}`,
                    borderLeft: isSelected ? `3px solid ${GOLD}` : '3px solid transparent',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{thread.subject}</div>
                      <div style={{ fontSize: 11, color: DIM }}>{thread.sub_company || 'No company'}</div>
                    </div>
                    {waitDays > 0 && thread.status !== 'closed' && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, fontWeight: 700, color: daysWaitingColor(waitDays), background: `${daysWaitingColor(waitDays)}15` }}>
                        {waitDays}d
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 600, textTransform: 'uppercase',
                      background: thread.status === 'closed' ? `${GREEN}15` : thread.status === 'awaiting_response' ? `${AMBER}15` : `${BLUE}15`,
                      color: thread.status === 'closed' ? GREEN : thread.status === 'awaiting_response' ? AMBER : BLUE,
                    }}>
                      {thread.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Message Panel */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, display: 'flex', flexDirection: 'column' }}>
          {!selectedThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: 14 }}>
              Select a thread to view messages
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0 }}>{selectedThread.subject}</h3>
                <p style={{ fontSize: 12, color: DIM, margin: '4px 0 0' }}>{selectedThread.sub_company} — {selectedThread.sub_contact || 'No contact'}</p>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messagesLoading ? (
                  <div style={{ textAlign: 'center', color: DIM, padding: 20 }}>Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: DIM, padding: 20 }}>No messages yet. Start the conversation.</div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id} style={{
                      alignSelf: msg.sender_type === 'gc' ? 'flex-end' : 'flex-start',
                      maxWidth: '75%',
                    }}>
                      <div style={{ fontSize: 10, color: DIM, marginBottom: 2, textAlign: msg.sender_type === 'gc' ? 'right' : 'left' }}>
                        {msg.sender_name} {msg.is_sage_generated ? '(Sage Draft)' : ''}
                      </div>
                      <div style={{
                        padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                        background: msg.sender_type === 'gc' ? `${GOLD}22` : `${BORDER}`,
                        color: TEXT,
                        border: msg.is_sage_generated ? `1px solid ${GOLD}44` : 'none',
                      }}>
                        {msg.message_text}
                      </div>
                      <div style={{ fontSize: 10, color: DIM, marginTop: 2, textAlign: msg.sender_type === 'gc' ? 'right' : 'left' }}>
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Sage Draft Panel */}
              {showSageDraft && (
                <div style={{ padding: '12px 18px', borderTop: `1px solid ${GOLD}33`, background: `${GOLD}08` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>Sage Draft — What do you want to say?</div>
                  <textarea value={draftIntent} onChange={e => setDraftIntent(e.target.value)}
                    placeholder="Describe what you want to communicate (e.g., 'Tell them their submittals are late and we need them by Friday')"
                    style={{ width: '100%', padding: 10, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13, resize: 'vertical', minHeight: 60, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={handleSageDraft} disabled={draftLoading || !draftIntent.trim()}
                      style={{ padding: '8px 14px', background: draftLoading ? `${GOLD}44` : `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: draftLoading ? 'not-allowed' : 'pointer' }}>
                      {draftLoading ? 'Drafting...' : 'Generate Draft'}
                    </button>
                    <button onClick={() => { setShowSageDraft(false); setDraftIntent(''); setSageDraft(''); }}
                      style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                  {sageDraft && (
                    <div style={{ marginTop: 10, padding: 10, background: `${GREEN}10`, border: `1px solid ${GREEN}33`, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: GREEN, fontWeight: 600, marginBottom: 4 }}>Draft loaded into reply box — review and send.</div>
                    </div>
                  )}
                </div>
              )}

              {/* Reply area */}
              <div style={{ padding: '12px 18px', borderTop: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <input type="checkbox" id="email-toggle" checked={alsoSendEmail}
                    onChange={e => setAlsoSendEmail(e.target.checked)}
                    style={{ accentColor: GOLD }} />
                  <label htmlFor="email-toggle" style={{ fontSize: 11, color: DIM, cursor: 'pointer' }}>
                    Also send via email
                  </label>
                </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your message..."
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                  style={{ flex: 1, padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13, resize: 'none', minHeight: 44, maxHeight: 120, boxSizing: 'border-box' }} />
                <button onClick={() => setShowSageDraft(!showSageDraft)}
                  style={{ padding: '10px 12px', background: showSageDraft ? `${GOLD}33` : 'transparent', border: `1px solid ${GOLD}`, borderRadius: 6, color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Sage Draft
                </button>
                <button onClick={handleSendReply} disabled={sending || !replyText.trim()}
                  style={{ padding: '10px 16px', background: sending || !replyText.trim() ? `${GOLD}44` : `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer' }}>
                  {sending ? '...' : 'Send'}
                </button>
              </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Thread Modal */}
      {showNewThread && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowNewThread(false)}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, width: 420, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, margin: '0 0 20px' }}>New Thread</h2>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Subject</label>
              <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 14, boxSizing: 'border-box' }}
                placeholder="Thread subject" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Sub Company</label>
              <input value={newCompany} onChange={e => setNewCompany(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 14, boxSizing: 'border-box' }}
                placeholder="Company name" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Contact Name</label>
              <input value={newContact} onChange={e => setNewContact(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 14, boxSizing: 'border-box' }}
                placeholder="Contact person" />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewThread(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreateThread} disabled={!newSubject.trim()}
                style={{ padding: '10px 20px', background: !newSubject.trim() ? `${GOLD}44` : `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: !newSubject.trim() ? 'not-allowed' : 'pointer' }}>
                Create Thread
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
