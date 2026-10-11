'use client';
/**
 * QuickMedia — photos and video from anywhere, to any job, in one or two taps.
 *
 * Chad, 2026-10-11: "users need an easier way to use photos and videos — they
 * use these features a lot and it's hard to find … a million clicks … an easy
 * way to drop, drag, pinch the photo and video and send to any project."
 *
 * Mounted once in the app shell (app/app/layout.tsx). Opened by:
 *   - the camera button in the middle of the phone's bottom tabs;
 *   - the Photos button in the desktop top bar;
 *   - ⌘K / Search ("photo", "video", "camera", "upload");
 *   - dropping photos or videos anywhere on a page that has no drop zone of
 *     its own (the job's Photos page keeps its own);
 *   - any link with ?media=1.
 *
 * It is the same sheet the job's Photos page uses (MediaUploadPanel: Take
 * Photo, Record Video, Choose — many at once), with "Send to" on top: the job
 * you are in, else the last job you sent to. Picked files go straight to that
 * job; dropped files wait for you to confirm the job. No signal → kept on the
 * phone and sent when you are back online (lib/offline/outbox), as on the
 * Photos page. Pinch-zoom and full screen live in the Photos page viewer
 * (components/media/ZoomLightbox), which this links to.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Images, PaperPlaneTilt, UploadSimple, X } from '@phosphor-icons/react';
import MediaUploadPanel from '@/components/media/MediaUploadPanel';
import { useUploadQueue } from '@/lib/useUploadQueue';
import { uploadPhoto, uploadVideo, mediaKindOf } from '@/lib/media-upload';
import { addToOutbox, isOffline, looksLikeNetworkError } from '@/lib/offline/outbox';
import { useToast } from '@/components/Toast';

export const QUICK_MEDIA_EVENT = 'saguaro:quick-media';
const LAST_JOB_KEY = 'sag_quick_media_job';
const JOB_IN_PATH = /^\/app\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Open the sheet from anywhere (a button, ⌘K). Dropped files may ride along. */
export function openQuickMedia(files?: File[]) {
  window.dispatchEvent(new CustomEvent(QUICK_MEDIA_EVENT, { detail: { files } }));
}

type Job = { id: string; name: string };

const CSS = `
.qmTo { display: grid; gap: 6px; }
.qmTo label { font-size: 13px; font-weight: 800; color: var(--brand-primary); }
.qmTo select { width: 100%; min-height: 48px; padding: 0 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent); background: var(--bg-solid); color: var(--text-primary); font: inherit; font-size: 16px; font-weight: 700; }
.qmStaged { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px; border-radius: 12px; border: 1px dashed color-mix(in srgb, var(--brand-primary) 55%, transparent); background: color-mix(in srgb, var(--brand-primary) 8%, transparent); font-size: 14px; font-weight: 700; }
.qmStaged span { flex: 1 1 160px; min-width: 0; }
.qmBtn { min-height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--border-default); background: rgba(255,255,255,0.04); color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.qmBtn[data-primary] { border: none; background: var(--brand-primary); color: var(--on-brand); }
.qmAll { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--brand-primary); font-size: 14px; font-weight: 800; text-decoration: none; }
.qmDrag { position: fixed; inset: 0; z-index: 10030; pointer-events: none; display: flex; align-items: flex-end; justify-content: center; padding: 24px; background: color-mix(in srgb, var(--bg-base, black) 35%, transparent); outline: 3px dashed var(--brand-primary); outline-offset: -10px; }
.qmDrag div { display: inline-flex; align-items: center; gap: 10px; padding: 14px 20px; border-radius: 14px; background: var(--brand-primary); color: var(--on-brand); font-size: 16px; font-weight: 800; box-shadow: 0 0 30px color-mix(in srgb, var(--brand-primary) 50%, transparent); }
`;

