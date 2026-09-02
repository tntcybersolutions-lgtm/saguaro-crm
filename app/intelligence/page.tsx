'use client';
import React, { useState } from 'react';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import MarketingNav from '@/components/MarketingNav';

const GOLD='#F59E0B',DARK='#0a0a0a',BORDER='rgba(255,255,255,0.08)',HAIRLINE='rgba(255,255,255,0.08)',CARD='rgba(255,255,255,0.02)',DIM='#CBD5E1',MUTED='rgba(255,255,255,0.45)',TEXT='#FFFFFF',GREEN='#3dd68c',RED='#c03030';

export default function IntelligencePage() {
  const [scoring, setScoring] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [value, setValue] = useState('');
  const [trade, setTrade] = useState('Residential');
  const [result, setResult] = useState<Record<string,unknown>|null>(null);
  const [loading, setLoading] = useState(false);

  async function scoreOpportunity() {
    const estimatedValue = Number(String(value).replace(/[^0-9.]/g, ''));
    if (!title.trim() || !estimatedValue) {
      setResult({ error: 'Enter an opportunity title and estimated value to score.' });
      return;
    }
    setLoading(true);
    setResult(null);
    // Real AI scoring via /api/bids/score (Claude). No hardcoded results — we
    // render exactly what the model returns, or an honest error.
    try {
      const res = await fetch('/api/bids/score', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ projectName:title, projectType:trade, trade, estimatedValue, ourMargin:15, description:desc })
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data?.error || 'Could not score this opportunity right now. Please try again.' });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ error: 'Could not reach the scoring service. Please try again.' });
    }
    setLoading(false);
  }

  const outcomes = [
    {trade:'Residential',outcome:'won',amount:396000,margin:16,project:'2,400 SF Custom Home - Scottsdale',date:'2026-01-10'},
    {trade:'Addition',outcome:'won',amount:92000,margin:21,project:'680 SF Master Suite Addition',date:'2025-12-05'},
    {trade:'Remodel',outcome:'won',amount:138000,margin:19,project:'Kitchen & Bath Remodel',date:'2025-11-18'},
    {trade:'Residential',outcome:'lost',amount:218000,margin:15,project:'1,900 SF Production Home',date:'2026-01-22',reason:'Price: lost by $22K'},
    {trade:'Commercial',outcome:'lost',amount:875000,margin:12,project:'8,500 SF Office Buildout',date:'2025-12-20',reason:'Experience: commercial portfolio required'},
  ];

  return (
    <div className="mkt-page" style={{padding:'40px 24px 80px',maxWidth:1200,margin:'0 auto'}}>
      <style>{`@media (max-width: 640px){ .pg-stack-1{ grid-template-columns: 1fr !important } }`}</style>
      <MarketingNav />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:40,gap:24,flexWrap:'wrap'}}>
        <div>
          <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 12px',background:'transparent',border:'1px solid rgba(255,255,255,0.14)',borderRadius:999,fontSize:11,fontWeight:500,letterSpacing:1,textTransform:'uppercase' as const,color:MUTED,marginBottom:14}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:GOLD,display:'inline-block'}}/>AI Learning Engine
          </div>
          <h1 style={{fontWeight:600,color:TEXT,margin:'0 0 8px',letterSpacing:-0.3}}>Bid Intelligence</h1>
          <div style={{fontSize:14,color:DIM,lineHeight:1.5}}>Saguaro learns from every bid you win or lose. No competitor has this.</div>
        </div>
        <button onClick={()=>setScoring(!scoring)} style={{padding:'10px 18px',background:GOLD,border:'none',borderRadius:8,color:'#0a0a0a',fontSize:13,fontWeight:600,cursor:'pointer'}}>
          Score New Opportunity
        </button>
      </div>

      {/* Score opportunity panel */}
      {scoring&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:28,marginBottom:32}}>
        <div style={{fontWeight:600,fontSize:16,marginBottom:20,color:TEXT}}>Score a new bid opportunity</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
          {[['Opportunity Title',title,setTitle,'e.g. 3,200 SF Custom Home - Scottsdale'],['Estimated Value',value,setValue,'$450,000']].map(f=>(
            <div key={f[0] as string}><label style={{display:'block',fontSize:11,fontWeight:500,color:MUTED,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>{f[0] as string}</label>
              <input value={f[1] as string} onChange={e=>(f[2] as Function)(e.target.value)} placeholder={f[3] as string} style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,outline:'none'}}/></div>
          ))}
          <div><label style={{display:'block',fontSize:11,fontWeight:500,color:MUTED,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>Trade Category</label>
            <select value={trade} onChange={e=>setTrade(e.target.value)} style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,cursor:'pointer'}}>
              {!SUB_TRADES.includes(trade)&&<option value={trade}>{trade}</option>}
              {SUB_TRADES_BY_DIVISION.map(g=>(
                <optgroup key={g.division} label={g.division+' — '+g.name}>
                  {g.trades.map(t=><option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
              <optgroup label="Other / Specialty">
                {SUB_TRADES.filter(t=>!SUB_TRADES_BY_DIVISION.some(g=>g.trades.includes(t))).map(t=><option key={t} value={t}>{t}</option>)}
              </optgroup>
            </select></div>
        </div>
        <div style={{marginBottom:14}}><label style={{display:'block',fontSize:11,fontWeight:500,color:MUTED,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>Description</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="Describe the project scope..." style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,outline:'none',resize:'vertical'}}/></div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={scoreOpportunity} disabled={loading} style={{padding:'10px 20px',background:GOLD,border:'none',borderRadius:8,color:'#0a0a0a',fontSize:13,fontWeight:600,cursor:'pointer'}}>{loading?'Scoring...':'Score with AI'}</button>
          <button onClick={()=>setScoring(false)} style={{padding:'10px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
        </div>
        {result&&('error' in result)&&<div style={{marginTop:20,background:'rgba(192,48,48,.08)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:10,padding:'14px 16px',fontSize:13,color:DIM}}>{result['error'] as string}</div>}
        {result&&!('error' in result)&&<div style={{marginTop:24,background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:24}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:0,marginBottom:20,borderTop:`1px solid ${HAIRLINE}`,borderBottom:`1px solid ${HAIRLINE}`}}>
            {[{l:'Fit Score',v:`${result['score']}/100`,c:TEXT},{l:'Win Probability',v:`${result['winProbability']}%`,c:GREEN},{l:'Recommendation',v:String(result['recommendation']??'').toUpperCase(),c:TEXT},{l:'Suggested Margin',v:`${result['suggestedMargin']}%`,c:TEXT}].map((k,i)=>(
              <div key={k.l} style={{textAlign:'center' as const,padding:'16px 10px',borderLeft:i>0?`1px solid ${HAIRLINE}`:'none'}}><div style={{fontSize:10,color:MUTED,fontWeight:500,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:8}}>{k.l}</div><div style={{fontSize:22,fontWeight:600,color:k.c}}>{k.v}</div></div>
            ))}
          </div>
          <div style={{background:DARK,borderRadius:8,padding:14,fontSize:13,color:DIM,lineHeight:1.7}}>{result['reasoning'] as string}</div>
          {Array.isArray(result['riskFactors'])&&(result['riskFactors'] as string[]).length>0&&<div style={{marginTop:14}}>
            <div style={{fontSize:11,color:MUTED,fontWeight:600,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:8}}>Risk Factors</div>
            {(result['riskFactors'] as string[]).map((rf,i)=>(
              <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',fontSize:12,color:DIM,lineHeight:1.6,marginBottom:5}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:RED,marginTop:6,flexShrink:0}}/>{rf}
              </div>
            ))}
          </div>}
        </div>}
      </div>}

      <div className="pg-stack-1" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
        {/* Win rate profile */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:28}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
            <div style={{fontWeight:600,fontSize:16,color:TEXT}}>Bid intelligence profile</div>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:.5,textTransform:'uppercase' as const,color:GOLD,border:`1px solid ${GOLD}`,borderRadius:999,padding:'2px 8px'}}>Sample</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0,marginBottom:24,borderTop:`1px solid ${HAIRLINE}`,borderBottom:`1px solid ${HAIRLINE}`}}>
            {[{l:'Overall Win Rate',v:'50%'},{l:'Avg Winning Margin',v:'18.2%'},{l:'Bids Analyzed',v:'10'}].map((k,i)=>(
              <div key={k.l} style={{padding:'16px 12px',borderLeft:i>0?`1px solid ${HAIRLINE}`:'none'}}>
                <div style={{fontSize:10,color:MUTED,fontWeight:500,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>{k.l}</div>
                <div style={{fontSize:24,fontWeight:600,color:TEXT}}>{k.v}</div>
              </div>
            ))}
          </div>
          {[{trade:'Residential',bids:7,wins:5,wr:71,margin:18.2},{trade:'Commercial',bids:3,wins:0,wr:0,margin:12},{trade:'Addition/Remodel',bids:2,wins:2,wr:100,margin:20}].map(t=>(
            <div key={t.trade} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:5}}>
                <span style={{color:TEXT,fontWeight:500}}>{t.trade}</span>
                <span style={{color:t.wr>=60?GREEN:t.wr>0?DIM:RED,fontWeight:600}}>{t.wr}% win ({t.wins}/{t.bids})</span>
              </div>
              <div style={{height:5,background:'rgba(255,255,255,.08)',borderRadius:3}}>
                <div style={{height:'100%',width:`${t.wr}%`,background:t.wr>=60?GREEN:t.wr>0?DIM:RED,borderRadius:3}}/>
              </div>
            </div>
          ))}
          <div style={{marginTop:20,display:'flex',gap:10,alignItems:'flex-start',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,fontSize:12,color:DIM,lineHeight:1.6}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:GOLD,marginTop:5,flexShrink:0}}/>
            <span><strong style={{color:TEXT,fontWeight:600}}>AI Recommendation:</strong> Focus on residential under $500K — 71% win rate. Avoid commercial office — 0% win rate with your current experience.</span>
          </div>
        </div>

        {/* Bid history */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontWeight:600,fontSize:16,color:TEXT}}>Bid history</span>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:.5,textTransform:'uppercase' as const,color:GOLD,border:`1px solid ${GOLD}`,borderRadius:999,padding:'2px 8px'}}>Sample</span>
          </div>
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch',maxWidth:'100%'}}>
          <table style={{width:'100%',minWidth:640,borderCollapse:'collapse' as const,fontSize:12}}>
            <thead><tr style={{borderBottom:`1px solid ${BORDER}`}}>
              {['Project','Trade','Bid','Margin','Result'].map(h=><th key={h} style={{padding:'12px 14px',textAlign:'left' as const,fontSize:11,fontWeight:600,textTransform:'uppercase' as const,letterSpacing:.5,color:MUTED}}>{h}</th>)}
            </tr></thead>
            <tbody>{outcomes.map((o,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${HAIRLINE}`}}>
                <td style={{padding:'12px 14px',color:TEXT,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{o.project}</td>
                <td style={{padding:'12px 14px',color:DIM}}>{o.trade}</td>
                <td style={{padding:'12px 14px',color:TEXT}}>${o.amount.toLocaleString()}</td>
                <td style={{padding:'12px 14px',color:DIM}}>{o.margin}%</td>
                <td style={{padding:'12px 14px'}}>
                  <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:4,background:o.outcome==='won'?'rgba(26,138,74,.15)':'rgba(192,48,48,.12)',color:o.outcome==='won'?GREEN:RED}}>
                    {o.outcome.toUpperCase()}
                  </span>
                  {o.outcome==='lost'&&o.reason&&<div style={{fontSize:10,color:MUTED,marginTop:2}}>{o.reason}</div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
