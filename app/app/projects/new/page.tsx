'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { PHASE_CHOICES, type ProjectPhase } from '@/lib/project-phase';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '../../../../components/SaguaroDatePicker';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { PROJECT_TEMPLATES, templateByKey } from '@/lib/project-templates';
import SetupStepper from '@/components/projects/SetupStepper';
import ProjectPreview from '@/components/projects/ProjectPreview';
import { BUILDING_TYPES } from '@/lib/contractor-trades';
import { SECTORS } from '@/lib/taxonomy';
import { Plus, Buildings, MapPin, CalendarBlank, UsersThree, Sparkle, CurrencyDollar, ShieldCheck, Stack } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import Suggest from '@/components/ui/Suggest';

const GOLD='#F59E0B',DARK='#1c1c1e',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF';
const INPUT_STYLE = {width:'100%',padding:'10px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,outline:'none'};
const SELECT_STYLE = {...INPUT_STYLE,cursor:'pointer'};
const HINT:React.CSSProperties = {fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:6,lineHeight:1.45};
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

// ── Procore-style SECTOR differentiation: one prominent choice that filters
//    building types, derives the category, and pre-sets compliance flags
//    (Government/Education/Infrastructure -> prevailing wage + public agency).
//    The sector list itself lives in the single taxonomy module (@/lib/taxonomy
//    SECTORS) so every sector picker platform-wide shares one source.

const FIELD = ({label,auto,hint,children}:{label:string,auto?:boolean,hint?:React.ReactNode,children:React.ReactNode}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>{label}{auto && <AutoChip/>}</label>
    {children}
    {hint && <div style={HINT}>{hint}</div>}
  </div>
);

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
  const [type, setType] = useState('residential');
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
     down to change a default. Two-letter code, or the state spelled out. */
  const STATE_CODES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
  const STATE_NAMES: Record<string, string> = {
    alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA', colorado:'CO',
    connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA', hawaii:'HI', idaho:'ID',
    illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY', louisiana:'LA',
    maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN',
    mississippi:'MS', missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV',
    'new hampshire':'NH', 'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY',
    'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR',
    pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC', 'south dakota':'SD',
    tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT', virginia:'VA', washington:'WA',
    'west virginia':'WV', wisconsin:'WI', wyoming:'WY',
  };
  const stateFromAddress = (addr: string): string | null => {
    const lower = addr.toLowerCase();
    for (const [name, code] of Object.entries(STATE_NAMES)) {
      if (lower.includes(name)) return code;
    }
    /* Last standalone two-letter token that is a real state — "1 Test Street,
       Phoenix, AZ 85001" gives AZ without matching "St" or a street number. */
    const tokens = addr.toUpperCase().match(/[A-Z]{2}/g) || [];
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (STATE_CODES.includes(tokens[i])) return tokens[i];
    }
    return null;
  };

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

  // Which fields the system filled in (AUTO chips) vs. what the GC typed.
  const [auto, setAuto] = useState<{num?:boolean;cat?:boolean;ret?:boolean;start?:boolean;state?:boolean;ownerEmail?:boolean;archEmail?:boolean}>({ret:true,start:true,state:true});

  // This page has no projectId, so /api/project-context does not apply. The
  // portfolio itself is the context: numbering sequence, owner/architect
  // contact book, and house defaults (retainage, jurisdiction) all seed from
  // the projects the tenant already has.
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
   *    start date arm only after a manual edit clears their AUTO flag). The
   *    draft covers the whole intake form, AUTO chips included. ── */
  const createDirty =
    !!name.trim() || !!sector || !!buildingType || !!description.trim() || !!address.trim() ||
    !!budget.trim() || !!owner.trim() || !!ownerEmail.trim() || !!arch.trim() || !!archEmail.trim() ||
    !!awardDate || !!ntpDate || !!subDate || !!finalDate ||
    contractType !== 'Lump Sum GMP' ||
    prevailingWage !== 'No' || publicProject !== 'No — Private' ||
    (!auto.num && !!projectNumber.trim()) || (!auto.ret && retainage !== '10') ||
    !auto.state || !auto.start || (!auto.cat && type !== 'residential');
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
        }).catch(() => {});
        guard.clearDraft();
        router.push(`/app/projects/${d.projectId}/${nextRef.current === 'takeoff' ? 'takeoff' : 'overview'}`);
        return true;
      } else {
        setError(d.error || 'Failed to create project');
        setSaving(false);
        return false;
      }
    } catch (err) {
      setError('Network error — please try again');
      setSaving(false);
      return false;
    }
  }

  /* Name and address are the only required fields — the page has always said
     so. Everything else is pre-seeded, so it starts collapsed: five cards of
     inputs when two matter is why this reads as heavy. */
  const [showDetails, setShowDetails] = useState(false);
  /* Where the GC lands after Create. "and add drawings" goes straight to
     takeoff, which is the actual next thing on a real job — the old flow
     dropped everyone on Overview and left them to find it. */
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

  return (
    <PremiumSurface maxWidth={1400}>
      <style>{`
        .npSeg:active{transform:translateY(1px)!important;filter:brightness(.94)!important}
        @media (prefers-reduced-motion: reduce){.npSeg:active{transform:none!important}}
      `}</style>
      <ModuleHero
        eyebrow="New Project"
        eyebrowIcon={<Plus size={13} weight="fill" color={GOLD} />}
        title="Create"
        accent="New Project"
        subtitle="Type only what the system can't already know."
      />

      {/* Portfolio snapshot — what the system already knows before you type */}
      {pf && (
        <StatStrip items={[
          {href: '/app/projects/new', label:'Project Number', value: projectNumber || `${year}-001`, sub: pf.total>0 ? `next in your ${year} sequence` : `first in the ${year} sequence`},
          {href: '/app/projects/new', label:'This Contract', value: budgetNum>0 ? fmt(budgetNum) : '—', accent: budgetNum>0 ? '#3dd68c' : undefined, sub: contractType},
          {href: '/app/projects/new', label:'Retainage', value: `${Number(retainage)||10}%`, sub: pf.retMode && auto.ret ? 'your portfolio standard' : 'default — editable'},
          {href: '/app/projects/new', label:'Jurisdiction', value: stateJurisdiction || '—', sub:'lien waiver + wage rules'},
        ]}/>
      )}

      {/* Where you are, what is left, and that nothing is hidden. */}
      <SetupStepper
        active={!templateKey ? 1 : !(name.trim() && address.trim()) ? 2 : 3}
        steps={[
          { n: 1, title: 'Kind of job',   hint: tpl ? tpl.name : 'Sets retainage, folders and CSI spread', done: Boolean(templateKey) },
          { n: 2, title: 'Name and place', hint: name.trim() && address.trim() ? `${name.trim()} · ${stateJurisdiction}` : 'The only two required fields', done: Boolean(name.trim() && address.trim()) },
          { n: 3, title: 'Add drawings',  hint: 'Priced, budgeted and packaged for you', done: false },
        ]}
      />

      {error&&<div style={{background:'rgba(192,48,48,.1)',border:'1px solid rgba(192,48,48,.3)',borderRadius:10,padding:'12px 16px',marginBottom:20,fontSize:13,color:'#ff7070'}}>{error}</div>}

      {/* What kind of job. One choice that furnishes the rest — retainage, the
          contract type, the CSI spread the budget expects, and the folders the
          documents land in. Every one of them stays editable below; this is a
          starting point, not a lock. */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>
          Step 1 · What kind of job is this?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {PROJECT_TEMPLATES.map((t) => {
            const on = templateKey === t.key;
            return (
              <button
                key={t.key}
                type="button"
                data-tour={`job-type-${t.key}`}
                onClick={() => {
                  setTemplateKey(t.key);
                  setRetainage(String(t.retainagePct));
                  setContractType(t.contractType);
                }}
                aria-pressed={on}
                style={{
                  textAlign: 'left', cursor: 'pointer', padding: '15px 16px', borderRadius: 14,
                  background: on ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.03)',
                  border: on ? '1px solid rgba(245,158,11,0.65)' : '1px solid rgba(255,255,255,0.10)',
                  boxShadow: on ? '0 0 0 3px rgba(245,158,11,0.10)' : 'none',
                  transition: 'background .15s, border-color .15s, box-shadow .15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    width: 15, height: 15, borderRadius: 999, flexShrink: 0,
                    border: on ? '5px solid #F59E0B' : '1.5px solid rgba(255,255,255,0.30)',
                    background: on ? '#1A1206' : 'transparent',
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: on ? '#F59E0B' : '#F0F4FF' }}>{t.name}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.62)', marginBottom: 8 }}>{t.blurb}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.45, color: 'rgba(255,255,255,0.38)', fontStyle: 'italic' }}>{t.example}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {[
                    `${t.retainagePct}% retainage`,
                    t.contractType,
                    `${t.divisions.length} CSI divisions`,
                    `${t.folders.length} folders`,
                  ].map((chip) => (
                    <span key={chip} style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)',
                    }}>{chip}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        {tpl && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            Creates {tpl.folders.length} document folders — {tpl.folders.slice(0, 5).join(', ')}
            {tpl.folders.length > 5 ? ` and ${tpl.folders.length - 5} more` : ''}. All of it editable afterwards.
          </div>
        )}
      </div>

      <form onSubmit={create}>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 340px',gap:16,alignItems:'start'}}>
          {/* Form columns */}
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div>
                <SectionCard title="Step 2 · Name and location" icon={<Buildings size={17} weight="duotone" color={GOLD} />} style={{marginBottom:16}}>
                {showDetails && (
                  <FIELD label="Sector" hint={sectorDef?.flags ? 'Public-sector work — prevailing wage and public-agency compliance pre-set below.' : 'Filters building types, derives the category, and pre-sets compliance for public work.'}>
                    <div style={{display:'flex',flexWrap:'wrap' as const,gap:5,background:'rgba(255,255,255,0.04)',borderRadius:10,padding:4,border:'1px solid rgba(255,255,255,0.08)'}}>
                      {SECTORS.map(s=>{
                        const active = sector===s.key;
                        return (
                          <button type="button" key={s.key} onClick={()=>pickSector(s.key)} className="pmBtn npSeg"
                            style={{padding:'6px 12px',borderRadius:7,border:'none',cursor:'pointer',fontWeight:800,fontSize:11.5,whiteSpace:'nowrap' as const,
                              background:active?`linear-gradient(180deg,#FBBF24,${GOLD} 60%,#D97706)`:'transparent',color:active?'#1A1206':DIM,transition:'all .15s',
                              boxShadow:active?'0 2px 10px rgba(245,158,11,0.28), inset 0 1px 0 rgba(255,255,255,0.35)':'none'}}>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </FIELD>
                )}
                  {/* WHERE IS THIS JOB? — the first thing asked, because the
                      answer decides everything the product shows next. Users
                      kept asking "where do we start", and the reason was that
                      the journey rail taught one order (which assumed you had
                      already won) while the nav taught another. One question
                      resolves it. See lib/project-phase. */}
                  <FIELD label="Where is this job?" hint="Decides which steps the project shows you first. You can switch it the day you win.">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                      {PHASE_CHOICES.map((c) => {
                        const on = phase === c.value;
                        return (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setPhase(c.value)}
                            aria-pressed={on}
                            style={{
                              textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                              background: on ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${on ? 'rgba(245,158,11,0.55)' : 'rgba(255,255,255,0.12)'}`,
                              boxShadow: on ? '0 0 14px rgba(245,158,11,0.12)' : 'none',
                              transition: 'background .15s, border-color .15s',
                            }}
                          >
                            <div style={{ fontSize: 13.5, fontWeight: 800, color: on ? '#FBBF24' : '#FFFFFF', marginBottom: 3 }}>{c.title}</div>
                            <div style={{ fontSize: 11.5, color: '#CBD5E1', lineHeight: 1.45 }}>{c.detail}</div>
                          </button>
                        );
                      })}
                    </div>
                  </FIELD>
                  <FIELD label="Project Name"><input data-tour="project-name" value={name} onChange={e=>setName(e.target.value)} required placeholder="e.g. Riverdale Medical Pavilion" style={INPUT_STYLE}/></FIELD>
                {/* Number, building type, category and description are all seeded or
                    optional. Two fields is the promise; these are here when wanted. */}
                {showDetails && (<>
                  <FIELD label="Project Number" auto={auto.num} hint={pf?.total>0 ? `Continues your ${year} sequence — prints on G702s, subcontracts and transmittals.` : 'Year-based sequence — prints on G702s, subcontracts and transmittals.'}>
                    <input value={projectNumber} onChange={e=>{setProjectNumber(e.target.value);setAuto(a=>({...a,num:false}));}} placeholder={`${year}-001`} style={INPUT_STYLE}/>
                  </FIELD>
                  <FIELD label="Building Type" hint={sectorDef ? `Showing ${sectorBts.length} ${sectorDef.label} building types — feeds takeoff assemblies, budget templates and bid intelligence.` : 'Feeds takeoff assemblies, budget templates and bid intelligence.'}>
                    <select value={buildingType} onChange={e=>onBuildingTypeChange(e.target.value)} style={SELECT_STYLE}>
                      <option value="">Select building type…</option>
                      {sectorBts.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </FIELD>
                  <FIELD label="Category" auto={auto.cat} hint="Derived from building type — drives reporting and bid history matching.">
                    <select value={type} onChange={e=>{setType(e.target.value);setAuto(a=>({...a,cat:false}));}} style={SELECT_STYLE}>
                      {PROJECT_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </FIELD>
                  <FIELD label="Description"><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Brief project description..." style={{...INPUT_STYLE,resize:'vertical' as const}}/></FIELD>
                </>)}
                </SectionCard>

                <SectionCard title="Location" icon={<MapPin size={17} weight="duotone" color={GOLD} />} style={{marginBottom:16}}>
                  <FIELD label="Project Address"><input data-tour="project-address" value={address} onChange={e=>setAddress(e.target.value)} required placeholder="123 Main St, Phoenix, AZ 85001" style={INPUT_STYLE}/></FIELD>
                {/* Defaults to the portfolio standard; only matters if it differs. */}
                {showDetails && (
                  <FIELD label="State Jurisdiction" auto={auto.state} hint="Sets statutory lien-waiver forms, preliminary notice deadlines and wage rules.">
                    <input value={stateJurisdiction} onChange={e=>{setJurisdictionTouched(true);setStateJurisdiction(e.target.value.toUpperCase());setAuto(a=>({...a,state:false}));}} maxLength={2} placeholder="AZ" style={{...INPUT_STYLE,width:90,textTransform:'uppercase' as const}}/>
                  </FIELD>
                )}
                </SectionCard>

                {showDetails && (
                <SectionCard title="Compliance" icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}>
                  <FIELD label="Prevailing Wage" hint="Davis-Bacon or state law turns on certified payroll (WH-347) tracking for every sub.">
                    <select value={prevailingWage} onChange={e=>setPrevailingWage(e.target.value)} style={SELECT_STYLE}>
                      <option>No</option><option>Yes — Davis-Bacon</option><option>Yes — State Law</option>
                    </select>
                  </FIELD>
                  <FIELD label="Public Project" hint="Public-agency work flags bond requirements and statutory retainage rules.">
                    <select value={publicProject} onChange={e=>setPublicProject(e.target.value)} style={SELECT_STYLE}>
                      <option>No — Private</option><option>Yes — Public Agency</option>
                    </select>
                  </FIELD>
                </SectionCard>
                )}
              </div>

              <div>
                {showDetails && (<>
                <SectionCard title="Contract & Money" icon={<CurrencyDollar size={17} weight="duotone" color={GOLD} />} style={{marginBottom:16}}>
                  <FIELD label="Contract Value" hint={budgetNum>0 ? <>Reads as <b style={{color:TEXT}}>{fmt(budgetNum)}</b> — seeds the budget and prints as G702 line 1.</> : 'Seeds the budget and prints as G702 line 1 — refine after buyout.'}>
                    <input value={budget} onChange={e=>setBudget(e.target.value)} placeholder="$1,250,000" style={INPUT_STYLE}/>
                  </FIELD>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                    <FIELD label="Contract Type">
                      <select value={contractType} onChange={e=>setContractType(e.target.value)} style={SELECT_STYLE}>
                        {['Lump Sum GMP','Cost Plus Fixed Fee','Cost Plus Percentage','Unit Price','Design-Build'].map(t=><option key={t}>{t}</option>)}
                      </select>
                    </FIELD>
                    <FIELD label="Retainage %" auto={auto.ret} hint={pf?.retMode && auto.ret ? `Your standard across ${pf.total} project${pf.total===1?'':'s'} — held on every pay app.` : 'Industry default — held on every pay app, editable per contract.'}>
                      <input type="number" value={retainage} onChange={e=>{setRetainage(e.target.value);setAuto(a=>({...a,ret:false}));}} min="0" max="20" style={INPUT_STYLE}/>
                    </FIELD>
                  </div>
                  <div style={{fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,margin:'2px 0 10px',display:'flex',alignItems:'center',gap:6}}>
                    <CalendarBlank size={14} weight="duotone" color={GOLD}/> Contract Milestones
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                    <FIELD label="Award Date"><SaguaroDatePicker value={awardDate} onChange={setAwardDate} style={INPUT_STYLE}/></FIELD>
                    <FIELD label="Notice to Proceed"><SaguaroDatePicker value={ntpDate} onChange={setNtpDate} style={INPUT_STYLE}/></FIELD>
                    <FIELD label="Start Date" auto={auto.start} hint="Defaulted to today — adjust freely.">
                      <SaguaroDatePicker value={startDate} onChange={v=>{setStartDate(v);setAuto(a=>({...a,start:false}));}} style={INPUT_STYLE}/>
                    </FIELD>
                    <FIELD label="Substantial Completion"><SaguaroDatePicker value={subDate} onChange={setSubDate} style={INPUT_STYLE}/></FIELD>
                    <FIELD label="Final Completion"><SaguaroDatePicker value={finalDate} onChange={setFinalDate} style={INPUT_STYLE}/></FIELD>
                  </div>
                </SectionCard>

                <SectionCard title="Team & Contacts" icon={<UsersThree size={17} weight="duotone" color={GOLD} />}>
                  <FIELD label="Owner Name" hint={ownerNames.length>0 ? `${ownerNames.length} owner${ownerNames.length===1?'':'s'} on file — start typing to reuse.` : 'Owner approvals and pay-app routing start here.'}>
                    <Suggest value={owner} onChange={e=>onOwnerChange(e.target.value)} placeholder="Desert Health Partners LLC" style={INPUT_STYLE} options={['n']} />
                  </FIELD>
                  <FIELD label="Owner Email" auto={auto.ownerEmail} hint={auto.ownerEmail ? 'Pulled from a prior project with this owner.' : 'G702 packets route here for one-click approval.'}>
                    <input value={ownerEmail} onChange={e=>{setOwnerEmail(e.target.value);setAuto(a=>({...a,ownerEmail:false}));}} placeholder="owner@example.com" style={INPUT_STYLE}/>
                  </FIELD>
                  <FIELD label="Architect / Designer" hint={archNames.length>0 ? `${archNames.length} on file — start typing to reuse.` : undefined}>
                    <Suggest value={arch} onChange={e=>onArchChange(e.target.value)} placeholder="Sonoran Architecture Group" style={INPUT_STYLE} options={['n']} />
                  </FIELD>
                  <FIELD label="Architect Email" auto={auto.archEmail} hint={auto.archEmail ? 'Pulled from a prior project with this architect.' : undefined}>
                    <input value={archEmail} onChange={e=>{setArchEmail(e.target.value);setAuto(a=>({...a,archEmail:false}));}} placeholder="arch@example.com" style={INPUT_STYLE}/>
                  </FIELD>
                </SectionCard>
                </>)}
              </div>
            </div>

            <div style={{marginTop:18,marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:800,letterSpacing:'0.09em',textTransform:'uppercase',color:GOLD,marginBottom:6}}>
                Step 3 · Add your drawings
              </div>
              <div style={{fontSize:12.5,color:'rgba(255,255,255,0.5)',lineHeight:1.5,maxWidth:560}}>
                Drop the plan set on the next screen and Saguaro measures every trade, prices it, and writes
                your budget and bid packages from it. You can skip it and add plans later.
              </div>
            </div>

            <div style={{display:'flex',gap:12,alignItems:'center',marginTop:6,flexWrap:'wrap' as const}}>
              <button type="submit" data-tour="create-project-submit" onClick={() => { nextRef.current = 'takeoff'; }}
                disabled={submitDisabled} className="pmBtn"
                style={{...goldButtonStyle,padding:'13px 32px',fontSize:15,cursor:submitDisabled?'not-allowed':'pointer',opacity:submitDisabled?0.6:1}}>
                {saving?'Creating…':'Create & add drawings →'}
              </button>

              <button type="submit" onClick={() => { nextRef.current = 'overview'; }}
                disabled={submitDisabled}
                style={{padding:'13px 26px',background:'transparent',border:'1px solid rgba(255,255,255,0.18)',
                        borderRadius:10,color:'rgba(255,255,255,0.72)',fontWeight:700,fontSize:14,minHeight:44,
                        cursor:submitDisabled?'not-allowed':'pointer',opacity:submitDisabled?0.6:1}}>
                {saving?'Creating…':'Create without drawings'}
              </button>


              <button type="button" onClick={() => setShowDetails(v => !v)}
                style={{padding:'13px 20px',background:'transparent',border:'1px solid rgba(255,255,255,0.14)',
                        borderRadius:10,color:'rgba(255,255,255,0.7)',fontWeight:600,fontSize:13,minHeight:44,cursor:'pointer'}}>
                {showDetails ? 'Hide contract details' : 'Add contract details'}
              </button>
              <button type="button" onClick={()=>guard.requestClose(()=>router.back())} className="pmBtn" style={{...ghostButtonStyle,padding:'13px 20px'}}>
                Cancel
              </button>
              {submitDisabled && !saving && (
                <span style={{fontSize:12,color:'rgba(255,255,255,0.45)'}}>Name and address are required — everything else is pre-seeded or optional.</span>
              )}
            </div>
          </div>

          {/* Context rail — the job assembling itself, then what that means */}
          <div style={{position:'sticky' as const,top:80,display:'flex',flexDirection:'column',gap:16}}>
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
            <SectionCard flat title="What Gets Created" icon={<Stack size={17} weight="duotone" color={GOLD} />} bodyStyle={{padding:'6px 20px 20px'}}>
              <FlowSteps title="" steps={[
                {title:'Project workspace', desc:'Overview, directory, documents, daily logs and photo feed — live the moment you hit Create.'},
                {title:'Budget & bid packages', desc:'CSI-coded budget lines and trade bid packages — sub awards commit dollars automatically.'},
                {title:'Schedule & field tools', desc:'Baseline schedule plus RFIs, submittals, punch lists and safety checklists, wired to this project.'},
                {title:'Billing — G702 pay apps', desc:'AIA G702/G703 applications with retainage math and automatic lien waivers for every sub.'},
              ]}/>
            </SectionCard>

            <SectionCard flat title="Smart Defaults" icon={<Sparkle size={17} weight="duotone" color={GOLD} />}>
              <InsightRow label="Project number" value={projectNumber||'—'} accent={GOLD} strong/>
              <InsightRow label="Category" value={PROJECT_CATEGORIES.find(c=>c.value===type)?.label||type}/>
              <InsightRow label="Retainage" value={`${Number(retainage)||10}%`}/>
              <InsightRow label="Start date" value={fmtDate(startDate)}/>
              <InsightRow label="Jurisdiction" value={stateJurisdiction||'—'}/>
              <div style={{fontSize:11.5,color:'rgba(255,255,255,0.45)',lineHeight:1.5,marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                AUTO chips mark what Saguaro pre-filled. Every value stays editable — nothing locks until you create the project.
              </div>
            </SectionCard>

            <div style={{background:'rgba(245, 158, 11,.06)',border:'1px solid rgba(245, 158, 11,.2)',borderRadius:12,padding:'14px 18px',fontSize:13,color:DIM,display:'flex',gap:10,alignItems:'flex-start'}}>
              <Sparkle size={16} weight="fill" color={GOLD} style={{flexShrink:0,marginTop:2}}/>
              <div>
                <strong style={{color:TEXT}}>AI Auto-Build on First Award:</strong> when the first bid is awarded, Saguaro automatically creates 24 schedule tasks, a CSI-coded budget, sub packages, a safety plan, QC checkpoints and the contact directory.
              </div>
            </div>
          </div>
        </div>

        </form>

      <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
