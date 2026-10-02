'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { Plus, Ruler, X, Stack, CheckCircle, Eye, SquaresFour, UploadSimple } from '@phosphor-icons/react';
import { SHEET_DISCIPLINES } from '@/lib/construction-intelligence';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { moduleAccent } from '@/lib/module-identity';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { openPdf } from '@/components/PdfViewer';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF';
const GREEN='#1a8a4a',RED='#c03030';
// Premium kit surface language (match components/ui/premium.tsx) --------------
const PSURFACE='linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))';
const PBORDER='rgba(255,255,255,0.08)';

// Canonical sheet-discipline taxonomy — the shared list every picker draws from.
const DISCIPLINES=SHEET_DISCIPLINES;
const STATUSES=['current','superseded','for_review','void'];
const STATUS_LABELS:Record<string,string>={
  current:'Current',
  superseded:'Superseded',
  for_review:'For Review',
  void:'Void',
};
const STATUS_COLORS:Record<string,string>={
  current:GREEN,
  superseded:DIM,
  for_review:GOLD,
  void:RED,
};

const DISCIPLINE_COLORS:Record<string,string>={
  General:DIM,
  Architectural:'#FBBF24',
  Sitework:'#10b981',
  Demolition:'#f43f5e',
  'Fire Protection':'#ef4444',
  'Low Voltage / Technology':'#60a5fa',
  Interiors:'#e879b9',
  Specialties:'#94a3b8',
  Structural:'#f97316',
  Mechanical:'#a78bfa',
  Electrical:GOLD,
  Plumbing:'#22d3ee',
  Civil:GREEN,
  Landscape:'#84cc16',
  Other:DIM,
};

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'#1c1c1e',
  border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,
  fontSize:13,outline:'none',boxSizing:'border-box',
};
const hint:React.CSSProperties={fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45};

const EMPTY_FORM={
  drawing_number:'',title:'',discipline:'Architectural',
  revision:0,revision_date:'',status:'current',url:'',notes:'',
};

function Pill({label,color}:{label:string;color:string}){
  return(
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,
      background:`${color}22`,color,textTransform:'uppercase',letterSpacing:.3,whiteSpace:'nowrap'}}>
      {label}
    </span>
  );
}

function FieldLabel({label,auto}:{label:string;auto?:boolean}){
  return(
    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,
      textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>{label}{auto&&<AutoChip/>}</label>
  );
}

function InfoCard({label,value}:{label:string;value:string|undefined|null}){
  if(!value) return null;
  return(
    <div style={{background:PSURFACE,border:`1px solid ${PBORDER}`,borderRadius:10,padding:'10px 12px'}}>
      <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>{label}</div>
      <div style={{fontSize:13,color:TEXT}}>{value}</div>
    </div>
  );
}

