'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';
import { Brain, Robot, Mailbox, ChartBar } from '@phosphor-icons/react';

const GOLD='var(--brand-primary)',DARK='#101722',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.08)',DIM='var(--text-secondary)',TEXT='#FFFFFF';

export default function BidsPage() {
  const [tab, setTab] = useState<'active'|'pipeline'|'history'>('active');
  const opportunities = [
    {id:'op-1',title:'Desert Ridge Medical Office — 12,000 SF',trade:'Commercial',value:2100000,fitScore:45,winPct:28,due:'2026-03-20',action:'investigate'},
    {id:'op-2',title:'Ahwatukee Custom Home — 3,400 SF',trade:'Residential',value:561000,fitScore:88,winPct:72,due:'2026-03-25',action:'bid'},
    {id:'op-3',title:'Mesa Kitchen & Bath Remodel',trade:'Remodel',value:94000,fitScore:95,winPct:85,due:'2026-04-01',action:'bid'},
    {id:'op-4',title:'Phoenix Office Buildout — 8,000 SF',trade:'Commercial',value:890000,fitScore:32,winPct:18,due:'2026-04-05',action:'pass'},
    {id:'op-5',title:'Scottsdale Addition — 700 SF Casita',trade:'Addition',value:118000,fitScore:92,winPct:80,due:'2026-04-10',action:'bid'},
  ];

  return (
    <div className="mkt-page" style={{padding:'24px 28px',maxWidth:1300,margin:'0 auto'}}>
      <MarketingNav />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontWeight:600,color:TEXT,margin:0,letterSpacing:-0.4}}>Bid Center</h1>
          <div style={{fontSize:13,color:DIM,marginTop:4}}>AI-scored opportunities and active bid packages.</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <Link href="/app/intelligence" style={{padding:'9px 16px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,fontWeight:500,textDecoration:'none'}}><Brain size={15} weight="duotone" style={{verticalAlign:'-3px'}} /> Bid Intelligence</Link>
          <Link href="/app/intelligence" style={{padding:'9px 18px',background:GOLD,border:'none',borderRadius:8,color:DARK,fontSize:13,fontWeight:600,cursor:'pointer',textDecoration:'none'}}>+ Score Opportunity</Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:2,borderBottom:`1px solid ${BORDER}`,marginBottom:24}}>
        {(['active','pipeline','history'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'10px 18px',border:'none',borderBottom:`2px solid ${tab===t?TEXT:'transparent'}`,background:'transparent',color:tab===t?TEXT:DIM,fontSize:13,fontWeight:tab===t?600:500,cursor:'pointer',textTransform:'capitalize' as const}}>
            {t==='active'?'Active Packages':t==='pipeline'?'Opportunity Pipeline':'Bid History'}
          </button>
        ))}
      </div>

      {tab==='pipeline'&&<div>
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:'14px 18px',marginBottom:20,fontSize:13,color:DIM}}>
          <Robot size={15} weight="duotone" style={{verticalAlign:'-3px'}} /> <strong style={{color:TEXT}}>AI Scores These Automatically</strong> — Each opportunity is scored 0–100 for fit based on your win/loss history. Focus on green (Bid) first.
        </div>
        <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
          <thead><tr style={{background:'rgba(255,255,255,0.03)'}}>
            {['Opportunity','Trade','Est. Value','Fit Score','Win Prob.','Bid Due','AI Recommendation','Actions'].map(h=>(
              <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:600,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{opportunities.map(op=>{
            const ac = op.action==='bid'?{bg:'rgba(74,222,128,.12)',c:'#4ADE80',label:'✓ Bid'}:op.action==='pass'?{bg:'rgba(248,113,113,.12)',c:'#F87171',label:'✗ Pass'}:{bg:'var(--brand-primary-12)',c:'var(--brand-primary)',label:'? Investigate'};
            return <tr key={op.id} style={{borderBottom:`1px solid rgba(255,255,255,0.08)`}}>
              <td style={{padding:'12px 14px',color:TEXT,fontWeight:600,maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{op.title}</td>
              <td style={{padding:'12px 14px',color:DIM}}>{op.trade}</td>
              <td style={{padding:'12px 14px',color:TEXT}}>${op.value.toLocaleString()}</td>
              <td style={{padding:'12px 14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:60,height:5,background:'rgba(255,255,255,0.08)',borderRadius:3}}>
                    <div style={{height:'100%',width:`${op.fitScore}%`,background:op.fitScore>=70?'#4ADE80':op.fitScore>=50?GOLD:'#F87171',borderRadius:3}}/>
                  </div>
                  <span style={{color:op.fitScore>=70?'#4ADE80':op.fitScore>=50?GOLD:'#F87171',fontWeight:600}}>{op.fitScore}</span>
                </div>
              </td>
              <td style={{padding:'12px 14px',color:op.winPct>=60?'#4ADE80':op.winPct>=40?GOLD:'#F87171',fontWeight:600}}>{op.winPct}%</td>
              <td style={{padding:'12px 14px',color:DIM}}>{op.due}</td>
              <td style={{padding:'12px 14px'}}>
                <span style={{fontSize:10,fontWeight:600,padding:'3px 10px',borderRadius:4,background:ac.bg,color:ac.c,border:`1px solid color-mix(in srgb, ${ac.c} 20%, transparent)`}}>{ac.label}</span>
              </td>
              <td style={{padding:'12px 14px',display:'flex',gap:6}}>
                <Link href="/app/intelligence" style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,padding:'3px 8px',cursor:'pointer',textDecoration:'none'}}>Details</Link>
                {op.action==='bid'&&<Link href="/app/projects/new" style={{background:GOLD,border:'none',borderRadius:5,color:DARK,fontSize:11,padding:'4px 10px',fontWeight:600,cursor:'pointer',textDecoration:'none'}}>Bid →</Link>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}

      {tab==='active'&&<div style={{textAlign:'center' as const,padding:60,color:DIM}}>
        <div style={{marginBottom:12}}><Mailbox size={40} weight="duotone" color={DIM} /></div>
        <div style={{fontSize:18,fontWeight:600,color:TEXT,marginBottom:8}}>Bid Packages</div>
        {/* Was a link to demo-project-0000…0001 — a UUID that exists in no
            tenant, so the link 404'd for every real visitor. Bid packages hang
            off a project, so the honest destination is the project list. */}
        <div style={{marginBottom:20}}>All awarded bid packages appear here. <Link href="/app/projects" style={{color:GOLD}}>Open a project to see its bid packages →</Link></div>
      </div>}

      {tab==='history'&&<div style={{textAlign:'center' as const,padding:60,color:DIM}}>
        <div style={{marginBottom:12}}><ChartBar size={40} weight="duotone" color={DIM} /></div>
        <div style={{fontSize:18,fontWeight:600,color:TEXT,marginBottom:8}}>Bid History</div>
        <div>Full bid history with AI post-mortems. <Link href="/app/intelligence" style={{color:GOLD}}>View Bid Intelligence →</Link></div>
      </div>}
    </div>
  );
}
