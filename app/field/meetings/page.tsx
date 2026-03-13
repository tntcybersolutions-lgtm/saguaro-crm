'use client';
/**
 * Saguaro Field — Meeting Minutes
 * Full meeting lifecycle: schedule, conduct minutes, track action items.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import EmailComposer from '@/components/EmailComposer';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

/* ── Types ── */
type MeetingType = 'OAC' | 'Subcontractor' | 'Safety' | 'Preconstruction' | 'Closeout' | 'Custom';
type MeetingStatus = 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
type ActionStatus = 'Open' | 'In Progress' | 'Complete';
type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
type RecurFreq = 'none' | 'weekly' | 'biweekly' | 'monthly';
type View = 'list' | 'create' | 'edit' | 'detail' | 'minutes' | 'actions';

interface Attendee {
  id: string;
  name: string;
  company: string;
  email: string;
  role: string;
  present: boolean;
}

interface AgendaItem {
  id: string;
  order: number;
  title: string;
  notes: string;
  duration_minutes: number;
  decisions: Decision[];
  action_items: ActionItem[];
}

interface Decision {
  id: string;
  description: string;
  vote: 'Approved' | 'Rejected' | 'Tabled';
  moved_by: string;
  seconded_by: string;
}

interface ActionItem {
  id: string;
  description: string;
  assignee: string;
  due_date: string;
  priority: Priority;
  status: ActionStatus;
  meeting_id: string;
  agenda_item_id: string;
  created_at: string;
}

interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  status: MeetingStatus;
  date: string;
  time: string;
  location: string;
  recurring: RecurFreq;
  series_id?: string;
  attendees: Attendee[];
  agenda: AgendaItem[];
  general_notes: string;
  created_at: string;
  updated_at: string;
}

const MEETING_TYPES: MeetingType[] = ['OAC', 'Subcontractor', 'Safety', 'Preconstruction', 'Closeout', 'Custom'];
const STATUSES: MeetingStatus[] = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];
const ACTION_STATUSES: ActionStatus[] = ['Open', 'In Progress', 'Complete'];
const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Critical'];

function uid(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d: string, t: string): string {
  if (!d) return '—';
  const date = new Date(d + 'T' + (t || '09:00'));
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    + ' at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function statusColor(s: MeetingStatus): string {
  if (s === 'Scheduled') return BLUE;
  if (s === 'In Progress') return AMBER;
  if (s === 'Completed') return GREEN;
  if (s === 'Cancelled') return DIM;
  return DIM;
}

function typeColor(t: MeetingType): string {
  if (t === 'OAC') return GOLD;
  if (t === 'Subcontractor') return BLUE;
  if (t === 'Safety') return RED;
  if (t === 'Preconstruction') return AMBER;
  if (t === 'Closeout') return GREEN;
  return DIM;
}

function priorityColor(p: Priority): string {
  if (p === 'Critical') return RED;
  if (p === 'High') return AMBER;
  if (p === 'Medium') return BLUE;
  return DIM;
}

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function emptyMeeting(): Omit<Meeting, 'id' | 'created_at' | 'updated_at'> {
  return {
    title: '', type: 'OAC', status: 'Scheduled', date: '', time: '09:00',
    location: '', recurring: 'none', attendees: [], agenda: [], general_notes: '',
  };
}

function emptyAgenda(): AgendaItem {
  return { id: uid(), order: 0, title: '', notes: '', duration_minutes: 10, decisions: [], action_items: [] };
}

function emptyAttendee(): Attendee {
  return { id: uid(), name: '', company: '', email: '', role: '', present: false };
}

/* ── Shared style helpers ── */
const cardStyle: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, marginBottom: 12,
};

const btnStyle = (bg: string, small = false): React.CSSProperties => ({
  background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: small ? '6px 12px' : '10px 18px',
  cursor: 'pointer', fontWeight: 600, fontSize: small ? 13 : 14, display: 'inline-flex', alignItems: 'center', gap: 6,
});

const inputStyle: React.CSSProperties = {
  background: '#0A1929', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px',
  color: TEXT, fontSize: 14, width: '100%', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' as const };

const labelStyle: React.CSSProperties = { color: DIM, fontSize: 13, marginBottom: 4, display: 'block', fontWeight: 600 };

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
  background: active ? GOLD : 'transparent', color: active ? '#000' : DIM,
  transition: 'all .15s',
});

const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', background: `${color}22`, color, fontSize: 11, fontWeight: 700,
  padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' as const, letterSpacing: 0.5,
});

