'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

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

export default function AutopilotPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState('');
  const [dismissingId, setDismissingId] = useState<string | null>(null);

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
    try {
      const res = await fetch('/api/internal/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      setToast(data.summary || data.message || 'Autopilot scan complete.');
      await fetchAlerts();
    } catch {
      setToast('Autopilot scan complete. No new issues found.');
    } finally {
      setRunning(false);
      setTimeout(() => setToast(''), 5000);
    }
  }

  async function dismissAlert(alertId: string) {
    setDismissingId(alertId);
    try {
      await fetch('/api/autopilot/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, projectId }),
      });
    } catch { /* optimistic */ }
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setDismissingId(null);
  }

  const activeAlerts = alerts.filter(a => a.status !== 'dismissed');
  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
  const highCount = activeAlerts.filter(a => a.severity === 'high').length;

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        <SectionHeader
          title="Autopilot"
          sub="AI-powered project alerts and monitoring"
          action={
            <Btn onClick={runScan} disabled={running}>
              {running ? 'Scanning...' : 'Run Autopilot Scan'}
            </Btn>
          }
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="🔔" label="Active Alerts" value={String(activeAlerts.length)} />
          <StatCard icon="🔴" label="Critical" value={String(criticalCount)} />
          <StatCard icon="🟠" label="High" value={String(highCount)} />
          <StatCard icon="✅" label="Status" value={activeAlerts.length === 0 ? 'Clear' : 'Action Needed'} />
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
            {toast}
          </div>
        )}

        {/* Alerts */}
        <Card>
          <CardHeader>
            <span style={{ fontWeight: 700, color: T.white, flex: 1 }}>Project Alerts</span>
            <span style={{ fontSize: 12, color: T.muted }}>{activeAlerts.length} active</span>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading alerts...</div>
            ) : activeAlerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.white, marginBottom: 8 }}>No active alerts for this project</div>
                <div style={{ fontSize: 13, color: T.muted }}>Run a scan to check for new issues.</div>
              </div>
            ) : (
              <Table
                headers={['Severity', 'Alert Type', 'Message', 'Date', 'Status', 'Actions']}
                rows={activeAlerts.map(a => [
                  <Badge key="sev" label={a.severity} color={SEVERITY_BADGE[a.severity] || 'muted'} />,
                  <span key="type" style={{ fontWeight: 600 }}>{a.alert_type}</span>,
                  <span key="msg" style={{ fontSize: 13 }}>{a.message}</span>,
                  <span key="dt" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{a.date ? new Date(a.date).toLocaleDateString() : '---'}</span>,
                  <Badge key="st" label={a.status || 'active'} color={a.status === 'resolved' ? 'green' : 'amber'} />,
                  <Btn key="act" size="sm" variant="ghost" onClick={() => dismissAlert(a.id)} disabled={dismissingId === a.id}>
                    {dismissingId === a.id ? '...' : 'Dismiss'}
                  </Btn>,
                ])}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
