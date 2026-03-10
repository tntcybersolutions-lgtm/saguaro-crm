'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';
import { DEMO_CONTEXT } from '../../../../../demo-data';

export default function IntelligencePage(){
  const params=useParams(); const pid=params['projectId'] as string;
  const [q,setQ]=useState('');
  const [msgs,setMsgs]=useState<{role:string;text:string}[]>([{role:'ai',text:'I have full context on this project — budget, RFIs, change orders, subs, and schedule. Ask me anything.'}]);
  const [loading,setLoading]=useState(false);

  async function ask(){
    if(!q.trim()||loading)return;
    const question=q;setQ('');setLoading(true);
    setMsgs(p=>[...p,{role:'user',text:question}]);
    try{
      const res=await fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:question,projectId:pid,context:'project_intelligence'})});
      const reader=res.body?.getReader(); const dec=new TextDecoder(); let full='';
      while(reader){
        const {done,value}=await reader.read(); if(done)break;
        for(const line of dec.decode(value).split('\n')){
          if(!line.startsWith('data:'))continue;
          try{const ev=JSON.parse(line.slice(5));if(ev.type==='delta'||ev.delta)full+=ev.text||ev.delta;}catch{}
        }
      }
      setMsgs(p=>[...p,{role:'ai',text:full||'Analysis complete.'}]);
    }catch{setMsgs(p=>[...p,{role:'ai',text:'Unable to connect to AI. Please try again.'}]);}
    setLoading(false);
  }

  const ctx = DEMO_CONTEXT;

  return <div style={{display:'flex',height:'calc(100vh - 56px)'}}>
    <div style={{width:280,background:'#0a1117',borderRight:'1px solid '+BORDER,padding:20,overflowY:'auto',flexShrink:0}}>
      <div style={{fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>Project Context</div>
      {[
        {l:'Contract Value',v:'$'+(ctx.financials.total_contract_value?.toLocaleString()||'—')},
        {l:'Billed to Date',v:'$'+(ctx.financials.total_billed_to_date?.toLocaleString()||'—')},
        {l:'% Complete',v:(ctx.financials.pct_complete||0)+'%'},
        {l:'Open RFIs',v:(ctx.rfiSummary.open||0).toString()},
        {l:'Change Orders',v:(ctx.changeOrderSummary.count||0).toString()},
        {l:'Subs on Project',v:(ctx.subs?.length||0).toString()},
      ].map(k=><div key={k.l} style={{marginBottom:12}}>
        <div style={{fontSize:10,color:DIM,textTransform:'uppercase',letterSpacing:.5}}>{k.l}</div>
        <div style={{fontSize:15,fontWeight:700,color:TEXT}}>{k.v}</div>
      </div>)}
      <div style={{marginTop:20,fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Quick Questions</div>
      {['What needs my attention today?','Analyze budget vs actual spending','Which subs have compliance issues?','Summarize open RFIs and urgency','What are the schedule risks?'].map(s=>(
        <button key={s} onClick={()=>setQ(s)} style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',marginBottom:6,background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.15)',borderRadius:6,color:GOLD,fontSize:11,cursor:'pointer'}}>{s}</button>
      ))}
    </div>
    <div style={{flex:1,display:'flex',flexDirection:'column'}}>
      <div style={{flex:1,overflowY:'auto',padding:24,display:'flex',flexDirection:'column',gap:14}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{maxWidth:'80%',alignSelf:m.role==='user'?'flex-end':'flex-start'}}>
            <div style={{padding:'12px 16px',borderRadius:10,background:m.role==='user'?'rgba(212,160,23,.15)':RAISED,border:'1px solid '+(m.role==='user'?'rgba(212,160,23,.3)':BORDER),fontSize:13,color:TEXT,lineHeight:1.6}}>{m.text}</div>
          </div>
        ))}
        {loading&&<div style={{alignSelf:'flex-start',padding:'12px 16px',borderRadius:10,background:RAISED,border:'1px solid '+BORDER,color:GOLD,fontSize:13}}>●●●</div>}
      </div>
      <div style={{padding:'12px 20px',borderTop:'1px solid '+BORDER,display:'flex',gap:10}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ask about this project..." style={{flex:1,background:'rgba(255,255,255,.04)',border:'1px solid '+BORDER,borderRadius:8,padding:'10px 14px',color:TEXT,fontSize:13,outline:'none'}}/>
        <button onClick={ask} disabled={loading||!q.trim()} style={{padding:'10px 20px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer',opacity:loading||!q.trim()?.5:1}}>Ask</button>
      </div>
    </div>
  </div>;
}