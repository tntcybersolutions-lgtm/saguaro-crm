'use client';
/**
 * Industry-standard file-type icons (the Drive/Dropbox/GitHub convention):
 * a document glyph with a folded corner in the color the eye associates with
 * the format — Adobe-red for PDF, Excel-green for XLS/CSV — WITHOUT using the
 * trademarked Adobe/Microsoft logos themselves (those are licensed marks; a
 * generic file button is not a permitted use). Crisp at 16-22px.
 */
import React from 'react';

function FileGlyph({ color, label, size = 18 }: { color: string; label: string; size?: number }) {
  const w = size, h = Math.round(size * 1.18);
  return (
    <svg width={w} height={h} viewBox="0 0 20 24" fill="none" aria-hidden focusable="false">
      <path d="M2 3a2 2 0 0 1 2-2h8.5L18 6.5V21a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3z" fill={color} />
      <path d="M12.5 1 18 6.5h-4.5a1 1 0 0 1-1-1V1z" fill="rgba(255,255,255,0.45)" />
      <rect x="2" y="12.5" width="16" height="7.5" rx="1.2" fill="rgba(0,0,0,0.28)" />
      <text x="10" y="18.4" textAnchor="middle" fontSize="5.6" fontWeight="800" fill="#FFFFFF"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letterSpacing="0.4">
        {label}
      </text>
    </svg>
  );
}

/** Adobe-red PDF document icon. */
export const PdfIcon = ({ size = 18 }: { size?: number }) => <FileGlyph color="#E2231A" label="PDF" size={size} />;
/** Excel-green spreadsheet icon. */
export const XlsIcon = ({ size = 18 }: { size?: number }) => <FileGlyph color="#1E7145" label="XLS" size={size} />;
/** Excel-green CSV variant. */
export const CsvIcon = ({ size = 18 }: { size?: number }) => <FileGlyph color="#1E7145" label="CSV" size={size} />;
/** Word. #2B579A is Microsoft's own Word blue, matching the Excel green and
 *  Acrobat red already used here so the row reads as one family. */
export const DocIcon = ({ size = 18 }: { size?: number }) => <FileGlyph color="#2B579A" label="DOC" size={size} />;

/** Uniform download-button wrapper: icon + optional text, machined ghost chrome. */
export function FileButton({ icon, label, onClick, disabled, title }: {
  icon: React.ReactNode; label?: string; onClick: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="pmBtn"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: label ? '5px 11px' : '5px 8px',
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 9, color: '#E4E4E7', fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}{label}
    </button>
  );
}
