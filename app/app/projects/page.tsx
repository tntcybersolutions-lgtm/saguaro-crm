'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '../../../lib/supabase-browser';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a';

interface Project {
  id: string;
  name: string;
  address: string | null;
  project_number: string | null;
  status: string;
  contract_amount: number | null;
  start_date: string | null;
  substantial_completion_date: string | null;
  project_type: string | null;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const r = await fetch('/api/projects', { headers });
        const d = await r.json();
        setProjects(d.projects ?? []);
      } catch {
        // keep empty
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = projects.filter(p =>
    (status === 'all' || p.status === status) &&
    (search === '' || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{padding:'24px 28px',maxWidth:1400,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:TEXT,margin:0}}>Projects</h1>
          <div style={{fontSize:13,color:DIM,marginTop:4}}>
            {loading ? 'Loading…' : `${filtered.length} project${filtered.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search projects..."
            style={{padding:'8px 14px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,outline:'none',width:220}}
          />
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{padding:'8px 12px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,cursor:'pointer'}}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="bidding">Bidding</option>
            <option value="pre_construction">Pre-Construction</option>
            <option value="substantial_complete">Substantial Complete</option>
          </select>
          <Link
            href="/app/projects/new"
            style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,color:'#0d1117',borderRadius:8,fontWeight:800,fontSize:13,textDecoration:'none'}}
          >
            + New Project
          </Link>
        </div>
      </div>

      {loading && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))',gap:18}}>
          {[1,2,3].map(i => (
            <div key={i} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:22,height:200,opacity:.5}} />
          ))}
        </div>
      )}

      {!loading && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))',gap:18}}>
          {filtered.map(p => {
            const statusColor = p.status === 'active'
              ? {bg:'rgba(26,138,74,.12)',c:'#3dd68c'}
              : p.status === 'bidding'
              ? {bg:'rgba(212,160,23,.12)',c:GOLD}
              : {bg:'rgba(74,93,122,.2)',c:DIM};
            const contractAmt = p.contract_amount ?? 0;
            return (
              <Link key={p.id} href={`/app/projects/${p.id}`} style={{textDecoration:'none'}}>
                <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:22,cursor:'pointer',transition:'border-color .2s'}}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = GOLD}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = BORDER}
                >
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                    <div style={{flex:1,marginRight:12}}>
                      <div style={{fontWeight:800,color:TEXT,fontSize:15,marginBottom:4}}>{p.name}</div>
                      <div style={{fontSize:12,color:DIM}}>{p.address ?? 'No address set'}</div>
                      <div style={{fontSize:11,color:'#4a5f7a',marginTop:2}}>{p.project_number ?? ''}</div>
                    </div>
                    <span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:4,background:statusColor.bg,color:statusColor.c,border:`1px solid ${statusColor.c}33`,whiteSpace:'nowrap'}}>
                      {p.status.replace(/_/g,' ').toUpperCase()}
                    </span>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                    {[
                      {l:'Contract',v: contractAmt > 0 ? '$' + contractAmt.toLocaleString() : '—'},
                      {l:'Type',v: p.project_type ? p.project_type.replace(/_/g,' ') : '—'},
                    ].map(s => (
                      <div key={s.l} style={{background:'#0d1117',borderRadius:7,padding:'10px 12px'}}>
                        <div style={{fontSize:10,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>{s.l}</div>
                        <div style={{fontSize:14,fontWeight:700,color:TEXT,textTransform:'capitalize'}}>{s.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{display:'flex',gap:16,fontSize:11,color:DIM}}>
                    <span>Start: <strong style={{color:TEXT}}>{fmtDate(p.start_date)}</strong></span>
                    <span>Sub: <strong style={{color:TEXT}}>{fmtDate(p.substantial_completion_date)}</strong></span>
                    <span style={{marginLeft:'auto',color:GOLD,fontWeight:700}}>View →</span>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Empty state */}
          {filtered.length === 0 && !loading && (
            <div style={{gridColumn:'1/-1',textAlign:'center',padding:60,color:DIM}}>
              <div style={{fontSize:40,marginBottom:12}}>📋</div>
              <div style={{fontSize:16,fontWeight:700,color:TEXT,marginBottom:8}}>No projects yet</div>
              <div style={{fontSize:13,marginBottom:20}}>Create your first project to get started</div>
              <Link href="/app/projects/new" style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,color:'#0d1117',borderRadius:8,fontWeight:800,fontSize:13,textDecoration:'none'}}>
                + Create First Project
              </Link>
            </div>
          )}

          {/* New Project Card */}
          {filtered.length > 0 && (
            <Link href="/app/projects/new" style={{textDecoration:'none'}}>
              <div style={{background:'rgba(212,160,23,.04)',border:`2px dashed rgba(212,160,23,.3)`,borderRadius:12,padding:40,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,minHeight:200}}>
                <div style={{width:48,height:48,borderRadius:12,background:'rgba(212,160,23,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>+</div>
                <div style={{fontWeight:700,color:GOLD,fontSize:15}}>Create New Project</div>
                <div style={{fontSize:12,color:DIM,textAlign:'center'}}>Start from scratch or let AI build it from a won bid</div>
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
