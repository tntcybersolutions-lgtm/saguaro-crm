'use client';
/**
 * Printable meeting minutes. Dark on screen like the rest of the app; on paper
 * (Print / Save as PDF) only the minutes print, black on white, with the app
 * shell hidden. Print layouts are an allowed exception to the dark-only rule.
 */
import React, { useEffect, useState } from 'react';
import { Button, EmptyState } from '@/components/ui/kit';
import { Printer, ArrowLeft, WarningCircle, Database } from '@phosphor-icons/react';
import { isItemOverdue, statusLabel, typeLabel, TABLE_MISSING_CODE } from '@/lib/meetings';

type Meeting = {
  title: string; meeting_type: string; meeting_number: number | null; meeting_date: string; start_time: string | null;
  end_time: string | null; location: string | null; status: string | null; notes: string | null; facilitator_name: string | null;
  distributed_at: string | null;
};
type Attendee = { id: string; name: string; company: string | null; email: string | null; role: string | null; attended: boolean | null };
type Item = { id: string; number: string | null; topic: string; discussion: string | null; status: string; assignee_name: string | null; due_date: string | null; carried_from_item_id: string | null };

const PRINT_CSS = `
.mm-tbl { width: 100%; border-collapse: collapse; }
.mm-tbl th { text-align: left; padding: 8px 10px; font-size: 12px; font-weight: 800; color: var(--text-secondary); border-bottom: 1px solid var(--border-default); }
.mm-tbl td { padding: 10px; font-size: 14px; color: var(--text-primary); border-bottom: 1px solid var(--border-default); vertical-align: top; }
.mm-tbl td.mm-num { font-weight: 800; font-variant-numeric: tabular-nums; }
.mm-tbl td[data-late="true"] { color: var(--danger); }
.mm-sub { color: var(--text-secondary); white-space: pre-wrap; margin-top: 4px; }
/* A phone: k-stack (app/globals.css) stacks each row — no sideways scroll. */
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .mm-sheet, .mm-sheet * { visibility: visible !important; color: #000 !important; background: transparent !important; }
  .mm-sheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
  .mm-noprint { display: none !important; }
  .mm-sheet table { border-collapse: collapse; width: 100%; }
  .mm-sheet th, .mm-sheet td { border: 1px solid #999 !important; }
  .mm-sheet tr { break-inside: avoid; }
}
`;

const fmtDate = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
const fmtShort = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtTime = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const h2: React.CSSProperties = { fontSize: 15, fontWeight: 800, margin: '22px 0 8px', color: 'var(--text-primary)' };

export default function MeetingMinutesPrint({ projectId, meetingId, projectName }: { projectId: string; meetingId: string; projectName: string }) {
  const [data, setData] = useState<{ meeting: Meeting; attendees: Attendee[]; items: Item[]; today: string; carriedFrom: Record<string, number | null> } | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/meetings/${meetingId}`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (j.code === TABLE_MISSING_CODE) { setMissing(true); return; }
        if (!r.ok) throw new Error(j.error || "Couldn't load the minutes");
        setData(j);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Couldn't load the minutes");
      }
    })();
    return () => { live = false; };
  }, [projectId, meetingId]);

  const back = `/app/projects/${projectId}/meetings/${meetingId}`;
  if (missing) return <EmptyState icon={<Database size={22} />} title="Meetings aren't switched on for this company yet" text="Ask your Saguaro admin to turn them on." />;
  if (error) return <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load the minutes" text={error} action={<Button href={back}>Back to meeting</Button>} />;
  if (!data) return <div className="k-skel" style={{ height: 320 }} />;

  const { meeting: m, attendees, items, today, carriedFrom } = data;
  const when = [fmtDate(m.meeting_date), m.start_time ? fmtTime(m.start_time) + (m.end_time ? ` – ${fmtTime(m.end_time)}` : '') : ''].filter(Boolean).join(' · ');
  const open = items.filter((i) => i.status !== 'closed');

  return (
    <div style={{ maxWidth: 900 }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mm-noprint" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <Button icon={<ArrowLeft size={15} />} href={back}>Back to meeting</Button>
        <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>Print / Save PDF</Button>
      </div>

      <article className="mm-sheet" style={{ color: 'var(--text-primary)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{projectName} · Meeting minutes</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 6px', color: 'var(--text-primary)' }}>{m.meeting_number ? `#${m.meeting_number} ` : ''}{m.title}</h2>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          <span>{typeLabel(m.meeting_type)}</span>
          {when && <span>{when}</span>}
          {m.location && <span>{m.location}</span>}
          {m.facilitator_name && <span>Facilitator: {m.facilitator_name}</span>}
          <span>{statusLabel(m.status)}{m.distributed_at ? ` ${fmtShort(m.distributed_at)}` : ''}</span>
        </div>

        <h3 style={h2}>Attendees{attendees.length ? ` (${attendees.filter((a) => a.attended).length} of ${attendees.length} present)` : ''}</h3>
        {attendees.length ? (
          <table className="k-table-skin k-stack mm-tbl">
            <thead><tr><th>Name</th><th>Present</th><th>Company</th><th>Role</th><th>Email</th></tr></thead>
            <tbody>
              {attendees.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 700 }}>{a.name}</td>
                  <td data-label="Present">{a.attended ? 'Yes' : 'No'}</td>
                  <td data-label="Company">{a.company || ''}</td>
                  <td data-label="Role">{a.role || ''}</td>
                  <td data-label="Email" style={{ overflowWrap: 'anywhere' }}>{a.email || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>None recorded.</p>}

        <h3 style={h2}>Items{items.length ? ` (${open.length} open of ${items.length})` : ''}</h3>
        {items.length ? (
          <table className="k-table-skin k-stack mm-tbl">
            <thead><tr><th style={{ width: 56 }}>#</th><th>Item / discussion</th><th>Ball in court</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((i) => {
                const from = i.carried_from_item_id ? carriedFrom[i.carried_from_item_id] : undefined;
                const late = today ? isItemOverdue(i, today) : false;
                return (
                  <tr key={i.id}>
                    <td className="mm-num" data-label="Item">{i.number || ''}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{i.topic}{i.carried_from_item_id ? ` (carried${from ? ` from #${from}` : ''})` : ''}</div>
                      {i.discussion && <div className="mm-sub">{i.discussion}</div>}
                    </td>
                    <td data-label="Ball in court">{i.assignee_name || ''}</td>
                    <td data-label="Due" data-late={late ? 'true' : undefined}>{i.due_date ? `${fmtShort(i.due_date)}${late ? ' (overdue)' : ''}` : ''}</td>
                    <td data-label="Status">{i.status === 'closed' ? 'Closed' : 'Open'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No items.</p>}

        {m.notes && (<><h2 style={h2}>Notes</h2><p style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{m.notes}</p></>)}
      </article>
    </div>
  );
}
