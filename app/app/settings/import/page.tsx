'use client';
/**
 * Settings → Import From Another App. A builder switching from Buildertrend,
 * JobTread, CoConstruct or a spreadsheet uploads that app's CSV / Excel export
 * of jobs, customers or leads. Columns are matched by the names those apps use
 * (lib/import/switch-over), the first rows are previewed, and each row is sent
 * through the SAME create route the app's own screens use — so an imported job
 * gets its folders, directory and activity like one made by hand. Rows already
 * in Saguaro (same job name / email) are skipped, never doubled.
 *
 * The file is read in the browser; only the mapped rows reach the server.
 */
import React, { useMemo, useState } from 'react';
import { UploadSimple, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { PageShell, Card, Badge, Button } from '@/components/ui/kit';
import { humanError } from '@/lib/errors';
import {
  IMPORT_FIELDS, IMPORT_ENDPOINT, IMPORT_MAX_ROWS, autoMap, dedupeKey, parseCsv, rowToBody, type ImportKind,
} from '@/lib/import/switch-over';

const KINDS: { key: ImportKind; label: string; hint: string }[] = [
  { key: 'jobs', label: 'Jobs', hint: 'Buildertrend: Jobs list → Export. JobTread: Jobs → Export. CoConstruct: Projects → Export.' },
  { key: 'customers', label: 'Customers', hint: 'Buildertrend: Customer Contacts → Export. JobTread: Customers → Export.' },
  { key: 'leads', label: 'Leads', hint: 'Buildertrend: Lead Opportunities → Export. JobTread: Leads → Export.' },
];

const LIST_URL: Record<ImportKind, { url: string; key: string }> = {
  jobs: { url: '/api/projects?limit=1000', key: 'projects' },
  customers: { url: '/api/customers/profiles?limit=5000', key: 'customers' },
  leads: { url: '/api/leads', key: 'leads' },
};

type Result = { created: number; skipped: number; failed: { row: number; why: string }[] };

const selectStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '0 10px', borderRadius: 10, fontSize: 16,
  background: 'var(--bg-solid)', color: 'var(--text-primary)', border: '1px solid var(--border-strong, var(--border))',
};

async function readFile(file: File): Promise<string[][]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    return rows.map((r) => r.map((v) => String(v ?? ''))).filter((r) => r.some((v) => v.trim() !== ''));
  }
  return parseCsv(await file.text());
}

