'use client';
/**
 * <RelatedItems type id projectId /> — the Related Items section every record
 * detail screen carries (procore-parity-spec §1.5).
 *
 * A link is written once and shows on both records. Rows sit on the surface
 * (no boxes): type icon · number · title · status pill · unlink. A link that
 * is a pin on a drawing says "Pinned on A-101" and opens the sheet at the pin.
 * "Add link" opens a search-by-number-or-title picker over every record on the
 * job the person may see.
 *
 * Reads  GET /api/related-items?type&id · GET /api/related-items/search
 * Writes POST /api/related-items · DELETE /api/related-items?linkId
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Question, Stack, Swap, Wrench, Notebook, MapTrifold, FileText, Image as ImageIcon, ClipboardText,
  UsersThree, CalendarBlank, Handshake, ShoppingCart, Receipt, Money, FirstAidKit,
  LinkSimple, MagnifyingGlass, MapPin, X, Plus, type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { StatusPill } from '@/components/ui/Status';
import { RELATED_TYPES, type RelatedType, type RelatedRow, type RelatedHit } from '@/lib/related-items';

const ICONS: Record<RelatedType, PhosphorIcon> = {
  rfi: Question, submittal: Stack, change_order: Swap, punch_item: Wrench, daily_log: Notebook,
  drawing: MapTrifold, document: FileText, photo: ImageIcon, inspection: ClipboardText, meeting: UsersThree,
  schedule_task: CalendarBlank, commitment: Handshake, purchase_order: ShoppingCart, pay_app: Receipt,
  invoice: Money, incident: FirstAidKit,
};

export type RelatedItemsProps = {
  type: RelatedType;
  id: string;
  projectId: string | null;
  /** Section heading; pass null to leave it to the host (a tab already names it). */
  heading?: string | null;
  /** Told the count whenever the list loads, for a tab badge. */
  onCount?: (n: number) => void;
};

async function readError(r: Response, fallback: string): Promise<string> {
  const j = (await r.json().catch(() => null)) as { error?: unknown } | null;
  return j && typeof j.error === 'string' && j.error ? j.error : fallback;
}

