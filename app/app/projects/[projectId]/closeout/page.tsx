'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';

const ITEMS=[
  {id:'punch_list',label:'Punch List Complete',checked:false},
  {id:'substantial_completion',label:'Certificate of Substantial Completion (AIA G704)',checked:false},
  {id:'final_payment',label:'Final Payment Application (AIA G702)',checked:false},
  {id:'lien_waivers',label:'Final Unconditional Lien Waivers — All Subs',checked:false},
  {id:'as_builts',label:'As-Built Drawings Submitted',checked:false},
  {id:'warranties',label:'Warranty Documents Collected',checked:false},
  {id:'o_and_m',label:'O&M Manuals Delivered',checked:false},
  {id:'final_inspection',label:'Final Inspection & Certificate of Occupancy',checked:false},
  {id:'release_retainage',label:'Retainage Release',checked:false},
  {id:'closeout_package',label:'Closeout Package Delivered to Owner',checked:false},
];

export default function CloseoutPage(){
  const params=useParams(); const pid=params['projectId'] as string;
  const [items,setItems]=useState(ITEMS);
  const [generating,setGenerating]=useState(false);
  const [docId,setDocId]=useState('');
  const done=items.filter(i=>i.checked).length;
  const pct=Math.round((done/items.length)*100);

  function toggle(id:string){setItems(p=>p.map(i=>i.id===id?{...i,checked:!i.checked}:i));}

  async function generatePackage(){
    setGenerating(true);
    try{
      const res=await fetch('/api/documents/closeout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId:pid,projectId:pid})});
      const d=await res.json();
      if(d.documentId){setDocId(d.documentId);}else{alert(d.error||'Generated (ID not available in demo mode).');}
    }catch{alert('Generate request sent.');}
    setGenerating(false);
  }

  return <div>
    <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117'}}>
      <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Project Closeout</h2><div style={{fontSize:12,color:DIM,marginTop:3}}>{done}/{items.length} items complete — {pct}%</div></div>
      <button onClick={generatePackage} disabled={generating||pct<80} style={{padding:'8px 16px',background:pct>=80?'linear-gradient(135deg,'+GOLD+',#F0C040)':'rgba(255,255,255,.06)',border:'none',borderRadius:7,color:pct>=80?'#0d1117':DIM,fontSize:13,fontWeight:800,cursor:pct>=80?'pointer':'not-allowed',opacity:generating?.7:1}}>{generating?'Generating...':'Generate Closeout Package'}</button>
    </div>

    {docId&&<div style={{margin:24,background:'rgba(26,138,74,.08)',border:'1px solid rgba(26,138,74,.3)',borderRadius:10,padding:'16px 20px',display:'flex',alignItems:'center',gap:16}}>
      <div style={{fontSize:28}}>✅</div>
      <div style={{flex:1}}><div style={{fontWeight:700,color:GREEN}}>Closeout Package Generated</div><div style={{fontSize:12,color:DIM}}>Document ID: {docId}</div></div>
      <a href={'/api/documents/'+docId+'/download'} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',borderRadius:7,color:'#0d1117',fontSize:12,fontWeight:800,textDecoration:'none'}}>Download</a>
    </div>}

    <div style={{padding:24}}>
      <div style={{height:8,background:'rgba(255,255,255,.06)',borderRadius:4,marginBottom:24}}>
        <div style={{height:'100%',width:pct+'%',background:'linear-gradient(90deg,'+GOLD+',#F0C040)',borderRadius:4,transition:'width .3s'}}/>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {items.map((item,i)=>(
          <div key={item.id} onClick={()=>toggle(item.id)} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',background:item.checked?'rgba(26,138,74,.06)':RAISED,border:'1px solid '+(item.checked?'rgba(26,138,74,.3)':BORDER),borderRadius:10,cursor:'pointer',transition:'all .15s'}}>
            <div style={{width:22,height:22,borderRadius:5,border:'2px solid '+(item.checked?GREEN:BORDER),background:item.checked?GREEN:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {item.checked&&<span style={{color:'#0d1117',fontSize:12,fontWeight:800}}>✓</span>}
            </div>
            <div style={{flex:1,fontSize:14,color:item.checked?GREEN:TEXT,textDecoration:item.checked?'line-through':'none'}}>{item.label}</div>
            <div style={{fontSize:11,color:DIM}}>Step {i+1}</div>
          </div>
        ))}
      </div>
    </div>
  </div>;
}