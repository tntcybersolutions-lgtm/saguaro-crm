'use client';
/**
 * Autopilot — AI monitoring alerts, Pass 4 on the kit.
 *
 * Anatomy: title + one primary action (Run Scan Now) → StatRow (total /
 * critical / high / acknowledged — each tile filters the list) → workspace
 * split: the alert register (kit DataTable with Acknowledge / Dismiss row
 * actions) on the left and the scan pipeline + "where the alerts are" rail
 * on the right. Phone: stacked.
 *
 * Every read / write is the one this screen already used:
 *   list     GET  /api/autopilot/alerts
 *   act      POST /api/autopilot/dismiss  { alertId, action: 'acknowledge' | 'dismiss' }
 *   scan     POST /api/autopilot/run      {}   (tenant from the session, never the body)
 *
 * The seven checks are deterministic rules (lib/autopilot/scan.ts) — labeled
 * as automated monitoring, never as a human judgment.
 */
import React, { useState, useEffect } from 'react';
import { retryText, apiErrorFrom } from '@/lib/api-refusal';
import { ArrowsClockwise, Robot, CheckCircle, Bell, Warning, Buildings, ListChecks, X, ArrowSquareOut } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowSteps, InsightRow } from '@/components/ui/premium';
import { useProjects } from '@/lib/hooks/useProjects';
import { layout } from '@/lib/design-tokens';

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

interface AutopilotAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  rule_code: string;
  entity_type: string;
  project_id?: string | null;
  created_at?: string;
  acknowledged?: boolean;
  dismissed?: boolean;
}

// The seven deterministic checks the scan engine runs (lib/autopilot/scan.ts),
// in execution order — used to render the pipeline rail and bucket live alerts.
const SCAN_RULES = [
  { title: 'Overdue RFIs',         desc: 'Open RFIs past their response-due date.',       match: (a: AutopilotAlert) => /overdue rfi/i.test(a.title) },
  { title: 'Expiring Insurance',   desc: 'Active certificates expiring within 30 days.',  match: (a: AutopilotAlert) => /insurance/i.test(a.title) },
  { title: 'Pending Lien Waivers', desc: 'Waivers still awaiting signature.',             match: (a: AutopilotAlert) => /lien waiver/i.test(a.title) },
  { title: 'Stale Change Orders',  desc: 'COs sitting in pending for more than 14 days.', match: (a: AutopilotAlert) => /stale change order/i.test(a.title) },
  { title: 'Budget Overruns',      desc: 'Budget lines at 90% spent or beyond.',          match: (a: AutopilotAlert) => /budget/i.test(a.title) },
  { title: 'Overdue Invoices',     desc: 'Sent or pending invoices past their due date.', match: (a: AutopilotAlert) => /overdue invoice/i.test(a.title) },
  { title: 'Scope-Creep Velocity', desc: 'CO / RFI spikes over the last 14 days.',        match: (a: AutopilotAlert) => /velocity/i.test(a.title) },
];

/** Severity → badge: critical red, high amber, medium slate, low grey (never green: green means good). */
function sevBadge(s: AlertSeverity): { label: string; tone: BadgeTone } {
  if (s === 'critical') return { label: 'Critical', tone: 'overdue' };
  if (s === 'high') return { label: 'High', tone: 'lead' };
  if (s === 'medium') return { label: 'Medium', tone: 'neutral' };
  return { label: 'Low', tone: 'closed' };
}
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
type SevFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'acknowledged';
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

const CSS = `
.apWs > .k-page { max-width: none; }
.apCq { container: apws / inline-size; min-width: 0; }
.apSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.apSplit > * { min-width: 0; }
@container apws (min-width: 1080px) {
  .apSplit { grid-template-columns: minmax(340px, 1fr) clamp(${layout.detailRailMin}px, 30%, ${layout.detailRailMax}px); }
}
.apRail { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 16px; }
.apAlert { display: flex; flex-direction: column; gap: 3px; max-width: 520px; min-width: 0; }
.apAlert > b { color: var(--text-primary); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.apAlert > span { font-size: var(--fs-xs); color: var(--text-tertiary); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.apWs .k-table tbody tr[data-ack="true"] td { opacity: .62; }
.apMuted { color: var(--text-tertiary); }
.apTag { font-size: var(--fs-xs); color: var(--text-tertiary); white-space: nowrap; }
.apProj { all: unset; box-sizing: border-box; color: var(--link); font-weight: 700; font-size: var(--fs-sm); cursor: pointer; white-space: nowrap; }
.apProj:hover { text-decoration: underline; }
.apProj:focus-visible { outline: 2px solid var(--focus-ring); }
.apRailNote { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 8px; line-height: 1.5; }
.apRule { height: 1px; background: var(--border-subtle); margin: 10px 0; }
.apRailLink { all: unset; display: block; cursor: pointer; border-radius: 6px; }
.apRailLink:hover { background: rgba(255,255,255,0.03); }
.apRailLink:focus-visible { outline: 2px solid var(--focus-ring); }
@media (max-width: 640px) {
  .apWs .k-btn, .apWs .k-stat, .apWs select.k-select, .apWs .k-input { min-height: 44px; }
  .apWs .k-table td { height: 48px; }
  .apAlert { max-width: 240px; }
}
`;