export default function RelatedItems({ type, id, projectId, heading = 'Related items', onCount }: RelatedItemsProps) {
  const [rows, setRows] = useState<RelatedRow[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<RelatedHit[] | null>(null);
  const [busy, setBusy] = useState('');
  const [jobId, setJobId] = useState<string | null>(projectId);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;
  const noun = RELATED_TYPES[type]?.noun.toLowerCase() || 'record';

  const load = useCallback(async () => {
    setLoadErr('');
    const r = await fetch(`/api/related-items?type=${type}&id=${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' }).catch(() => null);
    if (!r) { setLoadErr("Couldn't reach the server. Check your connection."); setRows((x) => x ?? []); return; }
    if (!r.ok) { setLoadErr(await readError(r, "Couldn't load the related items.")); setRows((x) => x ?? []); return; }
    const j = (await r.json()) as { items?: RelatedRow[]; canEdit?: boolean; projectId?: string | null };
    const items = Array.isArray(j.items) ? j.items : [];
    setRows(items);
    setCanEdit(!!j.canEdit);
    if (!projectId && j.projectId) setJobId(j.projectId);
    onCountRef.current?.(items.length);
  }, [type, id, projectId]);

  useEffect(() => { setRows(null); void load(); }, [load]);
  useEffect(() => { setJobId(projectId); }, [projectId]);

  useEffect(() => {
    if (!picking || !jobId) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/related-items/search?projectId=${jobId}&q=${encodeURIComponent(q)}&exclude=${type}:${id}`, { credentials: 'include', cache: 'no-store' }).catch(() => null);
      if (!r || !r.ok) { setHits([]); setNote({ text: r ? await readError(r, "Couldn't search this job.") : "Couldn't reach the server.", bad: true }); return; }
      const j = (await r.json()) as { items?: RelatedHit[] };
      setHits(Array.isArray(j.items) ? j.items : []);
    }, 220);
    return () => clearTimeout(t);
  }, [q, picking, jobId, type, id]);

  const linked = useMemo(() => new Set((rows || []).map((r) => `${r.type}:${r.id}`)), [rows]);

  const add = async (h: RelatedHit) => {
    setBusy(`${h.type}:${h.id}`); setNote(null);
    const r = await fetch('/api/related-items', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: { type, id }, to: { type: h.type, id: h.id } }),
    }).catch(() => null);
    setBusy('');
    if (!r || (!r.ok && r.status !== 409)) { setNote({ text: r ? await readError(r, "Couldn't link those records.") : "Couldn't reach the server.", bad: true }); return; }
    setNote({ text: `Linked ${[h.number, h.title].filter(Boolean).join(' · ')}.` });
    await load();
  };

  const remove = async (row: RelatedRow) => {
    if (row.pin && !window.confirm(`This link is a pin on ${row.pin.sheet}. Unlinking also takes the pin off the sheet.`)) return;
    setBusy(row.linkId); setNote(null);
    const r = await fetch(`/api/related-items?linkId=${row.linkId}`, { method: 'DELETE', credentials: 'include' }).catch(() => null);
    setBusy('');
    if (!r || !r.ok) { setNote({ text: r ? await readError(r, "Couldn't unlink.") : "Couldn't reach the server.", bad: true }); return; }
    setNote({ text: `Unlinked ${[row.number, row.title].filter(Boolean).join(' · ')}.` });
    await load();
  };

  const count = rows?.length ?? 0;

  return (
    <section className="ri" aria-label="Related items">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ri-head">
        {heading && <h2 className="ri-title">{heading}{rows && count > 0 ? <span className="ri-count">{count}</span> : null}</h2>}
        <span className="ri-grow" />
        {canEdit && jobId && (
          <button type="button" className="ri-add" aria-expanded={picking} onClick={() => { setPicking((p) => !p); setQ(''); setHits(null); }}>
            {picking ? <X size={16} weight="bold" /> : <Plus size={16} weight="bold" />}
            {picking ? 'Done' : 'Add link'}
          </button>
        )}
      </div>

      {note && <p className={note.bad ? 'ri-note ri-bad' : 'ri-note'} role={note.bad ? 'alert' : 'status'}>{note.text}</p>}

      {picking && (
        <div className="ri-picker">
          <label className="ri-search">
            <MagnifyingGlass size={18} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by number or title — RFI 7, A-101, door hardware"
              aria-label="Search records to link"
            />
          </label>
          {hits === null ? <p className="ri-muted">Searching…</p> : hits.length === 0 ? (
            <p className="ri-muted">Nothing on this job matches{q ? ` “${q}”` : ''}.</p>
          ) : (
            <ul className="ri-list" aria-label="Records you can link">
              {hits.map((h) => {
                const Icon = ICONS[h.type];
                const key = `${h.type}:${h.id}`;
                const already = linked.has(key);
                return (
                  <li key={key}>
                    <button type="button" className="ri-row ri-pick" disabled={already || busy === key} onClick={() => void add(h)}>
                      <span className="ri-icon" aria-hidden><Icon size={18} /></span>
                      <span className="ri-main">
                        <span className="ri-line"><span className="ri-num">{h.number || h.noun}</span><span className="ri-name">{h.title}</span></span>
                        <span className="ri-meta"><span className="ri-sub">{h.noun}</span>{h.status && <StatusPill module={h.statusModule} status={h.status} size="sm" />}</span>
                      </span>
                      <span className="ri-act">{already ? 'Linked' : busy === key ? 'Linking…' : <><LinkSimple size={16} weight="bold" /> Link</>}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {rows === null ? (
        <p className="ri-muted" aria-busy="true">Loading related items…</p>
      ) : loadErr ? (
        <p className="ri-note ri-bad" role="alert">{loadErr} <button type="button" className="ri-retry" onClick={() => void load()}>Try again</button></p>
      ) : count === 0 ? (
        <p className="ri-muted">Nothing linked to this {noun} yet.{canEdit ? ' Link the RFIs, drawings, photos and other records that go with it.' : ''}</p>
      ) : (
        <ul className="ri-list" aria-label="Linked records">
          {rows.map((r) => {
            const Icon = ICONS[r.type];
            return (
              <li key={r.linkId} className="ri-row">
                <span className="ri-icon" aria-hidden><Icon size={18} /></span>
                <span className="ri-main">
                  <Link className="ri-line ri-open" href={r.href}>
                    <span className="ri-num">{r.number || r.noun}</span><span className="ri-name">{r.title}</span>
                  </Link>
                  <span className="ri-meta">
                    {r.pin && r.type === 'drawing' ? (
                      <Link className="ri-sub ri-pin" href={`/app/projects/${r.projectId || jobId}/drawings/${r.pin.drawingId}${r.pin.pinId ? `?pin=${r.pin.pinId}` : ''}`}>
                        <MapPin size={13} weight="bold" /> Pinned on {r.pin.sheet}{r.pin.page > 1 ? `, page ${r.pin.page}` : ''}
                      </Link>
                    ) : r.pin ? (
                      <span className="ri-sub"><MapPin size={13} weight="bold" /> {r.noun} · pinned on this sheet</span>
                    ) : <span className="ri-sub">{r.noun}</span>}
                    {r.status && <StatusPill module={r.statusModule} status={r.status} size="sm" />}
                  </span>
                </span>
                {canEdit && (
                  <button type="button" className="ri-x" aria-label={`Unlink ${[r.number, r.title].filter(Boolean).join(' ')}`} disabled={busy === r.linkId} onClick={() => void remove(r)}>
                    <X size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const CSS = `
.ri{display:flex;flex-direction:column;gap:8px;min-width:0}
.ri-head{display:flex;align-items:center;gap:12px;min-height:44px}
.ri-title{display:inline-flex;align-items:center;gap:8px;margin:0;font-size:var(--fs-section);font-weight:700;color:var(--title-section)}
.ri-count{font-size:13px;font-weight:700;color:var(--text-secondary)}
.ri-grow{flex:1}
.ri-add{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border:1px solid var(--border-default);border-radius:8px;background:transparent;color:var(--text-primary);font-size:14px;font-weight:600;cursor:pointer}
.ri-add:hover{background:var(--bg-hover);border-color:var(--border-strong)}
.ri-add:focus-visible,.ri-x:focus-visible,.ri-pick:focus-visible,.ri-open:focus-visible,.ri-pin:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.ri-note{margin:0;font-size:14px;color:var(--success)}
.ri-bad{color:var(--danger)}
.ri-retry{border:0;background:none;color:var(--link);font-size:14px;font-weight:600;cursor:pointer;min-height:44px;padding:0 4px}
.ri-muted{margin:0;font-size:14px;color:var(--text-secondary)}
.ri-picker{display:flex;flex-direction:column;gap:8px;padding:8px 0 12px;border-bottom:1px solid var(--border-default)}
.ri-search{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border:1px solid var(--border-default);border-radius:8px;background:var(--bg-input);color:var(--text-tertiary)}
.ri-search:focus-within{border-color:var(--border-strong)}
.ri-search input{flex:1;min-width:0;min-height:44px;border:0;background:transparent;color:var(--text-primary);font-size:16px;outline:none}
.ri-list{list-style:none;margin:0;padding:0}
.ri-list > li{border-bottom:1px solid var(--border-default)}
.ri-row{display:flex;align-items:center;gap:12px;min-height:56px;padding:6px 0;min-width:0;width:100%}
.ri-pick{border:0;background:transparent;text-align:left;cursor:pointer;color:inherit;font:inherit}
.ri-pick:hover:not(:disabled){background:var(--bg-row-hover)}
.ri-pick:disabled{cursor:default;opacity:.6}
.ri-icon{display:inline-grid;place-items:center;flex:none;width:32px;height:32px;color:var(--acc,var(--text-secondary))}
.ri-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.ri-line{display:flex;align-items:baseline;gap:8px;min-width:0;color:var(--text-primary);text-decoration:none}
.ri-open{min-height:28px;align-items:center}
.ri-open:hover .ri-name{text-decoration:underline}
.ri-num{flex:none;font-size:14px;font-weight:700;color:var(--text-primary);white-space:nowrap}
.ri-name{font-size:14px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ri-meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;min-width:0}
.ri-sub{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--text-tertiary)}
.ri-pin{color:var(--link);text-decoration:none;min-height:24px;font-weight:600}
.ri-pin:hover{color:var(--link-hover);text-decoration:underline}
.ri-act{display:inline-flex;align-items:center;gap:4px;flex:none;font-size:13px;font-weight:700;color:var(--text-secondary);padding-right:4px}
.ri-x{display:inline-grid;place-items:center;flex:none;width:44px;height:44px;border:0;border-radius:8px;background:transparent;color:var(--text-tertiary);cursor:pointer}
.ri-x:hover:not(:disabled){color:var(--danger);background:var(--bg-surface-2)}
`;
