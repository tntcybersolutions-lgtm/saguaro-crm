'use client';
/**
 * Lien waivers — conditional / unconditional waivers by sub, on the kit layout.
 * Pay-app approval auto-generates conditionals; an unsigned linked waiver gates
 * that application's mark-paid.
 *
 * Reads     GET  /api/lien-waivers/list?projectId=   and  GET /api/pay-apps/list?projectId=
 * Generate  POST /api/lien-waivers/generate          (one waiver, or one per roster sub via Generate all)
 * Download  /api/files/open?u=<pdf_url>              (in-app share on the native shell)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { openPdf } from '@/components/PdfViewer';
import { localDay } from '@/lib/calendar-day';
import { inAppFileClick } from '@/lib/media-save';
import { MODULES } from '@/lib/status-system';
import {
  PageShell, Card, StatRow, Badge, Button, Tabs, Toolbar, DataTable, EmptyState, Select, Callout,
  FormModal, Field, Input, DateInput, FormGrid, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  CheckCircle, Hourglass, Lightning, FileText, DownloadSimple, Plus, WarningCircle, Lock, CurrencyDollar, X,
} from '@phosphor-icons/react';

/* Currency style puts the sign first: -$2,150, never $-2,150. */
const fmt = (n: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const WAIVER_TYPES = [
  { key: 'conditional_partial', label: 'Conditional Progress' },
  { key: 'unconditional_partial', label: 'Unconditional Progress' },
  { key: 'conditional_final', label: 'Conditional Final' },
  { key: 'unconditional_final', label: 'Unconditional Final' },
];
const STATES = ['AZ', 'CA', 'TX', 'NV', 'CO', 'FL', 'WA', 'OR', 'UT', 'NM', 'OTHER'];
// The pay-app approval cascade writes waiver_type 'conditional_progress' and the
// mark-paid conversion writes 'unconditional_progress' — the same instruments as
// the manual "partial" types. Normalize so auto-generated waivers land in the
// matrix instead of vanishing into unmapped columns.
const TYPE_ALIAS: Record<string, string> = {
  conditional_progress: 'conditional_partial',
  unconditional_progress: 'unconditional_partial',
};
const normalizeType = (t: string) => TYPE_ALIAS[t] || t;
const typeLabel = (t: string) => WAIVER_TYPES.find(x => x.key === normalizeType(t))?.label || t;

const fmtDate = (d?: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const TONE: Record<string, BadgeTone> = { draft: 'neutral', waiting: 'under_contract', good: 'ongoing', done: 'completed', bad: 'overdue', warn: 'lead', active: 'ongoing' };
function waiverBadge(status: string): { label: string; tone: BadgeTone } {
  const k = String(status || 'pending').toLowerCase();
  const def = MODULES.lien_waivers?.statuses?.[k];
  return { label: def?.label || (k.charAt(0).toUpperCase() + k.slice(1)), tone: (def && TONE[def.tone]) || 'neutral' };
}

const claimantOf = (w: any): string => w.claimant_name || (w.subcontractors as any)?.company_name || (w.subcontractors as any)?.name || '';
const isPending = (w: any) => w.status === 'pending' || w.status === 'sent';
const gatesPaid = (w: any) => !!(isPending(w) && w.blocks_payment !== false && w.pay_application_id);

interface MatrixRow {
  subId: string;
  subName: string;
  waivers: Record<string, { id: string; status: string; pdf_url?: string } | null>;
}

function buildMatrix(waivers: any[]): MatrixRow[] {
  const bySubId: Record<string, MatrixRow> = {};
  for (const w of waivers) {
    const subId = w.sub_id || w.subId || w.id;
    const subName = (w.subcontractors as any)?.company_name || (w.subcontractors as any)?.name || w.company_name || w.claimant_name || w.sub_name || 'Unknown';
    if (!bySubId[subId]) {
      bySubId[subId] = { subId, subName, waivers: {} };
    }
    bySubId[subId].waivers[normalizeType(w.waiver_type)] = { id: w.id, status: w.status, pdf_url: w.pdf_url };
  }
  return Object.values(bySubId);
}

/**
 * One cell of the waiver matrix. In Procore a matrix cell IS the record — you
 * click the gap to fill it, so a missing waiver is a control, not a dash.
 */
function MatrixCell({ status, pdfUrl, onGenerate, label }: { status: string | undefined | null; pdfUrl?: string; onGenerate: () => void; label: string }) {
  if (status === 'signed') {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <CheckCircle size={16} weight="fill" color="var(--success)" aria-label="Signed" />
        {pdfUrl && <Button size="sm" variant="ghost" onClick={() => openPdf({ url: pdfUrl, title: 'Lien Waiver' })}>PDF</Button>}
      </div>
    );
  }
  if (status === 'pending' || status === 'sent') {
    return <span title="Pending signature" style={{ display: 'inline-flex' }}><Hourglass size={16} weight="fill" color="var(--warning)" aria-label="Pending signature" /></span>;
  }
  return (
    <Button size="sm" variant="ghost" icon={<Plus size={14} weight="bold" />} aria-label={`Generate ${label}`} title="Not generated — click to create this waiver" onClick={onGenerate} />
  );
}

type View = 'matrix' | 'list';

export default function LienWaiversPage() {
  const params = useParams();
  const projectId = params['projectId'] as string;
  const base = `/app/projects/${projectId}`;
  const { toast, show } = useToast(4000);

  const [waivers, setWaivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'warning' | 'danger'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genAll, setGenAll] = useState(false);
  const [view, setView] = useState<View>('matrix');

  // form
  const [fType, setFType] = useState('conditional_partial');
  const [fState, setFState] = useState('AZ');
  const [fClaimant, setFClaimant] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fThrough, setFThrough] = useState(localDay);
  const [fSubId, setFSubId] = useState('');
  const [fPayAppId, setFPayAppId] = useState('');
  const [autoAmt, setAutoAmt] = useState(false);

  const [wSearch, setWSearch] = useState('');
  const [wStatusFilter, setWStatusFilter] = useState('all');
  const [wTypeFilter, setWTypeFilter] = useState('all');

  // Project intelligence — one snapshot (roster + money) plus the pay-app list,
  // so every waiver can name the application it gates.
  const { ctx } = useProjectContext(projectId);
  const [payApps, setPayApps] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/pay-apps/list?projectId=${projectId}`);
        const d = await r.json();
        setPayApps(Array.isArray(d.payApps) ? d.payApps : []);
      } catch (e) {
        // The pay-app link is optional — the waiver list still works without it.
        console.error('pay-apps list', e);
        setPayApps([]);
      }
    })();
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const r = await fetch(`/api/lien-waivers/list?projectId=${projectId}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setWaivers(d.lienWaivers ?? []);
    } catch (e: any) {
      console.error(e); setLoadError(humanError(e, 'Failed to load lien waivers. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const subs = (ctx?.subs || []) as any[];

  async function generate() {
    if (!fClaimant.trim() || !fAmount || !fThrough) { setFormError('Claimant, amount, and through date are required.'); return; }
    setGenerating(true); setFormError('');
    try {
      const r = await fetch('/api/lien-waivers/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        projectId, waiverType: fType, state: fState, claimantName: fClaimant, amount: parseFloat(fAmount) || 0, throughDate: fThrough,
        ...(fSubId ? { subId: fSubId } : {}), ...(fPayAppId ? { payAppId: fPayAppId } : {}),
      }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setFClaimant(''); setFAmount(''); setFThrough(localDay());
      setFSubId(''); setFPayAppId(''); setAutoAmt(false);
      setShowForm(false);
      show('Lien waiver generated.');
      await load();
    } catch (e: any) {
      console.error(e); setFormError(humanError(e, 'Failed to generate the lien waiver. Please try again.'));
    } finally {
      setGenerating(false);
    }
  }

  async function generateAll() {
    setGenAll(true);
    setNotice(null);
    try {
      /* Generate a conditional partial for every sub on the roster that does
         not already have one. The roster is the source; existing waivers are
         what we skip against. */
      const covered = new Set(
        buildMatrix(waivers)
          .filter(r => r.waivers['conditional_partial'])
          .map(r => r.subId)
      );
      const targets = subs.filter((sub: any) => !covered.has(sub.id));
      if (targets.length === 0) {
        setNotice({ tone: 'warning', text: subs.length === 0
          ? 'No subcontractors on this project yet — add subs before generating waivers.'
          : 'Every sub already has a conditional partial for this period.' });
        return;
      }
      // Each one is checked: a refused waiver used to count as made.
      const failed: string[] = [];
      for (const sub of targets) {
        const name = sub.companyName || sub.name || '';
        const r = await fetch('/api/lien-waivers/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          projectId, waiverType: 'conditional_partial', claimantName: name, throughDate: fThrough, amount: 0, subId: sub.id,
        }) });
        if (!r.ok) { const d = await r.json().catch(() => ({})); failed.push(`${name || 'A sub'}: ${d.error || 'not saved'}`); }
      }
      await load();
      if (failed.length) setNotice({ tone: 'danger', text: `${failed.length} of ${targets.length} waivers were not saved — ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}` });
      else show(`${targets.length} conditional waiver${targets.length === 1 ? '' : 's'} generated.`);
    } catch (e: any) {
      console.error(e); setNotice({ tone: 'danger', text: humanError(e, 'Failed to generate all waivers. Please try again.') });
    } finally {
      setGenAll(false);
    }
  }

  function openGenerate() { setFormError(''); setShowForm(true); }
  function closeGenerate() { if (generating) return; setShowForm(false); setFormError(''); }

  /** A matrix gap opens the generator with this sub and this waiver type already chosen. */
  function fillGap(row: MatrixRow, typeKey: string) {
    setFType(typeKey);
    const rosterSub = subs.find((s: any) => s.id === row.subId);
    if (rosterSub) { setFSubId(row.subId); setFClaimant(rosterSub.companyName || row.subName); }
    else { setFSubId(''); setFClaimant(row.subName === 'Unknown' ? '' : row.subName); }
    openGenerate();
  }

  function download(w: any) {
    const url = `/api/files/open?u=${encodeURIComponent(w.pdf_url || '')}`;
    let handledInApp = false;
    inAppFileClick(url, 'Lien waiver', (m) => show(m, 'bad'))({ preventDefault: () => { handledInApp = true; } });
    if (!handledInApp) window.open(url, '_blank', 'noreferrer');
  }

  const matrix = buildMatrix(waivers);
  const signed = waivers.filter(w => w.status === 'signed').length;
  const pending = waivers.filter(isPending).length;
  // Unsigned waivers with blocks_payment !== false hold mark-paid on their pay app.
  const blocking = waivers.filter(gatesPaid).length;
  const waiverTotal = waivers.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const wq = wSearch.trim().toLowerCase();
  const filteredWaivers = waivers.filter((w: any) => {
    const st = w.status === 'sent' ? 'pending' : String(w.status || 'pending');
    if (wStatusFilter === 'blocking') { if (!gatesPaid(w)) return false; }
    else if (wStatusFilter !== 'all' && st !== wStatusFilter) return false;
    if (wTypeFilter !== 'all' && normalizeType(String(w.waiver_type || '')) !== wTypeFilter) return false;
    if (!wq) return true;
    return [claimantOf(w), typeLabel(w.waiver_type), w.state].some(v => String(v || '').toLowerCase().includes(wq));
  });
  const lastApp = ctx?.money?.lastPayApp || null;
  const appNoById: Record<string, number> = {};
  for (const pa of payApps) { if (pa?.id) appNoById[pa.id] = Number(pa.app_number) || 0; }

  const selSub = subs.find(s => s.id === fSubId);
  const selPa = payApps.find(p => p.id === fPayAppId);
  const rosterTotal = subs.reduce((t, s) => t + (Number(s.contractAmount) || 0), 0);
  const suggestedShare = selSub && selPa && rosterTotal > 0
    ? Math.round(((Number(selSub.contractAmount) || 0) / rosterTotal) * (Number(selPa.current_payment_due) || 0) * 100) / 100
    : 0;

  /** A stat tile that shows the list filtered to one status. */
  const showList = (f: string) => { setView('list'); setWStatusFilter(p => (p === f ? 'all' : f)); };
  const stats: StatItem[] = [
    { label: 'Total waivers', value: loading ? '—' : String(waivers.length), icon: <FileText size={15} />, sub: loading || subs.length === 0 ? undefined : `${matrix.length} of ${subs.length} subs covered`, onClick: () => setView('matrix'), active: view === 'matrix' },
    { label: 'Signed', value: loading ? '—' : String(signed), icon: <CheckCircle size={15} />, tone: signed > 0 ? 'good' : 'default', onClick: () => showList('signed'), active: view === 'list' && wStatusFilter === 'signed' },
    { label: 'Pending', value: loading ? '—' : String(pending), icon: <Hourglass size={15} />, tone: pending > 0 ? 'warn' : 'default', onClick: () => showList('pending'), active: view === 'list' && wStatusFilter === 'pending' },
    { label: 'Blocking payment', value: loading ? '—' : String(blocking), icon: <Lock size={15} />, tone: loading ? 'default' : blocking > 0 ? 'bad' : 'good', sub: blocking > 0 ? 'Mark-paid is held' : undefined, onClick: () => showList('blocking'), active: view === 'list' && wStatusFilter === 'blocking' },
    { label: 'Waiver value', value: loading ? '—' : fmt(waiverTotal), icon: <CurrencyDollar size={15} />, sub: lastApp ? `Pay App #${lastApp.appNumber} certified ${fmt(Number(lastApp.currentPaymentDue) || 0)}` : undefined, href: lastApp ? `${base}/pay-apps` : undefined },
  ];

  const columns: Column<any>[] = [
    { key: 'claimant', header: 'Claimant', primary: true, phone: 'show', accessor: w => claimantOf(w), render: w => claimantOf(w) },
    { key: 'type', header: 'Type', accessor: w => typeLabel(w.waiver_type), render: w => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        {typeLabel(w.waiver_type)}{w.converted_from_id ? <Badge tone="completed">Auto</Badge> : null}
      </span>
    ) },
    { key: 'app', header: 'Pay app', accessor: w => (w.pay_application_id ? (appNoById[w.pay_application_id] || null) : null), render: w => {
      const appNo = w.pay_application_id ? appNoById[w.pay_application_id] : undefined;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          {appNo ? `App #${appNo}` : ''}{gatesPaid(w) ? <Badge tone="overdue">Gates paid</Badge> : null}
        </span>
      );
    } },
    { key: 'state', header: 'State', render: w => w.state || '' },
    { key: 'amount', header: 'Amount', align: 'right', total: 'sum', format: fmt, phone: 'show', accessor: w => Number(w.amount) || 0, render: w => <strong>{fmt(Number(w.amount) || 0)}</strong> },
    { key: 'through', header: 'Through date', accessor: w => (w.through_date ? String(w.through_date).slice(0, 10) : ''), render: w => fmtDate(w.through_date ? String(w.through_date).slice(0, 10) : null) },
    { key: 'status', header: 'Status', phone: 'show', accessor: w => (w.status === 'sent' ? 'pending' : (w.status || 'pending')), render: w => { const st = waiverBadge(w.status || 'pending'); return <Badge tone={st.tone} dot>{st.label}</Badge>; } },
  ];

  const rowActions = (w: any): Action[] => [
    { label: 'Download', icon: <DownloadSimple size={14} />, inline: true, hidden: !w.pdf_url, onClick: () => download(w) },
  ];

  const matrixCard = (
    <Card
      title="Waiver matrix"
      subtitle={<span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle size={14} weight="fill" color="var(--success)" /> Signed</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Hourglass size={14} weight="fill" color="var(--warning)" /> Pending</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={14} weight="bold" /> Not generated</span>
      </span>}
      flush
    >
      <div style={{ overflowX: 'auto' }}>
        <table className="k-table">
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Subcontractor</th>
              {WAIVER_TYPES.map(t => <th key={t.key} style={{ textAlign: 'center', minWidth: 140 }}>{t.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.map(row => (
              <tr key={row.subId}>
                <td className="k-td-primary">{row.subName}</td>
                {WAIVER_TYPES.map(t => {
                  const w = row.waivers[t.key];
                  return (
                    <td key={t.key} style={{ textAlign: 'center' }}>
                      <MatrixCell status={w?.status} pdfUrl={w?.pdf_url} label={`${t.label} for ${row.subName}`} onGenerate={() => fillGap(row, t.key)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Lien waivers' },
      ]}
      title="Lien waivers"
      subtitle="Conditional and unconditional, by sub"
      actions={
        <>
          <Button icon={<Lightning size={15} weight="fill" />} onClick={generateAll} disabled={genAll}>{genAll ? 'Generating…' : 'Generate all'}</Button>
          <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openGenerate}>Generate waiver</Button>
        </>
      }
    >
      {!loadError && waivers.length > 0 && <StatRow items={stats} />}

      {notice && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone={notice.tone} icon={<WarningCircle size={18} />} title={notice.text}
            actions={<Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setNotice(null)}>Dismiss</Button>} />
        </div>
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load lien waivers" text={loadError} action={<Button onClick={load}>Try again</Button>} />
      ) : loading ? (
        <DataTable columns={columns} rows={[]} rowKey={(w: any) => w.id} loading toolbar={false} />
      ) : waivers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={22} />}
            title="No lien waivers yet"
            text={subs.length > 0 ? `${subs.length} sub${subs.length === 1 ? '' : 's'} on the roster` : undefined}
            action={<Button icon={<Plus size={15} weight="bold" />} onClick={openGenerate}>Generate a waiver</Button>}
          />
        </Card>
      ) : (
        <>
          <Tabs
            tabs={[
              { key: 'matrix', label: 'Matrix', count: matrix.length },
              { key: 'list', label: 'All waivers', count: waivers.length },
            ]}
            value={view}
            onChange={k => setView(k as View)}
          />
          {view === 'matrix' ? matrixCard : (
            <>
              <Toolbar
                search={wSearch}
                onSearch={setWSearch}
                placeholder="Search by claimant, type or state…"
                filters={
                  <>
                    <Select aria-label="Status" value={wStatusFilter} onChange={e => setWStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 160 }}
                      options={[{ value: 'all', label: 'All statuses' }, { value: 'pending', label: 'Pending' }, { value: 'signed', label: 'Signed' }, { value: 'blocking', label: 'Blocking payment' }]} />
                    <Select aria-label="Type" value={wTypeFilter} onChange={e => setWTypeFilter(e.target.value)} style={{ width: 'auto', minWidth: 180 }}
                      options={[{ value: 'all', label: 'All types' }, ...WAIVER_TYPES.map(t => ({ value: t.key, label: t.label }))]} />
                  </>
                }
              />
              <DataTable<any>
                tableId="project-lien-waivers"
                exportName="lien-waivers"
                columns={columns}
                rows={filteredWaivers}
                rowKey={w => w.id}
                defaultSort={{ key: 'through', dir: 'desc' }}
                rowActions={rowActions}
                rowStyle={w => (gatesPaid(w) ? { boxShadow: 'inset 3px 0 0 var(--danger)' } : undefined)}
                empty={<EmptyState title="No waivers match" text="Change the search or the filters." action={<Button onClick={() => { setWSearch(''); setWStatusFilter('all'); setWTypeFilter('all'); }}>Clear filters</Button>} />}
              />
            </>
          )}
        </>
      )}

      {/* Generate one waiver */}
      <FormModal
        open={showForm}
        onClose={closeGenerate}
        title="Generate lien waiver"
        subtitle={lastApp ? `Pay App #${lastApp.appNumber} · ${String(lastApp.status || 'draft').replace(/_/g, ' ')} · certified ${fmt(Number(lastApp.currentPaymentDue) || 0)} through ${fmtDate(lastApp.periodTo)}` : 'State-specific statutory form, generated as a PDF.'}
        onSubmit={generate}
        submitLabel="Generate PDF"
        busy={generating}
        error={formError}
      >
        <FormGrid cols={2}>
          <Field label="Waiver type" hint={fType.startsWith('conditional') ? 'Effective once payment clears' : 'Effective when signed — collect after payment'}>
            <Select value={fType} onChange={e => setFType(e.target.value)} options={WAIVER_TYPES.map(t => ({ value: t.key, label: t.label }))} />
          </Field>
          <Field label="State" hint="Statutory language: AZ ARS §33-1008 · CA Civil Code §8132 · TX Prop. Code Ch. 53.">
            <Select value={fState} onChange={e => setFState(e.target.value)} options={STATES} />
          </Field>
          <Field label="Claimant" required hint={subs.length > 0 ? `${subs.length} sub${subs.length === 1 ? '' : 's'} on the roster` : undefined}>
            {subs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Select
                  aria-label="Claimant from roster"
                  value={fSubId || '__custom'}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '__custom') { setFSubId(''); }
                    else { const s = subs.find(x => x.id === v); setFSubId(v); setFClaimant(s?.companyName || ''); }
                  }}
                  options={[{ value: '__custom', label: 'Other — type a name below…' }, ...subs.map((s: any) => ({ value: String(s.id), label: `${s.companyName}${s.trade ? ` — ${s.trade}` : ''}` }))]}
                />
                {!fSubId && <Input aria-label="Claimant name" value={fClaimant} onChange={e => setFClaimant(e.target.value)} placeholder="ABC Electrical LLC" />}
              </div>
            ) : (
              <Input value={fClaimant} onChange={e => setFClaimant(e.target.value)} placeholder="ABC Electrical LLC" />
            )}
          </Field>
          <Field
            label="Amount ($)"
            required
            hint={selSub && suggestedShare > 0
              ? <>App #{selPa.app_number} certified {fmt(Number(selPa.current_payment_due) || 0)} — {selSub.companyName}&apos;s pro-rata share is {fmt(suggestedShare)}.{autoAmt ? ' Using it.' : ''}</>
              : selSub && Number(selSub.contractAmount) > 0
                ? <>{selSub.companyName} contract: {fmt(Number(selSub.contractAmount) || 0)}. Link a pay app below to compute their pro-rata share.</>
                : 'Dollars released through the date below.'}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input type="number" inputMode="decimal" value={fAmount} onChange={e => { setFAmount(e.target.value); setAutoAmt(false); }} placeholder="45000" min="0" />
              {selSub && suggestedShare > 0 && !autoAmt && (
                <Button size="sm" onClick={() => { setFAmount(String(suggestedShare)); setAutoAmt(true); }}>Use {fmt(suggestedShare)}</Button>
              )}
            </div>
          </Field>
          <Field label="Through date" required hint={lastApp ? `Pay App #${lastApp.appNumber} billed through ${fmtDate(lastApp.periodTo)}.` : undefined}>
            <DateInput value={fThrough} onChange={e => setFThrough(e.target.value)} />
          </Field>
          <Field label="Link to pay app" hint="A linked unsigned waiver gates that application's mark-paid.">
            <Select value={fPayAppId} onChange={e => setFPayAppId(e.target.value)} placeholder="Not linked"
              options={payApps.map((pa: any) => ({ value: String(pa.id), label: `App #${pa.app_number} — ${String(pa.status || 'draft').replace(/_/g, ' ')}` }))} />
          </Field>
        </FormGrid>
      </FormModal>

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
