'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import SaguaroDatePicker from '../../../../components/SaguaroDatePicker';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
const INPUT_STYLE = {width:'100%',padding:'10px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,outline:'none'};
const SELECT_STYLE = {...INPUT_STYLE,cursor:'pointer'};
const FIELD = ({label,children}:{label:string,children:React.ReactNode}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>{label}</label>
    {children}
  </div>
);

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState('residential');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [subDate, setSubDate] = useState('');
  const [awardDate, setAwardDate] = useState('');
  const [ntpDate, setNtpDate] = useState('');
  const [finalDate, setFinalDate] = useState('');
  const [stateJurisdiction, setStateJurisdiction] = useState('AZ');
  const [owner, setOwner] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [arch, setArch] = useState('');
  const [archEmail, setArchEmail] = useState('');
  const [description, setDescription] = useState('');
  const [contractType, setContractType] = useState('Lump Sum GMP');
  const [retainage, setRetainage] = useState('10');
  const [prevailingWage, setPrevailingWage] = useState('No');
  const [publicProject, setPublicProject] = useState('No — Private');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;
    setSaving(true);
    setError('');
    try {
      const contractAmount = Number(budget.replace(/[^0-9.]/g,''))||0;
      const r = await fetch('/api/projects/create', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          name:name.trim(), address:address.trim(), projectType:type, contractAmount,
          startDate:startDate||null, substantialCompletionDate:subDate||null,
          awardDate:awardDate||null, noticeToProceedDate:ntpDate||null, finalCompletionDate:finalDate||null,
          stateJurisdiction, ownerName:owner, ownerEmail, architectName:arch, architectEmail:archEmail,
          description, contractType, retainagePct:Number(retainage)||10,
          prevailingWage:prevailingWage!=='No', publicProject:!publicProject.includes('Private'),
        })
      });
      const d = await r.json();
      if (d.projectId) {
        // Fire autopilot scan async (non-blocking)
        fetch('/api/autopilot/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: d.projectId }),
        }).catch(() => {});
        router.push(`/app/projects/${d.projectId}/overview`);
      } else {
        setError(d.error || 'Failed to create project');
        setSaving(false);
      }
    } catch (err) {
      setError('Network error — please try again');
      setSaving(false);
    }
  }

  return (
    <div style={{padding:'24px 28px',maxWidth:900,margin:'0 auto'}}>
      <div style={{marginBottom:28}}>
        <h1 style={{fontSize:24,fontWeight:800,color:TEXT,margin:0}}>Create New Project</h1>
        <div style={{fontSize:13,color:DIM,marginTop:4}}>Fill in the details — AI will auto-build the full project structure on first bid award</div>
      </div>
      {error&&<div style={{background:'rgba(192,48,48,.1)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,padding:'12px 16px',marginBottom:20,fontSize:13,color:'#ff7070'}}>{error}</div>}
      <form onSubmit={create}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
          <div>
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:24,marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:14,color:TEXT,marginBottom:18,paddingBottom:10,borderBottom:`1px solid ${BORDER}`}}>Project Information</div>
              <FIELD label="Project Name"><input value={name} onChange={e=>setName(e.target.value)} required placeholder="e.g. Riverdale Medical Pavilion" style={INPUT_STYLE}/></FIELD>
              <FIELD label="Project Address"><input value={address} onChange={e=>setAddress(e.target.value)} required placeholder="123 Main St, Phoenix, AZ 85001" style={INPUT_STYLE}/></FIELD>
              <FIELD label="Project Type">
                <select value={type} onChange={e=>setType(e.target.value)} style={SELECT_STYLE}>
                  {['residential','commercial','industrial','addition','remodel','multifamily','healthcare','education','government'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </FIELD>
              <FIELD label="Contract Value / Budget"><input value={budget} onChange={e=>setBudget(e.target.value)} placeholder="$1,250,000" style={INPUT_STYLE}/></FIELD>
              <FIELD label="Description"><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Brief project description..." style={{...INPUT_STYLE,resize:'vertical' as const}}/></FIELD>
            </div>
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:24}}>
              <div style={{fontWeight:700,fontSize:14,color:TEXT,marginBottom:18,paddingBottom:10,borderBottom:`1px solid ${BORDER}`}}>Key Dates</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <FIELD label="Award Date"><SaguaroDatePicker value={awardDate} onChange={setAwardDate} style={INPUT_STYLE}/></FIELD>
                <FIELD label="Notice to Proceed"><SaguaroDatePicker value={ntpDate} onChange={setNtpDate} style={INPUT_STYLE}/></FIELD>
                <FIELD label="Start Date"><SaguaroDatePicker value={startDate} onChange={setStartDate} style={INPUT_STYLE}/></FIELD>
                <FIELD label="Substantial Completion"><SaguaroDatePicker value={subDate} onChange={setSubDate} style={INPUT_STYLE}/></FIELD>
                <FIELD label="Final Completion"><SaguaroDatePicker value={finalDate} onChange={setFinalDate} style={INPUT_STYLE}/></FIELD>
                <FIELD label="State Jurisdiction"><input value={stateJurisdiction} onChange={e=>setStateJurisdiction(e.target.value)} placeholder="AZ" style={INPUT_STYLE}/></FIELD>
              </div>
            </div>
          </div>
          <div>
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:24,marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:14,color:TEXT,marginBottom:18,paddingBottom:10,borderBottom:`1px solid ${BORDER}`}}>Project Parties</div>
              <FIELD label="Owner Name"><input value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Desert Health Partners LLC" style={INPUT_STYLE}/></FIELD>
              <FIELD label="Owner Email"><input value={ownerEmail} onChange={e=>setOwnerEmail(e.target.value)} placeholder="owner@example.com" style={INPUT_STYLE}/></FIELD>
              <FIELD label="Architect / Designer"><input value={arch} onChange={e=>setArch(e.target.value)} placeholder="Sonoran Architecture Group" style={INPUT_STYLE}/></FIELD>
              <FIELD label="Architect Email"><input value={archEmail} onChange={e=>setArchEmail(e.target.value)} placeholder="arch@example.com" style={INPUT_STYLE}/></FIELD>
            </div>
            <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:24,marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:14,color:TEXT,marginBottom:18,paddingBottom:10,borderBottom:`1px solid ${BORDER}`}}>Contract Settings</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <FIELD label="Contract Type">
                  <select value={contractType} onChange={e=>setContractType(e.target.value)} style={SELECT_STYLE}>
                    {['Lump Sum GMP','Cost Plus Fixed Fee','Cost Plus Percentage','Unit Price','Design-Build'].map(t=><option key={t}>{t}</option>)}
                  </select>
                </FIELD>
                <FIELD label="Retainage %"><input type="number" value={retainage} onChange={e=>setRetainage(e.target.value)} min="0" max="20" style={INPUT_STYLE}/></FIELD>
                <FIELD label="Prevailing Wage">
                  <select value={prevailingWage} onChange={e=>setPrevailingWage(e.target.value)} style={SELECT_STYLE}>
                    <option>No</option><option>Yes — Davis-Bacon</option><option>Yes — State Law</option>
                  </select>
                </FIELD>
                <FIELD label="Public Project">
                  <select value={publicProject} onChange={e=>setPublicProject(e.target.value)} style={SELECT_STYLE}>
                    <option>No — Private</option><option>Yes — Public Agency</option>
                  </select>
                </FIELD>
              </div>
            </div>
            <div style={{background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:10,padding:'14px 18px',marginBottom:20,fontSize:13,color:DIM}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={15} height={15} style={{verticalAlign:'middle',marginRight:6,color:GOLD}}><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2zM9 14v3m3-3v3m3-3v3M3 21h18"/></svg>
              <strong style={{color:TEXT}}>AI Auto-Build on First Award:</strong> When the first bid is awarded, Saguaro will automatically create: 24 schedule tasks, budget by CSI code, sub-packages, safety plan, QC checkpoints, and contact directory.
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:12,marginTop:8}}>
          <button type="submit" disabled={saving||!name.trim()||!address.trim()} style={{padding:'13px 32px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:15,fontWeight:800,cursor:'pointer',opacity:saving||!name.trim()||!address.trim()?0.6:1}}>
            {saving?'Creating…':'Create Project'}
          </button>
          <button type="button" onClick={()=>router.back()} style={{padding:'13px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:14,cursor:'pointer'}}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
