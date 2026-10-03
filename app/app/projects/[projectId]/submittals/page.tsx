'use client';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { confirmDialog } from '@/lib/ui/async-dialog';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { Plus, Clipboard, X, CaretRight, ClipboardText, Clock, Eye, WarningCircle, Stack } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, AutoChip, goldButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { CSI_DIVISIONS, SUB_TRADES } from '@/lib/construction-intelligence';
import { moduleAccent } from '@/lib/module-identity';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { StatusPill } from '@/components/ui/Status';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF';
const GREEN='#2CFF7A',RED='#FF3B30',ORANGE='#c07830';

const STATUSES=['pending','submitted','under_review','approved','rejected','revise_resubmit'];
const STATUS_LABELS:Record<string,string>={
  pending:'Pending',
  submitted:'Submitted',
  under_review:'Under Review',
  approved:'Approved',
  rejected:'Rejected',
  revise_resubmit:'Revise & Resubmit',
};
const STATUS_COLORS:Record<string,string>={
  pending:DIM,
  submitted:'var(--brand-primary-strong)',
  under_review:GOLD,
  approved:GREEN,
  rejected:RED,
  revise_resubmit:ORANGE,
};

const BIC_OPTIONS=['Contractor','Architect','Owner','Engineer'];
const BIC_COLORS:Record<string,string>={
  Contractor:'var(--brand-primary-strong)',
  Architect:GOLD,
  Owner:GREEN,
  Engineer:'#FF8A00',
};

const inp:React.CSSProperties={
  width:'100%',padding:'9px 12px',background:'var(--bg-surface-2)',
  border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,
  fontSize:13,outline:'none',boxSizing:'border-box',
};

const HINT:React.CSSProperties={fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45};
const isoDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const EMPTY_FORM={
  submittal_number:'',title:'',spec_section:'',trade:'',
  status:'pending',ball_in_court:'Contractor',
  submitted_at:'',due_date:'',revision_number:0,notes:'',
};

function Pill({label,color}:{label:string;color:string}){
  return(
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,
      background:`color-mix(in srgb, ${color} 13%, transparent)`,color,whiteSpace:'nowrap'}}>
      {label}
    </span>
  );
}

function FieldLabel({label,auto}:{label:string;auto?:boolean}){
  return(
    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5}}>{label}{auto&&<AutoChip/>}</label>
  );
}

