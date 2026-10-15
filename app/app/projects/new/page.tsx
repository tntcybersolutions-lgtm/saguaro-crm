'use client';
/**
 * New Project — the job intake form.
 *
 * Name and address are the only required fields; everything else is seeded
 * from the kind of job and the tenant's own portfolio (numbering sequence,
 * owner/architect contact book, house retainage and jurisdiction).
 *
 * Writes  POST /api/projects/create   then fires POST /api/autopilot/run
 * Lands   /app/projects/:id/takeoff ("Create & add drawings") or /overview.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { PHASE_CHOICES, type ProjectPhase } from '@/lib/project-phase';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { PROJECT_TEMPLATES, templateByKey } from '@/lib/project-templates';
import ProjectPreview from '@/components/projects/ProjectPreview';
import { BUILDING_TYPES } from '@/lib/contractor-trades';
import { SECTORS } from '@/lib/taxonomy';
import { Buildings, MapPin, UsersThree, Sparkle, CurrencyDollar, ShieldCheck, Hash, Scales, WarningCircle, ArrowRight, Stack } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import Suggest from '@/components/ui/Suggest';
import { stateFromAddress } from '@/lib/us-state';
import {
  PageShell, StatRow, Card, Button, Badge, Field, Input, Select, Textarea, DateInput, FormGrid,
  DetailList, Callout, type StatItem,
} from '@/components/ui/kit';

const fmt = (n:number) => '$'+(Number(n)||0).toLocaleString('en-US',{maximumFractionDigits:0});
const fmtDate = (d?:string|null) => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// Mirrors the projects.project_type DB check constraint — do not extend without a migration.
const PROJECT_CATEGORIES = [
  {value:'residential',label:'Residential'},
  {value:'commercial',label:'Commercial'},
  {value:'industrial',label:'Industrial'},
  {value:'healthcare',label:'Healthcare'},
  {value:'education',label:'Education'},
  {value:'government',label:'Government'},
  {value:'multifamily',label:'Multifamily'},
  {value:'mixed_use',label:'Mixed-Use'},
  {value:'addition',label:'Addition'},
  {value:'remodel',label:'Remodel / TI'},
];

// Canonical building type (lib/contractor-trades BUILDING_TYPES) -> DB category enum.
const CATEGORY_BY_BUILDING_TYPE: Record<string,string> = {
  'Commercial Office':'commercial','Medical Office / MOB':'healthcare','Hospital / Healthcare':'healthcare',
  'Retail':'commercial','Restaurant / Food Service':'commercial','Industrial / Warehouse':'industrial',
  'Manufacturing / Production':'industrial','Cold Storage / Refrigerated':'industrial','Data Center':'industrial',
  'Laboratory / R&D':'industrial','Educational — K-12':'education','Educational — Higher Ed / University':'education',
  'Government / Municipal':'government','Courthouse / Justice':'government','Religious / Institutional':'commercial',
  'Hospitality / Hotel':'commercial','Multi-Family Residential (5+ units)':'multifamily','Single-Family Residential':'residential',
  'Senior Living / Assisted Living':'healthcare','Mixed-Use':'mixed_use','Sports & Recreation':'commercial',
  'Arena / Stadium':'commercial','Parking Structure':'commercial','Auto Dealership':'commercial',
  'Grocery / Supermarket':'commercial','Tenant Improvement (TI)':'remodel','Historic Renovation':'remodel',
  'Civil / Infrastructure':'industrial','Other':'commercial',
};

const CONTRACT_TYPES = ['Lump Sum GMP','Cost Plus Fixed Fee','Cost Plus Percentage','Unit Price','Design-Build'];

// ── Procore-style SECTOR differentiation: one prominent choice that filters
//    building types, derives the category, and pre-sets compliance flags
//    (Government/Education/Infrastructure -> prevailing wage + public agency).
//    The sector list itself lives in the single taxonomy module (@/lib/taxonomy
//    SECTORS) so every sector picker platform-wide shares one source.

/* Choice tiles (kind of job, where is this job): slate until chosen, then the
   one yellow edge — the selected item. Tokens only. */
