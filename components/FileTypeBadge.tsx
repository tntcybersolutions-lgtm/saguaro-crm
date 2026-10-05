import React from 'react';

/**
 * FileTypeBadge — a real, professional file-type chip (PDF / DOCX / XLSX / PNG
 * / MP4 / DWG …) instead of one generic document icon. Derives the type from a
 * filename, a URL, or a MIME type — whichever is available — and colors it the
 * way people expect each format to look.
 *
 * Used anywhere files are listed (documents library, deal media, search), so a
 * list of files reads as the real things it holds, not a wall of identical
 * grey icons.
 */
const MAP: Record<string, { label: string; color: string }> = {
  pdf:  { label: 'PDF',  color: '#FF3B30' },
  doc:  { label: 'DOC',  color: '#FF8A00' }, docx: { label: 'DOCX', color: '#FF8A00' }, rtf: { label: 'RTF', color: '#FF8A00' },
  xls:  { label: 'XLS',  color: '#217346' }, xlsx: { label: 'XLSX', color: '#217346' }, csv: { label: 'CSV', color: '#217346' },
  ppt:  { label: 'PPT',  color: '#D24726' }, pptx: { label: 'PPTX', color: '#D24726' },
  png:  { label: 'PNG',  color: '#FF8A00' }, jpg: { label: 'JPG', color: '#FF8A00' }, jpeg: { label: 'JPG', color: '#FF8A00' },
  gif:  { label: 'GIF',  color: '#FF8A00' }, webp: { label: 'WEBP', color: '#FF8A00' }, heic: { label: 'HEIC', color: '#FF8A00' }, svg: { label: 'SVG', color: '#FF8A00' },
  mp4:  { label: 'MP4',  color: '#FF8A00' }, mov: { label: 'MOV', color: '#FF8A00' }, webm: { label: 'WEBM', color: '#FF8A00' }, m4v: { label: 'M4V', color: '#FF8A00' },
  zip:  { label: 'ZIP',  color: '#A3ACBB' },
  dwg:  { label: 'DWG',  color: '#FF8A00' }, dxf: { label: 'DXF', color: '#FF8A00' }, rvt: { label: 'RVT', color: '#FF8A00' },
  txt:  { label: 'TXT',  color: '#A3ACBB' },
};

/** Best-effort extension from a filename/URL, falling back to a MIME type. */
export function fileExt(nameOrUrl?: string | null, mime?: string | null): string {
  const s = String(nameOrUrl || '').split('?')[0].split('#')[0];
  const m = s.match(/\.([a-z0-9]{1,5})$/i);
  let ext = m ? m[1].toLowerCase() : '';
  if (!ext && mime) {
    const t = mime.toLowerCase();
    if (t.includes('pdf')) ext = 'pdf';
    else if (t.includes('wordprocessing') || t.includes('msword')) ext = 'docx';
    else if (t.includes('spreadsheet') || t.includes('excel')) ext = 'xlsx';
    else if (t.includes('presentation') || t.includes('powerpoint')) ext = 'pptx';
    else if (t.startsWith('image/')) ext = t.split('/')[1] || 'png';
    else if (t.startsWith('video/')) ext = t.split('/')[1] || 'mp4';
    else if (t.includes('zip')) ext = 'zip';
  }
  return ext;
}

export function FileTypeBadge({
  name, url, mime, size = 30, style,
}: {
  name?: string | null; url?: string | null; mime?: string | null; size?: number; style?: React.CSSProperties;
}) {
  const ext = fileExt(name || url, mime);
  const meta = MAP[ext] || { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: '#A3ACBB' };
  return (
    <span
      aria-label={`${meta.label} file`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: size, height: size - 8, padding: '0 7px', borderRadius: 6,
        background: `${meta.color}22`, color: meta.color,
        fontSize: 10, fontWeight: 900, letterSpacing: 0.4, lineHeight: 1,
        border: `1px solid ${meta.color}66`, flexShrink: 0,
        ...style,
      }}
    >
      {meta.label}
    </span>
  );
}

export default FileTypeBadge;
