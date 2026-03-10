'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';

export default function SelectionsPage(){
  const params=useParams();
  const [showNew,setShowNew]=useState(false);
  const rows=[['Flooring','Hardwood — Main','3/4" Oak pre-finished natural','Owner','2026-01-25','Approved'],['Kitchen','Countertops','Quartz — Silestone Lyra','Owner','2026-01-28','Approved'],['Exterior','Paint Color','Sherwin Williams — Accessible Beige','Owner','2026-02-10','Approved'],['Plumbing','Fixtures','Moen Align — brushed nickel','Owner','2026-02-15','Pending']];

  return <div>
    <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117'}}>
      <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>🎨 Selections</h2><div style={{fontSize:12,color:DIM,marginTop:3}}>Owner and design selections</div></div>
      <button onClick={()=>setShowNew(p=>!p)} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New</button>
    </div>
    {showNew&&<div style={{margin:24,background:RAISED,border:'1px solid rgba(212,160,23,.3)',borderRadius:10,padding:24}}>
      <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:12}}>Add New Selections</div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Save</button>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 16px',background:RAISED,border:'1px solid '+BORDER,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:'0 24px 24px'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,marginTop:24}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['Category','Item','Spec / Model','Made By','Date','Status'].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:DIM,borderBottom:'1px solid '+BORDER}}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((row,i)=>(
          <tr key={i} style={{borderBottom:'1px solid rgba(38,51,71,.4)'}}>
            <td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[0]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[1]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[2]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[3]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[4]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[5]}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}