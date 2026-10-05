'use client';
/**
 * Bid Intelligence — the AI learning engine over this tenant's REAL win/loss
 * record. Full premium anatomy (aurora surface, hero, stat strip, section
 * cards, machined tables); every number rendered comes straight from
 * /api/bids/win-factors and /api/bids/history — no hardcoded stats, and an
 * honest empty state until outcomes are logged.
 */
import React, { useState, useEffect } from 'react';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import {
  PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, FlowStrip,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { Skeleton } from '@/components/ui/Skeleton';
import { moduleAccent } from '@/lib/module-identity';
import {
  Brain, Sparkle, Trophy, TrendUp, ChartBar, Percent, Stack, Notebook,
  CurrencyCircleDollar, Warning, X,
} from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)', GOLD_HI = 'var(--brand-primary-strong)', DARK = 'var(--bg-base)', BORDER = 'rgba(255,255,255,0.08)', HAIRLINE = 'rgba(255,255,255,0.07)';
const DIM = '#D4D4D8', MUTED = 'rgba(255,255,255,0.45)', TEXT = '#FFFFFF', GREEN = '#2CFF7A', RED = '#FF3B30';

// Module accent — bids family (desert rose). Chips / eyebrows / badges ONLY.
const BIDS = moduleAccent('bids');

const INP: React.CSSProperties = { width: '100%', padding: '9px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 };
const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: MUTED, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: TEXT, verticalAlign: 'top' };

// Shapes returned by GET /api/bids/win-factors and GET /api/bids/history.
type WinFactor = { csi_division:string; trade:string|null; win_rate:number; win_count:number; loss_count:number; suggested_multiplier:number; confidence:number; sample_count:number; avg_over_winner_pct:number };
type BidRow = { id?:string; project_name?:string|null; project_type?:string|null; trades?:string[]|null; bid_amount?:number|null; margin_pct?:number|null; outcome?:string|null; loss_reason?:string|null };
type HistStats = { totalBids:number; wonBids:number; lostBids:number; winRate:number; avgMargin:number; totalValue:number };

