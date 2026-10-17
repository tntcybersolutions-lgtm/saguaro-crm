'use client';
/**
 * The 20 sections of a daily log, each an editable list of rows, saved one
 * section at a time to /api/items/daily_logs/:id/sections. Photos are the
 * log's image files (uploaded onto the log itself).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/kit';
import { Plus, X, FloppyDisk, CopySimple, CaretDown, CaretRight, Camera } from '@phosphor-icons/react';
import { LOG_SECTIONS, type LogSection, type SectionField, type SectionRow } from '@/lib/daily-log-sections';

type FileRow = { id: string; name: string; kind: string | null; url: string | null };

const blankRow = (sec: LogSection): SectionRow => Object.fromEntries(sec.fields.map((f) => [f.key, f.kind === 'bool' ? false : null]));

async function readErr(r: Response, fallback: string) {
  try { const j = await r.json(); return (j && typeof j.error === 'string' && j.error) || fallback; } catch { return fallback; }
}

export default function DailyLogSections({ logId, projectId, files, onFilesChanged, onSaved, show }: {
  logId: string;
  projectId: string;
  files: FileRow[];
  onFilesChanged: () => Promise<void>;
  onSaved: () => void;
  show: (m: string, t?: 'good' | 'bad') => void;
}) {
  const [saved, setSaved] = useState<Record<string, SectionRow[]> | null>(null);
  const [draft, setDraft] = useState<Record<string, SectionRow[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/items/daily_logs/${logId}/sections`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { show(await readErr(r, "Couldn't load the log sections."), 'bad'); setSaved({}); return; }
    const j = await r.json();
    setSaved(j.sections || {});
    setDraft(JSON.parse(JSON.stringify(j.sections || {})));
    // Open every section that already has rows.
    setOpen((o) => ({ ...Object.fromEntries(Object.entries(j.sections || {}).map(([k, v]) => [k, (v as unknown[]).length > 0])), ...o }));
  }, [logId, show]);
  useEffect(() => { void load(); }, [load]);

  const dirty = useCallback((key: string) => JSON.stringify(draft[key] || []) !== JSON.stringify(saved?.[key] || []), [draft, saved]);

  const setCell = (key: string, i: number, f: SectionField, v: string | boolean) => {
    setDraft((d) => {
      const rows = [...(d[key] || [])];
      rows[i] = { ...rows[i], [f.key]: typeof v === 'boolean' ? v : v === '' ? null : f.kind === 'number' ? v : v };
      return { ...d, [key]: rows };
    });
  };

  const saveSection = async (sec: LogSection) => {
    setBusy(sec.key);
    const r = await fetch(`/api/items/daily_logs/${logId}/sections`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: sec.key, rows: draft[sec.key] || [] }),
    });
    setBusy(null);
    if (!r.ok) { show(await readErr(r, `Couldn't save ${sec.label}.`), 'bad'); return; }
    const j = await r.json();
    setSaved((s) => ({ ...(s || {}), [sec.key]: j.rows }));
    setDraft((d) => ({ ...d, [sec.key]: j.rows }));
    show(`${sec.label} saved.`);
    onSaved();
  };

  const copyPrevious = async () => {
    setBusy('copy');
    const r = await fetch(`/api/items/daily_logs/${logId}/sections`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyFrom: 'previous', sections: ['manpower', 'equipment', 'scheduled_work'] }),
    });
    setBusy(null);
    if (!r.ok) { show(await readErr(r, "Couldn't copy from the earlier log."), 'bad'); return; }
    const j = await r.json();
    setSaved(j.sections); setDraft(JSON.parse(JSON.stringify(j.sections)));
    setOpen((o) => ({ ...o, manpower: true, equipment: true, scheduled_work: true }));
    show(`Copied manpower, equipment and scheduled work from ${new Date(`${j.copiedFrom}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`);
    onSaved();
  };

  const uploadPhotos = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy('photos');
    for (const f of Array.from(list)) {
      const fd = new FormData();
      fd.append('file', f); fd.append('projectId', projectId); fd.append('entityType', 'daily_logs'); fd.append('entityId', logId); fd.append('category', 'daily-log-photo');
      const r = await fetch('/api/files/upload', { method: 'POST', credentials: 'include', body: fd });
      if (!r.ok) { show(await readErr(r, `Couldn't upload ${f.name}.`), 'bad'); break; }
    }
    setBusy(null);
    await onFilesChanged();
  };

  const photos = useMemo(() => files.filter((f) => f.kind === 'image'), [files]);
  const filled = saved ? LOG_SECTIONS.filter((s) => (s.photos ? photos.length : (saved[s.key] || []).length) > 0).length : 0;

  if (!saved) return <div className="dls-msg">Loading the log…</div>;

  return (
    <div className="dls">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dls-top">
        <span className="dls-msg"><strong>{filled}</strong> of {LOG_SECTIONS.length} sections filled</span>
        <div className="dls-spacer" />
        <Button icon={<CopySimple size={15} />} onClick={() => void copyPrevious()} disabled={busy !== null}>{busy === 'copy' ? 'Copying…' : 'Copy crew & equipment from last log'}</Button>
      </div>
      {LOG_SECTIONS.map((sec) => {
        const rows = draft[sec.key] || [];
        const count = sec.photos ? photos.length : (saved[sec.key] || []).length;
        const isOpen = !!open[sec.key];
        return (
          <section key={sec.key} className="dls-sec" aria-label={sec.label}>
            <button type="button" className="dls-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [sec.key]: !isOpen }))}>
              {isOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
              <span className="dls-title">{sec.label}</span>
              <span className="dls-count" data-zero={count === 0 ? 'true' : undefined}>{count}</span>
              {!sec.photos && dirty(sec.key) && <span className="dls-dirty">Not saved</span>}
              <span className="dls-hint">{sec.hint}</span>
            </button>
            {isOpen && (sec.photos ? (
              <div className="dls-body">
                {photos.length > 0 && (
                  <ul className="dls-photos">
                    {photos.map((p) => <li key={p.id}>{p.url ? <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.name} loading="lazy" /></a> : p.name}</li>)}
                  </ul>
                )}
                <label className="dls-upload"><Camera size={15} /> {busy === 'photos' ? 'Uploading…' : 'Add photos'}<input type="file" accept="image/*" multiple disabled={busy !== null} onChange={(e) => void uploadPhotos(e.target.files)} /></label>
              </div>
            ) : (
              <div className="dls-body">
                {rows.length > 0 && (
                  <div className="dls-table-wrap">
                    <table className="dls-table">
                      <thead><tr>{sec.fields.map((f) => <th key={f.key}>{f.label}{f.required ? ' *' : ''}</th>)}<th aria-label="Remove" /></tr></thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i}>
                            {sec.fields.map((f) => (
                              <td key={f.key} data-label={f.label}>
                                {f.kind === 'bool' ? (
                                  <input type="checkbox" aria-label={f.label} checked={row[f.key] === true} onChange={(e) => setCell(sec.key, i, f, e.target.checked)} />
                                ) : f.kind === 'select' ? (
                                  <select className="k-input" aria-label={f.label} value={String(row[f.key] ?? '')} onChange={(e) => setCell(sec.key, i, f, e.target.value)}>
                                    <option value="">—</option>
                                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : f.kind === 'long' ? (
                                  <textarea className="k-input" rows={2} aria-label={f.label} value={String(row[f.key] ?? '')} onChange={(e) => setCell(sec.key, i, f, e.target.value)} />
                                ) : (
                                  <input
                                    className="k-input"
                                    aria-label={f.label}
                                    type={f.kind === 'number' ? 'number' : f.kind === 'time' ? 'time' : 'text'}
                                    value={String(row[f.key] ?? '')}
                                    onChange={(e) => setCell(sec.key, i, f, e.target.value)}
                                  />
                                )}
                              </td>
                            ))}
                            <td><button type="button" className="dls-x" aria-label={`Remove ${sec.label} row ${i + 1}`} onClick={() => setDraft((d) => ({ ...d, [sec.key]: (d[sec.key] || []).filter((_, xi) => xi !== i) }))}><X size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="dls-actions">
                  <Button size="sm" icon={<Plus size={13} />} onClick={() => setDraft((d) => ({ ...d, [sec.key]: [...(d[sec.key] || []), blankRow(sec)] }))}>Add row</Button>
                  <div className="dls-spacer" />
                  {dirty(sec.key) && <Button size="sm" variant="primary" icon={<FloppyDisk size={13} />} disabled={busy !== null} onClick={() => void saveSection(sec)}>{busy === sec.key ? 'Saving…' : `Save ${sec.label}`}</Button>}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

const CSS = `
.dls{display:flex;flex-direction:column}
.dls-msg{color:var(--text-secondary);font-size:14px}
.dls-msg strong{color:var(--text-primary)}
.dls-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0 16px}
.dls-spacer{flex:1}
.dls-sec{border-top:1px solid var(--border-default)}
.dls-sec:last-child{border-bottom:1px solid var(--border-default)}
.dls-head{width:100%;display:flex;align-items:center;gap:10px;min-height:52px;padding:0;background:transparent;border:0;color:var(--text-primary);cursor:pointer;text-align:left;flex-wrap:wrap}
.dls-title{font-size:15px;font-weight:700}
.dls-count{min-width:22px;height:20px;padding:0 6px;border-radius:10px;background:var(--bg-surface-2);color:var(--text-primary);font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.dls-count[data-zero="true"]{color:var(--text-tertiary)}
.dls-dirty{font-size:12px;font-weight:700;color:var(--warning)}
.dls-hint{font-size:13px;color:var(--text-tertiary);margin-left:auto}
.dls-body{padding:0 0 16px 24px}
.dls-table-wrap{overflow-x:auto}
.dls-table{border-collapse:collapse;width:100%;min-width:560px}
.dls-table th{font-size:12px;font-weight:700;color:var(--text-tertiary);text-align:left;padding:6px 8px 6px 0;white-space:nowrap}
.dls-table td{padding:4px 8px 4px 0;vertical-align:top}
.dls-table .k-input{width:100%;min-width:90px;min-height:40px;font-size:15px}
.dls-table textarea.k-input{min-width:200px}
.dls-table input[type=checkbox]{width:18px;height:18px;margin-top:11px;accent-color:var(--brand-primary)}
.dls-x{width:36px;height:40px;border:0;background:transparent;color:var(--text-tertiary);cursor:pointer;border-radius:6px}
.dls-x:hover{color:var(--danger)}
.dls-actions{display:flex;align-items:center;gap:8px;padding-top:8px}
.dls-photos{list-style:none;margin:0 0 12px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.dls-photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;display:block}
.dls-upload{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border:1px solid var(--border-default);border-radius:8px;color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;overflow:hidden}
.dls-upload input{position:absolute;inset:0;opacity:0;cursor:pointer}
@media (max-width:640px){
  .dls-hint{margin-left:24px;width:100%}
  .dls-body{padding-left:0}
  .dls-table{min-width:0}
  .dls-table thead{display:none}
  .dls-table tr{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px 0;border-bottom:1px solid var(--border-default)}
  .dls-table td{display:flex;flex-direction:column;gap:2px;padding:0}
  .dls-table td::before{content:attr(data-label);font-size:12px;color:var(--text-tertiary);font-weight:600}
  /* Two columns on a 390px screen: an input never holds a column wider than it is. */
  .dls-table td{min-width:0}
  .dls-table .k-input,.dls-table textarea.k-input{min-width:0}
  .dls-table td:last-child::before{content:''}
}
`;
