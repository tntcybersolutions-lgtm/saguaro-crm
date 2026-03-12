'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

const WAIVER_TYPES = [
  {key:'conditional_partial',   label:'Conditional Partial'},
  {key:'unconditional_partial', label:'Unconditional Partial'},
  {key:'conditional_final',     label:'Conditional Final'},
  {key:'unconditional_final',   label:'Unconditional Final'},
];

const INP:React.CSSProperties = {padding:'8px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};

type WaiverStatus = 'signed'|'pending'|null;

interface MatrixRow {
  subId: string;
  subName: string;
  waivers: Record<string,{id:string,status:string,pdf_url?:string}|null>;
}

function buildMatrix(waivers:any[]):MatrixRow[]{
  const bySubId:Record<string,MatrixRow> = {};
  for(const w of waivers){
    const subId   = w.sub_id||w.subId||w.id;
    const subName = (w.subcontractors as any)?.name||w.sub_name||w.claimant_name||'Unknown';
    if(!bySubId[subId]){
      bySubId[subId] = {subId,subName,waivers:{}};
    }
    bySubId[subId].waivers[w.waiver_type] = {id:w.id,status:w.status,pdf_url:w.pdf_url};
  }
  return Object.values(bySubId);
}

function CellIcon({status,pdfUrl}:{status:string|undefined|null,pdfUrl?:string}){
  if(status==='signed'){
    return (
      <div style={{display:'flex',flexDirection:'column' as const,alignItems:'center',gap:4}}>
        <span style={{fontSize:16,color:'#3dd68c'}}>✓</span>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            style={{fontSize:10,color:GOLD,textDecoration:'none',padding:'2px 7px',border:`1px solid rgba(212,160,23,.3)`,borderRadius:4}}>
            PDF
          </a>
        )}
      </div>
    );
  }
  if(status==='pending'){
    return <span style={{fontSize:16,color:'#f59e0b'}} title="Pending signature">⏳</span>;
  }
  return <span style={{fontSize:14,color:BORDER}}>—</span>;
}

