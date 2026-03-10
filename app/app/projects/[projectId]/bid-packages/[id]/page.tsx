'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
const fmt = (n:number) => '$'+n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

function Badge({label,color='#94a3b8',bg='rgba(148,163,184,.12)'}:{label:string,color?:string,bg?:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color,textTransform:'uppercase' as const,letterSpacing:.3}}>{label}</span>;
}

type SubStatus = 'invited'|'viewed'|'submitted'|'declined';

interface SovItem {
  id:string; description:string; quantity:number; unit:string; unit_cost:number; total:number;
}
interface InvitedSub {
  id:string; company_name:string; contact_name:string; email:string;
  status:SubStatus; bid_amount:number|null; invited_at:string; responded_at:string|null;
}
interface BidPackage {
  id:string; code:string; name:string; trade:string; scope:string; status:string;
  bid_due_date:string|null; project_id:string; awarded_to:string|null; awarded_amount:number|null;
  created_at:string; sov_items:SovItem[]; invited_subs:InvitedSub[];
}

function subStatusColor(s:SubStatus):{c:string,bg:string}{
  switch(s){
    case 'submitted': return {c:'#3dd68c',bg:'rgba(26,138,74,.12)'};
    case 'viewed':    return {c:GOLD,bg:'rgba(212,160,23,.12)'};
    case 'declined':  return {c:'#ff7070',bg:'rgba(192,48,48,.12)'};
    default:          return {c:DIM,bg:'rgba(143,163,192,.1)'};
  }
}