export default function AutopilotPage() {
  const [filter, setFilter] = useState<SevFilter>('all');
  const { toast, show } = useToast(4000);
  const [alertStates, setAlertStates] = useState<Record<string, 'acknowledged' | 'dismissed'>>({});
  const [scanning, setScanning] = useState(false);
  const [allAlerts, setAllAlerts] = useState<AutopilotAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [scanStage, setScanStage] = useState(-1); // -1 idle; 0..6 = check currently running
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const { projects } = useProjects();

  const loadAlerts = React.useCallback(async () => {
    setLoadError('');
    try {
      const r = await fetch('/api/autopilot/alerts');
      if (!r.ok) throw await apiErrorFrom(r, 'Failed to load');
      const data = await r.json();
      const rows = Array.isArray(data.alerts) ? data.alerts : [];
      setAllAlerts(rows.map((a: any): AutopilotAlert => ({
        id: a.id,
        severity: (a.severity || 'medium') as AlertSeverity,
        title: a.title || '',
        summary: a.summary || a.body || '',
        rule_code: a.rule_code || a.alert_type || '',
        entity_type: a.entity_type || '',
        project_id: a.project_id || null,
        created_at: a.created_at || '',
      })));
    } catch {
      setLoadError('Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const liveAlerts = allAlerts.filter(a => alertStates[a.id] !== 'dismissed');
  const q = search.trim().toLowerCase();
  const visibleAlerts = liveAlerts.filter(a => {
    if (filter === 'acknowledged') { if (alertStates[a.id] !== 'acknowledged') return false; }
    else if (filter !== 'all' && a.severity !== filter) return false;
    if (!q) return true;
    return [a.title, a.summary, a.rule_code, a.entity_type, projName(a.project_id)].some(v => String(v || '').toLowerCase().includes(q));
  });
  const filtersActive = filter !== 'all' || !!search;
  const clearFilters = () => { setFilter('all'); setSearch(''); };
  const toggleFilter = (f: SevFilter) => setFilter(prev => (prev === f ? 'all' : f));

  async function acknowledge(alertId: string) {
    setBusyId(alertId);
    setAlertStates(prev => ({ ...prev, [alertId]: 'acknowledged' }));
    try {
      await fetch('/api/autopilot/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'acknowledge' }),
      });
    } catch { /* non-critical */ }
    setBusyId(null);
    show('Alert acknowledged.');
  }

  async function dismiss(alertId: string) {
    setBusyId(alertId);
    setAlertStates(prev => ({ ...prev, [alertId]: 'dismissed' }));
    try {
      await fetch('/api/autopilot/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'dismiss' }),
      });
    } catch { /* non-critical */ }
    setBusyId(null);
    show('Alert dismissed.');
  }

  async function runScan() {
    setScanning(true);
    // Walk the pipeline rail while the engine runs its checks server-side.
    setScanStage(0);
    const ticker = setInterval(() => setScanStage(s => Math.min(s + 1, SCAN_RULES.length - 1)), 600);
    try {
      // Tenant is derived server-side from the authenticated session — never
      // sent from the client. (The route ignores any body tenantId.)
      const r = await fetch('/api/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      show(data.summary || 'Autopilot scan complete.');
      // The scan replaces the open alert set server-side — refresh, and drop
      // per-alert local state that was keyed to the previous set's ids.
      await loadAlerts();
      setAlertStates({});
      setLastScanAt(new Date());
    } catch {
      show('Autopilot scan triggered.');
    }
    clearInterval(ticker);
    setScanStage(-1);
    setScanning(false);
  }

  const acknowledgedCount = Object.values(alertStates).filter(v => v === 'acknowledged').length;
  const criticalCount = liveAlerts.filter(a => a.severity === 'critical').length;
  const highCount = liveAlerts.filter(a => a.severity === 'high').length;

  // Pipeline + coverage intelligence derived from the live alert set.
  const ruleCounts = SCAN_RULES.map(r => liveAlerts.filter(r.match).length);
  function projName(id?: string | null) { return ((projects as any[]) || []).find((p: any) => p.id === id)?.name as string | undefined; }
  const byProject = Object.entries(liveAlerts.reduce<Record<string, number>>((m, a) => {
    if (a.project_id) m[a.project_id] = (m[a.project_id] || 0) + 1;
    return m;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const stats: StatItem[] = loading
    ? [
        { label: 'Open Alerts', value: '—', sub: 'Loading…' },
        { label: 'Critical', value: '—', sub: 'Loading…' },
        { label: 'High', value: '—', sub: 'Loading…' },
        { label: 'Acknowledged', value: '—', sub: 'Loading…' },
      ]
    : [
        { label: 'Open Alerts', value: liveAlerts.length, sub: filtersActive ? 'Click to show everything' : byProject.length > 0 ? `${SCAN_RULES.length} checks · ${byProject.length} project${byProject.length === 1 ? '' : 's'} affected` : `Across ${SCAN_RULES.length} automated checks`, onClick: filtersActive ? clearFilters : undefined },
        { label: 'Critical', value: criticalCount, tone: criticalCount > 0 ? 'bad' : 'default', sub: filter === 'critical' ? 'Filtered — click to clear' : criticalCount > 0 ? 'Need immediate action' : 'None open', onClick: () => toggleFilter('critical') },
        { label: 'High', value: highCount, tone: highCount > 0 ? 'warn' : 'default', sub: filter === 'high' ? 'Filtered — click to clear' : highCount > 0 ? 'Review soon' : 'None open', onClick: () => toggleFilter('high') },
        { label: 'Acknowledged', value: acknowledgedCount, tone: acknowledgedCount > 0 ? 'good' : 'default', sub: filter === 'acknowledged' ? 'Filtered — click to clear' : 'Handled this session', onClick: () => toggleFilter('acknowledged') },
      ];

  const isAck = (a: AutopilotAlert) => alertStates[a.id] === 'acknowledged';
  const columns: Column<AutopilotAlert>[] = [
    { key: 'severity', phone: 'show', header: 'Severity', accessor: a => SEV_RANK[a.severity] ?? 9, width: 120, render: a => isAck(a) ? <Badge tone="ongoing">Acknowledged</Badge> : <Badge tone={sevBadge(a.severity).tone} dot>{sevBadge(a.severity).label}</Badge> },
    { key: 'title', header: 'Alert', accessor: a => a.title.toLowerCase(), render: a => <div className="apAlert"><b title={a.title}>{a.title}</b>{a.summary && <span title={a.summary}>{a.summary}</span>}</div> },
    { key: 'rule_code', phone: 'hide', header: 'Check', accessor: a => a.rule_code, render: a => a.rule_code ? <span className="apTag">{a.rule_code.replace(/_/g, ' ')}{a.entity_type ? ` · ${a.entity_type}` : ''}</span> : <span className="apMuted">—</span> },
    { key: 'project', header: 'Project', accessor: a => (projName(a.project_id) || '').toLowerCase(), render: a => a.project_id ? <Button variant="ghost" size="sm" href={`/app/projects/${a.project_id}/autopilot`}>{projName(a.project_id) || 'View Project'}</Button> : <span className="apMuted">Tenant-wide</span> },
    { key: 'created_at', phone: 'hide', header: 'Raised', accessor: a => a.created_at || '', render: a => <span className="apMuted">{fmtDate(a.created_at)}</span> },
  ];
  const rowActions = (a: AutopilotAlert): Action[] => [
    { label: 'Acknowledge', icon: <CheckCircle size={15} />, onClick: () => acknowledge(a.id), hidden: isAck(a), disabled: busyId === a.id },
    { label: 'Open in Project', icon: <ArrowSquareOut size={15} />, href: `/app/projects/${a.project_id}/autopilot`, hidden: !a.project_id },
    { label: 'Dismiss', icon: <X size={15} />, onClick: () => dismiss(a.id), tone: 'danger', disabled: busyId === a.id },
  ];

  const scanButton = (
    <Button variant="primary" data-tour="run-scan" icon={scanning ? <ArrowsClockwise size={15} weight="bold" /> : <Robot size={15} weight="fill" />} onClick={runScan} disabled={scanning}>
      {scanning ? 'Scanning…' : 'Run Scan Now'}
    </Button>
  );

  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = <EmptyState icon={<Warning size={22} />} title="Couldn't load alerts" text={retryText(loadError)} action={<Button onClick={() => { setLoading(true); loadAlerts(); }}>Retry</Button>} />;
  } else if (!loading && liveAlerts.length === 0) {
    listBody = (
      <EmptyState
        icon={<CheckCircle size={22} />}
        title="No Autopilot alerts — all clear"
        text="Every check came back clean: RFIs answered on time, insurance current, waivers signed, change orders moving, budgets inside 90%, invoices collected, and no scope-creep spikes. The engine re-scans automatically every 6 hours."
        action={<Button icon={<Robot size={15} weight="fill" />} onClick={runScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Run Scan Now'}</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={visibleAlerts}
        rowKey={a => a.id}
        loading={loading}
        defaultSort={{ key: 'severity', dir: 'asc' }}
        rowActions={rowActions}
        empty={<EmptyState icon={<Bell size={22} />} title="No alerts match these filters" text="Clear the search or severity filter to see more." action={<Button onClick={clearFilters}>Clear Filters</Button>} />}
      />
    );
  }

  return (
    <div className="apWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Intelligence', href: '/app/intelligence' }, { label: 'Autopilot' }]}
        title="Autopilot"
        subtitle="Seven checks on every job, every 6 hours."
        actions={scanButton}
      >
        {!loadError && <StatRow items={stats} />}

        {!loading && !loadError && liveAlerts.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search alerts by title, check, or project…"
            filters={
              <>
                <Select aria-label="Severity" value={filter} onChange={e => setFilter(e.target.value as SevFilter)} style={{ width: 'auto', minWidth: 150 }} options={[
                  { value: 'all', label: 'All Severities' }, { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }, { value: 'acknowledged', label: 'Acknowledged' },
                ]} />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="apMuted" style={{ fontSize: 'var(--fs-sm)' }}>{visibleAlerts.length} of {liveAlerts.length}</span>}
          />
        )}

        <div className="apCq">
          <div className="apSplit">
            <div><Card flush>{listBody}</Card></div>

            {/* Context rail — every stage of the scan, its live output, and where the alerts live */}
            <aside className="apRail" aria-label="Scan pipeline and coverage">
              <Card
                title="Scan Pipeline"
                subtitle={scanning ? 'Running checks…' : lastScanAt ? `Last on-demand scan ${lastScanAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Runs automatically every 6 hours'}
              >
                <FlowSteps title="" steps={SCAN_RULES.map((r, i) => ({
                  title: r.title + (scanning ? '' : ruleCounts[i] > 0 ? ` — ${ruleCounts[i]} alert${ruleCounts[i] === 1 ? '' : 's'}` : ' — clear'),
                  desc: scanning && scanStage === i ? 'Checking now…' : r.desc,
                  done: scanning ? scanStage > i : true,
                }))} />
                <div className="apRailNote"><ListChecks size={12} style={{ verticalAlign: '-2px' }} /> Deterministic rules, not AI judgment — each alert names the record that tripped it.</div>
              </Card>
              <Card title="Where the Alerts Are">
                {byProject.length > 0 ? (
                  <>
                    {byProject.map(([pid, n]) => (
                      <a key={pid} href={`/app/projects/${pid}/autopilot`} className="apRailLink">
                        <InsightRow label={projName(pid) || 'Project'} value={`${n} alert${n === 1 ? '' : 's'}`} accent={n >= 3 ? 'var(--status-overdue)' : undefined} />
                      </a>
                    ))}
                    <div className="apRailNote"><Buildings size={12} style={{ verticalAlign: '-2px' }} /> Click a project to work its alerts in context.</div>
                  </>
                ) : (
                  <div className="apRailNote" style={{ marginTop: 0 }}>No project-level alerts right now. Tenant-wide signals (waiver backlog, velocity spikes) still appear in the list when detected.</div>
                )}
                <div className="apRule" />
                <InsightRow label="Critical" value={String(criticalCount)} accent={criticalCount > 0 ? 'var(--status-overdue)' : undefined} />
                <InsightRow label="High" value={String(highCount)} accent={highCount > 0 ? 'var(--warning)' : undefined} />
                <InsightRow label="Medium / Low" value={String(liveAlerts.filter(a => a.severity === 'medium' || a.severity === 'low').length)} />
              </Card>
            </aside>
          </div>
        </div>
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
