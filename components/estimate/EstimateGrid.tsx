'use client';

/**
 * EstimateGrid — spreadsheet-speed editing for takeoff line items.
 *
 * The estimate page was 367 lines with no input elements: you could look at an
 * estimate and not touch it. Estimators live in Excel because Excel lets them
 * type, tab, and paste a hundred rows at once, and any tool that makes them
 * click into a modal per line loses to the spreadsheet they already have.
 *
 * So every cell is a real input, focus moves with the arrow keys, and a paste
 * lands where the cursor is. What it adds over the spreadsheet is the part a
 * spreadsheet cannot do: four cost buckets that total themselves, a waste factor
 * that adjusts quantity, exclusions that show but do not charge, and a catalog
 * lookup that knows which vendor can actually deliver before the pour.
 *
 * Arithmetic and clipboard parsing live in lib/estimate-grid.ts so they can be
 * tested without a browser; this file is the surface.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash, CopySimple, FloppyDisk, CaretDown, CaretRight, MagnifyingGlass,
  WarningCircle, X, Package, Truck, ArrowCounterClockwise, UploadSimple,
} from '@phosphor-icons/react';
import {
  parseClipboard, clipboardToRows, lineTotals, groupRows, estimateTotals,
  divisionOf, CSI_DIVISIONS, PASTE_COLUMNS, parseNumber,
  type GridRow,
} from '@/lib/estimate-grid';
import ImportDialog from '@/components/estimate/ImportDialog';

const GOLD = '#F59E0B', DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C';
const BORDER = 'rgba(255,255,255,0.12)';
const HAIR = 'rgba(255,255,255,0.06)';
const SUNK = 'rgba(0,0,0,0.26)';
const RAISED = 'rgba(255,255,255,0.04)';

/** A row as the grid holds it: server fields plus a stable local key. */
interface Row extends GridRow {
  _key: string;
  _new?: boolean;
}

type ColKind = 'text' | 'number' | 'money';

interface Column {
  key: keyof GridRow;
  label: string;
  kind: ColKind;
  width: number;
  align?: 'right';
  /** Position in the paste order, so a paste starting here maps correctly. */
  pasteIndex?: number;
  title?: string;
}

/* Column order matches PASTE_COLUMNS so a paste landing on any cell lines up
   with what the user sees, which is the whole contract of pasting into a grid. */
const COLUMNS: Column[] = [
  { key: 'csi_code', label: 'Code', kind: 'text', width: 88, pasteIndex: 0 },
  { key: 'description', label: 'Description', kind: 'text', width: 300, pasteIndex: 1 },
  { key: 'quantity', label: 'Qty', kind: 'number', width: 84, align: 'right', pasteIndex: 2 },
  { key: 'unit', label: 'Unit', kind: 'text', width: 64, pasteIndex: 3 },
  { key: 'waste_factor_pct', label: 'Waste %', kind: 'number', width: 74, align: 'right', title: 'Waste factor — adjusts the quantity everything prices off' },
  { key: 'unit_material_cost', label: 'Material', kind: 'money', width: 92, align: 'right', pasteIndex: 4 },
  { key: 'unit_labor_cost', label: 'Labor', kind: 'money', width: 92, align: 'right', pasteIndex: 5 },
  { key: 'unit_equipment_cost', label: 'Equip', kind: 'money', width: 92, align: 'right', pasteIndex: 6 },
  { key: 'unit_sub_cost', label: 'Sub', kind: 'money', width: 92, align: 'right', pasteIndex: 7 },
];

const money = (n: number): string =>
  '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShort = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${n < 0 ? '-' : ''}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${n < 0 ? '-' : ''}$${(a / 1_000).toFixed(1)}K`;
  return money(n);
};

let keySeq = 0;
const newKey = () => `new-${Date.now()}-${keySeq++}`;

