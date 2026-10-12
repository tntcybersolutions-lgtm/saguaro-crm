'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { Badge, Btn, Table, T } from '@/components/ui/shell';
import {
  PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, goldButtonStyle, secondaryButtonStyle, railStyle
} from '@/components/ui/premium';
import { Bell, CheckCircle, Sparkle, Lightning, ListChecks, ClockCounterClockwise } from '@phosphor-icons/react';

interface Alert {
  id: string;
  severity: string;
  alert_type: string;
  message: string;
  date: string;
  status: string;
}

const SEVERITY_BADGE: Record<string, 'red' | 'amber' | 'gold' | 'blue' | 'muted'> = {
  critical: 'red',
  high: 'amber',
  medium: 'gold',
  low: 'blue',
  info: 'muted',
};

// Palette aligned with the dashboard kit (desert-dusk semantic accents).
const RED = 'var(--danger)';
const AMBER = 'var(--warning)';
const GREEN = 'var(--success)';

// The four deterministic checks the project-scoped engine runs
// (lib/autopilot/scan, via /api/autopilot/run), in execution order — rendered as the pipeline rail.
const SCAN_RULES = [
  { title: 'Overdue RFIs', desc: 'Open RFIs past their response-due date.', match: (a: Alert) => /rfi/i.test(a.alert_type) },
  { title: 'Expiring Insurance', desc: 'Active certificates expiring within 30 days.', match: (a: Alert) => /insurance/i.test(a.alert_type) },
  { title: 'Pending Lien Waivers', desc: 'Waivers still awaiting signature.', match: (a: Alert) => /waiver/i.test(a.alert_type) },
  { title: 'Stale Change Orders', desc: 'COs sitting in pending for more than 14 days.', match: (a: Alert) => /change order/i.test(a.alert_type) },
];
const fmtM = (n: unknown) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function AutopilotPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState('');
  const [dismissingId, setDismissingId] = useState<string | null>(null);

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
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  async function runScan() {
    setRunning(true);
    // Walk the pipeline rail while the engine runs its checks server-side.
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
      setToast(data.summary || data.message || 'Autopilot scan complete.');
      await fetchAlerts();
    } catch {
      setToast('Could not run the Autopilot scan. Please try again.');
    } finally {
      clearInterval(ticker);
      setScanStage(-1);
      setRunning(false);
      setTimeout(() => setToast(''), 5000);
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
    } catch {
      setToast('Could not dismiss the alert. Please try again.');
      setTimeout(() => setToast(''), 4000);
      fetchAlerts();
    } finally {
      setDismissingId(null);
    }
  }

  const activeAlerts = alerts.filter(a => a.status !== 'dismissed');
  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
  const highCount = activeAlerts.filter(a => a.severity === 'high').length;
  const ruleCounts = SCAN_RULES.map(r => activeAlerts.filter(a => r.match(a)).length);

  // What the engine watches on this project — from the live context snapshot.
  // DB numerics can round-trip as strings, so everything goes through Number().
  const counts = ctx?.counts;
  const money = ctx?.money;
  const pendingCos = Number(money?.pendingCoCount) || 0;

  const scanButton = (
    <button
      onClick={runScan}
      disabled={running}
      className="pmBtn"
      style={{ ...goldButtonStyle, opacity: running ? 0.6 : 1, cursor: running ? 'not-allowed' : 'pointer' }}
    >
      <Lightning size={15} weight="fill" />
      {running ? 'Scanning…' : 'Run Autopilot Scan'}
    </button>
  );

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'AI Monitoring'}
        eyebrowIcon={<Sparkle size={13} weight="fill" color="var(--text-secondary)" />}
        title="Project"
        accent="Autopilot"
        subtitle="Deterministic checks on live project data. Re-scans every 6 hours."
        actions={scanButton}
      />

      {/* One summary row: the alerts this page is for, then the live surface
          the checks watch (RFIs; subs' insurance + waivers). Pending COs sit
          in the "What These Checks Guard" rail below, so they are not repeated. */}
      <StatStrip items={[
        { href: `/app/projects/${projectId}/autopilot`, label: 'Active Alerts', value: String(activeAlerts.length), sub: activeAlerts.length === 1 ? '1 open on this project' : `${activeAlerts.length} open on this project` },
        { href: `/app/projects/${projectId}/autopilot`, label: 'Critical', value: String(criticalCount), accent: criticalCount ? RED : undefined, sub: 'Need immediate action' },
        { href: `/app/projects/${projectId}/autopilot`, label: 'High', value: String(highCount), accent: highCount ? AMBER : undefined, sub: 'Review soon' },
        ...(ctx ? [
          { href: `/app/projects/${projectId}/rfis`, label: 'Open RFIs', value: String(Number(counts?.openRfis) || 0), sub: 'Checked for overdue responses' },
          { href: `/app/projects/${projectId}/subs`, label: 'Subs on the Job', value: String((ctx?.subs || []).length), sub: 'Insurance + waivers tracked' },
        ] : []),
      ]} />

      {toast && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(74,222,128,0.3)`, borderRadius: 10, color: T.green, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* Alerts + scan-pipeline rail */}
      <div className="pmSplit" style={railStyle(320, { gap: 18, alignItems: 'start' })}>
      <SectionCard
        icon={<Bell size={17} weight="duotone" color="var(--text-secondary)" />}
        title="Project Alerts"
        subtitle="Issues detected by Autopilot on this project"
        action={<span style={{ fontSize: 12, color: T.muted }}>{activeAlerts.length} active</span>}
        flush
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading alerts…</div>
        ) : activeAlerts.length === 0 ? (
          <PremiumEmpty
            icon={<CheckCircle size={30} weight="duotone" color={GREEN} />}
            title="No Active Alerts on This Project"
            description="All four checks came back clean — RFIs answered on time, insurance current, lien waivers signed, and change orders moving. Autopilot re-scans automatically every 6 hours; run one now after any big change."
            action={<button onClick={runScan} disabled={running} className="pmBtn" style={{ ...secondaryButtonStyle, opacity: running ? 0.6 : 1 }}>{running ? 'Scanning…' : 'Run a Scan Now'}</button>}
          />
        ) : (
          <Table
            headers={['Severity', 'Alert Type', 'Message', 'Date', 'Status', 'Actions']}
            rows={activeAlerts.map(a => [
              <Badge key="sev" label={a.severity} color={SEVERITY_BADGE[a.severity] || 'muted'} />,
              <span key="type" style={{ fontWeight: 600 }}>{a.alert_type}</span>,
              <span key="msg" style={{ fontSize: 13 }}>{a.message}</span>,
              <span key="dt" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{a.date ? new Date(a.date).toLocaleDateString() : '—'}</span>,
              <Badge key="st" label={a.status || 'active'} color={a.status === 'resolved' ? 'green' : 'amber'} />,
              <Btn key="act" size="sm" variant="ghost" onClick={() => dismissAlert(a.id)} disabled={dismissingId === a.id}>
                {dismissingId === a.id ? '…' : 'Dismiss'}
              </Btn>,
            ])}
          />
        )}
      </SectionCard>

      {/* Context rail — each check, its live output, and the money it guards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard flat
          title="Scan Pipeline"
          subtitle={running ? 'Running checks…' : 'Runs automatically every 6 hours'}
          icon={<ListChecks size={17} weight="duotone" color="var(--text-secondary)" />}
        >
          <FlowSteps title="" steps={SCAN_RULES.map((r, i) => ({
            title: r.title + (running ? '' : ruleCounts[i] > 0 ? ` — ${ruleCounts[i]} alert${ruleCounts[i] === 1 ? '' : 's'}` : ' — Clear'),
            desc: running && scanStage === i ? 'Checking now…' : r.desc,
            done: running ? scanStage > i : true,
          }))} />
        </SectionCard>
        {ctx && (
          <SectionCard flat title="What These Checks Guard" icon={<ClockCounterClockwise size={17} weight="duotone" color="var(--text-secondary)" />}>
            <InsightRow label="Revised Contract" value={fmtM(money?.revisedContract)} strong />
            <InsightRow label="Billed to Date" value={`${fmtM(money?.billedToDate)} · ${Number(money?.billedPct) || 0}%`} />
            <InsightRow label="Paid to Date" value={fmtM(money?.paidToDate)} accent={GREEN} />
            {pendingCos > 0 && <InsightRow label="Pending COs" value={String(pendingCos)} accent={AMBER} />}
            {Number(counts?.openPunch) > 0 && <InsightRow label="Open Punch" value={String(Number(counts?.openPunch) || 0)} />}
            {Number(ctx?.schedule?.criticalCount) > 0 && <InsightRow label="Critical-Path Tasks" value={String(Number(ctx?.schedule?.criticalCount) || 0)} accent={RED} />}
            <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 8, lineHeight: 1.5 }}>
              An unanswered RFI, a lapsed cert, or a stale CO puts this money at risk — that is what the alerts on the left protect.
            </div>
          </SectionCard>
        )}
      </div>
      </div>
    </PremiumSurface>
  );
}
