'use client'
import { useState, useEffect } from 'react'

interface FinancialReport {
  summary:{original_contract:number;approved_cos:number;pending_cos:number;revised_contract:number;billed_to_date:number;retainage_held:number;total_paid:number;balance_to_finish:number;percent_billed:number;labor_cost:number;subcommitments:number}
  change_orders:Array<{id:string;co_number:number;title:string;amount:number;status:string}>
  pay_app_history:Array<{period:string;billed:number;certified:number;cumulative:number}>
  sov_lines:Array<{id:string;line_number:number;description:string;scheduled_value:number;prev_completed:number;this_period:number;total_completed:number;percent_complete:number;balance_to_finish:number}>
  budget_vs_actual?:Array<Record<string,unknown>>
}

const fmt=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)
const pct=(n:number)=>`${Math.round(n)}%`

export default function FinancialsPage({ params }: { params: Promise<{projectId:string}> }) {
  const [data,setData]=useState<FinancialReport|null>(null)
  const [loading,setLoading]=useState(true)
  const [activeTab,setActiveTab]=useState('summary')

  useEffect(()=>{
    params.then(p=>{
      fetch(`/api/financial/project-report?projectId=${p.projectId}`)
        .then(r=>r.json()).then(d=>{setData(d);setLoading(false)})
        .catch(()=>setLoading(false))
    })
  },[params])

  if(loading) return <div style={{padding:40,color:'#555',textAlign:'center',background:'#0f0f1a',minHeight:'100vh'}}>Loading financial data...</div>
  if(!data) return <div style={{padding:40,color:'#F85149',textAlign:'center',background:'#0f0f1a',minHeight:'100vh'}}>Failed to load financial report.</div>

  const {summary,change_orders,pay_app_history,sov_lines}=data

  // SVG Cash Flow Chart
  const chartH=180, chartW=520, pad={t:20,r:20,b:40,l:60}
  const innerW=chartW-pad.l-pad.r, innerH=chartH-pad.t-pad.b
  const maxVal=Math.max(summary.revised_contract,1)
  const pts=pay_app_history.map((p,i)=>({
    x:pad.l+((i+0.5)/Math.max(pay_app_history.length,1))*innerW,
    y:pad.t+innerH-(p.cumulative/maxVal)*innerH,
    ...p
  }))
  const linePath=pts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ')

  // S-curve projection
  const projPts=Array.from({length:10},(_,i)=>{
    const x=pad.l+(i/9)*innerW
    const t=i/9
    const y=pad.t+innerH-(Math.pow(t,0.7)*summary.revised_contract/maxVal)*innerH
    return `${i===0?'M':'L'}${x},${y}`
  }).join(' ')

  const CO_STATUS:{[k:string]:{color:string,bg:string}}={
    approved:{color:'#3DD68C',bg:'rgba(61,214,140,0.12)'},
    submitted:{color:'#60A5FA',bg:'rgba(96,165,250,0.12)'},
    pending:{color:'#F0B429',bg:'rgba(240,180,41,0.12)'},
    rejected:{color:'#F85149',bg:'rgba(248,81,73,0.12)'},
  }

  return (
    <div style={{padding:24,background:'#0f0f1a',minHeight:'100vh'}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22,fontWeight:900,color:'#fff',margin:0}}>💰 Financial Report</h1>
        <p style={{color:'#666',fontSize:13,margin:'4px 0 0'}}>Contract financial summary</p>
      </div>

      {/* Contract KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[
          {label:'Original Contract',val:fmt(summary.original_contract),sub:null,color:'#888'},
          {label:'Approved Change Orders',val:fmt(summary.approved_cos),sub:`+${pct(summary.original_contract>0?summary.approved_cos/summary.original_contract*100:0)}`,color:'#3DD68C'},
          {label:'Revised Contract',val:fmt(summary.revised_contract),sub:'Total contract value',color:'#D4A017'},
          {label:'Billed to Date',val:fmt(summary.billed_to_date),sub:`${pct(summary.percent_billed)} complete`,color:'#60A5FA'},
          {label:'Retainage Held',val:fmt(summary.retainage_held),sub:'10% standard',color:'#F0B429'},
          {label:'Balance to Finish',val:fmt(summary.balance_to_finish),sub:'Remaining work',color:'#888'},
        ].map(({label,val,sub,color})=>(
          <div key={label} style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'18px 20px'}}>
            <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>{label}</div>
            <div style={{fontSize:24,fontWeight:900,color,marginBottom:4}}>{val}</div>
            {sub&&<div style={{fontSize:12,color:'#555'}}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:20,marginBottom:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <span style={{fontSize:13,fontWeight:700,color:'#ddd'}}>Contract Progress</span>
          <span style={{fontSize:15,fontWeight:900,color:'#D4A017'}}>{pct(summary.percent_billed)}</span>
        </div>
        <div style={{height:12,background:'rgba(255,255,255,0.07)',borderRadius:6,overflow:'hidden'}}>
          <div style={{width:`${Math.min(100,summary.percent_billed)}%`,height:'100%',background:'linear-gradient(90deg,#D4A017,#F0C040)',borderRadius:6,transition:'width 0.5s'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:11,color:'#555'}}>
          <span>{fmt(summary.billed_to_date)} billed</span>
          <span>{fmt(summary.balance_to_finish)} remaining</span>
        </div>
      </div>

      {/* Over-budget alert banner */}
      {data?.budget_vs_actual?.some((b:Record<string,unknown>)=>b.status==='over')&&(
        <div style={{background:'rgba(248,81,73,0.1)',border:'1px solid rgba(248,81,73,0.3)',borderRadius:8,padding:'10px 16px',marginBottom:20,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:16}}>⚠️</span>
          <span style={{fontSize:13,color:'#F85149',fontWeight:600}}>
            {data.budget_vs_actual.filter((b:Record<string,unknown>)=>b.status==='over').length} budget line{data.budget_vs_actual.filter((b:Record<string,unknown>)=>b.status==='over').length>1?'s are':' is'} over budget
          </span>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        {[{k:'summary',l:'Cash Flow'},{k:'pay_apps',l:'Pay App History'},{k:'cos',l:'Change Orders'},{k:'sov',l:'Schedule of Values'},{k:'budget',l:'Budget vs Actual'}].map(({k,l})=>(
          <button key={k} onClick={()=>setActiveTab(k)}
            style={{background:'none',border:'none',cursor:'pointer',padding:'8px 18px',fontSize:12,fontWeight:activeTab===k?700:400,color:activeTab===k?'#fff':'#666',borderBottom:activeTab===k?'2px solid #D4A017':'2px solid transparent',marginBottom:-1}}>
            {l}
          </button>
        ))}
      </div>

      {/* Cash Flow Chart */}
      {activeTab==='summary'&&(
        <div style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:24}}>
          <div style={{fontSize:14,fontWeight:700,color:'#ddd',marginBottom:16}}>Cash Flow — Actual vs S-Curve Projection</div>
          {pay_app_history.length===0?(
            <div style={{textAlign:'center',padding:'40px 0',color:'#555',fontSize:13}}>No pay applications yet. Cash flow chart will appear after the first certified pay app.</div>
          ):(
            <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{width:'100%',maxWidth:chartW}}>
              {/* Grid */}
              {[0,25,50,75,100].map(p=>{
                const y=pad.t+innerH-(p/100)*innerH
                return <g key={p}><line x1={pad.l} y1={y} x2={pad.l+innerW} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1}/><text x={pad.l-6} y={y+4} textAnchor="end" fill="#555" fontSize={10}>{p}%</text></g>
              })}
              {/* X-axis labels */}
              {pts.map((p,i)=>(
                <text key={i} x={p.x} y={chartH-8} textAnchor="middle" fill="#555" fontSize={9}>
                  {new Date(p.period||'').toLocaleDateString('en-US',{month:'short'})||`PA${i+1}`}
                </text>
              ))}
              {/* S-Curve (projected) */}
              {summary.revised_contract>0&&<path d={projPts} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2} strokeDasharray="6 3"/>}
              {/* Actual */}
              {pts.length>0&&<path d={linePath} fill="none" stroke="#D4A017" strokeWidth={2.5}/>}
              {/* Points */}
              {pts.map((p,i)=>(
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="#D4A017"/>
              ))}
              {/* Legend */}
              <g><circle cx={pad.l} cy={chartH-28} r={4} fill="#D4A017"/><text x={pad.l+10} y={chartH-24} fill="#888" fontSize={11}>Actual Billed</text></g>
              <g><line x1={pad.l+90} y1={chartH-28} x2={pad.l+114} y2={chartH-28} stroke="rgba(255,255,255,0.3)" strokeWidth={2} strokeDasharray="4 2"/><text x={pad.l+120} y={chartH-24} fill="#555" fontSize={11}>S-Curve Projection</text></g>
            </svg>
          )}
        </div>
      )}

      {/* Pay App History */}
      {activeTab==='pay_apps'&&(
        <div style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,overflow:'hidden'}}>
          {pay_app_history.length===0
            ? <div style={{padding:40,textAlign:'center',color:'#555'}}>No certified pay applications yet.</div>
            : <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:'#1a1a2e'}}>{['App','Period','This Billing','Certified','Cumulative %'].map(h=><th key={h} style={{padding:'11px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {pay_app_history.map((p,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                      <td style={{padding:'11px 16px',color:'#D4A017',fontWeight:700,fontSize:13}}>#{i+1}</td>
                      <td style={{padding:'11px 16px',color:'#888',fontSize:12}}>{p.period?new Date(p.period).toLocaleDateString('en-US',{month:'short',year:'numeric'}):'—'}</td>
                      <td style={{padding:'11px 16px',color:'#ddd',fontSize:13,fontWeight:600}}>{fmt(p.billed)}</td>
                      <td style={{padding:'11px 16px'}}><span style={{color:p.certified>0?'#3DD68C':'#888',fontSize:13,fontWeight:p.certified>0?700:400}}>{fmt(p.certified)}</span></td>
                      <td style={{padding:'11px 16px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:80,height:5,background:'rgba(255,255,255,0.08)',borderRadius:3}}>
                            <div style={{width:`${Math.min(100,(p.cumulative/Math.max(summary.revised_contract,1))*100)}%`,height:'100%',background:'#D4A017',borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:11,color:'#888'}}>{pct((p.cumulative/Math.max(summary.revised_contract,1))*100)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}

      {/* Change Orders */}
      {activeTab==='cos'&&(
        <div style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,overflow:'hidden'}}>
          {change_orders.length===0
            ? <div style={{padding:40,textAlign:'center',color:'#555'}}>No change orders on this project.</div>
            : <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:'#1a1a2e'}}>{['CO#','Title','Amount','Status'].map(h=><th key={h} style={{padding:'11px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {change_orders.map((co,i)=>{
                    const s=CO_STATUS[co.status]||CO_STATUS.pending
                    return (
                      <tr key={co.id} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                        <td style={{padding:'11px 16px',color:'#D4A017',fontWeight:700,fontSize:13}}>CO-{co.co_number||i+1}</td>
                        <td style={{padding:'11px 16px',color:'#ddd',fontSize:13}}>{co.title}</td>
                        <td style={{padding:'11px 16px',color:co.amount>0?'#3DD68C':'#F85149',fontSize:13,fontWeight:700}}>{fmt(co.amount)}</td>
                        <td style={{padding:'11px 16px'}}><span style={{fontSize:11,padding:'3px 8px',borderRadius:4,fontWeight:700,...s}}>{co.status}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'#1a1a2e',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                    <td colSpan={2} style={{padding:'11px 16px',fontSize:12,fontWeight:700,color:'#888'}}>Approved CO Total</td>
                    <td style={{padding:'11px 16px',color:'#3DD68C',fontSize:14,fontWeight:900}}>{fmt(summary.approved_cos)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
          }
        </div>
      )}

      {/* Budget vs Actual */}
      {activeTab==='budget'&&(
        <div style={{background:'#16213e',borderRadius:12,border:'1px solid rgba(255,255,255,0.07)',overflow:'hidden'}}>
          {!data.budget_vs_actual?.length ? (
            <div style={{padding:40,textAlign:'center',color:'#555'}}>
              No budget lines set up. Go to project settings to configure the budget.
            </div>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#1a1a2e'}}>
                {['Cost Code/Category','Budgeted','Actual to Date','Variance','Status'].map((h,i)=>(
                  <th key={h} style={{padding:'11px 16px',textAlign:i===0?'left':'right',fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.budget_vs_actual.map((b:Record<string,unknown>,i:number)=>(
                  <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.025)',background:(b.status==='over')?'rgba(248,81,73,0.04)':i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                    <td style={{padding:'11px 16px',color:'#ddd',fontSize:13,textAlign:'left'}}>{String(b.description||b.name||b.category||'')}</td>
                    <td style={{padding:'11px 16px',color:'#888',fontSize:13,textAlign:'right'}}>{fmt(Number(b.budgeted||0))}</td>
                    <td style={{padding:'11px 16px',color:'#ddd',fontSize:13,fontWeight:600,textAlign:'right'}}>{fmt(Number(b.actual||0))}</td>
                    <td style={{padding:'11px 16px',textAlign:'right'}}>
                      <span style={{fontSize:13,fontWeight:700,color:Number(b.variance||0)>0?'#F85149':Number(b.variance||0)<0?'#3DD68C':'#888'}}>
                        {Number(b.variance||0)>0?'+':''}{fmt(Number(b.variance||0))}
                      </span>
                    </td>
                    <td style={{padding:'11px 16px',textAlign:'right'}}>
                      <span style={{fontSize:11,padding:'3px 8px',borderRadius:4,fontWeight:700,
                        background:b.status==='over'?'rgba(248,81,73,0.12)':b.status==='warning'?'rgba(240,180,41,0.12)':'rgba(61,214,140,0.12)',
                        color:b.status==='over'?'#F85149':b.status==='warning'?'#F0B429':'#3DD68C'}}>
                        {b.status==='over'?'Over Budget':b.status==='warning'?'Watch':'On Track'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* SOV */}
      {activeTab==='sov'&&(
        <div style={{background:'#16213e',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,overflow:'auto'}}>
          {sov_lines.length===0
            ? <div style={{padding:40,textAlign:'center',color:'#555'}}>No Schedule of Values lines. Add SOV lines to use the G702/G703 generator.</div>
            : <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
                <thead><tr style={{background:'#1a1a2e'}}>{['#','Description','Scheduled Value','Prev Period','This Period','Total Completed','%','Balance'].map(h=><th key={h} style={{padding:'11px 14px',textAlign:'right',fontSize:10,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid rgba(255,255,255,0.06)',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {sov_lines.map((l,i)=>(
                    <tr key={l.id} style={{borderBottom:'1px solid rgba(255,255,255,0.025)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                      <td style={{padding:'9px 14px',color:'#D4A017',fontSize:12,fontWeight:700,textAlign:'right'}}>{l.line_number}</td>
                      <td style={{padding:'9px 14px',color:'#ddd',fontSize:12,textAlign:'left'}}>{l.description}</td>
                      <td style={{padding:'9px 14px',color:'#aaa',fontSize:12,textAlign:'right'}}>{fmt(l.scheduled_value)}</td>
                      <td style={{padding:'9px 14px',color:'#888',fontSize:12,textAlign:'right'}}>{fmt(l.prev_completed)}</td>
                      <td style={{padding:'9px 14px',color:'#888',fontSize:12,textAlign:'right'}}>{fmt(l.this_period)}</td>
                      <td style={{padding:'9px 14px',color:'#ddd',fontSize:12,fontWeight:600,textAlign:'right'}}>{fmt(l.total_completed)}</td>
                      <td style={{padding:'9px 14px',textAlign:'right'}}>
                        <span style={{fontSize:11,color:l.percent_complete===100?'#3DD68C':l.percent_complete>50?'#D4A017':'#888',fontWeight:700}}>{Math.round(l.percent_complete)}%</span>
                      </td>
                      <td style={{padding:'9px 14px',color:'#666',fontSize:12,textAlign:'right'}}>{fmt(l.balance_to_finish)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:'#1a1a2e',borderTop:'2px solid rgba(212,160,23,0.3)'}}>
                    <td colSpan={2} style={{padding:'11px 14px',fontSize:12,fontWeight:700,color:'#D4A017'}}>TOTALS</td>
                    <td style={{padding:'11px 14px',fontSize:13,fontWeight:900,color:'#D4A017',textAlign:'right'}}>{fmt(sov_lines.reduce((s,l)=>s+l.scheduled_value,0))}</td>
                    <td style={{padding:'11px 14px',fontSize:12,fontWeight:700,color:'#888',textAlign:'right'}}>{fmt(sov_lines.reduce((s,l)=>s+l.prev_completed,0))}</td>
                    <td style={{padding:'11px 14px',fontSize:12,fontWeight:700,color:'#888',textAlign:'right'}}>{fmt(sov_lines.reduce((s,l)=>s+l.this_period,0))}</td>
                    <td style={{padding:'11px 14px',fontSize:13,fontWeight:900,color:'#fff',textAlign:'right'}}>{fmt(sov_lines.reduce((s,l)=>s+l.total_completed,0))}</td>
                    <td style={{padding:'11px 14px',fontSize:13,fontWeight:900,color:'#D4A017',textAlign:'right'}}>{pct(sov_lines.length>0?sov_lines.reduce((s,l)=>s+l.total_completed,0)/Math.max(sov_lines.reduce((s,l)=>s+l.scheduled_value,0),1)*100:0)}</td>
                    <td style={{padding:'11px 14px',fontSize:13,fontWeight:900,color:'#888',textAlign:'right'}}>{fmt(sov_lines.reduce((s,l)=>s+l.balance_to_finish,0))}</td>
                  </tr>
                </tfoot>
              </table>
          }
        </div>
      )}
    </div>
  )
}
