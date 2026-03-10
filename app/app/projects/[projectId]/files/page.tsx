'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';

export default function FilesPage(){
  const params=useParams();
  const [showNew,setShowNew]=useState(false);
  const rows=[['Contract_Desert_Electric.pdf','PDF','2.1 MB','Chad D.','2026-01-10','View'],['Permit_Building.pdf','PDF','0.8 MB','Chad D.','2026-01-12','View'],['Insurance_COI_Mesa_Roofing.pdf','PDF','1.3 MB','Admin','2026-02-15','View'],['Drawings_Rev3.zip','ZIP','45.2 MB','Chad D.','2026-02-01','View']];

  return <div>
    <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117'}}>
      <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>📁 Files</h2><div style={{fontSize:12,color:DIM,marginTop:3}}>Project documents and files</div></div>
      <button onClick={()=>setShowNew(p=>!p)} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New</button>
    </div>
    {showNew&&<div style={{margin:24,background:RAISED,border:'1px solid rgba(212,160,23,.3)',borderRadius:10,padding:24}}>
      <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:12}}>Add New Files</div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Save</button>
        <button onClick={()=>setShowNew(false)} style={{padding:'9px 16px',background:RAISED,border:'1px solid '+BORDER,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:'0 24px 24px'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,marginTop:24}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['Name','Type','Size','Uploaded By','Date','Actions'].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:DIM,borderBottom:'1px solid '+BORDER}}>{h}</th>)}
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