export default function ImportPage() {
  const [kind, setKind] = useState<ImportKind>('jobs');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [readErr, setReadErr] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const headers = table[0] || [];
  const dataRows = useMemo(() => table.slice(1), [table]);
  const fields = IMPORT_FIELDS[kind];
  const missingRequired = fields.filter((f) => f.required && !(map[f.key] >= 0));
  const bodies = useMemo(
    () => dataRows.map((r) => rowToBody(kind, r, map)),
    [dataRows, kind, map],
  );
  const ready = bodies.filter(Boolean).length;

  const choose = async (file: File | undefined, k = kind) => {
    if (!file) return;
    setReadErr(''); setResult(null); setDone(0);
    try {
      const rows = await readFile(file);
      if (rows.length < 2) { setReadErr('That file has no rows under its header line.'); setTable([]); return; }
      if (rows.length - 1 > IMPORT_MAX_ROWS) { setReadErr(`That file has ${rows.length - 1} rows — import up to ${IMPORT_MAX_ROWS} at a time (split the file).`); setTable([]); return; }
      setFileName(file.name); setTable(rows); setMap(autoMap(rows[0], k));
    } catch (e) {
      setReadErr(humanError(e, "Couldn't read that file. Save it as CSV and try again."));
      setTable([]);
    }
  };

  const switchKind = (k: ImportKind) => {
    setKind(k); setResult(null); setDone(0);
    if (table.length) setMap(autoMap(table[0], k));
  };

  const run = async () => {
    setRunning(true); setResult(null); setDone(0);
    const out: Result = { created: 0, skipped: 0, failed: [] };
    try {
      const list = LIST_URL[kind];
      const res = await fetch(list.url, { cache: 'no-store' });
      const existing = new Set<string>(((await res.json().catch(() => ({})))[list.key] || []).map((x: Record<string, unknown>) => dedupeKey(kind, x)));
      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        setDone(i + 1);
        if (!body) { out.failed.push({ row: i + 2, why: `No ${fields.find((f) => f.required)?.label.toLowerCase()}` }); continue; }
        const key = dedupeKey(kind, body);
        if (key && existing.has(key)) { out.skipped++; continue; }
        try {
          const r = await fetch(IMPORT_ENDPOINT[kind], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (r.ok) { out.created++; if (key) existing.add(key); }
          else out.failed.push({ row: i + 2, why: (await r.json().catch(() => ({}))).error || `Refused (${r.status})` });
        } catch {
          out.failed.push({ row: i + 2, why: 'No connection — this row was not sent' });
        }
      }
    } catch (e) {
      out.failed.push({ row: 0, why: humanError(e, "Couldn't check what's already in Saguaro, so nothing was imported.") });
    }
    setResult(out); setRunning(false);
  };

  const active = KINDS.find((k) => k.key === kind)!;

  return (
    <PageShell
      crumbs={[{ label: 'Settings', href: '/app/settings' }, { label: 'Import From Another App' }]}
      title="Import From Another App"
      subtitle="Bring your jobs, customers and leads over from Buildertrend, JobTread, CoConstruct or a spreadsheet."
    >
      <div className="k-form-col" style={{ display: 'grid', gap: 16 }}>
        <Card title="1. What are you importing?" subtitle={active.hint}>
          <div role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {KINDS.map((k) => (
              <Button key={k.key} variant={k.key === kind ? 'primary' : 'secondary'} onClick={() => switchKind(k.key)} aria-pressed={k.key === kind}>{k.label}</Button>
            ))}
          </div>
        </Card>

        <Card title="2. Choose the export file" subtitle="CSV or Excel (.xlsx). Up to 1,000 rows at a time.">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 64, borderRadius: 12, border: '2px dashed var(--brand-primary)', color: 'var(--text-primary)', fontWeight: 800, cursor: 'pointer', padding: 12, textAlign: 'center' }}>
            <UploadSimple size={22} weight="bold" color="var(--text-secondary)" />
            {fileName ? `${fileName} — ${dataRows.length} rows. Tap to pick another.` : 'Tap to choose a file'}
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" style={{ display: 'none' }} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {readErr && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700, margin: '12px 0 0' }}>{readErr}</p>}
        </Card>

        {table.length > 0 && (
          <Card title="3. Check the columns" subtitle="We matched these from your file's headers. Change any that are wrong.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
              {fields.map((f) => (
                <label key={f.key} style={{ display: 'grid', gap: 4, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <span>{f.label}{f.required ? ' *' : ''}</span>
                  <select style={selectStyle} value={map[f.key] ?? -1} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                    <option value={-1}>— Not in this file —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700, margin: '12px 0 0' }}>
                Pick the column for {missingRequired.map((f) => f.label).join(', ')}.
              </p>
            )}
          </Card>
        )}

        {table.length > 0 && missingRequired.length === 0 && (
          <Card
            title="4. Import"
            subtitle={`${ready} of ${dataRows.length} rows are ready. Anything already in Saguaro is skipped.`}
            actions={<Button variant="primary" onClick={run} disabled={running || ready === 0}>{running ? `Importing ${done} of ${bodies.length}…` : `Import ${ready} ${active.label.toLowerCase()}`}</Button>}
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="k-table" style={{ width: '100%' }}>
                <thead><tr>{fields.filter((f) => map[f.key] >= 0).map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
                <tbody>
                  {dataRows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{fields.filter((f) => map[f.key] >= 0).map((f) => <td key={f.key} data-label={f.label}>{r[map[f.key]]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result && (
              <div role="status" style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Badge tone="ongoing" dot>{result.created} imported</Badge>
                  <Badge tone="neutral">{result.skipped} already in Saguaro</Badge>
                  {result.failed.length > 0 && <Badge tone="overdue">{result.failed.length} not imported</Badge>}
                </div>
                {result.failed.length === 0
                  ? <p style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, margin: 0 }}><CheckCircle size={18} weight="fill" color="var(--success)" /> Done. Open {active.label} to see them.</p>
                  : (
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-primary)' }}>
                      {result.failed.slice(0, 20).map((f, i) => (
                        <li key={i}><WarningCircle size={14} weight="fill" color="var(--danger)" /> {f.row ? `Row ${f.row}: ` : ''}{f.why}</li>
                      ))}
                      {result.failed.length > 20 && <li>…and {result.failed.length - 20} more.</li>}
                    </ul>
                  )}
              </div>
            )}
          </Card>
        )}
      </div>
    </PageShell>
  );
}
