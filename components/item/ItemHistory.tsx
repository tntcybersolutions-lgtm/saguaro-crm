'use client';
/**
 * History tab for any tool item (RFI, submittal, punch item, CO, daily log…).
 *
 * Reads /api/audit-trail, which returns the rows the database's
 * record_item_history trigger writes on every create / edit / delete. Each edit
 * shows who, when, and every changed field as old → new.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { usePeople } from '@/lib/hooks/usePeople';
import { isPersonKey, personName, type People } from '@/lib/person-names';

type Entry = {
  id: string;
  action: string;
  user_name: string | null;
  user_email: string | null;
  created_at: string;
  changes: Record<string, unknown> | null;
  previous_values: Record<string, unknown> | null;
};

const HIDE = new Set(['id', 'tenant_id', 'project_id', 'created_by', 'updated_by', 'search_vector', 'embedding']);

/** "due_date" → "Due date", "ball_in_court_id" → "Ball in court". */
export function fieldLabel(key: string): string {
  const s = key.replace(/_id$/, '').replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function show(v: unknown, key?: string, people?: People): string {
  if (v === null || v === undefined || v === '') return '—';
  // A person field ("Assigned to", "Approved by") reads as the person's name, never an id.
  if (key && isPersonKey(key) && typeof v === 'string') return personName(v, people) ?? 'someone';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString('en-US');
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) return 'changed';
    return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  }
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  return 'changed';
}

const VERB: Record<string, string> = {
  created: 'created this',
  updated: 'edited',
  status_changed: 'changed the status',
  deleted: 'deleted this',
  restored: 'restored this',
};

export default function ItemHistory({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null); setError('');
    fetch(`/api/audit-trail?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}&limit=200`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setError(j.error || "Couldn't load the history."); setRows([]); return; }
        setRows(Array.isArray(j.entries) ? j.entries : []);
      })
      .catch(() => { if (alive) { setError('No connection. Try again.'); setRows([]); } });
    return () => { alive = false; };
  }, [entityType, entityId]);

  // Ids in person fields, resolved to names once for the whole history.
  const personValues = useMemo(() => (rows || []).flatMap((e) => Object.keys(e.changes || {}).filter(isPersonKey)
    .flatMap((k) => [e.changes?.[k], e.previous_values?.[k]])), [rows]);
  const people = usePeople(personValues);

  if (rows === null) return <div className="ih-msg">Loading history…</div>;
  if (error) return <div className="ih-msg ih-err">{error}</div>;
  if (!rows.length) return <div className="ih-msg">No changes recorded yet. Every edit from now on shows here: who, when, and what changed.</div>;

  return (
    <div className="ih">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {rows.map((e) => {
        const fields = Object.keys(e.changes || {}).filter((k) => !HIDE.has(k));
        const who = e.user_name || e.user_email || 'Saguaro (automatic)';
        return (
          <div key={e.id} className="ih-row" data-action={e.action}>
            <div className="ih-dot" aria-hidden />
            <div className="ih-body">
              <div className="ih-head">
                <strong>{who}</strong> {VERB[e.action] || e.action.replace(/_/g, ' ')}
                <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
              </div>
              {fields.length > 0 && (
                <table className="ih-table">
                  <tbody>
                    {fields.map((k) => (
                      <tr key={k}>
                        <th scope="row">{fieldLabel(k)}</th>
                        <td className="ih-old">{show(e.previous_values?.[k], k, people)}</td>
                        <td className="ih-arrow" aria-hidden>→</td>
                        <td className="ih-new">{show(e.changes?.[k], k, people)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CSS = `
.ih{display:flex;flex-direction:column}
.ih-msg{color:var(--text-secondary);font-size:14px;padding:16px 0}
.ih-err{color:var(--danger)}
.ih-row{display:grid;grid-template-columns:14px minmax(0,1fr);gap:12px;padding:12px 0;border-bottom:1px solid var(--border-default)}
.ih-dot{width:8px;height:8px;border-radius:50%;margin-top:6px;background:var(--text-tertiary)}
.ih-row[data-action="created"] .ih-dot{background:var(--success)}
.ih-row[data-action="deleted"] .ih-dot{background:var(--danger)}
.ih-row[data-action="status_changed"] .ih-dot{background:var(--brand-primary)}
.ih-head{font-size:14px;color:var(--text-primary);display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}
.ih-head time{color:var(--text-tertiary);font-size:12px;margin-left:auto}
.ih-table{margin-top:8px;border-collapse:collapse;font-size:13px;width:auto;max-width:100%}
.ih-table th{color:var(--text-secondary);font-weight:600;text-align:left;padding:3px 12px 3px 0;white-space:nowrap;vertical-align:top;width:1%}
.ih-old{color:var(--text-tertiary);text-decoration:line-through;padding:3px 8px 3px 0;overflow-wrap:anywhere;max-width:320px}
.ih-arrow{color:var(--text-tertiary);padding:3px 8px;width:1%}
.ih-new{color:var(--text-primary);padding:3px 0;overflow-wrap:anywhere;max-width:420px}
@media (max-width:600px){.ih-table th{white-space:normal}}
`;
