import React from 'react';
import { docCategory, docCode, DOC_CATEGORY_COLOR } from '@/lib/doc-category';

/**
 * A document-kind tile: a page with a folded corner, the form's short code
 * (G702, COI, LW…) and a small file-format tag. Replaces the generic red
 * "PDF" pill — the row now says WHAT the document is, not just its format.
 */
export function DocKindTile({ docType, format = 'PDF', size = 40 }: { docType: string | null | undefined; format?: string; size?: number }) {
  const color = DOC_CATEGORY_COLOR[docCategory(docType)];
  const code = docCode(docType);
  const w = size * 0.82;
  const h = size;
  const fold = size * 0.26;
  return (
    <span aria-hidden style={{ position: 'relative', display: 'inline-block', width: w, height: h, flexShrink: 0 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
        <path
          d={`M2 2 H${w - fold} L${w - 2} ${fold} V${h - 2} H2 Z`}
          fill="var(--surface-raised)"
          stroke={color}
          strokeOpacity={0.75}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path d={`M${w - fold} 2 V${fold} H${w - 2}`} fill="none" stroke={color} strokeOpacity={0.75} strokeWidth={1.5} strokeLinejoin="round" />
        <rect x={2.75} y={h * 0.72} width={w - 5.5} height={h * 0.28 - 2.75} fill={color} />
      </svg>
      <span style={{
        position: 'absolute', left: 0, right: 0, top: h * 0.2, textAlign: 'center',
        fontSize: code.length > 3 ? size * 0.22 : size * 0.26, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em',
      }}>{code}</span>
      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: size * 0.04, textAlign: 'center',
        fontSize: size * 0.18, fontWeight: 900, color: 'var(--on-brand)', letterSpacing: '0.02em',
      }}>{format}</span>
    </span>
  );
}