const NP_CSS = `
.npSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.npSplit > * { min-width: 0; }
.npMain { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.npCols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
.npCols > div { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.npRail { display: flex; flex-direction: column; gap: 16px; }
@media (min-width: 1100px) {
  .npSplit { grid-template-columns: minmax(0, 1fr) 340px; }
  .npRail { position: sticky; top: 80px; }
}
@media (min-width: 900px) { .npCols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.npTiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 12px; }
.npTile { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: var(--radius-md, 12px); border: 1px solid var(--border-default); background: var(--bg-surface-2); cursor: pointer; min-height: 44px; }
.npTile:hover { border-color: var(--border-strong, var(--border-default)); background: var(--bg-row-hover, var(--bg-surface-2)); }
.npTile:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.npTile[aria-pressed="true"] { border-color: var(--brand-primary); box-shadow: inset 0 0 0 1px var(--brand-primary); }
.npTileTitle { font-size: 14px; font-weight: 800; color: var(--text-primary); }
.npTileText { font-size: 13px; line-height: 1.45; color: var(--text-secondary); }
.npTileTags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.npChips { display: flex; flex-wrap: wrap; gap: 6px; }
.npFoot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.npFootNote { font-size: 13px; color: var(--text-secondary); }
`;

export default function NewProjectPage() {
  const router = useRouter();
  const year = new Date().getFullYear();

  /* The kind of job. Picking it sets retainage, contract type and the filing
     structure, so the GC answers once instead of on every field below. */
  const [templateKey, setTemplateKey] = useState<string>('ground-up');
  const tpl = templateByKey(templateKey);

  // Identity
  const [name, setName] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [buildingType, setBuildingType] = useState('');
  /* Category follows the kind of job picked in Step 1 (ground-up / TI /
     service -> commercial, renovation -> remodel) until the GC picks a building
     type or sets the category by hand. It used to start at 'residential' while
     "Ground-up construction" (a fire station, a medical plaza) was selected, so
     the rail said Residential and the job was saved as residential. */
  const templateCategory = (key: string) => templateByKey(key)?.projectType ?? 'commercial';
  const [type, setType] = useState(() => templateCategory('ground-up'));
  const [catTouched, setCatTouched] = useState(false);
  const [sector, setSector] = useState('');

  // Sector drives the whole identity block: filtered building types, derived
  // category, and compliance defaults (still fully editable).
  const sectorDef = SECTORS.find(s=>s.key===sector) || null;
  const sectorBts = sectorDef
    ? BUILDING_TYPES.filter(bt => sectorDef.cats.includes(CATEGORY_BY_BUILDING_TYPE[bt] || '') || (sectorDef.extraBts||[]).includes(bt))
    : BUILDING_TYPES;
  function pickSector(key:string){
    const def = SECTORS.find(s=>s.key===key);
    setSector(key);
    if(!def) return;
    setType(prev => def.cats.includes(prev) ? prev : def.cats[0]);
    setAuto(a=>({...a,cat:true}));
    if(def.flags){ setPrevailingWage(def.flags.pw); setPublicProject(def.flags.pub); }
    else { setPrevailingWage('No'); setPublicProject('No — Private'); }
    setBuildingType(prev => {
      const stillValid = def.cats.includes(CATEGORY_BY_BUILDING_TYPE[prev] || '') || (def.extraBts||[]).includes(prev);
      return stillValid ? prev : '';
    });
  }
  /* Chasing this job or building it? The single question that decides which
     journey the overview teaches and which nav sections lead. Defaults to
     bidding: it is the earlier state, and showing bid tools to somebody
     mid-construction is a smaller error than hiding them from somebody who
     is about to bid. See lib/project-phase. */
  const [phase, setPhase] = useState<ProjectPhase>('bidding');
  const [description, setDescription] = useState('');
  // Location
  const [address, setAddress] = useState('');
  const [stateJurisdiction, setStateJurisdiction] = useState('AZ');
  /* Set true once the GC edits jurisdiction themselves — after that the address
     stops overriding them. Inference is a convenience, never a correction. */
  const [jurisdictionTouched, setJurisdictionTouched] = useState(false);

  /* "Phoenix, AZ 85001" carries the jurisdiction already. Reading it saves the
     GC a field and, more importantly, stops a Texas job quietly inheriting
     Arizona's lien-waiver and prevailing-wage rules because nobody scrolled
     down to change a default. Two-letter code, or the state spelled out
     (lib/us-state — the switch-over import reads it the same way). */
  useEffect(() => {
    if (jurisdictionTouched) return;
    const found = stateFromAddress(address);
    if (found && found !== stateJurisdiction) setStateJurisdiction(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, jurisdictionTouched]);
  // Contract & money
  const [budget, setBudget] = useState('');
  const [contractType, setContractType] = useState('Lump Sum GMP');
  const [retainage, setRetainage] = useState('10');
  const [awardDate, setAwardDate] = useState('');
  const [ntpDate, setNtpDate] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [subDate, setSubDate] = useState('');
  const [finalDate, setFinalDate] = useState('');
  // Team & contacts
  const [owner, setOwner] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [arch, setArch] = useState('');
  const [archEmail, setArchEmail] = useState('');
  // Compliance
  const [prevailingWage, setPrevailingWage] = useState('No');
  const [publicProject, setPublicProject] = useState('No — Private');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Which fields the system filled in vs. what the GC typed.
  const [auto, setAuto] = useState<{num?:boolean;cat?:boolean;ret?:boolean;start?:boolean;state?:boolean;ownerEmail?:boolean;archEmail?:boolean}>({cat:true,ret:true,start:true,state:true});

  // This page has no projectId, so /api/project-context does not apply. The
  // portfolio itself is the context: numbering sequence, owner/architect
  // contact book, and house defaults (retainage, jurisdiction) all seed from
  // the projects the tenant already has.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pf, setPf] = useState<any>(null);

  const { projects: portfolioProjects, loading: portfolioLoading, error: portfolioError } = useProjects();
  const pfSeededRef = useRef(false);
  useEffect(()=>{
    if (pfSeededRef.current || portfolioLoading) return;
    pfSeededRef.current = true;
    const fallback = `${year}-001`;
    if (portfolioError) {
      setPf({loaded:true,total:0,active:0,value:0,owners:{},archs:{},ownerCounts:{}});
      setProjectNumber(prev=>{ if(!prev){ setAuto(a=>({...a,num:true})); return fallback; } return prev; });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list:any[] = portfolioProjects as any[];
    // Next project number — continue this year's sequence (e.g. 2026-007).
    let maxSeq = 0;
    for(const p of list){
      const m = String(p.project_number||'').match(/(\d{4})-(\d{1,4})\s*$/);
      if(m && Number(m[1])===year) maxSeq = Math.max(maxSeq, Number(m[2])||0);
    }
    const createdThisYear = list.filter(p=>String(p.created_at||'').startsWith(String(year))).length;
    const suggestion = `${year}-${String((maxSeq||createdThisYear)+1).padStart(3,'0')}`;
    // Contact book + house defaults from prior projects (list is newest-first).
    const owners:Record<string,string> = {}, archs:Record<string,string> = {};
    const ownerCounts:Record<string,number> = {};
    const stateCounts:Record<string,number> = {}, retCounts:Record<string,number> = {};
    let value = 0, active = 0;
    for(const p of list){
      value += Number(p.contract_value ?? p.contract_amount ?? 0)||0;
      if(String(p.status||'')==='active') active++;
      const on = String(p.owner_name||'').trim();
      if(on){
        ownerCounts[on] = (ownerCounts[on]||0)+1;
        if(!owners[on]) owners[on] = String(p.owner_email||'');
      }
      const an = String(p.architect_name||'').trim();
      if(an && !archs[an]) archs[an] = String(p.architect_email||'');
      const sj = String(p.state_jurisdiction||'').trim().toUpperCase();
      if(sj) stateCounts[sj] = (stateCounts[sj]||0)+1;
      const rp = Number(p.retainage_pct);
      if(Number.isFinite(rp) && rp>0) retCounts[String(rp)] = (retCounts[String(rp)]||0)+1;
    }
    const top = (c:Record<string,number>) => Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0];
    const stateMode = top(stateCounts), retMode = top(retCounts);
    setPf({loaded:true,total:list.length,active,value,owners,archs,ownerCounts,stateMode,retMode});
    setProjectNumber(prev=>{ if(!prev){ setAuto(a=>({...a,num:true})); return suggestion; } return prev; });
    if(stateMode) setStateJurisdiction(prev=> prev==='AZ' ? stateMode : prev);
    if(retMode) setRetainage(prev=> prev==='10' ? retMode : prev);
  },[portfolioProjects, portfolioLoading, portfolioError, year]);

  /* ── Unsaved-work protection (R14): dirty once the GC has entered anything
   *    beyond the seeded defaults (project number / retainage / jurisdiction /
   *    start date arm only after a manual edit clears their auto flag). The
   *    draft covers the whole intake form, auto flags included. ── */
  const createDirty =
    !!name.trim() || !!sector || !!buildingType || !!description.trim() || !!address.trim() ||
    !!budget.trim() || !!owner.trim() || !!ownerEmail.trim() || !!arch.trim() || !!archEmail.trim() ||
    !!awardDate || !!ntpDate || !!subDate || !!finalDate ||
    contractType !== 'Lump Sum GMP' ||
    prevailingWage !== 'No' || publicProject !== 'No — Private' ||
    (!auto.num && !!projectNumber.trim()) || (!auto.ret && retainage !== '10') ||
    !auto.state || !auto.start || (catTouched && type !== templateCategory(templateKey));
  const draftData = {
    name, projectNumber, buildingType, type, sector, description,
    address, stateJurisdiction, budget, contractType, retainage,
    awardDate, ntpDate, startDate, subDate, finalDate,
    owner, ownerEmail, arch, archEmail, prevailingWage, publicProject, auto,
  };
  const guard = useUnsavedGuard({
    dirty: createDirty,
    draftKey: 'project-create',
    draftData,
    restoreDraft: (d) => {
      const dr = d as Partial<typeof draftData>;
      if (dr.name !== undefined) setName(dr.name);
      if (dr.projectNumber) setProjectNumber(dr.projectNumber);
      if (dr.buildingType !== undefined) setBuildingType(dr.buildingType);
      if (dr.type) setType(dr.type);
      if (dr.sector !== undefined) setSector(dr.sector);
      if (dr.description !== undefined) setDescription(dr.description);
      if (dr.address !== undefined) setAddress(dr.address);
      if (dr.stateJurisdiction) setStateJurisdiction(dr.stateJurisdiction);
      if (dr.budget !== undefined) setBudget(dr.budget);
      if (dr.contractType) setContractType(dr.contractType);
      if (dr.retainage) setRetainage(dr.retainage);
      if (dr.awardDate !== undefined) setAwardDate(dr.awardDate);
      if (dr.ntpDate !== undefined) setNtpDate(dr.ntpDate);
      if (dr.startDate) setStartDate(dr.startDate);
      if (dr.subDate !== undefined) setSubDate(dr.subDate);
      if (dr.finalDate !== undefined) setFinalDate(dr.finalDate);
      if (dr.owner !== undefined) setOwner(dr.owner);
      if (dr.ownerEmail !== undefined) setOwnerEmail(dr.ownerEmail);
      if (dr.arch !== undefined) setArch(dr.arch);
      if (dr.archEmail !== undefined) setArchEmail(dr.archEmail);
      if (dr.prevailingWage) setPrevailingWage(dr.prevailingWage);
      if (dr.publicProject) setPublicProject(dr.publicProject);
      if (dr.auto) setAuto(dr.auto);
    },
    onSave: () => submitCreate(),
  });

  // Picking a canonical building type derives the DB category automatically.
  function onBuildingTypeChange(v:string){
    setBuildingType(v);
    const cat = CATEGORY_BY_BUILDING_TYPE[v];
    if(cat){ setType(cat); setAuto(a=>({...a,cat:true})); }
  }
  // Repeat owner/architect: pull their email from the contact book.
  function onOwnerChange(v:string){
    setOwner(v);
    const em = pf?.owners?.[v.trim()];
    if(em) setOwnerEmail(prev=>{ if(!prev){ setAuto(a=>({...a,ownerEmail:true})); return em; } return prev; });
  }
  function onArchChange(v:string){
    setArch(v);
    const em = pf?.archs?.[v.trim()];
    if(em) setArchEmail(prev=>{ if(!prev){ setAuto(a=>({...a,archEmail:true})); return em; } return prev; });
  }

  /** POST the project — shared by the form submit and the guard's "Save & leave".
   *  Returns true on success (after kicking off navigation to the new project). */
  async function submitCreate(): Promise<boolean> {
    if (!name.trim() || !address.trim()) { setError('Name and address are required.'); return false; }
    setSaving(true);
    setError('');
    try {
      const contractAmount = Number(budget.replace(/[^0-9.]/g,''))||0;
      const r = await fetch('/api/projects/create', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          name:name.trim(), address:address.trim(), projectType:type, contractAmount,
          projectNumber:projectNumber.trim()||null, buildingType:buildingType||null,
          startDate:startDate||null, substantialCompletionDate:subDate||null,
          awardDate:awardDate||null, noticeToProceedDate:ntpDate||null, finalCompletionDate:finalDate||null,
          stateJurisdiction, ownerName:owner, ownerEmail, architectName:arch, architectEmail:archEmail,
          description, contractType, retainagePct:Number(retainage)||10, template:templateKey,
          prevailingWage:prevailingWage!=='No', publicProject:!publicProject.includes('Private'),
          phase,
        })
      });
      const d = await r.json();
      if (d.projectId) {
        // Fire autopilot scan async (non-blocking)
        fetch('/api/autopilot/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: d.projectId }),
        }).catch((e) => console.error('[projects/new] autopilot kick-off failed', e));
        guard.clearDraft();
        router.push(`/app/projects/${d.projectId}/${nextRef.current === 'takeoff' ? 'takeoff' : 'overview'}`);
        return true;
      } else {
        setError(d.error || 'Failed to create project.');
        setSaving(false);
        return false;
      }
    } catch (err) {
      console.error('[projects/new] create failed', err);
      setError('Network error — please try again.');
      setSaving(false);
      return false;
    }
  }

  /* Name and address are the only required fields — the page has always said
     so. Everything else is pre-seeded, so it starts collapsed. */
  const [showDetails, setShowDetails] = useState(false);
  /* Where the GC lands after Create. "and add drawings" goes straight to
     takeoff, which is the actual next thing on a real job. */
  const nextRef = useRef<'overview' | 'takeoff'>('overview');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;
    await submitCreate();
  }

  const submitDisabled = saving||!name.trim()||!address.trim();
  const budgetNum = Number(budget.replace(/[^0-9.]/g,''))||0;
  const ownerNames = Object.keys(pf?.owners||{});
  const archNames = Object.keys(pf?.archs||{});

  const stats: StatItem[] = [
    { label:'Project number', value: projectNumber || `${year}-001`, sub: pf?.total>0 ? `Next in your ${year} sequence` : `First in the ${year} sequence`, icon:<Hash size={15}/> },
    { label:'This contract', value: budgetNum>0 ? fmt(budgetNum) : '—', tone: budgetNum>0 ? 'good' : 'default', sub: contractType, icon:<CurrencyDollar size={15}/> },
    { label:'Retainage', value: `${Number(retainage)||10}%`, sub: pf?.retMode && auto.ret ? 'Your portfolio standard' : 'Default — editable', icon:<Scales size={15}/> },
    { label:'Jurisdiction', value: stateJurisdiction || '—', sub:'Lien waiver + wage rules', icon:<MapPin size={15}/> },
  ];

  return (
    <PageShell
      crumbs={[{ label:'Projects', href:'/app/projects' }, { label:'New project' }]}
      title="New project"
      subtitle="Name and address are all it needs. Everything else is pre-filled and editable."
      actions={
        <>
          <Button variant="ghost" onClick={()=>guard.requestClose(()=>router.back())}>Cancel</Button>
          <Button type="submit" form="np-form" disabled={submitDisabled} onClick={() => { nextRef.current = 'overview'; }}>
            {saving?'Creating…':'Create without drawings'}
          </Button>
          <Button variant="primary" type="submit" form="np-form" data-tour="create-project-submit" icon={<ArrowRight size={15} weight="bold"/>}
            disabled={submitDisabled} onClick={() => { nextRef.current = 'takeoff'; }}>
            {saving?'Creating…':'Create & add drawings'}
          </Button>
        </>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: NP_CSS }} />

      {pf && <StatRow items={stats}/>}

      {error && <Callout tone="danger" icon={<WarningCircle size={18}/>} title="The project wasn't created" text={error}/>}

      {/* What kind of job. One choice that furnishes the rest — retainage, the
          contract type, the CSI spread the budget expects, and the folders the
          documents land in. Every one of them stays editable below. */}
      <Card title="Kind of job" icon={<Stack size={18}/>}
        subtitle={tpl ? `Creates ${tpl.folders.length} document folders — ${tpl.folders.slice(0, 5).join(', ')}${tpl.folders.length > 5 ? ` and ${tpl.folders.length - 5} more` : ''}` : undefined}>
        <div className="npTiles">
          {PROJECT_TEMPLATES.map((t) => {
            const on = templateKey === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className="npTile"
                data-tour={`job-type-${t.key}`}
                onClick={() => {
                  setTemplateKey(t.key);
                  if (!catTouched && !buildingType) { setType(t.projectType); setAuto(a=>({...a,cat:true})); }
                  setRetainage(String(t.retainagePct));
                  setContractType(t.contractType);
                }}
                aria-pressed={on}
              >
                <span className="npTileTitle">{t.name}</span>
                <span className="npTileText">{t.blurb}</span>
                <span className="npTileTags">
                  {[
                    `${t.retainagePct}% Retainage`,
                    t.contractType,
                    `${t.divisions.length} CSI Divisions`,
                    `${t.folders.length} Folders`,
                  ].map((chip) => <Badge key={chip}>{chip}</Badge>)}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <form id="np-form" onSubmit={create}>
        <div className="npSplit">
          <div className="npMain">
            <div className="npCols">
              <div>
                <Card title="Name and location" icon={<Buildings size={18}/>}>
                  <FormGrid cols={1}>
                    {/* WHERE IS THIS JOB? — the first thing asked, because the
                        answer decides everything the product shows next.
                        See lib/project-phase. */}
                    <Field label="Where is this job?" hint="Decides which steps the project shows first. Switch it the day you win.">
                      <div className="npTiles" role="group" aria-label="Where is this job?">
                        {PHASE_CHOICES.map((c) => (
                          <button key={c.value} type="button" className="npTile" onClick={() => setPhase(c.value)} aria-pressed={phase === c.value}>
                            <span className="npTileTitle">{c.title}</span>
                            <span className="npTileText">{c.detail}</span>
                          </button>
                        ))}
                      </div>
                    </Field>
                    {showDetails && (
                      <Field label="Sector" hint={sectorDef?.flags ? 'Public work — prevailing wage and public-agency compliance pre-set below.' : 'Filters building types and pre-sets compliance for public work.'}>
                        <div className="npChips" role="group" aria-label="Sector">
                          {SECTORS.map(s=>(
                            <button type="button" key={s.key} className="k-chip" aria-pressed={sector===s.key} onClick={()=>pickSector(s.key)}>{s.label}</button>
                          ))}
                        </div>
                      </Field>
                    )}
                    <Field label="Project name" required>
                      <Input data-tour="project-name" value={name} onChange={e=>setName(e.target.value)} required placeholder="e.g. Riverdale Medical Pavilion"/>
                    </Field>
                    {/* Number, building type, category and description are all seeded or
                        optional. Two fields is the promise; these are here when wanted. */}
                    {showDetails && (<>
                      <Field label="Project number" hint={auto.num ? (pf?.total>0 ? `Continues your ${year} sequence.` : 'Year-based sequence.') : 'Prints on G702s, subcontracts and transmittals.'}>
                        <Input value={projectNumber} onChange={e=>{setProjectNumber(e.target.value);setAuto(a=>({...a,num:false}));}} placeholder={`${year}-001`}/>
                      </Field>
                      <Field label="Building type" hint={sectorDef ? `${sectorBts.length} ${sectorDef.label} building types.` : undefined}>
                        <Select value={buildingType} onChange={e=>onBuildingTypeChange(e.target.value)} placeholder="Select building type…" options={[...sectorBts]}/>
                      </Field>
                      <Field label="Category" hint={auto.cat ? 'Set by the kind of job, refined by building type.' : undefined}>
                        <Select value={type} onChange={e=>{setType(e.target.value);setCatTouched(true);setAuto(a=>({...a,cat:false}));}} options={PROJECT_CATEGORIES}/>
                      </Field>
                      <Field label="Description">
                        <Textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Brief project description…"/>
                      </Field>
                    </>)}
                    <Field label="Project address" required>
                      <Input data-tour="project-address" value={address} onChange={e=>setAddress(e.target.value)} required placeholder="123 Main St, Phoenix, AZ 85001"/>
                    </Field>
                    {/* Defaults to the portfolio standard; only matters if it differs. */}
                    {showDetails && (
                      <Field label="State jurisdiction" hint="Sets lien-waiver forms, preliminary notice deadlines and wage rules.">
                        <Input value={stateJurisdiction} onChange={e=>{setJurisdictionTouched(true);setStateJurisdiction(e.target.value.toUpperCase());setAuto(a=>({...a,state:false}));}} maxLength={2} placeholder="AZ" style={{width:90}}/>
                      </Field>
                    )}
                  </FormGrid>
                </Card>

                {showDetails && (
                  <Card title="Compliance" icon={<ShieldCheck size={18}/>}>
                    <FormGrid cols={1}>
                      <Field label="Prevailing wage" hint="Turns on certified payroll (WH-347) tracking for every sub.">
                        <Select value={prevailingWage} onChange={e=>setPrevailingWage(e.target.value)} options={['No','Yes — Davis-Bacon','Yes — State Law']}/>
                      </Field>
                      <Field label="Public project" hint="Flags bond requirements and statutory retainage rules.">
                        <Select value={publicProject} onChange={e=>setPublicProject(e.target.value)} options={['No — Private','Yes — Public Agency']}/>
                      </Field>
                    </FormGrid>
                  </Card>
                )}
              </div>

              {showDetails && (
                <div>
                  <Card title="Contract & money" icon={<CurrencyDollar size={18}/>}>
                    <FormGrid cols={2}>
                      <Field label="Contract value" span hint={budgetNum>0 ? <>Reads as <b style={{color:'var(--text-primary)'}}>{fmt(budgetNum)}</b> — seeds the budget and prints as G702 line 1.</> : 'Seeds the budget and prints as G702 line 1.'}>
                        <Input value={budget} onChange={e=>setBudget(e.target.value)} placeholder="$1,250,000"/>
                      </Field>
                      <Field label="Contract type">
                        <Select value={contractType} onChange={e=>setContractType(e.target.value)} options={CONTRACT_TYPES}/>
                      </Field>
                      <Field label="Retainage %" hint={pf?.retMode && auto.ret ? `Your standard across ${pf.total} project${pf.total===1?'':'s'}.` : undefined}>
                        <Input type="number" value={retainage} onChange={e=>{setRetainage(e.target.value);setAuto(a=>({...a,ret:false}));}} min="0" max="20"/>
                      </Field>
                      <Field label="Award date"><DateInput value={awardDate} onChange={e=>setAwardDate(e.target.value)}/></Field>
                      <Field label="Notice to proceed"><DateInput value={ntpDate} onChange={e=>setNtpDate(e.target.value)}/></Field>
                      <Field label="Start date" hint={auto.start ? 'Defaulted to today.' : undefined}>
                        <DateInput value={startDate} onChange={e=>{setStartDate(e.target.value);setAuto(a=>({...a,start:false}));}}/>
                      </Field>
                      <Field label="Substantial completion"><DateInput value={subDate} onChange={e=>setSubDate(e.target.value)}/></Field>
                      <Field label="Final completion"><DateInput value={finalDate} onChange={e=>setFinalDate(e.target.value)}/></Field>
                    </FormGrid>
                  </Card>

                  <Card title="Team & contacts" icon={<UsersThree size={18}/>}>
                    <FormGrid cols={1}>
                      <Field label="Owner name" hint={ownerNames.length>0 ? `${ownerNames.length} owner${ownerNames.length===1?'':'s'} on file — start typing to reuse.` : undefined}>
                        <Suggest className="k-input" value={owner} onChange={e=>onOwnerChange(e.target.value)} placeholder="Desert Health Partners LLC" options={ownerNames} />
                      </Field>
                      <Field label="Owner email" hint={auto.ownerEmail ? 'From a prior project with this owner.' : 'G702 packets route here for approval.'}>
                        <Input type="email" value={ownerEmail} onChange={e=>{setOwnerEmail(e.target.value);setAuto(a=>({...a,ownerEmail:false}));}} placeholder="owner@example.com"/>
                      </Field>
                      <Field label="Architect / designer" hint={archNames.length>0 ? `${archNames.length} on file — start typing to reuse.` : undefined}>
                        <Suggest className="k-input" value={arch} onChange={e=>onArchChange(e.target.value)} placeholder="Sonoran Architecture Group" options={archNames} />
                      </Field>
                      <Field label="Architect email" hint={auto.archEmail ? 'From a prior project with this architect.' : undefined}>
                        <Input type="email" value={archEmail} onChange={e=>{setArchEmail(e.target.value);setAuto(a=>({...a,archEmail:false}));}} placeholder="arch@example.com"/>
                      </Field>
                    </FormGrid>
                  </Card>
                </div>
              )}
            </div>

            <div className="npFoot">
              <Button variant="primary" type="submit" icon={<ArrowRight size={15} weight="bold"/>} disabled={submitDisabled} onClick={() => { nextRef.current = 'takeoff'; }}>
                {saving?'Creating…':'Create & add drawings'}
              </Button>
              <Button type="submit" disabled={submitDisabled} onClick={() => { nextRef.current = 'overview'; }}>
                {saving?'Creating…':'Create without drawings'}
              </Button>
              <Button variant="ghost" onClick={() => setShowDetails(v => !v)}>
                {showDetails ? 'Hide contract details' : 'Add contract details'}
              </Button>
              {submitDisabled && !saving && <span className="npFootNote">Name and address are required.</span>}
            </div>
          </div>

          {/* Context rail — the job assembling itself */}
          <aside className="npRail" aria-label="Project preview">
            <ProjectPreview
              name={name}
              address={address}
              projectNumber={projectNumber || `${year}-001`}
              jurisdiction={stateJurisdiction}
              retainagePct={Number(retainage) || 10}
              contractType={contractType}
              templateName={tpl?.name ?? null}
              folders={tpl?.folders ?? []}
              divisionCount={tpl?.divisions.length ?? 0}
            />
            <Card title="Smart defaults" icon={<Sparkle size={18}/>}>
              <DetailList items={[
                ['Project number', projectNumber||null],
                ['Category', PROJECT_CATEGORIES.find(c=>c.value===type)?.label||type],
                ['Retainage', `${Number(retainage)||10}%`],
                ['Start date', fmtDate(startDate)],
                ['Jurisdiction', stateJurisdiction||null],
              ]}/>
            </Card>
          </aside>
        </div>
      </form>

      <UnsavedGuardModal guard={guard} />
    </PageShell>
  );
}
