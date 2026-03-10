'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { DEMO_RFIS } from '../../../../../demo-data';
import { useRouter } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#c03030';
function Badge({label,color='#94a3b8',bg='rgba(148,163,184,.12)'}:{label:string,color?:string,bg?:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color,textTransform:'uppercase' as const,letterSpacing:.3}}>{label}</span>;
}
function PageHeader({title,sub,actions}:{title:string,sub?:string,actions?:React.ReactNode}){
  return <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:DARK}}>
    <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>{title}</h2>{sub&&<div style={{fontSize:12,color:DIM,marginTop:3}}>{sub}</div>}</div>
    {actions&&<div style={{display:'flex',gap:10}}>{actions}</div>}
  </div>;
}

export default function RFIsPage(){
  const params = useParams();
  const router = useRouter();
  const pid = params['projectId'] as string;
  const [showNew, setShowNew] = useState(false);
  const [replyRfi, setReplyRfi] = useState<any|null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [rfis, setRfis] = useState<any[]>(DEMO_RFIS);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({title:'',priority:'normal',assignedTo:'Sonoran Architecture Group',responseDue:'',drawingRef:'',specSection:'',description:''});
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));

  async function submitReply() {
    if (!replyRfi || !replyText.trim()) return;
    setReplying(true);
    try {
      const token = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('sb-access-token='))?.split('=')[1]||'';
      await fetch('/api/rfis/reply', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({rfiId:replyRfi.id, projectId:pid, response:replyText}),
      });
      setRfis(prev=>prev.map(r=>r.id===replyRfi.id?{...r,status:'answered',responded_at:new Date().toISOString()}:r));
      setReplyRfi(null);
      setReplyText('');
    } catch { /* ignore */ } finally { setReplying(false); }
  }

  async function submitRFI() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const token = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('sb-access-token='))?.split('=')[1]||'';
      const r = await fetch('/api/rfis/create', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({projectId:pid,title:form.title,priority:form.priority,assignedTo:form.assignedTo,responseDue:form.responseDue,drawingRef:form.drawingRef,specSection:form.specSection,description:form.description})
      });
      const d = await r.json();
      if (d.rfi) {
        setRfis(prev => [...prev, {
          id: d.rfi.id, number: d.rfi.number, title: form.title,
          status: 'open' as const, priority: form.priority as 'normal'|'high'|'urgent',
          response_due_date: form.responseDue||null, responded_at: null,
          cost_impact_amount: 0, schedule_impact_days: 0,
          created_at: new Date().toISOString().split('T')[0],
        }]);
        setForm({title:'',priority:'normal',assignedTo:'Sonoran Architecture Group',responseDue:'',drawingRef:'',specSection:'',description:''});
        setShowNew(false);
      }
    } finally { setSaving(false); }
  }

  return <div>
    <PageHeader title="RFIs" sub={`${rfis.filter(r=>r.status!=='closed').length} open · ${rfis.length} total`} actions={<button onClick={()=>setShowNew(!showNew)} style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New RFI</button>}/>
    {showNew&&<div style={{margin:24,background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:24}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:16,color:TEXT}}>New Request for Information</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        {([['Title','title','e.g. Clarify footing depth at grid A-3'],['Assigned To','assignedTo',''],['Response Due','responseDue',''],['Drawing Reference','drawingRef',''],['Spec Section','specSection','']]).map(([lbl,key,ph])=>(
          <div key={key}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{lbl}</label>
            <input value={(form as any)[key]} onChange={e=>set(key,e.target.value)} placeholder={ph} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/></div>
        ))}
        <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Priority</label>
          <select value={form.priority} onChange={e=>set('priority',e.target.value)} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,cursor:'pointer'}}>
            {['normal','high','urgent'].map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
          </select></div>
      </div>
      <div style={{marginBottom:16}}>
        <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Description / Question</label>
        <textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={4} placeholder="Describe the RFI in detail..." style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical'}}/>
      </div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={submitRFI} disabled={saving||!form.title.trim()} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer',opacity:saving||!form.title.trim()?0.6:1}}>{saving?'Submitting...':'Submit RFI'}</button>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:24}}>
      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['RFI #','Title','Status','Priority','Assigned To','Due Date','Cost Impact','Schedule Impact','Actions'].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{rfis.map(r=>(
          <tr key={r.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`,cursor:'pointer'}}>
            <td style={{padding:'12px 14px',color:GOLD,fontWeight:700}}>{r.number}</td>
            <td style={{padding:'12px 14px',color:TEXT,maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.title}</td>
            <td style={{padding:'12px 14px'}}><Badge label={r.status.replace('_',' ')} color={r.status==='open'?GOLD:r.status==='answered'?'#3dd68c':'#4a9de8'} bg={r.status==='open'?'rgba(212,160,23,.12)':r.status==='answered'?'rgba(26,138,74,.12)':'rgba(26,95,168,.12)'}/></td>
            <td style={{padding:'12px 14px'}}><Badge label={r.priority} color={r.priority==='urgent'?RED:r.priority==='high'?'#f97316':DIM}/></td>
            <td style={{padding:'12px 14px',color:DIM}}>Sonoran Architecture</td>
            <td style={{padding:'12px 14px',color:r.response_due_date&&new Date(r.response_due_date)<new Date()?RED:DIM}}>{r.response_due_date||'—'}</td>
            <td style={{padding:'12px 14px',color:r.cost_impact_amount&&r.cost_impact_amount>0?'#f97316':DIM}}>{r.cost_impact_amount&&r.cost_impact_amount>0?'$'+r.cost_impact_amount.toLocaleString():'—'}</td>
            <td style={{padding:'12px 14px',color:r.schedule_impact_days&&r.schedule_impact_days>0?'#f97316':DIM}}>{r.schedule_impact_days&&r.schedule_impact_days>0?r.schedule_impact_days+' days':'—'}</td>
            <td style={{padding:'12px 14px'}}>
              <div style={{display:'flex',gap:6}}>
                <button
                  onClick={()=>router.push(`/app/projects/${pid}/rfis?view=${r.id}`)}
                  style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 8px',cursor:'pointer'}}
                >View</button>
                {r.status==='open'&&<button
                  onClick={()=>{setReplyRfi(r);setReplyText('');}}
                  style={{background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:5,color:'#0d1117',fontSize:11,padding:'4px 10px',fontWeight:700,cursor:'pointer'}}
                >Reply</button>}
              </div>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>

    {/* Reply Modal */}
    {replyRfi&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:24,width:500,maxWidth:'95vw',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:16,color:TEXT}}>Reply to RFI {replyRfi.number}</div>
          <button onClick={()=>setReplyRfi(null)} style={{background:'none',border:'none',color:DIM,fontSize:20,cursor:'pointer',lineHeight:1}}>×</button>
        </div>
        <div style={{fontSize:13,color:DIM,marginBottom:16,padding:'10px 14px',background:'#0d1117',borderRadius:7,border:`1px solid ${BORDER}`}}>{replyRfi.title}</div>
        <div style={{marginBottom:16}}>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>Response</label>
          <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} rows={5} placeholder="Type your response…" style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical',boxSizing:'border-box' as const}}/>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={submitReply} disabled={replying||!replyText.trim()} style={{flex:1,padding:'9px 18px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer',opacity:replying||!replyText.trim()?0.6:1}}>{replying?'Sending…':'Send Reply'}</button>
          <button onClick={()=>setReplyRfi(null)} style={{padding:'9px 16px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
        </div>
      </div>
    </div>}
  </div>;
}
