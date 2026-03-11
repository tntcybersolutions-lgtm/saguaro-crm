'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';
const fmt=(n:number)=>'$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

export default function SubBidPortal() {
  const { token } = useParams<{ token: string }>();
  const [pkg, setPkg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: '', contactName: '', email: '', phone: '',
    licenseNumber: '', bondingCapacity: '',
    baseAmount: '', alternates: '', exclusions: '', inclusions: '',
    schedule: '', notes: '', bondAvailable: true, insuranceMeets: true,
  });

  useEffect(() => {
    fetch('/api/bid-packages/portal?token=' + token)
      .then(r => r.json())
      .then(d => { setPkg(d.package); if (d.package?.invite?.status === 'submitted') setSubmitted(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.baseAmount) { alert('Please enter your bid amount.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/bid-packages/portal?token=' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (d.success) setSubmitted(true);
      else alert(d.error || 'Failed to submit. Please try again.');
    } catch { alert('Network error. Please try again.'); }
    setSaving(false);
  }

  const inp = (label: string, key: string, placeholder?: string, type?: string) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</label>
      <input
        type={type || 'text'}
        value={(form as any)[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{ width: '100%', background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  );

  if (loading) return <div style={{ minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',color:DIM,fontFamily:'system-ui,sans-serif' }}>Loading...</div>;

  if (!pkg) return (
    <div style={{ minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif' }}>
      <div style={{ textAlign:'center',color:RED }}>
        <div style={{ fontSize:48,marginBottom:16 }}>⚠</div>
        <div style={{ fontSize:20,fontWeight:700 }}>Invalid or Expired Bid Invitation</div>
        <div style={{ fontSize:14,color:DIM,marginTop:8 }}>This bid invitation link is no longer valid or the bid window has closed.</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif' }}>
      <div style={{ textAlign:'center',color:GREEN }}>
        <div style={{ fontSize:64,marginBottom:16 }}>✓</div>
        <div style={{ fontSize:24,fontWeight:800,color:TEXT }}>Bid Submitted Successfully</div>
        <div style={{ fontSize:14,color:DIM,marginTop:12,maxWidth:440,lineHeight:1.6 }}>
          Your bid for <strong style={{ color:TEXT }}>{pkg.title}</strong> has been received. The general contractor will review all submissions and notify you of the decision.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh',background:DARK,fontFamily:'system-ui,sans-serif',color:TEXT }}>
      <div style={{ background:'rgba(13,17,23,.96)',borderBottom:`1px solid ${BORDER}`,padding:'16px 24px',display:'flex',alignItems:'center',gap:12 }}>
        <span style={{ fontSize:22 }}>🌵</span>
        <span style={{ fontWeight:800,fontSize:16,color:GOLD,letterSpacing:1 }}>SAGUARO CRM</span>
        <span style={{ fontSize:11,color:DIM,marginLeft:8 }}>Subcontractor Bid Portal</span>
      </div>

      <div style={{ maxWidth:760,margin:'0 auto',padding:'32px 24px' }}>
        {/* Package Info */}
        <div style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'20px 24px',marginBottom:24 }}>
          <div style={{ fontWeight:800,fontSize:20,color:GOLD,marginBottom:8 }}>{pkg.title}</div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14 }}>
            {[
              ['Project',pkg.projectName||'—'],
              ['Trade / Division',pkg.trade||pkg.csi_division||'—'],
              ['Bid Due',pkg.due_date||'—'],
              ['Est. Value',pkg.estimated_value?fmt(pkg.estimated_value):'—'],
              ['Bond Required',pkg.bonding_required?'Yes':'No'],
              ['Scope',pkg.scope_summary||'See description below'],
            ].map(([l,v]:any)=>(
              <div key={l}>
                <div style={{ fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:13,color:TEXT,fontWeight:600 }}>{v}</div>
              </div>
            ))}
          </div>
          {pkg.description && (
            <div style={{ marginTop:16,padding:'12px 14px',background:'rgba(0,0,0,.2)',borderRadius:7,fontSize:13,color:DIM,lineHeight:1.7 }}>
              {pkg.description}
            </div>
          )}
          {pkg.items?.length>0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:12,fontWeight:700,color:DIM,marginBottom:8,textTransform:'uppercase',letterSpacing:.5 }}>Scope Items</div>
              {pkg.items.map((item:any,i:number)=>(
                <div key={i} style={{ display:'flex',gap:8,padding:'6px 0',borderBottom:'1px solid rgba(38,51,71,.4)',fontSize:13 }}>
                  <span style={{ color:GOLD,fontWeight:700,minWidth:24 }}>{i+1}.</span>
                  <span style={{ color:TEXT }}>{item.description}</span>
                  {item.quantity&&<span style={{ color:DIM,marginLeft:'auto' }}>{item.quantity} {item.unit}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={submit}>
          {/* Company Info */}
          <div style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:20 }}>
            <div style={{ padding:'12px 20px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:14 }}>Company Information</div>
            <div style={{ padding:20 }}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
                {inp('Company Name','companyName','ABC Electrical LLC')}
                {inp('Contact Name','contactName','Jane Smith')}
                {inp('Email Address','email','jane@abcelectrical.com','email')}
                {inp('Phone Number','phone','(602) 555-1234','tel')}
                {inp('Contractor License #','licenseNumber','ROC-123456')}
                {inp('Bonding Capacity','bondingCapacity','$5,000,000')}
              </div>
            </div>
          </div>

          {/* Bid Amount */}
          <div style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:20 }}>
            <div style={{ padding:'12px 20px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:14 }}>Bid Pricing</div>
            <div style={{ padding:20 }}>
              {inp('Base Bid Amount ($)','baseAmount','e.g. 485000','number')}
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block',fontSize:12,fontWeight:700,color:DIM,marginBottom:5,textTransform:'uppercase',letterSpacing:.5 }}>Inclusions</label>
                <textarea value={form.inclusions} onChange={e=>setForm(f=>({...f,inclusions:e.target.value}))} placeholder="List what is included in your base bid..." rows={3}
                  style={{ width:'100%',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,padding:'10px 14px',color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical' }} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block',fontSize:12,fontWeight:700,color:DIM,marginBottom:5,textTransform:'uppercase',letterSpacing:.5 }}>Exclusions</label>
                <textarea value={form.exclusions} onChange={e=>setForm(f=>({...f,exclusions:e.target.value}))} placeholder="List what is NOT included in your base bid..." rows={3}
                  style={{ width:'100%',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,padding:'10px 14px',color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical' }} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block',fontSize:12,fontWeight:700,color:DIM,marginBottom:5,textTransform:'uppercase',letterSpacing:.5 }}>Alternates / Value Engineering (optional)</label>
                <textarea value={form.alternates} onChange={e=>setForm(f=>({...f,alternates:e.target.value}))} placeholder="List any alternate pricing options..." rows={2}
                  style={{ width:'100%',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,padding:'10px 14px',color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical' }} />
              </div>
              {inp('Proposed Schedule (start / duration)','schedule','e.g. 4 weeks starting April 1')}
            </div>
          </div>

          {/* Qualifications */}
          <div style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:20 }}>
            <div style={{ padding:'12px 20px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:14 }}>Qualifications</div>
            <div style={{ padding:20 }}>
              <div style={{ display:'flex',gap:32,marginBottom:16 }}>
                <label style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:14,color:TEXT }}>
                  <input type="checkbox" checked={form.bondAvailable} onChange={e=>setForm(f=>({...f,bondAvailable:e.target.checked}))} style={{ width:16,height:16 }} />
                  Payment &amp; Performance Bond Available
                </label>
                <label style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:14,color:TEXT }}>
                  <input type="checkbox" checked={form.insuranceMeets} onChange={e=>setForm(f=>({...f,insuranceMeets:e.target.checked}))} style={{ width:16,height:16 }} />
                  Insurance Requirements Met
                </label>
              </div>
              <div>
                <label style={{ display:'block',fontSize:12,fontWeight:700,color:DIM,marginBottom:5,textTransform:'uppercase',letterSpacing:.5 }}>Additional Notes / Questions</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Any clarifications, questions, or additional information..." rows={3}
                  style={{ width:'100%',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,padding:'10px 14px',color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical' }} />
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving}
            style={{ width:'100%',padding:'14px',background:saving?'#4a5f7a':`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:9,color:'#0d1117',fontWeight:800,fontSize:16,cursor:saving?'not-allowed':'pointer',letterSpacing:.5 }}>
            {saving ? 'Submitting Bid...' : 'Submit Bid →'}
          </button>
          <div style={{ textAlign:'center',marginTop:16,fontSize:11,color:DIM }}>
            🔒 Your bid is encrypted and only visible to the requesting general contractor · Powered by Saguaro CRM
          </div>
        </form>
      </div>
    </div>
  );
}
