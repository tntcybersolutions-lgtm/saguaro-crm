'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { ChatCircleText, ChatsCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, goldButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';

// Premium surface palette (matches components/ui/premium.tsx + the dashboard) ----
const WHITE = 'var(--text-primary)';
const MUTED = 'rgba(255,255,255,0.62)';
const FAINT = 'var(--text-secondary)';
const BORDER = 'rgba(255,255,255,0.08)';
const RED = 'var(--danger)';
const ME_BG = 'var(--bg-surface-2)';
const ME_BORDER = 'var(--border-strong)';
const OTHER_BG = 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))';
const INPUT_BG = 'rgba(255,255,255,0.04)';

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

export default function MessagesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [myName, setMyName] = useState('');
  // ListToolbar state — keyword search over the running record.
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <PremiumSurface maxWidth={1040} pad="40px 28px 40px">
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Communication'}
        eyebrowIcon={<ChatCircleText size={13} weight="fill" color="var(--text-secondary)" />}
        title="Project"
        accent="Messages"
        subtitle="The project's running record, timestamped."
      />

      {/* Thread intelligence strip */}
      {!loading && messages.length > 0 && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/messages`,  label: 'Messages', value: String(messages.length), sub: `${todayCount} today` },
          {href: `/app/projects/${projectId}/messages`,  label: 'Contributors', value: String(contributors.length), sub: contributors.slice(0, 2).join(', ') || 'No one yet' },
          {href: `/app/projects/${projectId}/messages`,  label: 'Last Activity', value: lastMsg ? relativeTime(lastMsg.timestamp) || '—' : '—', sub: lastMsg ? `From ${lastMsg.sender}` : undefined },
          {href: `/app/projects/${projectId}/messages`,  label: 'Project Roster', value: String(subCount + (ctx?.project?.ownerName ? 1 : 0)), sub: subCount > 0 ? `${subCount} sub${subCount === 1 ? '' : 's'}${ctx?.project?.ownerName ? ' + owner' : ''}` : 'Build the directory to grow it' },
        ]} />
      )}

      {/* List toolbar — search the running record */}
      {!loading && messages.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search messages…"
          count={{ shown: visibleMessages.length, total: messages.length }}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Message thread — full-height card: thread scrolls internally, send bar pinned */}
      <SectionCard
        flush
        icon={<ChatCircleText size={17} weight="duotone" color="var(--text-secondary)" />}
        title="Team Thread"
        subtitle={messages.length > 0 ? `${messages.length} message${messages.length === 1 ? '' : 's'} · ${contributors.length} contributor${contributors.length === 1 ? '' : 's'} · refreshes every 15s` : 'Live conversation for this project — refreshes every 15s'}
        style={{ display: 'flex', flexDirection: 'column', height: messages.length > 0 ? 'calc(100vh - 348px)' : 'calc(100vh - 260px)', minHeight: 460 }}
        bodyStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: MUTED }}>Loading…</div>
          ) : messages.length === 0 ? (
            <PremiumEmpty
              icon={<ChatsCircle size={30} weight="duotone" color="var(--text-secondary)" />}
              title="No messages yet"
              description={`Everything posted here becomes the ${ctx?.project?.name ? `${ctx.project.name} ` : 'project '}running record — timestamped, searchable, and visible to the whole team${subCount > 0 ? `, with ${subCount} sub${subCount === 1 ? '' : 's'} on the roster to coordinate` : ''}. Start with one of these:`}
              action={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[
                    { label: 'Kickoff Note', text: `Kicking off the ${ctx?.project?.name || 'project'} thread — daily coordination, decisions, and weather calls all live here.` },
                    { label: 'Schedule Check', text: 'Schedule check: are we still tracking to this week\'s milestones? Flag any slips here so we can resequence early.' },
                    { label: 'Safety Reminder', text: 'Reminder: report near misses the same day and log toolbox talks under Safety — the log only works if we feed it.' },
                  ].map(p => (
                    <button key={p.label} onClick={() => setText(p.text)} className="pmBtn" style={{ minHeight: 44, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{p.label}</button>
                  ))}
                </div>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {visibleMessages.map((msg, idx) => {
                const isMe = !!myName && msg.sender === myName;
                const day = dayLabel(msg.timestamp);
                const prevDay = idx > 0 ? dayLabel(visibleMessages[idx - 1].timestamp) : null;
                return (
                  <React.Fragment key={msg.id}>
                  {day && day !== prevDay && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
                      <div style={{ flex: 1, height: 1, background: BORDER }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: FAINT }}>{day}</span>
                      <div style={{ flex: 1, height: 1, background: BORDER }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: WHITE }}>{msg.sender}</span>
                      <span style={{ fontSize: 12, color: FAINT }}>{relativeTime(msg.timestamp)}</span>
                    </div>
                    <div style={{
                      maxWidth: '70%',
                      padding: '10px 16px',
                      borderRadius: 14,
                      background: isMe ? ME_BG : OTHER_BG,
                      border: `1px solid ${isMe ? ME_BORDER : BORDER}`,
                      color: WHITE,
                      fontSize: 14,
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                      boxShadow: '0 10px 30px -22px rgba(0,0,0,0.7)',
                    }}>
                      {msg.text}
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Send bar */}
        {error && (
          <div style={{ padding: '8px 20px', color: RED, fontSize: 13, borderTop: `1px solid ${BORDER}` }}>{error}</div>
        )}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            style={{
              flex: 1, padding: '11px 14px',
              background: INPUT_BG, border: `1px solid ${BORDER}`,
              borderRadius: 12, color: WHITE, fontSize: 14, outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            disabled={sendDisabled}
            className="pmBtn"
            style={{
              ...goldButtonStyle,
              opacity: sendDisabled ? 0.5 : 1,
              cursor: sendDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            <PaperPlaneTilt size={15} weight="fill" />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </SectionCard>
    </PremiumSurface>
  );
}
