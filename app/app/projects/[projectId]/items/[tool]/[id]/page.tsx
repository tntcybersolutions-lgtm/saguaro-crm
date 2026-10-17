'use client';
/**
 * Item page — one full page for any RFI, submittal or punch item.
 *
 * Header (number, title, status) → workflow strip (who has it, who made it,
 * when it's due; empty cells left out, Status always shown) → tabs: General
 * (the filled-in fields; Edit shows every field) · Comments
 * (thread with files) · Related (Related Items: links to any record on the
 * job, pins on drawings) · Files · History
 * (every change, who and when). The tool's shape comes from
 * lib/items/registry; the data from /api/items/:tool/:id.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageShell, Button, Tabs, Field, Input, Textarea, Select, Toast, useToast, EmptyState } from '@/components/ui/kit';
import { PencilSimple, FloppyDisk, X, Paperclip, ChatText, Trash, FileText, ArrowSquareOut } from '@phosphor-icons/react';
import RelatedItems from '@/components/related/RelatedItems';
import { RELATED_TYPE_FOR_TOOL } from '@/lib/related-items';
import ItemHistory from '@/components/item/ItemHistory';
import WorkflowChain from '@/components/submittals/WorkflowChain';
import type { SubmittalLike } from '@/lib/submittal-workflow';
import DailyLogSections from '@/components/item/DailyLogSections';
import { LOG_SECTIONS } from '@/lib/daily-log-sections';
import { itemTool, itemNumber, nounInSentence, statusLabel, valueLabel, type ItemField, type ItemTool } from '@/lib/items/registry';

type Item = Record<string, unknown>;
type FileRow = { id: string; name: string; size: number | null; kind: string | null; by: string | null; at: string; url: string | null };
type Comment = { id: string; body: string; author_name: string | null; created_at: string; attachments?: { id: string; name: string }[]; is_official?: boolean; mine?: boolean };

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function display(f: ItemField, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (f.kind) {
    case 'money': return Number.isFinite(Number(v)) ? money.format(Number(v)) : '—';
    case 'number': return Number(v).toLocaleString('en-US');
    case 'bool': return v ? 'Yes' : 'No';
    case 'date': return new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    case 'datetime': return new Date(String(v)).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    case 'select': return statusLabel(String(v));
    default: return valueLabel(String(v));
  }
}

/** A stored user id (some rows keep the creator's id, not a name) means
 *  nothing to a reader, so it is never shown as a value. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ball in court holding a status word ("closed") is an old import, not a person. */
const STATUS_WORD = /^(open|closed|answered|approved|rejected|draft|submitted|pending|completed|verified|void|n\/a|none)$/i;

/** Nothing filled in: null, missing or blank text. A 0, a "No" and a date are values. */
function isEmpty(v: unknown, key?: string): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'string') return false;
  const t = v.trim();
  return t === '' || ID_RE.test(t) || (key === 'ball_in_court' && STATUS_WORD.test(t));
}

function inputValue(f: ItemField, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (f.kind === 'date') return String(v).slice(0, 10);
  if (f.kind === 'bool') return v ? 'true' : 'false';
  return String(v);
}

function overdue(tool: ItemTool, item: Item): boolean {
  const due = item.due_date as string | null;
  const st = String(item[tool.statusKey] || '');
  if (!due || ['closed', 'answered', 'approved', 'approved_as_noted', 'completed', 'verified'].includes(st)) return false;
  return new Date(`${due.slice(0, 10)}T23:59:59`).getTime() < Date.now();
}

async function readErr(r: Response, fallback: string) {
  try { const j = await r.json(); return (j && typeof j.error === 'string' && j.error) || fallback; } catch { return fallback; }
}

