'use client';
import React, { useState, useEffect } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { FolderOpen, MagnifyingGlass, Plus, ArrowRight, Sparkle, WarningCircle } from '@phosphor-icons/react';
import { colors } from '../../../lib/design-tokens';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, goldButtonStyle } from '@/components/ui/premium';
import { accentForProject, projectMonogram } from '@/lib/project-identity';

// Reconciled to the design-token ramp (no more bluish slab literals).
const GOLD=colors.gold,DIM=colors.textMuted,TEXT=colors.text;
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

function statusStyle(s:string):{bg:string,c:string}{
  if(s==='active')    return {bg:'rgba(34,197,94,.14)',c:colors.green};
  if(s==='bidding')   return {bg:'rgba(245, 158, 11,.16)',c:GOLD};
  if(s==='planning'||s==='preconstruction'||s==='precon')  return {bg:'rgba(203,166,90,.14)',c:'#CBA65A'};
  if(s==='closed'||s==='complete') return {bg:'rgba(255,255,255,.06)',c:colors.textDim};
  return {bg:'rgba(255,255,255,.06)',c:colors.textDim};
}

// Premium surfaces reused across this screen ---------------------------------
const PANEL = 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))';
const PANEL_BORDER = 'rgba(255,255,255,0.08)';
const PANEL_SHADOW = '0 20px 50px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)';
const SUNKEN = 'rgba(0,0,0,0.22)';
const SUNKEN_BORDER = 'rgba(255,255,255,0.05)';

const inputStyle: React.CSSProperties = {
  padding:'10px 14px 10px 36px', background:'rgba(255,255,255,0.04)', border:`1px solid ${PANEL_BORDER}`,
  borderRadius:12, color:TEXT, fontSize:13, outline:'none', width:230,
};
const selectStyle: React.CSSProperties = {
  padding:'10px 14px', background:'rgba(255,255,255,0.04)', border:`1px solid ${PANEL_BORDER}`,
  borderRadius:12, color:TEXT, fontSize:13, cursor:'pointer', outline:'none',
};

