'use client';
/**
 * Compliance — every sub's insurance, licensing, W-9 and lien-waiver standing
 * on the job in one matrix, with live scores and AI prequalification.
 *
 * Reads  GET  /api/projects/:id                  (contract subs, public / prevailing-wage flag)
 *        GET  /api/compliance?projectId=         (live scores from the real tables)
 * Acts   POST /api/insurance/request            { projectId } (all) | { subId, projectId } (one)
 *        POST /api/ai/sub-prequal               { subId, subData }
 *        POST /api/documents/prevailing-wage    { projectId } → openPdf
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Callout, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { ShieldCheck, PaperPlaneTilt, Sparkle, FileText, SealCheck, Warning, Prohibit, ShieldWarning, IdentificationCard, Scales } from '@phosphor-icons/react';
import { openPdf } from '@/components/PdfViewer';

interface ComplianceSub {
  id: string;
  name: string;
  trade: string;
  contract_amount: number;
  coi_status: string;
  coi_expiry: string | null;
  license_status: string;
  license_number: string;
  w9_status: string;
  is_prevailing_wage: boolean;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'ongoing', on_file: 'ongoing', current: 'ongoing', valid: 'ongoing',
  expiring: 'lead', pending: 'lead',
  expired: 'overdue', missing: 'overdue', invalid: 'overdue',
  not_requested: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active', on_file: 'On File', current: 'Current', valid: 'Valid',
  expiring: 'Expiring', pending: 'Pending',
  expired: 'Expired', missing: 'Missing', invalid: 'Invalid',
  not_requested: 'Not Requested',
};

const VERDICT_TONE: Record<string, BadgeTone> = { pass: 'ongoing', flag: 'lead', fail: 'overdue' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

interface PrequalResult {
  verdict: 'pass' | 'flag' | 'fail';
  score: number;
  flags: string[];
  strengths: string[];
  required_before_award: string[];
  summary: string;
}

const CSS = `
.cmpScore { font-weight: 800; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cmpScore[data-tone="good"] { color: var(--success); }
.cmpScore[data-tone="warn"] { color: var(--warning); }
.cmpScore[data-tone="bad"] { color: var(--danger); }
.cmpMuted { color: var(--text-tertiary); white-space: nowrap; }
.cmpLate { color: var(--danger); white-space: nowrap; }
.cmpSoon { color: var(--warning); white-space: nowrap; }
.cmpOk { color: var(--success); white-space: nowrap; }
.cmpResults { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.cmpCols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 12px; }
.cmpColTitle { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
.cmpColTitle[data-tone="bad"] { color: var(--danger); }
.cmpColTitle[data-tone="good"] { color: var(--success); }
.cmpColTitle[data-tone="warn"] { color: var(--warning); }
.cmpCols ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
.cmpSummary { font-size: 14px; color: var(--text-secondary); line-height: 1.6; }
@media (max-width: 640px) {
  .cmpWs .k-btn, .cmpWs .k-stat, .cmpWs select.k-select, .cmpWs .k-input { min-height: 44px; }
}
`;

export default function CompliancePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [subs, setSubs] = useState<ComplianceSub[]>([]);
  const [projLoading, setLoading] = useState(true);
  const { toast, show } = useToast(4000);
  const [isPublicProject, setIsPublicProject] = useState(false);
  const [prequaling, setPrequaling] = useState<string | null>(null);
  const [prequals, setPrequals] = useState<Record<string, PrequalResult>>({});
  const [search, setSearch] = useState('');
  const [coiFilter, setCoiFilter] = useState<'all' | 'gaps' | 'ok'>('all');
  const [requestingAll, setRequestingAll] = useState(false);

  // Live compliance intelligence — /api/compliance scores every sub from the
  // real tables (insurance_certificates, w9_requests, lien_waivers) and
  // /api/project-context supplies the roster. Merged into the matrix by name.
  const { ctx } = useProjectContext(projectId);
  const [scored, setScored] = useState<any[]>([]);
  const [scoredSummary, setScoredSummary] = useState<any>(null);
  const [scoredLoaded, setScoredLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/compliance?projectId=${projectId}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Couldn't load compliance.");
        if (Array.isArray(d.subs)) { setScored(d.subs); setScoredSummary(d.summary || null); }
      } catch (e) {
        // The matrix is this read — say it failed rather than show an empty roster.
        console.error('[compliance] scores unavailable', e);
        show(e instanceof Error ? e.message : "Couldn't load compliance.", 'bad');
      } finally {
        setScoredLoaded(true);
      }
    })();
  }, [projectId, show]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      const project = data.project || data;
      setIsPublicProject(project.is_public || project.prevailing_wage || false);
      /* The matrix's rows are the job's roster as /api/compliance scores it —
         not the contracts list. Contract rows named the contact person
         ("Hector Alvarado") beside the company, so every sub showed twice, the
         second time with a made-up "Pending" W-9 and COI. Compliance has ONE
         rule (lib/sub-compliance), read the same on the W-9 screen. */
      setSubs([]);
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // The rows come from the compliance read, so the page is loading until it lands.
  const loading = projLoading || !scoredLoaded;
  const norm = (v: any) => String(v || '').toLowerCase().trim();
  const scoredByName = new Map<string, any>(scored.map((s: any) => [norm(s.name), s]));
  const ctxSubs = (ctx?.subs || []) as any[];

  // Unified matrix: the contracts-derived rows enriched with live scores, plus
  // any scored subs and roster members those rows miss. One list, no blind spots.
  type MatrixRow = ComplianceSub & { live?: any };
  const seenNames = new Set(subs.map(s => norm(s.name)).filter(Boolean));
  const merged: MatrixRow[] = subs.map(s => ({ ...s, live: scoredByName.get(norm(s.name)) }));
  for (const sc of scored) {
    if (!norm(sc.name) || seenNames.has(norm(sc.name))) continue;
    seenNames.add(norm(sc.name));
    merged.push({
      id: sc.id, name: sc.name, trade: sc.trade || '', contract_amount: Number(sc.contract_amount) || 0,
      coi_status: 'pending', coi_expiry: null, license_status: 'pending', license_number: '',
      w9_status: 'pending', is_prevailing_wage: false, live: sc,
    });
  }
  for (const rs of ctxSubs) {
    if (!norm(rs.companyName) || seenNames.has(norm(rs.companyName))) continue;
    seenNames.add(norm(rs.companyName));
    merged.push({
      id: rs.id, name: rs.companyName, trade: rs.trade || '', contract_amount: Number(rs.contractAmount) || 0,
      coi_status: 'pending', coi_expiry: null, license_status: 'pending', license_number: '',
      w9_status: 'pending', is_prevailing_wage: false, live: scoredByName.get(norm(rs.companyName)),
    });
  }

  // Live-first status readers: real table data when the compliance API has it,
  // the contracts-derived fields otherwise.
  const coiStateOf = (s: MatrixRow) => s.live
    ? (s.live.insurance?.status === 'missing' ? 'missing' : s.live.insurance?.status === 'expiring' ? 'expiring' : s.live.insurance?.status === 'current' ? 'active'
      : (Number(s.live.insurance?.active_certs) || 0) > 0 ? ((Number(s.live.insurance?.expiring_certs) || 0) > 0 ? 'expiring' : 'active') : 'missing')
    : s.coi_status;
  const w9StateOf = (s: MatrixRow) => {
    if (!s.live) return s.w9_status;
    const w = String(s.live.w9?.status || '');
    return (s.live.w9?.on_file || w === 'submitted' || w === 'approved' || w === 'received') ? 'on_file' : w === 'pending' ? 'pending' : 'not_requested';
  };
  const coiGap = (s: MatrixRow) => { const c = coiStateOf(s); return c === 'expired' || c === 'expiring' || c === 'missing'; };

  const compliantCount = scoredSummary ? Number(scoredSummary.compliant) || 0 : subs.filter(s => s.coi_status === 'active' && s.license_status !== 'expired' && s.license_status !== 'missing').length;
  const expiredCOIs = scored.length > 0
    ? merged.filter(coiGap).length
    : subs.filter(s => s.coi_status === 'expired' || s.coi_status === 'expiring').length;
  const missingLicenses = subs.filter(s => s.license_status === 'missing' || s.license_status === 'expired').length;
  const wageViolations = subs.filter(s => s.is_prevailing_wage && isPublicProject).length;

  async function scorePrequal(sub: ComplianceSub) {
    setPrequaling(sub.id);
    try {
      const res = await fetch('/api/ai/sub-prequal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId: sub.id, subData: sub }),
      });
      if (!res.ok) throw new Error('scoring failed');
      const d = await res.json();
      setPrequals(prev => ({ ...prev, [sub.id]: d }));
    } catch {
      show('AI scoring failed. Please try again.', 'bad');
    } finally {
      setPrequaling(null);
    }
  }

  async function requestCOI(subId: string, subName: string) {
    try {
      const res = await fetch('/api/insurance/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId, projectId }),
      });
      if (!res.ok) throw new Error('request failed');
      show(`COI request sent to ${subName}.`);
    } catch {
      show(`Could not send the COI request to ${subName}. Please try again.`, 'bad');
    }
  }

  async function requestAllCOIs() {
    setRequestingAll(true);
    try {
      const res = await fetch('/api/insurance/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error('request failed');
      show('COI request emails sent to all subcontractors.');
    } catch {
      show('Could not send COI requests. Please try again.', 'bad');
    } finally {
      setRequestingAll(false);
    }
  }

  async function generatePrevailingWage() {
    try {
      const res = await fetch('/api/documents/prevailing-wage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      const url = data.url || data.pdfUrl;
      if (!res.ok || !url) throw new Error(data.error || 'generation failed');
      openPdf({ url });
      show('Prevailing wage rate sheet generated.');
    } catch {
      show('Could not generate the prevailing wage rate sheet. Please try again.', 'bad');
    }
  }

  const q = search.trim().toLowerCase();
  const shown = merged.filter(s => {
    if (coiFilter === 'gaps' && !coiGap(s)) return false;
    if (coiFilter === 'ok' && coiGap(s)) return false;
    if (!q) return true;
    return `${s.name} ${s.trade}`.toLowerCase().includes(q);
  });

  const base = `/app/projects/${projectId}`;
  const atRisk = Number(scoredSummary?.at_risk) || 0;
  const nonCompliant = Number(scoredSummary?.non_compliant) || 0;
  const stats: StatItem[] = [
    { label: 'Compliant', value: compliantCount, tone: 'good', sub: scoredSummary ? 'Score 80+ — cleared to work' : undefined, icon: <SealCheck size={15} /> },
    ...(scoredSummary ? [
      { label: 'At risk', value: atRisk, tone: atRisk > 0 ? 'warn' : 'default', sub: 'Gaps to close this month', icon: <Warning size={15} /> } as StatItem,
      { label: 'Non-compliant', value: nonCompliant, tone: nonCompliant > 0 ? 'bad' : 'good', sub: 'Hold payment and site access', icon: <Prohibit size={15} /> } as StatItem,
    ] : []),
    { label: 'COI gaps', value: expiredCOIs, tone: expiredCOIs > 0 ? 'bad' : 'default', sub: 'Expired, expiring or missing', icon: <ShieldWarning size={15} />, onClick: () => setCoiFilter(coiFilter === 'gaps' ? 'all' : 'gaps'), active: coiFilter === 'gaps' },
    { label: 'Missing licenses', value: missingLicenses, tone: missingLicenses > 0 ? 'warn' : 'default', icon: <IdentificationCard size={15} /> },
  ];

  const scoreTone = (n: number) => (n >= 80 ? 'good' : n >= 50 ? 'warn' : 'bad');
  const columns: Column<MatrixRow>[] = [
    { key: 'name', header: 'Subcontractor', primary: true, render: (s) => s.name || 'Unnamed sub' },
    { key: 'trade', header: 'Trade', render: (s) => s.trade || '' },
    { key: 'contract_amount', header: 'Contract', align: 'right', total: 'sum', format: money, accessor: (s) => Number(s.contract_amount) || 0, render: (s) => money(s.contract_amount) },
    { key: 'coi', header: 'COI', phone: 'show', fit: 'full', accessor: (s) => STATUS_LABEL[coiStateOf(s)] || coiStateOf(s), render: (s) => { const c = coiStateOf(s); return <Badge tone={STATUS_TONE[c] || 'neutral'} dot>{STATUS_LABEL[c] || c}</Badge>; } },
    {
      key: 'coi_expiry', header: 'COI expiry', accessor: (s) => s.coi_expiry || '',
      render: (s) => {
        const c = coiStateOf(s);
        const text = s.coi_expiry || (s.live ? ((Number(s.live.insurance?.active_certs) || 0) > 0 ? `${s.live.insurance.active_certs} active cert${Number(s.live.insurance.active_certs) === 1 ? '' : 's'}` : 'None on file') : '');
        return <span className={c === 'expired' || c === 'missing' ? 'cmpLate' : c === 'expiring' ? 'cmpSoon' : 'cmpMuted'}>{text}</span>;
      },
    },
    { key: 'license', header: 'License', fit: 'full', accessor: (s) => STATUS_LABEL[s.license_status] || s.license_status, render: (s) => <Badge tone={STATUS_TONE[s.license_status] || 'neutral'}>{STATUS_LABEL[s.license_status] || s.license_status}</Badge> },
    { key: 'w9', header: 'W-9', fit: 'full', accessor: (s) => STATUS_LABEL[w9StateOf(s)] || w9StateOf(s), render: (s) => { const w = w9StateOf(s); return <Badge tone={STATUS_TONE[w] || 'neutral'}>{STATUS_LABEL[w] || w}</Badge>; } },
    {
      key: 'waivers', header: 'Waivers', accessor: (s) => (s.live?.lien_waivers ? Number(s.live.lien_waivers.signed) || 0 : -1),
      render: (s) => { const lw = s.live?.lien_waivers; if (!lw) return ''; return <span className={Number(lw.pending) > 0 ? 'cmpSoon' : 'cmpOk'}>{Number(lw.total) > 0 ? `${lw.signed}/${lw.total} signed` : 'None yet'}</span>; },
    },
    { key: 'score', header: 'Score', align: 'right', phone: 'show', accessor: (s) => (s.live ? Number(s.live.score) || 0 : -1), render: (s) => s.live ? <span className="cmpScore" data-tone={scoreTone(Number(s.live.score))}>{s.live.score}/100</span> : null },
    {
      key: 'prequal', header: 'AI prequal', accessor: (s) => prequals[s.id]?.score ?? -1,
      render: (s) => { const p = prequals[s.id]; return p ? <Badge tone={VERDICT_TONE[p.verdict] || 'neutral'} dot>{cap(p.verdict)} {p.score}/100</Badge> : ''; },
    },
  ];

  const rowActions = (s: MatrixRow): Action[] => [
    { label: 'Request COI', icon: <PaperPlaneTilt size={14} />, onClick: () => requestCOI(s.id, s.name), inline: true, hidden: !coiGap(s) },
    { label: prequaling === s.id ? 'Scoring…' : prequals[s.id] ? 'Re-score with AI' : 'AI score', icon: <Sparkle size={15} />, onClick: () => scorePrequal({ ...s, live: undefined } as any), disabled: prequaling === s.id },
  ];

  const results = Object.entries(prequals)
    .map(([subId, result]) => ({ subId, result, sub: merged.find(s => s.id === subId) }))
    .filter(r => !!r.sub);

  return (
    <div className="cmpWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'Compliance' },
        ]}
        title="Compliance"
        badge={isPublicProject ? <Badge tone="closed" dot>Public project</Badge> : undefined}
        subtitle={`${merged.length} subcontractor${merged.length === 1 ? '' : 's'}`}
        actions={
          <>
            {isPublicProject && <Button icon={<FileText size={15} />} onClick={generatePrevailingWage}>Prevailing wage rate sheet</Button>}
            <Button variant="primary" icon={<PaperPlaneTilt size={15} weight="fill" />} onClick={requestAllCOIs} disabled={requestingAll}>
              {requestingAll ? 'Sending…' : 'Request all COIs'}
            </Button>
          </>
        }
      >
        <StatRow items={stats} />

        {isPublicProject && (
          <div style={{ marginBottom: 16 }}>
            <Callout
              tone="warning"
              icon={<Scales size={18} />}
              title="Prevailing wage requirements apply to this project"
              text={wageViolations > 0 ? `${wageViolations} sub${wageViolations === 1 ? '' : 's'} flagged for prevailing wage.` : 'No wage flags on the roster.'}
            />
          </div>
        )}

        {!loading && merged.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by sub or trade…"
            filters={
              <Select aria-label="COI" value={coiFilter} onChange={e => setCoiFilter(e.target.value as 'all' | 'gaps' | 'ok')} style={{ width: 'auto', minWidth: 160 }}
                options={[{ value: 'all', label: 'All subs' }, { value: 'gaps', label: 'COI gaps' }, { value: 'ok', label: 'COI current' }]} />
            }
            actions={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>{shown.length} of {merged.length}</span>}
          />
        )}

        <Card flush>
          <DataTable<MatrixRow>
            tableId="project-compliance"
            exportName="compliance"
            columns={columns}
            rows={shown}
            loading={loading}
            rowKey={(s) => s.id || s.name}
            defaultSort={{ key: 'name', dir: 'asc' }}
            rowActions={rowActions}
            empty={merged.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck size={22} />}
                title="No subcontractors to track yet"
                text="Subs join this matrix when you add them to the roster or award a bid package."
                action={<Button href={`${base}/bid-packages`}>Go to bid packages</Button>}
              />
            ) : (
              <EmptyState title="Nothing matches" text="Change the search or the filter." action={<Button onClick={() => { setSearch(''); setCoiFilter('all'); }}>Clear filters</Button>} />
            )}
          />
        </Card>

        {/* AI prequalification results */}
        {results.length > 0 && (
          <div className="cmpResults">
            {results.map(({ subId, result, sub }) => (
              <Card
                key={subId}
                icon={<Sparkle size={16} />}
                title={`${sub!.name} — AI prequalification`}
                actions={<Badge tone={VERDICT_TONE[result.verdict] || 'neutral'} dot>{cap(result.verdict)} · {result.score}/100</Badge>}
              >
                <div className="cmpSummary">{result.summary}</div>
                <div className="cmpCols">
                  {result.flags.length > 0 && (
                    <div>
                      <div className="cmpColTitle" data-tone="bad">Flags</div>
                      <ul>{result.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    </div>
                  )}
                  {result.strengths.length > 0 && (
                    <div>
                      <div className="cmpColTitle" data-tone="good">Strengths</div>
                      <ul>{result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}
                  {result.required_before_award.length > 0 && (
                    <div>
                      <div className="cmpColTitle" data-tone="warn">Required before award</div>
                      <ul>{result.required_before_award.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
