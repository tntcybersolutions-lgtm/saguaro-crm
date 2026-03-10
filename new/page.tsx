'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';

const FIELD = ({label,children}:{label:string,children:React.ReactNode}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>{label}</label>
    {children}
  </div>
);

const INPUT_STYLE = {width:'100%',padding:'10px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,outline:'none'};
const SELECT_STYLE = {...INPUT_STYLE,cursor:'pointer'};

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState('residential');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [subDate, setSubDate] = useState('');
  const [owner, setOwner] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [arch, setArch] = useState('');
  const [archEmail, setArchEmail] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    router.push('/app/projects/demo-project-00000000-0000-0000-0000-000000000001');
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>Create New Project</h1>
        <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>Fill in the details — AI will auto-build the full project structure on first bid award</div>
      </div>

      <form onSubmit={create}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Left column */}
          <div>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 18, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>Project Information</div>
              <FIELD label="Project Name">
                <input value={name} onChange={e=>setName(e.target.value)} required placeholder="e.g. Riverdale Medical Pavilion" style={INPUT_STYLE}/>
              </FIELD>
              <FIELD label="Project Address">
                <input value={address} onChange={e=>setAddress(e.target.value)} required placeholder="123 Main St, Phoenix, AZ 85001" style={INPUT_STYLE}/>
              </FIELD>
              <FIELD label="Project Type">
                <select value={type} onChange={e=>setType(e.target.value)} style={SELECT_STYLE}>
                  {['residential','commercial','industrial','addition','remodel','multifamily','healthcare','education','government'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </FIELD>
              <FIELD label="Contract Value / Budget">
                <input value={budget} onChange={e=>setBudget(e.target.value)} placeholder="$1,250,000" style={INPUT_STYLE}/>
              </FIELD>
              <FIELD label="Description">
                <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Brief project description..." style={{...INPUT_STYLE, resize:'vertical' as const}}/>
              </FIELD>
            </div>

            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 18, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>Key Dates</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[['Award Date',''],['Notice to Proceed',''],['Start Date',startDate,setStartDate],['Substantial Completion',subDate,setSubDate],['Final Completion',''],['State (AZ, CA, TX...','AZ']].map((f,i)=>(
                  <FIELD key={f[0] as string} label={f[0] as string}>
                    <input type={f[0] as string === 'State (AZ, CA, TX...' ? 'text' : 'date'} defaultValue={f[1] as string} style={INPUT_STYLE}/>
                  </FIELD>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 18, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>Project Parties</div>
              {[['Owner Name',owner,setOwner,'Desert Health Partners LLC'],['Owner Email',ownerEmail,setOwnerEmail,'owner@example.com'],['Architect / Designer',arch,setArch,'Sonoran Architecture Group'],['Architect Email',archEmail,setArchEmail,'arch@example.com']].map(f=>(
                <FIELD key={f[0] as string} label={f[0] as string}>
                  <input value={f[1] as string} onChange={e=>(f[2] as Function)(e.target.value)} placeholder={f[3] as string} style={INPUT_STYLE}/>
                </FIELD>
              ))}
            </div>

            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 18, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>Contract Settings</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <FIELD label="Contract Type">
                  <select style={SELECT_STYLE}>
                    {['Lump Sum GMP','Cost Plus Fixed Fee','Cost Plus Percentage','Unit Price','Design-Build'].map(t=><option key={t}>{t}</option>)}
                  </select>
                </FIELD>
                <FIELD label="Retainage %">
                  <input type="number" defaultValue="10" min="0" max="20" style={INPUT_STYLE}/>
                </FIELD>
                <FIELD label="Prevailing Wage">
                  <select style={SELECT_STYLE}><option>No</option><option>Yes — Davis-Bacon</option><option>Yes — State Law</option></select>
                </FIELD>
                <FIELD label="Public Project">
                  <select style={SELECT_STYLE}><option>No — Private</option><option>Yes — Public Agency</option></select>
                </FIELD>
              </div>
            </div>

            {/* AI hint */}
            <div style={{ background: 'rgba(212,160,23,.06)', border: '1px solid rgba(212,160,23,.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: DIM }}>
              🤖 <strong style={{ color: TEXT }}>AI Auto-Build on First Award:</strong> When the first bid is awarded, Saguaro will automatically create: 24 schedule tasks, budget by CSI code, sub-packages, safety plan, QC checkpoints, and contact directory.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="submit" disabled={saving} style={{ padding: '13px 32px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: '#0d1117', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
            {saving ? 'Creating…' : '✅ Create Project'}
          </button>
          <button type="button" onClick={() => router.back()} style={{ padding: '13px 20px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
