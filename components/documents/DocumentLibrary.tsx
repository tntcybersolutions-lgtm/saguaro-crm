'use client';
/**
 * Document Library — every generated document across the company.
 * Data: GET /api/documents/library (tenant-scoped list), POST {docId} for a
 * fresh signed URL (the bucket is private; stored links expire).
 *
 * Compact rows with a document-KIND tile (G702, COI, LW…), category filters,
 * job filter, date window, search over title/type/job, list or group-by-job,
 * multi-select + Download Selected, and per-row Preview / Download /
 * Go to Record. Nothing here writes data.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, DownloadSimple, ArrowSquareOut, MagnifyingGlass, CaretDown, CaretRight, WarningCircle, Rows, FolderSimple } from '@phosphor-icons/react';
import { openPdf } from '@/components/PdfViewer';
import { alertDialog } from '@/lib/ui/async-dialog';
import { docTypeLabel } from '@/lib/document-types';
import { docCategory, docSourceHref, DOC_CATEGORY_LABEL, DOC_CATEGORY_COLOR, type DocCategory } from '@/lib/doc-category';
import { DocKindTile } from './DocKindTile';

interface LibDoc {
  id: string; doc_type: string | null; project_id: string | null; status: string | null;
  created_at: string | null; title: string | null; source_type: string | null; source_id: string | null;
  projectName: string | null;
}

type Window = 'all' | '7' | '30' | '90';
const PAGE = 50;

const fmtDay = (d: string | null) => (d ? new Date(d.includes('T') ? d : `${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
function relDay(d: string | null): string {
  if (!d) return '—';
  const days = Math.floor((Date.now() - Date.parse(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtDay(d);
}
/** The distinguishing part of a title: drop a leading "<Type Label> — " that the
 *  second line already shows, so "Insurance Certificate Request — Roofing…"
 *  reads "Roofing…" instead of truncating before the useful words. */
