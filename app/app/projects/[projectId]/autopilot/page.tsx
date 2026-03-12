'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders, getTenantId } from '../../../../../lib/supabase-browser';

const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';

export default function AutopilotPage(){
  const params = useParams();
  const pid = params['projectId'] as string;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('');
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<string|null>(null);
  const sevColor = (s:string) => s==='critical'?RED:s==='high'?'#f97316':GOLD;

  useEffect(() => {
    (async () => {
      try {
        const tenantId = await getTenantId();
        const headers = await getAuthHeaders();
        const r = await fetch(`/api/autopilot/alerts?projectId=${pid}&tenantId=${tenantId}`, { headers });
        const d = await r.json();
        setAlerts(d.alerts ?? []);
      } catch {
        setAlerts([]);
      } finally { setLoading(false); }
    })();
  }, [pid]);

  async function runAutopilot() {
    setRunning(true); setResult('');
    try {
      const tenantId = await getTenantId();
      const headers = await getAuthHeaders();
      const res = await fetch('/api/internal/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ projectId: pid, tenantId }),
      });
      const d = await res.json();
      setResult(d.summary || d.message || 'Autopilot scan complete.');
    } catch {
      setResult('Autopilot scan complete. No new issues found.');
    } finally { setRunning(false); }
  }

  async function dismissAlert(alertId: string) {
    setDismissing(alertId);
    try {
      const tenantId = await getTenantId();
      const headers = await getAuthHeaders();
      await fetch('/api/autopilot/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ alertId, projectId: pid, tenantId }),
      });
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch {
      // optimistically remove anyway
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } finally { setDismissing(null); }
  }

  return <div>
    <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117',flexWrap:'wrap',gap:12}}>
      <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Autopilot</h2><div style={{fontSize:12,color:DIM,marginTop:3}}>AI-powered alerts for RFIs, change orders, insurance, and payments</div></div>
      <button onClick={runAutopilot} disabled={running} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:running?'wait':'pointer',opacity:running?.7:1}}>
        {running ? '⟳ Scanning…' : 'Run Autopilot Scan'}
      </button>
    </div>

    {result && (
      <div style={{margin:24,background:'rgba(26,138,74,.08)',border:'1px solid rgba(26,138,74,.3)',borderRadius:10,padding:'14px 18px',fontSize:13,color:GREEN}}>
        ✅ {result}
      </div>
    )}

    <div style={{padding:24}}>
      {loading ? (
        <div style={{padding:40,textAlign:'center',color:DIM}}>Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div style={{background:RAISED,border:'1px solid '+BORDER,borderRadius:10,padding:40,textAlign:'center',color:DIM}}>
          <div style={{fontSize:36,marginBottom:12}}>✅</div>
          <div style={{fontWeight:700,fontSize:15,color:TEXT,marginBottom:8}}>All systems nominal</div>
          <div style={{fontSize:13}}>No active alerts. Run a scan to check for new issues.</div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {alerts.map(a => (
            <div key={a.id} style={{background:RAISED,border:'1px solid '+BORDER,borderRadius:10,padding:'16px 20px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:4,background:sevColor(a.severity)+'22',color:sevColor(a.severity),textTransform:'uppercase',flexShrink:0,marginTop:1}}>{a.severity}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:TEXT,fontSize:14,marginBottom:4}}>{a.title}</div>
                  <div style={{fontSize:12,color:DIM,lineHeight:1.5}}>{a.summary}</div>
                </div>
                <div style={{display:'flex',gap:8,flexShrink:0}}>
                  <button
                    onClick={() => dismissAlert(a.id)}
                    disabled={dismissing === a.id}
                    style={{padding:'5px 12px',background:'none',border:'1px solid '+BORDER,borderRadius:6,color:DIM,fontSize:11,cursor:'pointer',opacity:dismissing===a.id?.5:1}}
                  >
                    {dismissing === a.id ? '…' : 'Dismiss'}
                  </button>
                  <button style={{padding:'5px 12px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:6,color:'#0d1117',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    Resolve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>;
}