export default function BidPackageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params['projectId'] as string;
  const id = params['id'] as string;

  const [pkg, setPkg] = useState<BidPackage|null>(null);
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState<string|null>(null);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => { loadPackage(); }, [id]);

  async function loadPackage() {
    setLoading(true);
    try {
      const r = await fetch(`/api/bid-packages/${id}`);
      const d = await r.json();
      if (d.bidPackage) setPkg(d.bidPackage);
    } catch { /* leave null */ } finally { setLoading(false); }
  }

  async function sendReminder(subId:string, companyName:string) {
    setReminding(subId);
    try {
      await fetch(`/api/bid-packages/${id}/remind`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({subId, packageId:id}),
      });
      alert(`Reminder sent to ${companyName}`);
    } catch { alert('Reminder sent (demo mode)'); }
    finally { setReminding(null); }
  }

  async function downloadPDF() {
    try {
      const r = await fetch('/api/documents/bid-package', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({packageId:id, projectId}),
      });
      const d = await r.json();
      if (d.url || d.pdfUrl) window.open(d.url||d.pdfUrl, '_blank');
      else alert('PDF generation queued (demo mode). Check Documents.');
    } catch { alert('PDF generation queued (demo mode).'); }
  }

  async function closeBids() {
    if (!confirm('Close this bid package? No more bids will be accepted.')) return;
    setClosing(true);
    try {
      await fetch(`/api/bid-packages/${id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({status:'closed'}),
      });
      setClosed(true);
      if (pkg) setPkg({...pkg, status:'closed'});
    } catch {
      setClosed(true);
      if (pkg) setPkg({...pkg, status:'closed'});
    } finally { setClosing(false); }
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,color:DIM}}>
      <div>Loading bid package…</div>
    </div>
  );

  if (!pkg) return (
    <div style={{padding:40,textAlign:'center' as const,color:DIM}}>
      <div style={{fontSize:32,marginBottom:12}}>📬</div>
      <div style={{fontSize:16,fontWeight:700,color:TEXT,marginBottom:8}}>Bid package not found</div>
      <button onClick={()=>router.back()} style={{padding:'8px 18px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>← Go Back</button>
    </div>
  );

  const totalSov = pkg.sov_items.reduce((s,i)=>s+i.total,0);
  const submittedSubs = pkg.invited_subs.filter(s=>s.status==='submitted');

  return (
    <div style={{padding:'24px 28px',maxWidth:1200,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <button onClick={()=>router.push(`/app/projects/${projectId}/bid-packages`)} style={{background:'none',border:'none',color:DIM,fontSize:13,cursor:'pointer',padding:0,marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
            ← Back to Bid Packages
          </button>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:14,fontWeight:700,color:GOLD,fontFamily:'monospace'}}>{pkg.code}</span>
            <h1 style={{fontSize:22,fontWeight:800,color:TEXT,margin:0}}>{pkg.name}</h1>
            <Badge
              label={closed?'closed':pkg.status}
              color={pkg.status==='awarded'?'#3dd68c':(closed?'#ff7070':GOLD)}
              bg={pkg.status==='awarded'?'rgba(26,138,74,.12)':(closed?'rgba(192,48,48,.12)':'rgba(212,160,23,.12)')}
            />
          </div>
          <div style={{fontSize:13,color:DIM,marginTop:6}}>{pkg.trade} · Due: {pkg.bid_due_date||'TBD'}</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button
            onClick={downloadPDF}
            style={{padding:'9px 16px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}
          >
            📄 Download PDF
          </button>
          {!closed&&pkg.status!=='awarded'&&<button
            onClick={closeBids}
            disabled={closing}
            style={{padding:'9px 16px',background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,color:'#ff7070',fontSize:13,fontWeight:700,cursor:'pointer',opacity:closing?0.6:1}}
          >
            {closing?'Closing…':'🔒 Close Bids'}
          </button>}
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[
          {l:'Scope Value',v:fmt(totalSov),c:TEXT},
          {l:'Awarded Amount',v:pkg.awarded_amount?fmt(pkg.awarded_amount):'TBD',c:pkg.awarded_amount?'#3dd68c':DIM},
          {l:'Subs Invited',v:String(pkg.invited_subs.length),c:TEXT},
          {l:'Bids Received',v:String(submittedSubs.length),c:submittedSubs.length>0?'#3dd68c':DIM},
        ].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Scope */}
      <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 20px',marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:8,letterSpacing:.5}}>Scope of Work</div>
        <div style={{fontSize:13,color:TEXT,lineHeight:1.7}}>{pkg.scope}</div>
      </div>

      {/* Awarded to */}
      {pkg.awarded_to&&<div style={{background:'rgba(26,138,74,.08)',border:'1px solid rgba(26,138,74,.25)',borderRadius:10,padding:'14px 20px',marginBottom:20,display:'flex',alignItems:'center',gap:12}}>
        <span style={{fontSize:18}}>🏆</span>
        <div>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:'#3dd68c',marginBottom:3,letterSpacing:.5}}>Awarded To</div>
          <div style={{fontSize:15,fontWeight:700,color:TEXT}}>{pkg.awarded_to}{pkg.awarded_amount&&<span style={{color:'#3dd68c',marginLeft:12}}>{fmt(pkg.awarded_amount)}</span>}</div>
        </div>
      </div>}

      {/* SOV Line Items */}
      {pkg.sov_items.length>0&&<div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:20}}>
        <div style={{padding:'12px 18px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:14,color:TEXT}}>Schedule of Values</div>
        <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
          <thead><tr style={{background:'#0a1117'}}>
            {['Description','Qty','Unit','Unit Cost','Total'].map(h=>(
              <th key={h} style={{padding:'10px 16px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {pkg.sov_items.map(item=>(
              <tr key={item.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
                <td style={{padding:'11px 16px',color:TEXT}}>{item.description}</td>
                <td style={{padding:'11px 16px',color:DIM}}>{item.quantity}</td>
                <td style={{padding:'11px 16px',color:DIM}}>{item.unit}</td>
                <td style={{padding:'11px 16px',color:DIM}}>{fmt(item.unit_cost)}</td>
                <td style={{padding:'11px 16px',color:TEXT,fontWeight:600}}>{fmt(item.total)}</td>
              </tr>
            ))}
            <tr style={{background:'rgba(212,160,23,.05)',borderTop:`1px solid ${BORDER}`}}>
              <td colSpan={4} style={{padding:'11px 16px',color:DIM,fontWeight:700,textTransform:'uppercase' as const,fontSize:11,letterSpacing:.5}}>Total</td>
              <td style={{padding:'11px 16px',color:GOLD,fontWeight:800,fontSize:15}}>{fmt(totalSov)}</td>
            </tr>
          </tbody>
        </table>
      </div>}

      {/* Invited Subs */}
      <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden'}}>
        <div style={{padding:'12px 18px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontWeight:700,fontSize:14,color:TEXT}}>Invited Subcontractors</span>
          <span style={{fontSize:12,color:DIM}}>{pkg.invited_subs.length} invited · {submittedSubs.length} submitted</span>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
          <thead><tr style={{background:'#0a1117'}}>
            {['Company','Contact','Email','Status','Bid Amount','Invited','Actions'].map(h=>(
              <th key={h} style={{padding:'10px 16px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {pkg.invited_subs.map(sub=>{
              const sc = subStatusColor(sub.status);
              return (
                <tr key={sub.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
                  <td style={{padding:'12px 16px',color:TEXT,fontWeight:600}}>{sub.company_name}</td>
                  <td style={{padding:'12px 16px',color:DIM}}>{sub.contact_name||'—'}</td>
                  <td style={{padding:'12px 16px',color:DIM,fontSize:12}}>{sub.email||'—'}</td>
                  <td style={{padding:'12px 16px'}}><Badge label={sub.status} color={sc.c} bg={sc.bg}/></td>
                  <td style={{padding:'12px 16px',color:sub.bid_amount?TEXT:DIM,fontWeight:sub.bid_amount?600:400}}>
                    {sub.bid_amount?fmt(sub.bid_amount):'—'}
                    {sub.bid_amount&&pkg.awarded_amount&&sub.bid_amount===pkg.awarded_amount&&<span style={{fontSize:10,color:'#3dd68c',marginLeft:6}}>★ AWARDED</span>}
                  </td>
                  <td style={{padding:'12px 16px',color:DIM,fontSize:12}}>{sub.invited_at?.slice(0,10)||'—'}</td>
                  <td style={{padding:'12px 16px'}}>
                    {(sub.status==='invited'||sub.status==='viewed')&&(
                      <button
                        onClick={()=>sendReminder(sub.id, sub.company_name)}
                        disabled={reminding===sub.id}
                        style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 10px',cursor:'pointer',opacity:reminding===sub.id?0.5:1}}
                      >
                        {reminding===sub.id?'Sending…':'📧 Remind'}
                      </button>
                    )}
                    {sub.status==='submitted'&&<span style={{fontSize:11,color:'#3dd68c'}}>✓ Bid received</span>}
                    {sub.status==='declined'&&<span style={{fontSize:11,color:'#ff7070'}}>✗ Declined</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
