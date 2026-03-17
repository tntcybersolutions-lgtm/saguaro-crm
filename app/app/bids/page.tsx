'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';

interface BidRecord {
  id: string;
  project_name: string;
  project_type: string;
  bid_date: string;
  bid_amount: number;
  actual_cost: number | null;
  margin_pct: number;
  outcome: 'won' | 'lost' | 'pending' | 'withdrawn';
  loss_reason: string | null;
  awarded_to: string | null;
  location: string;
  trades: string[];
  notes: string | null;
}
interface BidStats {
  totalBids: number; wonBids: number; lostBids: number; pendingBids: number;
  winRate: number; avgMargin: number; totalValue: number;
}

function BidsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as 'active'|'pipeline'|'history'|'score'|null;
  const [tab, setTab] = useState<'active'|'pipeline'|'history'>(
    (tabParam === 'history' || tabParam === 'active' || tabParam === 'pipeline') ? tabParam : 'active'
  );

  // History state
  const [historyBids, setHistoryBids] = useState<BidRecord[]>([]);
  const [historyStats, setHistoryStats] = useState<BidStats|null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all'|'won'|'lost'|'pending'>('all');

  // Score modal state
  const [showScore, setShowScore] = useState(tabParam === 'score');
  const [scoreForm, setScoreForm] = useState({projectName:'',bidAmount:'',margin:'',tradeType:'',notes:''});
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<{fitScore:number,winPct:number,recommendation:string}|null>(null);

  // Pipeline opportunities — fetched from bid_packages in 'bidding' status
  const [opportunities, setOpportunities] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/bid-packages/list')
      .then(r => r.json())
      .then(d => setOpportunities((d.bidPackages || []).filter((bp: any) => bp.status === 'open' || bp.status === 'bidding').slice(0, 20)))
      .catch(() => {});
  }, []);

  // Load history when tab switches to history
  useEffect(() => {
    if (tab === 'history' && historyBids.length === 0) {
      fetchHistory();
    }
  }, [tab]);

  async function fetchHistory(outcome?: string) {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (outcome && outcome !== 'all') params.set('outcome', outcome);
      params.set('limit', '50');
      const r = await fetch('/api/bids/history?' + params.toString());
      const d = await r.json();
      setHistoryBids(d.bids || []);
      setHistoryStats(d.stats || null);
    } catch {
      // keep empty
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleHistoryFilter(f: 'all'|'won'|'lost'|'pending') {
    setHistoryFilter(f);
    fetchHistory(f === 'all' ? undefined : f);
  }

  async function submitScore() {
    if (!scoreForm.projectName || !scoreForm.bidAmount) return;
    setScoring(true);
    setScoreResult(null);
    try {
      // Optimistic AI score calculation (fallback if no /api/bids/score endpoint)
      const margin = parseFloat(scoreForm.margin)||15;
      const amount = parseFloat(scoreForm.bidAmount.replace(/[^0-9.]/g,''))||0;
      const fitScore = Math.min(100, Math.max(10, Math.round(
        (margin > 18 ? 90 : margin > 12 ? 75 : margin > 8 ? 55 : 35) +
        (scoreForm.tradeType === 'Residential' ? 10 : scoreForm.tradeType === 'Remodel' ? 8 : 0) -
        (amount > 5000000 ? 15 : amount > 2000000 ? 5 : 0)
      )));
      const winPct = Math.round(fitScore * 0.85);
      const rec = fitScore >= 75 ? 'BID — strong fit' : fitScore >= 50 ? 'INVESTIGATE — moderate fit' : 'PASS — low fit';
      // Try real API endpoint — maps to existing /api/bids/score field names
      try {
        const r = await fetch('/api/bids/score', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            projectName: scoreForm.projectName,
            estimatedValue: amount,
            ourMargin: margin,
            projectType: scoreForm.tradeType,
            trade: scoreForm.tradeType,
            notes: scoreForm.notes,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          // API returns score/winProbability/recommendation; modal uses fitScore/winPct
          const apiScore = d.score ?? d.fitScore ?? fitScore;
          const apiWinPct = d.winProbability ?? d.winPct ?? winPct;
          const apiRec = d.recommendation
            ? (d.recommendation==='bid'?'✓ BID — strong fit':d.recommendation==='pass'?'✗ PASS — low fit':'? INVESTIGATE — review scope')
            : rec;
          setScoreResult({ fitScore: apiScore, winPct: apiWinPct, recommendation: d.reasoning||apiRec });
          return;
        }
      } catch { /* fallback to computed */ }
      setScoreResult({ fitScore, winPct, recommendation: rec });
    } finally {
      setScoring(false);
    }
  }

  return (
    <div style={{padding:'24px 28px',maxWidth:1300,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:TEXT,margin:0}}>Bid Center</h1>
          <div style={{fontSize:13,color:DIM,marginTop:4}}>AI-scored opportunities and active bid packages</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <Link href="/app/intelligence" style={{padding:'9px 16px',background:'rgba(212,160,23,.12)',border:'1px solid rgba(212,160,23,.3)',borderRadius:8,color:GOLD,fontSize:13,fontWeight:700,textDecoration:'none'}}>🧠 Bid Intelligence</Link>
          <button style={{padding:'9px 18px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}} onClick={()=>setShowScore(true)}>+ Score a Bid</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:2,borderBottom:`1px solid ${BORDER}`,marginBottom:24}}>
        {(['active','pipeline','history'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'10px 18px',border:'none',borderBottom:`2px solid ${tab===t?GOLD:'transparent'}`,background:'transparent',color:tab===t?GOLD:DIM,fontSize:13,fontWeight:tab===t?700:500,cursor:'pointer',textTransform:'capitalize' as const}}>
            {t==='active'?'Active Packages':t==='pipeline'?'Opportunity Pipeline':'Bid History'}
          </button>
        ))}
      </div>

      {/* ── Pipeline Tab ──────────────────────────────────────────────────────── */}
      {tab==='pipeline'&&<div>
        {opportunities.length === 0 ? (
          <div style={{textAlign:'center' as const,padding:60,color:DIM}}>
            <div style={{fontSize:40,marginBottom:12}}>📊</div>
            <div style={{fontSize:18,fontWeight:700,color:TEXT,marginBottom:8}}>No Open Bid Packages</div>
            <div style={{marginBottom:20}}>Create bid packages on your projects to track your pipeline here.</div>
            <button onClick={()=>router.push('/app/projects')} style={{padding:'10px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Go to Projects</button>
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
            <thead><tr style={{background:'#0a1117'}}>
              {['Package Name','Trade','Status','Bid Due','Actions'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{opportunities.map(op=>(
              <tr key={op.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
                <td style={{padding:'12px 14px',color:TEXT,fontWeight:600}}>{op.name}</td>
                <td style={{padding:'12px 14px',color:DIM}}>{op.trade}</td>
                <td style={{padding:'12px 14px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'rgba(26,95,168,.12)',color:'#4a9de8',textTransform:'uppercase' as const}}>{op.status}</span></td>
                <td style={{padding:'12px 14px',color:DIM}}>{op.bid_due_date || '—'}</td>
                <td style={{padding:'12px 14px'}}>
                  <button onClick={()=>router.push(`/app/projects/${op.project_id}/bid-packages/${op.id}`)} style={{background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:5,color:'#0d1117',fontSize:11,padding:'4px 10px',fontWeight:700,cursor:'pointer'}}>View →</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>}

      {/* ── Active Tab ────────────────────────────────────────────────────────── */}
      {tab==='active'&&<div style={{textAlign:'center' as const,padding:60,color:DIM}}>
        <div style={{fontSize:40,marginBottom:12}}>📬</div>
        <div style={{fontSize:18,fontWeight:700,color:TEXT,marginBottom:8}}>Bid Packages</div>
        <div style={{marginBottom:20}}>Select a project to view and manage its bid packages.</div>
        <button
          onClick={()=>router.push('/app/projects')}
          style={{padding:'10px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}
        >View Projects</button>
      </div>}

      {/* ── History Tab ───────────────────────────────────────────────────────── */}
      {tab==='history'&&<div>
        {/* Stats */}
        {historyStats&&<div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
          {[
            {l:'Total Bids',v:historyStats.totalBids,c:TEXT},
            {l:'Won',v:historyStats.wonBids,c:'#3dd68c'},
            {l:'Lost',v:historyStats.lostBids,c:'#ff7070'},
            {l:'Win Rate',v:historyStats.winRate+'%',c:historyStats.winRate>=50?'#3dd68c':GOLD},
            {l:'Avg Margin',v:historyStats.avgMargin.toFixed(1)+'%',c:GOLD},
          ].map(k=>(
            <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:5}}>{k.l}</div>
              <div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div>
            </div>
          ))}
        </div>}
        {/* Filter pills */}
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          {(['all','won','lost','pending'] as const).map(f=>(
            <button key={f} onClick={()=>handleHistoryFilter(f)} style={{padding:'5px 14px',border:`1px solid ${historyFilter===f?GOLD:BORDER}`,borderRadius:20,background:historyFilter===f?'rgba(212,160,23,.12)':'transparent',color:historyFilter===f?GOLD:DIM,fontSize:12,fontWeight:historyFilter===f?700:500,cursor:'pointer',textTransform:'capitalize' as const}}>{f}</button>
          ))}
        </div>
        {historyLoading&&<div style={{padding:40,textAlign:'center' as const,color:DIM}}>Loading bid history…</div>}
        {!historyLoading&&historyBids.length===0&&<div style={{padding:60,textAlign:'center' as const,color:DIM}}>
          <div style={{fontSize:32,marginBottom:12}}>📊</div>
          <div style={{fontSize:16,fontWeight:700,color:TEXT,marginBottom:8}}>No bid history found</div>
          <button onClick={()=>fetchHistory()} style={{padding:'8px 18px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Retry</button>
        </div>}
        {!historyLoading&&historyBids.length>0&&<table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
          <thead><tr style={{background:'#0a1117'}}>
            {['Project','Type','Bid Date','Bid Amount','Margin %','Location','Outcome','Awarded To'].map(h=>(
              <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{historyBids.map(b=>{
            const oc = b.outcome==='won'
              ? {bg:'rgba(26,138,74,.12)',c:'#3dd68c'}
              : b.outcome==='lost'
              ? {bg:'rgba(192,48,48,.12)',c:'#ff7070'}
              : b.outcome==='pending'
              ? {bg:'rgba(212,160,23,.12)',c:GOLD}
              : {bg:'rgba(143,163,192,.1)',c:DIM};
            return <tr key={b.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
              <td style={{padding:'12px 14px',color:TEXT,fontWeight:600,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{b.project_name}</td>
              <td style={{padding:'12px 14px',color:DIM}}>{b.project_type}</td>
              <td style={{padding:'12px 14px',color:DIM}}>{b.bid_date}</td>
              <td style={{padding:'12px 14px',color:TEXT}}>${b.bid_amount.toLocaleString()}</td>
              <td style={{padding:'12px 14px',color:b.margin_pct>=15?'#3dd68c':b.margin_pct>=10?GOLD:'#ff7070',fontWeight:700}}>{b.margin_pct}%</td>
              <td style={{padding:'12px 14px',color:DIM}}>{b.location}</td>
              <td style={{padding:'12px 14px'}}>
                <span style={{fontSize:10,fontWeight:800,padding:'3px 10px',borderRadius:4,background:oc.bg,color:oc.c,textTransform:'uppercase' as const}}>
                  {b.outcome==='won'?'✓ WON':b.outcome==='lost'?'✗ LOST':b.outcome==='pending'?'⏳ PENDING':'WITHDRAWN'}
                </span>
              </td>
              <td style={{padding:'12px 14px',color:DIM,fontSize:12}}>{b.awarded_to||b.loss_reason||'—'}</td>
            </tr>;
          })}</tbody>
        </table>}
      </div>}

      {/* ── Score a Bid Modal ─────────────────────────────────────────────────── */}
      {showScore&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:28,width:480,maxWidth:'95vw',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div style={{fontWeight:800,fontSize:17,color:TEXT}}>🤖 Score This Bid</div>
            <button onClick={()=>{setShowScore(false);setScoreResult(null);}} style={{background:'none',border:'none',color:DIM,fontSize:20,cursor:'pointer',lineHeight:1}}>×</button>
          </div>
          {scoreResult ? (
            <div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
                <div style={{background:DARK,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px',textAlign:'center' as const}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>Fit Score</div>
                  <div style={{fontSize:36,fontWeight:900,color:scoreResult.fitScore>=70?'#3dd68c':scoreResult.fitScore>=50?GOLD:'#ff7070'}}>{scoreResult.fitScore}</div>
                  <div style={{fontSize:11,color:DIM}}>out of 100</div>
                </div>
                <div style={{background:DARK,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px',textAlign:'center' as const}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>Win Probability</div>
                  <div style={{fontSize:36,fontWeight:900,color:scoreResult.winPct>=60?'#3dd68c':scoreResult.winPct>=40?GOLD:'#ff7070'}}>{scoreResult.winPct}%</div>
                </div>
              </div>
              <div style={{background:'rgba(212,160,23,.08)',border:'1px solid rgba(212,160,23,.25)',borderRadius:8,padding:'12px 16px',marginBottom:20,fontSize:14,fontWeight:700,color:GOLD,textAlign:'center' as const}}>{scoreResult.recommendation}</div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>{setScoreResult(null);setScoreForm({projectName:'',bidAmount:'',margin:'',tradeType:'',notes:''});}} style={{flex:1,padding:'9px 16px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Score Another</button>
                <button onClick={()=>setTab('pipeline')} style={{flex:1,padding:'9px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>View Pipeline</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                {([['Project Name','projectName','e.g. Scottsdale Office Buildout'],['Bid Amount ($)','bidAmount','e.g. 2,500,000'],['Target Margin (%)','margin','e.g. 15'],['Trade Type','tradeType','e.g. Commercial']]).map(([lbl,key,ph])=>(
                  <div key={key}>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{lbl}</label>
                    <input value={(scoreForm as any)[key]} onChange={e=>setScoreForm(f=>({...f,[key]:e.target.value}))} placeholder={ph} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box' as const}}/>
                  </div>
                ))}
              </div>
              <div style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Notes</label>
                <textarea value={scoreForm.notes} onChange={e=>setScoreForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Any context for the AI…" style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical' as const,boxSizing:'border-box' as const}}/>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={submitScore} disabled={scoring||!scoreForm.projectName||!scoreForm.bidAmount} style={{flex:1,padding:'10px 18px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer',opacity:scoring||!scoreForm.projectName||!scoreForm.bidAmount?0.6:1}}>
                  {scoring?'Scoring…':'🤖 Score This Bid'}
                </button>
                <button onClick={()=>setShowScore(false)} style={{padding:'10px 16px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}

export default function BidsPage() {
  return (
    <Suspense fallback={<div style={{minHeight:'100vh',background:'#0d1117'}}/>}>
      <BidsPageInner />
    </Suspense>
  );
}
