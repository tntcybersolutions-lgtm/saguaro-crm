'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders, getTenantId } from '../../../../../lib/supabase-browser';

const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';
const WAIVER_TYPES=['conditional_partial','unconditional_partial','conditional_final','unconditional_final'];
const STATES=['AZ','CA','TX','NV','CO','FL','WA','OR','UT','NM','OTHER'];

interface LienWaiver {
  id: string;
  waiver_type: string;
  state: string;
  claimant_name: string;
  amount: number;
  through_date: string;
  status: string;
  created_at: string;
}

export default function LienWaiversPage() {
  const params = useParams();
  const pid = params['projectId'] as string;

  const [waivers, setWaivers] = useState<LienWaiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    waiverType: 'conditional_partial',
    state: 'AZ',
    claimantName: '',
    claimantAddress: '',
    amount: '',
    throughDate: new Date().toISOString().slice(0, 10),
    exceptions: '',
  });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{documentId:string}|null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const inp: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    background: 'rgba(255,255,255,.04)',
    border: '1px solid ' + BORDER,
    borderRadius: 7,
    color: TEXT,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  useEffect(() => { loadWaivers(); }, [pid]);

  async function loadWaivers() {
    setLoading(true);
    try {
      const tenantId = await getTenantId();
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/documents/list?projectId=${pid}&tenantId=${tenantId}&type=lien_waiver`, { headers });
      const d = await r.json();
      setWaivers(d.documents ?? []);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    if (!form.claimantName || !form.amount || !form.throughDate) {
      setError('Claimant name, amount, and through-date are required.');
      return;
    }
    setGenerating(true); setError('');
    try {
      const tenantId = await getTenantId();
      const headers = await getAuthHeaders();
      const res = await fetch('/api/documents/lien-waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ tenantId, projectId: pid, ...form, amount: Number(form.amount) }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); }
      else { setResult(d); setShowForm(false); await loadWaivers(); }
    } catch {
      setError('Failed to generate lien waiver. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  const fmtType = (t: string) => t.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div>
      <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Lien Waivers</h2>
          <div style={{fontSize:12,color:DIM,marginTop:3}}>State-specific — AZ, CA, TX statutory language included</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
          + Generate Lien Waiver
        </button>
      </div>

      {showForm && (
        <div style={{margin:24,background:RAISED,border:'1px solid rgba(212,160,23,.3)',borderRadius:12,padding:24}}>
          <div style={{fontWeight:700,fontSize:15,color:TEXT,marginBottom:16}}>Generate Lien Waiver</div>
          {error && <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:RED}}>{error}</div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Waiver Type</label>
              <select value={form.waiverType} onChange={e => setForm(p => ({...p,waiverType:e.target.value}))} style={inp}>
                {WAIVER_TYPES.map(t => <option key={t} value={t}>{fmtType(t)}</option>)}
              </select></div>
            <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>State</label>
              <select value={form.state} onChange={e => setForm(p => ({...p,state:e.target.value}))} style={inp}>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select></div>
            <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Claimant Name *</label>
              <input value={form.claimantName} onChange={e => setForm(p => ({...p,claimantName:e.target.value}))} placeholder="ABC Electrical LLC" style={inp} /></div>
            <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Claimant Address</label>
              <input value={form.claimantAddress} onChange={e => setForm(p => ({...p,claimantAddress:e.target.value}))} placeholder="123 Main St, Phoenix AZ 85001" style={inp} /></div>
            <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Amount ($) *</label>
              <input type="number" value={form.amount} onChange={e => setForm(p => ({...p,amount:e.target.value}))} placeholder="45000" style={inp} /></div>
            <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Through Date *</label>
              <input type="date" value={form.throughDate} onChange={e => setForm(p => ({...p,throughDate:e.target.value}))} style={inp} /></div>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Exceptions (optional)</label>
            <textarea value={form.exceptions} onChange={e => setForm(p => ({...p,exceptions:e.target.value}))} rows={2} placeholder="List any exceptions…" style={{...inp,resize:'vertical'} as React.CSSProperties} />
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={generate} disabled={generating} style={{padding:'10px 22px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:generating?'wait':'pointer',opacity:generating?.7:1}}>
              {generating ? 'Generating…' : 'Generate Lien Waiver PDF'}
            </button>
            <button onClick={() => {setShowForm(false); setError('');}} style={{padding:'10px 18px',background:RAISED,border:'1px solid '+BORDER,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div style={{margin:24,background:'rgba(26,138,74,.08)',border:'1px solid rgba(26,138,74,.3)',borderRadius:12,padding:20,display:'flex',alignItems:'center',gap:16}}>
          <div style={{fontSize:32}}>✅</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:GREEN,fontSize:14}}>Lien Waiver Generated</div>
            <div style={{fontSize:12,color:DIM,marginTop:2}}>Document ID: {result.documentId}</div>
          </div>
          <a href={'/api/documents/'+result.documentId+'/download'} target="_blank" rel="noreferrer"
            style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',borderRadius:7,color:'#0d1117',fontSize:12,fontWeight:800,textDecoration:'none'}}>
            Download PDF
          </a>
        </div>
      )}

      <div style={{padding:24}}>
        {loading ? (
          <div style={{padding:40,textAlign:'center',color:DIM}}>Loading lien waivers…</div>
        ) : waivers.length === 0 ? (
          <div style={{background:RAISED,border:'1px solid '+BORDER,borderRadius:10,padding:40,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>📄</div>
            <div style={{fontWeight:700,fontSize:15,color:TEXT,marginBottom:8}}>No lien waivers generated yet</div>
            <div style={{fontSize:13,color:DIM,marginBottom:20,maxWidth:420,margin:'0 auto 20px'}}>
              Generate state-specific conditional and unconditional lien waivers. AZ (ARS §33-1008), CA (Civil Code §8132), and TX (Property Code Ch. 53) statutory forms included.
            </div>
            <button onClick={() => setShowForm(true)} style={{padding:'10px 22px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
              Generate Your First Lien Waiver →
            </button>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:'#0a1117'}}>
                {['Claimant','Type','State','Amount','Through Date','Status','Action'].map(h => (
                  <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:DIM,borderBottom:'1px solid '+BORDER}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {waivers.map(w => (
                  <tr key={w.id} style={{borderBottom:'1px solid rgba(38,51,71,.5)'}}>
                    <td style={{padding:'12px 14px',color:TEXT,fontWeight:600}}>{w.claimant_name}</td>
                    <td style={{padding:'12px 14px',color:DIM}}>{fmtType(w.waiver_type)}</td>
                    <td style={{padding:'12px 14px',color:DIM}}>{w.state}</td>
                    <td style={{padding:'12px 14px',color:TEXT}}>${(w.amount??0).toLocaleString()}</td>
                    <td style={{padding:'12px 14px',color:DIM}}>{w.through_date}</td>
                    <td style={{padding:'12px 14px'}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase',
                        background:w.status==='signed'?'rgba(26,138,74,.12)':w.status==='draft'?'rgba(212,160,23,.12)':'rgba(148,163,184,.12)',
                        color:w.status==='signed'?GREEN:w.status==='draft'?GOLD:'#94a3b8'}}>
                        {w.status}
                      </span>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <a href={'/api/documents/'+w.id+'/download'} target="_blank" rel="noreferrer"
                        style={{background:'none',border:'1px solid '+BORDER,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 8px',cursor:'pointer',textDecoration:'none'}}>
                        📄 Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
