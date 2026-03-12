'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import SaguaroDatePicker from '../../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

interface SovLine {
  lineNumber: number;
  description: string;
  scheduledValue: number;
  workFromPrev: number;
  workThisPeriod: number;
  materialsStored: number;
  percentComplete: number;
  balanceToFinish: number;
  retainage: number;
}

function blankLine(n:number):SovLine{
  return {lineNumber:n,description:'',scheduledValue:0,workFromPrev:0,workThisPeriod:0,materialsStored:0,percentComplete:0,balanceToFinish:0,retainage:0};
}

const INP:React.CSSProperties = {padding:'8px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};

export default function NewPayAppPage() {
  const params    = useParams();
  const router    = useRouter();
  const projectId = params['projectId'] as string;

  const [step,setStep]             = useState(1);
  const [saving,setSaving]         = useState(false);
  const [error,setError]           = useState('');

  // Step 1
  const [periodFrom,setPeriodFrom]     = useState('');
  const [periodTo,setPeriodTo]         = useState('');
  const [contractSum,setContractSum]   = useState('');
  const [retainagePct,setRetainagePct] = useState('10');

  // SOV
  const [lines,setLines] = useState<SovLine[]>([blankLine(1),blankLine(2),blankLine(3)]);

  // Load project to pre-fill contract sum
  useEffect(()=>{
    (async()=>{
      try{
        const r = await fetch('/api/projects/list');
        const d = await r.json();
        const p = (d.projects||[]).find((x:any)=>x.id===projectId);
        if(p?.contract_amount) setContractSum(String(p.contract_amount));
      }catch{}
    })();
  },[projectId]);

  const pct = Math.max(0,Math.min(100,Number(retainagePct)||10));

  function recalcLine(l:SovLine):SovLine{
    const total = (l.workFromPrev||0)+(l.workThisPeriod||0)+(l.materialsStored||0);
    const sv    = l.scheduledValue||0;
    return {
      ...l,
      percentComplete: sv>0 ? Math.round((total/sv)*1000)/10 : 0,
      balanceToFinish: sv - total,
      retainage: total*(pct/100),
    };
  }

  function updateLine(i:number, field:keyof SovLine, val:string){
    setLines(prev=>{
      const next = [...prev];
      const updated = {...next[i], [field]: field==='description' ? val : (parseFloat(val)||0)};
      next[i] = recalcLine(updated);
      return next;
    });
  }

  function addLine(){ setLines(prev=>[...prev,blankLine(prev.length+1)]); }
  function removeLine(i:number){ setLines(prev=>prev.filter((_,idx)=>idx!==i).map((l,idx)=>({...l,lineNumber:idx+1}))); }

  // Live totals
  const thisPeriodTotal  = lines.reduce((s,l)=>s+(l.workThisPeriod||0),0);
  const prevTotal        = lines.reduce((s,l)=>s+(l.workFromPrev||0),0);
  const matsTotal        = lines.reduce((s,l)=>s+(l.materialsStored||0),0);
  const totalCompleted   = prevTotal+thisPeriodTotal+matsTotal;
  const retainageAmt     = totalCompleted*(pct/100);
  const earnedLessRet    = totalCompleted - retainageAmt;
  const paymentDue       = Math.max(0, earnedLessRet - prevTotal*(1-pct/100));
  const contractSumNum   = Number(contractSum)||0;

  async function save(status:'draft'|'submitted'){
    if(!periodFrom||!periodTo){ setError('Period From and Period To are required.'); return; }
    setSaving(true); setError('');
    try{
      const body = {
        projectId,
        periodFrom,
        periodTo,
        contractSum: contractSumNum,
        retainagePercent: pct,
        status,
        prevCompleted: prevTotal,
        thisPeriod: thisPeriodTotal,
        materialsStored: matsTotal,
        totalCompleted,
        percentComplete: contractSumNum>0 ? Math.round((totalCompleted/contractSumNum)*100) : 0,
        retainageAmount: retainageAmt,
        totalEarnedLessRetainage: earnedLessRet,
        currentPaymentDue: paymentDue,
        lineItems: lines.filter(l=>l.description||l.scheduledValue>0).map(l=>({
          description: l.description,
          scheduledValue: l.scheduledValue,
          workFromPrev: l.workFromPrev,
          workThisPeriod: l.workThisPeriod,
          materialsStored: l.materialsStored,
          percentComplete: l.percentComplete,
          balanceToFinish: l.balanceToFinish,
          retainage: l.retainage,
        })),
      };

      const r1 = await fetch('/api/pay-apps/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d1 = await r1.json();
      if(d1.error) throw new Error(d1.error);

      if(status==='submitted'){
        const paId = (d1.payApp as any).id;
        const r2 = await fetch(`/api/pay-apps/${paId}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId})});
        const d2 = await r2.json();
        if(d2.error) throw new Error(d2.error);
      }

      router.push(`/app/projects/${projectId}/pay-apps`);
    }catch(e:any){
      setError(e.message||'Failed to save pay application');
    }finally{
      setSaving(false);
    }
  }

  return (
    <div style={{background:DARK,minHeight:'100%'}}>
      {/* Header */}
      <div style={{padding:'16px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <Link href={`/app/projects/${projectId}/pay-apps`} style={{color:DIM,fontSize:13,textDecoration:'none'}}>← Pay Applications</Link>
          <span style={{color:BORDER}}>|</span>
          <div>
            <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>New Pay Application</h2>
            <div style={{fontSize:12,color:DIM,marginTop:2}}>AIA G702/G703 — Application and Certificate for Payment</div>
          </div>
        </div>
        {/* Step tabs */}
        <div style={{display:'flex',background:RAISED,borderRadius:8,padding:3,border:`1px solid ${BORDER}`}}>
          {[{n:1,l:'1. Period'},{n:2,l:'2. Schedule of Values'}].map(s=>(
            <button key={s.n} onClick={()=>setStep(s.n)}
              style={{padding:'6px 16px',borderRadius:6,border:'none',fontWeight:700,fontSize:12,cursor:'pointer',background:step===s.n?GOLD:'transparent',color:step===s.n?DARK:DIM,transition:'all .15s'}}
            >{s.l}</button>
          ))}
        </div>
      </div>

      <div style={{padding:24}}>
        {error && (
          <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
            {error}
          </div>
        )}

        {/* STEP 1: Period & Contract */}
        {step===1 && (
          <div style={{maxWidth:680}}>
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:28}}>
              <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:20,paddingBottom:12,borderBottom:`1px solid ${BORDER}`}}>
                Period & Contract Information
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginBottom:18}}>
                <div>
                  <label style={LBL}>Period From *</label>
                  <SaguaroDatePicker value={periodFrom} onChange={setPeriodFrom} style={INP}/>
                </div>
                <div>
                  <label style={LBL}>Period To *</label>
                  <SaguaroDatePicker value={periodTo} onChange={setPeriodTo} style={INP}/>
                </div>
                <div>
                  <label style={LBL}>Contract Sum ($)</label>
                  <input type="number" value={contractSum} onChange={e=>setContractSum(e.target.value)} placeholder="0" min="0" style={INP}/>
                </div>
                <div>
                  <label style={LBL}>Retainage %</label>
                  <input type="number" value={retainagePct} onChange={e=>setRetainagePct(e.target.value)} placeholder="10" min="0" max="100" style={INP}/>
                </div>
              </div>
              <button onClick={()=>setStep(2)} style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontWeight:800,fontSize:13,cursor:'pointer'}}>
                Next: Schedule of Values →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SOV */}
        {step===2 && (
          <div style={{display:'flex',gap:22,alignItems:'flex-start'}}>
            {/* Table */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',marginBottom:16}}>
                <div style={{padding:'12px 18px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontWeight:800,fontSize:15,color:TEXT}}>Schedule of Values (G703)</span>
                  <button onClick={addLine} style={{padding:'6px 14px',background:'rgba(212,160,23,.12)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:6,color:GOLD,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    + Add Row
                  </button>
                </div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:12}}>
                    <thead>
                      <tr style={{background:DARK}}>
                        {['#','Description','Sched. Value','Work Prev ($)','This Period ($)','Mat. Stored ($)','% Complete','Balance','Retainage',''].map(h=>(
                          <th key={h} style={{padding:'9px 10px',textAlign:'left' as const,fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.4,color:DIM,borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap' as const}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid rgba(38,51,71,.4)`,background:i%2===0?'transparent':'rgba(255,255,255,.015)'}}>
                          <td style={{padding:'6px 10px',color:DIM,fontWeight:700,minWidth:28}}>{l.lineNumber}</td>
                          <td style={{padding:'4px 6px',minWidth:170}}>
                            <input value={l.description} onChange={e=>updateLine(i,'description',e.target.value)}
                              placeholder="Description" style={{...INP,padding:'5px 8px',fontSize:12}}/>
                          </td>
                          {(['scheduledValue','workFromPrev','workThisPeriod','materialsStored'] as const).map(f=>(
                            <td key={f} style={{padding:'4px 6px',minWidth:100}}>
                              <input type="number" value={(l as any)[f]||''} onChange={e=>updateLine(i,f,e.target.value)}
                                placeholder="0" style={{...INP,padding:'5px 8px',fontSize:12,textAlign:'right' as const}}/>
                            </td>
                          ))}
                          <td style={{padding:'6px 10px',color:TEXT,textAlign:'right' as const,whiteSpace:'nowrap' as const,minWidth:70}}>{l.percentComplete.toFixed(1)}%</td>
                          <td style={{padding:'6px 10px',color:l.balanceToFinish<0?RED:DIM,textAlign:'right' as const,whiteSpace:'nowrap' as const,minWidth:90}}>{fmt(l.balanceToFinish)}</td>
                          <td style={{padding:'6px 10px',color:ORANGE,textAlign:'right' as const,whiteSpace:'nowrap' as const,minWidth:90}}>{fmt(l.retainage)}</td>
                          <td style={{padding:'6px 8px'}}>
                            <button onClick={()=>removeLine(i)} style={{background:'none',border:'none',color:RED,cursor:'pointer',fontSize:15,padding:'3px 6px'}}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{background:DARK,borderTop:`2px solid ${BORDER}`}}>
                        <td colSpan={2} style={{padding:'10px 10px',fontWeight:800,fontSize:12,color:TEXT,textTransform:'uppercase' as const,letterSpacing:.3}}>TOTALS</td>
                        <td style={{padding:'10px 10px',fontWeight:800,color:GOLD,textAlign:'right' as const}}>{fmt(lines.reduce((s,l)=>s+(l.scheduledValue||0),0))}</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:TEXT,textAlign:'right' as const}}>{fmt(prevTotal)}</td>
                        <td style={{padding:'10px 10px',fontWeight:800,color:'#3dd68c',textAlign:'right' as const}}>{fmt(thisPeriodTotal)}</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:TEXT,textAlign:'right' as const}}>{fmt(matsTotal)}</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:DIM}}>{contractSumNum>0?((totalCompleted/contractSumNum)*100).toFixed(1):0}%</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:DIM,textAlign:'right' as const}}>{fmt(lines.reduce((s,l)=>s+(l.balanceToFinish||0),0))}</td>
                        <td style={{padding:'10px 10px',fontWeight:700,color:ORANGE,textAlign:'right' as const}}>{fmt(retainageAmt)}</td>
                        <td/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div style={{display:'flex',gap:10,flexWrap:'wrap' as const}}>
                <button onClick={()=>setStep(1)} style={{padding:'10px 20px',background:'none',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  ← Back
                </button>
                <button onClick={()=>save('draft')} disabled={saving}
                  style={{padding:'10px 22px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontWeight:700,fontSize:13,cursor:saving?'wait':'pointer',opacity:saving?.6:1}}>
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
                <button onClick={()=>save('submitted')} disabled={saving}
                  style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontWeight:800,fontSize:13,cursor:saving?'wait':'pointer',opacity:saving?.6:1}}>
                  {saving ? 'Submitting…' : 'Submit to Owner →'}
                </button>
              </div>
            </div>

            {/* Live Calc Panel */}
            <div style={{width:256,flexShrink:0,position:'sticky' as const,top:80}}>
              <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:20}}>
                <div style={{fontWeight:800,fontSize:14,color:TEXT,marginBottom:16,paddingBottom:10,borderBottom:`1px solid ${BORDER}`}}>Live Summary</div>
                {[
                  {l:'Contract Sum',v:fmt(contractSumNum),c:TEXT},
                  {l:'Prev Completed',v:fmt(prevTotal),c:DIM},
                  {l:'This Period',v:fmt(thisPeriodTotal),c:GOLD},
                  {l:'Materials Stored',v:fmt(matsTotal),c:DIM},
                  {l:'Total Completed',v:fmt(totalCompleted),c:TEXT},
                  {l:`Retainage (${pct}%)`,v:fmt(retainageAmt),c:ORANGE},
                ].map(row=>(
                  <div key={row.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <span style={{fontSize:12,color:DIM}}>{row.l}</span>
                    <span style={{fontSize:13,fontWeight:700,color:row.c}}>{row.v}</span>
                  </div>
                ))}
                <div style={{marginTop:12,paddingTop:12,borderTop:`2px solid ${BORDER}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:12,fontWeight:800,color:TEXT}}>Payment Due</span>
                    <span style={{fontSize:18,fontWeight:800,color:GREEN}}>{fmt(paymentDue)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