function shortTitle(d: { title: string | null; doc_type: string | null }): { main: string; dupType: boolean } {
  const label = docTypeLabel(d.doc_type);
  const t = (d.title || '').trim();
  if (!t || t === label) return { main: label, dupType: true };
  for (const sep of [' — ', ' - ', ': ']) {
    if (t.toLowerCase().startsWith((label + sep).toLowerCase())) return { main: t.slice(label.length + sep.length), dupType: false };
  }
  return { main: t, dupType: false };
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';

export default function DocumentLibrary({ externalQuery = '', jobId = null }: { externalQuery?: string; /** The Documents page's selected job, if any. */ jobId?: string | null }) {
  const [docs, setDocs] = useState<LibDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cat, setCat] = useState<DocCategory | 'all'>('all');
  const [job, setJob] = useState(jobId || '');
  // Follow the page's job selection (the job board / ?project=); the library's
  // own picker still works on its own when nothing is selected up top.
  useEffect(() => { setJob(jobId || ''); }, [jobId]);
  const [win, setWin] = useState<Window>('all');
  const [q, setQ] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    fetch('/api/documents/library')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => setDocs((d.docs ?? []) as LibDoc[]))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const signedUrl = useCallback(async (doc: LibDoc): Promise<string> => {
    const res = await fetch('/api/documents/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docId: doc.id }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.url) throw new Error(d.error || 'Could not open the document.');
    return d.url as string;
  }, []);

  const preview = async (doc: LibDoc) => {
    setBusy(`p-${doc.id}`);
    try { openPdf({ url: await signedUrl(doc), title: doc.title || docTypeLabel(doc.doc_type) }); }
    catch (e) { void alertDialog({ title: 'Could Not Open', message: (e as Error).message + ' Try regenerating it from its source record.' }); }
    finally { setBusy(null); }
  };

  const downloadOne = async (doc: LibDoc) => {
    const url = await signedUrl(doc);
    const r = await fetch(url);
    if (!r.ok) throw new Error('The file could not be downloaded.');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName(doc.title || docTypeLabel(doc.doc_type))}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const download = async (doc: LibDoc) => {
    setBusy(`d-${doc.id}`);
    try { await downloadOne(doc); }
    catch (e) { void alertDialog({ title: 'Download Failed', message: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const jobs = useMemo(() => {
    const m = new Map<string, string>();
    docs.forEach(d => { if (d.project_id) m.set(d.project_id, d.projectName || 'Untitled job'); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [docs]);

  const query = (q || externalQuery).trim().toLowerCase();
  const inWindow = (d: LibDoc) => win === 'all' || (d.created_at && Date.now() - Date.parse(d.created_at) <= Number(win) * 86_400_000);
  const base = docs.filter(d => (!job || d.project_id === job) && inWindow(d) &&
    (!query || `${d.title ?? ''} ${docTypeLabel(d.doc_type)} ${d.projectName ?? ''} ${DOC_CATEGORY_LABEL[docCategory(d.doc_type)]}`.toLowerCase().includes(query)));
  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    base.forEach(d => { const k = docCategory(d.doc_type); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [base]);
  const filtered = base
    .filter(d => cat === 'all' || docCategory(d.doc_type) === cat)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const visible = filtered.slice(0, shown);
  const allVisibleSelected = visible.length > 0 && visible.every(d => selected.has(d.id));

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(s => {
    const n = new Set(s);
    if (allVisibleSelected) visible.forEach(d => n.delete(d.id)); else visible.forEach(d => n.add(d.id));
    return n;
  });

  const downloadSelected = async () => {
    const list = docs.filter(d => selected.has(d.id));
    if (!list.length) return;
    setBulk({ done: 0, total: list.length });
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      try { await downloadOne(list[i]); } catch { failed.push(list[i].title || docTypeLabel(list[i].doc_type)); }
      setBulk({ done: i + 1, total: list.length });
      await new Promise(r => setTimeout(r, 350)); // let the browser start each save
    }
    setBulk(null);
    if (failed.length) void alertDialog({ title: 'Some Downloads Failed', message: `${failed.length} of ${list.length} could not be downloaded: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}` });
  };

  const groups = useMemo(() => {
    if (!grouped) return null;
    const m = new Map<string, { name: string; rows: LibDoc[] }>();
    visible.forEach(d => {
      const k = d.project_id || 'none';
      if (!m.has(k)) m.set(k, { name: d.projectName || 'No job', rows: [] });
      m.get(k)!.rows.push(d);
    });
    return [...m.entries()];
  }, [grouped, visible]);

  const Row = ({ d }: { d: LibDoc }) => {
    const c = docCategory(d.doc_type);
    const href = docSourceHref(d);
    const st = shortTitle(d);
    return (
      <div role="row" className={`dl-row ${selected.has(d.id) ? 'sel' : ''}`}>
        <span role="cell" className="dl-check">
          <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.title || docTypeLabel(d.doc_type)}`} />
        </span>
        <span role="cell" className="dl-doc">
          <DocKindTile docType={d.doc_type} size={38} />
          <span className="dl-docText">
            <button type="button" className="dl-title" onClick={() => preview(d)} title={d.title || docTypeLabel(d.doc_type)}>
              {st.main}
            </button>
            <span className="dl-meta">
              <span className="dl-cat" style={{ color: DOC_CATEGORY_COLOR[c] }}>{DOC_CATEGORY_LABEL[c]}</span>
              {!st.dupType && <span>{docTypeLabel(d.doc_type)}</span>}
              {!job && d.projectName && <span className="dl-metaJob">{d.projectName}</span>}
            </span>
          </span>
        </span>
        <span role="cell" className="dl-job">{d.projectName || '—'}</span>
        <span role="cell" className="dl-date" title={fmtDay(d.created_at)}>{relDay(d.created_at)}</span>
        <span role="cell" className="dl-status"><span className="dl-badge">{(d.status || 'generated').replace(/_/g, ' ').replace(/\b[a-z]/g, x => x.toUpperCase())}</span></span>
        <span role="cell" className="dl-actions">
          <button type="button" className="dl-btn" onClick={() => preview(d)} disabled={busy === `p-${d.id}`} aria-label={`Preview ${d.title || ''}`}>
            <Eye size={15} weight="bold" /> <span>{busy === `p-${d.id}` ? 'Opening…' : 'Preview'}</span>
          </button>
          <button type="button" className="dl-btn dl-icon" onClick={() => download(d)} disabled={busy === `d-${d.id}`} aria-label={`Download ${d.title || ''}`} title="Download PDF">
            <DownloadSimple size={15} weight="bold" />
          </button>
          {href && (
            <Link href={href} className="dl-btn dl-icon" aria-label="Go to the record this document came from" title="Go to record">
              <ArrowSquareOut size={15} weight="bold" />
            </Link>
          )}
        </span>
      </div>
    );
  };

  const cats = (Object.keys(DOC_CATEGORY_LABEL) as DocCategory[]).filter(k => catCounts[k]);

  return (
    <section className="dl" aria-labelledby="dl-h">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dl-head">
        <div>
          <h2 id="dl-h">Document Library</h2>
          <p className="dl-sub">{loading ? 'Loading…' : error ? 'Couldn’t load the library.' : `${docs.length} generated document${docs.length === 1 ? '' : 's'} across ${jobs.length} job${jobs.length === 1 ? '' : 's'}`}</p>
        </div>
        <div className="dl-viewtoggle" role="group" aria-label="Layout">
          <button type="button" aria-pressed={!grouped} className={!grouped ? 'on' : ''} onClick={() => setGrouped(false)}><Rows size={14} weight="bold" /> List</button>
          <button type="button" aria-pressed={grouped} className={grouped ? 'on' : ''} onClick={() => setGrouped(true)}><FolderSimple size={14} weight="bold" /> By Job</button>
        </div>
      </div>

      <div className="dl-toolbar">
        <label className="dl-search">
          <MagnifyingGlass size={15} aria-hidden />
          <input value={q} onChange={e => { setQ(e.target.value); setShown(PAGE); }} placeholder="Search title, type, or job…" aria-label="Search documents" />
        </label>
        <select value={job} onChange={e => { setJob(e.target.value); setShown(PAGE); }} aria-label="Job">
          <option value="">All Jobs</option>
          {jobs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={win} onChange={e => { setWin(e.target.value as Window); setShown(PAGE); }} aria-label="Generated">
          <option value="all">Any Date</option><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option>
        </select>
      </div>

      <div className="dl-chips" role="group" aria-label="Category">
        <button type="button" aria-pressed={cat === 'all'} className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All <b>{base.length}</b></button>
        {cats.map(k => (
          <button key={k} type="button" aria-pressed={cat === k} className={cat === k ? 'on' : ''} onClick={() => setCat(cat === k ? 'all' : k)}>
            <span className="dl-dot" style={{ background: DOC_CATEGORY_COLOR[k] }} />{DOC_CATEGORY_LABEL[k]} <b>{catCounts[k]}</b>
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="dl-bulk" role="status">
          <b>{selected.size} selected</b>
          <button type="button" className="dl-primary" onClick={downloadSelected} disabled={!!bulk}>
            <DownloadSimple size={15} weight="bold" /> {bulk ? `Downloading ${bulk.done} of ${bulk.total}…` : 'Download Selected'}
          </button>
          <button type="button" className="dl-link" onClick={() => setSelected(new Set())} disabled={!!bulk}>Clear</button>
        </div>
      )}

      <div className="dl-table" role="table" aria-label="Generated documents">
        <div role="row" className="dl-row dl-hrow">
          <span role="columnheader" className="dl-check"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all shown" disabled={!visible.length} /></span>
          <span role="columnheader" className="dl-doc">Document</span>
          <span role="columnheader" className="dl-job">Job</span>
          <span role="columnheader" className="dl-date">Generated</span>
          <span role="columnheader" className="dl-status">Status</span>
          <span role="columnheader" className="dl-actions">Actions</span>
        </div>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="dl-row dl-skel" aria-hidden><span /><span /><span /><span /><span /><span /></div>)
        ) : error ? (
          <div className="dl-state dl-err" role="alert"><WarningCircle size={18} weight="fill" /> Couldn&apos;t load the library. Your documents are safe. <button type="button" className="dl-link" onClick={load}>Retry</button></div>
        ) : docs.length === 0 ? (
          <div className="dl-state">No generated documents yet. Create a pay app, lien waiver, bond or bid jacket and it lands here.</div>
        ) : filtered.length === 0 ? (
          <div className="dl-state">No documents match these filters. <button type="button" className="dl-link" onClick={() => { setCat('all'); setJob(''); setWin('all'); setQ(''); }}>Clear filters</button></div>
        ) : groups ? (
          groups.map(([k, g]) => (
            <div key={k} className="dl-group">
              <button type="button" className="dl-ghead" aria-expanded={!collapsed[k]} onClick={() => setCollapsed(c => ({ ...c, [k]: !c[k] }))}>
                {collapsed[k] ? <CaretRight size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
                <span className="dl-gname">{g.name}</span><span className="dl-gcount">{g.rows.length}</span>
              </button>
              {!collapsed[k] && g.rows.map(d => <Row key={d.id} d={d} />)}
            </div>
          ))
        ) : (
          visible.map(d => <Row key={d.id} d={d} />)
        )}
      </div>

      {!loading && !error && filtered.length > shown && (
        <div className="dl-more">
          <span>Showing {shown} of {filtered.length}</span>
          <button type="button" className="dl-btn" onClick={() => setShown(s => s + PAGE)}>Load {Math.min(PAGE, filtered.length - shown)} More</button>
        </div>
      )}
    </section>
  );
}

const CSS = `
.dl { background: var(--bg-surface); border: 1px solid var(--glass-border); border-top: 2px solid color-mix(in srgb, var(--brand-primary) 70%, transparent); border-radius: 14px; padding: 18px 20px; min-width: 0; }
.dl h2 { margin: 0; font-size: 18px; font-weight: 800; color: var(--title-color, #E8FF2A); }
.dl-head { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.dl-sub { margin: 4px 0 0; font-size: 13px; color: var(--text-tertiary); }
.dl-viewtoggle, .dl-chips { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.dl-viewtoggle { background: var(--bg-surface-2); border: 1px solid var(--glass-border); border-radius: 10px; padding: 3px; gap: 2px; }
.dl-viewtoggle button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border: 0; border-radius: 7px; background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 700; cursor: pointer; }
.dl-viewtoggle button.on { background: var(--brand-primary); color: var(--on-brand); }
.dl-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.dl-search { flex: 1 1 260px; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border: 1px solid var(--glass-border); border-radius: 10px; background: var(--bg-surface-2); color: var(--text-tertiary); }
.dl-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font-size: 14px; }
.dl-toolbar select { min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: var(--bg-solid-2, #243247); color: var(--text-primary); font-size: 14px; }
.dl-chips { margin-bottom: 12px; }
.dl-chips button { display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.04); color: var(--text-secondary); font-size: 13px; font-weight: 700; cursor: pointer; }
.dl-chips button b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.dl-chips button.on { border-color: var(--brand-primary); background: var(--brand-primary-12); color: var(--brand-primary); }
.dl-dot { width: 8px; height: 8px; border-radius: 2px; }
.dl-bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px 12px; margin-bottom: 10px; border-radius: 10px; background: var(--brand-primary-08); border: 1px solid var(--brand-primary-35); font-size: 14px; }
.dl-table { border: 1px solid var(--glass-border); border-radius: 12px; overflow: hidden; }
.dl-row { display: grid; grid-template-columns: 40px minmax(0, 2.6fr) minmax(0, 1.3fr) 120px 110px 200px; align-items: center; gap: 12px; min-height: 60px; padding: 8px 14px; border-top: 1px solid var(--border-subtle); }
.dl-row:first-child { border-top: 0; }
.dl-row:not(.dl-hrow):hover { background: rgba(255,255,255,0.03); }
.dl-row.sel { background: var(--brand-primary-08); }
.dl-hrow { min-height: 42px; background: rgba(255,255,255,0.04); font-size: 13px; font-weight: 700; color: var(--text-secondary); position: sticky; top: 0; z-index: 1; }
.dl-check input { width: 18px; height: 18px; accent-color: var(--brand-primary); cursor: pointer; }
.dl-doc { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dl-docText { display: flex; flex-direction: column; min-width: 0; }
.dl-title { all: unset; cursor: pointer; font-size: 14.5px; font-weight: 750; line-height: 1.3; color: var(--title-color, #E8FF2A); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.dl-title:hover { text-decoration: underline; }
.dl-title:focus-visible, .dl-btn:focus-visible, .dl-chips button:focus-visible, .dl-viewtoggle button:focus-visible, .dl-ghead:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.dl-meta { display: flex; gap: 10px; font-size: 13px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dl-cat { font-weight: 700; }
.dl-job { font-size: 14px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dl-date { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
.dl-badge { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: rgba(74,222,128,0.10); color: #4ADE80; border: 1px solid rgba(74,222,128,0.32); }
.dl-actions { display: flex; justify-content: flex-end; gap: 6px; }
.dl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--glass-border); background: var(--bg-surface-2); color: var(--text-primary); font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; }
.dl-btn:hover { border-color: var(--brand-primary-35); }
.dl-btn:disabled { opacity: .6; cursor: wait; }
.dl-icon { width: 36px; padding: 0; }
.dl-primary { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; border: 0; border-radius: 9px; background: var(--brand-primary); color: var(--on-brand); font-weight: 800; font-size: 13px; cursor: pointer; }
.dl-link { background: none; border: 0; color: var(--link); font-weight: 700; cursor: pointer; font-size: 13px; }
.dl-state { padding: 28px 16px; text-align: center; color: var(--text-secondary); font-size: 14px; }
.dl-err { color: #F87171; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
.dl-skel span { height: 14px; border-radius: 6px; background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04)); background-size: 200% 100%; animation: dlsk 1.4s ease infinite; }
@keyframes dlsk { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .dl-skel span { animation: none; } }
.dl-group + .dl-group { border-top: 1px solid var(--glass-border); }
.dl-ghead { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 0 14px; border: 0; background: rgba(232,255,42,0.05); color: var(--text-primary); cursor: pointer; font-size: 14px; font-weight: 800; text-align: left; }
.dl-gname { color: var(--title-color, #E8FF2A); }
.dl-gcount { margin-left: auto; font-size: 13px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.dl-more { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; font-size: 13px; color: var(--text-tertiary); }
.dl-metaJob { display: none; }
@media (max-width: 1100px) { .dl-row { grid-template-columns: 36px minmax(0, 1fr) 110px 150px; } .dl-job, .dl-status { display: none; } .dl-metaJob { display: inline; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; } }
/* Phone: the title gets the whole width; its buttons sit on a line under it. */
@media (max-width: 640px) {
  .dl { padding: 14px; }
  .dl-row { grid-template-columns: 32px minmax(0, 1fr); grid-template-areas: "check doc" ". actions"; row-gap: 10px; min-height: 64px; padding: 12px; }
  .dl-check { grid-area: check; align-self: start; padding-top: 10px; }
  .dl-doc { grid-area: doc; }
  .dl-actions { grid-area: actions; justify-content: flex-start; }
  .dl-hrow { grid-template-areas: "check doc"; }
  .dl-hrow .dl-check { padding-top: 0; align-self: center; }
  .dl-hrow .dl-actions, .dl-date { display: none; }
  .dl-skel { grid-template-areas: none; }
  .dl-skel span:nth-child(n+3) { display: none; }
  .dl-meta { flex-wrap: wrap; white-space: normal; row-gap: 2px; }
  .dl-btn, .dl-primary, .dl-chips button, .dl-viewtoggle button, .dl-toolbar select, .dl-search { min-height: 44px; }
  .dl-actions .dl-btn { min-width: 44px; }
  .dl-icon { width: 44px; padding: 0; }
}
`;
