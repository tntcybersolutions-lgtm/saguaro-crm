'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';

export default function TimesheetsPage(){
  const params=useParams();
  const [showNew,setShowNew]=useState(false);
  const rows=[['2026-03-01','Mike Torres','Framing','40','4','44','Approved'],['2026-03-01','Jose Morales','Framing','40','8','48','Approved'],['2026-03-01','David Kim','Electrical','40','0','40','Pending']];

  return <div>
    <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117'}}>
      <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>⏱️ Timesheets</h2><div style={{fontSize:12,color:DIM,marginTop:3}}>Crew timesheets and labor hours</div></div>
      <button onClick={()=>setShowNew(p=>!p)} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New</button>
    </div>
    {showNew&&<div style={{margin:24,background:RAISED,border:'1px solid rgba(212,160,23,.3)',borderRadius:10,padding:24}}>
      <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:12}}>Add New Timesheets</div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Save</button>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 16px',background:RAISED,border:'1px solid '+BORDER,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:'0 24px 24px'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,marginTop:24}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['Week','Employee','Trade','Regular Hrs','OT Hrs','Total','Status'].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:DIM,borderBottom:'1px solid '+BORDER}}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((row,i)=>(
          <tr key={i} style={{borderBottom:'1px solid rgba(38,51,71,.4)'}}>
            <td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[0]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[1]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[2]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[3]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[4]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[5]}</td><td style={{padding:'10px 14px',color:i===0?GOLD:i===1?TEXT:DIM}}>{row[6]}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}