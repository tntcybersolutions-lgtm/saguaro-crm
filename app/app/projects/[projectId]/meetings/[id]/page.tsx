'use client';
/**
 * Meeting — the agenda and minutes editor. Every field saves itself a moment
 * after you stop typing. Items keep their number for life: an item still open
 * when you press "Start next meeting" moves to the next one as the same number.
 *
 * Reads  GET   /api/projects/:id/meetings/:meetingId
 * Saves  PATCH …/:meetingId, …/attendees/:a, …/items/:i   (debounced)
 * Adds   POST  …/attendees, …/items
 * Moves  POST  …/next (carry open items forward), …/distribute (then minutes)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, Badge, Button, EmptyState, Select, FormGrid, Field, Input, Textarea, MetaItem, Toast, useToast,
  type BadgeTone,
} from '@/components/ui/kit';
import RelatedItems from '@/components/related/RelatedItems';
import {
  CalendarBlank, Clock, MapPin, Printer, ArrowRight, PaperPlaneTilt, Plus, Trash, WarningCircle, Database, UsersThree,
} from '@phosphor-icons/react';
import {
  MEETING_TYPES, MEETING_STATUSES, normalizeStatus, statusLabel, typeLabel, isItemOverdue, sortItems,
  TABLE_MISSING_CODE, TABLE_MISSING_MESSAGE, type MeetingStatus,
} from '@/lib/meetings';

type Meeting = {
  id: string; title: string; meeting_type: string; meeting_number: number | null; meeting_date: string;
  start_time: string | null; end_time: string | null; location: string | null; status: string | null;
  notes: string | null; facilitator_name: string | null; distributed_at: string | null;
};
type Attendee = { id: string; name: string; company: string | null; email: string | null; role: string | null; attended: boolean | null };
type Item = {
  id: string; number: string | null; topic: string; discussion: string | null; status: 'open' | 'closed';
  assignee_name: string | null; due_date: string | null; carried_from_item_id: string | null; position: number | null;
};

const STATUS_TONE: Record<MeetingStatus, BadgeTone> = {
  scheduled: 'lead', in_progress: 'ongoing', minutes_draft: 'neutral', distributed: 'completed',
};
const fmtDate = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtTime = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

const sectionHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
  margin: '28px 0 8px', paddingBottom: 8, borderBottom: '1px solid var(--border-default)',
};
const h2: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' };
const rowLine: React.CSSProperties = { borderBottom: '1px solid var(--border-default)', padding: '12px 0' };

export default function MeetingPage() {
  const { projectId, id } = useParams() as { projectId: string; id: string };
  const router = useRouter();
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();
  const api = `/api/projects/${projectId}/meetings/${id}`;
  const base = `/app/projects/${projectId}`;

  const [m, setM] = useState<Meeting | null>(null);
  const [people, setPeople] = useState<Attendee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [carriedFrom, setCarriedFrom] = useState<Record<string, number | null>>({});
  const [carriedTo, setCarriedTo] = useState<{ id: string; meeting_number: number | null } | null>(null);
  const [today, setToday] = useState('');
  const [itemsMissing, setItemsMissing] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'next' | 'distribute' | 'attendee' | 'item'>('');
  const [newPerson, setNewPerson] = useState({ name: '', company: '', email: '', role: '' });
  const [newTopic, setNewTopic] = useState('');

  /* ── autosave: one debounced PATCH per record, fields merged ── */
  const pending = useRef<Record<string, { patch: Record<string, unknown>; timer: ReturnType<typeof setTimeout> }>>({});
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const flush = useCallback(async (url: string) => {
    const p = pending.current[url];
    if (!p) return;
    delete pending.current[url];
    setSaving((n) => n + 1);
    try {
      const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p.patch) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't save");
      setSavedAt(Date.now());
    } catch (e) {
      show(e instanceof Error ? e.message : "Couldn't save", 'bad');
    } finally {
      setSaving((n) => n - 1);
    }
  }, [show]);

  const queue = useCallback((url: string, patch: Record<string, unknown>, wait = 700) => {
    const cur = pending.current[url];
    if (cur) clearTimeout(cur.timer);
    const merged = { ...(cur?.patch || {}), ...patch };
    pending.current[url] = { patch: merged, timer: setTimeout(() => { void flush(url); }, wait) };
  }, [flush]);

  useEffect(() => () => {
    for (const url of Object.keys(pending.current)) { clearTimeout(pending.current[url].timer); void flush(url); }
  }, [flush]);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(api, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (j.code === TABLE_MISSING_CODE) { setTableMissing(true); return; }
      if (!r.ok) throw new Error(j.error || "Couldn't load the meeting");
      setM(j.meeting);
      setPeople(j.attendees || []);
      setItems(j.items || []);
      setCarriedFrom(j.carriedFrom || {});
      setCarriedTo(j.carriedTo || null);
      setToday(j.today || '');
      setItemsMissing(!!j.itemsMissing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the meeting");
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const editMeeting = (patch: Partial<Meeting>, wait?: number) => {
    setM((cur) => (cur ? { ...cur, ...patch } : cur));
    queue(api, patch, wait);
  };
  const editPerson = (aid: string, patch: Partial<Attendee> & { present?: boolean }, wait?: number) => {
    setPeople((list) => list.map((p) => (p.id === aid ? { ...p, ...patch, ...(patch.present !== undefined ? { attended: patch.present } : {}) } : p)));
    queue(`${api}/attendees/${aid}`, patch, wait);
  };
  const editItem = (iid: string, patch: Partial<Item>, wait?: number) => {
    setItems((list) => list.map((i) => (i.id === iid ? { ...i, ...patch } : i)));
    queue(`${api}/items/${iid}`, patch, wait);
  };

  async function post(url: string, body: unknown) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  }

  async function addPerson() {
    if (!newPerson.name.trim()) return;
    setBusy('attendee');
    try {
      const { r, j } = await post(`${api}/attendees`, { ...newPerson, present: true });
      if (!r.ok) throw new Error(j.error || "Couldn't add the attendee");
      setPeople((l) => [...l, j.attendee]);
      setNewPerson({ name: '', company: '', email: '', role: '' });
    } catch (e) { show(e instanceof Error ? e.message : "Couldn't add the attendee", 'bad'); }
    finally { setBusy(''); }
  }

  async function removePerson(aid: string) {
    const r = await fetch(`${api}/attendees/${aid}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); show(j.error || "Couldn't remove the attendee", 'bad'); return; }
    setPeople((l) => l.filter((p) => p.id !== aid));
  }

  async function addItem() {
    if (!newTopic.trim()) return;
    setBusy('item');
    try {
      const { r, j } = await post(`${api}/items`, { topic: newTopic });
      if (!r.ok) throw new Error(j.error || "Couldn't add the item");
      setItems((l) => sortItems([...l, j.item]));
      setNewTopic('');
    } catch (e) { show(e instanceof Error ? e.message : "Couldn't add the item", 'bad'); }
    finally { setBusy(''); }
  }

  async function removeItem(iid: string) {
    const r = await fetch(`${api}/items/${iid}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); show(j.error || "Couldn't remove the item", 'bad'); return; }
    setItems((l) => l.filter((i) => i.id !== iid));
  }

  async function startNext() {
    setBusy('next');
    try {
      for (const url of Object.keys(pending.current)) { clearTimeout(pending.current[url].timer); await flush(url); }
      const { r, j } = await post(`${api}/next`, {});
      if (r.status === 409 && j.meeting?.id) { show(`Already carried to meeting #${j.meeting.meeting_number ?? ''}`); router.push(`${base}/meetings/${j.meeting.id}`); return; }
      if (!r.ok) throw new Error(j.error || "Couldn't start the next meeting");
      router.push(`${base}/meetings/${j.meeting.id}`);
    } catch (e) { show(e instanceof Error ? e.message : "Couldn't start the next meeting", 'bad'); setBusy(''); }
  }

  async function distribute() {
    setBusy('distribute');
    try {
      for (const url of Object.keys(pending.current)) { clearTimeout(pending.current[url].timer); await flush(url); }
      const { r, j } = await post(`${api}/distribute`, {});
      if (!r.ok) throw new Error(j.error || "Couldn't distribute the minutes");
      router.push(j.printUrl || `${base}/meetings/${id}/minutes`);
    } catch (e) { show(e instanceof Error ? e.message : "Couldn't distribute the minutes", 'bad'); setBusy(''); }
  }

  const crumbs = [
    { label: 'Projects', href: '/app/projects' },
    { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
    { label: 'Meetings', href: `${base}/meetings` },
    { label: m ? `#${m.meeting_number ?? ''}` : 'Meeting' },
  ];

  if (tableMissing) {
    return <PageShell crumbs={crumbs} title="Meeting"><EmptyState icon={<Database size={22} />} title="Meetings aren't switched on for this company yet" text="Ask your Saguaro admin to turn them on." /></PageShell>;
  }
  if (error || (!loading && !m)) {
    return (
      <PageShell crumbs={crumbs} title="Meeting">
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load the meeting" text={error || 'Not found'} action={<Button onClick={() => { setLoading(true); load(); }}>Try again</Button>} />
      </PageShell>
    );
  }
  if (loading || !m) return <PageShell crumbs={crumbs} title="Meeting"><div className="k-skel" style={{ height: 240 }} /></PageShell>;

  const st = normalizeStatus(m.status);
  const openCount = items.filter((i) => i.status !== 'closed').length;
  const present = people.filter((p) => p.attended).length;
  const saveLine = saving > 0 ? 'Saving…' : savedAt ? 'Saved' : '';

  return (
    <PageShell
      crumbs={crumbs}
      title={`${m.meeting_number ? `#${m.meeting_number} ` : ''}${m.title}`}
      badge={<Badge tone={STATUS_TONE[st]} dot>{statusLabel(st)}</Badge>}
      meta={
        <>
          <MetaItem icon={<CalendarBlank size={14} />}>{fmtDate(m.meeting_date)}</MetaItem>
          {m.start_time && <MetaItem icon={<Clock size={14} />}>{fmtTime(m.start_time)}{m.end_time ? ` – ${fmtTime(m.end_time)}` : ''}</MetaItem>}
          {m.location && <MetaItem icon={<MapPin size={14} />}>{m.location}</MetaItem>}
          <MetaItem icon={<UsersThree size={14} />}>{present}/{people.length} present · {openCount} open</MetaItem>
          {saveLine && <MetaItem>{saveLine}</MetaItem>}
        </>
      }
      actions={
        <>
          <Button icon={<Printer size={15} />} href={`${base}/meetings/${id}/minutes`}>Minutes</Button>
          {carriedTo ? (
            <Button icon={<ArrowRight size={15} />} href={`${base}/meetings/${carriedTo.id}`}>Meeting #{carriedTo.meeting_number ?? ''}</Button>
          ) : (
            <Button icon={<ArrowRight size={15} />} onClick={startNext} disabled={!!busy || itemsMissing}>{busy === 'next' ? 'Starting…' : 'Start next meeting'}</Button>
          )}
          <Button variant="primary" icon={<PaperPlaneTilt size={15} />} onClick={distribute} disabled={!!busy}>
            {busy === 'distribute' ? 'Distributing…' : st === 'distributed' ? 'Distribute again' : 'Distribute minutes'}
          </Button>
        </>
      }
    >
      <div style={{ maxWidth: 1040 }}>
        <FormGrid cols={4}>
          <Field label="Title" span>
            <Input value={m.title} onChange={(e) => editMeeting({ title: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={m.meeting_type} onChange={(e) => editMeeting({ meeting_type: e.target.value }, 0)} options={MEETING_TYPES.map((t) => ({ value: t, label: typeLabel(t) }))} />
          </Field>
          <Field label="Status">
            <Select value={st} onChange={(e) => editMeeting({ status: e.target.value }, 0)} options={MEETING_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
          </Field>
          <Field label="Date">
            <Input type="date" value={m.meeting_date?.slice(0, 10) || ''} onChange={(e) => e.target.value && editMeeting({ meeting_date: e.target.value }, 0)} />
          </Field>
          <Field label="Location">
            <Input value={m.location || ''} onChange={(e) => editMeeting({ location: e.target.value })} />
          </Field>
          <Field label="Start">
            <Input type="time" value={hhmm(m.start_time)} onChange={(e) => editMeeting({ start_time: e.target.value || null }, 0)} />
          </Field>
          <Field label="End">
            <Input type="time" value={hhmm(m.end_time)} onChange={(e) => editMeeting({ end_time: e.target.value || null }, 0)} />
          </Field>
          <Field label="Facilitator">
            <Input value={m.facilitator_name || ''} onChange={(e) => editMeeting({ facilitator_name: e.target.value })} />
          </Field>
        </FormGrid>

        {/* ── Attendees ── */}
        <div style={sectionHead}>
          <h2 style={h2}>Attendees · {present}/{people.length} present</h2>
        </div>
        {people.map((p) => (
          <div key={p.id} style={{ ...rowLine, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, minWidth: 96, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!p.attended} onChange={(e) => editPerson(p.id, { present: e.target.checked }, 0)} style={{ width: 20, height: 20, accentColor: 'var(--success)' }} />
              Present
            </label>
            <Input aria-label="Name" value={p.name} onChange={(e) => editPerson(p.id, { name: e.target.value })} style={{ flex: '2 1 160px' }} />
            <Input aria-label="Company" placeholder="Company" value={p.company || ''} onChange={(e) => editPerson(p.id, { company: e.target.value })} style={{ flex: '2 1 160px' }} />
            <Input aria-label="Email" type="email" placeholder="Email" value={p.email || ''} onChange={(e) => editPerson(p.id, { email: e.target.value })} style={{ flex: '2 1 180px' }} />
            <Input aria-label="Role" placeholder="Role" value={p.role || ''} onChange={(e) => editPerson(p.id, { role: e.target.value })} style={{ flex: '1 1 120px' }} />
            <Button variant="ghost" size="sm" icon={<Trash size={15} />} aria-label={`Remove ${p.name}`} onClick={() => removePerson(p.id)} />
          </div>
        ))}
        <form method="post"
          onSubmit={(e) => { e.preventDefault(); void addPerson(); }}
          style={{ ...rowLine, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}
        >
          <Input aria-label="New attendee name" placeholder="Name" value={newPerson.name} onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} style={{ flex: '2 1 160px' }} />
          <Input aria-label="New attendee company" placeholder="Company" value={newPerson.company} onChange={(e) => setNewPerson({ ...newPerson, company: e.target.value })} style={{ flex: '2 1 160px' }} />
          <Input aria-label="New attendee email" type="email" placeholder="Email" value={newPerson.email} onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })} style={{ flex: '2 1 180px' }} />
          <Input aria-label="New attendee role" placeholder="Role" value={newPerson.role} onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })} style={{ flex: '1 1 120px' }} />
          <Button type="submit" icon={<Plus size={15} weight="bold" />} disabled={busy === 'attendee' || !newPerson.name.trim()}>Add attendee</Button>
        </form>

        {/* ── Items ── */}
        <div style={sectionHead}>
          <h2 style={h2}>Items · {openCount} open of {items.length}</h2>
        </div>
        {itemsMissing ? (
          <EmptyState icon={<Database size={22} />} title="Action items aren't switched on yet" text="Ask your Saguaro admin to turn them on." />
        ) : (
          <>
            {items.map((it) => {
              const overdue = today ? isItemOverdue(it, today) : false;
              const fromNo = it.carried_from_item_id ? carriedFrom[it.carried_from_item_id] : undefined;
              return (
                <div key={it.id} style={{ ...rowLine, display: 'grid', gap: 10, opacity: it.status === 'closed' ? 0.72 : 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>{it.number || ''}</span>
                    <Input aria-label={`Item ${it.number} topic`} value={it.topic} onChange={(e) => editItem(it.id, { topic: e.target.value })} style={{ flex: '1 1 260px', fontWeight: 700 }} />
                    {it.carried_from_item_id && <Badge tone="neutral">{fromNo ? `From #${fromNo}` : 'Carried forward'}</Badge>}
                    {overdue && <Badge tone="overdue" dot>Overdue</Badge>}
                    <Select aria-label={`Item ${it.number} status`} value={it.status} onChange={(e) => editItem(it.id, { status: e.target.value as Item['status'] }, 0)} style={{ width: 'auto', minWidth: 110 }}
                      options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />
                    <Button variant="ghost" size="sm" icon={<Trash size={15} />} aria-label={`Remove item ${it.number}`} onClick={() => removeItem(it.id)} />
                  </div>
                  <Textarea aria-label={`Item ${it.number} discussion`} placeholder="Discussion" rows={2} value={it.discussion || ''} onChange={(e) => editItem(it.id, { discussion: e.target.value })} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <Input aria-label={`Item ${it.number} assignee`} placeholder="Ball in court" value={it.assignee_name || ''} onChange={(e) => editItem(it.id, { assignee_name: e.target.value })} style={{ flex: '2 1 200px' }} />
                    <Input aria-label={`Item ${it.number} due date`} type="date" value={it.due_date?.slice(0, 10) || ''} onChange={(e) => editItem(it.id, { due_date: e.target.value || null }, 0)} style={{ flex: '1 1 150px' }} />
                  </div>
                </div>
              );
            })}
            <form method="post" onSubmit={(e) => { e.preventDefault(); void addItem(); }} style={{ ...rowLine, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <Input aria-label="New item topic" placeholder="New item topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} style={{ flex: '1 1 260px' }} />
              <Button type="submit" icon={<Plus size={15} weight="bold" />} disabled={busy === 'item' || !newTopic.trim()}>Add item</Button>
            </form>
          </>
        )}

        {/* ── General notes ── */}
        <div style={sectionHead}><h2 style={h2}>Notes</h2></div>
        <Textarea aria-label="General notes" rows={4} value={m.notes || ''} onChange={(e) => editMeeting({ notes: e.target.value })} />

        {/* ── Related items: the RFIs, change orders and drawings this meeting covered ── */}
        <div style={{ marginTop: 28 }}>
          <RelatedItems type="meeting" id={id} projectId={projectId} />
        </div>
      </div>
      <Toast message={toast?.message || null} tone={toast?.tone} />
    </PageShell>
  );
}
