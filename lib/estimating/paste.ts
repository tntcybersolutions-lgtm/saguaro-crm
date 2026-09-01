/**
 * paste — read a block of spreadsheet cells into takeoff lines.
 *
 * Every estimator lives in Excel, and the takeoff grid was a dead end for that
 * work: you could type lines one at a time or not at all. Excel, Sheets and
 * Numbers all put tab-separated rows on the clipboard, so a paste can be read
 * straight into lines.
 *
 * Deliberately tolerant, because an estimator's clipboard is never as clean as
 * a schema:
 *   - a row with only a description still lands, at quantity 1
 *   - "$1,250.00", "1 250,00" and "1250" all read as 1250
 *   - a header row (qty / unit / cost as words) is skipped
 *   - blank rows are skipped
 *   - extra columns past the fourth are ignored
 *
 * Column order matches what the grid shows: description, qty, unit, unit cost.
 */

export interface PastedLine {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

/** "$1,250.00" -> 1250. Anything unparseable -> 0. */
function money(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** A row whose numeric columns are words is a header, not data. */
function looksLikeHeader(cells: string[]): boolean {
  const second = (cells[1] || '').trim().toLowerCase();
  const fourth = (cells[3] || '').trim().toLowerCase();
  const headerish = ['qty', 'quantity', 'count', 'amount', 'cost', 'rate', 'price', 'unit cost', 'ea'];
  const nonNumeric = (v: string) => v !== '' && !Number.isFinite(Number(v.replace(/[^0-9.-]/g, ''))) ;
  return headerish.includes(second) || headerish.includes(fourth) || (nonNumeric(second) && nonNumeric(fourth));
}

/**
 * @param text raw clipboard text
 * @returns one entry per usable row, in clipboard order
 */
export function parsePastedLines(text: string): PastedLine[] {
  if (!text || !text.trim()) return [];

  const rows = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.split('\t'))
    .filter((cells) => cells.some((c) => c.trim() !== ''));

  const out: PastedLine[] = [];
  rows.forEach((cells, i) => {
    if (i === 0 && rows.length > 1 && looksLikeHeader(cells)) return;
    const description = (cells[0] || '').trim();
    if (!description) return;
    out.push({
      description,
      quantity: money(cells[1]) || 1,
      unit: (cells[2] || '').trim() || 'EA',
      unitCost: money(cells[3]),
    });
  });
  return out;
}

/** True when the clipboard holds a grid rather than a single value — a plain
 *  paste into a cell being edited must keep behaving normally. */
export function looksLikeGrid(text: string): boolean {
  return text.includes('\t') || /\r\n|\r|\n/.test(text.trim());
}
