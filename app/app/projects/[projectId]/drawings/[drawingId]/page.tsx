'use client';
/**
 * One drawing sheet: the sheet itself with its pins, the sheet's revisions,
 * and a pin list. Turn on "Drop pin", tap the sheet, pick the RFI or punch
 * item (or write a note) — the pin is saved where you tapped and opens that
 * item's page. "Upload revision" files a new revision of the same sheet number:
 * it becomes current and the older ones are marked superseded.
 *
 * Reads   GET  /api/drawings/:id/sheet
 * Pins    POST/DELETE /api/drawings/:id/pins
 * Search  GET  /api/items/search
 * Upload  POST /api/drawings/upload (same sheet number)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  PageShell, Badge, Button, EmptyState, Input, Textarea, type BadgeTone,
} from '@/components/ui/kit';
import {
  MapPin, UploadSimple, MagnifyingGlassPlus, MagnifyingGlassMinus, CaretLeft, CaretRight,
  X, Trash, ArrowSquareOut, WarningCircle, ClockCounterClockwise, Crosshair,
} from '@phosphor-icons/react';

type Pin = {
  id: string; x: number; y: number; page: number; title: string | null; description: string | null; status: string | null;
  item: { type: string; id: string; noun: string; name: string; status: string; href: string } | null;
};
type Rev = { id: string; version: string | null; status: string | null; revision_date: string | null; created_at: string; name: string | null };
type Sheet = {
  drawing: { id: string; name: string; sheet_number: string; discipline: string | null; version: string | null; status: string | null; revision_date: string | null; url: string; isPdf: boolean };
  project: { id: string; name: string } | null;
  revisions: Rev[];
  pins: Pin[];
};
type Hit = { type: string; id: string; noun: string; name: string; status: string };

const PINNABLE = new Set(['rfis', 'punch_list', 'submittals', 'inspections', 'change_orders']);
const statusTone = (s: string | null): BadgeTone => (s === 'current' ? 'ongoing' : s === 'superseded' ? 'closed' : s === 'void' ? 'overdue' : 'neutral');
const label = (s: string | null) => { const t = (s || '').replace(/_/g, ' '); return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'; };
const day = (d: string | null) => (d ? new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default function DrawingSheetPage() {
  const { projectId, drawingId } = useParams() as { projectId: string; drawingId: string };
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/drawings/${drawingId}/sheet`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't open this sheet.");
      setSheet(j);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open this sheet.");
    }
  }, [drawingId]);
  useEffect(() => { load(); }, [load]);

  // Render the PDF page to the canvas at the stage's width × zoom.
  useEffect(() => {
    if (!sheet?.drawing.isPdf || !sheet.drawing.url) return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      try {
        const pdfjs = await import('pdfjs-dist');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = await (pdfjs as any).getDocument({ url: sheet.drawing.url }).promise;
        if (cancelled) return;
        setPages(doc.numPages);
        const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        const base = p.getViewport({ scale: 1 });
        const avail = Math.max(320, (stageRef.current?.parentElement?.clientWidth ?? 900) - 2);
        const scale = (avail / base.width) * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = p.getViewport({ scale: scale * dpr });
        const c = canvasRef.current;
        const ctx = c?.getContext('2d');
        if (!c || !ctx || cancelled) return;
        c.width = vp.width; c.height = vp.height;
        c.style.width = `${vp.width / dpr}px`; c.style.height = `${vp.height / dpr}px`;
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
      } catch (e) {
        if (!cancelled) setError("This sheet's file couldn't be drawn. Try opening the file directly.");
        console.error('[drawing sheet] render', e);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sheet?.drawing.url, sheet?.drawing.isPdf, page, zoom]);

  // Item search for the pin picker.
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/items/search?projectId=${projectId}&q=${encodeURIComponent(q)}`);
      const j = await r.json().catch(() => ({}));
      setHits(((j.items || []) as Hit[]).filter((h) => PINNABLE.has(h.type)));
    }, 200);
    return () => clearTimeout(t);
  }, [q, draft, projectId]);

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dropMode) return;
    const r = e.currentTarget.getBoundingClientRect();
    setDraft({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    setQ(''); setNote(''); setMsg('');
  };

  const savePin = async (hit: Hit | null) => {
    if (!draft) return;
    if (!hit && !note.trim()) { setMsg('Pick an item or write a note.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/drawings/${drawingId}/pins`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ x_pct: draft.x, y_pct: draft.y, page_number: page, entity_type: hit?.type ?? null, entity_id: hit?.id ?? null, title: hit ? null : note.trim().slice(0, 120), description: hit ? null : note.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't save the pin.");
      setDraft(null); setDropMode(false);
      await load();
      setActive(j.pin?.id ?? null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save the pin.");
    } finally {
      setBusy(false);
    }
  };

  const removePin = async (pin: Pin) => {
    const r = await fetch(`/api/drawings/${drawingId}/pins?pinId=${pin.id}`, { method: 'DELETE' });
    if (r.ok) { setActive(null); load(); } else { const j = await r.json().catch(() => ({})); setMsg(j.error || "Couldn't remove the pin."); }
  };

  const uploadRevision = async (f: File) => {
    if (!sheet) return;
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('projectId', projectId);
      fd.append('sheet_number', sheet.drawing.sheet_number);
      fd.append('title', sheet.drawing.name);
      if (sheet.drawing.discipline) fd.append('discipline', sheet.drawing.discipline);
      const r = await fetch('/api/drawings/upload', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.drawing?.id) throw new Error(j.error || "Couldn't upload the revision.");
      router.push(`/app/projects/${projectId}/drawings/${j.drawing.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't upload the revision.");
    } finally {
      setBusy(false);
    }
  };

  const base = `/app/projects/${projectId}`;
  if (error && !sheet) {
    return (
      <PageShell crumbs={[{ label: 'Drawings', href: `${base}/drawings` }]} title="Drawing">
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't open this sheet" text={error} action={<Button href={`${base}/drawings`}>Back to drawings</Button>} />
      </PageShell>
    );
  }
  const d = sheet?.drawing;
  const pinsHere = (sheet?.pins || []).filter((p) => p.page === page);
  const superseded = d?.status === 'superseded';
  const current = sheet?.revisions.find((r) => r.status === 'current');

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: sheet?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Drawings', href: `${base}/drawings` },
        { label: d?.sheet_number || 'Sheet' },
      ]}
      title={d ? `${d.sheet_number} · ${d.name}` : 'Loading sheet…'}
      badge={d ? <Badge tone={statusTone(d.status)} dot>{label(d.status)}{d.version ? ` · Rev ${d.version}` : ''}</Badge> : undefined}
      actions={
        <>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRevision(f); e.target.value = ''; }} />
          <Button icon={<UploadSimple size={15} />} onClick={() => fileRef.current?.click()} disabled={!sheet || busy}>Upload revision</Button>
          <Button variant="primary" icon={<MapPin size={15} weight="bold" />} onClick={() => { setDropMode((v) => !v); setDraft(null); }} disabled={!sheet}>
            {dropMode ? 'Cancel pin' : 'Drop pin'}
          </Button>
        </>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {superseded && current && (
        <div className="dv-banner">
          <ClockCounterClockwise size={16} /> You&apos;re looking at an older revision.
          <a className="k-link" href={`${base}/drawings/${current.id}`}>Open the current one (Rev {current.version || '—'})</a>
        </div>
      )}
      {msg && <div className="dv-msg" role="alert">{msg}</div>}

      <div className="dv-layout">
        <div className="dv-main">
          <div className="dv-bar">
            <Button size="sm" icon={<MagnifyingGlassMinus size={14} />} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} />
            <span className="dv-zoom">{Math.round(zoom * 100)}%</span>
            <Button size="sm" icon={<MagnifyingGlassPlus size={14} />} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} />
            {pages > 1 && (
              <>
                <span className="dv-sep" />
                <Button size="sm" icon={<CaretLeft size={14} />} aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} />
                <span className="dv-zoom">Page {page} of {pages}</span>
                <Button size="sm" icon={<CaretRight size={14} />} aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} />
              </>
            )}
            <span className="dv-spacer" />
            {dropMode && <span className="dv-hint"><Crosshair size={14} /> Tap the sheet where the pin goes</span>}
            {d?.url && <a className="k-link dv-open" href={d.url} target="_blank" rel="noreferrer">Open file <ArrowSquareOut size={13} /></a>}
          </div>
          <div className="dv-scroll">
            <div ref={stageRef} className="dv-stage" data-drop={dropMode || undefined} onClick={onStageClick} style={d && !d.isPdf ? { width: `${zoom * 100}%` } : undefined}>
              {!sheet ? <div className="dv-loading">Loading sheet…</div> : d?.isPdf ? <canvas ref={canvasRef} /> : d?.url ? <img src={d.url} alt={d.name} draggable={false} /> : <div className="dv-loading">This sheet has no file.</div>}
              {rendering && <div className="dv-rendering">Drawing the sheet…</div>}
              {pinsHere.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="dv-pin"
                  data-on={active === p.id || undefined}
                  data-kind={p.item?.type || 'note'}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  title={p.item ? p.item.name : p.title || 'Note'}
                  onClick={(e) => { e.stopPropagation(); setActive(p.id); }}
                >
                  {i + 1}
                </button>
              ))}
              {draft && <span className="dv-pin" data-draft style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>+</span>}
            </div>
          </div>
        </div>

        <aside className="dv-side">
          {draft ? (
            <section className="dv-panel">
              <header><strong>New pin</strong><button type="button" className="dv-x" aria-label="Cancel" onClick={() => setDraft(null)}><X size={14} /></button></header>
              <Input placeholder="Find an RFI, punch item, submittal…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
              <div className="dv-hits">
                {hits.length === 0 ? <p className="dv-dim">No matching items on this job.</p> : hits.map((h) => (
                  <button key={`${h.type}:${h.id}`} type="button" className="dv-hit" disabled={busy} onClick={() => savePin(h)}>
                    <span>{h.name}</span><small>{h.noun} · {h.status}</small>
                  </button>
                ))}
              </div>
              <p className="dv-dim">Or pin a note:</p>
              <Textarea rows={2} placeholder="e.g. Field-verify this beam pocket" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="primary" disabled={busy || !note.trim()} onClick={() => savePin(null)}>Save note pin</Button>
            </section>
          ) : null}

          <section className="dv-panel">
            <header><strong>Pins on this sheet</strong><span className="dv-dim">{sheet?.pins.length ?? 0}</span></header>
            {(sheet?.pins.length ?? 0) === 0 ? (
              <p className="dv-dim">No pins yet. Tap Drop pin, then tap the sheet.</p>
            ) : sheet!.pins.map((p, i) => (
              <div key={p.id} className="dv-row" data-on={active === p.id || undefined} onClick={() => { setActive(p.id); if (p.page !== page) setPage(p.page); }}>
                <span className="dv-num" data-kind={p.item?.type || 'note'}>{(sheet!.pins.filter((x) => x.page === p.page).indexOf(p)) + 1 || i + 1}</span>
                <div className="dv-row-text">
                  {p.item ? <a className="k-link" href={p.item.href} onClick={(e) => e.stopPropagation()}>{p.item.name}</a> : <span>{p.title || 'Note'}</span>}
                  <small className="dv-dim">{p.item ? `${p.item.noun} · ${p.item.status}` : p.description && p.description !== p.title ? p.description : 'Note'}{pages > 1 ? ` · page ${p.page}` : ''}</small>
                </div>
                <button type="button" className="dv-x" aria-label="Remove pin" onClick={(e) => { e.stopPropagation(); removePin(p); }}><Trash size={14} /></button>
              </div>
            ))}
          </section>

          <section className="dv-panel">
            <header><strong>Revisions</strong><span className="dv-dim">{sheet?.revisions.length ?? 0}</span></header>
            {(sheet?.revisions || []).map((r) => (
              <a key={r.id} className="dv-rev" data-on={r.id === drawingId || undefined} href={`${base}/drawings/${r.id}`}>
                <span>Rev {r.version || '—'}</span>
                <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge>
                <small className="dv-dim">{day(r.revision_date || r.created_at)}</small>
              </a>
            ))}
          </section>
        </aside>
      </div>
    </PageShell>
  );
}

const CSS = `
.dv-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
@media (max-width:900px){.dv-layout{grid-template-columns:1fr}}
.dv-main{min-width:0;border:1px solid var(--border-default);border-radius:10px;background:var(--bg-surface);overflow:hidden}
.dv-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border-default);flex-wrap:wrap}
.dv-zoom{font-size:13px;color:var(--text-secondary);min-width:44px;text-align:center}
.dv-sep{width:1px;height:20px;background:var(--border-default)}
.dv-spacer{flex:1}
.dv-hint{display:inline-flex;gap:6px;align-items:center;font-size:13px;color:var(--text-primary)}
.dv-open{display:inline-flex;gap:4px;align-items:center;font-size:13px}
.dv-scroll{overflow:auto;max-height:calc(100vh - 260px);min-height:360px;background:var(--bg-base)}
.dv-stage{position:relative;display:inline-block;min-width:100%;line-height:0}
.dv-stage img{width:100%;height:auto;display:block;user-select:none}
.dv-stage canvas{display:block}
.dv-stage[data-drop]{cursor:crosshair}
.dv-loading,.dv-rendering{line-height:1.4;padding:40px;color:var(--text-secondary);font-size:14px}
.dv-rendering{position:absolute;top:8px;left:8px;padding:6px 10px;background:var(--bg-surface-2);border-radius:6px}
.dv-pin{position:absolute;transform:translate(-50%,-100%);min-width:26px;height:26px;padding:0 6px;border-radius:13px 13px 13px 2px;border:2px solid var(--bg-base);background:var(--danger);color:var(--text-primary);font:700 12px/22px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.5)}
.dv-pin[data-kind="punch_list"]{background:var(--warning);color:var(--bg-base)}
.dv-pin[data-kind="note"]{background:var(--text-tertiary);color:var(--bg-base)}
.dv-pin[data-kind="submittals"],.dv-pin[data-kind="inspections"],.dv-pin[data-kind="change_orders"]{background:var(--success);color:var(--bg-base)}
.dv-pin[data-on]{outline:3px solid var(--brand-primary);outline-offset:1px}
.dv-pin[data-draft]{background:var(--brand-primary);color:var(--bg-base);pointer-events:none}
.dv-side{display:grid;gap:12px}
.dv-panel{border:1px solid var(--border-default);border-radius:10px;background:var(--bg-surface);padding:12px;display:grid;gap:8px}
.dv-panel header{display:flex;justify-content:space-between;align-items:center;font-size:14px}
.dv-dim{color:var(--text-secondary);font-size:13px;margin:0}
.dv-x{background:none;border:0;color:var(--text-secondary);cursor:pointer;min-width:32px;min-height:32px;border-radius:6px}
.dv-x:hover{color:var(--text-primary);background:var(--bg-surface-2)}
.dv-hits{display:grid;gap:4px;max-height:220px;overflow:auto}
.dv-hit{display:grid;text-align:left;gap:2px;padding:8px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-surface-2);color:var(--text-primary);cursor:pointer;font-size:14px}
.dv-hit small{color:var(--text-secondary);font-size:12px}
.dv-hit:hover{border-color:var(--brand-primary)}
.dv-row{display:flex;gap:10px;align-items:center;padding:6px;border-radius:8px;cursor:pointer}
.dv-row[data-on]{background:var(--bg-surface-2)}
.dv-row-text{display:grid;min-width:0;flex:1;font-size:14px}
.dv-row-text small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dv-num{min-width:24px;height:24px;border-radius:12px;display:grid;place-items:center;font:700 12px system-ui,sans-serif;background:var(--danger);color:var(--text-primary)}
.dv-num[data-kind="punch_list"]{background:var(--warning);color:var(--bg-base)}
.dv-num[data-kind="note"]{background:var(--text-tertiary);color:var(--bg-base)}
.dv-num[data-kind="submittals"],.dv-num[data-kind="inspections"],.dv-num[data-kind="change_orders"]{background:var(--success);color:var(--bg-base)}
.dv-rev{display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;color:var(--text-primary);text-decoration:none;font-size:14px}
.dv-rev small{text-align:right}
.dv-rev[data-on]{background:var(--bg-surface-2)}
.dv-rev:hover{background:var(--bg-surface-2)}
.dv-banner{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;margin-bottom:12px;border:1px solid var(--warning);border-radius:8px;color:var(--text-primary);font-size:14px}
.dv-msg{padding:10px 12px;margin-bottom:12px;border:1px solid var(--danger);border-radius:8px;color:var(--text-primary);font-size:14px}
`;
