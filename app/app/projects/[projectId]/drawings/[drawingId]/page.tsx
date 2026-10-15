'use client';
/**
 * Drawing workspace — one sheet, full height.
 *
 *   sheets rail (search, by discipline) | the sheet + floating toolbar | pins · revisions · info
 *
 * Tools: Pan (drag to move, Ctrl/⌘ + wheel to zoom), RFI pin, Punch pin, Note
 * pin. Dropping an RFI or punch pin offers "Create here" (writes the RFI or
 * punch item with this sheet as its location, then pins it) or linking one
 * that already exists. Layers show/hide pin kinds. Compare overlays any older
 * revision: ink only on the old sheet shows red (removed), only on this one
 * green (added), on both stays dark.
 *
 * Reads   GET  /api/drawings/:id/sheet · /api/drawings/list · /api/items/search
 * Writes  POST/DELETE /api/drawings/:id/pins · POST /api/rfis/create ·
 *         POST /api/punch-list/create · POST /api/drawings/upload
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, type BadgeTone } from '@/components/ui/kit';
import {
  Hand, Question, Wrench, NotePencil, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowsOut, CaretLeft, CaretRight,
  UploadSimple, Stack, X, Trash, ArrowSquareOut, WarningCircle, ClockCounterClockwise, MagnifyingGlass,
  SquareHalf, CheckCircle, Files, Info, MapPin, Plus, LinkSimple, SidebarSimple,
} from '@phosphor-icons/react';

type Item = { type: string; id: string; noun: string; name: string; status: string; closed?: boolean; href: string };
type Pin = { id: string; x: number; y: number; page: number; title: string | null; description: string | null; status: string | null; item: Item | null; created_at: string };
type Rev = { id: string; version: string | null; status: string | null; revision_date: string | null; created_at: string; name: string | null; url: string | null; isPdf: boolean };
type Sheet = {
  drawing: { id: string; name: string; sheet_number: string; discipline: string | null; version: string | null; status: string | null; revision_date: string | null; url: string; isPdf: boolean };
  project: { id: string; name: string } | null;
  revisions: Rev[];
  pins: Pin[];
};
type ListRow = { id: string; sheet_number: string; title: string; discipline: string | null; status: string | null; revision: string | null };
type Hit = { type: string; id: string; noun: string; name: string; status: string };
type Tool = 'pan' | 'rfi' | 'punch' | 'note';
type Kind = 'rfi' | 'punch' | 'note' | 'other';

const KIND_OF = (p: Pin): Kind => (!p.item ? 'note' : p.item.type === 'rfis' ? 'rfi' : p.item.type === 'punch_list' ? 'punch' : 'other');
const KIND_LABEL: Record<Kind, string> = { rfi: 'RFIs', punch: 'Punch', note: 'Notes', other: 'Other items' };
const statusTone = (s: string | null): BadgeTone => (s === 'current' ? 'ongoing' : s === 'superseded' ? 'closed' : s === 'void' ? 'overdue' : 'neutral');
const label = (s: string | null) => { const t = (s || '').replace(/_/g, ' '); return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'; };
const day = (d: string | null) => (d ? new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

function KindIcon({ k, size = 14 }: { k: Kind; size?: number }) {
  if (k === 'rfi') return <Question size={size} weight="bold" />;
  if (k === 'punch') return <Wrench size={size} weight="bold" />;
  if (k === 'note') return <NotePencil size={size} weight="bold" />;
  return <MapPin size={size} weight="bold" />;
}

/** Render one PDF page (or image) into a canvas at a given CSS width. */
async function drawSource(url: string, isPdf: boolean, page: number, cssWidth: number, canvas: HTMLCanvasElement): Promise<number> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return 1;
  if (isPdf) {
    const pdfjs = await import('pdfjs-dist');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (pdfjs as any).getDocument({ url }).promise;
    const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
    const base = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: (cssWidth / base.width) * dpr });
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = `${vp.width / dpr}px`; canvas.style.height = `${vp.height / dpr}px`;
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
    return doc.numPages;
  }
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const h = (cssWidth / img.naturalWidth) * img.naturalHeight;
  canvas.width = cssWidth * dpr; canvas.height = h * dpr;
  canvas.style.width = `${cssWidth}px`; canvas.style.height = `${h}px`;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return 1;
}

/** Overlay two renders: ink only on old → red, only on new → green, both → dark. */
function compareInto(target: HTMLCanvasElement, oldC: HTMLCanvasElement) {
  const ctx = target.getContext('2d');
  const o = document.createElement('canvas');
  o.width = target.width; o.height = target.height;
  const octx = o.getContext('2d');
  if (!ctx || !octx) return;
  octx.drawImage(oldC, 0, 0, o.width, o.height);
  const a = ctx.getImageData(0, 0, target.width, target.height);
  const b = octx.getImageData(0, 0, o.width, o.height);
  const A = a.data, B = b.data;
  for (let i = 0; i < A.length; i += 4) {
    const inkNew = 255 - (A[i] + A[i + 1] + A[i + 2]) / 3 > 60;
    const inkOld = 255 - (B[i] + B[i + 1] + B[i + 2]) / 3 > 60;
    if (inkNew && inkOld) { A[i] = 40; A[i + 1] = 40; A[i + 2] = 40; }
    else if (inkNew) { A[i] = 22; A[i + 1] = 163; A[i + 2] = 74; }
    else if (inkOld) { A[i] = 220; A[i + 1] = 38; A[i + 2] = 38; }
    else { A[i] = 255; A[i + 1] = 255; A[i + 2] = 255; }
    A[i + 3] = 255;
  }
  ctx.putImageData(a, 0, 0);
}

