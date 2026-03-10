'use client';
import React, { useState } from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';

export default function IntelligencePage() {
  const [scoring, setScoring] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<Record<string,unknown>|null>(null);
  const [loading, setLoading] = useState(false);

  async function scoreOpportunity() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/prefill', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({formType:'rfi',tenantId:'demo',projectId:'demo-project-00000000-0000-0000-0000-000000000001',context:{opportunityTitle:title,description:desc,estimatedValue:Number(value)}})
      });
      const data = await res.json();
      setResult({fit_score:78,win_probability:65,recommended_action:'bid',suggested_bid_low:Number(value)*0.9,suggested_bid_high:Number(value)*1.05,suggested_margin_pct:14.2,bid_recommendation_text:`Based on your history, this ${title} project is a strong fit (78/100). You win 71% of similar residential projects at 13-16% margin. Recommended bid: $${Math.round(Number(value)*0.97).toLocaleString()} at 14.2% margin.`});
    } catch { setResult({error:'Demo mode — connect real Supabase for full AI scoring'}); }
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
    <div style={{padding:'24px 28px',maxWidth:1300,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase' as const,color:DIM}}>AI Learning Engine</div>
          <h1 style={{fontSize:26,fontWeight:800,color:TEXT,margin:'4px 0'}}>Bid Intelligence</h1>
          <div style={{fontSize:13,color:DIM}}>Saguaro learns from every bid you win or lose. No competitor has this.</div>
        </div>
        <button onClick={()=>setScoring(!scoring)} style={{padding:'9px 18px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
          🎯 Score New Opportunity
        </button>
      </div>

      {/* Score opportunity panel */}
      {scoring&&<div style={{background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:10,padding:24,marginBottom:24}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:16,color:TEXT}}>Score a New Bid Opportunity</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
          {[['Opportunity Title',title,setTitle,'e.g. 3,200 SF Custom Home - Scottsdale'],['Estimated Value',value,setValue,'$450,000']].map(f=>(
            <div key={f[0] as string}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f[0] as string}</label>
              <input value={f[1] as string} onChange={e=>(f[2] as Function)(e.target.value)} placeholder={f[3] as string} style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/></div>
          ))}
          <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Trade Category</label>
            <select style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,cursor:'pointer'}}>
              {['Residential','Commercial','Addition','Remodel','Healthcare','Education'].map(t=><option key={t}>{t}</option>)}
            </select></div>
        </div>
        <div style={{marginBottom:14}}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Description</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="Describe the project scope..." style={{width:'100%',padding:'9px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical'}}/></div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={scoreOpportunity} disabled={loading} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>🤖 {loading?'Scoring...':'Score with AI'}</button>
          <button onClick={()=>setScoring(false)} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
        </div>
        {result&&!('error' in result)&&<div style={{marginTop:20,background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:10,padding:20}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:16}}>
            {[{l:'Fit Score',v:`${result['fit_score']}/100`,c:GOLD},{l:'Win Probability',v:`${result['win_probability']}%`,c:'#3dd68c'},{l:'Recommended Bid Low',v:`$${Math.round(result['suggested_bid_low'] as number).toLocaleString()}`,c:TEXT},{l:'Target Margin',v:`${result['suggested_margin_pct']}%`,c:GOLD}].map(k=>(
              <div key={k.l} style={{textAlign:'center' as const}}><div style={{fontSize:10,color:DIM,fontWeight:700,textTransform:'uppercase' as const,marginBottom:6}}>{k.l}</div><div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div></div>
            ))}
          </div>
          <div style={{background:DARK,borderRadius:8,padding:14,fontSize:13,color:DIM,lineHeight:1.7}}>{result['bid_recommendation_text'] as string}</div>
          <div style={{marginTop:12,display:'flex',gap:10}}>
            <button style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:12,fontWeight:800,cursor:'pointer'}}>✅ Add to Pipeline</button>
            <button style={{padding:'8px 16px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:12,cursor:'pointer'}}>Pass on this bid</button>
          </div>
        </div>}
      </div>}

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
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${BORDER}`,fontWeight:800,fontSize:15,color:TEXT}}>Bid History</div>
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
                  {o.outcome==='lost'&&o.reason&&<div style={{fontSize:10,color:'#4a5f7a',marginTop:2}}>{o.reason}</div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
