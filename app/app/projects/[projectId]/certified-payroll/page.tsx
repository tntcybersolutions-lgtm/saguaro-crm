'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import DocumentVersionHistory from '@/components/DocumentVersionHistory';

const BG='#0d1117',CARD='#161b22',BORDER='#30363d',GOLD='#d4a017',TEXT='#F0F4FF',DIM='#8b949e',GREEN='#2ea043',RED='#f85149',BLUE='#388bfd',AMBER='#f0b429';

const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
const fmtDate = (d:string|null) => { if(!d) return '—'; try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch { return d; } };

const INP:React.CSSProperties = {padding:'10px 12px',background:BG,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:16,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};
const BTN_PRIMARY:React.CSSProperties = {padding:'10px 20px',background:`linear-gradient(135deg,${GOLD},#e8b930)`,border:'none',borderRadius:8,color:'#000',fontWeight:800,fontSize:13,cursor:'pointer',minHeight:44};
const BTN_GHOST:React.CSSProperties = {padding:'10px 16px',background:'none',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer',minHeight:44};

interface PayrollRow {
  id: string;
  payroll_number: number;
  week_ending: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  entries: unknown;
  status: string;
  submitted_at: string | null;
  submitted_to: string | null;
  html_content: string | null;
  ai_generated: boolean | null;
  created_at: string;
}

interface ProjectMeta {
  id: string;
  name: string | null;
  prevailing_wage: boolean | null;
  davis_bacon_wage_decision: string | null;
  awarding_agency: string | null;
}

function lastFriday(): string {
  const d = new Date();
  const dow = d.getDay();
  const diff = (dow + 2) % 7;
  d.setDate(d.getDate() - (diff === 0 ? 7 : diff));
  return d.toISOString().split('T')[0];
}

function statusBadge(s: string) {
  const cfg: Record<string,{bg:string;c:string}> = {
    draft: {bg:'rgba(139,148,158,.15)',c:DIM},
    submitted: {bg:'rgba(56,139,253,.15)',c:BLUE},
    signed: {bg:'rgba(46,160,67,.18)',c:GREEN},
    approved: {bg:'rgba(46,160,67,.18)',c:GREEN},
  };
  const st = cfg[s] || cfg.draft;
  return <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:5,background:st.bg,color:st.c,textTransform:'uppercase',letterSpacing:.3}}>{s}</span>;
}

