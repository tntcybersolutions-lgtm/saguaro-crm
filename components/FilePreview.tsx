'use client';
/**
 * Multi-format file preview. Renders inline by kind:
 *   image → <img> (zoomable), video → <video controls>, audio → <audio>,
 *   pdf → <iframe>, everything else → a typed download card.
 * `url` must be an openable (signed) URL. Pure presentational — no data fetching.
 */
import React from 'react';
import { FileText, FilePdf, FileDoc, FileXls, FileVideo, FileAudio, Cube, File as FileIcon, DownloadSimple } from '@phosphor-icons/react';
import type { FileKind } from '@/lib/filekind';

const ICON: Record<FileKind, React.ReactNode> = {
  image: <FileIcon size={54} />, video: <FileVideo size={54} />, audio: <FileAudio size={54} />,
  pdf: <FilePdf size={54} />, doc: <FileDoc size={54} />, sheet: <FileXls size={54} />,
  cad: <Cube size={54} />, other: <FileText size={54} />,
};
export const KIND_TINT: Record<FileKind, string> = {
  image: 'var(--brand-primary)', video: 'var(--warning)', audio: 'var(--warning)', pdf: 'var(--danger)',
  doc: 'var(--warning)', sheet: 'var(--success)', cad: 'var(--warning)', other: 'var(--status-closed)',
};

export function FilePreview({ kind, url, name, height = 460 }: { kind: FileKind; url?: string | null; name?: string; height?: number }) {
  const box: React.CSSProperties = { width: '100%', height, background: '#0b0f14', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  if (!url) return <div style={box}><span style={{ color: 'var(--status-closed)' }}>No preview available</span></div>;

  if (kind === 'image') return <div style={box}><img src={url} alt={name || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></div>;
  // preload="metadata" + a direct (range-capable) src lets the browser stream
  // and seek without downloading the whole file first — smooth playback, fast
  // start, even on large site videos.
  if (kind === 'video') return <div style={box}><video src={url} controls playsInline preload="metadata" style={{ maxWidth: '100%', maxHeight: '100%' }} /></div>;
  if (kind === 'audio') return <div style={{ ...box, height: 120, flexDirection: 'column', gap: 14 }}><FileAudio size={40} color={KIND_TINT.audio} /><audio src={url} controls style={{ width: '80%' }} /></div>;
  if (kind === 'pdf') return <iframe src={url} title={name || 'PDF'} style={{ width: '100%', height, border: 'none', borderRadius: 12, background: 'var(--text-primary)' }} />;

  // doc / sheet / cad / other — no inline renderer, offer download
  return (
    <div style={{ ...box, flexDirection: 'column', gap: 14 }}>
      <div style={{ color: KIND_TINT[kind] }}>{ICON[kind]}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, maxWidth: '80%', textAlign: 'center', wordBreak: 'break-word' }}>{name || 'File'}</div>
      <a href={url} download={name} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--brand-primary)', color: 'var(--on-brand)', fontWeight: 700, padding: '9px 18px', borderRadius: 9, textDecoration: 'none', fontSize: 14 }}><DownloadSimple size={16} weight="bold" />Download to View</a>
    </div>
  );
}

/** Small thumbnail for grid cards. Images/video posters show the media; others show a tinted icon. */
export function FileThumb({ kind, url, poster, size = 132 }: { kind: FileKind; url?: string | null; poster?: string | null; size?: number }) {
  /* The whole picture, never cropped and never framed: it keeps its own shape
     inside the tile's height, with nothing painted beside it. */
  const wrap: React.CSSProperties = { width: '100%', height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' };
  const pic: React.CSSProperties = { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 6, display: 'block' };
  /* A tile is ~168px: draw the stored ~400px thumbnail (poster) when there is
     one, and never decode an off-screen original. The full original stays for
     FilePreview / Download. */
  if (kind === 'image' && (poster || url)) return <div style={wrap}><img src={poster || url || ''} alt="" loading="lazy" decoding="async" style={pic} /></div>;
  if (kind === 'video') return (
    <div style={wrap}>
      {poster ? <img src={poster} alt="" loading="lazy" decoding="async" style={pic} /> : <FileVideo size={40} color={KIND_TINT.video} />}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '13px solid #fff', marginLeft: 3 }} /></div></div>
    </div>
  );
  return <div style={wrap}><div style={{ color: KIND_TINT[kind] }}>{ICON[kind]}</div></div>;
}
