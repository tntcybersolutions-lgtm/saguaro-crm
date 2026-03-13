'use client';
/**
 * Saguaro Field — Correspondence
 * Full-featured correspondence management: Letters, Transmittals, Notices,
 * Memos, and Email Records with read receipts, threading, and offline support.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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

/* ─── Types ─── */
type CorrespondenceType = 'Letter' | 'Transmittal' | 'Notice' | 'Memo' | 'Email Record';
type CorrespondenceStatus = 'Draft' | 'Sent' | 'Read' | 'Replied';
type Priority = 'Normal' | 'Urgent';
type Tab = 'Inbox' | 'Sent' | 'All';
type View = 'list' | 'detail' | 'create';
type TransmittalPurpose = 'For Review' | 'For Approval' | 'For Record' | 'As Requested';

interface Recipient {
  name: string;
  email: string;
}

interface ReadReceipt {
  user_name: string;
  user_email: string;
  read_at: string;
}

interface Attachment {
  name: string;
  url: string;
  size?: number;
}

interface TransmittalItem {
  document_name: string;
  revision: string;
  copies: number;
}

interface Correspondence {
  id: string;
  type: CorrespondenceType;
  status: CorrespondenceStatus;
  priority: Priority;
  subject: string;
  body: string;
  from_name: string;
  from_email: string;
  to: Recipient[];
  cc: Recipient[];
  created_at: string;
  sent_at?: string;
  attachments: Attachment[];
  read_receipts: ReadReceipt[];
  request_read_receipt: boolean;
  reference_links: string[];
  thread_id?: string;
  parent_id?: string;
  replies?: Correspondence[];
  // Transmittal-specific
  transmittal_number?: string;
  transmittal_items?: TransmittalItem[];
  transmittal_purposes?: TransmittalPurpose[];
  transmittal_remarks?: string;
  // Direction for inbox/sent
  direction?: 'inbound' | 'outbound';
}

const TYPES: CorrespondenceType[] = ['Letter', 'Transmittal', 'Notice', 'Memo', 'Email Record'];
const STATUSES: CorrespondenceStatus[] = ['Draft', 'Sent', 'Read', 'Replied'];
const PURPOSES: TransmittalPurpose[] = ['For Review', 'For Approval', 'For Record', 'As Requested'];

/* ─── Helpers ─── */
function formatDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function statusColor(s: CorrespondenceStatus): string {
  switch (s) {
    case 'Draft': return DIM;
    case 'Sent': return BLUE;
    case 'Read': return GREEN;
    case 'Replied': return AMBER;
    default: return DIM;
  }
}

function typeIcon(t: CorrespondenceType): string {
  switch (t) {
    case 'Letter': return '\u2709';      // ✉
    case 'Transmittal': return '\u{1F4E6}'; // 📦
    case 'Notice': return '\u26A0';      // ⚠
    case 'Memo': return '\u{1F4DD}';     // 📝
    case 'Email Record': return '\u{1F4E7}'; // 📧
    default: return '\u2709';
  }
}

