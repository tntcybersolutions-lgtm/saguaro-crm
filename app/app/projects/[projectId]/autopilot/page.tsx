'use client';
/**
 * Project Autopilot — the alerts the deterministic checks raised on this job
 * (overdue RFIs, expiring insurance, unsigned lien waivers, stale change
 * orders), what each check found, and the money they guard.
 *
 * Reads  GET  /api/autopilot/alerts?projectId=
 * Writes POST /api/autopilot/run      { projectId }           (lib/autopilot/scan)
 *        POST /api/autopilot/dismiss  { alertId, projectId }
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PageShell, StatRow, Button, Card, Badge, Toolbar, Select, DataTable, EmptyState, ItemList, ItemRow, DetailList,
  Toast, useToast, type Column, type StatItem, type BadgeTone,
} from '@/components/ui/kit';
import { Bell, CheckCircle, Lightning, WarningOctagon, Warning, Question, ShieldWarning, Signature, Swap, UsersThree, X } from '@phosphor-icons/react';

interface Alert {
  id: string;
  severity: string;
  alert_type: string;
  message: string;
  date: string;
  status: string;
}

const SEVERITY_TONE: Record<string, BadgeTone> = {
  critical: 'overdue',
  high: 'lead',
  medium: 'under_contract',
  low: 'neutral',
  info: 'closed',
};
const SEVERITY_RANK: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4, info: 5 };
const cap = (s: string) => { const t = (s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

// The four deterministic checks the project-scoped engine runs
// (lib/autopilot/scan, via /api/autopilot/run), in execution order.
const SCAN_RULES = [
  { key: 'rfi', title: 'Overdue RFIs', desc: 'Open RFIs past their response-due date.', icon: <Question size={16} />, match: (a: Alert) => /rfi/i.test(a.alert_type) },
  { key: 'insurance', title: 'Expiring Insurance', desc: 'Active certificates expiring within 30 days.', icon: <ShieldWarning size={16} />, match: (a: Alert) => /insurance/i.test(a.alert_type) },
  { key: 'waiver', title: 'Pending Lien Waivers', desc: 'Waivers still awaiting signature.', icon: <Signature size={16} />, match: (a: Alert) => /waiver/i.test(a.alert_type) },
  { key: 'co', title: 'Stale Change Orders', desc: 'COs sitting in pending for more than 14 days.', icon: <Swap size={16} />, match: (a: Alert) => /change order/i.test(a.alert_type) },
];
const fmtM = (n: unknown) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

const PAGE_CSS = `
.apGrid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--section-gap); align-items: start; }
.apRail { display: flex; flex-direction: column; gap: var(--section-gap); min-width: 0; }
@media (max-width: 960px) { .apGrid { grid-template-columns: 1fr; } }
`;

type SevFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'info';

export default function AutopilotPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sev, setSev] = useState<SevFilter>('all');
  const [rule, setRule] = useState<string>('all');
  const { toast, show } = useToast(5000);

  // Project intelligence — one snapshot on mount; the page walks in already
  // knowing what Autopilot is watching (RFIs, COs, subs, invoices, schedule).
  const { ctx } = useProjectContext(projectId);
  const [scanStage, setScanStage] = useState(-1); // -1 idle; 0..3 = check currently running

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/autopilot/alerts?projectId=${projectId}`);
      const data = await res.json();
      setAlerts(data.alerts ?? []);
    } catch (e) {
      console.error('[autopilot] alerts', e);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  async function runScan() {
    setRunning(true);
    // Walk the check list while the engine runs its checks server-side.
    setScanStage(0);
    const ticker = setInterval(() => setScanStage(s => Math.min(s + 1, SCAN_RULES.length - 1)), 550);
    try {
      /* Was /api/internal/autopilot/run — a second, 159-line inline copy of the
         rule set that only this page called. /api/autopilot/run delegates to
         lib/autopilot/scan, the same engine the nightly cron and the portfolio
         page use, so one set of rules now decides what an alert is. */
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'scan failed');
      show(data.summary || data.message || 'Autopilot scan complete.');
      await fetchAlerts();
    } catch (e) {
      console.error('[autopilot] run', e);
      show('Could not run the Autopilot scan. Please try again.', 'bad');
    } finally {
      clearInterval(ticker);
      setScanStage(-1);
      setRunning(false);
    }
  }

  async function dismissAlert(alertId: string) {
    setDismissingId(alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    try {
      const res = await fetch('/api/autopilot/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, projectId }),
      });
      if (!res.ok) throw new Error('dismiss failed');
    } catch (e) {
      console.error('[autopilot] dismiss', e);
      show('Could not dismiss the alert. Please try again.', 'bad');
      fetchAlerts();
    } finally {
      setDismissingId(null);
    }
  }

  const activeAlerts = useMemo(() => alerts.filter(a => a.status !== 'dismissed'), [alerts]);
  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
  const highCount = activeAlerts.filter(a => a.severity === 'high').length;
  const ruleCounts = SCAN_RULES.map(r => activeAlerts.filter(a => r.match(a)).length);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const r = SCAN_RULES.find((x) => x.key === rule);
    return activeAlerts.filter((a) => {
      if (sev !== 'all' && a.severity !== sev) return false;
      if (r && !r.match(a)) return false;
      if (!q) return true;
      return [a.alert_type, a.message, a.severity, a.status].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [activeAlerts, search, sev, rule]);

  // What the engine watches on this project — from the live context snapshot.
  // DB numerics can round-trip as strings, so everything goes through Number().
  const counts = ctx?.counts;
  const money = ctx?.money;
  const pendingCos = Number(money?.pendingCoCount) || 0;
  const base = `/app/projects/${projectId}`;
  const filtered = sev !== 'all' || rule !== 'all' || search.trim() !== '';
  const clearFilters = () => { setSearch(''); setSev('all'); setRule('all'); };

  const stats: StatItem[] = [
    { label: 'Active alerts', value: loading ? '—' : String(activeAlerts.length), sub: 'Open on this job', icon: <Bell size={15} />, onClick: clearFilters, active: !filtered },
    { label: 'Critical', value: loading ? '—' : String(criticalCount), sub: 'Need immediate action', tone: criticalCount ? 'bad' : 'default', icon: <WarningOctagon size={15} />, onClick: () => { setRule('all'); setSev('critical'); }, active: sev === 'critical' && rule === 'all' },
    { label: 'High', value: loading ? '—' : String(highCount), sub: 'Review soon', tone: highCount ? 'warn' : 'default', icon: <Warning size={15} />, onClick: () => { setRule('all'); setSev('high'); }, active: sev === 'high' && rule === 'all' },
    ...(ctx ? [
      { label: 'Open RFIs', value: String(Number(counts?.openRfis) || 0), sub: 'Checked for overdue responses', icon: <Question size={15} />, href: `${base}/rfis` },
      { label: 'Subs on the job', value: String((ctx?.subs || []).length), sub: 'Insurance + waivers tracked', icon: <UsersThree size={15} />, href: `${base}/subs` },
    ] as StatItem[] : []),
  ];

  const columns: Column<Alert>[] = [
    { key: 'severity', header: 'Severity', phone: 'show', groupable: false, width: 120, accessor: (a) => SEVERITY_RANK[a.severity] ?? 9, render: (a) => <Badge tone={SEVERITY_TONE[a.severity] || 'neutral'} dot>{cap(a.severity)}</Badge> },
    { key: 'alert_type', header: 'Check', primary: true, phone: 'show' },
    { key: 'message', header: 'Message', phone: 'show', render: (a) => <span style={{ color: 'var(--text-secondary)' }}>{a.message || '—'}</span> },
    { key: 'date', header: 'Date', groupable: false, accessor: (a) => a.date || '', render: (a) => (a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—') },
    { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'resolved' ? 'completed' : 'lead'} dot>{cap(a.status || 'active')}</Badge> },
  ];

  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Autopilot' },
      ]}
      title="Autopilot"
      subtitle="Deterministic checks on live job data. Re-scans every 6 hours."
      actions={
        <Button variant="primary" icon={<Lightning size={15} weight="fill" />} onClick={runScan} disabled={running}>
          {running ? 'Scanning…' : 'Run Autopilot scan'}
        </Button>
      }
    >
      <style>{PAGE_CSS}</style>
      <StatRow items={stats} />

      <div className="apGrid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', minWidth: 0 }}>
          {!loading && activeAlerts.length > 0 && (
            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search alerts…"
              filters={
                <>
                  <Select aria-label="Severity" value={sev} onChange={(e) => setSev(e.target.value as SevFilter)} style={{ width: 'auto', minWidth: 150 }}
                    options={[{ value: 'all', label: 'All severities' }, ...['critical', 'high', 'medium', 'low', 'info'].map((s) => ({ value: s, label: cap(s) }))]} />
                  <Select aria-label="Check" value={rule} onChange={(e) => setRule(e.target.value)} style={{ width: 'auto', minWidth: 180 }}
                    options={[{ value: 'all', label: 'All checks' }, ...SCAN_RULES.map((r) => ({ value: r.key, label: r.title }))]} />
                </>
              }
            />
          )}
          <DataTable<Alert>
            tableId="project-autopilot"
            exportName="autopilot-alerts"
            columns={columns}
            rows={shown}
            loading={loading}
            rowKey={(a) => a.id}
            defaultSort={{ key: 'severity', dir: 'asc' }}
            rowActions={(a) => [
              { label: dismissingId === a.id ? '…' : 'Dismiss', icon: <X size={14} />, inline: true, disabled: dismissingId === a.id, onClick: () => dismissAlert(a.id) },
            ]}
            empty={
              activeAlerts.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle size={22} />}
                  title="No active alerts on this job"
                  text="All four checks came back clean."
                  action={<Button icon={<Lightning size={15} />} onClick={runScan} disabled={running}>{running ? 'Scanning…' : 'Run a scan now'}</Button>}
                />
              ) : (
                <EmptyState title="Nothing matches" text="Change the search or the filters." action={<Button onClick={clearFilters}>Clear filters</Button>} />
              )
            }
          />
        </div>

        <div className="apRail">
          <Card title="Checks" subtitle={running ? 'Running checks…' : 'Runs automatically every 6 hours'} flush>
            <ItemList>
              {SCAN_RULES.map((r, i) => {
                const n = ruleCounts[i];
                const state = running ? (scanStage === i ? 'Checking…' : scanStage > i ? 'Done' : 'Queued') : n > 0 ? `${n} alert${n === 1 ? '' : 's'}` : 'Clear';
                return (
                  <ItemRow
                    key={r.key}
                    icon={r.icon}
                    tone={!running && n > 0 ? 'warning' : !running ? 'success' : 'neutral'}
                    title={r.title}
                    desc={r.desc}
                    value={<strong style={{ color: !running && n > 0 ? 'var(--warning)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{state}</strong>}
                    onClick={!running && n > 0 ? () => { setSev('all'); setRule(r.key); } : undefined}
                  />
                );
              })}
            </ItemList>
          </Card>

          {ctx && (
            <Card title="What these checks guard">
              <DetailList items={[
                ['Revised contract', fmtM(money?.revisedContract)],
                ['Billed to date', `${fmtM(money?.billedToDate)} · ${Number(money?.billedPct) || 0}%`],
                ['Paid to date', fmtM(money?.paidToDate)],
                ...(pendingCos > 0 ? [['Pending COs', <span key="pco" style={{ color: 'var(--warning)', fontWeight: 700 }}>{pendingCos}</span>] as [string, React.ReactNode]] : []),
                ...(Number(counts?.openPunch) > 0 ? [['Open punch', String(Number(counts?.openPunch) || 0)] as [string, React.ReactNode]] : []),
                ...(Number(ctx?.schedule?.criticalCount) > 0 ? [['Critical-path tasks', <span key="cp" style={{ color: 'var(--danger)', fontWeight: 700 }}>{Number(ctx?.schedule?.criticalCount) || 0}</span>] as [string, React.ReactNode]] : []),
              ]} />
            </Card>
          )}
        </div>
      </div>

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
