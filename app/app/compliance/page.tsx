'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { DataTable, type Column } from '@/components/ui/kit';
import { StatusPill } from '@/components/ui/Status';
import Link from 'next/link';
import { ShieldCheck, Gauge, CheckCircle, WarningCircle, XCircle, FileText, Signature, MagnifyingGlass, Envelope, UsersThree, ArrowRight, Check, X, Warning } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, IconChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { FlatStyles, FlatList, Row } from '@/components/ui/flat';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_INSURANCE_EXPIRING } from '@/lib/suggestions';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='var(--text-primary)',GREEN='var(--success)',RED='var(--danger)',AMBER='var(--warning)';

function ScoreBar({score}:{score:number}){
  const color = score>=80?GREEN:score>=50?AMBER:RED;
  return <div style={{display:'flex',alignItems:'center',gap:8}}>
    <div style={{flex:1,height:6,background:'var(--bg-surface-2)',borderRadius:3,overflow:'hidden'}}>
      <div style={{height:'100%',background:color,width:score+'%',borderRadius:3}}/>
    </div>
    <span style={{fontSize:12,fontWeight:700,color,minWidth:30}}>{score}</span>
  </div>;
}

function Badge({label,color,bg}:{label:string,color:string,bg:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color}}>{label}</span>;
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
  const PI = { good: <Check size={11} weight="bold" />, warn: <Warning size={11} weight="fill" />, bad: <X size={11} weight="bold" /> };
  const w9Status = (sub: any) => sub.w9.status === 'submitted' || sub.w9.status === 'approved' ? 'on_file' : sub.w9.status === 'pending' ? 'pending' : 'missing';
  const columns: Column<any>[] = [
    {
      key: 'name', header: 'Subcontractor', primary: true, phone: 'show', accessor: sub => sub.name || '',
      render: sub => (
        <span className="k-name">
          <span className="k-avatar" aria-hidden>{(sub.name || '?').split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() || '').join('')}</span>
          <span className="k-name-text"><span>{sub.name}</span>{sub.email && <span>{sub.email}</span>}</span>
        </span>
      ),
    },
    { key: 'trade', header: 'Trade', phone: 'show', accessor: sub => sub.trade || '', render: sub => sub.trade || '—' },
    { key: 'contract_amount', header: 'Contract', align: 'right', phone: 'show', accessor: sub => (Number(sub.contract_amount) || 0) > 0 ? Number(sub.contract_amount) : null, render: sub => Number(sub.contract_amount) > 0 ? <span style={{ color: TEXT, fontWeight: 600 }}>{fmtMoney(sub.contract_amount)}</span> : '—' },
    { key: 'score', header: 'Score', phone: 'show', accessor: sub => Number(sub.score) || 0, render: sub => <span style={{ display: 'inline-block', minWidth: 120 }}><ScoreBar score={sub.score} /></span> },
    { key: 'w9', header: 'W-9', phone: 'show', accessor: sub => ({ on_file: 2, pending: 1, missing: 0 } as Record<string, number>)[w9Status(sub)], render: sub => { const st = w9Status(sub); return <StatusPill module="paperwork" status={st} size="sm" icon={st === 'on_file' ? PI.good : st === 'pending' ? PI.warn : PI.bad} />; } },
    { key: 'insurance', header: 'Insurance', phone: 'show', accessor: sub => sub.insurance.active_certs === 0 ? 0 : sub.insurance.expiring_certs > 0 ? 1 : 2,
      render: sub => sub.insurance.active_certs === 0
        ? <StatusPill module="paperwork" status="not_on_file" label="None on File" size="sm" icon={PI.bad} />
        : sub.insurance.expiring_certs > 0
          ? <StatusPill module="paperwork" status="expiring" label={`${sub.insurance.expiring_certs} Expiring`} size="sm" icon={PI.warn} />
          : <StatusPill module="paperwork" status="active" label={`${sub.insurance.active_certs} Active`} size="sm" icon={PI.good} /> },
    { key: 'lien_waivers', header: 'Lien Waivers', phone: 'hide', accessor: sub => sub.lien_waivers.total === 0 ? null : sub.lien_waivers.signed / sub.lien_waivers.total, render: sub => sub.lien_waivers.total === 0 ? '—' : `${sub.lien_waivers.signed}/${sub.lien_waivers.total} signed` },
    { key: 'compliance', header: 'Status', phone: 'show', accessor: sub => ({ compliant: 2, at_risk: 1, non_compliant: 0 } as Record<string, number>)[sub.compliance] ?? 0, render: sub => <StatusPill module="compliance" status={sub.compliance} size="sm" icon={sub.compliance === 'compliant' ? PI.good : sub.compliance === 'at_risk' ? PI.warn : PI.bad} /> },
  ];

  // Cross-project intelligence — what the paperwork means in dollars and follow-ups.
  // contract_amount can round-trip as a string, so every sum coerces with Number().
  const fmtMoney = (n:number) => '$' + (Math.round(Number(n)||0)).toLocaleString('en-US');
  const totalContract = subs.reduce((t,s)=>t+(Number(s.contract_amount)||0),0);
  const exposure = subs.filter(s=>s.compliance!=='compliant').reduce((t,s)=>t+(Number(s.contract_amount)||0),0);
  const tradeCount = new Set(subs.map(s=>s.trade).filter(Boolean)).size;
  const w9Missing = subs.filter(s=>!(s.w9?.status==='submitted'||s.w9?.status==='approved')).length;
  const noInsurance = subs.filter(s=>(Number(s.insurance?.active_certs)||0)===0).length;
  const certsExpiring = subs.reduce((t,s)=>t+(Number(s.insurance?.expiring_certs)||0),0);
  const waiversPending = subs.reduce((t,s)=>t+(Number(s.lien_waivers?.pending)||0),0);
  const countFor = (f:string) => f==='all' ? subs.length : subs.filter(s=>s.compliance===f).length;

  const complianceLabel = (c:string) => c==='compliant'?'Compliant':c==='at_risk'?'At Risk':'Non-Compliant';
  const complianceColor = (c:string) => c==='compliant'?GREEN:c==='at_risk'?AMBER:RED;
  const complianceBg = (c:string) => c==='compliant'?'rgba(74,222,128,.14)':c==='at_risk'?'rgba(251,191,36,.14)':'rgba(248,113,113,.14)';

  return <PremiumSurface maxWidth={2200}>

    {/* Header */}
    <ModuleHero
      eyebrow="Compliance"
      eyebrowIcon={<IconChip size={24} vivid={moduleAccent('compliance').vivid ?? moduleAccent('compliance').hex}><ShieldCheck size={13} weight="fill" color="var(--text-primary)" /></IconChip>}
      accentColor={moduleAccent('compliance').hex}
      title="Subcontractor"
      accent="Compliance"
      subtitle="W-9, insurance, and lien waiver scorecard across your subcontractors."
      note="Expired COI = your problem"
    />

    {/* THE OTHER TWO COMPLIANCE SCREENS.
        app/app/compliance/lien-deadlines (515 lines) and
        app/app/compliance/prevailing-wage (493 lines) are finished, working
        pages that nothing in the codebase linked to — not the sidebar, not
        this page, which is their own parent route. The only way to reach
        either was to type the URL. */}
    <div style={{marginBottom:22}}>
      <FlatStyles />
      <FlatList label="More compliance">
        {[
          {href:'/app/compliance/lien-deadlines', title:'Lien Deadlines', sub:'Statutory dates by state — miss one and the lien right is gone'},
          {href:'/app/compliance/prevailing-wage', title:'Prevailing Wage', sub:'Davis-Bacon rates and certified payroll status'},
        ].map(l=>(
          <li key={l.href}><Row title={l.title} meta={l.sub} href={l.href} /></li>
        ))}
      </FlatList>
    </div>

    {/* Risk intelligence strip — the paperwork translated into dollars */}
    {!loading&&subs.length>0&&<StatStrip items={[
      {href: '/app/compliance', label:'Subcontractors', value:subs.length, sub:`Across ${tradeCount} trade${tradeCount===1?'':'s'}`},
      {href: '/app/compliance', label:'Contract Exposure', value:fmtMoney(exposure), accent:exposure>0?RED:GREEN, sub:totalContract>0?`Of ${fmtMoney(totalContract)} committed sits with non-compliant subs`:'Held by non-compliant subs'},
      {href: '/app/compliance', label:'W-9s Missing', value:w9Missing, accent:w9Missing>0?AMBER:GREEN, sub:w9Missing>0?'Blocks 1099 filing at year end':'Every sub is 1099-ready'},
      /* The sub-line branches on THIS stat's own value, like every other tile
         in the strip. It used to branch on certsExpiring, so a portfolio with
         four uninsured subs and nothing expiring printed "no uninsured subs on
         site" directly under the number 4. A tile that contradicts itself
         teaches people to stop reading the tiles. */
      {href: '/app/compliance', label:'Insurance Gaps', value:noInsurance, accent:noInsurance>0?RED:GREEN,
       sub: noInsurance>0
         ? `${noInsurance} sub${noInsurance===1?'':'s'} with no current COI${certsExpiring>0?` · ${certsExpiring} more expiring in 30d`:''}`
         : certsExpiring>0
           ? `${certsExpiring} cert${certsExpiring===1?'':'s'} expiring in 30d`
           : 'No uninsured subs on site'},
      {href: '/app/compliance', label:'Waivers Pending', value:waiversPending, accent:waiversPending>0?AMBER:GREEN, sub:waiversPending>0?'Unsigned — hold payment until released':'Lien rights fully released'},
    ]}/>}

    {/* Summary KPIs */}
    {summary&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,marginBottom:24}}>
      <StatCard
        icon={<Gauge size={19} weight="duotone" color={GOLD} />}
        label="Avg Compliance Score" value={typeof summary.avg_score==='number'?summary.avg_score+'%':'—'}
        accent={typeof summary.avg_score!=='number'?undefined:summary.avg_score>=80?GREEN:summary.avg_score>=50?AMBER:RED}
        sub={typeof summary.avg_score==='number'?'Portfolio average':'No subs scored yet'} delay={0.02}
       href="/app/compliance"/>
      <StatCard
        icon={<CheckCircle size={19} weight="duotone" color={GREEN} />}
        label="Compliant" value={summary.compliant} accent={GREEN}
        sub="Fully compliant" delay={0.06}
       href="/app/compliance"/>
      <StatCard
        icon={<WarningCircle size={19} weight="duotone" color={AMBER} />}
        label="At Risk" value={summary.at_risk} accent={AMBER}
        sub="Needs attention" delay={0.10}
       href="/app/compliance"/>
      <StatCard
        icon={<XCircle size={19} weight="duotone" color={RED} />}
        label="Non-Compliant" value={summary.non_compliant} accent={RED}
        sub="Action required" delay={0.14}
       href="/app/compliance"/>
    </div>}

    {/* Scorecard + detail split */}
    <div style={{display:'grid',gridTemplateColumns:selected?'1fr 360px':'1fr',gap:20,transition:'grid-template-columns .2s',alignItems:'start'}}>
      {/* NudgeRing pulses the scorecard when the suggestion engine flags an
          expired / expiring insurance certificate (ticker deep links land on
          this anchor). */}
      <NudgeRing anchorId={ANCHOR_INSURANCE_EXPIRING} style={{minWidth:0}}>
      <SectionCard
        icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}
        title="Compliance Scorecard"
        subtitle="Click a subcontractor to view the score breakdown"
      >
        {/* Search + filter toolbar */}
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
          <div style={{position:'relative',flex:'0 0 auto'}}>
            <MagnifyingGlass size={15} weight="bold" color={DIM} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}} />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search subcontractors…" style={{padding:'8px 14px 8px 34px',background:'rgba(255,255,255,0.04)',border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:13,outline:'none',width:240}}/>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {(['all','compliant','at_risk','non_compliant'] as const).map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:'6px 14px',background:filter===f?'color-mix(in srgb, var(--brand-primary) 15%, transparent)':'rgba(255,255,255,0.04)',border:`1px solid ${filter===f?'color-mix(in srgb, var(--brand-primary) 40%, transparent)':BORDER}`,borderRadius:9,color:filter===f?GOLD:DIM,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                {f==='all'?'All':complianceLabel(f)} ({countFor(f)})
              </button>
            ))}
          </div>
        </div>

        {loading?<div style={{textAlign:'center',padding:40,color:DIM}}>Loading compliance data…</div>
        :filtered.length===0?<PremiumEmpty
            icon={<ShieldCheck size={30} weight="duotone" color={GOLD} />}
            title={search||filter!=='all'?'No matching subcontractors':'No subcontractors found'}
            description={search||filter!=='all'?'Try clearing your search or filter to see all subcontractors.':'Add subs to your projects and Saguaro scores each one automatically — W-9 (25 pts), insurance certificates (40 pts), and lien waivers (35 pts) roll into a single compliance score across every project.'}
            compact
          />
        :<DataTable<any>
          columns={columns}
          rows={filtered}
          rowKey={sub => sub.id}
          defaultSort={{ key: 'score', dir: 'asc' }}
          onRowClick={sub => setSelected(selected?.id === sub.id ? null : sub)}
          isSelected={sub => selected?.id === sub.id}
          empty="No subcontractors match."
        />}
      </SectionCard>
      </NudgeRing>

      {selected&&<SectionCard
        icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}
        title={selected.name}
        action={<button onClick={()=>setSelected(null)} style={{background:'rgba(255,255,255,0.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:16,cursor:'pointer',lineHeight:1,width:28,height:28,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>×</button>}
      >
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,color:DIM,marginBottom:6}}>Compliance Score</div>
          <ScoreBar score={selected.score}/>
          <div style={{marginTop:6}}><Badge label={complianceLabel(selected.compliance)} color={complianceColor(selected.compliance)} bg={complianceBg(selected.compliance)}/></div>
          <div style={{fontSize:11,color:DIM,marginTop:8,lineHeight:1.5}}>Score = W-9 (25 pts) + insurance (40 pts) + lien waivers (35 pts). 80+ is compliant; under 50 is non-compliant.</div>
          <div style={{marginTop:10}}>
            <InsightRow label="Contract Value" value={Number(selected.contract_amount)>0?fmtMoney(selected.contract_amount):'—'} accent={selected.compliance!=='compliant'&&Number(selected.contract_amount)>0?RED:undefined} strong/>
            {totalContract>0&&Number(selected.contract_amount)>0&&<InsightRow label="Share of Committed" value={`${Math.round((Number(selected.contract_amount)/totalContract)*100)}%`}/>}
          </div>
        </div>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:700,color:GOLD,marginBottom:10}}><FileText size={15} weight="duotone" color={GOLD} /> W-9 Status</div>
          <StatusDot ok={selected.w9.status==='submitted'||selected.w9.status==='approved'} warn={selected.w9.status==='pending'} label={selected.w9.status==='submitted'||selected.w9.status==='approved'?'W-9 on file':selected.w9.status==='pending'?'W-9 requested — awaiting return':'W-9 not on file'}/>
          <div style={{fontSize:11,color:DIM,marginTop:6}}>Score contribution: {selected.w9.score}/25 pts</div>
        </div>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:700,color:GOLD,marginBottom:10}}><ShieldCheck size={15} weight="duotone" color={GOLD} /> Insurance</div>
          <StatusDot ok={selected.insurance.has_gl} label={selected.insurance.has_gl?'General Liability — Active':'General Liability — Missing'}/>
          <div style={{marginTop:6}}><StatusDot ok={selected.insurance.has_wc} label={selected.insurance.has_wc?'Workers Comp — Active':'Workers Comp — Missing'}/></div>
          {selected.insurance.expiring_certs>0&&<div style={{marginTop:6,fontSize:12,color:AMBER}}>{selected.insurance.expiring_certs} cert(s) expiring within 30 days</div>}
          <div style={{fontSize:11,color:DIM,marginTop:6}}>Score contribution: {selected.insurance.score}/40 pts</div>
        </div>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:700,color:GOLD,marginBottom:10}}><Signature size={15} weight="duotone" color={GOLD} /> Lien Waivers</div>
          {selected.lien_waivers.total===0
            ?<div style={{fontSize:13,color:DIM}}>No lien waivers on record</div>
            :<div>
              <StatusDot ok={selected.lien_waivers.pending===0} warn={selected.lien_waivers.pending>0&&selected.lien_waivers.signed>0} label={`${selected.lien_waivers.signed} of ${selected.lien_waivers.total} signed`}/>
              {selected.lien_waivers.pending>0&&<div style={{fontSize:12,color:AMBER,marginTop:4}}>{selected.lien_waivers.pending} waiver(s) pending signature</div>}
            </div>}
          <div style={{fontSize:11,color:DIM,marginTop:6}}>Score contribution: {selected.lien_waivers.score}/35 pts</div>
        </div>
        {(()=>{
          const gaps:{title:string;desc?:string}[] = [];
          if(!(selected.w9.status==='submitted'||selected.w9.status==='approved')) gaps.push({title:'Collect the W-9', desc:selected.w9.status==='pending'?'Already requested — chase the sub for the signed form.':'Worth 25 pts and required before 1099 season.'});
          if(!selected.insurance.has_gl) gaps.push({title:'Get a General Liability cert', desc:'20 pts — an uninsured sub on site is uncovered GC risk.'});
          if(!selected.insurance.has_wc) gaps.push({title:'Get a Workers Comp cert', desc:'20 pts — required before crews mobilize in most states.'});
          if(selected.insurance.expiring_certs>0) gaps.push({title:`Renew ${selected.insurance.expiring_certs} expiring cert${selected.insurance.expiring_certs===1?'':'s'}`, desc:'Inside the 30-day window — renew before coverage lapses.'});
          if(selected.lien_waivers.pending>0) gaps.push({title:`Chase ${selected.lien_waivers.pending} unsigned waiver${selected.lien_waivers.pending===1?'':'s'}`, desc:'Unreleased lien rights — hold payment until signed.'});
          return gaps.length>0
            ? <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:12}}><FlowSteps title="Fix Next" steps={gaps}/></div>
            : <div style={{background:'rgba(74,222,128,.08)',border:'1px solid rgba(74,222,128,.3)',borderRadius:10,padding:'10px 14px',marginBottom:12,fontSize:12.5,color:GREEN}}>Fully compliant — W-9 on file, insurance active, waivers signed.</div>;
        })()}
        <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
          {selected.email&&<a href={`mailto:${selected.email}?subject=Compliance%20Follow-Up`} className="pmBtn" style={{...goldButtonStyle,width:'100%'}}><Envelope size={15} weight="bold" /> Email Sub</a>}
          {selected.project_id&&<Link href={`/app/projects/${selected.project_id}/team`} className="pmBtn" style={{...ghostButtonStyle,width:'100%'}}><UsersThree size={15} weight="bold" /> View Project Team <ArrowRight size={13} weight="bold" /></Link>}
        </div>
      </SectionCard>}
    </div>
  </PremiumSurface>;
}