export default function LienWaiversPage() {
  const params    = useParams();
  const projectId = params['projectId'] as string;

  const [waivers,setWaivers]   = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [showForm,setShowForm] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [genAll,setGenAll]     = useState(false);

  // form
  const [fType,setFType]         = useState('conditional_partial');
  const [fState,setFState]       = useState('AZ');
  const [fClaimant,setFClaimant] = useState('');
  const [fAmount,setFAmount]     = useState('');
  const [fThrough,setFThrough]   = useState(new Date().toISOString().slice(0,10));

  const load = useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const r = await fetch(`/api/lien-waivers/list?projectId=${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setWaivers(d.lienWaivers??[]);
    }catch(e:any){
      setError(e.message||'Failed to load lien waivers');
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  async function generate(){
    if(!fClaimant.trim()||!fAmount||!fThrough){ setError('Claimant, amount, and through date are required'); return; }
    setGenerating(true); setError('');
    try{
      const r = await fetch('/api/lien-waivers/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,waiverType:fType,state:fState,claimantName:fClaimant,amount:parseFloat(fAmount)||0,throughDate:fThrough,
      })});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setFClaimant(''); setFAmount(''); setFThrough(new Date().toISOString().slice(0,10));
      setShowForm(false);
      await load();
    }catch(e:any){
      setError(e.message||'Failed to generate lien waiver');
    }finally{
      setGenerating(false);
    }
  }

  async function generateAll(){
    setGenAll(true);
    try{
      // Generate conditional partial for all subs that don't have one for current period
      const matrix = buildMatrix(waivers);
      for(const row of matrix){
        if(!row.waivers['conditional_partial']){
          await fetch('/api/lien-waivers/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            projectId,waiverType:'conditional_partial',claimantName:row.subName,throughDate:fThrough,amount:0,subId:row.subId,
          })});
        }
      }
      await load();
    }catch(e:any){
      setError(e.message||'Failed to generate all waivers');
    }finally{
      setGenAll(false);
    }
  }

  const matrix = buildMatrix(waivers);
  const signed  = waivers.filter(w=>w.status==='signed').length;
  const pending = waivers.filter(w=>w.status==='pending').length;

  return (
    <div>
      {/* Header */}
      <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Lien Waivers</h2>
          <div style={{fontSize:12,color:DIM,marginTop:3}}>
            {loading ? 'Loading…' : `${waivers.length} total · ${signed} signed · ${pending} pending`}
          </div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setShowForm(!showForm)}
            style={{padding:'9px 18px',background:'rgba(212,160,23,.1)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:7,color:GOLD,fontSize:13,fontWeight:700,cursor:'pointer'}}>
            + Generate Waiver
          </button>
          <button onClick={generateAll} disabled={genAll}
            style={{padding:'9px 18px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:DARK,fontSize:13,fontWeight:800,cursor:genAll?'wait':'pointer',opacity:genAll?.6:1}}>
            {genAll ? 'Generating…' : '⚡ Generate All'}
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{margin:'20px 24px',background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:12,padding:24}}>
          <div style={{fontWeight:800,fontSize:15,color:TEXT,marginBottom:18,paddingBottom:12,borderBottom:`1px solid ${BORDER}`}}>Generate Lien Waiver</div>
          {error && (
            <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'10px 14px',marginBottom:16,color:RED,fontSize:13}}>{error}</div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:16}}>
            <div>
              <label style={LBL}>Waiver Type</label>
              <select value={fType} onChange={e=>setFType(e.target.value)} style={INP}>
                {WAIVER_TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>State</label>
              <select value={fState} onChange={e=>setFState(e.target.value)} style={INP}>
                {['AZ','CA','TX','NV','CO','FL','WA','OR','UT','NM','OTHER'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Claimant Name *</label>
              <input value={fClaimant} onChange={e=>setFClaimant(e.target.value)} placeholder="ABC Electrical LLC" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Amount ($) *</label>
              <input type="number" value={fAmount} onChange={e=>setFAmount(e.target.value)} placeholder="45000" min="0" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Through Date *</label>
              <SaguaroDatePicker value={fThrough} onChange={setFThrough} style={INP}/>
            </div>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={generate} disabled={generating}
              style={{padding:'9px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontWeight:800,fontSize:13,cursor:generating?'wait':'pointer',opacity:generating?.6:1}}>
              {generating ? 'Generating…' : 'Generate PDF'}
            </button>
            <button onClick={()=>{setShowForm(false);setError('');}}
              style={{padding:'9px 18px',background:'none',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{padding:24}}>
        {/* Error outside form */}
        {error && !showForm && (
          <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && <div style={{padding:40,textAlign:'center' as const,color:DIM}}>Loading lien waivers…</div>}

        {/* Empty */}
        {!loading && waivers.length===0 && (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:56,textAlign:'center' as const}}>
            <div style={{fontSize:40,marginBottom:14}}>📄</div>
            <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>No lien waivers yet</div>
            <div style={{fontSize:13,color:DIM,marginBottom:24}}>
              Generate state-specific conditional and unconditional lien waivers.<br/>
              AZ (ARS §33-1008), CA (Civil Code §8132), TX (Property Code Ch. 53) statutory forms included.
            </div>
            <button onClick={()=>setShowForm(true)}
              style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
              + Generate First Waiver
            </button>
          </div>
        )}

        {/* Matrix View */}
        {!loading && matrix.length>0 && (
          <>
            <div style={{marginBottom:12,fontSize:13,color:DIM}}>
              <span style={{marginRight:16}}><span style={{color:'#3dd68c'}}>✓</span> Signed</span>
              <span style={{marginRight:16}}><span style={{color:'#f59e0b'}}>⏳</span> Pending</span>
              <span><span style={{color:BORDER}}>—</span> Not generated</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
                <thead>
                  <tr style={{background:DARK}}>
                    <th style={{padding:'10px 16px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`,minWidth:180}}>
                      Subcontractor
                    </th>
                    {WAIVER_TYPES.map(t=>(
                      <th key={t.key} style={{padding:'10px 16px',textAlign:'center' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`,minWidth:140}}>
                        {t.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map(row=>(
                    <tr key={row.subId} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
                      <td style={{padding:'14px 16px',color:TEXT,fontWeight:700}}>{row.subName}</td>
                      {WAIVER_TYPES.map(t=>{
                        const w = row.waivers[t.key];
                        return (
                          <td key={t.key} style={{padding:'14px 16px',textAlign:'center' as const}}>
                            <CellIcon status={w?.status} pdfUrl={w?.pdf_url}/>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* List of individual waivers */}
            {waivers.length>0 && (
              <div style={{marginTop:28}}>
                <div style={{fontWeight:800,fontSize:15,color:TEXT,marginBottom:14}}>All Waivers</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
                    <thead>
                      <tr style={{background:DARK}}>
                        {['Claimant','Type','State','Amount','Through Date','Status','Download'].map(h=>(
                          <th key={h} style={{padding:'9px 14px',textAlign:'left' as const,fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {waivers.map((w:any)=>{
                        const typeLabel = WAIVER_TYPES.find(t=>t.key===w.waiver_type)?.label || w.waiver_type;
                        return (
                          <tr key={w.id} style={{borderBottom:`1px solid rgba(38,51,71,.4)`}}>
                            <td style={{padding:'10px 14px',color:TEXT,fontWeight:600}}>{w.claimant_name||(w.subcontractors as any)?.name||'—'}</td>
                            <td style={{padding:'10px 14px',color:DIM}}>{typeLabel}</td>
                            <td style={{padding:'10px 14px',color:DIM}}>{w.state||'—'}</td>
                            <td style={{padding:'10px 14px',color:TEXT}}>{fmt(w.amount||0)}</td>
                            <td style={{padding:'10px 14px',color:DIM}}>{w.through_date||'—'}</td>
                            <td style={{padding:'10px 14px'}}>
                              <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase' as const,
                                background:w.status==='signed'?'rgba(26,138,74,.14)':'rgba(212,160,23,.14)',
                                color:w.status==='signed'?'#3dd68c':GOLD}}>
                                {w.status||'pending'}
                              </span>
                            </td>
                            <td style={{padding:'10px 14px'}}>
                              {w.pdf_url && (
                                <a href={w.pdf_url} target="_blank" rel="noreferrer"
                                  style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 9px',textDecoration:'none',cursor:'pointer'}}>
                                  📄 Download
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