export default function ProjectsPage() {
  // W-4: the same SWR key the dashboard fills — revisits paint from cache
  // instead of re-showing skeletons on every visit.
  const { projects, loading, error: loadError } = useProjects();
  const error = loadError ? humanError(loadError, 'Failed to load projects. Please try again.') : '';
  const [search,setSearch]      = useState('');
  const [statusFilter,setStatusFilter] = useState('all');
  const [view,setView] = useState<'cards'|'table'>('cards');
  const [sort,setSort] = useState<'name'|'status'|'contract'|'start'>('name');

  useEffect(()=>{ try{ const v=localStorage.getItem('sag_projects_view'); if(v==='table'||v==='cards') setView(v); }catch{} },[]);
  const setViewPersist = (v:'cards'|'table')=>{ setView(v); try{ localStorage.setItem('sag_projects_view',v); }catch{} };

  const filtered = projects.filter(p=>{
    const matchStatus = statusFilter==='all'||p.status===statusFilter;
    const matchSearch = !search||p.name?.toLowerCase().includes(search.toLowerCase())||p.address?.toLowerCase().includes(search.toLowerCase());
    return matchStatus&&matchSearch;
  }).sort((a,b)=>{
    if(sort==='contract') return Number(b.contract_amount||0)-Number(a.contract_amount||0);
    if(sort==='status')   return String(a.status||'').localeCompare(String(b.status||''));
    if(sort==='start')    return new Date(b.start_date||0).getTime()-new Date(a.start_date||0).getTime();
    return String(a.name||'').localeCompare(String(b.name||''));
  });

  /* Controls appear when there is something to control. Under five projects a
     GC reads the list; the sort, the search, the status filter and the view
     toggle are all noise at that size, and at zero they are a wall in front of
     an empty page. */
  const needsControls = !loading && projects.length >= 5;

  const toggleBtn = (v:'cards'|'table', label:string)=>(
    <button onClick={()=>setViewPersist(v)} style={{padding:'8px 12px',fontSize:12,fontWeight:700,cursor:'pointer',border:'none',background:view===v?'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))':'transparent',color:view===v?colors.dark:DIM,borderRadius:8,boxShadow:view===v?'inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 6px var(--brand-primary-25)':'none'}}>{label}</button>
  );

  return (
    <PremiumSurface maxWidth={1600}>
      {/* Header */}
      <ModuleHero
        eyebrow="Portfolio"
        eyebrowIcon={<Sparkle size={13} weight="fill" />}
        title="Your"
        accent="Projects"
        subtitle={loading ? 'Loading your projects…' : `${filtered.length} project${filtered.length!==1?'s':''} across your portfolio.`}
        actions={<>
          {needsControls && <>
          <div style={{display:'inline-flex',padding:3,background:'rgba(255,255,255,0.04)',border:`1px solid ${PANEL_BORDER}`,borderRadius:10}}>
            {toggleBtn('cards','Cards')}{toggleBtn('table','Table')}
          </div>
          <select value={sort} onChange={e=>setSort(e.target.value as any)} style={selectStyle} title="Sort">
            <option value="name">Sort: Name</option>
            <option value="status">Sort: Status</option>
            <option value="contract">Sort: Contract</option>
            <option value="start">Sort: Start date</option>
          </select>
          <div style={{position:'relative',display:'flex',alignItems:'center'}}>
            <MagnifyingGlass size={15} weight="bold" color={colors.textDim} style={{position:'absolute',left:13,pointerEvents:'none'}}/>
            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Search projects…"
              style={inputStyle}
              onFocus={e=>{e.currentTarget.style.borderColor='rgba(245,158,11,0.55)';e.currentTarget.style.boxShadow='0 0 0 3px rgba(245,158,11,.12)'}}
              onBlur={e=>{e.currentTarget.style.borderColor=PANEL_BORDER;e.currentTarget.style.boxShadow='none'}}
            />
          </div>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="bidding">Bidding</option>
            <option value="complete">Complete</option>
            <option value="closed">Closed</option>
          </select>
          </>}
          <Link href="/app/projects/new" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold"/> New Project</Link>
        </>}
      />

      {/* Portfolio at a glance — counts the page already fetched */}
      {!error && needsControls && (()=>{
        const active = projects.filter((p:any)=>p.status==='active').length;
        const bidding = projects.filter((p:any)=>p.status==='bidding').length;
        const complete = projects.filter((p:any)=>p.status==='complete'||p.status==='closed').length;
        const totalContract = projects.reduce((s:number,p:any)=>s+(Number(p.contract_amount)||0),0);
        return (
          <StatStrip items={[
            { label:'Projects', value:String(projects.length), sub:'in your portfolio' },
            { label:'Active', value:String(active), accent:active>0?colors.green:undefined, sub:'under construction' },
            { label:'Bidding', value:String(bidding), accent:bidding>0?GOLD:undefined, sub:'in pursuit' },
            { label:'Complete / Closed', value:String(complete), sub:'delivered jobs' },
            { label:'Portfolio Value', value:totalContract>0?fmt(totalContract):'—', accent:totalContract>0?GOLD:undefined, sub:'combined contracts' },
          ]} />
        );
      })()}

      {/* Error */}
      {error && (
        <div style={{marginBottom:20}}>
          <SectionCard flat>
            <PremiumEmpty
              tone="error"
              icon={<WarningCircle size={30} weight="duotone" color={colors.red} />}
              title="Couldn't load projects"
              description={error}
              compact
            />
          </SectionCard>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:18}}>
          {[1,2,3,4].map(i=>(
            <div key={i} className="pmSkeleton" style={{background:PANEL,border:`1px solid ${PANEL_BORDER}`,borderRadius:16,padding:22,height:200}}>
              <div style={{height:16,background:'rgba(255,255,255,0.08)',borderRadius:6,marginBottom:10,width:'60%'}}/>
              <div style={{height:12,background:'rgba(255,255,255,0.06)',borderRadius:6,marginBottom:18,width:'40%'}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{height:56,background:SUNKEN,border:`1px solid ${SUNKEN_BORDER}`,borderRadius:12}}/>
                <div style={{height:56,background:SUNKEN,border:`1px solid ${SUNKEN_BORDER}`,borderRadius:12}}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length===0 && (
        <SectionCard>
          <PremiumEmpty
            icon={projects.length===0 ? <FolderOpen size={32} weight="duotone" color={GOLD}/> : <MagnifyingGlass size={30} weight="bold" color={colors.textDim}/>}
            title={projects.length===0 ? 'No projects yet' : 'No projects match your filters'}
            description={projects.length===0 ? 'Create your first project to get started tracking your construction work.' : 'Try adjusting your search or status filter.'}
            action={projects.length===0 ? <Link href="/app/projects/new" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold"/> Create Your First Project</Link> : undefined}
          />
        </SectionCard>
      )}

      <style>{`.pmRow:hover{background:rgba(255,255,255,0.035)}`}</style>

      {/* Cards view — the WHOLE card is the link (no more tiny target) */}
      {!loading && filtered.length>0 && view==='cards' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16}}>
          {filtered.map((p:any)=>{
            const st = statusStyle(p.status||'');
            const contract = Number(p.contract_amount||0);
            const acc = accentForProject(p.id);
            return (
              <Link key={p.id} data-tour="project-card" href={`/app/projects/${p.id}`} className="pmHover"
                style={{textDecoration:'none',position:'relative',overflow:'hidden',background:PANEL,border:`1px solid ${PANEL_BORDER}`,borderRadius:16,padding:18,boxShadow:PANEL_SHADOW,display:'block'}}
              >
                <div aria-hidden style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:`linear-gradient(180deg, ${acc.hex}, transparent)`,opacity:0.85}}/>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,gap:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                    {/* Project identity chip — curated accent, deterministic per project */}
                    <div aria-hidden style={{width:34,height:34,borderRadius:10,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:acc.soft,border:`1px solid ${acc.ring}`,color:acc.hex,fontSize:12.5,fontWeight:900,letterSpacing:'0.03em'}}>
                      {projectMonogram(p.name)}
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:16,color:acc.hex,marginBottom:3,lineHeight:1.3,letterSpacing:'-0.01em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{p.name}</div>
                      <div style={{fontSize:12,color:DIM,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{p.address||'No address set'}</div>
                    </div>
                  </div>
                  <span style={{fontSize:9.5,fontWeight:800,letterSpacing:.5,padding:'4px 10px',borderRadius:999,background:st.bg,color:st.c,whiteSpace:'nowrap' as const,border:'1px solid rgba(255,255,255,0.10)',flexShrink:0}}>{(p.status||'unknown').replace(/_/g,' ').toUpperCase()}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                  <div style={{background:SUNKEN,border:`1px solid ${SUNKEN_BORDER}`,borderRadius:10,padding:'9px 11px'}}>
                    <div style={{fontSize:9.5,color:colors.textDim,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.6,marginBottom:4}}>Contract</div>
                    <div style={{fontSize:15,fontWeight:800,color:contract>0?GOLD:colors.textDim,letterSpacing:'-0.01em'}}>{contract>0?fmt(contract):'—'}</div>
                  </div>
                  <div style={{background:SUNKEN,border:`1px solid ${SUNKEN_BORDER}`,borderRadius:10,padding:'9px 11px'}}>
                    <div style={{fontSize:9.5,color:colors.textDim,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.6,marginBottom:4}}>Type</div>
                    <div style={{fontSize:13,fontWeight:700,color:TEXT,textTransform:'capitalize' as const,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{(p.project_type||'—').replace(/_/g,' ')}</div>
                  </div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:11,color:colors.textDim}}>{p.start_date ? new Date(p.start_date).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : 'No start date'}</span>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,fontWeight:700,color:GOLD}}>Open <ArrowRight size={13} weight="bold"/></span>
                </div>
              </Link>
            );
          })}
          <Link href="/app/projects/new" className="pmHover" style={{textDecoration:'none',background:'rgba(245, 158, 11,.04)',border:'1px dashed rgba(245, 158, 11,.32)',borderRadius:16,padding:24,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,minHeight:'100%'}}>
            <div style={{width:44,height:44,borderRadius:14,background:'linear-gradient(150deg, rgba(245,158,11,0.18), rgba(245,158,11,0.05))',border:'1px solid rgba(245,158,11,0.3)',display:'flex',alignItems:'center',justifyContent:'center',color:GOLD}}><Plus size={22} weight="bold"/></div>
            <div style={{fontWeight:800,color:GOLD,fontSize:14.5}}>New Project</div>
          </Link>
        </div>
      )}

      {/* Table view — dense, professional, whole-row clickable */}
      {!loading && filtered.length>0 && view==='table' && (
        <SectionCard>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{textAlign:'left',color:colors.textDim,fontSize:11,textTransform:'uppercase' as const,letterSpacing:.5}}>
                <th style={{padding:'10px 12px',fontWeight:700}}>Project</th>
                <th style={{padding:'10px 12px',fontWeight:700}}>Status</th>
                <th style={{padding:'10px 12px',fontWeight:700}}>Type</th>
                <th style={{padding:'10px 12px',fontWeight:700,textAlign:'right'}}>Contract</th>
                <th style={{padding:'10px 12px',fontWeight:700}}>Start</th>
                <th style={{padding:'10px 12px',width:36}}/>
              </tr></thead>
              <tbody>
                {filtered.map((p:any)=>{ const st=statusStyle(p.status||''); const contract=Number(p.contract_amount||0); return (
                  <tr key={p.id} className="pmRow" style={{borderTop:`1px solid ${PANEL_BORDER}`,cursor:'pointer'}} onClick={()=>{window.location.href=`/app/projects/${p.id}`;}}>
                    <td style={{padding:'12px'}}><div style={{display:'flex',alignItems:'center',gap:8}}><span aria-hidden style={{width:22,height:22,borderRadius:7,flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center',background:accentForProject(p.id).soft,border:`1px solid ${accentForProject(p.id).ring}`,color:accentForProject(p.id).hex,fontSize:9,fontWeight:900}}>{projectMonogram(p.name)}</span><div style={{minWidth:0}}><div style={{fontWeight:700,color:accentForProject(p.id).hex}}>{p.name}</div><div style={{fontSize:11.5,color:DIM}}>{p.address||'No address set'}</div></div></div></td>
                    <td style={{padding:'12px'}}><span style={{fontSize:10,fontWeight:800,padding:'3px 9px',borderRadius:999,background:st.bg,color:st.c,whiteSpace:'nowrap' as const}}>{(p.status||'—').replace(/_/g,' ').toUpperCase()}</span></td>
                    <td style={{padding:'12px',color:DIM,textTransform:'capitalize' as const}}>{(p.project_type||'—').replace(/_/g,' ')}</td>
                    <td style={{padding:'12px',textAlign:'right',fontWeight:700,color:contract>0?GOLD:colors.textDim,fontVariantNumeric:'tabular-nums' as const}}>{contract>0?fmt(contract):'—'}</td>
                    <td style={{padding:'12px',color:DIM,fontVariantNumeric:'tabular-nums' as const}}>{p.start_date?new Date(p.start_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}</td>
                    <td style={{padding:'12px',textAlign:'right'}}><ArrowRight size={14} weight="bold" color={GOLD}/></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </PremiumSurface>
  );
}