export default function QuickMedia() {
  const pathname = usePathname() || '';
  const search = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobId, setJobId] = useState('');
  const [staged, setStaged] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const jobRef = useRef('');
  jobRef.current = jobId;
  const jobsRef = useRef<Job[] | null>(null);
  jobsRef.current = jobs;
  /** The job each file was sent to, fixed when it was picked. */
  const fileJob = useRef(new WeakMap<File, string>());
  const routeJob = pathname.match(JOB_IN_PATH)?.[1] || '';
  const jobName = useCallback((id: string) => jobsRef.current?.find((j) => j.id === id)?.name || 'the job', []);

  /* Jobs to send to: loaded the first time the sheet opens. */
  useEffect(() => {
    if (!open || jobs) return;
    let alive = true;
    fetch('/api/projects?limit=200&fields=id,name', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((j) => { if (alive) setJobs(((j?.projects || []) as Job[]).filter((p) => p?.id && p.name)); })
      .catch(() => { if (alive) setJobs([]); });
    return () => { alive = false; };
  }, [open, jobs]);

  /* Default job: the one you are in, else the last one you sent to, else the first. */
  useEffect(() => {
    if (!open || !jobs) return;
    if (routeJob && jobs.some((j) => j.id === routeJob)) { setJobId(routeJob); return; }
    if (jobId && jobs.some((j) => j.id === jobId)) return;
    let last = '';
    try { last = localStorage.getItem(LAST_JOB_KEY) || ''; } catch { last = ''; }
    setJobId(jobs.some((j) => j.id === last) ? last : jobs[0]?.id || '');
  }, [open, jobs, routeJob]); // eslint-disable-line react-hooks/exhaustive-deps

  const queue = useUploadQueue(async (file, kind, onProgress) => {
    const projectId = fileJob.current.get(file) || jobRef.current;
    if (!projectId) throw new Error('Pick a job first.');
    const keep = async () => {
      await addToOutbox({ projectId, kind, album: kind === 'video' ? null : 'General', name: file.name || (kind === 'video' ? 'video.mov' : 'photo.jpg'), type: file.type, size: file.size, file });
      return { doneLabel: "Saved on this phone — sends when you're back online" };
    };
    if (isOffline()) return keep();
    try {
      if (kind === 'video') {
        const f = await uploadVideo(file, { projectId, onProgress });
        return { thumb: (f.poster_url as string) || null, doneLabel: `Sent to ${jobName(projectId)}` };
      }
      const ph = await uploadPhoto(file, { projectId, album: 'General', onProgress });
      return { thumb: (ph.thumbnail_url as string) || (ph.url as string) || null, doneLabel: `Sent to ${jobName(projectId)}` };
    } catch (e) {
      if (looksLikeNetworkError(e)) return keep();
      throw e;
    }
  }, {
    // The job's Photos page, if it is open, shows them as they land.
    onItemDone: () => window.dispatchEvent(new CustomEvent('saguaro:outbox-synced')),
    onDrained: ({ done, failed }) => {
      if (failed) showToast(`${done} sent, ${failed} didn't upload — open Photo to retry.`, 'error');
      else if (done) showToast(done === 1 ? `1 sent to ${jobName(jobRef.current)}.` : `${done} sent to ${jobName(jobRef.current)}.`, 'success');
    },
  });

  /** Send files to the chosen job now. */
  const send = useCallback((files: File[] | FileList) => {
    const id = jobRef.current;
    if (!id) { showToast('Pick the job first.', 'error'); return; }
    const arr = Array.from(files);
    for (const f of arr) fileJob.current.set(f, id);
    try { localStorage.setItem(LAST_JOB_KEY, id); } catch { /* remembered for next time only */ }
    const skipped = queue.add(arr);
    if (skipped) showToast(skipped === 1 ? '1 file skipped — only photos and videos go here.' : `${skipped} files skipped — only photos and videos go here.`, 'error');
  }, [queue, showToast]);

  /* Open from a button, ⌘K or a drop. Dropped files wait for the job to be confirmed. */
  useEffect(() => {
    const onOpen = (e: Event) => {
      const files = ((e as CustomEvent).detail?.files || []) as File[];
      const media = files.filter((f) => mediaKindOf(f));
      if (files.length && !media.length) { showToast('Only photos and videos go here — use Files & Media for documents.', 'error'); return; }
      if (media.length) setStaged((s) => [...s, ...media]);
      setOpen(true);
    };
    window.addEventListener(QUICK_MEDIA_EVENT, onOpen);
    return () => window.removeEventListener(QUICK_MEDIA_EVENT, onOpen);
  }, [showToast]);

  /* ?media=1 on any link opens it (a search result kept in "recent", a notification). */
  useEffect(() => {
    if (search?.get('media') !== '1') return;
    setOpen(true);
    const q = new URLSearchParams(search.toString());
    q.delete('media');
    router.replace(pathname + (q.toString() ? `?${q}` : ''), { scroll: false });
  }, [search, pathname, router]);

  /* Drop anywhere: a page with its own drop zone handles its drop first (it
     prevents the default); everywhere else the files come here instead of the
     browser opening the file and leaving the app. */
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    // A page with its own drop zone (the job's Photos page) claims the drag in
    // its own handler first; then there is no banner here.
    const onEnter = (e: DragEvent) => { if (hasFiles(e) && !e.defaultPrevented) { depth++; setDragging(true); } };
    const onLeave = (e: DragEvent) => { if (hasFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); } };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      openQuickMedia(Array.from(e.dataTransfer?.files || []));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // Going to another screen closes the sheet; uploads keep going. (Only on a
  // real change — on first load ?media=1 has just opened it.)
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setOpen(false);
  }, [pathname]);

  const close = () => { setOpen(false); setStaged([]); };
  const target = jobs?.find((j) => j.id === jobId);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {dragging && !open && (
        <div className="qmDrag" aria-hidden="true"><div><UploadSimple size={20} weight="bold" /> Drop photos &amp; videos to send them to a job</div></div>
      )}
      <MediaUploadPanel
        open={open}
        onClose={close}
        title="Photos & video"
        subtitle="Pick the job, then take or choose. No signal? It saves on this phone and sends later."
        items={queue.items}
        onFiles={send}
        onRetry={queue.retry}
        onRemove={queue.remove}
        doneLabel="Done"
        extra={target ? (
          <Link className="qmAll" href={`/app/projects/${target.id}/photos`}>
            <Images size={18} weight="bold" /> See all photos &amp; video on {target.name} ›
          </Link>
        ) : null}
      >
        <div className="qmTo">
          <label htmlFor="qm-job">Send to</label>
          <select id="qm-job" data-no-guard="" value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={!jobs}>
            {!jobs && <option value="">Loading jobs…</option>}
            {jobs && !jobs.length && <option value="">No jobs yet</option>}
            {jobs?.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </div>
        {staged.length > 0 && (
          <div className="qmStaged">
            <span>{staged.length === 1 ? '1 file ready' : `${staged.length} files ready`} — send {staged.length === 1 ? 'it' : 'them'} to {target?.name || 'the job above'}?</span>
            <button type="button" className="qmBtn" onClick={() => setStaged([])}><X size={16} weight="bold" /> Clear</button>
            <button type="button" className="qmBtn" data-primary="" disabled={!jobId} onClick={() => { send(staged); setStaged([]); }}>
              <PaperPlaneTilt size={16} weight="bold" /> Send
            </button>
          </div>
        )}
      </MediaUploadPanel>
    </>
  );
}