function InfoCard({label,value}:{label:string;value:string|undefined|null}){
  if(!value) return null;
  return(
    <div style={{background:'var(--bg-surface)',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px'}}>
      <div style={{fontSize:10,fontWeight:700,color:DIM,marginBottom:4}}>{label}</div>
      <div style={{fontSize:13,color:TEXT}}>{value}</div>
    </div>
  );
}

function fmtDate(s:string|null|undefined){
  if(!s) return '—';
  return new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

export default function SubmittalsPage(){
  const {projectId}=useParams() as {projectId:string};
  const [submittals,setSubmittals]=useState<any[]>([]);
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
    draftKey: `submittals:${projectId}`,
    draftData: mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm(d as Record<string,any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [rowBusyId,setRowBusyId]=useState<string|null>(null);
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search,setSearch]=useState('');
  const [filterStatus,setFilterStatus]=useState('all');
  const [filterBIC,setFilterBIC]=useState('all');
  // SmartCreate: the create panel walks in knowing the project — reviewer,
  // sub roster, log state — via the one-shot /api/project-context snapshot.
  const { ctx } = useProjectContext(projectId);
  const [auto,setAuto]=useState<{num?:boolean;due?:boolean;bic?:boolean}>({});

  const today=new Date().toISOString().split('T')[0];

  const showToast=(msg:string,type:'success'|'error'='success')=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  };

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch(`/api/submittals/list?projectId=${projectId}`,{headers:h});
      if (!r.ok) throw new Error('Failed to load data');
      const d=await r.json();
      setSubmittals(d.submittals||[]);
    }catch{setSubmittals([]);setLoadError('Failed to load. Please try again.');}
    finally{setLoading(false);}
  },[projectId]);

  useEffect(()=>{load();},[load]);

  // Dead-space kill (spec 4.1): an empty log auto-opens the create panel —
  // number + review window already defaulted. One-shot per visit so Cancel
  // stays cancelled.
  const autoOpenedRef=useRef(false);
  useEffect(()=>{
    if(!loading&&!loadError&&submittals.length===0&&mode===null&&!autoOpenedRef.current){
      autoOpenedRef.current=true;
      openCreate();
    }
  },[loading,loadError,submittals.length,mode]);

  function openCreate(){
    const num=`S-${String(submittals.length+1).padStart(3,'0')}`;
    const due=isoDate(new Date(Date.now()+14*86400000));
    setForm({...EMPTY_FORM,submittal_number:num,due_date:due});
    setAuto({num:true,due:true,bic:true});
    setMode('create');setSelected(null);
  }
  function openEdit(sub:any){
    setForm({
      submittal_number:sub.submittal_number||'',
      title:sub.title||'',
      spec_section:sub.spec_section||'',
      trade:sub.trade||'',
      status:sub.status||'pending',
      ball_in_court:sub.ball_in_court||'Contractor',
      submitted_at:sub.submitted_at?sub.submitted_at.substring(0,10):'',
      due_date:sub.due_date?sub.due_date.substring(0,10):'',
      revision_number:sub.revision_number??0,
      notes:sub.notes||'',
    });
    setAuto({});setSelected(sub);setMode('edit');
  }
  function viewSub(sub:any){setSelected(sub);setMode('view');}
  function closePanel(){setSelected(null);setMode(null);}

  async function save(): Promise<boolean> {
    if(!form.title.trim()){showToast('Title is required.','error');return false;}
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      const payload={
        ...form,
        revision_number:Number(form.revision_number)||0,
        submitted_at:form.submitted_at||null,
        due_date:form.due_date||null,
      };
      if(mode==='create'){
        const r=await fetch('/api/submittals/create',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({...payload,projectId}),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Submittal created.');
      }else if(mode==='edit'&&selected){
        const r=await fetch(`/api/submittals/${selected.id}`,{
          method:'PUT',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });
        if(!r.ok) throw new Error(await r.text());
        showToast('Submittal updated.');
      }
      await load();closePanel();
      guard.clearDraft();
      return true;
    }catch(e:any){console.error(e);showToast(humanError(e,'Save failed. Please try again.'),'error');}
    finally{setSaving(false);}
    return false;
  }

  async function deleteSub(sub:any){
    if(!(await confirmDialog({ title: 'Please confirm', message: `Delete submittal "${sub.submittal_number} — ${sub.title}"?`, danger: true }))) return;
    setDeleting(true);
    try{
      const h=await getAuthHeaders();
      const dr=await fetch(`/api/submittals/${sub.id}`,{method:'DELETE',headers:h});
      if (!dr.ok) throw new Error('Delete failed');
      showToast('Submittal deleted.');closePanel();await load();
    }catch{showToast('Delete failed.','error');}
    finally{setDeleting(false);}
  }

  // Inline PATCH used by the list-row quick actions (status advance + ball-in-court
  // reassign). Optimistically updates local rows so the change shows instantly.
  async function patchSubmittal(sub:any,patch:Record<string,any>,msg:string){
    setRowBusyId(sub.id);
    setSubmittals(prev=>prev.map(x=>x.id===sub.id?{...x,...patch}:x));
    if(selected?.id===sub.id) setSelected((p:any)=>p?{...p,...patch}:p);
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/submittals/${sub.id}`,{
        method:'PATCH',
        headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify(patch),
      });
      if(!r.ok) throw new Error('Update failed');
      showToast(msg);
    }catch{showToast('Update failed — reloading.','error');await load();}
    finally{setRowBusyId(null);}
  }

  // Advance a submittal one step along the review workflow.
  function advanceStatus(sub:any){
    const cur=sub.status||'pending';
    const idx=STATUSES.indexOf(cur);
    const next=idx>=0&&idx<STATUSES.length-1?STATUSES[idx+1]:null;
    if(!next) return;
    patchSubmittal(sub,{status:next},`Advanced to ${STATUS_LABELS[next]}`);
  }
  function nextStatusLabel(sub:any){
    const idx=STATUSES.indexOf(sub.status||'pending');
    return idx>=0&&idx<STATUSES.length-1?STATUS_LABELS[STATUSES[idx+1]]:null;
  }
  function reassignBIC(sub:any,bic:string){
    if(!bic||bic===sub.ball_in_court) return;
    patchSubmittal(sub,{ball_in_court:bic},`Ball in court → ${bic}`);
  }

  const total=submittals.length;
  const pending=submittals.filter(s=>s.status==='pending').length;
  const underReview=submittals.filter(s=>s.status==='under_review').length;
  const overdue=submittals.filter(s=>
    s.due_date&&s.due_date.substring(0,10)<today&&s.status!=='approved'&&s.status!=='rejected'
  ).length;

  // Canonical CSI spec-section options + the live sub roster for the create panel.
  const specOptions=Object.entries(CSI_DIVISIONS).map(([code,d])=>`${code} — ${d.name}`);
  const roster=(ctx?.subs||[]) as any[];

  const filtered=submittals.filter(s=>{
    const ms=!search
      ||(s.submittal_number||'').toLowerCase().includes(search.toLowerCase())
      ||(s.title||'').toLowerCase().includes(search.toLowerCase())
      ||(s.spec_section||'').toLowerCase().includes(search.toLowerCase())
      ||(s.trade||'').toLowerCase().includes(search.toLowerCase());
    const mst=filterStatus==='all'||s.status===filterStatus;
    const mb=filterBIC==='all'||s.ball_in_court===filterBIC;
    return ms&&mst&&mb;
  });

  function isOverdue(s:any){
    return s.due_date&&s.due_date.substring(0,10)<today&&s.status!=='approved'&&s.status!=='rejected';
  }

  return(
    <div style={{display:'flex',height:'100%',minHeight:0,position:'relative',background:DARK}}>
      {toast&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,
          padding:'12px 20px',borderRadius:8,color:'#fff',fontWeight:700,fontSize:14,pointerEvents:'none',
          background:toast.type==='success'?'rgba(26,138,74,.92)':'rgba(192,48,48,.92)'}}>
          {toast.msg}
        </div>
      )}

      {/* Main */}
      <div style={{flex:1,overflow:'auto',minWidth:0}}>
        <PremiumSurface maxWidth={2200}>
          {/* Header */}
          <ModuleHero
            eyebrow="Project Workflow"
            eyebrowIcon={<ClipboardText size={13} weight="fill" color={moduleAccent('specs').hex} />}
            title="Submittal"
            accent="Log"
            subtitle="Shop drawings, product data & submittal log"
            actions={
              <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> New Submittal
              </button>
            }
          />

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
            <StatCard icon={<Stack size={19} weight="duotone" color={moduleAccent('specs').hex} />}
              label="Total" value={String(total)} accent={GOLD} sub="Submittals" delay={0.02}  href={`/app/projects/${projectId}/submittals`}/>
            <StatCard icon={<Clock size={19} weight="duotone" color={DIM} />}
              label="Pending" value={String(pending)} sub="Awaiting submission" delay={0.06}  href={`/app/projects/${projectId}/submittals`}/>
            <StatCard icon={<Eye size={19} weight="duotone" color={moduleAccent('specs').hex} />}
              label="Under Review" value={String(underReview)} accent={GOLD} sub="In review" delay={0.10}  href={`/app/projects/${projectId}/submittals`}/>
            <StatCard icon={<WarningCircle size={19} weight="duotone" color={RED} />}
              label="Overdue" value={String(overdue)} accent={overdue>0?RED:undefined}
              sub={overdue>0?'Past required date':'None overdue'} delay={0.14}  href={`/app/projects/${projectId}/submittals`}/>
          </div>

          {/* Filters + Log */}
          <SectionCard
            title="Submittal Log"
            icon={<ClipboardText size={17} weight="duotone" color={moduleAccent('specs').hex} />}
            action={<span style={{fontSize:12,fontWeight:700,color:DIM,whiteSpace:'nowrap'}}>{filtered.length} of {total}</span>}
            flush
          >
            {/* Toolbar */}
            <div style={{padding:'14px 16px'}}>
              <ListToolbar
                module="submittals"
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search by number, title, spec section, or trade…"
                filters={[
                  {key:'status',label:'Status',value:filterStatus,onChange:setFilterStatus,allLabel:'All Statuses',
                    options:STATUSES.map(s=>({value:s,label:STATUS_LABELS[s]}))},
                  {key:'bic',label:'Ball in Court',value:filterBIC,onChange:setFilterBIC,allLabel:'All Ball-in-Court',
                    options:BIC_OPTIONS},
                ]}
                count={{shown:filtered.length,total:total}}
              />
            </div>

            {loading&&<div style={{padding:40,textAlign:'center',color:DIM}}>Loading submittals…</div>}

            {!loading&&loadError&&(
              <div style={{margin:'0 16px 14px',background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',color:'#FF3B30',fontSize:13}}>
                {loadError}
              </div>
            )}

            {!loading&&filtered.length===0&&(
              <div style={{padding:'14px 16px 20px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
                  <div style={{fontSize:13.5,fontWeight:800,color:TEXT}}>
                    <Clipboard size={16} weight="duotone" color={GOLD} style={{marginRight:7,verticalAlign:'text-bottom'}} />
                    {submittals.length===0?'No submittals yet':'No submittals match your filters'}
                    <span style={{fontWeight:400,color:DIM}}>
                      {submittals.length===0
                        ?(mode==='create'?' — the first number and review window are already set in the panel; title it and save.':' — start the register for shop drawings and product data.')
                        :' — try adjusting your search or filters.'}
                    </span>
                  </div>
                  {submittals.length===0&&mode!=='create'&&(
                    <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                      <Plus size={15} weight="bold" /> New Submittal
                    </button>
                  )}
                </div>
                {submittals.length===0&&(
                  <FlowStrip steps={[
                    {title:'Log the Submittal',desc:'Numbered S-001, S-002…'},
                    {title:'Submit for Review',desc:'Ball flips to the architect'},
                    {title:'Advance in One Click',desc:'Right from the log'},
                    {title:'Approved or Revise',desc:'Revisions keep the number'},
                  ]} />
                )}
              </div>
            )}

            {!loading&&filtered.length>0&&(
              <div style={{overflowX:'auto',borderTop:`1px solid rgba(255,255,255,0.06)`}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'var(--bg-surface-2)'}}>
                      {['#','Title','Spec Section','Status','Ball in Court','Req. Date','Rev.','Actions'].map(h=>(
                        <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:DIM,
                          borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap'}}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s=>{
                      const isSel=selected?.id===s.id&&mode==='view';
                      const od=isOverdue(s);
                      return(
                        <tr key={s.id}
                          onClick={()=>viewSub(s)}
                          style={{background:isSel?'var(--brand-primary-08)':'transparent',
                            borderBottom:`1px solid rgba(255,255,255,0.08)`,cursor:'pointer',
                            transition:'background .1s'}}
                          onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='rgba(255,255,255,.04)';}}
                          onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent';}}>
                          <td style={{padding:'11px 14px',color:GOLD,fontWeight:700,whiteSpace:'nowrap'}}>
                            {s.submittal_number||'—'}
                          </td>
                          <td style={{padding:'11px 14px',color:TEXT,maxWidth:220}}>
                            <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {s.title||'—'}
                            </div>
                            {s.trade&&<div style={{fontSize:11,color:DIM,marginTop:2}}>{s.trade}</div>}
                          </td>
                          <td style={{padding:'11px 14px',color:DIM,whiteSpace:'nowrap'}}>
                            {s.spec_section||'—'}
                          </td>
                          <td style={{padding:'11px 14px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                              <StatusPill module="submittals" status={s.status} size="sm"/>
                              {od&&<Pill label="Overdue" color={RED}/>}
                            </div>
                          </td>
                          <td style={{padding:'11px 14px'}}>
                            {s.ball_in_court&&(
                              <Pill label={s.ball_in_court} color={BIC_COLORS[s.ball_in_court]||DIM}/>
                            )}
                          </td>
                          <td style={{padding:'11px 14px',whiteSpace:'nowrap',
                            color:od?RED:DIM,fontWeight:od?700:400}}>
                            {s.due_date?fmtDate(s.due_date.substring(0,10)):'—'}
                            {od&&<span style={{fontSize:10,marginLeft:4}}>(overdue)</span>}
                          </td>
                          <td style={{padding:'11px 14px',color:DIM,textAlign:'center'}}>
                            R{s.revision_number??0}
                          </td>
                          {/* Inline quick actions — reassign ball-in-court + advance status
                              without leaving the list (mirrors the RFI inline pattern). */}
                          <td style={{padding:'8px 14px',whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <select
                                value={s.ball_in_court||'Contractor'}
                                disabled={rowBusyId===s.id}
                                onChange={e=>reassignBIC(s,e.target.value)}
                                title="Reassign ball-in-court"
                                style={{padding:'5px 8px',background:'var(--bg-surface-2)',border:`1px solid ${BORDER}`,
                                  borderRadius:6,color:TEXT,fontSize:12,outline:'none',cursor:'pointer'}}>
                                {BIC_OPTIONS.map(b=><option key={b} value={b}>{b}</option>)}
                              </select>
                              {nextStatusLabel(s)?(
                                <button
                                  onClick={()=>advanceStatus(s)}
                                  disabled={rowBusyId===s.id}
                                  title={`Advance to ${nextStatusLabel(s)}`}
                                  style={{padding:'5px 10px',background:'var(--brand-primary-12)',
                                    border:'1px solid var(--brand-primary-25)',borderRadius:6,color:GOLD,
                                    fontSize:12,fontWeight:700,cursor:rowBusyId===s.id?'wait':'pointer',
                                    display:'inline-flex',alignItems:'center',gap:4,opacity:rowBusyId===s.id?0.6:1}}>
                                  {nextStatusLabel(s)}<CaretRight size={11} weight="bold" color={GOLD}/>
                                </button>
                              ):(
                                <span style={{fontSize:11,color:DIM}}>—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </PremiumSurface>
      </div>

      {/* Side Panel */}
      {mode!==null&&(
        <div style={{width:460,borderLeft:`1px solid ${BORDER}`,background:DARK,
          overflow:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,
            display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:800,fontSize:15,color:TEXT}}>
              {mode==='create'?'New Submittal':mode==='edit'?'Edit Submittal':'Submittal Detail'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {mode==='view'&&selected&&(
                <>
                  <button onClick={()=>openEdit(selected)}
                    style={{padding:'6px 14px',background:'var(--brand-primary-12)',
                      border:'1px solid var(--brand-primary-25)',borderRadius:6,
                      color:'var(--brand-primary-strong)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>deleteSub(selected)} disabled={deleting}
                    style={{padding:'6px 14px',background:'rgba(192,48,48,.1)',
                      border:`1px solid color-mix(in srgb, ${RED} 27%, transparent)`,borderRadius:6,
                      color:RED,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {deleting?'…':'Delete'}
                  </button>
                </>
              )}
              <button onClick={closePanel}
                style={{padding:'6px 10px',background:'rgba(143,163,192,.1)',
                  border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer',display:'inline-flex',alignItems:'center'}}>
                <X size={14} weight="bold" color={DIM} />
              </button>
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',padding:20}}>
            {(mode==='create'||mode==='edit')?(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {mode==='create'&&ctx&&(
                  <StatStrip items={[
                    {href: `/app/projects/${projectId}/submittals`, label:'Log', value:String(total), sub:`${ctx.counts?.openSubmittals??0} open now`},
                    {href: `/app/projects/${projectId}/submittals`, label:'Reviewer', value:ctx.project?.architectName||'Architect', sub:'Ball moves here on submit'},
                    {href: `/app/projects/${projectId}/subs`, label:'Sub Roster', value:String((ctx.subs||[]).length), sub:'Trades to pick from'},
                    {href: `/app/projects/${projectId}/submittals`, label:'Overdue', value:String(overdue), accent:overdue>0?RED:undefined, sub:overdue>0?'Need attention first':'Log is current'},
                  ]}/>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Submittal #" auto={auto.num}/>
                    <input value={form.submittal_number}
                      onChange={e=>{const v=e.target.value;setAuto(a=>({...a,num:false}));setForm(f=>({...f,submittal_number:v}));}}
                      style={inp} placeholder="S-001"/>
                    {auto.num&&<div style={HINT}>Next in sequence — {total} already on the log.</div>}
                  </div>
                  <div>
                    <FieldLabel label="Revision"/>
                    <input type="number" min={0} value={form.revision_number}
                      onChange={e=>setForm(f=>({...f,revision_number:e.target.value}))}
                      style={inp}/>
                  </div>
                </div>
                <div>
                  <FieldLabel label="Title *"/>
                  <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                    style={inp} placeholder="e.g. Structural Steel Shop Drawings"/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Spec Section"/>
                    <select value={form.spec_section}
                      onChange={e=>setForm(f=>({...f,spec_section:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      <option value="">Select division…</option>
                      {form.spec_section&&!specOptions.includes(form.spec_section)&&(
                        <option value={form.spec_section}>{form.spec_section}</option>
                      )}
                      {specOptions.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                    <div style={HINT}>CSI MasterFormat divisions.</div>
                  </div>
                  <div>
                    <FieldLabel label="Trade / Sub"/>
                    <select value={form.trade}
                      onChange={e=>setForm(f=>({...f,trade:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      <option value="">Select trade…</option>
                      {form.trade&&!roster.some((s:any)=>(s.trade||s.companyName)===form.trade)&&!SUB_TRADES.includes(form.trade)&&(
                        <option value={form.trade}>{form.trade}</option>
                      )}
                      {roster.length>0&&(
                        <optgroup label="On This Project">
                          {roster.map((s:any)=>(
                            <option key={s.membershipId} value={s.trade||s.companyName||''}>{s.companyName}{s.trade?` — ${s.trade}`:''}</option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="All Trades">
                        {SUB_TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                      </optgroup>
                    </select>
                    {roster.length>0&&<div style={HINT}>{roster.length} sub{roster.length===1?'':'s'} on the project roster.</div>}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Status"/>
                    <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                      style={{...inp,padding:'9px 10px'}}>
                      {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel label="Ball in Court" auto={auto.bic}/>
                    <select value={form.ball_in_court}
                      onChange={e=>{const v=e.target.value;setAuto(a=>({...a,bic:false}));setForm(f=>({...f,ball_in_court:v}));}}
                      style={{...inp,padding:'9px 10px'}}>
                      {BIC_OPTIONS.map(b=><option key={b} value={b}>{b}</option>)}
                    </select>
                    {auto.bic&&<div style={HINT}>Starts with you — flips to {ctx?.project?.architectName||'the architect'} on submit.</div>}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel label="Submitted Date"/>
                    <SaguaroDatePicker value={form.submitted_at}
                      onChange={v=>setForm(f=>({...f,submitted_at:v}))}
                      style={inp}/>
                  </div>
                  <div>
                    <FieldLabel label="Required Date" auto={auto.due}/>
                    <SaguaroDatePicker value={form.due_date}
                      onChange={v=>{setAuto(a=>({...a,due:false}));setForm(f=>({...f,due_date:v}));}}
                      style={inp}/>
                    {auto.due&&<div style={HINT}>Standard 14-day review window — adjust to the spec.</div>}
                  </div>
                </div>
                <div>
                  <FieldLabel label="Notes"/>
                  <textarea value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    rows={3} style={{...inp,resize:'vertical',lineHeight:1.5}}
                    placeholder="Additional notes or comments…"/>
                </div>
                {mode==='create'&&(
                  <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'14px 16px'}}>
                    <FlowSteps title="After You Submit" steps={[
                      {title:'Submitted for Review', desc:`Ball-in-court flips to ${ctx?.project?.architectName||'the architect'} and the review clock starts.`},
                      {title:'Under Review', desc:'Advance the workflow in one click from the log — no form reopening.'},
                      {title:'Approved — or Revise & Resubmit', desc:'A resubmittal keeps this number and auto-increments the revision (R1, R2…).'},
                    ]}/>
                  </div>
                )}
                <div style={{display:'flex',gap:10,paddingTop:4}}>
                  <button onClick={save} disabled={saving}
                    style={{flex:1,padding:'11px 0',
                      background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,
                      border:'none',borderRadius:8,color:'#0A0A00',
                      fontSize:14,fontWeight:800,cursor:'pointer',opacity:saving?0.6:1}}>
                    {saving?'Saving…':mode==='create'?'Create Submittal':'Save Changes'}
                  </button>
                  <button onClick={closePanel}
                    style={{padding:'11px 16px',background:'rgba(143,163,192,.1)',
                      border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,
                      fontSize:14,cursor:'pointer'}}>
                    Cancel
                  </button>
                </div>
              </div>
            ):selected?(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {/* Header card */}
                <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:12,color:GOLD,fontWeight:700,marginBottom:4}}>
                    {selected.submittal_number||'—'} &bull; R{selected.revision_number??0}
                  </div>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:10}}>
                    {selected.title}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <Pill label={STATUS_LABELS[selected.status]||selected.status}
                      color={STATUS_COLORS[selected.status]||DIM}/>
                    {selected.ball_in_court&&(
                      <Pill label={`BIC: ${selected.ball_in_court}`}
                        color={BIC_COLORS[selected.ball_in_court]||DIM}/>
                    )}
                    {isOverdue(selected)&&(
                      <Pill label="Overdue" color={RED}/>
                    )}
                  </div>
                </div>

                {/* Status workflow */}
                <div style={{background:'var(--bg-surface)',border:`1px solid ${BORDER}`,borderRadius:10,padding:'12px 14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:DIM,marginBottom:10}}>
                    Status Workflow
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                    {STATUSES.map((s,i)=>{
                      const active=selected.status===s;
                      return(
                        <React.Fragment key={s}>
                          {i>0&&<span style={{display:'inline-flex',alignItems:'center',verticalAlign:'middle',color:BORDER}}><CaretRight size={12} weight="regular" color={BORDER} /></span>}
                          <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,
                            background:active?`color-mix(in srgb, ${STATUS_COLORS[s]} 13%, transparent)`:'transparent',
                            color:active?STATUS_COLORS[s]:DIM,
                            border:active?`1px solid color-mix(in srgb, ${STATUS_COLORS[s]} 27%, transparent)`:'1px solid transparent'}}>
                            {STATUS_LABELS[s]}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Metadata */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <InfoCard label="Spec Section" value={selected.spec_section}/>
                  <InfoCard label="Trade" value={selected.trade}/>
                  <InfoCard label="Submitted Date" value={selected.submitted_at?fmtDate(selected.submitted_at.substring(0,10)):null}/>
                  <InfoCard label="Required Date" value={selected.due_date?fmtDate(selected.due_date.substring(0,10)):null}/>
                </div>

                {selected.notes&&(
                  <div style={{background:'var(--bg-surface)',border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:DIM,marginBottom:6}}>Notes</div>
                    <div style={{fontSize:13,color:TEXT,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{selected.notes}</div>
                  </div>
                )}
              </div>
            ):null}
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </div>
  );
}