export default function CertifiedPayrollPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [payrolls, setPayrolls] = useState<PayrollRow[]>([]);
  const [weekEnding, setWeekEnding] = useState<string>(lastFriday());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{msg:string;tone:'ok'|'err'}|null>(null);

  const showToast = (msg: string, tone: 'ok'|'err' = 'ok') => {
    setToast({msg, tone});
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cpRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/certified-payroll?projectId=${projectId}`),
      ]);
      if (pRes.ok) {
        const pj = await pRes.json();
        const p = pj.project || pj;
        setProject({
          id: p.id,
          name: p.name,
          prevailing_wage: p.prevailing_wage ?? false,
          davis_bacon_wage_decision: p.davis_bacon_wage_decision ?? null,
          awarding_agency: p.awarding_agency ?? null,
        });
      }
      if (cpRes.ok) {
        const cj = await cpRes.json();
        setPayrolls(cj.data || cj.payrolls || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // WH-347 preview state
  const [wh347PreviewOpen, setWh347PreviewOpen] = useState(false);
  const [wh347PreviewHtml, setWh347PreviewHtml] = useState('');
  const [wh347PreviewMeta, setWh347PreviewMeta] = useState<{
    payrollId: string; payrollNumber: number; weekEnding: string; workerCount: number; totalGross: number;
  } | null>(null);

  async function generate() {
    if (!weekEnding) { showToast('Pick a week ending date', 'err'); return; }
    setGenerating(true);
    try {
      const r = await fetch('/api/certified-payroll/generate-wh347', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ projectId, weekEnding }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.error || 'Generation failed', 'err'); return; }
      if (data.html_content && data.payrollId) {
        setWh347PreviewHtml(data.html_content);
        setWh347PreviewMeta({
          payrollId: data.payrollId,
          payrollNumber: data.payrollNumber,
          weekEnding: data.weekEnding || weekEnding,
          workerCount: data.workerCount,
          totalGross: data.totalGross,
        });
        setWh347PreviewOpen(true);
      }
      showToast(`WH-347 generated — ${data.workerCount} workers, gross ${fmt(data.totalGross)}`);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      showToast(msg, 'err');
    } finally {
      setGenerating(false);
    }
  }

  async function submit(id: string) {
    const submittedTo = window.prompt('Submitted to which awarding agency?');
    if (!submittedTo) return;
    try {
      const r = await fetch(`/api/certified-payroll/${id}`, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status: 'submitted', submitted_at: new Date().toISOString(), submitted_to: submittedTo }),
      });
      if (!r.ok) { showToast('Submit failed', 'err'); return; }
      showToast('Marked submitted');
      await load();
    } catch (e) {
      showToast('Submit failed', 'err');
    }
  }

  const prevailing = project?.prevailing_wage === true;

  return (
    <div style={{padding:'24px',background:BG,color:TEXT,minHeight:'100vh'}}>
      <div style={{maxWidth:1200,margin:'0 auto'}}>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontSize:24,fontWeight:900,color:TEXT,margin:0}}>Certified Payroll (WH-347)</h1>
            <div style={{fontSize:13,color:DIM,marginTop:4}}>{project?.name || '—'} · Federal prevailing wage compliance</div>
          </div>
          {prevailing
            ? <span style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:5,background:'rgba(46,160,67,.18)',color:GREEN,textTransform:'uppercase',letterSpacing:.3}}>Prevailing Wage Project</span>
            : <span style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:5,background:'rgba(240,180,41,.15)',color:AMBER,textTransform:'uppercase',letterSpacing:.3}}>Not Prevailing Wage</span>}
        </div>

        {!prevailing && (
          <div style={{marginBottom:20,padding:'14px 18px',background:'rgba(240,180,41,.08)',border:`1px solid rgba(240,180,41,.35)`,borderRadius:8,fontSize:13,lineHeight:1.6,color:TEXT}}>
            <strong style={{color:AMBER}}>Project not marked as prevailing wage.</strong> Set <code>prevailing_wage = true</code> in Project Settings to enable formal WH-347 compliance. You can still generate payroll — Wage Decision and Awarding Agency fields will read blank.
          </div>
        )}

        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:20,marginBottom:24}}>
          <div style={{fontSize:13,fontWeight:900,textTransform:'uppercase',letterSpacing:.5,color:GOLD,marginBottom:14}}>Generate Payroll</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:14,alignItems:'end'}}>
            <div>
              <label style={LBL}>Week Ending (Sunday)</label>
              <input type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} style={INP} />
            </div>
            <div>
              <label style={LBL}>Wage Decision</label>
              <input type="text" value={project?.davis_bacon_wage_decision || '—'} readOnly style={{...INP,opacity:.7}} />
            </div>
            <button disabled={generating} onClick={generate} style={{...BTN_PRIMARY,opacity:generating?.6:1,cursor:generating?'wait':'pointer'}}>
              {generating ? 'Generating…' : 'Generate WH-347'}
            </button>
          </div>
          <div style={{marginTop:10,fontSize:11,color:DIM}}>
            Pulls time entries for the week Mon→Sun, joins employees for wage rates, calculates wages & deductions (FICA 7.65% + Fed 15% estimate), generates federal WH-347 HTML with Statement of Compliance.
          </div>
        </div>

        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:`1px solid ${BORDER}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:13,fontWeight:900,textTransform:'uppercase',letterSpacing:.5,color:GOLD}}>Past Payrolls</div>
            <div style={{fontSize:12,color:DIM}}>{payrolls.length} total</div>
          </div>
          {loading ? <div style={{padding:40,textAlign:'center',color:DIM}}>Loading…</div> : (
            payrolls.length === 0 ? <div style={{padding:40,textAlign:'center',color:DIM}}>No payrolls yet. Generate one above.</div> : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{background:'rgba(255,255,255,.03)'}}>
                      <th style={{padding:'10px 14px',textAlign:'left',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Payroll #</th>
                      <th style={{padding:'10px 14px',textAlign:'left',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Week Ending</th>
                      <th style={{padding:'10px 14px',textAlign:'right',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Workers</th>
                      <th style={{padding:'10px 14px',textAlign:'right',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Gross</th>
                      <th style={{padding:'10px 14px',textAlign:'right',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Net</th>
                      <th style={{padding:'10px 14px',textAlign:'center',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Status</th>
                      <th style={{padding:'10px 14px',textAlign:'right',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrolls.map(p => {
                      const entries = Array.isArray(p.entries) ? p.entries.length : 0;
                      return (
                        <tr key={p.id} style={{borderTop:`1px solid ${BORDER}`}}>
                          <td style={{padding:'12px 14px',fontSize:13,fontWeight:700,color:TEXT}}>#{p.payroll_number}</td>
                          <td style={{padding:'12px 14px',fontSize:13,color:TEXT}}>{fmtDate(p.week_ending)}</td>
                          <td style={{padding:'12px 14px',fontSize:13,color:TEXT,textAlign:'right'}}>{entries}</td>
                          <td style={{padding:'12px 14px',fontSize:13,color:GOLD,fontWeight:700,textAlign:'right'}}>{fmt(p.total_gross)}</td>
                          <td style={{padding:'12px 14px',fontSize:13,color:TEXT,textAlign:'right'}}>{fmt(p.total_net)}</td>
                          <td style={{padding:'12px 14px',textAlign:'center'}}>{statusBadge(p.status || 'draft')}</td>
                          <td style={{padding:'12px 14px',textAlign:'right'}}>
                            <div style={{display:'flex',gap:6,justifyContent:'flex-end',alignItems:'center',flexWrap:'wrap'}}>
                              <a href={`/api/certified-payroll/generate-wh347?id=${p.id}`} target="_blank" rel="noopener noreferrer" style={{...BTN_GHOST,textDecoration:'none',display:'inline-flex',alignItems:'center'}}>View</a>
                              {p.status !== 'submitted' && <button onClick={() => submit(p.id)} style={BTN_PRIMARY}>Submit</button>}
                              <DocumentVersionHistory compact sourceType="certified_payroll" sourceId={p.id} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {toast && (
          <div style={{position:'fixed',bottom:20,right:20,padding:'12px 18px',background:toast.tone==='ok'?'rgba(46,160,67,.95)':'rgba(248,81,73,.95)',color:'#fff',borderRadius:8,fontWeight:700,fontSize:13,boxShadow:'0 4px 12px rgba(0,0,0,.35)',zIndex:100}}>
            {toast.msg}
          </div>
        )}
      </div>

      {wh347PreviewOpen && wh347PreviewMeta && (
        <DocumentPreviewModal
          isOpen={wh347PreviewOpen}
          onClose={() => setWh347PreviewOpen(false)}
          onApprove={async () => {
            setWh347PreviewOpen(false);
            showToast(`WH-347 #${wh347PreviewMeta.payrollNumber} approved`);
          }}
          onRegenerate={generate}
          htmlContent={wh347PreviewHtml}
          title={`WH-347 Certified Payroll #${wh347PreviewMeta.payrollNumber}`}
          docType="certified_payroll_wh347"
          sourceType="certified_payroll"
          sourceId={wh347PreviewMeta.payrollId}
          projectId={projectId}
          emailLabel="Submit to Agency"
          emailSubject={`WH-347 Certified Payroll #${wh347PreviewMeta.payrollNumber} — Week ${wh347PreviewMeta.weekEnding}`}
          keyFields={[
            { label: 'Payroll Number', value: String(wh347PreviewMeta.payrollNumber || '') },
            { label: 'Week Ending',    value: wh347PreviewMeta.weekEnding },
            { label: 'Worker Count',   value: String(wh347PreviewMeta.workerCount || '') },
            { label: 'Total Gross',    value: wh347PreviewMeta.totalGross ? fmt(wh347PreviewMeta.totalGross) : '' },
          ]}
        />
      )}
    </div>
  );
}
