/** CSV for a chart tile's data — client-safe, no dependencies. */
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};

/** A CSV file: header row then data rows. Quotes commas/quotes/newlines; defuses spreadsheet formulas. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