function priorityBadge(p: Priority) {
  if (p === 'Urgent') {
    return (
      <span style={{
        background: RED, color: '#fff', fontSize: 10, fontWeight: 700,
        padding: '2px 7px', borderRadius: 6, marginLeft: 6, letterSpacing: 0.5,
      }}>URGENT</span>
    );
  }
  return null;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* ─── Main Component ─── */
function CorrespondencePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [items, setItems] = useState<Correspondence[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Correspondence | null>(null);
  const [online, setOnline] = useState(true);
  const [tab, setTab] = useState<Tab>('Inbox');
  const [filterType, setFilterType] = useState<CorrespondenceType | ''>('');
  const [filterStatus, setFilterStatus] = useState<CorrespondenceStatus | ''>('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  // Create form state
  const [formType, setFormType] = useState<CorrespondenceType>('Letter');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formPriority, setFormPriority] = useState<Priority>('Normal');
  const [formTo, setFormTo] = useState<Recipient[]>([{ name: '', email: '' }]);
  const [formCc, setFormCc] = useState<Recipient[]>([]);
  const [formAttachments, setFormAttachments] = useState<File[]>([]);
  const [formRefLinks, setFormRefLinks] = useState('');
  const [formReadReceipt, setFormReadReceipt] = useState(false);
  // Transmittal-specific
  const [formTransItems, setFormTransItems] = useState<TransmittalItem[]>([{ document_name: '', revision: '', copies: 1 }]);
  const [formTransPurposes, setFormTransPurposes] = useState<TransmittalPurpose[]>([]);
  const [formTransRemarks, setFormTransRemarks] = useState('');

  // Reply / forward
  const [replyBody, setReplyBody] = useState('');
  const [replyMode, setReplyMode] = useState<'reply' | 'forward' | null>(null);
  const [forwardTo, setForwardTo] = useState<Recipient[]>([{ name: '', email: '' }]);

  /* ─── Fetch ─── */
  const fetchItems = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/correspondence`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : data.items || []);
      }
    } catch {
      // offline – keep cached items
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  /* ─── Derived data ─── */
  const unreadCount = items.filter(i => i.direction === 'inbound' && i.status !== 'Read' && i.status !== 'Replied').length;

  const filtered = items.filter(i => {
    if (tab === 'Inbox' && i.direction !== 'inbound') return false;
    if (tab === 'Sent' && i.direction !== 'outbound') return false;
    if (filterType && i.type !== filterType) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const inSubject = i.subject?.toLowerCase().includes(q);
      const inTo = i.to?.some(r => r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q));
      const inFrom = i.from_name?.toLowerCase().includes(q) || i.from_email?.toLowerCase().includes(q);
      if (!inSubject && !inTo && !inFrom) return false;
    }
    return true;
  });

  /* ─── Read receipt ─── */
  const markRead = useCallback(async (item: Correspondence) => {
    if (!projectId || item.direction !== 'inbound' || item.status === 'Read' || item.status === 'Replied') return;
    try {
      if (online) {
        await fetch(`/api/projects/${projectId}/correspondence/${item.id}/read-receipt`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read_at: new Date().toISOString() }),
        });
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/correspondence/${item.id}/read-receipt`,
          method: 'POST', body: JSON.stringify({ read_at: new Date().toISOString() }),
          contentType: 'application/json', isFormData: false,
        });
      }
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'Read' as CorrespondenceStatus } : x));
    } catch { /* silently fail */ }
  }, [projectId, online]);

  /* ─── Submit (create / draft) ─── */
  const handleSubmit = async (asDraft: boolean) => {
    if (!formSubject.trim()) { setSubmitMsg('Subject is required.'); return; }
    if (!asDraft && formTo.every(r => !r.email.trim())) { setSubmitMsg('At least one recipient email is required.'); return; }
    setSubmitting(true);
    setSubmitMsg('');

    const payload: Record<string, unknown> = {
      type: formType,
      subject: formSubject.trim(),
      body: formBody,
      priority: formPriority,
      to: formTo.filter(r => r.email.trim()),
      cc: formCc.filter(r => r.email.trim()),
      status: asDraft ? 'Draft' : 'Sent',
      request_read_receipt: formReadReceipt,
      reference_links: formRefLinks.split(',').map(s => s.trim()).filter(Boolean),
      direction: 'outbound',
      sent_at: asDraft ? undefined : new Date().toISOString(),
    };

    if (formType === 'Transmittal') {
      payload.transmittal_items = formTransItems.filter(t => t.document_name.trim());
      payload.transmittal_purposes = formTransPurposes;
      payload.transmittal_remarks = formTransRemarks;
    }

    try {
      if (online) {
        const res = await fetch(`/api/projects/${projectId}/correspondence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to save');
        // Upload attachments if any
        if (formAttachments.length > 0 && res.ok) {
          const created = await res.json();
          const fd = new FormData();
          formAttachments.forEach(f => fd.append('files', f));
          await fetch(`/api/projects/${projectId}/correspondence/${created.id || created.data?.id}`, {
            method: 'PATCH',
            body: fd,
          });
        }
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/correspondence`,
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
      }
      setSubmitMsg(asDraft ? 'Draft saved.' : 'Correspondence sent.');
      resetForm();
      setTimeout(() => { setView('list'); fetchItems(); }, 800);
    } catch {
      setSubmitMsg('Failed. Queued for retry.');
      await enqueue({
        url: `/api/projects/${projectId}/correspondence`,
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Reply / Forward ─── */
  const handleReplyForward = async () => {
    if (!selected) return;
    setSubmitting(true);
    const isForward = replyMode === 'forward';
    const payload: Record<string, unknown> = {
      type: selected.type,
      subject: `${isForward ? 'FW' : 'RE'}: ${selected.subject}`,
      body: replyBody,
      priority: selected.priority,
      to: isForward ? forwardTo.filter(r => r.email.trim()) : selected.to,
      cc: [],
      status: 'Sent',
      direction: 'outbound',
      parent_id: selected.id,
      thread_id: selected.thread_id || selected.id,
      sent_at: new Date().toISOString(),
      reference_links: [],
      request_read_receipt: false,
    };

    try {
      if (online) {
        const res = await fetch(`/api/projects/${projectId}/correspondence`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/correspondence`,
          method: 'POST', body: JSON.stringify(payload),
          contentType: 'application/json', isFormData: false,
        });
      }
      // Update original status
      if (!isForward) {
        try {
          if (online) {
            await fetch(`/api/projects/${projectId}/correspondence/${selected.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'Replied' }),
            });
          } else {
            await enqueue({
              url: `/api/projects/${projectId}/correspondence/${selected.id}`,
              method: 'PATCH', body: JSON.stringify({ status: 'Replied' }),
              contentType: 'application/json', isFormData: false,
            });
          }
        } catch { /* silent */ }
      }
      setReplyBody('');
      setReplyMode(null);
      fetchItems();
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/correspondence`,
        method: 'POST', body: JSON.stringify(payload),
        contentType: 'application/json', isFormData: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Print ─── */
  const handlePrint = () => { window.print(); };

  /* ─── Form helpers ─── */
  const resetForm = () => {
    setFormType('Letter'); setFormSubject(''); setFormBody('');
    setFormPriority('Normal'); setFormTo([{ name: '', email: '' }]);
    setFormCc([]); setFormAttachments([]); setFormRefLinks('');
    setFormReadReceipt(false); setFormTransItems([{ document_name: '', revision: '', copies: 1 }]);
    setFormTransPurposes([]); setFormTransRemarks('');
  };

  const updateRecipient = (list: Recipient[], idx: number, field: 'name' | 'email', val: string, setter: React.Dispatch<React.SetStateAction<Recipient[]>>) => {
    const next = [...list];
    next[idx] = { ...next[idx], [field]: val };
    setter(next);
  };

  const addRecipient = (setter: React.Dispatch<React.SetStateAction<Recipient[]>>) => {
    setter(prev => [...prev, { name: '', email: '' }]);
  };

  const removeRecipient = (list: Recipient[], idx: number, setter: React.Dispatch<React.SetStateAction<Recipient[]>>) => {
    setter(list.filter((_, i) => i !== idx));
  };

  /* ─── Shared styles ─── */
  const card: React.CSSProperties = {
    background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
    padding: 16, marginBottom: 10,
  };
  const btn = (bg: string, small = false): React.CSSProperties => ({
    background: bg, color: '#fff', border: 'none', borderRadius: 8,
    padding: small ? '6px 12px' : '10px 18px', cursor: 'pointer',
    fontWeight: 600, fontSize: small ? 12 : 14, letterSpacing: 0.3,
  });
  const input: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${BORDER}`, background: '#0A1628', color: TEXT,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', color: DIM, fontSize: 12, fontWeight: 600,
    marginBottom: 4, letterSpacing: 0.4,
  };
  const selectStyle: React.CSSProperties = { ...input, appearance: 'auto' as React.CSSProperties['appearance'] };

  /* ━━━━━━━━━━━ RENDER ━━━━━━━━━━━ */

  /* ─── HEADER ─── */
  const renderHeader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {view !== 'list' && (
          <button onClick={() => { setView('list'); setSelected(null); setReplyMode(null); }}
            style={{ ...btn('transparent', true), color: GOLD, border: `1px solid ${GOLD}`, fontSize: 13 }}>
            &#8592; Back
          </button>
        )}
        <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>
          {view === 'create' ? 'New Correspondence' : view === 'detail' ? 'Correspondence Detail' : 'Correspondence'}
        </h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {!online && (
          <span style={{
            background: AMBER, color: '#000', fontSize: 10, fontWeight: 700,
            padding: '3px 8px', borderRadius: 6,
          }}>OFFLINE</span>
        )}
        {view === 'list' && (
          <button onClick={() => { resetForm(); setView('create'); }} style={btn(GOLD)}>
            + New
          </button>
        )}
      </div>
    </div>
  );

  /* ─── LIST VIEW ─── */
  const renderList = () => (
    <>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
        {(['Inbox', 'Sent', 'All'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
            background: tab === t ? GOLD : RAISED, color: tab === t ? '#000' : DIM,
            fontWeight: 700, fontSize: 13, position: 'relative',
          }}>
            {t}
            {t === 'Inbox' && unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 12,
                background: RED, color: '#fff', fontSize: 10, fontWeight: 800,
                borderRadius: 10, padding: '1px 6px', minWidth: 16, textAlign: 'center',
              }}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value as CorrespondenceType | '')}
          style={{ ...selectStyle, width: 'auto', minWidth: 120, flex: '0 0 auto' }}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as CorrespondenceStatus | '')}
          style={{ ...selectStyle, width: 'auto', minWidth: 120, flex: '0 0 auto' }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          placeholder="Search subject, recipient..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...input, flex: 1, minWidth: 160 }}
        />
      </div>

      {/* Items */}
      {loading ? (
        <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading correspondence...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
          {items.length === 0 ? 'No correspondence yet. Tap "+ New" to create one.' : 'No results match your filters.'}
        </div>
      ) : (
        filtered.map(item => (
          <div key={item.id} onClick={() => { setSelected(item); setView('detail'); markRead(item); }} style={{
            ...card, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
            borderLeft: item.status === 'Draft' ? `3px solid ${DIM}` : item.priority === 'Urgent' ? `3px solid ${RED}` : `3px solid ${BORDER}`,
            opacity: item.status === 'Draft' ? 0.8 : 1,
          }}>
            <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{typeIcon(item.type)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  color: TEXT, fontWeight: item.direction === 'inbound' && item.status === 'Sent' ? 800 : 600,
                  fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%',
                }}>
                  {item.subject || '(No Subject)'}
                </span>
                {priorityBadge(item.priority)}
                {item.type === 'Transmittal' && item.transmittal_number && (
                  <span style={{ color: BLUE, fontSize: 11, fontWeight: 600 }}>#{item.transmittal_number}</span>
                )}
              </div>
              <div style={{ color: DIM, fontSize: 12, marginTop: 3 }}>
                {item.direction === 'inbound' ? `From: ${item.from_name || item.from_email}` : `To: ${item.to?.map(r => r.name || r.email).join(', ') || '—'}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 10, color: statusColor(item.status), fontWeight: 700, textTransform: 'uppercase' }}>
                  {item.status}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{item.type}</span>
                <span style={{ fontSize: 10, color: DIM }}>{formatDate(item.sent_at || item.created_at)}</span>
                {item.attachments?.length > 0 && (
                  <span style={{ fontSize: 10, color: DIM }}>{'\u{1F4CE}'} {item.attachments.length}</span>
                )}
                {item.read_receipts?.length > 0 && (
                  <span title={`Read by ${item.read_receipts.length}`} style={{ fontSize: 12, color: GREEN, cursor: 'default' }}>
                    {'\u{1F441}'} {formatDateTime(item.read_receipts[item.read_receipts.length - 1].read_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );

  /* ─── DETAIL VIEW ─── */
  const renderDetail = () => {
    if (!selected) return null;
    const allInThread = selected.replies || [];

    return (
      <>
        {/* Main correspondence card */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontSize: 26, marginRight: 8 }}>{typeIcon(selected.type)}</span>
              <span style={{ fontSize: 11, color: statusColor(selected.status), fontWeight: 700, textTransform: 'uppercase' }}>
                {selected.status}
              </span>
              {priorityBadge(selected.priority)}
              {selected.transmittal_number && (
                <span style={{ color: BLUE, fontSize: 12, fontWeight: 600, marginLeft: 8 }}>
                  Transmittal #{selected.transmittal_number}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setReplyMode('reply'); setReplyBody(''); }} style={btn(BLUE, true)}>Reply</button>
              <button onClick={() => { setReplyMode('forward'); setReplyBody(''); setForwardTo([{ name: '', email: '' }]); }} style={btn(DIM, true)}>Forward</button>
              <button onClick={handlePrint} style={btn(BORDER, true)}>{'\u{1F5A8}'} Print</button>
            </div>
          </div>

          <h2 style={{ color: TEXT, fontSize: 18, fontWeight: 700, margin: '12px 0 6px' }}>{selected.subject}</h2>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <span style={{ ...label, marginBottom: 0 }}>From</span>
              <span style={{ color: TEXT, fontSize: 13 }}>{selected.from_name} &lt;{selected.from_email}&gt;</span>
            </div>
            <div>
              <span style={{ ...label, marginBottom: 0 }}>To</span>
              <span style={{ color: TEXT, fontSize: 13 }}>{selected.to?.map(r => `${r.name} <${r.email}>`).join('; ') || '—'}</span>
            </div>
            {selected.cc?.length > 0 && (
              <div>
                <span style={{ ...label, marginBottom: 0 }}>CC</span>
                <span style={{ color: TEXT, fontSize: 13 }}>{selected.cc.map(r => `${r.name} <${r.email}>`).join('; ')}</span>
              </div>
            )}
            <div>
              <span style={{ ...label, marginBottom: 0 }}>Date</span>
              <span style={{ color: TEXT, fontSize: 13 }}>{formatDateTime(selected.sent_at || selected.created_at)}</span>
            </div>
          </div>

          {/* Body */}
          <div style={{
            color: TEXT, fontSize: 14, lineHeight: 1.7, padding: 14,
            background: '#0A1628', borderRadius: 10, whiteSpace: 'pre-wrap',
            border: `1px solid ${BORDER}`, marginBottom: 14,
          }}>
            {selected.body || '(No body content)'}
          </div>

          {/* Transmittal specifics */}
          {selected.type === 'Transmittal' && (
            <div style={{ ...card, background: '#0A1628', marginBottom: 14 }}>
              <h3 style={{ color: GOLD, fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Transmittal Details</h3>
              {selected.transmittal_purposes && selected.transmittal_purposes.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <span style={label}>Purpose</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selected.transmittal_purposes.map(p => (
                      <span key={p} style={{
                        background: BORDER, color: TEXT, fontSize: 11, fontWeight: 600,
                        padding: '3px 10px', borderRadius: 6,
                      }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {selected.transmittal_items && selected.transmittal_items.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <span style={label}>Items Transmitted</span>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', color: DIM, padding: '4px 8px', borderBottom: `1px solid ${BORDER}` }}>Document</th>
                        <th style={{ textAlign: 'left', color: DIM, padding: '4px 8px', borderBottom: `1px solid ${BORDER}` }}>Rev</th>
                        <th style={{ textAlign: 'center', color: DIM, padding: '4px 8px', borderBottom: `1px solid ${BORDER}` }}>Copies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.transmittal_items.map((ti, idx) => (
                        <tr key={idx}>
                          <td style={{ color: TEXT, padding: '4px 8px', borderBottom: `1px solid ${BORDER}20` }}>{ti.document_name}</td>
                          <td style={{ color: BLUE, padding: '4px 8px', borderBottom: `1px solid ${BORDER}20` }}>{ti.revision}</td>
                          <td style={{ color: TEXT, padding: '4px 8px', borderBottom: `1px solid ${BORDER}20`, textAlign: 'center' }}>{ti.copies}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {selected.transmittal_remarks && (
                <div>
                  <span style={label}>Remarks</span>
                  <div style={{ color: TEXT, fontSize: 13, whiteSpace: 'pre-wrap' }}>{selected.transmittal_remarks}</div>
                </div>
              )}
            </div>
          )}

          {/* Reference links */}
          {selected.reference_links?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={label}>References</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selected.reference_links.map((ref, i) => (
                  <span key={i} style={{
                    background: BORDER, color: GOLD, fontSize: 12, fontWeight: 600,
                    padding: '3px 10px', borderRadius: 6,
                  }}>{ref}</span>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {selected.attachments?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={label}>Attachments ({selected.attachments.length})</span>
              {selected.attachments.map((att, i) => (
                <a key={i} href={att.url} download={att.name} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  background: '#0A1628', borderRadius: 8, marginBottom: 4,
                  border: `1px solid ${BORDER}`, textDecoration: 'none', cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 16 }}>{'\u{1F4CE}'}</span>
                  <span style={{ color: BLUE, fontSize: 13, fontWeight: 600, flex: 1 }}>{att.name}</span>
                  {att.size && <span style={{ color: DIM, fontSize: 11 }}>{formatFileSize(att.size)}</span>}
                  <span style={{ color: GOLD, fontSize: 11, fontWeight: 600 }}>Download</span>
                </a>
              ))}
            </div>
          )}

          {/* Read receipts */}
          {selected.request_read_receipt && (
            <div style={{ marginBottom: 14 }}>
              <span style={label}>{'\u{1F441}'} Read Receipts</span>
              {selected.read_receipts?.length > 0 ? (
                selected.read_receipts.map((rr, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                    borderBottom: i < selected.read_receipts.length - 1 ? `1px solid ${BORDER}20` : 'none',
                  }}>
                    <span style={{ color: GREEN, fontSize: 14 }}>{'\u2713'}</span>
                    <span style={{ color: TEXT, fontSize: 13 }}>{rr.user_name || rr.user_email}</span>
                    <span style={{ color: DIM, fontSize: 11, marginLeft: 'auto' }}>{formatDateTime(rr.read_at)}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: DIM, fontSize: 12, fontStyle: 'italic' }}>No read receipts yet.</div>
              )}
            </div>
          )}
        </div>

        {/* Thread / Replies */}
        {allInThread.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ color: GOLD, fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
              Thread ({allInThread.length} {allInThread.length === 1 ? 'reply' : 'replies'})
            </h3>
            {allInThread.map(reply => (
              <div key={reply.id} style={{
                ...card, marginLeft: 16, borderLeft: `3px solid ${GOLD}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{reply.from_name || reply.from_email}</span>
                  <span style={{ color: DIM, fontSize: 11 }}>{formatDateTime(reply.sent_at || reply.created_at)}</span>
                </div>
                <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{reply.body}</div>
                {reply.attachments?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {reply.attachments.map((att, i) => (
                      <a key={i} href={att.url} download style={{ color: BLUE, fontSize: 12, marginRight: 10, textDecoration: 'none' }}>
                        {'\u{1F4CE}'} {att.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reply / Forward form */}
        {replyMode && (
          <div style={{ ...card, borderTop: `2px solid ${GOLD}` }}>
            <h3 style={{ color: GOLD, fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>
              {replyMode === 'reply' ? 'Reply' : 'Forward'}
            </h3>
            {replyMode === 'forward' && (
              <div style={{ marginBottom: 10 }}>
                <span style={label}>Forward To</span>
                {forwardTo.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <input placeholder="Name" value={r.name}
                      onChange={e => updateRecipient(forwardTo, i, 'name', e.target.value, setForwardTo)}
                      style={{ ...input, flex: 1 }} />
                    <input placeholder="Email" value={r.email}
                      onChange={e => updateRecipient(forwardTo, i, 'email', e.target.value, setForwardTo)}
                      style={{ ...input, flex: 1 }} />
                    {forwardTo.length > 1 && (
                      <button onClick={() => removeRecipient(forwardTo, i, setForwardTo)}
                        style={{ ...btn(RED, true), padding: '6px 10px' }}>{'\u00D7'}</button>
                    )}
                  </div>
                ))}
                <button onClick={() => addRecipient(setForwardTo)} style={{ ...btn('transparent', true), color: GOLD, border: `1px solid ${GOLD}`, marginTop: 4 }}>
                  + Add Recipient
                </button>
              </div>
            )}
            <textarea
              placeholder={replyMode === 'reply' ? 'Type your reply...' : 'Add a message (optional)...'}
              value={replyBody} onChange={e => setReplyBody(e.target.value)}
              rows={5}
              style={{ ...input, resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleReplyForward} disabled={submitting || (!replyBody.trim() && replyMode === 'reply')}
                style={{ ...btn(GOLD), opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Sending...' : replyMode === 'reply' ? 'Send Reply' : 'Forward'}
              </button>
              <button onClick={() => setReplyMode(null)} style={btn(BORDER)}>Cancel</button>
            </div>
          </div>
        )}
      </>
    );
  };

  /* ─── CREATE VIEW ─── */
  const renderCreate = () => (
    <div style={card}>
      {/* Type selector */}
      <div style={{ marginBottom: 14 }}>
        <span style={label}>Type</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <button key={t} onClick={() => setFormType(t)} style={{
              ...btn(formType === t ? GOLD : BORDER, true),
              color: formType === t ? '#000' : DIM,
            }}>
              {typeIcon(t)} {t}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div style={{ marginBottom: 14 }}>
        <span style={label}>Priority</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['Normal', 'Urgent'] as Priority[]).map(p => (
            <button key={p} onClick={() => setFormPriority(p)} style={{
              ...btn(formPriority === p ? (p === 'Urgent' ? RED : BLUE) : BORDER, true),
              color: formPriority === p ? '#fff' : DIM,
            }}>
              {p === 'Urgent' ? '\u26A1 ' : ''}{p}
            </button>
          ))}
        </div>
      </div>

      {/* To */}
      <div style={{ marginBottom: 14 }}>
        <span style={label}>To</span>
        {formTo.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input placeholder="Name" value={r.name}
              onChange={e => updateRecipient(formTo, i, 'name', e.target.value, setFormTo)}
              style={{ ...input, flex: 1 }} />
            <input placeholder="Email" value={r.email} type="email"
              onChange={e => updateRecipient(formTo, i, 'email', e.target.value, setFormTo)}
              style={{ ...input, flex: 1 }} />
            {formTo.length > 1 && (
              <button onClick={() => removeRecipient(formTo, i, setFormTo)}
                style={{ ...btn(RED, true), padding: '6px 10px' }}>{'\u00D7'}</button>
            )}
          </div>
        ))}
        <button onClick={() => addRecipient(setFormTo)}
          style={{ ...btn('transparent', true), color: GOLD, border: `1px solid ${GOLD}`, marginTop: 4 }}>
          + Add Recipient
        </button>
      </div>

      {/* CC */}
      <div style={{ marginBottom: 14 }}>
        <span style={label}>CC (optional)</span>
        {formCc.length === 0 ? (
          <button onClick={() => addRecipient(setFormCc)}
            style={{ ...btn('transparent', true), color: DIM, border: `1px solid ${BORDER}` }}>
            + Add CC
          </button>
        ) : (
          <>
            {formCc.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input placeholder="Name" value={r.name}
                  onChange={e => updateRecipient(formCc, i, 'name', e.target.value, setFormCc)}
                  style={{ ...input, flex: 1 }} />
                <input placeholder="Email" value={r.email} type="email"
                  onChange={e => updateRecipient(formCc, i, 'email', e.target.value, setFormCc)}
                  style={{ ...input, flex: 1 }} />
                <button onClick={() => removeRecipient(formCc, i, setFormCc)}
                  style={{ ...btn(RED, true), padding: '6px 10px' }}>{'\u00D7'}</button>
              </div>
            ))}
            <button onClick={() => addRecipient(setFormCc)}
              style={{ ...btn('transparent', true), color: GOLD, border: `1px solid ${GOLD}`, marginTop: 4 }}>
              + Add CC
            </button>
          </>
        )}
      </div>

      {/* Subject */}
      <div style={{ marginBottom: 14 }}>
        <span style={label}>Subject</span>
        <input value={formSubject} onChange={e => setFormSubject(e.target.value)}
          placeholder="Enter subject line" style={input} />
      </div>

      {/* Body */}
      <div style={{ marginBottom: 14 }}>
        <span style={label}>Body</span>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <button onClick={() => setFormBody(prev => prev + '**bold**')}
            style={{ ...btn(BORDER, true), fontWeight: 800, fontSize: 13 }}>B</button>
          <button onClick={() => setFormBody(prev => prev + '_italic_')}
            style={{ ...btn(BORDER, true), fontStyle: 'italic', fontSize: 13 }}>I</button>
          <button onClick={() => setFormBody(prev => prev + '\n- ')}
            style={{ ...btn(BORDER, true), fontSize: 13 }}>{'\u2022'} List</button>
          <button onClick={() => setFormBody(prev => prev + '\n---\n')}
            style={{ ...btn(BORDER, true), fontSize: 13 }}>--- Line</button>
        </div>
        <textarea value={formBody} onChange={e => setFormBody(e.target.value)}
          rows={8} placeholder="Compose your correspondence..."
          style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7 }} />
      </div>

      {/* Transmittal-specific fields */}
      {formType === 'Transmittal' && (
        <div style={{ ...card, background: '#0A1628', marginBottom: 14 }}>
          <h3 style={{ color: GOLD, fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>Transmittal Details</h3>

          {/* Purpose checkboxes */}
          <div style={{ marginBottom: 12 }}>
            <span style={label}>Purpose</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {PURPOSES.map(p => (
                <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 5, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={formTransPurposes.includes(p)}
                    onChange={e => {
                      if (e.target.checked) setFormTransPurposes(prev => [...prev, p]);
                      else setFormTransPurposes(prev => prev.filter(x => x !== p));
                    }}
                    style={{ accentColor: GOLD }}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          {/* Items being transmitted */}
          <div style={{ marginBottom: 12 }}>
            <span style={label}>Items Being Transmitted</span>
            {formTransItems.map((ti, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input placeholder="Document name" value={ti.document_name}
                  onChange={e => {
                    const next = [...formTransItems];
                    next[idx] = { ...next[idx], document_name: e.target.value };
                    setFormTransItems(next);
                  }}
                  style={{ ...input, flex: 3 }} />
                <input placeholder="Rev" value={ti.revision}
                  onChange={e => {
                    const next = [...formTransItems];
                    next[idx] = { ...next[idx], revision: e.target.value };
                    setFormTransItems(next);
                  }}
                  style={{ ...input, flex: 1, maxWidth: 60 }} />
                <input type="number" min={1} value={ti.copies}
                  onChange={e => {
                    const next = [...formTransItems];
                    next[idx] = { ...next[idx], copies: parseInt(e.target.value) || 1 };
                    setFormTransItems(next);
                  }}
                  style={{ ...input, flex: 1, maxWidth: 60 }} />
                {formTransItems.length > 1 && (
                  <button onClick={() => setFormTransItems(prev => prev.filter((_, i) => i !== idx))}
                    style={{ ...btn(RED, true), padding: '6px 10px' }}>{'\u00D7'}</button>
                )}
              </div>
            ))}
            <button onClick={() => setFormTransItems(prev => [...prev, { document_name: '', revision: '', copies: 1 }])}
              style={{ ...btn('transparent', true), color: GOLD, border: `1px solid ${GOLD}`, marginTop: 4 }}>
              + Add Item
            </button>
          </div>

          {/* Remarks */}
          <div>
            <span style={label}>Remarks</span>
            <textarea value={formTransRemarks} onChange={e => setFormTransRemarks(e.target.value)}
              rows={3} placeholder="Additional remarks..."
              style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>
      )}

      {/* Attachments */}
      <div style={{ marginBottom: 14 }}>
        <span style={label}>Attachments</span>
        <input type="file" multiple
          onChange={e => {
            if (e.target.files) setFormAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
          }}
          style={{ color: DIM, fontSize: 13 }}
        />
        {formAttachments.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {formAttachments.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                background: '#0A1628', borderRadius: 6, marginBottom: 3,
              }}>
                <span style={{ color: TEXT, fontSize: 12, flex: 1 }}>{'\u{1F4CE}'} {f.name}</span>
                <span style={{ color: DIM, fontSize: 11 }}>{formatFileSize(f.size)}</span>
                <button onClick={() => setFormAttachments(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  {'\u00D7'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reference links */}
      <div style={{ marginBottom: 14 }}>
        <span style={label}>Reference Links (comma-separated, e.g. RFI#12, CO#3)</span>
        <input value={formRefLinks} onChange={e => setFormRefLinks(e.target.value)}
          placeholder="RFI#001, CO#005, Submittal#12" style={input} />
      </div>

      {/* Read receipt toggle */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div onClick={() => setFormReadReceipt(!formReadReceipt)} style={{
            width: 44, height: 24, borderRadius: 12, position: 'relative',
            background: formReadReceipt ? GOLD : BORDER, transition: 'background 0.2s',
            cursor: 'pointer', flexShrink: 0,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 10, background: '#fff',
              position: 'absolute', top: 2,
              left: formReadReceipt ? 22 : 2, transition: 'left 0.2s',
            }} />
          </div>
          <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>Request Read Receipt</span>
        </label>
      </div>

      {/* Submit message */}
      {submitMsg && (
        <div style={{
          padding: '8px 14px', borderRadius: 8, marginBottom: 12,
          background: submitMsg.includes('Failed') || submitMsg.includes('required') ? `${RED}20` : `${GREEN}20`,
          color: submitMsg.includes('Failed') || submitMsg.includes('required') ? RED : GREEN,
          fontSize: 13, fontWeight: 600,
        }}>
          {submitMsg}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => handleSubmit(false)} disabled={submitting}
          style={{ ...btn(GOLD), flex: 1, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Sending...' : '\u2709 Send'}
        </button>
        <button onClick={() => handleSubmit(true)} disabled={submitting}
          style={{ ...btn(BORDER), opacity: submitting ? 0.6 : 1 }}>
          Save Draft
        </button>
      </div>
    </div>
  );

  /* ─── Main render ─── */
  return (
    <div style={{ minHeight: '100vh', background: '#080F1A', padding: '16px 12px 80px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {renderHeader()}
        {view === 'list' && renderList()}
        {view === 'detail' && renderDetail()}
        {view === 'create' && renderCreate()}
      </div>
    </div>
  );
}

/* ─── Suspense wrapper ─── */
export default function CorrespondencePageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080F1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#8BAAC8', fontSize: 16 }}>Loading Correspondence...</div>
      </div>
    }>
      <CorrespondencePage />
    </Suspense>
  );
}