export default function IntelligencePage() {
  const [scoring, setScoring] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [value, setValue] = useState('');
  const [trade, setTrade] = useState('Residential');
  const [result, setResult] = useState<Record<string,unknown>|null>(null);
  const [loading, setLoading] = useState(false);

  // Real win/loss intelligence — learned trade factors + this tenant's actual bid
  // history. No hardcoded numbers: we render exactly what the tenant has recorded,
  // or an honest empty state prompting them to mark bids Won/Lost.
  const [factors, setFactors] = useState<WinFactor[]>([]);
  const [winRate, setWinRate] = useState<number|null>(null);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [stats, setStats] = useState<HistStats|null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [wfRes, hRes] = await Promise.all([
          fetch('/api/bids/win-factors'),
          fetch('/api/bids/history?limit=50'),
        ]);
        const wf = wfRes.ok ? await wfRes.json() : null;
        const h  = hRes.ok  ? await hRes.json()  : null;
        if (!alive) return;
        setFactors(Array.isArray(wf?.factors) ? wf.factors : []);
        setWinRate(typeof wf?.winRate === 'number' ? wf.winRate : null);
        setWins(Number(wf?.wins) || 0);
        setLosses(Number(wf?.losses) || 0);
        setBids(Array.isArray(h?.bids) ? h.bids : []);
        setStats(h?.stats ?? null);
      } catch {
        if (!alive) return;
        setFactors([]); setBids([]); setStats(null); setWinRate(null);
      } finally {
        if (alive) setDataLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

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

  // Derived, all from real data above. Money columns can arrive as TEXT — every
  // figure goes through Number() before math or formatting.
  const tradeLabel = (f: WinFactor) => (f.trade && f.trade.trim()) ? f.trade : (f.csi_division ? `CSI Div ${f.csi_division}` : 'Unspecified');
  const headlineWinRate = winRate != null ? Math.round(winRate * 100) : (stats ? stats.winRate : 0);
  const bidsAnalyzed = (wins + losses) || (stats ? stats.totalBids : 0);
  const avgMargin = stats ? stats.avgMargin : 0;
  const totalValue = Number(stats?.totalValue) || 0;
  const recordWins = wins || (stats ? Number(stats.wonBids) || 0 : 0);
  const recordLosses = losses || (stats ? Number(stats.lostBids) || 0 : 0);
  const hasAnyData = factors.length > 0 || bids.length > 0;
  const ranked = [...factors].filter(f => (f.sample_count || 0) > 0).sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  return (
    <PremiumSurface maxWidth={2200}>
      <style>{`@media (max-width: 640px){ .pg-stack-1{ grid-template-columns: 1fr !important } }`}</style>

      <ModuleHero
        eyebrow="AI Learning Engine"
        eyebrowIcon={<Brain size={13} weight="fill" color={BIDS.hex} />}
        title="Bid"
        accent="Intelligence"
        subtitle="Every win and loss sharpens the next number."
        actions={
          <button onClick={()=>setScoring(!scoring)} style={goldButtonStyle} className="pmBtn">
            {scoring ? <><X size={15} weight="bold" /> Close Scoring</> : <><Sparkle size={15} weight="bold" /> Score New Opportunity</>}
          </button>
        }
      />

      {/* Stat strip — the learning engine at a glance, all from recorded outcomes */}
      {!dataLoading && hasAnyData && (
        <StatStrip items={[
          {href: '/app/bid-intelligence',  label: 'Overall Win Rate', value: `${headlineWinRate}%`, accent: headlineWinRate >= 50 ? GREEN : undefined, sub: `${recordWins}W · ${recordLosses}L recorded`, icon: <Trophy size={11} weight="bold" color={BIDS.hex} /> },
          {href: '/app/bid-intelligence',  label: 'Avg Winning Margin', value: `${(avgMargin||0).toFixed(1)}%`, icon: <Percent size={11} weight="bold" color={BIDS.hex} /> },
          {href: '/app/bid-intelligence',  label: 'Bids Analyzed', value: String(bidsAnalyzed), sub: 'Marked Won or Lost', icon: <Stack size={11} weight="bold" color={BIDS.hex} /> },
          {href: '/app/bid-intelligence',  label: 'Total Bid Value', value: `$${totalValue.toLocaleString()}`, accent: totalValue > 0 ? GOLD : undefined, sub: 'Across logged bids', icon: <CurrencyCircleDollar size={11} weight="bold" color={GOLD_HI} /> },
          {href: '/app/bid-intelligence',  label: 'Trades Tracked', value: String(factors.length), sub: factors.length > 0 ? 'Learned win factors' : 'None learned yet', icon: <ChartBar size={11} weight="bold" color={BIDS.hex} /> },
        ]} />
      )}

      {/* Score opportunity panel — real AI scoring, inline on the page */}
      {scoring && (
        <SectionCard
          title="Score a New Bid Opportunity"
          subtitle="Priced against your recorded win history."
          icon={<Sparkle size={17} weight="duotone" color={BIDS.hex} />}
          accent={BIDS.hex}
          style={{ marginBottom: 24 }}
        >
          <div className="pg-stack-1" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
            {[['Opportunity Title',title,setTitle,'e.g. 3,200 SF Custom Home — Scottsdale'],['Estimated Value',value,setValue,'$450,000']].map(f=>(
              <div key={f[0] as string}><label style={LBL}>{f[0] as string}</label>
                <input value={f[1] as string} onChange={e=>(f[2] as Function)(e.target.value)} placeholder={f[3] as string} style={INP}/></div>
            ))}
            <div><label style={LBL}>Trade Category</label>
              <select value={trade} onChange={e=>setTrade(e.target.value)} style={{...INP,cursor:'pointer'}}>
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
          <div style={{marginBottom:16}}><label style={LBL}>Description</label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="Describe the project scope…" style={{...INP,resize:'vertical'}}/></div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <button onClick={scoreOpportunity} disabled={loading} className="pmBtn" style={{...goldButtonStyle,cursor:loading?'wait':'pointer',opacity:loading?0.6:1}}>
              <Sparkle size={15} weight="bold" />{loading?'Scoring…':'Score with AI'}
            </button>
            <button onClick={()=>setScoring(false)} className="pmBtn" style={ghostButtonStyle}>Cancel</button>
          </div>
          {result&&('error' in result)&&<div style={{marginTop:20,background:'rgba(192,48,48,.08)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:10,padding:'14px 16px',fontSize:13,color:DIM,display:'flex',alignItems:'center',gap:8}}><Warning size={15} weight="fill" color={RED} />{result['error'] as string}</div>}
          {result&&!('error' in result)&&<div style={{marginTop:24}}>
            {/* Machined verdict band — micro-caps labels over hairline-separated figures */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:0,marginBottom:20,borderTop:`1px solid ${HAIRLINE}`,borderBottom:`1px solid ${HAIRLINE}`}}>
              {[{l:'Fit Score',v:`${result['score']}/100`,c:TEXT},{l:'Win Probability',v:`${result['winProbability']}%`,c:GREEN},{l:'Recommendation',v:String(result['recommendation']??'').replace(/^./,ch=>ch.toUpperCase()),c:GOLD_HI},{l:'Suggested Margin',v:`${result['suggestedMargin']}%`,c:TEXT}].map((k,i)=>(
                <div key={k.l} style={{textAlign:'center' as const,padding:'16px 10px',borderLeft:i>0?`1px solid ${HAIRLINE}`:'none'}}><div style={{fontSize:10,color:MUTED,fontWeight:700,marginBottom:8}}>{k.l}</div><div style={{fontSize:22,fontWeight:800,color:k.c,fontVariantNumeric:'tabular-nums' as const,letterSpacing:'-0.01em'}}>{k.v}</div></div>
              ))}
            </div>
            <div style={{background:DARK,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,fontSize:13,color:DIM,lineHeight:1.7}}>{result['reasoning'] as string}</div>
            {Array.isArray(result['riskFactors'])&&(result['riskFactors'] as string[]).length>0&&<div style={{marginTop:14}}>
              <div style={{fontSize:11,color:MUTED,fontWeight:700,marginBottom:8}}>Risk Factors</div>
              {(result['riskFactors'] as string[]).map((rf,i)=>(
                <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',fontSize:12,color:DIM,lineHeight:1.6,marginBottom:5}}>
                  <span style={{width:5,height:5,borderRadius:'50%',background:RED,marginTop:6,flexShrink:0}}/>{rf}
                </div>
              ))}
            </div>}
          </div>}
        </SectionCard>
      )}

      {dataLoading ? (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:12,marginBottom:20}}>
            {[0,1,2,3,4].map(i=><Skeleton key={i} height={74} borderRadius={14} />)}
          </div>
          <div className="pg-stack-1" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
            {[0,1].map(i=>(
              <SectionCard flat key={i}>
                <Skeleton height={16} width="42%" style={{marginBottom:18}} />
                {[0,1,2,3].map(r=>(
                  <div key={r} style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                    <Skeleton height={13} width={`${62 - r * 8}%`} />
                    <Skeleton height={13} width={64} />
                  </div>
                ))}
              </SectionCard>
            ))}
          </div>
        </>
      ) : !hasAnyData ? (
        <SectionCard accent={BIDS.hex}>
          <PremiumEmpty
            icon={<Brain size={32} weight="duotone" color={BIDS.hex} />}
            title="No win intelligence yet"
            description="Mark bids Won/Lost to build your win intelligence. Saguaro learns from every outcome and shows where you win — and where you leave money on the table."
            action={
              <button onClick={()=>setScoring(true)} style={goldButtonStyle} className="pmBtn">
                <Sparkle size={15} weight="bold" /> Score New Opportunity
              </button>
            }
          />
          <FlowStrip steps={[
            { title: 'Log Outcomes', desc: 'Mark bids Won or Lost' },
            { title: 'Engine Learns', desc: 'Win rates per trade + CSI division' },
            { title: 'Score the Next One', desc: 'AI fit score against your record' },
            { title: 'Sharpen the Number', desc: 'Suggested margin, honest risks' },
          ]} />
        </SectionCard>
      ) : (
      <div className="pg-stack-1" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,alignItems:'start'}}>
        {/* Win rate profile — learned trade factors + real headline stats */}
        <SectionCard flat
          title="Bid Intelligence Profile"
          subtitle="Learned trade factors from your recorded outcomes"
          icon={<TrendUp size={17} weight="duotone" color={BIDS.hex} />}
          accent={BIDS.hex}
        >
          {factors.length === 0 ? (
            <div style={{fontSize:12,color:DIM,lineHeight:1.6,padding:'4px 0 8px'}}>Trade-level win rates appear here as you log more Won/Lost outcomes across CSI divisions.</div>
          ) : factors.map(f=>{
            const wr = Math.round((f.win_rate||0)*100);
            const ci = Number(f.suggested_multiplier);
            const over = Number(f.avg_over_winner_pct);
            return (
            <div key={`${f.csi_division}-${f.trade??''}`} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:5}}>
                <span style={{color:TEXT,fontWeight:600}}>{tradeLabel(f)}</span>
                <span style={{color:wr>=60?GREEN:wr>0?DIM:RED,fontWeight:700,fontVariantNumeric:'tabular-nums' as const}}>{wr}% win ({f.win_count||0}/{f.sample_count||0})</span>
              </div>
              <div style={{height:5,background:'rgba(255,255,255,.08)',borderRadius:3}}>
                <div style={{height:'100%',width:`${wr}%`,background:wr>=60?GREEN:wr>0?DIM:RED,borderRadius:3}}/>
              </div>
              <div style={{display:'flex',gap:14,marginTop:5,fontSize:10,color:MUTED,flexWrap:'wrap' as const}}>
                {Number.isFinite(ci)&&ci>0&&<span>Competitive index <span style={{color:DIM,fontWeight:600}}>{ci.toFixed(2)}x</span></span>}
                {Number.isFinite(over)&&<span>Avg above winner <span style={{color:DIM,fontWeight:600}}>{over>0?'+':''}{over.toFixed(1)}%</span></span>}
                <span>{f.sample_count||0} sample{(f.sample_count||0)!==1?'s':''}</span>
              </div>
            </div>
          );})}
          {best && (
            <div style={{marginTop:20,display:'flex',gap:10,alignItems:'flex-start',background:'linear-gradient(180deg, var(--brand-primary-08), rgba(255,255,255,0.02))',border:'1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',borderRadius:10,padding:14,fontSize:12,color:DIM,lineHeight:1.6}}>
              <Sparkle size={14} weight="fill" color={GOLD_HI} style={{marginTop:2,flexShrink:0}} />
              <span><strong style={{color:TEXT,fontWeight:700}}>AI Recommendation:</strong> Strongest on {tradeLabel(best)} — {Math.round((best.win_rate||0)*100)}% win rate.{worst && worst!==best && (worst.win_rate||0) < (best.win_rate||0) ? ` Weakest on ${tradeLabel(worst)} — ${Math.round((worst.win_rate||0)*100)}% win rate; sharpen pricing or qualify harder there.` : ''}</span>
            </div>
          )}
        </SectionCard>

        {/* Bid history — this tenant's real recorded outcomes, machined table */}
        <SectionCard
          title="Bid History"
          subtitle={`${bids.length} recorded bid${bids.length !== 1 ? 's' : ''}`}
          icon={<Notebook size={17} weight="duotone" color={BIDS.hex} />}
          accent={BIDS.hex}
          flush
        >
          {bids.length === 0 ? (
            <div style={{padding:'32px 24px',fontSize:13,color:DIM,lineHeight:1.6}}>No bids logged yet. Mark opportunities Won or Lost to build your history.</div>
          ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch',maxWidth:'100%'}}>
          <table className="k-table" style={{ width:'100%',borderCollapse:'collapse' as const }}>
            <thead><tr style={{background:DARK}}>
              {['Project','Type','Bid','Margin','Result'].map((h,i)=><th key={h} style={{...TH,textAlign:(i===2||i===3)?'right' as const:'left' as const}}>{h}</th>)}
            </tr></thead>
            <tbody>{bids.map((o,i)=>{
              const oc = String(o.outcome||'').toLowerCase();
              const won = oc==='won', lost = oc==='lost';
              const proj = (o.project_name && o.project_name.trim()) || 'Untitled Bid';
              const type = (o.project_type && o.project_type.trim()) || (Array.isArray(o.trades) && o.trades.length ? o.trades[0] : '—');
              const amt = Number(o.bid_amount)||0;
              const mp = o.margin_pct==null ? null : Number(o.margin_pct);
              return (
              <tr key={o.id||i} style={{borderBottom:`1px solid ${HAIRLINE}`}}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <td style={{...TD,fontWeight:600,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{proj}</td>
                <td style={{...TD,color:DIM}}>{type}</td>
                <td style={{...TD,textAlign:'right' as const,color:GOLD,fontWeight:700,fontVariantNumeric:'tabular-nums' as const,whiteSpace:'nowrap' as const}}>${amt.toLocaleString()}</td>
                <td style={{...TD,textAlign:'right' as const,color:DIM,fontVariantNumeric:'tabular-nums' as const}}>{mp==null?'—':`${mp}%`}</td>
                <td style={TD}>
                  <span style={{fontSize:10,fontWeight:800,padding:'3px 9px',borderRadius:999,background:won?'rgba(26,138,74,.15)':lost?'rgba(192,48,48,.12)':'rgba(255,255,255,.06)',color:won?GREEN:lost?RED:DIM,whiteSpace:'nowrap' as const}}>
                    {(o.outcome||'').toString().replace(/^./,ch=>ch.toUpperCase())||'—'}
                  </span>
                  {lost&&o.loss_reason&&<div style={{fontSize:10,color:MUTED,marginTop:3}}>{o.loss_reason}</div>}
                </td>
              </tr>
            );})}</tbody>
          </table>
          </div>
          )}
        </SectionCard>
      </div>
      )}
    </PremiumSurface>
  );
}
