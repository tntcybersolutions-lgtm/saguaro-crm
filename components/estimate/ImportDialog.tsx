'use client';

/**
 * ImportDialog — bring a workbook into the estimate grid.
 *
 * Buildern's import maps columns then commits straight to the estimate. This
 * stages into the grid instead: imported rows arrive unsaved, so they can be
 * corrected, re-coded or abandoned before anything touches the database. An
 * import that writes first and lets you fix it afterwards is a worse deal on a
 * 300-line workbook, because the fixing happens against live data.
 *
 * The mapping is guessed and then shown, rather than asked for. Header spellings
 * are matched in lib/estimate-import.ts against what real workbooks use, so the
 * common case is confirming one dropdown rather than naming twelve.
 *
 * SheetJS is imported on demand — it is large, and most sessions never import.
 */

import React, { useCallback, useRef, useState } from 'react';
import { X, UploadSimple, WarningCircle, Table, CheckCircle } from '@phosphor-icons/react';
import {
  buildPreview, applyMapping, FIELD_LABELS, FIELD_OPTIONS,
  type ImportField, type ImportPreview,
} from '@/lib/estimate-import';
import type { GridRow } from '@/lib/estimate-grid';

const GOLD = '#F59E0B', DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E';
const BORDER = 'rgba(255,255,255,0.12)';
const HAIR = 'rgba(255,255,255,0.06)';
const SUNK = 'rgba(0,0,0,0.26)';

const ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt';
const MAX_BYTES = 8 * 1024 * 1024;

