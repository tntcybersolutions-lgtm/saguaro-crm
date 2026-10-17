'use client';
/**
 * The "add photos & video" sheet, shared by the job's Photos page and the sub
 * portal's end-of-day upload.
 *
 * Phone: three big buttons (Take Photo, Record Video, Choose from Phone — the
 * last picks many at once). Desktop: one Choose button and the whole sheet is a
 * drop target. Every file gets its own row with a progress bar; a failed row
 * can be retried on its own. Closing the sheet never stops an upload — the
 * queue belongs to the page.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, VideoCamera, Images, X, ArrowClockwise, CheckCircle, WarningCircle, FilmStrip, Image as ImageIcon, UploadSimple,
} from '@phosphor-icons/react';
import type { QueueItem } from '@/lib/useUploadQueue';
import { fmtBytes } from '@/lib/media-upload';

const CSS = `
.mu { position: fixed; inset: 0; z-index: 10040; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(2,6,23,0.72); }
.muSheet { position: relative; width: min(640px, 100%); max-height: min(92vh, 860px); display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--border-default); background: var(--bg-surface); box-shadow: var(--shadow-lg); color: var(--text-primary); overflow: hidden; }
.muHead { display: flex; align-items: flex-start; gap: 12px; padding: 18px 18px 12px; }
.muHead h2 { margin: 0; }
.muHead p { margin: 4px 0 0; font-size: 14px; line-height: 1.45; color: var(--text-secondary); }
.muX { margin-left: auto; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.muInline .muBody { padding: 0; overflow: visible; }
.muInline[data-drag="true"] { outline: 2px dashed var(--focus-ring); outline-offset: 6px; border-radius: 14px; }
.muBody { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 18px 12px; display: flex; flex-direction: column; gap: 14px; }
.muPick { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
/* Take Photo is THE action (yellow); Record and Choose are slate secondaries. */
.muBig { min-height: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px 8px; border-radius: 12px; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; text-align: center; }
.muBig:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.muBig:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.muBig svg { color: var(--text-secondary); }
.muBig[data-primary="true"] { border-color: var(--brand-primary); background: var(--brand-primary); color: var(--on-brand); font-weight: 700; }
.muBig[data-primary="true"]:hover { background: var(--brand-primary-hover); }
.muBig[data-primary="true"] svg { color: var(--on-brand); }
.mu[data-drag="true"] .muSheet { outline: 2px dashed var(--focus-ring); outline-offset: -8px; }
.muDropHint { display: flex; align-items: center; gap: 8px; min-height: 40px; color: var(--text-secondary); font-size: 14px; font-weight: 600; }
.muList { display: flex; flex-direction: column; gap: 8px; }
.muRow { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 8px; border-radius: 10px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); }
.muThumb { width: 48px; height: 48px; border-radius: 8px; overflow: hidden; background: var(--bg-input); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); }
.muThumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.muName { font-size: 14px; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muMeta { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 12px; color: var(--text-tertiary); min-width: 0; }
.muMeta[data-tone="bad"] { color: var(--c-red); }
.muMeta[data-tone="good"] { color: var(--c-green); }
.muMeta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muBar { height: 4px; margin-top: 6px; border-radius: 4px; background: var(--bg-input); overflow: hidden; }
.muBar > i { display: block; height: 100%; background: var(--success); border-radius: 4px; transition: width .2s ease; }
.muRowBtn { min-width: 44px; height: 44px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-primary); font: inherit; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
.muFoot { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 18px max(14px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border-subtle); background: var(--bg-surface); }
.muSum { flex: 1; min-width: 0; font-size: 14px; color: var(--text-secondary); }
.muDone { min-height: 44px; padding: 0 22px; border-radius: 10px; border: none; background: var(--brand-primary); color: var(--on-brand); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; }
.muDone:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
/* Camera buttons show on touch devices, the drop zone on mouse ones. Decided
   in script (touch points or any coarse pointer), not by (pointer: fine): a
   phone in a desktop-ish browser mode, or a tablet with a trackpad attached,
   must never lose Take Photo. */
.mu:not([data-touch]) .muCam, .muInline:not([data-touch]) .muCam { display: none; }
.mu:not([data-mouse]) .muCamHide, .muInline:not([data-mouse]) .muCamHide { display: none; }
.mu:not([data-touch]) .muPick, .muInline:not([data-touch]) .muPick { grid-template-columns: minmax(0, 1fr); }
.mu:not([data-touch]) .muBig, .muInline:not([data-touch]) .muBig { min-height: 64px; flex-direction: row; }
@media (max-width: 640px) {
  .mu { align-items: flex-end; padding: 0; }
  .muSheet { width: 100%; max-height: 94vh; border-radius: 20px 20px 0 0; border-bottom: none; }
  .muBody input, .muBody select, .muBody textarea { font-size: 16px !important; }
}
@media (max-width: 360px) { .muPick { grid-template-columns: minmax(0, 1fr); } .muBig { min-height: 60px; flex-direction: row; } }
`;

export interface MediaUploadPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  items: QueueItem[];
  onFiles: (files: FileList | File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  /** Fields that apply to the next files picked (album, note, destination…). */
  children?: React.ReactNode;
  /** Shown under the pick buttons, e.g. "Photos any size · video up to 500 MB". */
  hint?: React.ReactNode;
  doneLabel?: string;
  /** Hide the Record Video button (e.g. a photos-only context). */
  photosOnly?: boolean;
  /** Secondary content under the pick buttons (an alternate way in, a note). */
  extra?: React.ReactNode;
  /** Render in the page (no overlay, no close) — the sub portal's End of Day tab. */
  inline?: boolean;
}

export default function MediaUploadPanel(p: MediaUploadPanelProps) {
  const camRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  // Touch → camera buttons. A mouse or trackpad → the drop zone. A touch
  // laptop gets both.
  const [touch, setTouch] = useState(false);
  const [mouse, setMouse] = useState(true);
  useEffect(() => {
    try {
      setTouch((navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(any-pointer: coarse)').matches);
      setMouse(window.matchMedia('(any-pointer: fine)').matches);
    } catch {
      setTouch(false); // no navigator/matchMedia: treat as a mouse device
      setMouse(true);
    }
  }, []);
  const depth = useRef(0);

  useEffect(() => {
    if (!p.open || p.inline) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open]);

  if (!p.open || typeof document === 'undefined') return null;

  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) p.onFiles(e.target.files);
    e.target.value = '';
  };

  const done = p.items.filter((i) => i.status === 'done').length;
  const failed = p.items.filter((i) => i.status === 'failed').length;
  const active = p.items.filter((i) => i.status === 'waiting' || i.status === 'uploading').length;
  const summary = !p.items.length
    ? 'No files selected.'
    : active
      ? `Uploading… ${done} of ${p.items.length - failed} done${failed ? ` · ${failed} failed` : ''}`
      : `${done} uploaded${failed ? ` · ${failed} failed — tap Retry` : ''}`;

  const body = (
    <div className="muBody">
      {p.children}

      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={take} />
      <input ref={vidRef} type="file" accept="video/*" capture="environment" hidden onChange={take} />
      <input ref={libRef} type="file" accept={p.photosOnly ? 'image/*' : 'image/*,video/*'} multiple hidden onChange={take} />

      <div className="muPick">
        <button type="button" className="muBig muCam" data-primary="true" onClick={() => camRef.current?.click()}>
          <Camera size={26} weight="duotone" /> Take Photo
        </button>
        {!p.photosOnly && (
          <button type="button" className="muBig muCam" onClick={() => vidRef.current?.click()}>
            <VideoCamera size={26} weight="duotone" /> Record Video
          </button>
        )}
        <button type="button" className="muBig" onClick={() => libRef.current?.click()}>
          <Images size={26} weight="duotone" />
          {p.photosOnly ? 'Choose Photos' : 'Choose Photos & Videos'}
        </button>
      </div>
      <div className="muDropHint muCamHide"><UploadSimple size={18} /> {drag ? 'Let go to add them' : 'Or drag photos and videos here'}</div>
      {p.hint && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: -6 }}>{p.hint}</div>}
      {p.extra}

      {p.items.length > 0 && (
        <div className="muList" aria-live="polite">
          {p.items.map((it) => <Row key={it.id} it={it} onRetry={p.onRetry} onRemove={p.onRemove} />)}
        </div>
      )}
    </div>
  );

  const dropProps = {
    onDragEnter: (e: React.DragEvent) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); depth.current++; setDrag(true); } },
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDrag(false); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); depth.current = 0; setDrag(false); if (e.dataTransfer?.files?.length) p.onFiles(e.dataTransfer.files); },
  };

  if (p.inline) {
    return (
      <div className="muInline" data-drag={drag ? 'true' : undefined} data-touch={touch ? 'true' : undefined} data-mouse={mouse ? 'true' : undefined} {...dropProps}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {body}
        {p.items.length > 0 && <div className="muSum" style={{ marginTop: 10 }}>{summary}</div>}
      </div>
    );
  }

  return createPortal(
    <div
      className="mu"
      data-drag={drag ? 'true' : undefined}
      data-touch={touch ? 'true' : undefined}
      data-mouse={mouse ? 'true' : undefined}
      onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}
      {...dropProps}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="muSheet" role="dialog" aria-modal="true" aria-label={p.title}>
        <div className="muHead">
          <div style={{ minWidth: 0 }}>
            <h2 className="k-dialog-title">{p.title}</h2>
            {p.subtitle && <p>{p.subtitle}</p>}
          </div>
          <button type="button" className="muX" aria-label="Close" onClick={p.onClose}><X size={20} weight="bold" /></button>
        </div>

        {body}
        <div className="muFoot">
          <div className="muSum">{summary}</div>
          <button type="button" className="muDone" onClick={p.onClose}>
            {active ? 'Keep uploading in background' : p.doneLabel || 'Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ it, onRetry, onRemove }: { it: QueueItem; onRetry: (id: string) => void; onRemove: (id: string) => void }) {
  const tone = it.status === 'failed' ? 'bad' : it.status === 'done' ? 'good' : undefined;
  const label =
    it.status === 'waiting' ? 'Waiting…'
      : it.status === 'uploading' ? (it.progress >= 0.9 ? (it.kind === 'video' ? 'Saving…' : 'Making the preview…') : `Uploading ${Math.round(it.progress * 100)}%`)
        : it.status === 'done' ? (it.doneLabel || 'Saved to the job')
          : it.error || 'Upload failed';
  return (
    <div className="muRow">
      <div className="muThumb">
        {it.thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={it.thumb} alt="" />
          : it.kind === 'video' ? <FilmStrip size={22} /> : <ImageIcon size={22} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="muName" title={it.file.name}>{it.file.name || (it.kind === 'video' ? 'Video' : 'Photo')}</div>
        <div className="muMeta" data-tone={tone}>
          {it.status === 'done' && <CheckCircle size={14} weight="fill" />}
          {it.status === 'failed' && <WarningCircle size={14} weight="fill" />}
          <span>{label} · {fmtBytes(it.file.size)}</span>
        </div>
        {(it.status === 'uploading' || it.status === 'waiting') && <div className="muBar"><i style={{ width: `${Math.round(it.progress * 100)}%` }} /></div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {it.status === 'failed' && <button type="button" className="muRowBtn" onClick={() => onRetry(it.id)}><ArrowClockwise size={16} /> Retry</button>}
        {(it.status === 'failed' || it.status === 'waiting') && <button type="button" className="muRowBtn" aria-label={`Remove ${it.file.name}`} onClick={() => onRemove(it.id)}><X size={16} /></button>}
      </div>
    </div>
  );
}