/** Mirrors /api/catalog exactly — it returns camelCase, not column names. */
interface CatalogPrice {
  vendor: string;
  vendorKind?: string | null;
  price: number;
  unit?: string | null;
  stockStatus?: string | null;
  qtyInStock?: number | null;
  leadTimeDays?: number | null;
  /** True only when a real vendor feed supplied this, not seeded reference data. */
  liveStock?: boolean;
  bestPrice?: boolean;
}
interface CatalogItem {
  id: string; name: string; category?: string | null; unit?: string | null;
  description?: string | null;
  prices?: CatalogPrice[];
}

export default function EstimateGrid({
  takeoffId, onSaved, targetDate,
}: {
  takeoffId: string;
  onSaved?: (count: number) => void;
  /** Schedule date this scope must land by — drives the lead-time warning. */
  targetDate?: string | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [serverRows, setServerRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<{ r: number; c: number }>({ r: 0, c: 1 });
  const [picker, setPicker] = useState<{ rowKey: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const cellRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const gridRef = useRef<HTMLDivElement | null>(null);

  /* ── load ─────────────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/takeoff/${takeoffId}/line-items`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not load the estimate');
      const mapped: Row[] = (json.lineItems || []).map((r: Record<string, unknown>) => ({
        ...(r as GridRow), _key: String(r.id),
      }));
      setRows(mapped);
      setServerRows(mapped);
      setDeleted(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the estimate');
    } finally {
      setLoading(false);
    }
  }, [takeoffId]);

  useEffect(() => { void load(); }, [load]);

  /* ── ordering: rows render grouped, but edits address the flat list ─────
     The visible order IS the edit order, or arrow-down would jump somewhere
     other than the cell below the cursor. */

  const ordered = useMemo(() => {
    const byDiv = new Map<string, Row[]>();
    for (const r of rows) {
      const d = divisionOf(r);
      const a = byDiv.get(d) ?? []; a.push(r); byDiv.set(d, a);
    }
    const divisions = [...byDiv.keys()].sort((a, b) => a.localeCompare(b));
    const flat: { row: Row; division: string }[] = [];
    for (const d of divisions) {
      if (collapsed.has(d)) continue;
      for (const r of byDiv.get(d)!) flat.push({ row: r, division: d });
    }
    return { divisions, byDiv, flat };
  }, [rows, collapsed]);

  const groups = useMemo(() => groupRows(rows), [rows]);
  const totals = useMemo(() => estimateTotals(rows), [rows]);

  const dirty = useMemo(() => {
    if (deleted.size > 0) return true;
    if (rows.some((r) => r._new)) return true;
    const byId = new Map(serverRows.map((r) => [r._key, r]));
    return rows.some((r) => {
      const s = byId.get(r._key);
      if (!s) return true;
      return COLUMNS.some((c) => (r[c.key] ?? null) !== (s[c.key] ?? null))
        || !!r.is_allowance !== !!s.is_allowance
        || !!r.is_excluded !== !!s.is_excluded;
    });
  }, [rows, serverRows, deleted]);

  /* ── editing ──────────────────────────────────────────────────────────── */

  const setCell = useCallback((key: string, col: keyof GridRow, raw: string, kind: ColKind) => {
    setRows((prev) => prev.map((r) => {
      if (r._key !== key) return r;
      const value = kind === 'text' ? raw : parseNumber(raw);
      return { ...r, [col]: value, manually_edited: true };
    }));
  }, []);

  const addRow = useCallback((afterKey?: string, seed?: Partial<GridRow>) => {
    setRows((prev) => {
      const row: Row = {
        _key: newKey(), _new: true, description: '', quantity: null, unit: '',
        sort_order: prev.length, ...seed,
      };
      if (!afterKey) return [...prev, row];
      const i = prev.findIndex((r) => r._key === afterKey);
      if (i < 0) return [...prev, row];
      return [...prev.slice(0, i + 1), row, ...prev.slice(i + 1)];
    });
  }, []);

  const duplicateRow = useCallback((key: string) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r._key === key);
      if (i < 0) return prev;
      const { id: _ignored, ...rest } = prev[i];
      void _ignored;
      const copy: Row = { ...(rest as Row), _key: newKey(), _new: true, id: null };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => {
      const r = prev.find((x) => x._key === key);
      if (r?.id) setDeleted((d) => new Set(d).add(String(r.id)));
      return prev.filter((x) => x._key !== key);
    });
  }, []);

  /* ── keyboard: the reason this feels like a spreadsheet ───────────────── */

  const focusCell = useCallback((r: number, c: number) => {
    const max = ordered.flat.length - 1;
    const rr = Math.max(0, Math.min(max, r));
    const cc = Math.max(0, Math.min(COLUMNS.length - 1, c));
    setCursor({ r: rr, c: cc });
    const el = cellRefs.current.get(`${rr}:${cc}`);
    if (el) { el.focus(); el.select(); }
  }, [ordered.flat.length]);

  const onCellKeyDown = useCallback((e: React.KeyboardEvent, r: number, c: number, rowKey: string) => {
    const target = e.target as HTMLInputElement;
    const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
    const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;

    if (e.key === 'ArrowDown') { e.preventDefault(); focusCell(r + 1, c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(r - 1, c); }
    /* Left/right only move cells from the edge of the text, so arrowing within
       a description behaves the way typing anywhere else does. */
    else if (e.key === 'ArrowLeft' && atStart) { e.preventDefault(); focusCell(r, c - 1); }
    else if (e.key === 'ArrowRight' && atEnd) { e.preventDefault(); focusCell(r, c + 1); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) { if (c === 0) focusCell(r - 1, COLUMNS.length - 1); else focusCell(r, c - 1); }
      else if (c === COLUMNS.length - 1) focusCell(r + 1, 0);
      else focusCell(r, c + 1);
    }
    else if (e.key === 'Enter') {
      e.preventDefault();
      /* Enter on the last row adds one, so a list can be typed without
         reaching for the mouse. */
      if (r === ordered.flat.length - 1) { addRow(rowKey); setTimeout(() => focusCell(r + 1, 1), 0); }
      else focusCell(r + 1, c);
    }
    else if (e.key === 'Escape') { e.preventDefault(); target.blur(); }
  }, [focusCell, ordered.flat.length, addRow]);

  /* ── paste ────────────────────────────────────────────────────────────── */

  const onPaste = useCallback((e: React.ClipboardEvent, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // a single value: let the input handle it
    e.preventDefault();

    const col = COLUMNS[c];
    const startCol = col.pasteIndex ?? 0;
    const cells = parseClipboard(text);
    const { rows: parsed, skippedHeader } = clipboardToRows(cells, startCol);
    if (parsed.length === 0) return;

    setRows((prev) => {
      const next = [...prev];
      /* Map the visible cursor back to the flat array. */
      const anchorKey = ordered.flat[r]?.row._key;
      let idx = anchorKey ? next.findIndex((x) => x._key === anchorKey) : next.length;
      if (idx < 0) idx = next.length;

      parsed.forEach((p, i) => {
        const at = idx + i;
        if (at < next.length) {
          /* Overwrite in place, the way a spreadsheet paste does — but only the
             columns the paste actually carried. */
          next[at] = { ...next[at], ...p, manually_edited: true };
        } else {
          next.push({ _key: newKey(), _new: true, description: '', sort_order: at, ...p } as Row);
        }
      });
      return next;
    });

    setMsg(`Pasted ${parsed.length} row${parsed.length === 1 ? '' : 's'}${skippedHeader ? ' (header row skipped)' : ''}`);
  }, [ordered.flat]);

  /* ── save ─────────────────────────────────────────────────────────────── */

  const save = useCallback(async () => {
    setSaving(true); setMsg(null);
    try {
      const payload = {
        rows: rows.map((r, i) => {
          const out: Record<string, unknown> = { sort_order: i };
          if (r.id) out.id = r.id;
          for (const c of COLUMNS) out[c.key] = r[c.key] ?? null;
          out.description = String(r.description ?? '').trim() || 'Untitled line';
          out.is_allowance = !!r.is_allowance;
          out.is_excluded = !!r.is_excluded;
          out.csi_division = r.csi_division ?? divisionOf(r);
          return out;
        }),
        deleteIds: [...deleted],
      };
      const res = await fetch(`/api/takeoff/${takeoffId}/line-items`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Save failed');

      const mapped: Row[] = (json.lineItems || []).map((x: Record<string, unknown>) => ({ ...(x as GridRow), _key: String(x.id) }));
      setRows(mapped); setServerRows(mapped); setDeleted(new Set());
      setMsg(`Saved — ${json.inserted} added, ${json.updated} updated, ${json.deleted} removed`);
      onSaved?.(mapped.length);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [rows, deleted, takeoffId, onSaved]);

  const revert = useCallback(() => {
    setRows(serverRows); setDeleted(new Set()); setMsg('Reverted to the last save');
  }, [serverRows]);

  /* Ctrl/Cmd+S saves without leaving the keyboard. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  /* ── styles ───────────────────────────────────────────────────────────── */

  const cellStyle = (col: Column, focused: boolean, muted: boolean): React.CSSProperties => ({
    width: '100%', background: focused ? 'rgba(245,158,11,0.12)' : 'transparent',
    border: 'none', outline: focused ? `1px solid ${GOLD}` : '1px solid transparent',
    borderRadius: 3, color: muted ? DIM : TEXT, fontSize: 12,
    padding: '5px 6px', textAlign: col.align ?? 'left',
    fontVariantNumeric: col.kind === 'text' ? 'normal' : 'tabular-nums',
    textDecoration: muted ? 'line-through' : 'none',
  });

  const th: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, color: DIM, letterSpacing: 0.4,
    textTransform: 'uppercase', padding: '8px 6px', textAlign: 'left',
    borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', position: 'sticky', top: 0,
    background: '#141a22', zIndex: 2,
  };

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: DIM, fontSize: 12.5 }}>Loading the estimate…</div>;

  if (error) {
    return (
      <div style={{ padding: 26, textAlign: 'center' }}>
        <WarningCircle size={18} weight="fill" color={RED} />
        <div style={{ color: RED, fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>{error}</div>
        <button type="button" onClick={() => void load()} style={{ marginTop: 10, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: GOLD, fontSize: 11.5, fontWeight: 700, padding: '5px 12px', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  let flatIndex = -1;

  return (
    <div ref={gridRef}>
      {/* ── toolbar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 10px', borderBottom: `1px solid ${BORDER}`, background: RAISED, borderRadius: '10px 10px 0 0' }}>
        <button type="button" onClick={() => addRow()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 11.5, fontWeight: 700, padding: '5px 10px', cursor: 'pointer' }}>
          <Plus size={12} weight="bold" /> Add line
        </button>

        <button type="button" onClick={() => setImporting(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 11.5, fontWeight: 700, padding: '5px 10px', cursor: 'pointer' }}>
          <UploadSimple size={12} weight="bold" /> Import
        </button>

        <span style={{ fontSize: 11, color: DIM }}>
          {totals.lines} line{totals.lines === 1 ? '' : 's'}
          {totals.allowances > 0 && ` · ${totals.allowances} allowance${totals.allowances === 1 ? '' : 's'}`}
          {totals.exclusions > 0 && ` · ${totals.exclusions} excluded`}
        </span>

        <span style={{ flex: 1 }} />

        {msg && <span style={{ fontSize: 11, color: DIM }}>{msg}</span>}

        {dirty && (
          <button type="button" onClick={revert} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 11.5, fontWeight: 700, padding: '5px 10px', cursor: 'pointer' }}>
            <ArrowCounterClockwise size={12} weight="bold" /> Revert
          </button>
        )}
        <button
          type="button" onClick={() => void save()} disabled={!dirty || saving}
          title="Ctrl+S"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: dirty ? GOLD : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 6, color: dirty ? '#1a1206' : DIM,
            fontSize: 11.5, fontWeight: 800, padding: '6px 12px',
            cursor: dirty && !saving ? 'pointer' : 'default',
          }}
        >
          <FloppyDisk size={12} weight="bold" /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      {/* ── grid ────────────────────────────────────────────────── */}
      <div style={{ maxHeight: 560, overflow: 'auto', background: SUNK }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 26 }} />
              {COLUMNS.map((c) => (
                <th key={String(c.key)} style={{ ...th, width: c.width, textAlign: c.align ?? 'left' }} title={c.title}>{c.label}</th>
              ))}
              <th style={{ ...th, width: 96, textAlign: 'right' }}>Line total</th>
              <th style={{ ...th, width: 74 }} />
            </tr>
          </thead>
          <tbody>
            {ordered.divisions.map((d) => {
              const g = groups.find((x) => x.division === d);
              const isCollapsed = collapsed.has(d);
              return (
                <React.Fragment key={d}>
                  <tr>
                    <td colSpan={COLUMNS.length + 3} style={{ padding: 0 }}>
                      <button
                        type="button"
                        onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; })}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                          background: 'rgba(245,158,11,0.07)', border: 'none',
                          borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${HAIR}`,
                          padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        {isCollapsed ? <CaretRight size={11} weight="bold" color={DIM} /> : <CaretDown size={11} weight="bold" color={DIM} />}
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: GOLD }}>
                          {CSI_DIVISIONS[d] ? `${d} · ${CSI_DIVISIONS[d]}` : d}
                        </span>
                        <span style={{ fontSize: 10.5, color: DIM }}>
                          {g?.rows ?? 0} line{(g?.rows ?? 0) === 1 ? '' : 's'}
                          {(g?.exclusions ?? 0) > 0 && ` · ${g!.exclusions} excluded`}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
                          {money(g?.total ?? 0)}
                        </span>
                      </button>
                    </td>
                  </tr>

                  {!isCollapsed && ordered.byDiv.get(d)!.map((row) => {
                    flatIndex++;
                    const r = flatIndex;
                    const t = lineTotals(row);
                    const muted = !!row.is_excluded;
                    return (
                      <tr key={row._key} style={{ borderBottom: `1px solid ${HAIR}` }}>
                        <td style={{ padding: '0 2px 0 6px', color: DIM, fontSize: 9.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {r + 1}
                        </td>

                        {COLUMNS.map((col, c) => {
                          const focused = cursor.r === r && cursor.c === c;
                          const v = row[col.key];
                          return (
                            <td key={String(col.key)} style={{ padding: '1px 2px' }}>
                              <input
                                ref={(el) => { if (el) cellRefs.current.set(`${r}:${c}`, el); else cellRefs.current.delete(`${r}:${c}`); }}
                                value={v == null ? '' : String(v)}
                                onChange={(e) => setCell(row._key, col.key, e.target.value, col.kind)}
                                onFocus={() => setCursor({ r, c })}
                                onKeyDown={(e) => onCellKeyDown(e, r, c, row._key)}
                                onPaste={(e) => onPaste(e, r, c)}
                                inputMode={col.kind === 'text' ? 'text' : 'decimal'}
                                aria-label={`${col.label} row ${r + 1}`}
                                style={cellStyle(col, focused, muted)}
                              />
                            </td>
                          );
                        })}

                        <td style={{ padding: '4px 6px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: muted ? DIM : TEXT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {money(t.total)}
                          {row.waste_factor_pct ? <span style={{ display: 'block', fontSize: 9, color: DIM, fontWeight: 600 }}>{t.adjustedQuantity} adj</span> : null}
                        </td>

                        <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                            <button type="button" title="Look up in the catalog" onClick={() => setPicker({ rowKey: row._key })} style={iconBtn}>
                              <MagnifyingGlass size={11} weight="bold" />
                            </button>
                            <button type="button" title={row.is_allowance ? 'Allowance' : 'Mark as allowance'} onClick={() => setRows((p) => p.map((x) => x._key === row._key ? { ...x, is_allowance: !x.is_allowance } : x))}
                              style={{ ...iconBtn, color: row.is_allowance ? AMBER : DIM, borderColor: row.is_allowance ? AMBER : BORDER }}>A</button>
                            <button type="button" title={row.is_excluded ? 'Excluded — not in the total' : 'Exclude from the total'} onClick={() => setRows((p) => p.map((x) => x._key === row._key ? { ...x, is_excluded: !x.is_excluded } : x))}
                              style={{ ...iconBtn, color: row.is_excluded ? RED : DIM, borderColor: row.is_excluded ? RED : BORDER }}>X</button>
                            <button type="button" title="Duplicate" onClick={() => duplicateRow(row._key)} style={iconBtn}><CopySimple size={11} weight="bold" /></button>
                            <button type="button" title="Delete" onClick={() => removeRow(row._key)} style={{ ...iconBtn, color: '#FCA5A5' }}><Trash size={11} weight="bold" /></button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 3} style={{ padding: 34, textAlign: 'center', color: DIM, fontSize: 12.5, lineHeight: 1.7 }}>
                No lines yet. <b style={{ color: TEXT }}>Add line</b> to start typing, or paste straight from Excel —
                code, description, quantity, unit, then the four cost columns.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── totals ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', borderTop: `1px solid ${BORDER}`, background: RAISED, borderRadius: '0 0 10px 10px' }}>
        {([['Material', totals.material], ['Labor', totals.labor], ['Equipment', totals.equipment], ['Subcontract', totals.sub]] as [string, number][]).map(([l, v]) => (
          <span key={l} style={{ fontSize: 11, color: DIM }}>
            {l} <b style={{ color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{moneyShort(v)}</b>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: DIM }}>
          arrows move · tab next · enter down · paste from Excel · ⌘/Ctrl+S saves
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
          {money(totals.total)}
        </span>
      </div>

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImport={(incoming) => {
            /* Imported rows land unsaved at the end so they can be reviewed,
               re-coded or abandoned before anything reaches the database. */
            setRows((prev) => [
              ...prev,
              ...incoming.map((p, i) => ({ _key: newKey(), _new: true, description: '', sort_order: prev.length + i, ...p } as Row)),
            ]);
            setMsg(`Imported ${incoming.length} row${incoming.length === 1 ? '' : 's'} — review, then Save`);
          }}
        />
      )}

      {picker && (
        <CatalogPicker
          targetDate={targetDate}
          onClose={() => setPicker(null)}
          onPick={(item, price) => {
            setRows((p) => p.map((x) => x._key === picker.rowKey ? {
              ...x,
              description: item.name,
              unit: price?.unit || item.unit || x.unit || '',
              unit_material_cost: price?.price ?? x.unit_material_cost ?? null,
              cost_key: item.id,
              manually_edited: true,
            } : x));
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 20, height: 20, borderRadius: 4, background: 'none',
  border: `1px solid ${BORDER}`, color: DIM, cursor: 'pointer',
  fontSize: 9.5, fontWeight: 800, padding: 0,
};

/**
 * Catalog lookup.
 *
 * The reason this exists rather than a plain price field: catalog_vendor_prices
 * holds a price PER VENDOR with stock status and lead-time days. A flat price
 * book — which is what Buildern's catalog is — can tell you what an item costs.
 * This can tell you that the cheapest vendor cannot get it to site before the
 * date this scope is needed, which is the thing that actually costs a job money.
 */
function CatalogPicker({
  onPick, onClose, targetDate,
}: {
  onPick: (item: CatalogItem, price?: CatalogPrice) => void;
  onClose: () => void;
  targetDate?: string | null;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [liveFeed, setLiveFeed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const daysUntilTarget = useMemo(() => {
    if (!targetDate) return null;
    const t = Date.parse(String(targetDate));
    if (!Number.isFinite(t)) return null;
    return Math.round((t - Date.now()) / 86400000);
  }, [targetDate]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (q.trim().length < 2) { setItems([]); return; }
      setLoading(true); setErr(null);
      try {
        const res = await fetch(`/api/catalog?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error || 'Catalog search failed');
        setItems((json.items || []).slice(0, 40));
        setLiveFeed(!!json.hasLiveStockFeed);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Catalog search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Catalog lookup"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(4,7,12,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 92vw)', maxHeight: '70vh', overflow: 'auto', background: '#121820', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Package size={15} weight="duotone" color={GOLD} />
          <span style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>Catalog</span>
          {daysUntilTarget != null && (
            <span style={{ fontSize: 10.5, color: DIM }}>needed in {daysUntilTarget} day{daysUntilTarget === 1 ? '' : 's'}</span>
          )}
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'flex' }}><X size={14} weight="bold" /></button>
        </div>

        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search materials, fixtures, assemblies…"
          style={{ width: '100%', background: SUNK, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, padding: '8px 10px', outline: 'none', marginBottom: 10 }}
        />

        {loading && <div style={{ color: DIM, fontSize: 12, padding: 10 }}>Searching…</div>}
        {err && <div style={{ color: RED, fontSize: 12, padding: 10 }}>{err}</div>}
        {!loading && !err && q.trim().length >= 2 && items.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 10 }}>Nothing matched “{q}”.</div>
        )}

        {!liveFeed && items.length > 0 && (
          <div style={{ fontSize: 10, color: DIM, padding: '4px 2px 8px', lineHeight: 1.5 }}>
            Lead times are the vendor&rsquo;s published figures. No live inventory feed is connected,
            so stock is not shown — the dates are guidance, not a reservation.
          </div>
        )}

        {items.map((it) => {
          const prices = [...(it.prices || [])].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
          return (
            <div key={it.id} style={{ borderTop: `1px solid ${HAIR}`, padding: '8px 2px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT }}>{it.name}</div>
              {it.category && <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>{it.category}</div>}

              {prices.length === 0 && (
                <button type="button" onClick={() => onPick(it)} style={{ ...iconBtn, width: 'auto', height: 'auto', padding: '4px 9px', marginTop: 5, color: GOLD }}>
                  Use item (no vendor price on file)
                </button>
              )}

              {prices.map((p, i) => {
                const late = daysUntilTarget != null && p.leadTimeDays != null && p.leadTimeDays > daysUntilTarget;
                /* Stock only reads as stock when a real feed said so. The API is
                   explicit that seeded 'reference' rows are not inventory, and
                   showing them as availability would be inventing a fact. */
                const out = !!p.liveStock && String(p.stockStatus ?? '').toLowerCase().includes('out');
                return (
                  <button
                    key={i} type="button" onClick={() => onPick(it, p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      background: p.bestPrice ? 'rgba(69,179,125,0.08)' : 'transparent',
                      border: `1px solid ${late || out ? 'rgba(224,100,78,0.4)' : BORDER}`,
                      borderRadius: 6, padding: '5px 8px', marginTop: 4, cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: p.bestPrice ? GREEN : TEXT, minWidth: 74, fontVariantNumeric: 'tabular-nums' }}>
                      {money(Number(p.price) || 0)}{p.unit ? <span style={{ color: DIM, fontWeight: 600 }}>/{p.unit}</span> : null}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.vendor || 'Vendor'}
                    </span>
                    {p.liveStock && p.stockStatus && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: out ? RED : GREEN }}>{p.stockStatus}</span>
                    )}
                    {p.leadTimeDays != null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: late ? RED : DIM, whiteSpace: 'nowrap' }}>
                        <Truck size={11} weight="bold" />
                        {p.leadTimeDays}d
                        {late && ` — misses by ${p.leadTimeDays - (daysUntilTarget ?? 0)}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