function fmtDate(s:string|null|undefined){
  if(!s) return '—';
  return new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

export default function DrawingsPage(){
  const {projectId}=useParams() as {projectId:string};
  const [drawings,setDrawings]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [selected,setSelected]=useState<any>(null);
  const [mode,setMode]=useState<'view'|'edit'|'create'|null>(null);
  const [form,setForm]=useState<Record<string,any>>({...EMPTY_FORM});

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(mode==='create'||mode==='edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `drawings:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm(d as Record<string,any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterDiscipline,setFilterDiscipline]=useState('all');
  const [filterStatus,setFilterStatus]=useState('all');
  const [groupByDiscipline,setGroupByDiscipline]=useState(true);
  const [drawingSet,setDrawingSet]=useState<'current'|'all'>('current');
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [autoFields,setAutoFields]=useState<{num?:boolean;title?:boolean;date?:boolean}>({});

  // Project intelligence — one snapshot; the register walks in knowing the job.
  const { ctx } = useProjectContext(projectId);

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/drawings/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setDrawings(d.drawings||[]);
    }catch{setDrawings([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  function openCreate(){
    setForm({...EMPTY_FORM,revision_date:new Date().toISOString().slice(0,10)});
    setAutoFields({date:true});
    setUploadFile(null);
    setMode('create');setSelected(null);
  }
  // Mirror the server's sheet-number derivation (drawings/upload) so the form
  // shows exactly what will be saved: "A-101 Floor Plan.pdf" -> "A-101".
  function pickFile(f:File|null){
    setUploadFile(f);
    if(!f) return;
    const base=f.name.replace(/\.[^.]+$/,'');
    const m=base.match(/^([A-Za-z]{1,3}[-\s]?\d{2,4})/);
    setForm(prev=>({
      ...prev,
      drawing_number:prev.drawing_number||(m?m[1].toUpperCase().replace(/\s/,'-'):''),
      title:prev.title||base.replace(/^([A-Za-z]{1,3}[-\s]?\d{2,4})[-\s]*/,'').trim()||base,
    }));
    setAutoFields(a=>({...a,num:!!m,title:true}));
  }
  function openEdit(drawing:any){
    setForm({
      drawing_number:drawing.drawing_number||drawing.sheet_number||'',
      title:drawing.title||drawing.name||'',
      discipline:drawing.discipline||'Architectural',
      revision:drawing.revision??0,
      revision_date:drawing.revision_date?drawing.revision_date.substring(0,10):'',
      status:drawing.status||'current',
      url:drawing.url||'',
      notes:drawing.notes||'',
    });
    setSelected(drawing);setMode('edit');
  }
  function viewDrawing(drawing:any){setSelected(drawing);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);}

  async function save(): Promise<boolean> {
    if(!form.drawing_number.trim()||!form.title.trim()){
      showToast('Drawing number and title are required','error');return false;
    }
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      const payload={
        ...form,
        revision:Number(form.revision)||0,
        revision_date:form.revision_date||null,
      };
      if(mode==='create'&&uploadFile){
        // Upload path — the PDF lands in project storage and the sheet row is
        // created in one shot; non-default status/revision date follow via PUT.
        const fd=new FormData();
        fd.append('file',uploadFile);
        fd.append('projectId',projectId);
        fd.append('sheet_number',form.drawing_number);
        fd.append('title',form.title);
        fd.append('discipline',form.discipline);
        if(form.notes) fd.append('notes',form.notes);
        if(Number(form.revision)) fd.append('version',String(Number(form.revision)));
        const r=await fetch('/api/drawings/upload',{method:'POST',headers:h,body:fd});
        const d=await r.json();
        if(!r.ok||d.error) throw new Error(d.error||'Upload failed');
        if(d.drawing?.id&&((form.status&&form.status!=='current')||form.revision_date)){
          await fetch(`/api/drawings/${d.drawing.id}`,{
            method:'PUT',
            headers:{...h,'Content-Type':'application/json'},
            body:JSON.stringify({status:form.status,revision_date:form.revision_date||null}),
          }).catch(()=>{});
        }
        setUploadFile(null);
        showToast('Sheet uploaded and filed');
      }else if(mode==='create'){
        const r=await fetch('/api/drawings/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId}),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Drawing added');
      }else if(mode==='edit'&&selected){
        const r=await fetch(`/api/drawings/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Drawing updated');
      }
      await load();closePanel();
      guard.clearDraft();
      return true;
    }catch(e:any){console.error(e);showToast(humanError(e,'Save failed. Please try again.'),'error');}
    finally{setSaving(false);}
    return false;
  }

  async function deleteDrawing(drawing:any){
    if(!confirm(`Delete drawing "${drawing.drawing_number} - ${drawing.title}"?`)) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/drawings/${drawing.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Drawing deleted');closePanel();await load();
    }catch{showToast('Delete failed','error');}
    finally{setDeleting(false);}
  }

  const total=drawings.length;
  const current=drawings.filter(d=>d.status==='current').length;
  const superseded=drawings.filter(d=>d.status==='superseded').length;
  const forReview=drawings.filter(d=>d.status==='for_review').length;
  const disciplineCount=new Set(drawings.map(d=>d.discipline).filter(Boolean)).size;

  // API rows carry sheet_number (canonical column); legacy rows may carry
  // drawing_number. Read both everywhere so no sheet ever renders as a dash.
  const sheetNo=(d:any)=>d.drawing_number||d.sheet_number||'';
  // Natural sheet-number sort: A-2 files before A-10, S1.01 before S1.2.
  const bySheet=(a:any,b:any)=>sheetNo(a).localeCompare(sheetNo(b),undefined,{numeric:true,sensitivity:'base'});

  const filtered=drawings.filter(d=>{
    const ms=!search
      ||sheetNo(d).toLowerCase().includes(search.toLowerCase())
      ||(d.title||'').toLowerCase().includes(search.toLowerCase());
    const md=filterDiscipline==='all'||d.discipline===filterDiscipline;
    const mst=filterStatus==='all'||d.status===filterStatus;
    const mset=drawingSet==='all'||filterStatus==='superseded'||filterStatus==='void'||!(d.status==='superseded'||d.status==='void');
    return ms&&md&&mst&&mset;
  });

  filtered.sort(bySheet);

  // Group by discipline — rendered in canonical taxonomy order, extras last
  const grouped:Record<string,any[]>={};
  if(groupByDiscipline){
    for(const d of filtered){
      const disc=d.discipline||'Other';
      if(!grouped[disc]) grouped[disc]=[];
      grouped[disc].push(d);
    }
  }

  const groupOrder=[...DISCIPLINES.filter(d=>grouped[d]),...Object.keys(grouped).filter(d=>!DISCIPLINES.includes(d)).sort()];
  const latestRev=drawings.filter(d=>d.revision_date).sort((a,b)=>String(b.revision_date).localeCompare(String(a.revision_date)))[0];
  const counts=ctx?.counts;

  function DrawingRow({drawing}:{drawing:any}){
    const isSel=selected?.id===drawing.id&&mode==='view';
    return(
      <tr
        onClick={()=>viewDrawing(drawing)}
        style={{background:isSel?'rgba(245, 158, 11,.07)':'transparent',opacity:(drawing.status==='superseded'||drawing.status==='void')?0.55:1,
          borderBottom:`1px solid rgba(255,255,255,0.06)`,cursor:'pointer',transition:'background .1s'}}
        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='rgba(255,255,255,0.03)';}}
        onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent';}}>
        <td style={{padding:'11px 14px',color:GOLD,fontWeight:700,whiteSpace:'nowrap'}}>
          {sheetNo(drawing)||'—'}
        </td>
        <td style={{padding:'11px 14px',color:TEXT,maxWidth:240}}>
          <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {drawing.title||'—'}
          </div>
        </td>
        <td style={{padding:'11px 14px'}}>
          <Pill label={drawing.discipline||'Other'}
            color={DISCIPLINE_COLORS[drawing.discipline]||DIM}/>
        </td>
        <td style={{padding:'11px 14px',color:DIM,textAlign:'center'}}>
          R{drawing.revision??0}
        </td>
        <td style={{padding:'11px 14px',color:DIM,whiteSpace:'nowrap'}}>
          {fmtDate(drawing.revision_date)}
        </td>
        <td style={{padding:'11px 14px'}}>
          <Pill label={STATUS_LABELS[drawing.status]||drawing.status}
            color={STATUS_COLORS[drawing.status]||DIM}/>
        </td>
        <td style={{padding:'11px 14px'}}>
          {drawing.url?(
            <a href={drawing.url} target="_blank" rel="noreferrer"
              onClick={e=>e.stopPropagation()}
              style={{padding:'4px 10px',background:'rgba(245,158,11,.1)',
                border:'1px solid rgba(245,158,11,.3)',borderRadius:6,
                color:'#FBBF24',fontSize:11,fontWeight:700,textDecoration:'none',
                whiteSpace:'nowrap'}}>
              View PDF
            </a>
          ):(
            <span style={{fontSize:11,color:DIM}}>No link</span>
          )}
        </td>
      </tr>
    );
  }

  const tableHead=(
    <thead>
      <tr style={{background:'rgba(255,255,255,0.02)'}}>
        {['Drawing #','Title','Discipline','Rev','Rev Date','Status','Link'].map(h=>(
          <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,
            textTransform:'uppercase',letterSpacing:.5,color:DIM,
            borderBottom:`1px solid ${PBORDER}`,whiteSpace:'nowrap'}}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  return(
    <>
      <style>{`@keyframes drawerIn{from{transform:translateX(100%);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>

      {toast&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,
          padding:'12px 20px',borderRadius:8,color:'#fff',fontWeight:700,fontSize:14,pointerEvents:'none',
          background:toast.type==='success'?'rgba(26,138,74,.92)':'rgba(192,48,48,.92)'}}>
          {toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={2200}>
        {/* Header */}
        <ModuleHero
          eyebrow={ctx?.project?.name||'Drawings'}
          eyebrowIcon={<Ruler size={13} weight="fill" color={moduleAccent('drawings').hex}/>}
          title="Drawing"
          accent="Register"
          subtitle={current>0?`${current} current sheet${current===1?'':'s'} in force across ${disciplineCount} discipline${disciplineCount===1?'':'s'}${superseded>0?` — ${superseded} superseded kept on record`:''}.`:'Architectural and engineering drawing sets'}
          actions={
            <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
              <Plus size={15} weight="bold"/> Add Drawing
            </button>
          }
        />

        {/* Project intelligence strip — what the system already knows */}
        {ctx&&(
          <StatStrip items={[
            {href: `/app/projects/${projectId}/drawings`, label:'Project',value:ctx.project?.projectNumber||ctx.project?.name||'—',sub:ctx.project?.status?String(ctx.project.status).replace(/_/g,' '):'active'},
            {href: `/app/projects/${projectId}/drawings`, label:'Current Set',value:String(current),sub:superseded>0?`${superseded} superseded on record`:'no superseded sheets'},
            {href: `/app/projects/${projectId}/drawings`, label:'Latest Revision',value:latestRev?fmtDate(latestRev.revision_date):'—',sub:latestRev?`${sheetNo(latestRev)||latestRev.title||'sheet'} R${latestRev.revision??latestRev.version??0}`:'no revision dates yet'},
            {href: `/app/projects/${projectId}/rfis`, label:'Open RFIs',value:String(Number(counts?.openRfis)||0),accent:Number(counts?.openRfis)>0?GOLD:undefined,sub:'often resolve on these sheets'},
            {href: `/app/projects/${projectId}/submittals`, label:'Open Submittals',value:String(Number(counts?.openSubmittals)||0),sub:'checked against the set'},
            {href: `/app/projects/${projectId}/subs`, label:'Subs on the Job',value:String((ctx.subs||[]).length),sub:'build from the current set'},
          ]}/>
        )}

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
          <StatCard icon={<Stack size={19} weight="duotone" color={moduleAccent('drawings').hex}/>} label="Total Drawings" value={String(total)} accent="#FBBF24" sub="in register" delay={0.02} href={`/app/projects/${projectId}/drawings`}/>
          <StatCard icon={<CheckCircle size={19} weight="duotone" color={GREEN}/>} label="Current" value={String(current)} accent={GREEN} sub={superseded>0?`vs ${superseded} superseded`:'active sheets'} delay={0.06} href={`/app/projects/${projectId}/drawings`}/>
          <StatCard icon={<Eye size={19} weight="duotone" color={GOLD}/>} label="For Review" value={String(forReview)} accent={GOLD} sub="awaiting review" delay={0.10} href={`/app/projects/${projectId}/drawings`}/>
          <StatCard icon={<SquaresFour size={19} weight="duotone" color="#a78bfa"/>} label="Disciplines" value={String(disciplineCount)} accent="#a78bfa" sub="represented" delay={0.14} href={`/app/projects/${projectId}/drawings`}/>
        </div>

        {/* List toolbar — search + discipline/status filters; set + view toggles in extra */}
        <ListToolbar
          module="drawings"
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search drawings..."
          filters={[
            { key: 'discipline', label: 'Discipline', value: filterDiscipline, onChange: setFilterDiscipline, allLabel: 'All Disciplines', options: [...DISCIPLINES] },
            { key: 'status', label: 'Status', value: filterStatus, onChange: setFilterStatus, allLabel: 'All Statuses', options: STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] })) },
          ]}
          count={{ shown: filtered.length, total: total }}
          style={{ marginBottom: 18 }}
          extra={<>
            {/* Current set vs full revision history */}
            <div style={{display:'flex',background:RAISED,border:`1px solid ${PBORDER}`,borderRadius:10,overflow:'hidden'}}>
              <button onClick={()=>setDrawingSet('current')}
                style={{padding:'9px 15px',border:'none',cursor:'pointer',fontSize:12,fontWeight:700,
                  background:drawingSet==='current'?GOLD:'transparent',
                  color:drawingSet==='current'?DARK:DIM}}>
                Current Set ({current})
              </button>
              <button onClick={()=>setDrawingSet('all')}
                style={{padding:'9px 15px',border:'none',cursor:'pointer',fontSize:12,fontWeight:700,
                  background:drawingSet==='all'?GOLD:'transparent',
                  color:drawingSet==='all'?DARK:DIM}}>
                All Revisions ({total})
              </button>
            </div>
            {/* View toggle */}
            <div style={{display:'flex',background:RAISED,border:`1px solid ${PBORDER}`,borderRadius:10,overflow:'hidden'}}>
              <button onClick={()=>setGroupByDiscipline(true)}
                style={{padding:'9px 15px',border:'none',cursor:'pointer',fontSize:12,fontWeight:700,
                  background:groupByDiscipline?GOLD:'transparent',
                  color:groupByDiscipline?DARK:DIM}}>
                By Discipline
              </button>
              <button onClick={()=>setGroupByDiscipline(false)}
                style={{padding:'9px 15px',border:'none',cursor:'pointer',fontSize:12,fontWeight:700,
                  background:!groupByDiscipline?GOLD:'transparent',
                  color:!groupByDiscipline?DARK:DIM}}>
                Flat List
              </button>
            </div>
          </>}
        />

        {loading&&(
          <SectionCard flat>
            <div style={{padding:24,textAlign:'center',color:DIM}}>Loading drawings...</div>
          </SectionCard>
        )}

        {!loading&&loadError&&(
          <div style={{background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:12,padding:'12px 16px',marginBottom:20,color:'#f0a0a0',fontSize:13}}>
            {loadError}
          </div>
        )}

        {!loading&&filtered.length===0&&(
          <SectionCard>
            <PremiumEmpty
              icon={<Ruler size={30} weight="duotone" color={GOLD}/>}
              title={drawings.length===0?'Start the drawing register':'No drawings match your filters'}
              description={drawings.length===0
                ?`Upload the issued-for-construction set — each sheet files itself under its discipline, sorted by sheet number, and superseded revisions stay on record so every RFI points at the sheet it was answered against.${(ctx?.subs||[]).length>0?` Your ${ctx.subs.length} sub${ctx.subs.length===1?'':'s'} ${ctx.subs.length===1?'builds':'build'} from whatever is marked current.`:''}`
                :(drawingSet==='current'&&superseded>0
                  ?'Nothing in the current set matches — switch to All Revisions to search superseded sheets, or adjust your filters.'
                  :'Try adjusting your search or filters.')}
              action={drawings.length===0?(
                <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                  <UploadSimple size={15} weight="bold"/> Upload First Sheet
                </button>
              ):undefined}
            />
          </SectionCard>
        )}

        {!loading&&filtered.length>0&&groupByDiscipline&&(
          <div style={{display:'flex',flexDirection:'column',gap:20}}>
            {groupOrder.map(discipline=>{const discDrawings=grouped[discipline];return(
              <SectionCard
                key={discipline}
                flush
                accent={DISCIPLINE_COLORS[discipline]||DIM}
                icon={<div style={{width:13,height:13,borderRadius:4,background:DISCIPLINE_COLORS[discipline]||DIM}}/>}
                title={discipline}
                subtitle={`${discDrawings.length} sheet${discDrawings.length===1?'':'s'}`}
              >
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    {tableHead}
                    <tbody>
                      {discDrawings.map(d=><DrawingRow key={d.id} drawing={d}/>)}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            );})}
          </div>
        )}

        {!loading&&filtered.length>0&&!groupByDiscipline&&(
          <SectionCard flush icon={<Ruler size={17} weight="duotone" color={moduleAccent('drawings').hex}/>} title="All Drawings" subtitle={`${filtered.length} sheet${filtered.length===1?'':'s'}`}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                {tableHead}
                <tbody>
                  {filtered.map(d=><DrawingRow key={d.id} drawing={d}/>)}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
      </PremiumSurface>

      {/* Side Panel — premium slide-over */}
      {mode!==null&&(
        <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(460px,100%)',zIndex:600,
          background:'#0b1119',borderLeft:`1px solid ${PBORDER}`,
          boxShadow:'-28px 0 70px -24px rgba(0,0,0,.75)',
          overflow:'auto',display:'flex',flexDirection:'column',
          animation:'drawerIn .28s cubic-bezier(.2,.7,.3,1)'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${PBORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between',
            position:'sticky',top:0,background:'#0b1119',zIndex:2}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?'Add Drawing':mode==='edit'?'Edit Drawing':'Drawing Detail'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {mode==='view'&&selected&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'rgba(245,158,11,.12)',
                      border:'1px solid rgba(245,158,11,.35)',borderRadius:8,
                      color:'#FBBF24',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deleteDrawing(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.12)',
                      border:`1px solid ${RED}55`,borderRadius:8,
                      color:'#e88a8a',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {deleting?'...':'Delete'}
                  </button>
                </>
              )}
              <button onClick={closePanel}
                style={{padding:'6px 10px',background:'rgba(255,255,255,0.04)',
                  border:`1px solid ${PBORDER}`,borderRadius:8,color:DIM,fontSize:12,cursor:'pointer',display:'inline-flex',alignItems:'center'}}>
                <X size={14} weight="bold" color={DIM}/>
              </button>
            </div>
          </div>

          <div style={{flex:1,padding:20}}>
            {(mode==='create'||mode==='edit')?(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {mode==='create'&&(
                  <label style={{display:'block',cursor:'pointer',border:`1.5px dashed ${uploadFile?'rgba(52,199,89,0.5)':'rgba(245,158,11,0.4)'}`,borderRadius:12,padding:'16px 14px',textAlign:'center',background:uploadFile?'rgba(52,199,89,0.06)':'rgba(245,158,11,0.05)'}}>
                    <input type="file" accept=".pdf,image/*" style={{display:'none'}}
                      onChange={e=>pickFile(e.target.files?.[0]||null)}/>
                    <UploadSimple size={20} weight="bold" color={uploadFile?'#34C759':'#FBBF24'}/>
                    <div style={{fontSize:13,fontWeight:800,color:uploadFile?'#34C759':'#FBBF24',marginTop:6}}>
                      {uploadFile?uploadFile.name:'Upload the sheet PDF'}
                    </div>
                    <div style={{fontSize:11,color:DIM,marginTop:4,lineHeight:1.5}}>
                      {uploadFile?'Sheet number and title were read from the filename — adjust below.':'Drop in "A-101 Floor Plan.pdf" and the sheet number and title prefill from the filename. Or skip the file and link a URL below.'}
                    </div>
                  </label>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Drawing # *" auto={mode==='create'&&autoFields.num}/>
                    <input value={form.drawing_number}
                      onChange={e=>{const v=e.target.value;setAutoFields(a=>({...a,num:false}));setForm(f=>({...f,drawing_number:v}));}}
                      style={inp} placeholder="e.g. A1.01"/>
                    <div style={hint}>Sheets sort naturally — A-2 files before A-10.</div>
                  </div>
                  <div>
                    <FieldLabel label="Revision"/>
                    <input type="number" min={0} value={form.revision}
                      onChange={e=>setForm(f=>({...f,revision:e.target.value}))}
                      style={inp}/>
                  </div>
                </div>
                <div>
                  <FieldLabel label="Title *" auto={mode==='create'&&autoFields.title}/>
                  <input value={form.title} onChange={e=>{const v=e.target.value;setAutoFields(a=>({...a,title:false}));setForm(f=>({...f,title:v}));}}
                    style={inp} placeholder="e.g. Floor Plan - Level 1"/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Discipline"/>
                    <select value={form.discipline}
                      onChange={e=>setForm(f=>({...f,discipline:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {DISCIPLINES.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                    <div style={hint}>Canonical discipline list — the register groups sheets under this.</div>
                  </div>
                  <div>
                    <FieldLabel label="Status"/>
                    <select value={form.status}
                      onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    <div style={hint}>Superseded and void sheets drop out of the current set but stay on record.</div>
                  </div>
                </div>
                <div>
                  <FieldLabel label="Revision Date" auto={mode==='create'&&autoFields.date}/>
                  <SaguaroDatePicker value={form.revision_date}
                    onChange={v=>{setAutoFields(a=>({...a,date:false}));setForm(f=>({...f,revision_date:v}));}}
                    style={inp}/>
                  <div style={hint}>Defaults to today — the date on the title block wins.</div>
                </div>
                <div>
                  <FieldLabel label="PDF / Drawing URL"/>
                  <input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))}
                    style={inp} placeholder="https://..."/>
                  <div style={hint}>{uploadFile&&mode==='create'?'Not needed — the uploaded file stores its own link.':'Optional — link an external PDF if you are not uploading the file.'}</div>
                </div>
                <div>
                  <FieldLabel label="Notes"/>
                  <textarea value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Revision notes, superseded by, etc."/>
                </div>
                {mode==='create'&&(
                  <div style={{background:PSURFACE,border:`1px solid ${PBORDER}`,borderRadius:12,padding:'14px 16px'}}>
                    <FlowSteps title="What happens next" steps={[
                      {title:'Sheet files itself',desc:'Lands under its discipline, sorted by sheet number.'},
                      {title:'The team works the current set',desc:'Field crews and subs build from sheets marked current.'},
                      {title:'Revisions supersede cleanly',desc:'When the next rev lands, mark this one superseded — it stays on record.'},
                    ]}/>
                  </div>
                )}
                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving} className="pmBtn"
                    style={{...goldButtonStyle,flex:1,opacity:saving?0.6:1,cursor:saving?'not-allowed':'pointer'}}>
                    {saving?(uploadFile&&mode==='create'?'Uploading...':'Saving...'):mode==='create'?(uploadFile?'Upload Sheet':'Add Drawing'):'Save Changes'}
                  </button>
                  <button onClick={closePanel} style={{...ghostButtonStyle}}>
                    Cancel
                  </button>
                </div>
              </div>
            ):selected?(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {/* Header card */}
                <div style={{background:PSURFACE,border:`1px solid ${PBORDER}`,borderRadius:12,padding:16}}>
                  <div style={{fontSize:12,color:GOLD,fontWeight:700,marginBottom:4}}>
                    {sheetNo(selected)||'—'} &bull; R{selected.revision??selected.version??0}
                  </div>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:10}}>
                    {selected.title}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <Pill label={selected.discipline||'Other'}
                      color={DISCIPLINE_COLORS[selected.discipline]||DIM}/>
                    <Pill label={STATUS_LABELS[selected.status]||selected.status}
                      color={STATUS_COLORS[selected.status]||DIM}/>
                  </div>
                </div>

                {/* Metadata */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <InfoCard label="Revision #" value={`R${selected.revision??0}`}/>
                  <InfoCard label="Revision Date" value={fmtDate(selected.revision_date)}/>
                  <InfoCard label="Status" value={STATUS_LABELS[selected.status]||selected.status}/>
                  <InfoCard label="Discipline" value={selected.discipline}/>
                </div>

                {ctx&&(
                  <div style={{background:PSURFACE,border:`1px solid ${PBORDER}`,borderRadius:10,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>On This Project</div>
                    <InsightRow label="Current set" value={`${current} sheet${current===1?'':'s'}`}/>
                    <InsightRow label={`${selected.discipline||'Other'} sheets current`} value={String(drawings.filter(d=>(d.discipline||'Other')===(selected.discipline||'Other')&&d.status==='current').length)}/>
                    <InsightRow label="Open RFIs" value={String(Number(ctx.counts?.openRfis)||0)} accent={Number(ctx.counts?.openRfis)>0?GOLD:undefined}/>
                    <InsightRow label="Open submittals" value={String(Number(ctx.counts?.openSubmittals)||0)}/>
                  </div>
                )}

                {selected.notes&&(
                  <div style={{background:PSURFACE,border:`1px solid ${PBORDER}`,borderRadius:10,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>Notes</div>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{selected.notes}</div>
                  </div>
                )}

                {selected.url&&(
                  <button type="button"
                    onClick={()=>openPdf({url:selected.url!,title:`${selected.number||''} ${selected.title||'Drawing'}`.trim()})}
                    style={{display:'block',padding:'12px 14px',
                      background:'rgba(245,158,11,.1)',
                      border:'1px solid rgba(245,158,11,.3)',borderRadius:10,
                      color:'#FBBF24',fontSize:13,fontWeight:700,textDecoration:'none',
                      textAlign:'center'}}>
                    View PDF / Drawing
                  </button>
                )}
              </div>
            ):null}
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </>
  );
}
