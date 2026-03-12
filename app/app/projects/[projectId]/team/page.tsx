'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',BLUE='#1a5fa8';
const fmt = (n:number) => '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function Badge({label,color='#94a3b8',bg='rgba(148,163,184,.12)'}:{label:string,color?:string,bg?:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color,textTransform:'uppercase' as const,letterSpacing:.3}}>{label}</span>;
}
function Card({title,children,action}:{title:string,children:React.ReactNode,action?:React.ReactNode}){
  return <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:18}}>
    <div style={{padding:'12px 18px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{fontWeight:700,fontSize:14,color:TEXT}}>{title}</span>
      {action}
    </div>
    <div style={{padding:18}}>{children}</div>
  </div>;
}
function PageHeader({title,sub,actions}:{title:string,sub?:string,actions?:React.ReactNode}){
  return <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:DARK}}>
    <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>{title}</h2>{sub&&<div style={{fontSize:12,color:DIM,marginTop:3}}>{sub}</div>}</div>
    {actions&&<div style={{display:'flex',gap:10}}>{actions}</div>}
  </div>;
}

export default function TeamPage(){
  const params = useParams();
  const projectId = params['projectId'] as string;
  const [showInvite, setShowInvite] = useState(false);
  const [members, setMembers] = useState<{name:string,role:string,email:string,access:string,last:string}[]>([]);
  const [subs, setSubs] = useState<{name:string,role:string,email:string,access:string,last:string}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}`);
        const d = await r.json();
        setMembers(d.members ?? []);
        setSubs((d.subs ?? []).map((s: any) => ({ name: s.name, role: 'Subcontractor', email: s.primary_email || s.email || '', access: 'Sub Portal', last: 'Active' })));
      } catch {
        setMembers([]);
        setSubs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  return <div>
    <PageHeader title="Team" sub="Manage project team members and access" actions={<button onClick={()=>setShowInvite(!showInvite)} style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ Invite Member</button>}/>
    {showInvite&&<div style={{margin:24,background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:10,padding:24}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:16,color:TEXT}}>Invite Team Member</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
        {[['Email',''],['Name',''],['Role','Member']].map(f=>(
          <div key={f[0]}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f[0]}</label>
            {f[0]==='Role'?<select style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,cursor:'pointer'}}>
              {['Admin','Manager','Member','Guest','Client','Sub'].map(r=><option key={r}>{r}</option>)}
            </select>:<input placeholder={f[0]} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/>}</div>
        ))}
      </div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setShowInvite(false)} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Send Invitation</button>
        <button onClick={()=>setShowInvite(false)} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:24}}>
      <Card title="Internal Team">
        <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
          <thead><tr>
            {['Name','Role','Email','Access Level','Last Active','Actions'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}
          </tr></thead>
          <tbody>{loading ? (
            <tr><td colSpan={6} style={{padding:'24px 12px',textAlign:'center',color:DIM,fontSize:13}}>Loading...</td></tr>
          ) : members.length === 0 ? (
            <tr><td colSpan={6} style={{padding:'32px 12px',textAlign:'center',color:DIM,fontSize:13}}>No team members yet. Invite someone to get started.</td></tr>
          ) : members.map(m=><tr key={m.name} style={{borderBottom:`1px solid rgba(38,51,71,.4)`}}>
            <td style={{padding:'11px 12px'}}><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:32,height:32,borderRadius:'50%',background:`linear-gradient(135deg,${GOLD},#B85C2A)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:'#0d1117'}}>{m.name[0]}</div><span style={{color:TEXT,fontWeight:600}}>{m.name}</span></div></td>
            <td style={{padding:'11px 12px',color:DIM}}>{m.role}</td>
            <td style={{padding:'11px 12px',color:DIM}}>{m.email}</td>
            <td style={{padding:'11px 12px'}}><Badge label={m.access} color={m.access==='Admin'?GOLD:m.access==='Manager'?'#4a9de8':'#94a3b8'} bg={m.access==='Admin'?'rgba(212,160,23,.12)':m.access==='Manager'?'rgba(26,95,168,.12)':'rgba(148,163,184,.08)'}/></td>
            <td style={{padding:'11px 12px',color:'#3dd68c',fontSize:12}}>{m.last}</td>
            <td style={{padding:'11px 12px'}}><button style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,padding:'3px 8px',cursor:'pointer'}}>Edit</button></td>
          </tr>)}</tbody>
        </table>
      </Card>
      <Card title="Subcontractors (Portal Access)">
        <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
          <thead><tr>
            {['Company','Contact Email','Portal Access','Actions'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}
          </tr></thead>
          <tbody>{subs.length === 0 ? (
            <tr><td colSpan={4} style={{padding:'32px 12px',textAlign:'center',color:DIM,fontSize:13}}>No subcontractors on this project yet.</td></tr>
          ) : subs.map(s=><tr key={s.name} style={{borderBottom:`1px solid rgba(38,51,71,.4)`}}>
            <td style={{padding:'11px 12px',color:TEXT,fontWeight:600}}>{s.name}</td>
            <td style={{padding:'11px 12px',color:DIM}}>{s.email}</td>
            <td style={{padding:'11px 12px'}}><Badge label="Sub Portal" color='#a78bfa' bg='rgba(167,139,250,.12)'/></td>
            <td style={{padding:'11px 12px',display:'flex',gap:6}}>
              <button style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 8px',cursor:'pointer'}}>Send Portal Link</button>
              <button style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,padding:'3px 8px',cursor:'pointer'}}>⋯</button>
            </td>
          </tr>)}</tbody>
        </table>
      </Card>
    </div>
  </div>;
}
