'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
const GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

function statusStyle(s:string):{bg:string,c:string}{
  if(s==='active')    return {bg:'rgba(26,138,74,.14)',c:'#3dd68c'};
  if(s==='bidding')   return {bg:'rgba(212,160,23,.14)',c:GOLD};
  if(s==='planning')  return {bg:'rgba(184,92,42,.14)',c:ORANGE};
  if(s==='closed'||s==='complete') return {bg:'rgba(74,93,122,.2)',c:DIM};
  return {bg:'rgba(74,93,122,.2)',c:DIM};
}

export default function ProjectsPage() {
  const [projects,setProjects]  = useState<any[]>([]);
  const [loading,setLoading]    = useState(true);
  const [error,setError]        = useState('');
  const [search,setSearch]      = useState('');
  const [statusFilter,setStatusFilter] = useState('all');

  useEffect(()=>{
    (async()=>{
      try{
        const r = await fetch('/api/projects/list');
        if(!r.ok) throw new Error(await r.text());
        const d = await r.json();
        setProjects(d.projects ?? []);
      }catch(e:any){
        setError(e.message||'Failed to load projects');
      }finally{
        setLoading(false);
      }
    })();
  },[]);

  const filtered = projects.filter(p=>{
    const matchStatus = statusFilter==='all'||p.status===statusFilter;
    const matchSearch = !search||p.name?.toLowerCase().includes(search.toLowerCase())||p.address?.toLowerCase().includes(search.toLowerCase());
    return matchStatus&&matchSearch;
  });

  return (
    <div style={{padding:'28px 32px',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28,flexWrap:'wrap',gap:14}}>
        <div>
          <h1 style={{margin:0,fontSize:28,fontWeight:800,color:TEXT}}>Projects</h1>
          <div style={{fontSize:13,color:DIM,marginTop:5}}>
            {loading ? 'Loading…' : `${filtered.length} project${filtered.length!==1?'s':''}`}
          </div>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{padding:'9px 14px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,outline:'none',width:220}}
          />
          <select
            value={statusFilter}
            onChange={e=>setStatusFilter(e.target.value)}
            style={{padding:'9px 12px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,cursor:'pointer'}}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="bidding">Bidding</option>
            <option value="complete">Complete</option>
            <option value="closed">Closed</option>
          </select>
          <Link
            href="/app/projects/new"
            style={{padding:'9px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,color:'#0d1117',borderRadius:8,fontWeight:800,fontSize:13,textDecoration:'none'}}
          >
            + New Project
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:18}}>
          {[1,2,3,4].map(i=>(
            <div key={i} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:22,height:190,opacity:.4,animation:'pulse 1.5s ease-in-out infinite'}}>
              <div style={{height:16,background:BORDER,borderRadius:4,marginBottom:10,width:'60%'}}/>
              <div style={{height:12,background:BORDER,borderRadius:4,marginBottom:18,width:'40%'}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{height:52,background:DARK,borderRadius:7}}/>
                <div style={{height:52,background:DARK,borderRadius:7}}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length===0 && (
        <div style={{textAlign:'center',padding:'80px 24px'}}>
          <div style={{fontSize:52,marginBottom:16}}>📋</div>
          <div style={{fontSize:20,fontWeight:800,color:TEXT,marginBottom:10}}>
            {projects.length===0 ? 'No projects yet' : 'No projects match your filters'}
          </div>
          <div style={{fontSize:14,color:DIM,marginBottom:28}}>
            {projects.length===0 ? 'Create your first project to get started tracking your construction work.' : 'Try adjusting your search or status filter.'}
          </div>
          {projects.length===0 && (
            <Link
              href="/app/projects/new"
              style={{padding:'12px 28px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,color:'#0d1117',borderRadius:8,fontWeight:800,fontSize:14,textDecoration:'none'}}
            >
              + Create Your First Project
            </Link>
          )}
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length>0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:18}}>
          {filtered.map((p:any)=>{
            const st = statusStyle(p.status||'');
            const contract = Number(p.contract_amount||0);
            return (
              <div key={p.id}
                style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:22,transition:'border-color .2s,box-shadow .2s',cursor:'pointer'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=GOLD;(e.currentTarget as HTMLElement).style.boxShadow='0 4px 24px rgba(212,160,23,.12)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=BORDER;(e.currentTarget as HTMLElement).style.boxShadow='none'}}
              >
                {/* Name + badge */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <div style={{flex:1,marginRight:12}}>
                    <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:4}}>{p.name}</div>
                    <div style={{fontSize:12,color:DIM}}>{p.address||'No address set'}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:4,background:st.bg,color:st.c,border:`1px solid ${st.c}33`,whiteSpace:'nowrap' as const}}>
                    {(p.status||'unknown').replace(/_/g,' ').toUpperCase()}
                  </span>
                </div>

                {/* Stats */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                  <div style={{background:DARK,borderRadius:7,padding:'10px 12px'}}>
                    <div style={{fontSize:10,color:DIM,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:3}}>Contract Value</div>
                    <div style={{fontSize:15,fontWeight:800,color:contract>0?GOLD:DIM}}>{contract>0?fmt(contract):'—'}</div>
                  </div>
                  <div style={{background:DARK,borderRadius:7,padding:'10px 12px'}}>
                    <div style={{fontSize:10,color:DIM,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:3}}>Type</div>
                    <div style={{fontSize:14,fontWeight:700,color:TEXT,textTransform:'capitalize' as const}}>{(p.project_type||'—').replace(/_/g,' ')}</div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:11,color:DIM}}>
                    {p.start_date ? new Date(p.start_date).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : 'No start date'}
                  </span>
                  <Link
                    href={`/app/projects/${p.id}`}
                    style={{fontSize:12,fontWeight:700,color:GOLD,textDecoration:'none',padding:'5px 14px',border:`1px solid rgba(212,160,23,.3)`,borderRadius:6,background:'rgba(212,160,23,.06)'}}
                  >
                    View Project →
                  </Link>
                </div>
              </div>
            );
          })}

          {/* New Project Card */}
          <Link href="/app/projects/new" style={{textDecoration:'none'}}>
            <div style={{background:'rgba(212,160,23,.04)',border:`2px dashed rgba(212,160,23,.3)`,borderRadius:12,padding:40,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,minHeight:190,transition:'background .2s'}}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(212,160,23,.08)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='rgba(212,160,23,.04)'}
            >
              <div style={{width:50,height:50,borderRadius:12,background:'rgba(212,160,23,.14)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,fontWeight:800,color:GOLD}}>+</div>
              <div style={{fontWeight:800,color:GOLD,fontSize:15}}>New Project</div>
              <div style={{fontSize:12,color:DIM,textAlign:'center' as const}}>Start from scratch or import from a won bid</div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