export default function DrawingWorkspace() {
  const { projectId, drawingId } = useParams() as { projectId: string; drawingId: string };
  const router = useRouter();
  const base = `/app/projects/${projectId}`;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [list, setList] = useState<ListRow[] | null>(null);
  const [railQ, setRailQ] = useState('');
  const [railOpen, setRailOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [tool, setTool] = useState<Tool>('pan');
  const [layers, setLayers] = useState<Record<Kind, boolean>>({ rfi: true, punch: true, note: true, other: true });
  const [compareId, setCompareId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; kind: Exclude<Tool, 'pan'> } | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<'pins' | 'revs' | 'info'>('pins');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/drawings/${drawingId}/sheet`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't open this sheet.");
      setSheet(j); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't open this sheet."); }
  }, [drawingId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch(`/api/drawings/list?projectId=${projectId}`).then((r) => r.json()).then((j) => setList(j.drawings || [])).catch(() => setList([]));
  }, [projectId]);

  // Draw the sheet (and the compare overlay when on).
  useEffect(() => {
    const d = sheet?.drawing;
    const c = canvasRef.current;
    if (!d?.url || !c) return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      try {
        const width = Math.max(600, ((scrollRef.current?.clientWidth ?? 1000) - 64)) * zoom;
        const n = await drawSource(d.url, d.isPdf, page, width, c);
        if (cancelled) return;
        setPages(n);
        const old = compareId ? sheet!.revisions.find((r) => r.id === compareId) : null;
        if (old?.url) {
          const oc = document.createElement('canvas');
          await drawSource(old.url, old.isPdf, page, width, oc);
          if (!cancelled) compareInto(c, oc);
        }
      } catch (e) {
        console.error('[drawing workspace] render', e);
        if (!cancelled) setMsg({ text: compareId ? "Couldn't draw the comparison — the older file may not be readable." : "This sheet's file couldn't be drawn. Use Open file." });
      } finally { if (!cancelled) setRendering(false); }
    })();
    return () => { cancelled = true; };
  }, [sheet, page, zoom, compareId]);

  // Search for the pin picker, limited to the kind being pinned.
  useEffect(() => {
    if (!draft || draft.kind === 'note') return;
    const want = draft.kind === 'rfi' ? 'rfis' : 'punch_list';
    const t = setTimeout(async () => {
      const r = await fetch(`/api/items/search?projectId=${projectId}&q=${encodeURIComponent(q)}`);
      const j = await r.json().catch(() => ({}));
      setHits(((j.items || []) as Hit[]).filter((h) => h.type === want));
    }, 180);
    return () => clearTimeout(t);
  }, [q, draft, projectId]);

  // Ctrl/⌘ + wheel zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.5, +(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pinsAll = sheet?.pins || [];
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { rfi: 0, punch: 0, note: 0, other: 0 };
    pinsAll.forEach((p) => { c[KIND_OF(p)]++; });
    return c;
  }, [pinsAll]);
  const openRfis = pinsAll.filter((p) => KIND_OF(p) === 'rfi' && !p.item?.closed).length;
  const openPunch = pinsAll.filter((p) => KIND_OF(p) === 'punch' && !p.item?.closed).length;
  const pinsHere = pinsAll.filter((p) => p.page === page && layers[KIND_OF(p)]);
  const pinNumber = (p: Pin) => pinsAll.filter((x) => x.page === p.page).indexOf(p) + 1;

  const onStageDown = (e: React.MouseEvent) => {
    if (tool !== 'pan' || !scrollRef.current) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: scrollRef.current.scrollLeft, st: scrollRef.current.scrollTop };
  };
  const onStageMove = (e: React.MouseEvent) => {
    const d = drag.current, el = scrollRef.current;
    if (!d || !el) return;
    el.scrollLeft = d.sl - (e.clientX - d.x);
    el.scrollTop = d.st - (e.clientY - d.y);
  };
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool === 'pan') { setActive(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setDraft({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, kind: tool });
    setQ(''); setNewTitle(''); setMsg(null);
  };

  const postPin = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/drawings/${drawingId}/pins`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x_pct: draft!.x, y_pct: draft!.y, page_number: page, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Couldn't save the pin.");
    return j.pin?.id as string | undefined;
  };
  const finish = async (pinId: string | undefined, text: string) => {
    setDraft(null); setTool('pan'); await load(); setActive(pinId ?? null); setTab('pins'); setMsg({ text, ok: true });
  };
  const linkExisting = async (h: Hit) => {
    setBusy(true);
    try { await finish(await postPin({ entity_type: h.type, entity_id: h.id }), `Pinned ${h.name}.`); }
    catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  };
  const createHere = async () => {
    if (!draft || !sheet || !newTitle.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const where = `${sheet.drawing.sheet_number}${sheet.drawing.name ? ` · ${sheet.drawing.name}` : ''}`;
      let type = '', id = '', name = newTitle.trim();
      if (draft.kind === 'rfi') {
        const r = await fetch('/api/rfis/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId, subject: name, question: name, drawing_reference: where }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !(j.rfi?.id || j.data?.rfi?.id)) throw new Error(j.error || "Couldn't create the RFI.");
        type = 'rfis'; id = j.rfi?.id || j.data.rfi.id; name = `RFI ${j.rfi?.rfi_number ?? ''}`.trim() + ` · ${name}`;
      } else if (draft.kind === 'punch') {
        const r = await fetch('/api/punch-list/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId, title: name, location: where }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !(j.item?.id || j.data?.item?.id)) throw new Error(j.error || "Couldn't create the punch item.");
        type = 'punch_list'; id = j.item?.id || j.data.item.id;
      } else {
        await finish(await postPin({ title: name.slice(0, 120), description: name }), 'Note pinned.');
        return;
      }
      await finish(await postPin({ entity_type: type, entity_id: id }), `${draft.kind === 'rfi' ? 'RFI' : 'Punch item'} created and pinned — ${name}.`);
    } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  };
  const removePin = async (p: Pin) => {
    const r = await fetch(`/api/drawings/${drawingId}/pins?pinId=${p.id}`, { method: 'DELETE' });
    if (r.ok) { setActive(null); await load(); setMsg({ text: 'Pin removed. The item itself is untouched.', ok: true }); }
    else { const j = await r.json().catch(() => ({})); setMsg({ text: j.error || "Couldn't remove the pin." }); }
  };
  const uploadRevision = async (f: File) => {
    if (!sheet) return;
    setBusy(true); setMsg({ text: 'Uploading the new revision…', ok: true });
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('projectId', projectId); fd.append('sheet_number', sheet.drawing.sheet_number); fd.append('title', sheet.drawing.name);
      if (sheet.drawing.discipline) fd.append('discipline', sheet.drawing.discipline);
      const r = await fetch('/api/drawings/upload', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.drawing?.id) throw new Error(j.error || "Couldn't upload the revision.");
      router.push(`${base}/drawings/${j.drawing.id}`);
    } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  };

  const rail = useMemo(() => {
    const qq = railQ.trim().toLowerCase();
    const rows = (list || []).filter((d) => d.status !== 'superseded' || d.id === drawingId)
      .filter((d) => !qq || `${d.sheet_number} ${d.title}`.toLowerCase().includes(qq));
    const groups = new Map<string, ListRow[]>();
    rows.forEach((d) => groups.set(d.discipline || 'Other', [...(groups.get(d.discipline || 'Other') || []), d]));
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [list, railQ, drawingId]);

  if (error && !sheet) {
    return (
      <div className="k-page">
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't open this sheet" text={error} action={<Button href={`${base}/drawings`}>Back to drawings</Button>} />
      </div>
    );
  }
  const d = sheet?.drawing;
  const current = sheet?.revisions.find((r) => r.status === 'current');
  const older = (sheet?.revisions || []).filter((r) => r.id !== drawingId);
  const activePin = pinsAll.find((p) => p.id === active) || null;

  return (
    <div className="dw" data-rail={railOpen || undefined}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRevision(f); e.target.value = ''; }} />

      {/* Header */}
      <header className="dw-head">
        <nav className="dw-crumbs"><Link href={`${base}/overview`}>{sheet?.project?.name || 'Job'}</Link><span>/</span><Link href={`${base}/drawings`}>Drawings</Link><span>/</span><b>{d?.sheet_number || '…'}</b></nav>
        <div className="dw-titlerow">
          <h1 className="k-title">{d ? <>{d.sheet_number} <span className="dw-sub">{d.name}</span></> : 'Loading sheet…'}</h1>
          {d && <Badge tone={statusTone(d.status)} dot>{label(d.status)}{d.version ? ` · Rev ${d.version}` : ''}</Badge>}
          <span className="dw-grow" />
          <Button icon={<UploadSimple size={15} />} onClick={() => fileRef.current?.click()} disabled={!sheet || busy}>Upload revision</Button>
        </div>
        <div className="dw-stats">
          <button type="button" className="dw-stat" data-k="rfi" onClick={() => { setTab('pins'); setLayers((l) => ({ ...l, rfi: true })); }}><Question size={18} weight="bold" /><b>{openRfis}</b><span>Open RFIs</span></button>
          <button type="button" className="dw-stat" data-k="punch" onClick={() => { setTab('pins'); setLayers((l) => ({ ...l, punch: true })); }}><Wrench size={18} weight="bold" /><b>{openPunch}</b><span>Open punch</span></button>
          <button type="button" className="dw-stat" data-k="note" onClick={() => setTab('pins')}><NotePencil size={18} weight="bold" /><b>{counts.note}</b><span>Notes</span></button>
          <button type="button" className="dw-stat" data-k="rev" onClick={() => setTab('revs')}><ClockCounterClockwise size={18} weight="bold" /><b>{sheet?.revisions.length ?? '—'}</b><span>Revisions</span></button>
          <div className="dw-stat" data-k="info"><Files size={18} weight="bold" /><b>{d?.discipline || '—'}</b><span>{d ? `Issued ${day(d.revision_date)}` : 'Discipline'}</span></div>
        </div>
        {d?.status === 'superseded' && current && (
          <div className="dw-banner"><ClockCounterClockwise size={16} /> Older revision. <Link className="k-link" href={`${base}/drawings/${current.id}`}>Open the current sheet (Rev {current.version || '—'})</Link></div>
        )}
      </header>

      <div className="dw-body">
        {/* Sheets rail */}
        <aside className="dw-rail" aria-label="Sheets">
          <div className="dw-rail-search"><MagnifyingGlass size={14} /><input value={railQ} onChange={(e) => setRailQ(e.target.value)} placeholder="Find a sheet" aria-label="Find a sheet" /></div>
          <div className="dw-rail-list">
            {list === null ? <p className="dw-dim">Loading sheets…</p> : rail.length === 0 ? <p className="dw-dim">No sheets match.</p> : rail.map(([disc, rows]) => (
              <div key={disc}>
                <p className="dw-rail-h">{disc} <span>{rows.length}</span></p>
                {rows.map((r) => (
                  <Link key={r.id} href={`${base}/drawings/${r.id}`} className="dw-rail-row" data-on={r.id === drawingId || undefined}>
                    <span className="dw-rail-thumb"><Files size={16} /></span>
                    <span className="dw-rail-t"><b>{r.sheet_number}</b><small>{r.title}</small></span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <main className="dw-canvas">
          <div className="dw-toolbar" role="toolbar" aria-label="Drawing tools">
            <button type="button" className="dw-tb" aria-label={railOpen ? 'Hide sheets' : 'Show sheets'} onClick={() => setRailOpen((v) => !v)}><SidebarSimple size={18} /></button>
            <span className="dw-tb-sep" />
            {([['pan', 'Pan', <Hand key="h" size={18} />], ['rfi', 'RFI pin', <Question key="q" size={18} weight="bold" />], ['punch', 'Punch pin', <Wrench key="w" size={18} weight="bold" />], ['note', 'Note pin', <NotePencil key="n" size={18} weight="bold" />]] as [Tool, string, React.ReactNode][]).map(([k, l, icon]) => (
              <button key={k} type="button" className="dw-tb" data-tool={k} data-on={tool === k || undefined} aria-pressed={tool === k} title={l} onClick={() => { setTool(k); setDraft(null); }}>
                {icon}<span className="dw-tb-l">{l}</span>
              </button>
            ))}
            <span className="dw-tb-sep" />
            <button type="button" className="dw-tb" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><MagnifyingGlassMinus size={18} /></button>
            <span className="dw-tb-v">{Math.round(zoom * 100)}%</span>
            <button type="button" className="dw-tb" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}><MagnifyingGlassPlus size={18} /></button>
            <button type="button" className="dw-tb" aria-label="Fit to width" title="Fit" onClick={() => setZoom(1)}><ArrowsOut size={18} /></button>
            {pages > 1 && (
              <>
                <span className="dw-tb-sep" />
                <button type="button" className="dw-tb" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><CaretLeft size={18} /></button>
                <span className="dw-tb-v">{page} / {pages}</span>
                <button type="button" className="dw-tb" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><CaretRight size={18} /></button>
              </>
            )}
            <span className="dw-tb-sep" />
            <details className="dw-dd">
              <summary className="dw-tb"><Stack size={18} /><span className="dw-tb-l">Layers</span></summary>
              <div className="dw-dd-menu">
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <label key={k} className="dw-check"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} /><span className="dw-dot" data-k={k}><KindIcon k={k} size={12} /></span>{KIND_LABEL[k]} <small>{counts[k]}</small></label>
                ))}
              </div>
            </details>
            {older.length > 0 && (
              <details className="dw-dd">
                <summary className="dw-tb" data-on={compareId || undefined}><SquareHalf size={18} /><span className="dw-tb-l">Compare</span></summary>
                <div className="dw-dd-menu">
                  <button type="button" className="dw-dd-item" data-on={!compareId || undefined} onClick={() => setCompareId(null)}>Off</button>
                  {older.map((r) => <button key={r.id} type="button" className="dw-dd-item" data-on={compareId === r.id || undefined} onClick={() => setCompareId(r.id)}>Against Rev {r.version || '—'} · {day(r.revision_date || r.created_at)}</button>)}
                </div>
              </details>
            )}
            {d?.url && <a className="dw-tb" href={d.url} target="_blank" rel="noreferrer" title="Open file"><ArrowSquareOut size={18} /></a>}
          </div>

          {compareId && <div className="dw-legend"><i data-k="add" /> Added in this revision <i data-k="del" /> Removed since Rev {sheet?.revisions.find((r) => r.id === compareId)?.version || '—'} <i data-k="same" /> Unchanged</div>}
          {tool !== 'pan' && !draft && <div className="dw-hint"><KindIcon k={tool as Kind} size={14} /> Tap the sheet where the {tool === 'rfi' ? 'RFI' : tool === 'punch' ? 'punch item' : 'note'} goes · Esc to cancel</div>}
          {msg && <div className="dw-toast" data-ok={msg.ok || undefined} role="status">{msg.text}<button type="button" aria-label="Dismiss" onClick={() => setMsg(null)}><X size={12} /></button></div>}

          <div ref={scrollRef} className="dw-scroll" data-tool={tool} onMouseDown={onStageDown} onMouseMove={onStageMove} onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(null); setTool('pan'); } }} tabIndex={-1}>
            <div className="dw-paper" onClick={onStageClick}>
              <canvas ref={canvasRef} />
              {rendering && <div className="dw-rendering"><span className="dw-spin" /> Drawing the sheet…</div>}
              {pinsHere.map((p) => {
                const k = KIND_OF(p);
                return (
                  <button key={p.id} type="button" className="dw-pin" data-k={k} data-closed={p.item?.closed || undefined} data-on={active === p.id || undefined}
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-label={p.item ? p.item.name : p.title || 'Note'}
                    onClick={(e) => { e.stopPropagation(); setActive(p.id); setTab('pins'); }}>
                    <span className="dw-pin-head">{p.item?.closed ? <CheckCircle size={14} weight="fill" /> : <KindIcon k={k} />}</span>
                    <span className="dw-pin-n">{pinNumber(p)}</span>
                  </button>
                );
              })}
              {activePin && activePin.page === page && (
                <div className="dw-card" style={{ left: `${activePin.x * 100}%`, top: `${activePin.y * 100}%` }} onClick={(e) => e.stopPropagation()}>
                  <div className="dw-card-top"><span className="dw-dot" data-k={KIND_OF(activePin)}><KindIcon k={KIND_OF(activePin)} size={12} /></span><b>{activePin.item ? activePin.item.noun : 'Note'}</b>{activePin.item && <Badge tone={activePin.item.closed ? 'completed' : 'under_contract'}>{activePin.item.status}</Badge>}<button type="button" aria-label="Close" onClick={() => setActive(null)}><X size={12} /></button></div>
                  <p>{activePin.item ? activePin.item.name : activePin.title || activePin.description}</p>
                  <div className="dw-card-act">
                    {activePin.item && <Link className="k-btn k-btn-primary k-btn-sm" href={activePin.item.href}>Open {activePin.item.noun.toLowerCase()}</Link>}
                    <button type="button" className="k-btn k-btn-ghost k-btn-sm" onClick={() => removePin(activePin)}><Trash size={13} /> Remove pin</button>
                  </div>
                </div>
              )}
              {draft && (
                <>
                  <span className="dw-pin" data-k={draft.kind} data-draft style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}><span className="dw-pin-head"><Plus size={14} weight="bold" /></span></span>
                  <div className="dw-card dw-new" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} onClick={(e) => e.stopPropagation()}>
                    <div className="dw-card-top"><span className="dw-dot" data-k={draft.kind}><KindIcon k={draft.kind} size={12} /></span><b>{draft.kind === 'rfi' ? 'RFI here' : draft.kind === 'punch' ? 'Punch item here' : 'Note here'}</b><button type="button" aria-label="Cancel" onClick={() => setDraft(null)}><X size={12} /></button></div>
                    <input autoFocus className="k-input" placeholder={draft.kind === 'rfi' ? 'What do you need answered?' : draft.kind === 'punch' ? 'What needs fixing?' : 'Write the note'} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void createHere(); }} />
                    <button type="button" className="k-btn k-btn-primary k-btn-sm" disabled={busy || !newTitle.trim()} onClick={() => void createHere()}>
                      <Plus size={13} weight="bold" /> {busy ? 'Saving…' : draft.kind === 'rfi' ? 'Create RFI & pin' : draft.kind === 'punch' ? 'Create punch item & pin' : 'Pin note'}
                    </button>
                    {draft.kind !== 'note' && (
                      <>
                        <p className="dw-or"><LinkSimple size={12} /> or pin one that exists</p>
                        <input className="k-input" placeholder={`Search ${draft.kind === 'rfi' ? 'RFIs' : 'punch items'}`} value={q} onChange={(e) => setQ(e.target.value)} />
                        <div className="dw-hits">
                          {hits.length === 0 ? <p className="dw-dim">None found on this job.</p> : hits.slice(0, 8).map((h) => (
                            <button key={h.id} type="button" className="dw-hit" disabled={busy} onClick={() => void linkExisting(h)}><span>{h.name}</span><small>{h.status}</small></button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </main>

        {/* Right panel */}
        <aside className="dw-panel">
          <div className="dw-tabs" role="tablist">
            {([['pins', `Pins ${pinsAll.length}`], ['revs', `Revisions ${sheet?.revisions.length ?? ''}`], ['info', 'Info']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} data-on={tab === k || undefined} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'pins' && (
            <div className="dw-pane">
              {pinsAll.length === 0 ? (
                <div className="dw-empty"><MapPin size={28} /><b>No pins yet</b><span>Pick RFI, Punch or Note in the toolbar, then tap the sheet.</span></div>
              ) : (Object.keys(KIND_LABEL) as Kind[]).filter((k) => counts[k] > 0).map((k) => (
                <div key={k}>
                  <p className="dw-group"><span className="dw-dot" data-k={k}><KindIcon k={k} size={12} /></span>{KIND_LABEL[k]}<span>{counts[k]}</span></p>
                  {pinsAll.filter((p) => KIND_OF(p) === k).map((p) => (
                    <div key={p.id} className="dw-row" data-on={active === p.id || undefined} data-closed={p.item?.closed || undefined}
                      onClick={() => { setActive(p.id); if (p.page !== page) setPage(p.page); if (!layers[k]) setLayers((l) => ({ ...l, [k]: true })); }}>
                      <span className="dw-num" data-k={k}>{pinNumber(p)}</span>
                      <span className="dw-row-t">
                        {p.item ? <Link className="k-link" href={p.item.href} onClick={(e) => e.stopPropagation()}>{p.item.name}</Link> : <b>{p.title || 'Note'}</b>}
                        <small>{p.item ? p.item.status : 'Note'}{pages > 1 ? ` · page ${p.page}` : ''} · {day(p.created_at)}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {tab === 'revs' && (
            <ol className="dw-pane dw-timeline">
              {(sheet?.revisions || []).map((r) => (
                <li key={r.id} data-on={r.id === drawingId || undefined}>
                  <span className="dw-tl-dot" data-cur={r.status === 'current' || undefined} />
                  <div>
                    <Link href={`${base}/drawings/${r.id}`}><b>Rev {r.version || '—'}</b></Link> <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge>
                    <small>{day(r.revision_date || r.created_at)}</small>
                    {r.id !== drawingId && <button type="button" className="dw-linkbtn" onClick={() => setCompareId(r.id)}><SquareHalf size={13} /> Compare with this</button>}
                  </div>
                </li>
              ))}
              <li><span className="dw-tl-dot" data-new /><div><button type="button" className="dw-linkbtn" onClick={() => fileRef.current?.click()}><UploadSimple size={13} /> Upload the next revision</button><small>Same sheet number — becomes current, this one is kept as superseded.</small></div></li>
            </ol>
          )}
          {tab === 'info' && d && (
            <dl className="dw-pane dw-info">
              {[['Sheet', d.sheet_number], ['Title', d.name], ['Discipline', d.discipline || '—'], ['Revision', d.version || '—'], ['Status', label(d.status)], ['Issued', day(d.revision_date)], ['Pages', String(pages)]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              <div><dt>File</dt><dd><a className="k-link" href={d.url} target="_blank" rel="noreferrer">Open the file <ArrowSquareOut size={12} /></a></dd></div>
              <div><dt>Help</dt><dd className="dw-dim"><Info size={12} /> Ctrl/⌘ + scroll zooms. Drag to pan.</dd></div>
            </dl>
          )}
        </aside>
      </div>
    </div>
  );
}

const CSS = `
.dw{display:flex;flex-direction:column;height:calc(100vh - 112px);min-height:560px;margin:-8px 0 0}
.dw-head{padding:6px 4px 12px;display:grid;gap:10px}
.dw-crumbs{display:flex;gap:6px;font-size:13px;color:var(--text-secondary)}
.dw-crumbs a{color:var(--text-secondary);text-decoration:none}.dw-crumbs a:hover{color:var(--text-primary)}
.dw-crumbs b{color:var(--text-primary)}
.dw-titlerow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dw-titlerow h1{margin:0}
.dw-sub{color:var(--text-primary);font-weight:600;opacity:.85}
.dw-grow{flex:1}
.dw-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
@media (max-width:900px){.dw-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
.dw-stat{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;text-align:left;padding:10px 14px;border-radius:10px;border:1px solid var(--border-default);background:linear-gradient(180deg,var(--bg-surface-2),var(--bg-surface));color:var(--text-primary);cursor:pointer;font:inherit}
.dw-stat svg{grid-row:1/3;padding:8px;border-radius:9px;width:36px;height:36px;box-sizing:border-box}
.dw-stat b{font-size:20px;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw-stat span{font-size:12px;color:var(--text-secondary)}
.dw-stat[data-k=rfi] svg{color:var(--danger);background:rgba(248,113,113,.14)}
.dw-stat[data-k=punch] svg{color:var(--warning);background:rgba(251,191,36,.14)}
.dw-stat[data-k=note] svg{color:var(--text-primary);background:rgba(148,163,184,.16)}
.dw-stat[data-k=rev] svg{color:var(--success);background:rgba(74,222,128,.14)}
.dw-stat[data-k=info]{cursor:default}.dw-stat[data-k=info] svg{color:var(--text-primary);background:rgba(192,132,252,.14)}
.dw-stat:hover:not([data-k=info]){border-color:var(--text-tertiary)}
.dw-banner{display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:8px;border:1px solid var(--warning);font-size:14px}
.dw-body{flex:1;min-height:0;display:grid;grid-template-columns:240px minmax(0,1fr) 320px;gap:0;border:1px solid var(--border-default);border-radius:12px;overflow:hidden;background:var(--bg-surface)}
.dw:not([data-rail]) .dw-body{grid-template-columns:0 minmax(0,1fr) 320px}
.dw:not([data-rail]) .dw-rail{display:none}
@media (max-width:1100px){.dw-body{grid-template-columns:0 minmax(0,1fr)}.dw-rail{display:none}.dw-panel{grid-column:1/-1;border-left:0;border-top:1px solid var(--border-default)}.dw{height:auto}.dw-scroll{height:70vh}}
.dw-rail{border-right:1px solid var(--border-default);display:flex;flex-direction:column;min-height:0}
.dw-rail-search{display:flex;align-items:center;gap:6px;margin:10px;padding:0 10px;height:36px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-base);color:var(--text-secondary)}
.dw-rail-search input{flex:1;background:none;border:0;outline:0;color:var(--text-primary);font-size:14px}
.dw-rail-list{overflow:auto;padding:0 6px 10px}
.dw-rail-h{display:flex;justify-content:space-between;margin:10px 6px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--title-section,var(--brand-primary))}
.dw-rail-h span{color:var(--text-tertiary)}
.dw-rail-row{display:flex;gap:10px;align-items:center;padding:7px 8px;border-radius:8px;color:var(--text-primary);text-decoration:none}
.dw-rail-row:hover{background:var(--bg-surface-2)}
.dw-rail-row[data-on]{background:var(--bg-surface-2);box-shadow:inset 3px 0 0 var(--brand-primary)}
.dw-rail-thumb{width:34px;height:26px;border-radius:4px;display:grid;place-items:center;background:var(--bg-base);border:1px solid var(--border-default);color:var(--text-tertiary);flex:none}
.dw-rail-t{display:grid;min-width:0}.dw-rail-t b{font-size:13px}.dw-rail-t small{font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw-canvas{position:relative;min-width:0;min-height:0;display:flex;background:radial-gradient(circle at 50% 0%,var(--bg-surface-2),var(--bg-base) 70%)}
.dw-toolbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:2px;padding:5px;border-radius:12px;background:rgba(16,23,34,.92);border:1px solid var(--border-default);box-shadow:0 10px 30px rgba(0,0,0,.45);backdrop-filter:blur(8px);max-width:calc(100% - 24px);overflow-x:auto}
.dw-tb{display:inline-flex;align-items:center;gap:6px;min-height:36px;min-width:36px;padding:0 9px;border-radius:8px;border:0;background:none;color:var(--text-secondary);cursor:pointer;font:600 13px/1 inherit;text-decoration:none;list-style:none;white-space:nowrap}
.dw-tb::-webkit-details-marker{display:none}
.dw-tb:hover{background:var(--bg-surface-2);color:var(--text-primary)}
.dw-tb[data-on]{background:var(--bg-surface-2);color:var(--text-primary);box-shadow:inset 0 -2px 0 var(--brand-primary)}
.dw-tb[data-tool=rfi][data-on]{color:var(--danger)}.dw-tb[data-tool=punch][data-on]{color:var(--warning)}
.dw-tb:disabled{opacity:.4;cursor:default}
.dw-tb-v{font-size:12px;color:var(--text-secondary);min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.dw-tb-sep{width:1px;height:22px;background:var(--border-default);margin:0 4px;flex:none}
@media (max-width:1300px){.dw-tb-l{display:none}}
.dw-dd{position:relative}
.dw-dd-menu{position:absolute;top:44px;left:0;z-index:6;min-width:230px;padding:6px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border-default);box-shadow:0 12px 30px rgba(0,0,0,.5);display:grid;gap:2px}
.dw-check{display:flex;gap:8px;align-items:center;padding:7px 8px;border-radius:6px;font-size:14px;color:var(--text-primary);cursor:pointer}
.dw-check small{margin-left:auto;color:var(--text-tertiary)}
.dw-check:hover,.dw-dd-item:hover{background:var(--bg-surface-2)}
.dw-dd-item{text-align:left;padding:8px;border-radius:6px;border:0;background:none;color:var(--text-primary);font:inherit;font-size:14px;cursor:pointer}
.dw-dd-item[data-on]{box-shadow:inset 3px 0 0 var(--brand-primary)}
.dw-legend,.dw-hint{position:absolute;top:62px;left:50%;transform:translateX(-50%);z-index:4;display:flex;gap:8px;align-items:center;padding:6px 12px;border-radius:999px;background:rgba(16,23,34,.92);border:1px solid var(--border-default);font-size:13px;white-space:nowrap}
.dw-legend i{width:10px;height:10px;border-radius:2px;display:inline-block;margin-left:6px}
.dw-legend i[data-k=add]{background:rgb(22,163,74)}.dw-legend i[data-k=del]{background:rgb(220,38,38)}.dw-legend i[data-k=same]{background:rgb(40,40,40);border:1px solid var(--text-tertiary)}
.dw-toast{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:6;display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--danger);font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.45)}
.dw-toast[data-ok]{border-color:var(--success)}
.dw-toast button{background:none;border:0;color:var(--text-secondary);cursor:pointer}
.dw-scroll{flex:1;overflow:auto;padding:70px 32px 32px;outline:0}
.dw-scroll[data-tool=pan]{cursor:grab}.dw-scroll[data-tool=pan]:active{cursor:grabbing}
.dw-scroll:not([data-tool=pan]) .dw-paper{cursor:crosshair}
.dw-paper{position:relative;width:max-content;margin:0 auto;line-height:0;box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.06);border-radius:2px;user-select:none}
.dw-paper canvas{display:block;border-radius:2px}
.dw-rendering{position:absolute;top:12px;left:12px;display:flex;gap:8px;align-items:center;line-height:1;padding:8px 12px;border-radius:8px;background:rgba(16,23,34,.9);color:var(--text-primary);font-size:13px}
.dw-spin{width:12px;height:12px;border-radius:50%;border:2px solid var(--border-default);border-top-color:var(--brand-primary);animation:dwspin .8s linear infinite}
@keyframes dwspin{to{transform:rotate(360deg)}}
.dw-pin{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;border:0;background:none;padding:0;cursor:pointer;filter:drop-shadow(0 3px 5px rgba(0,0,0,.55));line-height:1}
.dw-pin-head{width:30px;height:30px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);display:grid;place-items:center;border:2px solid var(--bg-base);background:var(--k-c);color:var(--bg-base)}
.dw-pin-head svg{transform:rotate(45deg)}
.dw-pin-n{position:absolute;top:-8px;right:-10px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--bg-base);color:var(--text-primary);font:700 11px/18px system-ui,sans-serif;border:1px solid var(--k-c)}
.dw-pin[data-k=rfi],.dw-dot[data-k=rfi],.dw-num[data-k=rfi]{--k-c:var(--danger)}
.dw-pin[data-k=punch],.dw-dot[data-k=punch],.dw-num[data-k=punch]{--k-c:var(--warning)}
.dw-pin[data-k=note],.dw-dot[data-k=note],.dw-num[data-k=note]{--k-c:var(--text-secondary)}
.dw-pin[data-k=other],.dw-dot[data-k=other],.dw-num[data-k=other]{--k-c:var(--success)}
.dw-pin[data-closed] .dw-pin-head{--k-c:var(--success);opacity:.75}
.dw-pin[data-on] .dw-pin-head{box-shadow:0 0 0 3px var(--brand-primary)}
.dw-pin[data-draft]{pointer-events:none;animation:dwdrop .25s ease-out}
@keyframes dwdrop{from{transform:translate(-50%,-140%);opacity:0}to{transform:translate(-50%,-100%);opacity:1}}
.dw-card{position:absolute;z-index:3;transform:translate(22px,-50%);width:290px;line-height:1.35;padding:12px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-default);box-shadow:0 16px 40px rgba(0,0,0,.55);display:grid;gap:8px;cursor:default;font-size:14px}
.dw-card p{margin:0;color:var(--text-primary)}
.dw-card-top{display:flex;gap:8px;align-items:center}
.dw-card-top button{margin-left:auto;background:none;border:0;color:var(--text-secondary);cursor:pointer;min-width:28px;min-height:28px}
.dw-card-act{display:flex;gap:6px;flex-wrap:wrap}
.dw-or{display:flex;gap:6px;align-items:center;margin:4px 0 0;font-size:12px;color:var(--text-secondary)}
.dw-hits{display:grid;gap:4px;max-height:180px;overflow:auto}
.dw-hit{display:flex;justify-content:space-between;gap:8px;text-align:left;padding:7px 8px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-surface-2);color:var(--text-primary);cursor:pointer;font-size:13px}
.dw-hit small{color:var(--text-secondary);white-space:nowrap}
.dw-hit:hover{border-color:var(--brand-primary)}
.dw-dot{width:22px;height:22px;border-radius:6px;display:inline-grid;place-items:center;background:var(--k-c);color:var(--bg-base);flex:none}
.dw-panel{border-left:1px solid var(--border-default);display:flex;flex-direction:column;min-height:0;background:var(--bg-surface)}
.dw-tabs{display:flex;border-bottom:1px solid var(--border-default)}
.dw-tabs button{flex:1;padding:12px 6px;border:0;background:none;color:var(--text-secondary);font:600 13px inherit;cursor:pointer;border-bottom:2px solid transparent}
.dw-tabs button[data-on]{color:var(--text-primary);border-bottom-color:var(--brand-primary)}
.dw-pane{overflow:auto;padding:10px 12px;margin:0;flex:1}
.dw-group{display:flex;gap:8px;align-items:center;margin:8px 0 6px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary)}
.dw-group span:last-child{margin-left:auto;color:var(--text-tertiary)}
.dw-row{display:flex;gap:10px;align-items:center;padding:8px;border-radius:8px;cursor:pointer}
.dw-row:hover,.dw-row[data-on]{background:var(--bg-surface-2)}
.dw-row[data-closed] .dw-row-t{opacity:.6}
.dw-row-t{display:grid;min-width:0;font-size:14px}
.dw-row-t small{font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw-num{min-width:24px;height:24px;border-radius:12px;display:grid;place-items:center;font:700 12px system-ui,sans-serif;background:var(--k-c);color:var(--bg-base);flex:none}
.dw-empty{display:grid;justify-items:center;text-align:center;gap:6px;padding:40px 16px;color:var(--text-secondary);font-size:14px}
.dw-empty svg{color:var(--text-tertiary)}.dw-empty b{color:var(--text-primary)}
.dw-timeline{list-style:none;display:grid;gap:0}
.dw-timeline li{display:grid;grid-template-columns:18px 1fr;gap:10px;padding:0 0 16px;position:relative}
.dw-timeline li:not(:last-child)::before{content:'';position:absolute;left:8px;top:16px;bottom:0;width:2px;background:var(--border-default)}
.dw-timeline li>div{display:grid;gap:3px;font-size:14px}
.dw-timeline a{color:var(--text-primary);text-decoration:none}
.dw-timeline small{font-size:12px;color:var(--text-secondary)}
.dw-timeline li[data-on] b{color:var(--title-section,var(--brand-primary))}
.dw-tl-dot{width:18px;height:18px;border-radius:50%;border:2px solid var(--text-tertiary);background:var(--bg-surface);margin-top:2px;z-index:1}
.dw-tl-dot[data-cur]{border-color:var(--success);background:var(--success)}
.dw-tl-dot[data-new]{border-style:dashed}
.dw-linkbtn{display:inline-flex;gap:5px;align-items:center;width:max-content;padding:0;border:0;background:none;color:var(--text-primary);text-decoration:underline;font:inherit;font-size:13px;cursor:pointer}
.dw-info{display:grid;gap:10px}
.dw-info div{display:grid;grid-template-columns:90px 1fr;gap:8px;font-size:14px}
.dw-info dt{color:var(--text-secondary)}.dw-info dd{margin:0;color:var(--text-primary)}
.dw-dim{color:var(--text-secondary);font-size:13px;margin:0}
`;
