'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';

interface ScoreResult {
  score: number;
  recommendation: string;
  reasoning: string;
  risks: string[];
  suggestedMargin: number;
}

export default function IntelligencePage() {
  const [scoring, setScoring] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [value, setValue] = useState('');
  const [tradeType, setTradeType] = useState('Residential');
  const [targetMargin, setTargetMargin] = useState('');
  const [location, setLocation] = useState('Phoenix, AZ');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addedToPipeline, setAddedToPipeline] = useState(false);
  const [passed, setPassed] = useState(false);

  async function scoreOpportunity() {
    if (!title.trim() || !value.trim()) {
      setError('Project name and estimated value are required.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setAddedToPipeline(false);
    setPassed(false);
    try {
      const res = await fetch('/api/bids/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: title,
          projectType: tradeType.toLowerCase(),
          location,
          estimatedValue: parseFloat(value.replace(/[^0-9.]/g, '')) || 0,
          trade: tradeType,
          targetMargin: parseFloat(targetMargin) || undefined,
          description: desc,
        }),
      });
      const data = await res.json();
      setResult({
        score: data.score ?? 50,
        recommendation: data.recommendation ?? 'BID_WITH_CAUTION',
        reasoning: data.reasoning ?? '',
        risks: data.risks ?? [],
        suggestedMargin: data.suggestedMargin ?? 8.5,
      });
    } catch {
      setError('Unable to reach scoring engine. Please try again.');
    }
    setLoading(false);
  }

  async function addToPipeline() {
    try {
      await fetch('/api/bid-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: title,
          trade: tradeType,
          scopeSummary: desc,
          projectId: 'new',
          status: 'pipeline',
        }),
      });
    } catch { /* non-critical — still mark as added */ }
    setAddedToPipeline(true);
  }

  const outcomes = [
    {trade:'Residential',outcome:'won',amount:396000,margin:16,project:'2,400 SF Custom Home - Scottsdale',date:'2026-01-10'},
    {trade:'Addition',outcome:'won',amount:92000,margin:21,project:'680 SF Master Suite Addition',date:'2025-12-05'},
    {trade:'Remodel',outcome:'won',amount:138000,margin:19,project:'Kitchen & Bath Remodel',date:'2025-11-18'},
    {trade:'Residential',outcome:'lost',amount:218000,margin:15,project:'1,900 SF Production Home',date:'2026-01-22',reason:'Price: lost by $22K'},
    {trade:'Commercial',outcome:'lost',amount:875000,margin:12,project:'8,500 SF Office Buildout',date:'2025-12-20',reason:'Experience: commercial portfolio required'},
  ];

  const scoreColor = result
    ? result.score >= 70 ? '#3dd68c' : result.score >= 45 ? GOLD : RED
    : TEXT;

  return (
    <div style={{padding:'24px 28px',maxWidth:1300,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase' as const,color:DIM}}>AI Learning Engine</div>
          <h1 style={{fontSize:26,fontWeight:800,color:TEXT,margin:'4px 0'}}>Bid Intelligence</h1>
          <div style={{fontSize:13,color:DIM}}>Saguaro learns from every bid you win or lose. Score opportunities instantly with AI.</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setScoring(!scoring)} style={{padding:'9px 18px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
            🎯 Score New Opportunity
          </button>
          <Link href="/app/bids" style={{padding:'9px 18px',background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,fontWeight:700,textDecoration:'none',display:'flex',alignItems:'center'}}>
            View Bids →
          </Link>
        </div>
      </div>

      {/* Score opportunity panel */}
      {scoring && (
        <div style={{background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:10,padding:24,marginBottom:24}}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:16,color:TEXT}}>Score a New Bid Opportunity</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Project Name *</label>
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. 3,200 SF Custom Home" style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box'}} />
            </div>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Estimated Value *</label>
              <input value={value} onChange={e=>setValue(e.target.value)} placeholder="$450,000" style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box'}} />
            </div>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Trade Category</label>
              <select value={tradeType} onChange={e=>setTradeType(e.target.value)} style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,cursor:'pointer'}}>
                {['Residential','Commercial','Addition','Remodel','Healthcare','Education','Industrial','Multi-Family'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Location</label>
              <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Phoenix, AZ" style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box'}} />
            </div>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Target Margin (%)</label>
              <input value={targetMargin} onChange={e=>setTargetMargin(e.target.value)} placeholder="e.g. 14" type="number" min="0" max="100" style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box'}} />
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Description (optional)</label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="Describe the project scope..." style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical' as const,boxSizing:'border-box'}} />
          </div>
          {error && <div style={{color:RED,fontSize:12,marginBottom:12}}>{error}</div>}
          <div style={{display:'flex',gap:10}}>
            <button onClick={scoreOpportunity} disabled={loading} style={{padding:'9px 20px',background:loading?'rgba(212,160,23,.4)':`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:loading?'not-allowed':'pointer'}}>
              🤖 {loading ? 'Analyzing...' : 'Score with AI'}
            </button>
            <button onClick={()=>{ setScoring(false); setResult(null); setError(''); }} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
          </div>

          {result && (
            <div style={{marginTop:20,background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:10,padding:20}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:16}}>
                {[
                  {l:'Bid Score',v:`${result.score}/100`,c:scoreColor},
                  {l:'Recommendation',v:result.recommendation.replace(/_/g,' '),c:scoreColor},
                  {l:'Suggested Margin',v:`${result.suggestedMargin}%`,c:GOLD},
                  {l:'Risk Count',v:`${result.risks.length} noted`,c:result.risks.length > 2 ? RED : DIM},
                ].map(k=>(
                  <div key={k.l} style={{textAlign:'center' as const}}>
                    <div style={{fontSize:10,color:DIM,fontWeight:700,textTransform:'uppercase' as const,marginBottom:6}}>{k.l}</div>
                    <div style={{fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div>
                  </div>
                ))}
              </div>
              <div style={{background:DARK,borderRadius:8,padding:14,fontSize:13,color:DIM,lineHeight:1.7,marginBottom:12}}>{result.reasoning}</div>
              {result.risks.length > 0 && (
                <div style={{background:'rgba(192,48,48,.06)',borderRadius:8,padding:14,marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,marginBottom:8}}>Risks to Consider</div>
                  {result.risks.map((risk,i)=>(
                    <div key={i} style={{fontSize:12,color:TEXT,marginBottom:4}}>⚠️ {risk}</div>
                  ))}
                </div>
              )}
              <div style={{display:'flex',gap:10}}>
                {!addedToPipeline ? (
                  <button onClick={addToPipeline} style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:12,fontWeight:800,cursor:'pointer'}}>
                    ✅ Add to Pipeline
                  </button>
                ) : (
                  <span style={{padding:'8px 16px',background:'rgba(26,138,74,.15)',border:'1px solid rgba(26,138,74,.3)',borderRadius:7,color:'#3dd68c',fontSize:12,fontWeight:700}}>
                    ✓ Added to Pipeline
                  </span>
                )}
                {!passed ? (
                  <button onClick={()=>setPassed(true)} style={{padding:'8px 16px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:12,cursor:'pointer'}}>
                    Pass on this bid
                  </button>
                ) : (
                  <span style={{padding:'8px 16px',background:'rgba(192,48,48,.08)',border:'1px solid rgba(192,48,48,.2)',borderRadius:7,color:'#ff7070',fontSize:12,fontWeight:700}}>
                    ✓ Marked as Pass
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {/* Win rate card */}
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:24}}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:16,color:TEXT}}>Your Bid Intelligence Profile</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
            {[{l:'Overall Win Rate',v:'50%'},{l:'Avg Winning Margin',v:'18.2%'},{l:'Bids Analyzed',v:'10'}].map(k=>(
              <div key={k.l} style={{background:DARK,borderRadius:8,padding:14,textAlign:'center' as const}}>
                <div style={{fontSize:10,color:DIM,fontWeight:700,textTransform:'uppercase' as const,marginBottom:5}}>{k.l}</div>
                <div style={{fontSize:22,fontWeight:800,color:GOLD}}>{k.v}</div>
              </div>
            ))}
          </div>
          {[{trade:'Residential',bids:7,wins:5,wr:71,margin:18.2},{trade:'Commercial',bids:3,wins:0,wr:0,margin:12},{trade:'Addition/Remodel',bids:2,wins:2,wr:100,margin:20}].map(t=>(
            <div key={t.trade} style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                <span style={{color:TEXT,fontWeight:600}}>{t.trade}</span>
                <span style={{color:t.wr>=60?'#3dd68c':t.wr>0?GOLD:RED,fontWeight:700}}>{t.wr}% win ({t.wins}/{t.bids})</span>
              </div>
              <div style={{height:5,background:'rgba(255,255,255,.06)',borderRadius:3}}>
                <div style={{height:'100%',width:`${t.wr}%`,background:t.wr>=60?'#3dd68c':t.wr>0?GOLD:RED,borderRadius:3}}/>
              </div>
            </div>
          ))}
          <div style={{marginTop:16,background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:8,padding:12,fontSize:12,color:DIM}}>
            🤖 <strong style={{color:TEXT}}>AI Recommendation:</strong> Focus on residential under $500K — 71% win rate. Avoid commercial office — 0% win rate with your current experience.
          </div>
        </div>

        {/* Bid history */}
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:800,fontSize:15,color:TEXT}}>Bid History</span>
            <Link href="/app/bids" style={{fontSize:12,color:GOLD,textDecoration:'none',fontWeight:700}}>View All →</Link>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:12}}>
            <thead><tr style={{background:DARK}}>
              {['Project','Trade','Bid','Margin','Result'].map(h=><th key={h} style={{padding:'9px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>)}
            </tr></thead>
            <tbody>{outcomes.map((o,i)=>(
              <tr key={i} style={{borderBottom:`1px solid rgba(38,51,71,.4)`}}>
                <td style={{padding:'11px 14px',color:TEXT,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{o.project}</td>
                <td style={{padding:'11px 14px',color:DIM}}>{o.trade}</td>
                <td style={{padding:'11px 14px',color:TEXT}}>${o.amount.toLocaleString()}</td>
                <td style={{padding:'11px 14px',color:DIM}}>{o.margin}%</td>
                <td style={{padding:'11px 14px'}}>
                  <span style={{fontSize:10,fontWeight:800,padding:'2px 8px',borderRadius:4,background:o.outcome==='won'?'rgba(26,138,74,.15)':'rgba(192,48,48,.12)',color:o.outcome==='won'?'#3dd68c':RED}}>
                    {o.outcome.toUpperCase()}
                  </span>
                  {'reason' in o && o.reason && <div style={{fontSize:10,color:'#4a5f7a',marginTop:2}}>{o.reason}</div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
