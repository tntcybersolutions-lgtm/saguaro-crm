'use client';
/**
 * Project Messages — the job's running team thread, timestamped.
 *
 * Reads  GET  /api/projects/:id/messages   (on load + every 15s)
 * Sends  POST /api/projects/:id/messages   { content }
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { ChatCircleText, ChatsCircle, PaperPlaneTilt, UsersThree, Clock, AddressBook } from '@phosphor-icons/react';
import { PageShell, Card, StatRow, Button, Toolbar, EmptyState, Input, type StatItem } from '@/components/ui/kit';

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  project_id?: string;
}

// The `messages` table stores sender_name / content / created_at. Normalize the
// raw DB rows into the client shape so the thread actually renders (previously
// the UI read msg.sender/msg.text/msg.timestamp — columns that don't exist —
// so every loaded message showed blank + "Invalid Date").
function normalize(row: Record<string, unknown>): Message {
  return {
    id: String(row.id ?? `${row.created_at ?? ''}-${row.sender_name ?? ''}`),
    sender: String(row.sender_name ?? row.sender ?? 'Team'),
    text: String(row.content ?? row.text ?? ''),
    timestamp: String(row.created_at ?? row.timestamp ?? ''),
    project_id: row.project_id ? String(row.project_id) : undefined,
  };
}

function relativeTime(ts: string): string {
  const then = new Date(ts).getTime();
  if (isNaN(then)) return '';
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 0) return 'just now';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

// Day separators for the thread — Today / Yesterday / weekday date.
function dayLabel(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

const CSS = `
.msgThread { display: flex; flex-direction: column; height: calc(100vh - 380px); min-height: 460px; }
.msgScroll { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; }
.msgList { display: flex; flex-direction: column; gap: 14px; }
.msgDay { display: flex; align-items: center; gap: 12px; margin: 2px 0; }
.msgDay::before, .msgDay::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
.msgDay span { font-size: 12px; font-weight: 700; color: var(--text-tertiary); }
.msgRow { display: flex; gap: 10px; align-items: flex-end; max-width: 100%; }
.msgRow[data-me="true"] { flex-direction: row-reverse; }
.msgAvatar { width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--text-secondary); background: var(--bg-surface-2); border: 1px solid var(--border-default); }
.msgCol { display: flex; flex-direction: column; min-width: 0; max-width: min(70%, 640px); }
.msgRow[data-me="true"] .msgCol { align-items: flex-end; }
.msgMeta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; font-size: 12px; }
.msgMeta b { color: var(--text-primary); font-weight: 700; }
.msgMeta span { color: var(--text-tertiary); }
.msgBubble { padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.5; color: var(--text-primary); overflow-wrap: anywhere; white-space: pre-wrap; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); }
.msgRow[data-me="true"] .msgBubble { border-color: var(--border-strong); border-bottom-right-radius: 4px; }
.msgRow:not([data-me="true"]) .msgBubble { border-bottom-left-radius: 4px; }
.msgErr { padding: 8px 20px; border-top: 1px solid var(--border-subtle); }
.msgSend { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border-subtle); padding-bottom: max(12px, env(safe-area-inset-bottom)); }
.msgSend .k-input { flex: 1; }
.msgStarters { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
@media (max-width: 640px) {
  .msgThread { height: calc(100dvh - 300px); min-height: 380px; }
  .msgScroll { padding: 14px 12px; }
  .msgCol { max-width: 82%; }
  .msgWs .k-btn, .msgWs .k-stat, .msgWs .k-input { min-height: 44px; }
  .msgSend .k-input { font-size: 16px; }
}
`;

export default function MessagesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [myName, setMyName] = useState('');
  // Toolbar state — keyword search over the running record.
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Remember which sender_name is "me" so my own bubbles align right. The server
  // stamps sender_name from my auth identity and returns it on POST; cache it.
  useEffect(() => {
    try { const n = localStorage.getItem('saguaro:msgSender'); if (n) setMyName(n); } catch { /* noop */ }
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`);
      const json = await res.json();
      setMessages(Array.isArray(json.messages) ? json.messages.map(normalize) : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Project intelligence — one snapshot; names the thread and sizes the roster.
  const { ctx } = useProjectContext(projectId);

  const contributors = [...new Set(messages.map(m => m.sender).filter(Boolean))];
  const todayCount = messages.filter(m => dayLabel(m.timestamp) === 'Today').length;
  const lastMsg = messages[messages.length - 1] || null;
  const subCount = (ctx?.subs || []).length;
  // Toolbar-driven view of the thread — empty search shows the live thread untouched.
  const q = search.trim().toLowerCase();
  const visibleMessages = q ? messages.filter(m => m.text.toLowerCase().includes(q) || m.sender.toLowerCase().includes(q)) : messages;

  // Poll for new messages every 15 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/messages`);
        const json = await res.json();
        const newMsgs: Message[] = Array.isArray(json.messages) ? json.messages.map(normalize) : [];
        setMessages(prev => {
          if (newMsgs.length !== prev.length) return newMsgs;
          return prev;
        });
      } catch { /* non-fatal */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [projectId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.message) throw new Error(json?.error || 'Message failed to send');
      const saved = normalize(json.message);
      // The server just told us our own sender_name — remember it for alignment.
      if (saved.sender) { setMyName(saved.sender); try { localStorage.setItem('saguaro:msgSender', saved.sender); } catch { /* noop */ } }
      setMessages(prev => [...prev, saved]);
      setText('');
    } catch (e: unknown) {
      console.error(e); setError(humanError(e, 'Could not send the message. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const sendDisabled = sending || !text.trim();
  const rosterSize = subCount + (ctx?.project?.ownerName ? 1 : 0);

  const stats: StatItem[] = [
    { label: 'Messages', value: messages.length, sub: `${todayCount} today`, icon: <ChatCircleText size={15} /> },
    { label: 'Contributors', value: contributors.length, sub: contributors.slice(0, 2).join(', ') || 'No one yet', icon: <UsersThree size={15} /> },
    { label: 'Last activity', value: lastMsg ? relativeTime(lastMsg.timestamp) || '—' : '—', sub: lastMsg ? `From ${lastMsg.sender}` : undefined, icon: <Clock size={15} /> },
    { label: 'Project roster', value: rosterSize, sub: subCount > 0 ? `${subCount} sub${subCount === 1 ? '' : 's'}${ctx?.project?.ownerName ? ' + owner' : ''}` : 'Build the directory to grow it', icon: <AddressBook size={15} />, href: `/app/projects/${projectId}/directory` },
  ];

  const starters = [
    { label: 'Kickoff note', text: `Kicking off the ${ctx?.project?.name || 'project'} thread — daily coordination, decisions, and weather calls all live here.` },
    { label: 'Schedule check', text: 'Schedule check: are we still tracking to this week\'s milestones? Flag any slips here so we can resequence early.' },
    { label: 'Safety reminder', text: 'Reminder: report near misses the same day and log toolbox talks under Safety — the log only works if we feed it.' },
  ];

  const base = `/app/projects/${projectId}`;
  return (
    <div className="msgWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'Messages' },
        ]}
        title="Messages"
        subtitle="The project's running record, timestamped."
      >
        {!loading && messages.length > 0 && <StatRow items={stats} />}

        {!loading && messages.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search messages…"
            actions={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>{visibleMessages.length} of {messages.length}</span>}
          />
        )}

        <Card
          flush
          title="Team thread"
          icon={<ChatCircleText size={16} />}
          subtitle={messages.length > 0 ? `${messages.length} message${messages.length === 1 ? '' : 's'} · ${contributors.length} contributor${contributors.length === 1 ? '' : 's'} · refreshes every 15s` : 'Live conversation for this project — refreshes every 15s'}
        >
          <div className="msgThread">
            <div ref={scrollRef} className="msgScroll" aria-live="polite">
              {loading ? (
                <div className="msgList" aria-label="Loading messages">
                  {[0, 1, 2].map(i => <span key={i} className="k-skel" style={{ width: `${60 - i * 12}%`, height: 40, alignSelf: i === 1 ? 'flex-end' : 'flex-start' }} />)}
                </div>
              ) : messages.length === 0 ? (
                <EmptyState
                  icon={<ChatsCircle size={22} />}
                  title="No messages yet"
                  text={`Posts here become the ${ctx?.project?.name ? `${ctx.project.name} ` : 'project '}running record${subCount > 0 ? ` — ${subCount} sub${subCount === 1 ? '' : 's'} on the roster` : ''}. Start with one:`}
                  action={
                    <div className="msgStarters">
                      {starters.map(p => (
                        <Button key={p.label} onClick={() => { setText(p.text); inputRef.current?.focus(); }}>{p.label}</Button>
                      ))}
                    </div>
                  }
                />
              ) : visibleMessages.length === 0 ? (
                <EmptyState title="No messages match" text="Change the search." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />
              ) : (
                <div className="msgList">
                  {visibleMessages.map((msg, idx) => {
                    const isMe = !!myName && msg.sender === myName;
                    const day = dayLabel(msg.timestamp);
                    const prevDay = idx > 0 ? dayLabel(visibleMessages[idx - 1].timestamp) : null;
                    return (
                      <React.Fragment key={msg.id}>
                        {day && day !== prevDay && <div className="msgDay"><span>{day}</span></div>}
                        <div className="msgRow" data-me={isMe ? 'true' : undefined}>
                          <span className="msgAvatar" aria-hidden>{initials(msg.sender)}</span>
                          <div className="msgCol">
                            <div className="msgMeta"><b>{isMe ? 'You' : msg.sender}</b><span title={msg.timestamp ? new Date(msg.timestamp).toLocaleString() : undefined}>{relativeTime(msg.timestamp)}</span></div>
                            <div className="msgBubble">{msg.text}</div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            {error && <div className="msgErr"><span className="k-error" role="alert">{error}</span></div>}
            <div className="msgSend">
              <Input
                ref={inputRef}
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                aria-label="Message"
              />
              <Button variant="primary" icon={<PaperPlaneTilt size={15} weight="fill" />} onClick={handleSend} disabled={sendDisabled}>
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </Card>
      </PageShell>
    </div>
  );
}