export default function ImportDialog({
  onClose, onImport,
}: {
  onClose: () => void;
  onImport: (rows: Partial<GridRow>[]) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** Re-derive the rows whenever the user changes a dropdown or the header toggle. */
  const recompute = useCallback((sheet: unknown[][], map: ImportField[], header: boolean, base: ImportPreview) => {
    const { rows, emptyRows } = applyMapping(
      sheet.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== '')),
      map, { hasHeader: header },
    );
    setPreview({ ...base, mapping: map, rows, totalRows: rows.length, emptyRows, skippedHeader: header });
  }, []);

  const rawSheetRef = useRef<unknown[][]>([]);

  const readSheet = useCallback(async (wb: unknown, name: string) => {
    const XLSX = await import('xlsx');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = (wb as any).Sheets[name];
    if (!ws) throw new Error(`Sheet "${name}" is empty`);
    /* header:1 gives arrays of arrays, which is what the mapper wants — the
       object form would silently collapse duplicate header names. defval:''
       keeps ragged rows aligned to their column index. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (XLSX as any).utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true }) as unknown[][];
    rawSheetRef.current = rows;
    const p = buildPreview(rows);
    setPreview(p);
    setMapping(p.mapping);
    setHasHeader(p.skippedHeader);
    setActiveSheet(name);
  }, []);

  const onFile = useCallback(async (file: File) => {
    setError(null); setBusy(true); setPreview(null);
    try {
      if (file.size > MAX_BYTES) throw new Error(`That file is ${(file.size / 1048576).toFixed(1)}MB — the limit is 8MB.`);
      setFileName(file.name);
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wb = (XLSX as any).read(buf, { type: 'array', cellDates: false });
      const names: string[] = wb.SheetNames || [];
      if (names.length === 0) throw new Error('That workbook has no sheets.');
      setWorkbook(wb);
      setSheetNames(names);
      await readSheet(wb, names[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }, [readSheet]);

  const setCol = (index: number, field: ImportField) => {
    const next = [...mapping];
    next[index] = field;
    setMapping(next);
    if (preview) recompute(rawSheetRef.current, next, hasHeader, preview);
  };

  const toggleHeader = (v: boolean) => {
    setHasHeader(v);
    if (preview) recompute(rawSheetRef.current, mapping, v, preview);
  };

  const mappedCount = mapping.filter((m) => m !== 'ignore').length;
  const hasDescription = mapping.includes('description');
  const canImport = !!preview && preview.rows.length > 0 && hasDescription;

  const sel: React.CSSProperties = {
    width: '100%', background: SUNK, border: `1px solid ${BORDER}`, borderRadius: 5,
    color: TEXT, fontSize: 10.5, padding: '3px 5px', outline: 'none',
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Import estimate lines"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(4,7,12,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 56 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(1040px, 94vw)', maxHeight: '84vh', overflow: 'auto', background: '#121820', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Table size={16} weight="duotone" color={GOLD} />
          <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>Import from Excel or CSV</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'flex' }}>
            <X size={15} weight="bold" />
          </button>
        </div>

        {/* ── file ─────────────────────────────────────────────── */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void onFile(f); }}
          style={{
            border: `2px dashed ${preview ? BORDER : GOLD}`, borderRadius: 10,
            padding: preview ? '10px 14px' : '26px 14px', textAlign: 'center',
            background: preview ? 'transparent' : 'rgba(245,158,11,0.06)', marginBottom: 12,
          }}
        >
          <input ref={inputRef} type="file" accept={ACCEPT} hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
          {!preview ? (
            <>
              <UploadSimple size={26} weight="bold" color={GOLD} />
              <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginTop: 8 }}>Drop a workbook here</div>
              <div style={{ fontSize: 11.5, color: DIM, marginTop: 3 }}>.xlsx, .xls or .csv — up to 8MB</div>
              <button type="button" onClick={() => inputRef.current?.click()} style={{ marginTop: 10, background: GOLD, border: 'none', borderRadius: 7, color: '#1a1206', fontSize: 12, fontWeight: 800, padding: '7px 14px', cursor: 'pointer' }}>
                Choose a file
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
              <CheckCircle size={14} weight="fill" color={GREEN} />
              <span style={{ color: TEXT, fontWeight: 700 }}>{fileName}</span>
              {sheetNames.length > 1 && (
                <select
                  value={activeSheet ?? ''}
                  onChange={(e) => { if (workbook) void readSheet(workbook, e.target.value); }}
                  style={{ ...sel, width: 'auto', fontSize: 11.5, padding: '4px 6px' }}
                >
                  {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: DIM, cursor: 'pointer' }}>
                <input type="checkbox" checked={hasHeader} onChange={(e) => toggleHeader(e.target.checked)} style={{ accentColor: GOLD }} />
                First row is a header
              </label>
              <button type="button" onClick={() => inputRef.current?.click()} style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 11, fontWeight: 700, padding: '4px 9px', cursor: 'pointer' }}>
                Different file
              </button>
            </div>
          )}
        </div>

        {busy && <div style={{ color: DIM, fontSize: 12.5, padding: 12, textAlign: 'center' }}>Reading the workbook…</div>}

        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(224,100,78,0.10)', border: `1px solid rgba(224,100,78,0.4)`, borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <WarningCircle size={15} weight="fill" color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: '#FCA5A5' }}>{error}</span>
          </div>
        )}

        {/* ── mapping + preview ────────────────────────────────── */}
        {preview && preview.headers.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: DIM, marginBottom: 7, lineHeight: 1.6 }}>
              {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'} ready
              {preview.emptyRows > 0 && ` · ${preview.emptyRows} blank row${preview.emptyRows === 1 ? '' : 's'} skipped`}
              {' · '}{mappedCount} column{mappedCount === 1 ? '' : 's'} mapped.
              {' '}Columns are guessed from their headings — change any that landed wrong.
            </div>

            <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i} style={{ padding: '7px 6px', borderBottom: `1px solid ${BORDER}`, minWidth: 132, textAlign: 'left', background: '#141a22', position: 'sticky', top: 0 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: mapping[i] === 'ignore' ? DIM : TEXT, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {h}
                        </div>
                        <select value={mapping[i] ?? 'ignore'} onChange={(e) => setCol(i, e.target.value as ImportField)} style={{ ...sel, color: mapping[i] === 'ignore' ? DIM : GOLD }}>
                          {FIELD_OPTIONS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.raw.slice(hasHeader ? 1 : 0, hasHeader ? 9 : 8).map((line, r) => (
                    <tr key={r} style={{ borderBottom: `1px solid ${HAIR}` }}>
                      {preview.headers.map((_, c) => (
                        <td key={c} style={{
                          padding: '5px 6px', fontSize: 11.5,
                          color: mapping[c] === 'ignore' ? 'rgba(203,213,225,0.35)' : TEXT,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190,
                        }}>
                          {line[c] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!hasDescription && (
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 10, fontSize: 11.5, color: '#FCA5A5' }}>
                <WarningCircle size={14} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Map one column to <b>Description</b> before importing — a line with no description cannot be read on a bid.</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: DIM }}>
                Rows arrive unsaved — review them in the grid, then Save.
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={onClose} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 12, fontWeight: 700, padding: '7px 12px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                type="button" disabled={!canImport}
                onClick={() => { onImport(preview.rows); onClose(); }}
                style={{
                  background: canImport ? GOLD : 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 7,
                  color: canImport ? '#1a1206' : DIM, fontSize: 12, fontWeight: 800,
                  padding: '7px 16px', cursor: canImport ? 'pointer' : 'default',
                }}
              >
                Import {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
