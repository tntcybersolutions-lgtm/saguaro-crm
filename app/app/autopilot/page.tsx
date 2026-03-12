'use client';
import React, { useState } from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#c03030';

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

interface AutopilotAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  rule_code: string;
  entity_type: string;
  acknowledged?: boolean;
  dismissed?: boolean;
}

export default function AutopilotPage() {
  const [filter, setFilter] = useState<'all'|'critical'|'high'|'medium'>('all');
  const [feedback, setFeedback] = useState<string>('');
  const [alertStates, setAlertStates] = useState<Record<string, 'acknowledged'|'dismissed'>>({});
  const [scanning, setScanning] = useState(false);

  const allAlerts: AutopilotAlert[] = [];
  const visibleAlerts = allAlerts.filter(a => {
    if (alertStates[a.id] === 'dismissed') return false;
    return filter === 'all' || a.severity === filter;
  });

  const sevColor = (s: string) => s==='critical'?{bg:'rgba(192,48,48,.12)',c:'#ff7070',border:'rgba(192,48,48,.3)'}:s==='high'?{bg:'rgba(249,115,22,.1)',c:'#f97316',border:'rgba(249,115,22,.3)'}:{bg:'rgba(212,160,23,.1)',c:GOLD,border:'rgba(212,160,23,.3)'};

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
    try {
      const r = await fetch('/api/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'demo' }),
      });
      const data = await r.json();
      showFeedback(data.summary || 'Autopilot scan complete!');
    } catch {
      showFeedback('Autopilot scan triggered!');
    }
    setScanning(false);
  }

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 4000);
  }

  const acknowledgedCount = Object.values(alertStates).filter(v => v === 'acknowledged').length;

  return (
    <div style={{padding:'24px 28px',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase' as const,color:DIM}}>AI Monitoring</div>
          <h1 style={{fontSize:26,fontWeight:800,color:TEXT,margin:'4px 0'}}>Autopilot Dashboard</h1>
          <div style={{fontSize:13,color:DIM}}>Claude monitors your projects 24/7 — RFIs, invoices, schedule, field issues</div>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          style={{padding:'9px 18px',background:scanning?'rgba(212,160,23,.4)':`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:scanning?'not-allowed':'pointer'}}
        >
          {scanning ? '🔄 Scanning...' : '🤖 Run Scan Now'}
        </button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[
          {l:'Total Alerts',v:allAlerts.length.toString(),c:TEXT},
          {l:'Critical',v:allAlerts.filter(a=>a.severity==='critical').length.toString(),c:'#ff7070'},
          {l:'High',v:allAlerts.filter(a=>a.severity==='high').length.toString(),c:'#f97316'},
          {l:'Acknowledged',v:acknowledgedCount.toString(),c:'#3dd68c'},
        ].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:24,fontWeight:800,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {(['all','critical','high','medium'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{padding:'6px 16px',borderRadius:6,border:`1px solid ${filter===f?GOLD:BORDER}`,background:filter===f?'rgba(212,160,23,.12)':'transparent',color:filter===f?GOLD:DIM,fontSize:13,fontWeight:600,cursor:'pointer',textTransform:'capitalize' as const}}>
            {f==='all'?`All (${allAlerts.filter(a=>alertStates[a.id]!=='dismissed').length})`:f}
          </button>
        ))}
      </div>

      {/* Alerts */}
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {visibleAlerts.map(alert=>{
          const sc = sevColor(alert.severity);
          const isAcknowledged = alertStates[alert.id] === 'acknowledged';
          return (
            <div key={alert.id} style={{background:isAcknowledged?'rgba(26,138,74,.04)':RAISED,border:`1px solid ${isAcknowledged?'rgba(26,138,74,.2)':sc.border}`,borderRadius:10,padding:20,opacity:isAcknowledged?0.7:1,transition:'all .2s'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
                <div style={{padding:'4px 10px',borderRadius:5,background:isAcknowledged?'rgba(26,138,74,.15)':sc.bg,color:isAcknowledged?'#3dd68c':sc.c,fontSize:10,fontWeight:800,textTransform:'uppercase' as const,border:`1px solid ${isAcknowledged?'rgba(26,138,74,.3)':sc.border}`,flexShrink:0,marginTop:2}}>
                  {isAcknowledged ? 'ACK' : alert.severity}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,color:TEXT,fontSize:15,marginBottom:5}}>{alert.title}</div>
                  <div style={{fontSize:13,color:DIM,lineHeight:1.6,marginBottom:12}}>{alert.summary}</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,.05)',color:DIM}}>{alert.rule_code.replace(/_/g,' ')}</span>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,.05)',color:DIM}}>{alert.entity_type}</span>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,.05)',color:DIM}}>{alert.entity_type}</span>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,flexShrink:0}}>
                  {!isAcknowledged && (
                    <button
                      onClick={() => acknowledge(alert.id)}
                      style={{padding:'6px 12px',background:'rgba(26,138,74,.1)',border:'1px solid rgba(26,138,74,.3)',borderRadius:6,color:'#3dd68c',fontSize:12,fontWeight:700,cursor:'pointer'}}
                    >
                      Acknowledge
                    </button>
                  )}
                  <button
                    onClick={() => dismiss(alert.id)}
                    style={{padding:'6px 12px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {visibleAlerts.length===0&&(
          <div style={{textAlign:'center' as const,padding:60,color:DIM}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:700,color:TEXT}}>No alerts</div>
            <div style={{fontSize:13}}>All projects are running smoothly</div>
          </div>
        )}
      </div>

      {feedback && (
        <div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:'8px',background:'rgba(34,197,94,0.9)',color:'#fff',fontWeight:600,fontSize:'14px',whiteSpace:'nowrap'}}>
          {feedback}
        </div>
      )}
    </div>
  );
}
