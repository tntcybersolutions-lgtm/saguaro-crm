'use client';
import React, { useState } from 'react';
import { DEMO_AUTOPILOT_ALERTS, DEMO_PROJECT } from '../../../demo-data';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#c03030';

export default function AutopilotPage() {
  const [filter, setFilter] = useState<'all'|'critical'|'high'|'medium'>('all');
  const alerts = DEMO_AUTOPILOT_ALERTS.filter(a => filter === 'all' || a.severity === filter);

  const sevColor = (s: string) => s==='critical'?{bg:'rgba(192,48,48,.12)',c:'#ff7070',border:'rgba(192,48,48,.3)'}:s==='high'?{bg:'rgba(249,115,22,.1)',c:'#f97316',border:'rgba(249,115,22,.3)'}:{bg:'rgba(212,160,23,.1)',c:GOLD,border:'rgba(212,160,23,.3)'};

  return (
    <div style={{padding:'24px 28px',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase' as const,color:DIM}}>AI Monitoring</div>
          <h1 style={{fontSize:26,fontWeight:800,color:TEXT,margin:'4px 0'}}>Autopilot Dashboard</h1>
          <div style={{fontSize:13,color:DIM}}>Claude monitors your projects 24/7 — RFIs, invoices, schedule, field issues</div>
        </div>
        <button onClick={async()=>{const token=document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('sb-access-token='))?.split('=')[1]||'';const r=await fetch('/api/internal/autopilot/run',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({tenantId:'demo'})});alert('Autopilot scan triggered!');}} style={{padding:'9px 18px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
          🤖 Run Scan Now
        </button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Alerts',v:DEMO_AUTOPILOT_ALERTS.length.toString(),c:TEXT},{l:'Critical',v:DEMO_AUTOPILOT_ALERTS.filter(a=>a.severity==='critical').length.toString(),c:'#ff7070'},{l:'High',v:DEMO_AUTOPILOT_ALERTS.filter(a=>a.severity==='high').length.toString(),c:'#f97316'},{l:'Last Scan',v:'2 min ago',c:'#3dd68c'}].map(k=>(
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
            {f==='all'?`All (${DEMO_AUTOPILOT_ALERTS.length})`:f}
          </button>
        ))}
      </div>

      {/* Alerts */}
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {alerts.map(alert=>{
          const sc = sevColor(alert.severity);
          return (
            <div key={alert.id} style={{background:RAISED,border:`1px solid ${sc.border}`,borderRadius:10,padding:20}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
                <div style={{padding:'4px 10px',borderRadius:5,background:sc.bg,color:sc.c,fontSize:10,fontWeight:800,textTransform:'uppercase' as const,border:`1px solid ${sc.border}`,flexShrink:0,marginTop:2}}>
                  {alert.severity}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,color:TEXT,fontSize:15,marginBottom:5}}>{alert.title}</div>
                  <div style={{fontSize:13,color:DIM,lineHeight:1.6,marginBottom:12}}>{alert.summary}</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,.05)',color:DIM}}>{alert.rule_code.replace(/_/g,' ')}</span>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,.05)',color:DIM}}>{alert.entity_type}</span>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,.05)',color:DIM}}>{DEMO_PROJECT.name}</span>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,flexShrink:0}}>
                  <button style={{padding:'6px 12px',background:'rgba(26,138,74,.1)',border:'1px solid rgba(26,138,74,.3)',borderRadius:6,color:'#3dd68c',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Acknowledge
                  </button>
                  <button style={{padding:'6px 12px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {alerts.length===0&&<div style={{textAlign:'center' as const,padding:60,color:DIM}}>
          <div style={{fontSize:40,marginBottom:12}}>✅</div>
          <div style={{fontSize:18,fontWeight:700,color:TEXT}}>No alerts</div>
          <div style={{fontSize:13}}>All projects are running smoothly</div>
        </div>}
      </div>
    </div>
  );
}
