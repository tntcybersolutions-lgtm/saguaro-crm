'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowsClockwise, Robot, CheckCircle, Bell, WarningOctagon, Warning, ListChecks, Buildings } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, FlowSteps, InsightRow, goldButtonStyle } from '@/components/ui/premium';
import { useProjects } from '@/lib/hooks/useProjects';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',RED='#FF3B30';

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

export default function AutopilotPage() {
  const [filter, setFilter] = useState<'all'|'critical'|'high'|'medium'>('all');
  const [feedback, setFeedback] = useState<string>('');
  const [alertStates, setAlertStates] = useState<Record<string, 'acknowledged'|'dismissed'>>({});
  const [scanning, setScanning] = useState(false);
  const [allAlerts, setAllAlerts] = useState<AutopilotAlert[]>([]);

  const [scanStage, setScanStage] = useState(-1); // -1 idle; 0..6 = check currently running
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const { projects } = useProjects();

  const loadAlerts = React.useCallback(async () => {
    try {
      const r = await fetch('/api/autopilot/alerts');
      if (!r.ok) return;
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
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const visibleAlerts = allAlerts.filter(a => {
    if (alertStates[a.id] === 'dismissed') return false;
    return filter === 'all' || a.severity === filter;
  });

  const sevColor = (s: string) => s==='critical'?{bg:'rgba(192,48,48,.12)',c:'#FF3B30',border:'rgba(192,48,48,.3)'}:s==='high'?{bg:'rgba(255,138,0,.1)',c:'#FF8A00',border:'rgba(255,138,0,.3)'}:{bg:'color-mix(in srgb, var(--warning) 10%, transparent)',c:'var(--warning)',border:'color-mix(in srgb, var(--warning) 30%, transparent)'};

  async function acknowledge(alertId: string) {
    setAlertStates(prev => ({ ...prev, [alertId]: 'acknowledged' }));
    try {
      await fetch('/api/autopilot/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'acknowledge' }),
      });
    } catch { /* non-critical */ }
    showFeedback('Alert acknowledged.');
  }

  async function dismiss(alertId: string) {
    setAlertStates(prev => ({ ...prev, [alertId]: 'dismissed' }));
    try {
      await fetch('/api/autopilot/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'dismiss' }),
      });
    } catch { /* non-critical */ }
    showFeedback('Alert dismissed.');
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
      showFeedback(data.summary || 'Autopilot scan complete.');
      // The scan replaces the open alert set server-side — refresh, and drop
      // per-alert local state that was keyed to the previous set's ids.
      await loadAlerts();
      setAlertStates({});
      setLastScanAt(new Date());
    } catch {
      showFeedback('Autopilot scan triggered.');
    }
    clearInterval(ticker);
    setScanStage(-1);
    setScanning(false);
  }

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 4000);
  }

  const acknowledgedCount = Object.values(alertStates).filter(v => v === 'acknowledged').length;

  // Pipeline + coverage intelligence derived from the live alert set.
  const liveAlerts = allAlerts.filter(a => alertStates[a.id] !== 'dismissed');
  const ruleCounts = SCAN_RULES.map(r => liveAlerts.filter(r.match).length);
  const projName = (id?: string | null) => ((projects as any[]) || []).find((p: any) => p.id === id)?.name as string | undefined;
  const byProject = Object.entries(liveAlerts.reduce<Record<string, number>>((m, a) => {
    if (a.project_id) m[a.project_id] = (m[a.project_id] || 0) + 1;
    return m;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const filterTabs = (
    <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
      {(['all','critical','high','medium'] as const).map(f=>(
        <button key={f} onClick={()=>setFilter(f)} className="pmBtn" style={{padding:'6px 16px',borderRadius:8,border:`1px solid ${filter===f?'var(--brand-primary-35)':BORDER}`,background:filter===f?'var(--brand-primary-12)':'rgba(255,255,255,0.03)',color:filter===f?'var(--brand-primary-strong)':DIM,fontSize:13,fontWeight:700,cursor:'pointer',textTransform:'capitalize' as const}}>
          {f==='all'?`All (${allAlerts.filter(a=>alertStates[a.id]!=='dismissed').length})`:f}
        </button>
      ))}
    </div>
  );

  return (
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow="AI Monitoring"
        eyebrowIcon={<Robot size={13} weight="fill" color="var(--brand-primary)" />}
        title="Autopilot"
        accent="Dashboard"
        subtitle="Scans every 6 hours, and on demand."
        actions={
          <button data-tour="run-scan"
            onClick={runScan}
            disabled={scanning}
            className="pmBtn"
            style={{...goldButtonStyle, opacity: scanning ? 0.65 : 1, cursor: scanning ? 'not-allowed' : 'pointer'}}
          >
            {scanning ? (
              <><ArrowsClockwise size={16} weight="bold" color="#0A0A00" /> Scanning…</>
            ) : (
              <><Robot size={16} weight="fill" color="#0A0A00" /> Run Scan Now</>
            )}
          </button>
        }
      />

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:12,marginBottom:28}}>
        <StatCard
          icon={<Bell size={19} weight="duotone" color={GOLD} />}
          label="Total Alerts" value={allAlerts.length.toString()}
          sub={byProject.length > 0 ? `${SCAN_RULES.length} checks · ${byProject.length} project${byProject.length === 1 ? '' : 's'} affected` : `Across ${SCAN_RULES.length} deterministic checks`} delay={0.02}
         href="/app/autopilot"/>
        <StatCard
          icon={<WarningOctagon size={19} weight="duotone" color="#FF3B30" />}
          label="Critical" value={allAlerts.filter(a=>a.severity==='critical').length.toString()}
          accent={allAlerts.some(a=>a.severity==='critical') ? '#FF3B30' : undefined}
          sub="Need immediate action" delay={0.06}
         href="/app/autopilot"/>
        <StatCard
          icon={<Warning size={19} weight="duotone" color="#FF8A00" />}
          label="High" value={allAlerts.filter(a=>a.severity==='high').length.toString()}
          accent={allAlerts.some(a=>a.severity==='high') ? '#FF8A00' : undefined}
          sub="Review soon" delay={0.10}
         href="/app/autopilot"/>
        <StatCard
          icon={<CheckCircle size={19} weight="duotone" color="#2CFF7A" />}
          label="Acknowledged" value={acknowledgedCount.toString()}
          accent={acknowledgedCount > 0 ? '#2CFF7A' : undefined}
          sub="Handled this session" delay={0.14}
         href="/app/autopilot"/>
      </div>

      {/* Alerts + scan-pipeline rail */}
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 320px',gap:18,alignItems:'start'}}>
      <SectionCard
        icon={<Robot size={17} weight="duotone" color={GOLD} />}
        title="Autopilot Alerts"
        subtitle="Issues detected across your projects"
        action={filterTabs}
        flush
      >
        <div style={{padding:20,display:'flex',flexDirection:'column',gap:12}}>
          {visibleAlerts.map(alert=>{
            const sc = sevColor(alert.severity);
            const isAcknowledged = alertStates[alert.id] === 'acknowledged';
            return (
              <div key={alert.id} style={{background:isAcknowledged?'rgba(44,255,122,.05)':'rgba(255,255,255,0.03)',border:`1px solid ${isAcknowledged?'rgba(44,255,122,.22)':sc.border}`,borderRadius:14,padding:20,opacity:isAcknowledged?0.72:1,transition:'all .2s'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
                  <div style={{padding:'4px 10px',borderRadius:6,background:isAcknowledged?'rgba(44,255,122,.15)':sc.bg,color:isAcknowledged?'#2CFF7A':sc.c,fontSize:10,fontWeight:800,textTransform:'capitalize' as const,border:`1px solid ${isAcknowledged?'rgba(44,255,122,.3)':sc.border}`,flexShrink:0,marginTop:2}}>
                    {isAcknowledged ? 'Acknowledged' : alert.severity}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,color:TEXT,fontSize:15,marginBottom:5}}>{alert.title}</div>
                    <div style={{fontSize:13,color:'rgba(255,255,255,0.62)',lineHeight:1.6,marginBottom:12}}>{alert.summary}</div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap' as const,alignItems:'center'}}>
                      {alert.rule_code && <span style={{fontSize:11,padding:'2px 8px',borderRadius:5,background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.55)'}}>{alert.rule_code.replace(/_/g,' ')}</span>}
                      {alert.entity_type && <span style={{fontSize:11,padding:'2px 8px',borderRadius:5,background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.55)'}}>{alert.entity_type}</span>}
                      {alert.created_at && <span style={{fontSize:11,padding:'2px 8px',borderRadius:5,background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.55)'}}>{new Date(alert.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
                      {alert.project_id && (
                        <Link href={`/app/projects/${alert.project_id}/autopilot`} style={{textDecoration:'none'}}>
                          <span style={{fontSize:11,padding:'2px 8px',borderRadius:5,background:'color-mix(in srgb, var(--brand-primary) 10%, transparent)',border:'1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',color:'var(--brand-primary-strong)',fontWeight:700}}>{projName(alert.project_id) || 'View Project'}</span>
                        </Link>
                      )}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,flexShrink:0}}>
                    {!isAcknowledged && (
                      <button
                        onClick={() => acknowledge(alert.id)}
                        className="pmBtn"
                        style={{padding:'6px 12px',background:'rgba(44,255,122,.1)',border:'1px solid rgba(44,255,122,.3)',borderRadius:8,color:'#2CFF7A',fontSize:12,fontWeight:700,cursor:'pointer'}}
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(alert.id)}
                      className="pmBtn"
                      style={{padding:'6px 12px',background:'rgba(255,255,255,0.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:12,cursor:'pointer'}}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {visibleAlerts.length===0&&(
            <PremiumEmpty
              icon={<CheckCircle size={38} weight="duotone" color="#2CFF7A" />}
              title="No Autopilot alerts — all clear."
              description="Every check came back clean: RFIs answered on time, insurance current, waivers signed, change orders moving, budgets inside 90%, invoices collected, and no scope-creep spikes. The engine re-scans automatically every 6 hours."
              action={
                <button
                  onClick={runScan}
                  disabled={scanning}
                  className="pmBtn"
                  style={{...goldButtonStyle, opacity: scanning ? 0.65 : 1, cursor: scanning ? 'not-allowed' : 'pointer'}}
                >
                  {scanning ? (
                    <><ArrowsClockwise size={16} weight="bold" color="#0A0A00" /> Scanning…</>
                  ) : (
                    <><Robot size={16} weight="fill" color="#0A0A00" /> Run Scan Now</>
                  )}
                </button>
              }
            />
          )}
        </div>
      </SectionCard>

      {/* Context rail — every stage of the scan, its live output, and where the alerts live */}
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <SectionCard flat
          title="Scan Pipeline"
          subtitle={scanning ? 'Running checks…' : lastScanAt ? `Last on-demand scan ${lastScanAt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : 'Runs automatically every 6 hours'}
          icon={<ListChecks size={17} weight="duotone" color={GOLD} />}
        >
          <FlowSteps title="" steps={SCAN_RULES.map((r, i) => ({
            title: r.title + (scanning ? '' : ruleCounts[i] > 0 ? ` — ${ruleCounts[i]} alert${ruleCounts[i] === 1 ? '' : 's'}` : ' — clear'),
            desc: scanning && scanStage === i ? 'Checking now…' : r.desc,
            done: scanning ? scanStage > i : true,
          }))}/>
        </SectionCard>
        <SectionCard title="Where the Alerts Are" icon={<Buildings size={17} weight="duotone" color={GOLD} />}>
          {byProject.length > 0 ? (
            <>
              {byProject.map(([pid, n]) => (
                <Link key={pid} href={`/app/projects/${pid}/autopilot`} style={{textDecoration:'none',display:'block'}}>
                  <InsightRow label={projName(pid) || 'Project'} value={`${n} alert${n === 1 ? '' : 's'}`} accent={n >= 3 ? '#FF3B30' : undefined}/>
                </Link>
              ))}
              <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:8,lineHeight:1.5}}>Click a project to work its alerts in context.</div>
            </>
          ) : (
            <div style={{fontSize:12.5,color:DIM,lineHeight:1.6}}>No project-level alerts right now. Tenant-wide signals (waiver backlog, velocity spikes) still appear in the list when detected.</div>
          )}
          <div style={{height:1,background:'rgba(255,255,255,0.08)',margin:'10px 0'}}/>
          <InsightRow label="Critical" value={String(liveAlerts.filter(a=>a.severity==='critical').length)} accent="#FF3B30"/>
          <InsightRow label="High" value={String(liveAlerts.filter(a=>a.severity==='high').length)} accent="#FF8A00"/>
          <InsightRow label="Medium / Low" value={String(liveAlerts.filter(a=>a.severity==='medium'||a.severity==='low').length)}/>
        </SectionCard>
      </div>
      </div>

      {feedback && (
        <div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:'10px',background:'rgba(44,255,122,0.92)',color:'#fff',fontWeight:600,fontSize:'14px',whiteSpace:'nowrap',boxShadow:'0 12px 30px -12px rgba(0,0,0,0.6)'}}>
          {feedback}
        </div>
      )}
    </PremiumSurface>
  );
}
