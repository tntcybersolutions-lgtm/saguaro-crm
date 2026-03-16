'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',AMBER='#d97706';

function ScoreBar({score}:{score:number}){
  const color = score>=80?GREEN:score>=50?AMBER:RED;
  return <div style={{display:'flex',alignItems:'center',gap:8}}>
    <div style={{flex:1,height:6,background:'rgba(38,51,71,.6)',borderRadius:3,overflow:'hidden'}}>
      <div style={{height:'100%',background:color,width:score+'%',borderRadius:3}}/>
    </div>
    <span style={{fontSize:12,fontWeight:700,color,minWidth:30}}>{score}</span>
  </div>;
}

function Badge({label,color,bg}:{label:string,color:string,bg:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color,textTransform:'uppercase',letterSpacing:.3}}>{label}</span>;
}

function StatusDot({ok,warn,label}:{ok?:boolean,warn?:boolean,label:string}){
  const color = ok?GREEN:warn?AMBER:RED;
  return <div style={{display:'flex',alignItems:'center',gap:5,fontSize:12}}>
    <div style={{width:7,height:7,borderRadius:'50%',background:color,flexShrink:0}}/>
    <span style={{color}}>{label}</span>
  </div>;
}

export default function CompliancePage(){
  const [subs, setSubs] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState<'all'|'compliant'|'at_risk'|'non_compliant'>('all');
  const [search, setSearch] = useState('');

  useEffect(()=>{
    fetch('/api/compliance')
      .then(r=>r.json())
      .then(d=>{ setSubs(d.subs||[]); setSummary(d.summary||null); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[]);

  const filtered = subs.filter(s=>{
    if(filter!=='all'&&s.compliance!==filter) return false;
    if(search&&!s.name.toLowerCase().includes(search.toLowerCase())&&!s.trade?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const complianceLabel = (c:string) => c==='compliant'?'Compliant':c==='at_risk'?'At Risk':'Non-Compliant';
  const complianceColor = (c:string) => c==='compliant'?GREEN:c==='at_risk'?AMBER:RED;
  const complianceBg = (c:string) => c==='compliant'?'rgba(26,138,74,.12)':c==='at_risk'?'rgba(217,119,6,.12)':'rgba(192,48,48,.12)';

  return <div style={{background:DARK,minHeight:'100vh',color:TEXT,fontFamily:'system-ui,sans-serif'}}>
    <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:DARK}}>
      <div>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Subcontractor Compliance</h2>
        <div style={{fontSize:12,color:DIM,marginTop:3}}>W-9, insurance, and lien waiver scorecard</div>
      </div>
    </div>

    {summary&&<div style={{padding:'16px 24px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,borderBottom:`1px solid ${BORDER}`}}>
      {[
        {label:'Avg Compliance Score',value:summary.avg_score+'%',color:summary.avg_score>=80?GREEN:summary.avg_score>=50?AMBER:RED},
        {label:'Compliant',value:summary.compliant,color:GREEN},
        {label:'At Risk',value:summary.at_risk,color:AMBER},
        {label:'Non-Compliant',value:summary.non_compliant,color:RED},
      ].map(k=>(
        <div key={k.label} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'14px 18px'}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1,color:DIM,marginBottom:6}}>{k.label}</div>
          <div style={{fontSize:24,fontWeight:800,color:k.color}}>{k.value}</div>
        </div>
      ))}
    </div>}

    <div style={{padding:'14px 24px',display:'flex',gap:10,alignItems:'center',borderBottom:`1px solid ${BORDER}`}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search subcontractors..." style={{padding:'8px 14px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:240}}/>
      <div style={{display:'flex',gap:6}}>
        {(['all','compliant','at_risk','non_compliant'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{padding:'6px 14px',background:filter===f?'rgba(212,160,23,.15)':RAISED,border:`1px solid ${filter===f?'rgba(212,160,23,.4)':BORDER}`,borderRadius:7,color:filter===f?GOLD:DIM,fontSize:12,fontWeight:700,cursor:'pointer',textTransform:'capitalize'}}>
            {f==='all'?'All':f.replace('_',' ')}
          </button>
        ))}
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:selected?'1fr 340px':'1fr',transition:'grid-template-columns .2s'}}>
      <div style={{padding:24}}>
        {loading?<div style={{textAlign:'center',padding:40,color:DIM}}>Loading compliance data...</div>
        :filtered.length===0?<div style={{textAlign:'center',padding:40,color:DIM}}>No subcontractors found.</div>
        :<div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'rgba(0,0,0,.3)'}}>
              {['Subcontractor','Trade','Score','W-9','Insurance','Lien Waivers','Status',''].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',color:DIM,borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtered.map(sub=>(
              <tr key={sub.id} onClick={()=>setSelected(selected?.id===sub.id?null:sub)} style={{borderBottom:`1px solid rgba(38,51,71,.4)`,cursor:'pointer',background:selected?.id===sub.id?'rgba(212,160,23,.04)':'transparent'}}>
                <td style={{padding:'11px 14px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:30,height:30,borderRadius:'50%',background:'rgba(212,160,23,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:GOLD,flexShrink:0}}>{sub.name?.[0]||'?'}</div>
                    <div>
                      <div style={{fontWeight:600,color:TEXT}}>{sub.name}</div>
                      {sub.email&&<div style={{fontSize:11,color:DIM}}>{sub.email}</div>}
                    </div>
                  </div>
                </td>
                <td style={{padding:'11px 14px',color:DIM}}>{sub.trade||'—'}</td>
                <td style={{padding:'11px 14px',minWidth:120}}><ScoreBar score={sub.score}/></td>
                <td style={{padding:'11px 14px'}}>
                  <Badge label={sub.w9.status==='submitted'||sub.w9.status==='approved'?'On File':sub.w9.status==='pending'?'Pending':'Missing'}
                    color={sub.w9.status==='submitted'||sub.w9.status==='approved'?GREEN:sub.w9.status==='pending'?AMBER:RED}
                    bg={sub.w9.status==='submitted'||sub.w9.status==='approved'?'rgba(26,138,74,.12)':sub.w9.status==='pending'?'rgba(217,119,6,.12)':'rgba(192,48,48,.12)'}/>
                </td>
                <td style={{padding:'11px 14px'}}>
                  {sub.insurance.active_certs===0
                    ?<Badge label="None on File" color={RED} bg='rgba(192,48,48,.12)'/>
                    :sub.insurance.expiring_certs>0
                    ?<Badge label={`${sub.insurance.expiring_certs} Expiring`} color={AMBER} bg='rgba(217,119,6,.12)'/>
                    :<Badge label={`${sub.insurance.active_certs} Active`} color={GREEN} bg='rgba(26,138,74,.12)'/>
                  }
                </td>
                <td style={{padding:'11px 14px',color:DIM,fontSize:12}}>
                  {sub.lien_waivers.total===0?'—':`${sub.lien_waivers.signed}/${sub.lien_waivers.total} signed`}
                </td>
                <td style={{padding:'11px 14px'}}>
                  <Badge label={complianceLabel(sub.compliance)} color={complianceColor(sub.compliance)} bg={complianceBg(sub.compliance)}/>
                </td>
                <td style={{padding:'11px 14px'}}>
                  <button onClick={e=>{e.stopPropagation();setSelected(selected?.id===sub.id?null:sub);}} style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,padding:'3px 8px',cursor:'pointer'}}>Details</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </div>

      {selected&&<div style={{borderLeft:`1px solid ${BORDER}`,padding:24,background:'rgba(31,44,62,.4)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,color:TEXT}}>{selected.name}</div>
          <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',color:DIM,fontSize:18,cursor:'pointer',lineHeight:1}}>×</button>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1,color:DIM,marginBottom:6}}>Compliance Score</div>
          <ScoreBar score={selected.score}/>
          <div style={{marginTop:6}}><Badge label={complianceLabel(selected.compliance)} color={complianceColor(selected.compliance)} bg={complianceBg(selected.compliance)}/></div>
        </div>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:GOLD,marginBottom:10}}>W-9 Status</div>
          <StatusDot ok={selected.w9.status==='submitted'||selected.w9.status==='approved'} warn={selected.w9.status==='pending'} label={selected.w9.status==='submitted'||selected.w9.status==='approved'?'W-9 on file':selected.w9.status==='pending'?'W-9 requested — awaiting return':'W-9 not on file'}/>
          <div style={{fontSize:11,color:DIM,marginTop:6}}>Score contribution: {selected.w9.score}/25 pts</div>
        </div>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:GOLD,marginBottom:10}}>Insurance</div>
          <StatusDot ok={selected.insurance.has_gl} label={selected.insurance.has_gl?'General Liability — Active':'General Liability — Missing'}/>
          <div style={{marginTop:6}}><StatusDot ok={selected.insurance.has_wc} label={selected.insurance.has_wc?'Workers Comp — Active':'Workers Comp — Missing'}/></div>
          {selected.insurance.expiring_certs>0&&<div style={{marginTop:6,fontSize:12,color:AMBER}}>{selected.insurance.expiring_certs} cert(s) expiring within 30 days</div>}
          <div style={{fontSize:11,color:DIM,marginTop:6}}>Score contribution: {selected.insurance.score}/40 pts</div>
        </div>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:GOLD,marginBottom:10}}>Lien Waivers</div>
          {selected.lien_waivers.total===0
            ?<div style={{fontSize:13,color:DIM}}>No lien waivers on record</div>
            :<div>
              <StatusDot ok={selected.lien_waivers.pending===0} warn={selected.lien_waivers.pending>0&&selected.lien_waivers.signed>0} label={`${selected.lien_waivers.signed} of ${selected.lien_waivers.total} signed`}/>
              {selected.lien_waivers.pending>0&&<div style={{fontSize:12,color:AMBER,marginTop:4}}>{selected.lien_waivers.pending} waiver(s) pending signature</div>}
            </div>}
          <div style={{fontSize:11,color:DIM,marginTop:6}}>Score contribution: {selected.lien_waivers.score}/35 pts</div>
        </div>
        <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
          {selected.email&&<a href={`mailto:${selected.email}?subject=Compliance%20Follow-Up`} style={{padding:'9px 0',background:'rgba(212,160,23,.1)',border:'1px solid rgba(212,160,23,.3)',borderRadius:7,color:GOLD,fontSize:13,fontWeight:700,textDecoration:'none',textAlign:'center' as const}}>Email Sub</a>}
          {selected.project_id&&<Link href={`/app/projects/${selected.project_id}/team`} style={{padding:'9px 0',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,textDecoration:'none',textAlign:'center' as const}}>View Project Team</Link>}
        </div>
      </div>}
    </div>
  </div>;
}
