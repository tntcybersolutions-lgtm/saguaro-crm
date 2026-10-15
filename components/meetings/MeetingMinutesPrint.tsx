'use client';
/**
 * Printable meeting minutes. Dark on screen like the rest of the app; on paper
 * (Print / Save as PDF) only the minutes print, black on white, with the app
 * shell hidden. Print layouts are an allowed exception to the dark-only rule.
 */
import React, { useEffect, useState } from 'react';
import { Button, EmptyState } from '@/components/ui/kit';
import { Printer, ArrowLeft, WarningCircle, Database } from '@phosphor-icons/react';
import { isItemOverdue, statusLabel, typeLabel, TABLE_MISSING_CODE, TABLE_MISSING_MESSAGE } from '@/lib/meetings';

type Meeting = {
  title: string; meeting_type: string; meeting_number: number | null; meeting_date: string; start_time: string | null;
  end_time: string | null; location: string | null; status: string | null; notes: string | null; facilitator_name: string | null;
  distributed_at: string | null;
};
type Attendee = { id: string; name: string; company: string | null; email: string | null; role: string | null; attended: boolean | null };
type Item = { id: string; number: string | null; topic: string; discussion: string | null; status: string; assignee_name: string | null; due_date: string | null; carried_from_item_id: string | null };

const PRINT_CSS = `
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

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', verticalAlign: 'top' };
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
  if (missing) return <EmptyState icon={<Database size={22} />} title={TABLE_MISSING_MESSAGE} text="supabase/migrations/20261015c_meetings.sql" />;
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
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '4px 0 6px' }}>#{m.meeting_number ?? ''} {m.title}</h1>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          <span>{typeLabel(m.meeting_type)}</span>
          {when && <span>{when}</span>}
          {m.location && <span>{m.location}</span>}
          {m.facilitator_name && <span>Facilitator: {m.facilitator_name}</span>}
          <span>{statusLabel(m.status)}{m.distributed_at ? ` ${fmtShort(m.distributed_at)}` : ''}</span>
        </div>

        <h2 style={h2}>Attendees ({attendees.filter((a) => a.attended).length} of {attendees.length} present)</h2>
        {attendees.length ? (
          <table className="k-table-skin" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Present</th><th style={th}>Name</th><th style={th}>Company</th><th style={th}>Role</th><th style={th}>Email</th></tr></thead>
            <tbody>
              {attendees.map((a) => (
                <tr key={a.id}>
                  <td style={td}>{a.attended ? 'Yes' : 'No'}</td>
                  <td style={td}>{a.name}</td>
                  <td style={td}>{a.company || ''}</td>
                  <td style={td}>{a.role || ''}</td>
                  <td style={td}>{a.email || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>None recorded.</p>}

        <h2 style={h2}>Items ({open.length} open of {items.length})</h2>
        {items.length ? (
          <table className="k-table-skin" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ ...th, width: 56 }}>#</th><th style={th}>Item / discussion</th><th style={th}>Ball in court</th><th style={th}>Due</th><th style={th}>Status</th></tr></thead>
            <tbody>
              {items.map((i) => {
                const from = i.carried_from_item_id ? carriedFrom[i.carried_from_item_id] : undefined;
                const late = today ? isItemOverdue(i, today) : false;
                return (
                  <tr key={i.id}>
                    <td style={{ ...td, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{i.number || ''}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{i.topic}{i.carried_from_item_id ? ` (carried${from ? ` from #${from}` : ''})` : ''}</div>
                      {i.discussion && <div style={{ whiteSpace: 'pre-wrap', marginTop: 4, color: 'var(--text-secondary)' }}>{i.discussion}</div>}
                    </td>
                    <td style={td}>{i.assignee_name || ''}</td>
                    <td style={{ ...td, color: late ? 'var(--danger)' : td.color }}>{fmtShort(i.due_date)}{late ? ' (overdue)' : ''}</td>
                    <td style={td}>{i.status === 'closed' ? 'Closed' : 'Open'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No items.</p>}

        {m.notes && (<><h2 style={h2}>Notes</h2><p style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{m.notes}</p></>)}
      </article>
    </div>
  );
}
