'use client';
/**
 * A small picture of a drawing sheet's first page, drawn only when it scrolls
 * into view (PDF via pdf.js, images as-is) and kept for the session.
 */
import React, { useEffect, useRef, useState } from 'react';

const cache = new Map<string, string>();

export default function SheetThumb({ url, isPdf, alt }: { url: string; isPdf: boolean; alt: string }) {
  const key = url.split('?')[0];
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (src || failed || !url) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      try {
        if (!isPdf) { cache.set(key, url); if (!cancelled) setSrc(url); return; }
        const pdfjs = await import('pdfjs-dist');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = await (pdfjs as any).getDocument({ url }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 520 / base.width });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        const data = c.toDataURL('image/jpeg', 0.8);
        cache.set(key, data);
        if (!cancelled) setSrc(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [url, isPdf, key, src, failed]);

  return (
    <div ref={ref} className="st-thumb" data-failed={failed || undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={alt} loading="lazy" /> : <span className="st-skel" aria-hidden />}
      {failed && <span className="st-fail">No preview</span>}
    </div>
  );
}