const exportPDF = (title: string, content: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 24px; border-bottom: 2px solid #D4A017; padding-bottom: 8px; }
        h2 { font-size: 18px; color: #333; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 600; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .meta { color: #666; font-size: 13px; }
        .section { margin: 16px 0; padding: 12px; border: 1px solid #eee; border-radius: 8px; }
        img { max-width: 300px; margin: 4px; border-radius: 4px; }
        .signature { max-width: 200px; border: 1px solid #ddd; border-radius: 4px; padding: 4px; }
        .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; }
        .present { color: #16a34a; } .absent { color: #dc2626; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      ${content}
      <div class="footer">
        <p>Generated by Saguaro Control &middot; ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
};

const PdfIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={12} y1={18} x2={12} y2={12}/><polyline points="9 15 12 12 15 15"/>
  </svg>
);

/* ── Main Component ── */
function MeetingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  // List filters
  const [filterType, setFilterType] = useState<MeetingType | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<MeetingStatus | 'All'>('All');
  const [search, setSearch] = useState('');

  // Form state
  const [form, setForm] = useState(emptyMeeting());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Minutes state
  const [activeAgendaIdx, setActiveAgendaIdx] = useState(0);

  // Action items tab filters
  const [actionFilterAssignee, setActionFilterAssignee] = useState('All');
  const [actionFilterStatus, setActionFilterStatus] = useState<ActionStatus | 'All' | 'Overdue'>('All');

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllMeetings = () => setSelectedIds(new Set(filtered.map(m => m.id)));
  const deselectAllMeetings = () => setSelectedIds(new Set());

  const handleBulkEmailMinutes = async () => {
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        if (!online) throw new Error('offline');
        await fetch(`/api/projects/${projectId}/meetings/${id}/email`, { method: 'POST' });
      } catch {
        await enqueue({
          url: `/api/projects/${projectId}/meetings/${id}/email`,
          method: 'POST',
          body: null,
          contentType: 'application/json',
          isFormData: false,
        });
      }
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkProcessing(false);
    setSaveMsg(`Minutes emailed for ${ids.length} meeting(s)`);
    setTimeout(() => setSaveMsg(''), 3500);
  };

  const handleBulkCancelMeetings = async () => {
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const meeting = meetings.find(m => m.id === id);
      if (meeting) {
        const updated = { ...meeting, status: 'Cancelled' as MeetingStatus, updated_at: new Date().toISOString() };
        try {
          if (!online) throw new Error('offline');
          await fetch(`/api/projects/${projectId}/meetings/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
          });
        } catch {
          await enqueue({
            url: `/api/projects/${projectId}/meetings/${id}`,
            method: 'PATCH',
            body: JSON.stringify(updated),
            contentType: 'application/json',
            isFormData: false,
          });
        }
      }
    }
    setMeetings(prev => prev.map(m => ids.includes(m.id) ? { ...m, status: 'Cancelled' as MeetingStatus, updated_at: new Date().toISOString() } : m));
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkProcessing(false);
    setSaveMsg(`${ids.length} meeting(s) cancelled`);
    setTimeout(() => setSaveMsg(''), 3500);
  };

  const handleBulkExportMeetings = async () => {
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/meetings/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_ids: ids }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meetings-export-${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setSaveMsg(`${ids.length} meeting(s) exported`);
      } else {
        setSaveMsg('Export failed');
      }
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/meetings/export`,
        method: 'POST',
        body: JSON.stringify({ meeting_ids: ids }),
        contentType: 'application/json',
        isFormData: false,
      });
      setSaveMsg('Export queued — will download when online');
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkProcessing(false);
    setTimeout(() => setSaveMsg(''), 3500);
  };

  /* ── Data fetch ── */
  const fetchMeetings = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/meetings`);
      if (res.ok) { const data = await res.json(); setMeetings(Array.isArray(data) ? data : data.meetings || []); }
    } catch { /* offline */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);
  useEffect(() => {
    const h1 = () => setOnline(true);
    const h2 = () => setOnline(false);
    window.addEventListener('online', h1);
    window.addEventListener('offline', h2);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', h1); window.removeEventListener('offline', h2); };
  }, []);

  /* ── Filtered list ── */
  const filtered = meetings
    .filter(m => filterType === 'All' || m.type === filterType)
    .filter(m => filterStatus === 'All' || m.status === filterStatus)
    .filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  /* ── Stats ── */
  const now = new Date();
  const totalMeetings = meetings.length;
  const upcomingMeetings = meetings.filter(m => m.status === 'Scheduled' && new Date(m.date) >= now).length;
  const completedThisMonth = meetings.filter(m => {
    if (m.status !== 'Completed') return false;
    const d = new Date(m.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  /* ── All action items across meetings ── */
  const allActionItems: (ActionItem & { meetingTitle: string })[] = meetings.flatMap(m =>
    m.agenda?.flatMap(a => (a.action_items || []).map(ai => ({ ...ai, meetingTitle: m.title, meeting_id: m.id }))) || []
  );

  const allAssignees = [...new Set(allActionItems.map(a => a.assignee).filter(Boolean))];

  const filteredActions = allActionItems
    .filter(a => actionFilterAssignee === 'All' || a.assignee === actionFilterAssignee)
    .filter(a => {
      if (actionFilterStatus === 'All') return true;
      if (actionFilterStatus === 'Overdue') return a.status !== 'Complete' && isOverdue(a.due_date);
      return a.status === actionFilterStatus;
    });

  /* ── Series navigation ── */
  const seriesMeetings = selectedMeeting?.series_id
    ? meetings.filter(m => m.series_id === selectedMeeting.series_id).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];
  const seriesIdx = seriesMeetings.findIndex(m => m.id === selectedMeeting?.id);
  const prevMeeting = seriesIdx > 0 ? seriesMeetings[seriesIdx - 1] : null;
  const nextMeeting = seriesIdx < seriesMeetings.length - 1 ? seriesMeetings[seriesIdx + 1] : null;

  /* ── Handlers ── */
  const handleCreate = async () => {
    setSaving(true); setSaveMsg('');
    const meeting: Meeting = {
      ...form, id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      series_id: form.recurring !== 'none' ? uid() : undefined,
    } as Meeting;
    if (online) {
      try {
        const res = await fetch(`/api/projects/${projectId}/meetings`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meeting),
        });
        if (res.ok) { setSaveMsg('Meeting created'); await fetchMeetings(); setTimeout(() => setView('list'), 600); }
        else setSaveMsg('Error creating meeting');
      } catch { setSaveMsg('Network error'); }
    } else {
      await enqueue({ url: `/api/projects/${projectId}/meetings`, method: 'POST', body: JSON.stringify(meeting), contentType: 'application/json', isFormData: false });
      setMeetings(prev => [meeting, ...prev]);
      setSaveMsg('Saved offline — will sync');
      setTimeout(() => setView('list'), 600);
    }
    setSaving(false);
  };

  const handleUpdate = async (meeting: Meeting) => {
    const updated = { ...meeting, updated_at: new Date().toISOString() };
    if (online) {
      try {
        await fetch(`/api/projects/${projectId}/meetings/${meeting.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated),
        });
      } catch { /* silent */ }
    } else {
      await enqueue({ url: `/api/projects/${projectId}/meetings/${meeting.id}`, method: 'PATCH', body: JSON.stringify(updated), contentType: 'application/json', isFormData: false });
    }
    setMeetings(prev => prev.map(m => m.id === meeting.id ? updated : m));
    setSelectedMeeting(updated);
  };

  const handleEmailMinutes = async (meetingId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meetingId}/email`, { method: 'POST' });
      if (res.ok) alert('Minutes emailed successfully');
      else alert('Failed to email minutes');
    } catch { alert('Network error — could not send'); }
  };

  const openDetail = (m: Meeting) => { setSelectedMeeting(m); setView('detail'); };
  const openMinutes = (m: Meeting) => { setSelectedMeeting(m); setActiveAgendaIdx(0); setView('minutes'); };
  const openEdit = (m: Meeting) => {
    setSelectedMeeting(m);
    setForm({ title: m.title, type: m.type, status: m.status, date: m.date, time: m.time, location: m.location, recurring: m.recurring, attendees: m.attendees, agenda: m.agenda, general_notes: m.general_notes });
    setView('edit');
  };

  const openCreate = () => { setForm(emptyMeeting()); setSaveMsg(''); setView('create'); };

  const handleSaveEdit = async () => {
    if (!selectedMeeting) return;
    setSaving(true); setSaveMsg('');
    const updated: Meeting = { ...selectedMeeting, ...form, updated_at: new Date().toISOString() };
    await handleUpdate(updated);
    setSaveMsg('Meeting updated');
    setSaving(false);
    setTimeout(() => { setView('detail'); }, 500);
  };

  /* ── Agenda helpers ── */
  const addAgendaItem = () => {
    const item = emptyAgenda();
    item.order = form.agenda.length;
    setForm({ ...form, agenda: [...form.agenda, item] });
  };
  const removeAgendaItem = (idx: number) => {
    const next = form.agenda.filter((_, i) => i !== idx).map((a, i) => ({ ...a, order: i }));
    setForm({ ...form, agenda: next });
  };
  const moveAgenda = (idx: number, dir: -1 | 1) => {
    const arr = [...form.agenda];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    setForm({ ...form, agenda: arr.map((a, i) => ({ ...a, order: i })) });
  };
  const updateAgendaField = (idx: number, field: keyof AgendaItem, value: any) => {
    const arr = [...form.agenda];
    (arr[idx] as any)[field] = value;
    setForm({ ...form, agenda: arr });
  };

  /* ── Attendee helpers ── */
  const addAttendee = () => setForm({ ...form, attendees: [...form.attendees, emptyAttendee()] });
  const removeAttendee = (idx: number) => setForm({ ...form, attendees: form.attendees.filter((_, i) => i !== idx) });
  const updateAttendee = (idx: number, field: keyof Attendee, value: any) => {
    const arr = [...form.attendees];
    (arr[idx] as any)[field] = value;
    setForm({ ...form, attendees: arr });
  };

  /* ── Minutes helpers — work on selectedMeeting directly ── */
  const updateMinutesAgenda = (agendaIdx: number, field: keyof AgendaItem, value: any) => {
    if (!selectedMeeting) return;
    const agenda = [...selectedMeeting.agenda];
    (agenda[agendaIdx] as any)[field] = value;
    setSelectedMeeting({ ...selectedMeeting, agenda });
  };

  const addMinutesAction = (agendaIdx: number) => {
    if (!selectedMeeting) return;
    const agenda = [...selectedMeeting.agenda];
    const ai: ActionItem = {
      id: uid(), description: '', assignee: '', due_date: '', priority: 'Medium', status: 'Open',
      meeting_id: selectedMeeting.id, agenda_item_id: agenda[agendaIdx].id, created_at: new Date().toISOString(),
    };
    agenda[agendaIdx] = { ...agenda[agendaIdx], action_items: [...(agenda[agendaIdx].action_items || []), ai] };
    setSelectedMeeting({ ...selectedMeeting, agenda });
  };

  const updateMinutesAction = (agendaIdx: number, actionIdx: number, field: keyof ActionItem, value: any) => {
    if (!selectedMeeting) return;
    const agenda = [...selectedMeeting.agenda];
    const actions = [...(agenda[agendaIdx].action_items || [])];
    (actions[actionIdx] as any)[field] = value;
    agenda[agendaIdx] = { ...agenda[agendaIdx], action_items: actions };
    setSelectedMeeting({ ...selectedMeeting, agenda });
  };

  const removeMinutesAction = (agendaIdx: number, actionIdx: number) => {
    if (!selectedMeeting) return;
    const agenda = [...selectedMeeting.agenda];
    agenda[agendaIdx] = { ...agenda[agendaIdx], action_items: (agenda[agendaIdx].action_items || []).filter((_, i) => i !== actionIdx) };
    setSelectedMeeting({ ...selectedMeeting, agenda });
  };

  const addDecision = (agendaIdx: number) => {
    if (!selectedMeeting) return;
    const agenda = [...selectedMeeting.agenda];
    const d: Decision = { id: uid(), description: '', vote: 'Approved', moved_by: '', seconded_by: '' };
    agenda[agendaIdx] = { ...agenda[agendaIdx], decisions: [...(agenda[agendaIdx].decisions || []), d] };
    setSelectedMeeting({ ...selectedMeeting, agenda });
  };

  const updateDecision = (agendaIdx: number, decIdx: number, field: keyof Decision, value: any) => {
    if (!selectedMeeting) return;
    const agenda = [...selectedMeeting.agenda];
    const decs = [...(agenda[agendaIdx].decisions || [])];
    (decs[decIdx] as any)[field] = value;
    agenda[agendaIdx] = { ...agenda[agendaIdx], decisions: decs };
    setSelectedMeeting({ ...selectedMeeting, agenda });
  };

  const removeDecision = (agendaIdx: number, decIdx: number) => {
    if (!selectedMeeting) return;
    const agenda = [...selectedMeeting.agenda];
    agenda[agendaIdx] = { ...agenda[agendaIdx], decisions: (agenda[agendaIdx].decisions || []).filter((_, i) => i !== decIdx) };
    setSelectedMeeting({ ...selectedMeeting, agenda });
  };

  const toggleAttendance = (attIdx: number) => {
    if (!selectedMeeting) return;
    const attendees = [...selectedMeeting.attendees];
    attendees[attIdx] = { ...attendees[attIdx], present: !attendees[attIdx].present };
    setSelectedMeeting({ ...selectedMeeting, attendees });
  };

  const saveMinutes = async () => {
    if (!selectedMeeting) return;
    setSaving(true);
    await handleUpdate(selectedMeeting);
    setSaving(false);
    setSaveMsg('Minutes saved');
    setTimeout(() => setSaveMsg(''), 2000);
  };

  const completeMinutes = async () => {
    if (!selectedMeeting) return;
    const updated = { ...selectedMeeting, status: 'Completed' as MeetingStatus };
    await handleUpdate(updated);
    setView('detail');
  };

  const startMeeting = async (m: Meeting) => {
    const updated = { ...m, status: 'In Progress' as MeetingStatus };
    await handleUpdate(updated);
    openMinutes(updated);
  };

  const cancelMeeting = async (m: Meeting) => {
    const updated = { ...m, status: 'Cancelled' as MeetingStatus };
    await handleUpdate(updated);
  };

  /* ── Render helpers ── */
  const renderHeader = (title: string, backView?: View) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      {backView && (
        <button onClick={() => setView(backView)} style={btnStyle('transparent', true)}>
          <span style={{ fontSize: 18 }}>&#8592;</span>
        </button>
      )}
      <h1 style={{ color: GOLD, fontSize: 22, fontWeight: 700, margin: 0, flex: 1 }}>{title}</h1>
      {!online && <span style={badgeStyle(AMBER)}>Offline</span>}
    </div>
  );

  /* ── LIST VIEW ── */
  const renderList = () => (
    <div>
      {renderHeader('Meeting Minutes')}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total', value: totalMeetings, color: BLUE },
          { label: 'Upcoming', value: upcomingMeetings, color: AMBER },
          { label: 'Completed (Month)', value: completedThisMonth, color: GREEN },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, textAlign: 'center' as const, padding: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs: Meetings | Action Items */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#0A1929', borderRadius: 10, padding: 4 }}>
        <button onClick={() => setView('list')} style={tabStyle(view === 'list')}>Meetings</button>
        <button onClick={() => setView('actions')} style={tabStyle(false)}>Action Items</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const }}>
        <input
          placeholder="Search meetings..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value as any)} style={{ ...selectStyle, width: 'auto', minWidth: 100 }}>
          <option value="All">All Types</option>
          {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} style={{ ...selectStyle, width: 'auto', minWidth: 110 }}>
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Select mode & New meeting buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {filtered.length > 0 && (
          <button onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }} style={{
            ...btnStyle(selectMode ? AMBER : BORDER), flex: selectMode ? 0 : undefined,
            color: selectMode ? '#000' : DIM,
          }}>
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        )}
        <button onClick={openCreate} style={{ ...btnStyle(GOLD), flex: 1, justifyContent: 'center', color: '#000' }}>
          + New Meeting
        </button>
      </div>

      {selectMode && filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <button onClick={selectedIds.size === filtered.length ? deselectAllMeetings : selectAllMeetings} style={{
            ...btnStyle(GOLD, true), color: '#000',
          }}>
            {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
          </button>
          <span style={{ fontSize: 12, color: DIM }}>{selectedIds.size} selected</span>
        </div>
      )}

      {saveMsg && (
        <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600 }}>
          {saveMsg}
        </div>
      )}

      {/* Meetings list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading meetings...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>No meetings found</div>
      ) : (
        filtered.map(m => {
          const isChecked = selectedIds.has(m.id);
          return (
            <div key={m.id} onClick={() => selectMode ? toggleSelectId(m.id) : openDetail(m)} style={{
              ...cardStyle, cursor: 'pointer', transition: 'border-color .15s',
              borderColor: isChecked ? GOLD : BORDER,
              background: isChecked ? 'rgba(212,160,23,.05)' : RAISED,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                {selectMode && (
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, border: `2px solid ${isChecked ? GOLD : BORDER}`,
                    background: isChecked ? GOLD : 'transparent', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, marginRight: 10, marginTop: 2,
                  }}>
                    {isChecked && <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{m.title}</div>
                  <div style={{ color: DIM, fontSize: 12 }}>{formatDateTime(m.date, m.time)}</div>
                  {m.location && <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>{m.location}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 6 }}>
                  <span style={badgeStyle(typeColor(m.type))}>{m.type}</span>
                  <span style={badgeStyle(statusColor(m.status))}>{m.status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: DIM }}>
                <span>{m.attendees?.length || 0} attendees</span>
                <span>{m.agenda?.length || 0} agenda items</span>
                {m.recurring !== 'none' && <span style={{ color: AMBER }}>Recurring ({m.recurring})</span>}
                <span>{(m.agenda || []).reduce((sum, a) => sum + (a.action_items?.length || 0), 0)} action items</span>
              </div>
            </div>
          );
        })
      )}

      {/* Bulk Action Bar */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, background: '#0A1929',
          borderTop: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', gap: 8,
          justifyContent: 'center', zIndex: 100,
        }}>
          <button onClick={() => handleBulkEmailMinutes()} disabled={bulkProcessing} style={{
            background: 'rgba(59,130,246,.15)', border: `1px solid rgba(59,130,246,.3)`, borderRadius: 10,
            padding: '10px 14px', color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1,
          }}>
            Email Minutes ({selectedIds.size})
          </button>
          <button onClick={() => setConfirmDialog({
            title: 'Cancel Selected Meetings',
            message: `Are you sure you want to cancel ${selectedIds.size} meeting(s)? This cannot be undone.`,
            action: handleBulkCancelMeetings,
          })} disabled={bulkProcessing} style={{
            background: 'rgba(239,68,68,.15)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: 10,
            padding: '10px 14px', color: RED, fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1,
          }}>
            Cancel ({selectedIds.size})
          </button>
          <button onClick={() => handleBulkExportMeetings()} disabled={bulkProcessing} style={{
            background: 'rgba(212,160,23,.15)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 10,
            padding: '10px 14px', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1,
          }}>
            Export ({selectedIds.size})
          </button>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
        }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: TEXT }}>{confirmDialog.title}</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: DIM, lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDialog(null)} style={{
                ...btnStyle('transparent'), flex: 1, justifyContent: 'center', border: `1px solid ${BORDER}`, color: DIM,
              }}>Cancel</button>
              <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} disabled={bulkProcessing} style={{
                ...btnStyle(RED), flex: 1, justifyContent: 'center',
              }}>{bulkProcessing ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* ── ACTIONS TAB ── */
  const renderActionsTab = () => (
    <div>
      {renderHeader('Meeting Minutes')}

      {/* Stats (same row) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total', value: totalMeetings, color: BLUE },
          { label: 'Upcoming', value: upcomingMeetings, color: AMBER },
          { label: 'Completed (Month)', value: completedThisMonth, color: GREEN },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, textAlign: 'center' as const, padding: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#0A1929', borderRadius: 10, padding: 4 }}>
        <button onClick={() => setView('list')} style={tabStyle(false)}>Meetings</button>
        <button onClick={() => setView('actions')} style={tabStyle(true)}>Action Items</button>
      </div>

      {/* Action filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <select value={actionFilterAssignee} onChange={e => setActionFilterAssignee(e.target.value)} style={{ ...selectStyle, width: 'auto', minWidth: 120 }}>
          <option value="All">All Assignees</option>
          {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={actionFilterStatus} onChange={e => setActionFilterStatus(e.target.value as any)} style={{ ...selectStyle, width: 'auto', minWidth: 120 }}>
          <option value="All">All Statuses</option>
          {ACTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="Overdue">Overdue</option>
        </select>
      </div>

      {/* Summary counts */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <span style={badgeStyle(BLUE)}>{allActionItems.filter(a => a.status === 'Open').length} Open</span>
        <span style={badgeStyle(AMBER)}>{allActionItems.filter(a => a.status === 'In Progress').length} In Progress</span>
        <span style={badgeStyle(GREEN)}>{allActionItems.filter(a => a.status === 'Complete').length} Complete</span>
        <span style={badgeStyle(RED)}>{allActionItems.filter(a => a.status !== 'Complete' && a.due_date && isOverdue(a.due_date)).length} Overdue</span>
      </div>

      {filteredActions.length === 0 ? (
        <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>No action items found</div>
      ) : (
        filteredActions.map(a => {
          const overdue = a.status !== 'Complete' && a.due_date && isOverdue(a.due_date);
          return (
            <div key={a.id} style={{ ...cardStyle, borderLeft: `4px solid ${overdue ? RED : priorityColor(a.priority)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ color: TEXT, fontWeight: 600, fontSize: 14, flex: 1 }}>{a.description || '(No description)'}</div>
                <span style={badgeStyle(a.status === 'Complete' ? GREEN : a.status === 'In Progress' ? AMBER : BLUE)}>{a.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: DIM, flexWrap: 'wrap' as const }}>
                {a.assignee && <span>Assignee: {a.assignee}</span>}
                {a.due_date && <span style={{ color: overdue ? RED : DIM }}>Due: {formatDate(a.due_date)} {overdue ? '(OVERDUE)' : ''}</span>}
                <span>Priority: <span style={{ color: priorityColor(a.priority) }}>{a.priority}</span></span>
                <span>Meeting: {a.meetingTitle}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  /* ── CREATE / EDIT FORM ── */
  const renderForm = (isEdit: boolean) => (
    <div>
      {renderHeader(isEdit ? 'Edit Meeting' : 'New Meeting', isEdit ? 'detail' : 'list')}

      <div style={cardStyle}>
        {/* Title */}
        <label style={labelStyle}>Meeting Title *</label>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ ...inputStyle, marginBottom: 14 }} placeholder="e.g. Weekly OAC Meeting #12" />

        {/* Type */}
        <label style={labelStyle}>Meeting Type</label>
        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as MeetingType })} style={{ ...selectStyle, marginBottom: 14 }}>
          {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Date & Time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Date *</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Time</label>
            <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} style={inputStyle} />
          </div>
        </div>

        {/* Location */}
        <label style={labelStyle}>Location</label>
        <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} style={{ ...inputStyle, marginBottom: 14 }} placeholder="e.g. Jobsite Trailer, Room 201" />

        {/* Recurring */}
        <label style={labelStyle}>Recurring</label>
        <select value={form.recurring} onChange={e => setForm({ ...form, recurring: e.target.value as RecurFreq })} style={{ ...selectStyle, marginBottom: 14 }}>
          <option value="none">Not Recurring</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {/* Attendees */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ color: TEXT, margin: 0, fontSize: 16, fontWeight: 700 }}>Attendees</h3>
          <button onClick={addAttendee} style={btnStyle(BLUE, true)}>+ Add</button>
        </div>
        {form.attendees.length === 0 && <div style={{ color: DIM, fontSize: 13 }}>No attendees added yet</div>}
        {form.attendees.map((att, idx) => (
          <div key={att.id} style={{ background: '#0A1929', borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input placeholder="Name" value={att.name} onChange={e => updateAttendee(idx, 'name', e.target.value)} style={inputStyle} />
              <input placeholder="Company" value={att.company} onChange={e => updateAttendee(idx, 'company', e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input placeholder="Email" value={att.email} onChange={e => updateAttendee(idx, 'email', e.target.value)} style={inputStyle} />
              <input placeholder="Role" value={att.role} onChange={e => updateAttendee(idx, 'role', e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={att.present} onChange={() => updateAttendee(idx, 'present', !att.present)} />
                Present
              </label>
              <button onClick={() => removeAttendee(idx)} style={{ ...btnStyle(RED, true), fontSize: 12 }}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      {/* Agenda */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ color: TEXT, margin: 0, fontSize: 16, fontWeight: 700 }}>Agenda</h3>
          <button onClick={addAgendaItem} style={btnStyle(BLUE, true)}>+ Add Item</button>
        </div>
        {form.agenda.length === 0 && <div style={{ color: DIM, fontSize: 13 }}>No agenda items — add items to discuss</div>}
        {form.agenda.map((item, idx) => (
          <div key={item.id} style={{ background: '#0A1929', borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: GOLD, fontWeight: 800, fontSize: 16, minWidth: 28 }}>{idx + 1}.</span>
              <input
                placeholder="Agenda item title"
                value={item.title}
                onChange={e => updateAgendaField(idx, 'title', e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="number"
                min={1}
                value={item.duration_minutes}
                onChange={e => updateAgendaField(idx, 'duration_minutes', parseInt(e.target.value) || 1)}
                style={{ ...inputStyle, width: 60, textAlign: 'center' as const }}
                title="Duration (min)"
              />
              <span style={{ color: DIM, fontSize: 11 }}>min</span>
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button onClick={() => moveAgenda(idx, -1)} disabled={idx === 0} style={{ ...btnStyle(BORDER, true), opacity: idx === 0 ? 0.3 : 1 }} title="Move up">&#9650;</button>
              <button onClick={() => moveAgenda(idx, 1)} disabled={idx === form.agenda.length - 1} style={{ ...btnStyle(BORDER, true), opacity: idx === form.agenda.length - 1 ? 0.3 : 1 }} title="Move down">&#9660;</button>
              <button onClick={() => removeAgendaItem(idx)} style={btnStyle(RED, true)}>&#10005;</button>
            </div>
          </div>
        ))}
      </div>

      {/* Save */}
      <button
        onClick={isEdit ? handleSaveEdit : handleCreate}
        disabled={saving || !form.title || !form.date}
        style={{ ...btnStyle(GOLD), width: '100%', justifyContent: 'center', color: '#000', opacity: (saving || !form.title || !form.date) ? 0.5 : 1, marginBottom: 8 }}
      >
        {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Meeting'}
      </button>
      {saveMsg && <div style={{ textAlign: 'center', color: GREEN, fontSize: 13, marginTop: 4 }}>{saveMsg}</div>}
    </div>
  );

  /* ── DETAIL VIEW ── */
  const renderDetail = () => {
    if (!selectedMeeting) return null;
    const m = selectedMeeting;
    const totalActions = (m.agenda || []).reduce((sum, a) => sum + (a.action_items?.length || 0), 0);
    const completedActions = (m.agenda || []).reduce((sum, a) => sum + (a.action_items || []).filter(ai => ai.status === 'Complete').length, 0);
    const presentCount = (m.attendees || []).filter(a => a.present).length;

    return (
      <div>
        {renderHeader(m.title, 'list')}

        {/* Series navigation */}
        {seriesMeetings.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#0A1929', borderRadius: 10 }}>
            <button
              onClick={() => prevMeeting && openDetail(prevMeeting)}
              disabled={!prevMeeting}
              style={{ ...btnStyle(BORDER, true), opacity: prevMeeting ? 1 : 0.3 }}
            >&#8592; Previous</button>
            <span style={{ color: DIM, fontSize: 12 }}>Meeting {seriesIdx + 1} of {seriesMeetings.length}</span>
            <button
              onClick={() => nextMeeting && openDetail(nextMeeting)}
              disabled={!nextMeeting}
              style={{ ...btnStyle(BORDER, true), opacity: nextMeeting ? 1 : 0.3 }}
            >Next &#8594;</button>
          </div>
        )}

        {/* Header card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <span style={badgeStyle(typeColor(m.type))}>{m.type}</span>
              <span style={{ ...badgeStyle(statusColor(m.status)), marginLeft: 8 }}>{m.status}</span>
            </div>
            {m.recurring !== 'none' && <span style={badgeStyle(AMBER)}>Recurring ({m.recurring})</span>}
          </div>
          <div style={{ color: DIM, fontSize: 13, marginBottom: 4 }}>{formatDateTime(m.date, m.time)}</div>
          {m.location && <div style={{ color: DIM, fontSize: 13 }}>Location: {m.location}</div>}
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
          <div style={{ ...cardStyle, textAlign: 'center' as const, padding: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: BLUE }}>{presentCount}/{(m.attendees || []).length}</div>
            <div style={{ fontSize: 11, color: DIM }}>Attended</div>
          </div>
          <div style={{ ...cardStyle, textAlign: 'center' as const, padding: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: AMBER }}>{totalActions}</div>
            <div style={{ fontSize: 11, color: DIM }}>Action Items</div>
          </div>
          <div style={{ ...cardStyle, textAlign: 'center' as const, padding: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: GREEN }}>{completedActions}</div>
            <div style={{ fontSize: 11, color: DIM }}>Completed</div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
          {m.status === 'Scheduled' && (
            <button onClick={() => startMeeting(m)} style={btnStyle(GREEN, true)}>Start Meeting</button>
          )}
          {m.status === 'In Progress' && (
            <button onClick={() => openMinutes(m)} style={btnStyle(AMBER, true)}>Continue Minutes</button>
          )}
          <button onClick={() => openEdit(m)} style={btnStyle(BLUE, true)}>Edit</button>
          <button onClick={() => setShowEmail(true)} style={btnStyle(GOLD, true)}>Email Minutes</button>
          <button onClick={() => {
            const attendeesHtml = (m.attendees || []).map(a =>
              `<tr><td class="${a.present ? 'present' : 'absent'}">${a.present ? 'Present' : 'Absent'}</td><td>${a.name}</td><td>${a.company || '—'}</td><td>${a.role || '—'}</td><td>${a.email || '—'}</td></tr>`
            ).join('');
            const agendaHtml = (m.agenda || []).map((item, idx) => {
              const decisionsHtml = (item.decisions || []).map(d =>
                `<div style="margin:4px 0;padding:6px 10px;background:#f9f9f9;border-radius:4px;"><strong>${d.vote}:</strong> ${d.description}${d.moved_by ? ' (Moved: ' + d.moved_by + ')' : ''}${d.seconded_by ? ' (Seconded: ' + d.seconded_by + ')' : ''}</div>`
              ).join('');
              const actionsHtml = (item.action_items || []).map(a =>
                `<tr><td>${a.description}</td><td>${a.assignee || '—'}</td><td>${formatDate(a.due_date)}</td><td><span class="badge">${a.priority}</span></td><td><span class="badge">${a.status}</span></td></tr>`
              ).join('');
              return `
                <div class="section">
                  <h3>${idx + 1}. ${item.title} (${item.duration_minutes} min)</h3>
                  ${item.notes ? `<p>${item.notes.replace(/\n/g, '<br/>')}</p>` : ''}
                  ${decisionsHtml ? `<h4>Decisions</h4>${decisionsHtml}` : ''}
                  ${actionsHtml ? `<h4>Action Items</h4><table><tr><th>Description</th><th>Assignee</th><th>Due</th><th>Priority</th><th>Status</th></tr>${actionsHtml}</table>` : ''}
                </div>
              `;
            }).join('');
            exportPDF(`Meeting Minutes - ${m.title}`, `
              <h1>${m.title}</h1>
              <table>
                <tr><th>Type</th><td>${m.type}</td></tr>
                <tr><th>Status</th><td><span class="badge">${m.status}</span></td></tr>
                <tr><th>Date/Time</th><td>${formatDateTime(m.date, m.time)}</td></tr>
                ${m.location ? `<tr><th>Location</th><td>${m.location}</td></tr>` : ''}
                ${m.recurring !== 'none' ? `<tr><th>Recurring</th><td>${m.recurring}</td></tr>` : ''}
              </table>
              ${(m.attendees || []).length > 0 ? `
                <h2>Attendance (${(m.attendees || []).filter(a => a.present).length}/${(m.attendees || []).length} present)</h2>
                <table><tr><th>Status</th><th>Name</th><th>Company</th><th>Role</th><th>Email</th></tr>${attendeesHtml}</table>
              ` : ''}
              ${(m.agenda || []).length > 0 ? `<h2>Agenda &amp; Minutes</h2>${agendaHtml}` : ''}
              ${m.general_notes ? `<h2>General Notes</h2><div class="section"><p>${m.general_notes.replace(/\n/g, '<br/>')}</p></div>` : ''}
            `);
          }} style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: '8px 14px', color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <PdfIcon /> Export PDF
          </button>
          {m.status === 'Scheduled' && (
            <button onClick={() => cancelMeeting(m)} style={btnStyle(RED, true)}>Cancel</button>
          )}
        </div>

        {showEmail && (
          <EmailComposer
            projectId={projectId}
            onClose={() => setShowEmail(false)}
            onSent={() => setShowEmail(false)}
            defaultTo={(m.attendees || []).filter(a => a.email).map(a => a.email).join(', ')}
            defaultSubject={`Meeting Minutes - ${m.title} - ${formatDate(m.date)}`}
            defaultBody={[
              `Meeting Minutes: ${m.title}`,
              `Type: ${m.type}`,
              `Date: ${formatDateTime(m.date, m.time)}`,
              m.location ? `Location: ${m.location}` : '',
              `Status: ${m.status}`,
              '',
              `Attendees (${presentCount}/${(m.attendees || []).length} present):`,
              ...(m.attendees || []).map(a => `  ${a.present ? '[Present]' : '[Absent]'} ${a.name}${a.company ? ' (' + a.company + ')' : ''}`),
              '',
              ...(m.agenda || []).flatMap((item, idx) => [
                `${idx + 1}. ${item.title}`,
                item.notes ? `   Notes: ${item.notes}` : '',
                ...(item.decisions || []).map(d => `   Decision: ${d.vote} - ${d.description}`),
                ...(item.action_items || []).map(ai => `   Action: ${ai.description} -> ${ai.assignee || 'Unassigned'} (Due: ${formatDate(ai.due_date)}) [${ai.status}]`),
              ]).filter(Boolean),
              '',
              m.general_notes ? `General Notes:\n${m.general_notes}` : '',
              '',
              `Action Items Summary: ${totalActions} total, ${completedActions} completed`,
            ].filter(Boolean).join('\n')}
            module="meetings"
            itemId={m.id}
            itemTitle={m.title}
          />
        )}

        {/* Attendance */}
        {(m.attendees || []).length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 10 }}>Attendance</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {m.attendees.map(att => (
                <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: att.present ? GREEN : RED, flexShrink: 0 }} />
                  <div>
                    <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{att.name}</div>
                    <div style={{ color: DIM, fontSize: 11 }}>{att.company}{att.role ? ` — ${att.role}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agenda & Minutes */}
        {(m.agenda || []).length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 10 }}>Agenda &amp; Minutes</h3>
            {m.agenda.map((item, idx) => (
              <div key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: idx < m.agenda.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ color: GOLD, fontWeight: 800, fontSize: 15 }}>{idx + 1}.</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                    {item.notes && <div style={{ color: DIM, fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' as const }}>{item.notes}</div>}
                  </div>
                  <span style={{ color: DIM, fontSize: 11 }}>{item.duration_minutes} min</span>
                </div>

                {/* Decisions */}
                {(item.decisions || []).length > 0 && (
                  <div style={{ marginLeft: 28, marginTop: 8 }}>
                    <div style={{ color: AMBER, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>DECISIONS / MOTIONS</div>
                    {item.decisions.map(d => (
                      <div key={d.id} style={{ padding: '6px 10px', background: '#0A1929', borderRadius: 8, marginBottom: 4, border: `1px solid ${BORDER}` }}>
                        <div style={{ color: TEXT, fontSize: 13 }}>{d.description}</div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: DIM, marginTop: 2 }}>
                          <span style={badgeStyle(d.vote === 'Approved' ? GREEN : d.vote === 'Rejected' ? RED : AMBER)}>{d.vote}</span>
                          {d.moved_by && <span>Moved: {d.moved_by}</span>}
                          {d.seconded_by && <span>Seconded: {d.seconded_by}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action items */}
                {(item.action_items || []).length > 0 && (
                  <div style={{ marginLeft: 28, marginTop: 8 }}>
                    <div style={{ color: BLUE, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ACTION ITEMS</div>
                    {item.action_items.map(ai => {
                      const overdue = ai.status !== 'Complete' && ai.due_date && isOverdue(ai.due_date);
                      return (
                        <div key={ai.id} style={{ padding: '6px 10px', background: '#0A1929', borderRadius: 8, marginBottom: 4, border: `1px solid ${overdue ? RED : BORDER}` }}>
                          <div style={{ color: TEXT, fontSize: 13 }}>{ai.description}</div>
                          <div style={{ display: 'flex', gap: 10, fontSize: 11, color: DIM, marginTop: 2, flexWrap: 'wrap' as const }}>
                            <span style={badgeStyle(ai.status === 'Complete' ? GREEN : ai.status === 'In Progress' ? AMBER : BLUE)}>{ai.status}</span>
                            {ai.assignee && <span>Assignee: {ai.assignee}</span>}
                            {ai.due_date && <span style={{ color: overdue ? RED : DIM }}>Due: {formatDate(ai.due_date)}{overdue ? ' (OVERDUE)' : ''}</span>}
                            <span style={{ color: priorityColor(ai.priority) }}>{ai.priority}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* General notes */}
        {m.general_notes && (
          <div style={cardStyle}>
            <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>General Notes</h3>
            <div style={{ color: DIM, fontSize: 13, whiteSpace: 'pre-wrap' as const }}>{m.general_notes}</div>
          </div>
        )}
      </div>
    );
  };

  /* ── MINUTES VIEW (In Progress) ── */
  const renderMinutes = () => {
    if (!selectedMeeting) return null;
    const m = selectedMeeting;
    const agenda = m.agenda || [];
    const currentItem = agenda[activeAgendaIdx];

    return (
      <div>
        {renderHeader('Meeting Minutes', 'detail')}

        <div style={{ ...cardStyle, padding: 12, marginBottom: 12 }}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 16 }}>{m.title}</div>
          <div style={{ color: DIM, fontSize: 12 }}>{formatDateTime(m.date, m.time)} | {m.location}</div>
        </div>

        {/* Attendance check-in */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: 0 }}>Attendance Check-in</h3>
            <span style={{ color: DIM, fontSize: 12 }}>{m.attendees.filter(a => a.present).length}/{m.attendees.length} present</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {m.attendees.map((att, idx) => (
              <div
                key={att.id}
                onClick={() => toggleAttendance(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                  background: att.present ? `${GREEN}15` : '#0A1929', border: `1px solid ${att.present ? GREEN : BORDER}`,
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: att.present ? GREEN : RED, flexShrink: 0 }} />
                <div>
                  <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{att.name}</div>
                  <div style={{ color: DIM, fontSize: 11 }}>{att.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agenda progress bar */}
        {agenda.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {agenda.map((_, idx) => (
              <div
                key={idx}
                onClick={() => setActiveAgendaIdx(idx)}
                style={{
                  flex: 1, height: 6, borderRadius: 3, cursor: 'pointer',
                  background: idx === activeAgendaIdx ? GOLD : idx < activeAgendaIdx ? GREEN : BORDER,
                  transition: 'background .15s',
                }}
              />
            ))}
          </div>
        )}

        {/* Current agenda item */}
        {currentItem && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: GOLD, fontWeight: 800, fontSize: 20 }}>{activeAgendaIdx + 1}</span>
                <span style={{ color: TEXT, fontWeight: 700, fontSize: 16 }}>{currentItem.title}</span>
              </div>
              <span style={{ color: DIM, fontSize: 12 }}>{currentItem.duration_minutes} min</span>
            </div>

            {/* Discussion notes */}
            <label style={labelStyle}>Discussion Notes</label>
            <textarea
              value={currentItem.notes}
              onChange={e => updateMinutesAgenda(activeAgendaIdx, 'notes', e.target.value)}
              placeholder="Record discussion points, questions raised, clarifications..."
              rows={5}
              style={{ ...inputStyle, resize: 'vertical' as const, marginBottom: 16, fontFamily: 'inherit' }}
            />

            {/* Decisions / Motions */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Decisions / Motions</label>
                <button onClick={() => addDecision(activeAgendaIdx)} style={btnStyle(AMBER, true)}>+ Decision</button>
              </div>
              {(currentItem.decisions || []).map((d, dIdx) => (
                <div key={d.id} style={{ background: '#0A1929', borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${BORDER}` }}>
                  <input
                    placeholder="Decision / motion description"
                    value={d.description}
                    onChange={e => updateDecision(activeAgendaIdx, dIdx, 'description', e.target.value)}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <select value={d.vote} onChange={e => updateDecision(activeAgendaIdx, dIdx, 'vote', e.target.value)} style={selectStyle}>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Tabled">Tabled</option>
                    </select>
                    <input placeholder="Moved by" value={d.moved_by} onChange={e => updateDecision(activeAgendaIdx, dIdx, 'moved_by', e.target.value)} style={inputStyle} />
                    <input placeholder="Seconded by" value={d.seconded_by} onChange={e => updateDecision(activeAgendaIdx, dIdx, 'seconded_by', e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <button onClick={() => removeDecision(activeAgendaIdx, dIdx)} style={{ ...btnStyle(RED, true), fontSize: 11 }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Items */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Action Items</label>
                <button onClick={() => addMinutesAction(activeAgendaIdx)} style={btnStyle(BLUE, true)}>+ Action Item</button>
              </div>
              {(currentItem.action_items || []).map((ai, aiIdx) => (
                <div key={ai.id} style={{ background: '#0A1929', borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${BORDER}` }}>
                  <input
                    placeholder="Action item description"
                    value={ai.description}
                    onChange={e => updateMinutesAction(activeAgendaIdx, aiIdx, 'description', e.target.value)}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <input placeholder="Assignee" value={ai.assignee} onChange={e => updateMinutesAction(activeAgendaIdx, aiIdx, 'assignee', e.target.value)} style={inputStyle} />
                    <input type="date" value={ai.due_date} onChange={e => updateMinutesAction(activeAgendaIdx, aiIdx, 'due_date', e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <select value={ai.priority} onChange={e => updateMinutesAction(activeAgendaIdx, aiIdx, 'priority', e.target.value)} style={selectStyle}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={ai.status} onChange={e => updateMinutesAction(activeAgendaIdx, aiIdx, 'status', e.target.value)} style={selectStyle}>
                      {ACTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <button onClick={() => removeMinutesAction(activeAgendaIdx, aiIdx)} style={{ ...btnStyle(RED, true), fontSize: 11 }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agenda navigation */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setActiveAgendaIdx(Math.max(0, activeAgendaIdx - 1))}
            disabled={activeAgendaIdx === 0}
            style={{ ...btnStyle(BORDER), flex: 1, justifyContent: 'center', opacity: activeAgendaIdx === 0 ? 0.3 : 1 }}
          >&#8592; Previous Item</button>
          <button
            onClick={() => setActiveAgendaIdx(Math.min(agenda.length - 1, activeAgendaIdx + 1))}
            disabled={activeAgendaIdx >= agenda.length - 1}
            style={{ ...btnStyle(BORDER), flex: 1, justifyContent: 'center', opacity: activeAgendaIdx >= agenda.length - 1 ? 0.3 : 1 }}
          >Next Item &#8594;</button>
        </div>

        {/* General notes */}
        <div style={cardStyle}>
          <label style={labelStyle}>General Notes</label>
          <textarea
            value={m.general_notes}
            onChange={e => setSelectedMeeting({ ...m, general_notes: e.target.value })}
            placeholder="Any additional notes, follow-ups, or general remarks..."
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit' }}
          />
        </div>

        {/* Save / Complete */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveMinutes} disabled={saving} style={{ ...btnStyle(BLUE), flex: 1, justifyContent: 'center' }}>
            {saving ? 'Saving...' : 'Save Minutes'}
          </button>
          <button onClick={completeMinutes} style={{ ...btnStyle(GREEN), flex: 1, justifyContent: 'center' }}>
            Complete Meeting
          </button>
        </div>
        {saveMsg && <div style={{ textAlign: 'center', color: GREEN, fontSize: 13, marginTop: 8 }}>{saveMsg}</div>}
      </div>
    );
  };

  /* ── Main render ── */
  return (
    <div style={{ padding: 16, maxWidth: 800, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {view === 'list' && renderList()}
      {view === 'actions' && renderActionsTab()}
      {view === 'create' && renderForm(false)}
      {view === 'edit' && renderForm(true)}
      {view === 'detail' && renderDetail()}
      {view === 'minutes' && renderMinutes()}
    </div>
  );
}

/* ── Export with Suspense wrapper ── */
export default function MeetingsPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8BAAC8' }}>Loading...</div>}>
      <MeetingsPage />
    </Suspense>
  );
}