export default function ItemPage() {
  const params = useParams<{ projectId: string; tool: string; id: string }>();
  const projectId = params?.projectId as string;
  const type = params?.tool as string;
  const id = params?.id as string;
  const tool = itemTool(type);
  const { toast, show } = useToast(3500);

  const [item, setItem] = useState<Item | null>(null);
  const [projectName, setProjectName] = useState('');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState(type === 'daily_logs' ? 'log' : 'general');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const [comments, setComments] = useState<Comment[] | null>(null);
  const [linkCount, setLinkCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!tool) return;
    setLoadErr('');
    const r = await fetch(`/api/items/${type}/${id}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { setLoadErr(await readErr(r, `Couldn't load this ${tool.noun}.`)); return; }
    const j = await r.json();
    setItem(j.item);
    setProjectName(j.project?.name || '');
    setFiles(Array.isArray(j.files) ? j.files : []);
  }, [tool, type, id]);

  const loadComments = useCallback(async () => {
    const r = await fetch(`/api/items/${type}/${id}/comments`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    setComments(r.ok && Array.isArray(j.comments) ? j.comments : []);
    if (!r.ok) show(j.error || "Couldn't load comments.", 'bad');
  }, [type, id, show]);

  // The Related count for the tab badge, before the tab is opened.
  const relType = tool ? RELATED_TYPE_FOR_TOOL[tool.type] : undefined;
  const loadLinkCount = useCallback(async () => {
    if (!relType) return;
    const r = await fetch(`/api/related-items?type=${relType}&id=${id}`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    setLinkCount(r.ok && Array.isArray(j.items) ? j.items.length : 0);
  }, [relType, id]);

  useEffect(() => { void load(); void loadComments(); void loadLinkCount(); }, [load, loadComments, loadLinkCount]);

  const startEdit = () => {
    if (!tool || !item) return;
    const d: Record<string, string> = { [tool.titleKey]: inputValue({ key: tool.titleKey, label: '', kind: 'text' }, item[tool.titleKey]) };
    tool.fields.filter((f) => tool.edit.includes(f.key)).forEach((f) => { d[f.key] = inputValue(f, item[f.key]); });
    setDraft(d);
    setEditing(true);
  };

  const save = async () => {
    if (!tool || !item) return;
    const changed: Record<string, unknown> = {};
    Object.entries(draft).forEach(([k, v]) => {
      const f = tool.fields.find((x) => x.key === k) || { key: k, label: '', kind: 'text' as const };
      if (v !== inputValue(f, item[k])) changed[k] = f.kind === 'bool' ? v === 'true' : v;
    });
    if (Object.keys(changed).length === 0) { setEditing(false); return; }
    setSaving(true);
    const r = await fetch(`/api/items/${type}/${id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed),
    });
    setSaving(false);
    if (!r.ok) { show(await readErr(r, "Couldn't save your changes."), 'bad'); return; }
    const j = await r.json();
    setItem(j.item);
    setEditing(false);
    setHistoryKey((k) => k + 1);
    show('Saved.');
  };

  const counts = useMemo(() => ({ comments: comments?.length ?? 0, links: linkCount ?? 0, files: files.length }), [comments, linkCount, files]);

  if (!tool) {
    return <PageShell title="Not found"><EmptyState title="This kind of item doesn't have a page" text="Open it from its list instead." /></PageShell>;
  }
  const listHref = `/app/projects/${projectId}/${tool.listPath}`;
  if (loadErr) {
    return (
      <PageShell title={tool.noun} crumbs={[{ label: tool.plural, href: listHref }]}>
        <EmptyState title={loadErr} action={<Button onClick={() => void load()}>Try again</Button>} />
      </PageShell>
    );
  }
  if (!item) {
    return <PageShell title={tool.noun} crumbs={[{ label: tool.plural, href: listHref }]}><div className="ip-loading" aria-busy="true">Loading…</div></PageShell>;
  }

  /* Read mode shows only what is filled in (Edit shows every field). The
     status cell always stays: it is where the record stands. */
  const strip = tool.fields.filter((f) => f.strip && (f.key === tool.statusKey || !isEmpty(item[f.key], f.key)));
  const body = tool.fields.filter((f) => !f.strip && !isEmpty(item[f.key], f.key));
  const emptyCount = tool.fields.filter((f) => !f.strip && isEmpty(item[f.key], f.key) && tool.edit.includes(f.key)).length;
  const late = overdue(tool, item);
  const num = item[tool.numberKey];
  const title = String(item[tool.titleKey] || '').trim() || tool.noun;

  return (
    <PageShell
      title={editing ? (itemNumber(tool, num) || tool.noun) : `${itemNumber(tool, num) ? `${itemNumber(tool, num)} · ` : ''}${title}`}
      subtitle={projectName}
      crumbs={[{ label: projectName || 'Job', href: `/app/projects/${projectId}/overview` }, { label: tool.plural, href: listHref }]}
      actions={editing ? (
        <>
          <Button icon={<X size={15} />} onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          <Button variant="primary" icon={<FloppyDisk size={15} />} onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      ) : (
        <Button variant="primary" icon={<PencilSimple size={15} />} onClick={startEdit}>Edit</Button>
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />

      <div className="ip-strip" role="list" aria-label={`${tool.noun} workflow`}>
        {strip.map((f) => (
          <div key={f.key} className="ip-strip-cell" role="listitem" data-late={f.key === 'due_date' && late ? 'true' : undefined}>
            <span className="ip-strip-label">{f.label}</span>
            <span className="ip-strip-value" data-status={f.key === tool.statusKey ? String(item[f.key] || '') : undefined}>
              {display(f, item[f.key])}{f.key === 'due_date' && late ? ' · overdue' : ''}
            </span>
          </div>
        ))}
      </div>

      {tool.type === 'submittals' && (
        <section className="ip-chain" aria-label="Approval workflow">
          <WorkflowChain submittal={item as SubmittalLike} entityId={id} refreshKey={historyKey} />
        </section>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ...(tool.type === 'daily_logs' ? [{ key: 'log', label: `Log · ${LOG_SECTIONS.length} sections` }] : []),
          { key: 'general', label: tool.type === 'daily_logs' ? 'Details' : 'General' },
          { key: 'comments', label: 'Comments', count: counts.comments },
          { key: 'related', label: 'Related', count: counts.links },
          { key: 'files', label: 'Files', count: counts.files },
          { key: 'history', label: 'History' },
        ]}
      />

      {tab === 'general' && (
        <section className="ip-section" aria-label="Details">
          {editing ? (
            <div className="ip-form">
              <Field label="Title" span required>
                <Input value={draft[tool.titleKey] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [tool.titleKey]: e.target.value }))} />
              </Field>
              {tool.fields.filter((f) => tool.edit.includes(f.key)).map((f) => (
                <Field key={f.key} label={f.label} span={f.kind === 'long'}>
                  {f.kind === 'long' ? (
                    <Textarea rows={4} value={draft[f.key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                  ) : f.kind === 'select' ? (
                    <Select value={draft[f.key] ?? ''} placeholder="—" options={(f.options || []).map((o) => ({ value: o, label: statusLabel(o) }))} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                  ) : f.kind === 'bool' ? (
                    <Select value={draft[f.key] || 'false'} options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                  ) : (
                    <Input
                      type={f.kind === 'date' ? 'date' : f.kind === 'money' || f.kind === 'number' ? 'number' : 'text'}
                      step={f.kind === 'money' ? '0.01' : undefined}
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          ) : (
            <>
              {body.length > 0 && (
                <dl className="ip-facts">
                  {body.map((f) => (
                    <div key={f.key} className="ip-fact" data-long={f.kind === 'long' ? 'true' : undefined}>
                      <dt>{f.label}</dt>
                      <dd>{display(f, item[f.key])}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {emptyCount > 0 && (
                <p className="ip-empty">
                  {body.length === 0 ? 'No details filled in yet.' : `${emptyCount} more field${emptyCount === 1 ? '' : 's'} not filled in.`}{' '}
                  <button type="button" className="ip-link" onClick={startEdit}>Fill them in</button>
                </p>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'log' && tool.type === 'daily_logs' && (
        <section className="ip-section" aria-label="Daily log sections">
          <DailyLogSections logId={id} projectId={projectId} files={files} onFilesChanged={load} onSaved={() => { setHistoryKey((k) => k + 1); void load(); }} show={show} />
        </section>
      )}
      {tab === 'comments' && <CommentsTab type={type} id={id} projectId={projectId} tool={tool} comments={comments} reload={loadComments} show={show} />}
      {tab === 'related' && relType && (
        <section className="ip-section" aria-label="Related items">
          <RelatedItems type={relType} id={id} projectId={projectId} heading={null} onCount={setLinkCount} />
        </section>
      )}
      {tab === 'files' && <FilesTab tool={tool} id={id} projectId={projectId} files={files} reload={load} show={show} />}
      {tab === 'history' && <section className="ip-section"><ItemHistory key={historyKey} entityType={tool.table} entityId={id} /></section>}
    </PageShell>
  );
}

/* ── Comments ─────────────────────────────────────────────────────────────── */

async function uploadToItem(file: File, projectId: string, tool: ItemTool, id: string): Promise<{ id: string; name: string } | string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('projectId', projectId);
  fd.append('entityType', tool.table);
  fd.append('entityId', id);
  fd.append('category', 'item-attachment');
  const r = await fetch('/api/files/upload', { method: 'POST', credentials: 'include', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.file) return (j.failed?.[0]?.error as string) || j.error || `Couldn't upload ${file.name}.`;
  return { id: j.file.id, name: j.file.file_name || file.name };
}

function CommentsTab({ type, id, projectId, tool, comments, reload, show }: {
  type: string; id: string; projectId: string; tool: ItemTool; comments: Comment[] | null; reload: () => Promise<void>; show: (m: string, t?: 'good' | 'bad') => void;
}) {
  const [text, setText] = useState('');
  const [official, setOfficial] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!text.trim() && pending.length === 0) return;
    setBusy(true);
    const attachments: { id: string; name: string }[] = [];
    for (const f of pending) {
      const up = await uploadToItem(f, projectId, tool, id);
      if (typeof up === 'string') { show(up, 'bad'); setBusy(false); return; }
      attachments.push(up);
    }
    const r = await fetch(`/api/items/${type}/${id}/comments`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, attachments, official }),
    });
    setBusy(false);
    if (!r.ok) { show(await readErr(r, "Couldn't post the comment."), 'bad'); return; }
    setText(''); setPending([]); setOfficial(false);
    await reload();
  };

  const remove = async (c: Comment) => {
    const r = await fetch(`/api/items/${type}/${id}/comments?commentId=${c.id}`, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) { show(await readErr(r, "Couldn't remove the comment."), 'bad'); return; }
    await reload();
  };

  return (
    <section className="ip-section" aria-label="Comments">
      {comments === null ? <div className="ip-loading">Loading comments…</div> : comments.length === 0 ? (
        <p className="ip-muted">No comments yet.</p>
      ) : (
        <ol className="ip-thread">
          {comments.map((c) => (
            <li key={c.id} className="ip-comment" data-official={c.is_official ? 'true' : undefined}>
              <div className="ip-comment-head">
                <strong>{c.author_name || 'Someone'}</strong>
                {c.is_official && <span className="ip-official">Official answer</span>}
                <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                {c.mine && <button type="button" className="ip-icon-btn" aria-label="Remove my comment" onClick={() => void remove(c)}><Trash size={14} /></button>}
              </div>
              {c.body && <p className="ip-comment-body">{c.body}</p>}
              {!!c.attachments?.length && (
                <ul className="ip-attach">{c.attachments.map((a) => <li key={a.id}><Paperclip size={13} /> {a.name}</li>)}</ul>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="ip-compose">
        <Textarea rows={3} placeholder={`Comment on this ${nounInSentence(tool)}…`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Comment" />
        <div className="ip-compose-row">
          <label className="ip-file-btn">
            <Paperclip size={15} /> Attach
            <input type="file" multiple onChange={(e) => setPending(Array.from(e.target.files || []))} />
          </label>
          {pending.length > 0 && <span className="ip-muted">{pending.length} file{pending.length === 1 ? '' : 's'} ready</span>}
          {tool.type === 'rfis' && (
            <label className="ip-check"><input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} /> Mark as official answer</label>
          )}
          <div className="ip-spacer" />
          <Button variant="primary" icon={<ChatText size={15} />} onClick={() => void post()} disabled={busy || (!text.trim() && pending.length === 0)}>{busy ? 'Posting…' : 'Post'}</Button>
        </div>
      </div>
    </section>
  );
}

/* ── Files ────────────────────────────────────────────────────────────────── */

function FilesTab({ tool, id, projectId, files, reload, show }: {
  tool: ItemTool; id: string; projectId: string; files: FileRow[]; reload: () => Promise<void>; show: (m: string, t?: 'good' | 'bad') => void;
}) {
  const [busy, setBusy] = useState(false);
  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    for (const f of Array.from(list)) {
      const up = await uploadToItem(f, projectId, tool, id);
      if (typeof up === 'string') { show(up, 'bad'); break; }
    }
    setBusy(false);
    await reload();
  };
  return (
    <section className="ip-section" aria-label="Files">
      <div className="ip-row-head">
        <span className="ip-muted">{files.length === 0 ? `No files on this ${nounInSentence(tool)} yet.` : `${files.length} file${files.length === 1 ? '' : 's'}`}</span>
        <div className="ip-spacer" />
        <label className="ip-file-btn ip-file-btn-strong">
          <Paperclip size={15} /> {busy ? 'Uploading…' : 'Add files'}
          <input type="file" multiple disabled={busy} onChange={(e) => void add(e.target.files)} />
        </label>
      </div>
      {files.length > 0 && (
        <ul className="ip-list">
          {files.map((f) => (
            <li key={f.id}>
              <FileText size={16} />
              <span className="ip-name">{f.name}</span>
              <span className="ip-status">{f.size ? `${Math.max(1, Math.round(f.size / 1024)).toLocaleString('en-US')} KB` : ''}</span>
              {f.url && <a className="ip-icon-btn" href={f.url} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`}><ArrowSquareOut size={15} /></a>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CSS = `
.ip-loading{color:var(--text-secondary);font-size:14px;padding:16px 0}
.ip-muted{color:var(--text-secondary);font-size:14px;margin:0}
.ip-chain{padding:4px 0 20px;margin-bottom:4px;border-bottom:1px solid var(--border-default)}
.ip-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));border-top:1px solid var(--border-default);border-bottom:1px solid var(--border-default);margin:4px 0 16px}
.ip-strip-cell{display:flex;flex-direction:column;gap:4px;padding:12px 16px 12px 0}
.ip-strip-cell + .ip-strip-cell{padding-left:16px;border-left:1px solid var(--border-default)}
.ip-strip-label{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-tertiary)}
.ip-strip-value{font-size:15px;font-weight:600;color:var(--text-primary);overflow-wrap:anywhere}
.ip-strip-cell[data-late="true"] .ip-strip-value{color:var(--danger)}
.ip-section{padding:16px 0}
.ip-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 32px;margin:0}
.ip-fact{display:flex;flex-direction:column;gap:4px;padding:12px 0;border-bottom:1px solid var(--border-default)}
.ip-fact[data-long="true"]{grid-column:1/-1}
.ip-fact dt{font-size:13px;color:var(--text-tertiary);font-weight:600}
.ip-fact dd{margin:0;font-size:15px;color:var(--text-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.ip-empty{margin:12px 0 0;font-size:14px;color:var(--text-tertiary)}
.ip-link{position:relative;background:none;border:0;padding:0;font:inherit;font-weight:650;color:var(--link);cursor:pointer}
.ip-link::after{content:'';position:absolute;inset:-12px -8px}
.ip-link:hover{color:var(--link-hover)}
.ip-link:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:4px}
.ip-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px 24px}
.ip-form .k-span-all{grid-column:1/-1}
.ip-thread{list-style:none;margin:0 0 16px;padding:0}
.ip-comment{padding:12px 0;border-bottom:1px solid var(--border-default)}
.ip-comment[data-official="true"]{border-left:3px solid var(--success);padding-left:12px}
.ip-comment-head{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--text-primary)}
.ip-comment-head time{margin-left:auto;color:var(--text-tertiary);font-size:12px}
.ip-official{font-size:12px;font-weight:700;color:var(--success)}
.ip-comment-body{margin:6px 0 0;font-size:15px;color:var(--text-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.ip-attach{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:var(--text-secondary)}
.ip-compose{display:flex;flex-direction:column;gap:8px}
.ip-compose textarea{font-size:16px}
.ip-compose-row,.ip-row-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ip-spacer{flex:1}
.ip-file-btn{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:1px solid var(--border-default);border-radius:8px;color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;overflow:hidden}
.ip-file-btn:hover{color:var(--text-primary)}
.ip-file-btn input{position:absolute;inset:0;opacity:0;cursor:pointer}
.ip-check{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-size:14px;color:var(--text-secondary);cursor:pointer}
.ip-check input{accent-color:var(--brand-primary);width:20px;height:20px}
.ip-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);cursor:pointer}
.ip-icon-btn:hover{color:var(--text-primary);background:var(--bg-surface-2)}
.ip-list{list-style:none;margin:8px 0 0;padding:0}
.ip-list li{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:12px;min-height:48px;border-bottom:1px solid var(--border-default);font-size:14px;color:var(--text-secondary)}
.ip-name{color:var(--text-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ip-status{color:var(--text-secondary);font-size:13px}
@media (max-width:640px){.ip-strip-cell + .ip-strip-cell{border-left:0;padding-left:0}.ip-strip-cell{border-bottom:1px solid var(--border-default)}.ip-list li{grid-template-columns:minmax(0,1fr) auto}.ip-status{display:none}}
`;

