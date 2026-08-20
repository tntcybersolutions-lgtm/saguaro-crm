'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import DocumentVersionHistory from '@/components/DocumentVersionHistory';

const BG='#0d1117',CARD='#161b22',BORDER='#30363d',GOLD='#d4a017',TEXT='#F0F4FF',DIM='#8b949e',GREEN='#2ea043',RED='#f85149',BLUE='#388bfd';

const fmtDate = (d:string|null) => { if(!d) return '—'; try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch { return d; } };

const INP:React.CSSProperties = {padding:'10px 12px',background:BG,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:16,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};
const BTN_PRIMARY:React.CSSProperties = {padding:'10px 20px',background:`linear-gradient(135deg,${GOLD},#e8b930)`,border:'none',borderRadius:8,color:'#000',fontWeight:800,fontSize:13,cursor:'pointer',minHeight:44};
const BTN_GHOST:React.CSSProperties = {padding:'10px 16px',background:'none',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer',minHeight:44};

type LetterType = 'ntp' | 'substantial_completion' | 'final_completion' | 'punch_list' | 'retainage_release';

const LETTER_CARDS: Array<{ type: LetterType; title: string; description: string; icon: string }> = [
  { type: 'ntp', title: 'Notice to Proceed', description: 'Authorizes contractor to begin work', icon: '📋' },
  { type: 'substantial_completion', title: 'Certificate of Substantial Completion', description: 'Certifies substantial completion per contract', icon: '✅' },
  { type: 'final_completion', title: 'Certificate of Final Completion', description: 'Certifies final completion and acceptance', icon: '🏆' },
  { type: 'punch_list', title: 'Punch List Transmittal Letter', description: 'Transmits the final punch list to the contractor', icon: '📝' },
  { type: 'retainage_release', title: 'Retainage Release Authorization', description: 'Authorizes release of retained funds', icon: '💰' },
];

interface MilestoneLetter {
  id: string;
  letter_type: LetterType;
  title: string;
  status: string;
  issued_date: string | null;
  effective_date: string | null;
  sent_to: string | null;
  sent_to_email: string | null;
  sent_at: string | null;
  signed_at: string | null;
  ai_generated: boolean | null;
  created_at: string;
}

function statusBadge(s: string) {
  const cfg: Record<string,{bg:string;c:string}> = {
    draft: {bg:'rgba(139,148,158,.15)',c:DIM},
    sent: {bg:'rgba(56,139,253,.15)',c:BLUE},
    signed: {bg:'rgba(46,160,67,.18)',c:GREEN},
  };
  const st = cfg[s] || cfg.draft;
  return <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:5,background:st.bg,color:st.c,textTransform:'uppercase',letterSpacing:.3}}>{s}</span>;
}

export default function MilestoneLettersPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [letters, setLetters] = useState<MilestoneLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<LetterType | null>(null);
  const [effectiveDates, setEffectiveDates] = useState<Partial<Record<LetterType, string>>>({});
  const [notes, setNotes] = useState<Partial<Record<LetterType, string>>>({});
  const [toast, setToast] = useState<{msg:string;tone:'ok'|'err'}|null>(null);

  const showToast = (msg: string, tone: 'ok'|'err' = 'ok') => {
    setToast({msg, tone});
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/milestone-letters?projectId=${projectId}`);
      if (r.ok) {
        const j = await r.json();
        setLetters(j.data || j.letters || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const [letterPreviewOpen, setLetterPreviewOpen] = useState(false);
  const [letterPreviewHtml, setLetterPreviewHtml] = useState('');
  const [letterPreviewMeta, setLetterPreviewMeta] = useState<{
    letterId: string; letterType: LetterType; title: string; effectiveDate: string; sentTo: string;
  } | null>(null);
  const [lastLetterType, setLastLetterType] = useState<LetterType | null>(null);

  async function generate(letterType: LetterType) {
    setGenerating(letterType);
    setLastLetterType(letterType);
    try {
      const r = await fetch('/api/milestone-letters/generate', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          projectId,
          letterType,
          effectiveDate: effectiveDates[letterType] || undefined,
          additionalNotes: notes[letterType] || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.error || 'Generation failed', 'err'); return; }
      showToast(`Generated: ${data.title}`);
      if (data.html_content && data.letterId) {
        setLetterPreviewHtml(data.html_content);
        setLetterPreviewMeta({
          letterId: data.letterId,
          letterType: data.letterType || letterType,
          title: data.title,
          effectiveDate: data.effectiveDate || '',
          sentTo: data.sentTo || '',
        });
        setLetterPreviewOpen(true);
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      showToast(msg, 'err');
    } finally {
      setGenerating(null);
    }
  }

  async function send(id: string) {
    const email = window.prompt('Send to email address:');
    if (!email) return;
    try {
      const r = await fetch(`/api/milestone-letters/${id}/send`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({error: 'Send failed'}));
        showToast(data.error || 'Send failed', 'err');
        return;
      }
      showToast(`Sent to ${email}`);
      await load();
    } catch (e) {
      showToast('Send failed', 'err');
    }
  }

  return (
    <div style={{padding:'24px',background:BG,color:TEXT,minHeight:'100vh'}}>
      <div style={{maxWidth:1200,margin:'0 auto'}}>

        <div style={{marginBottom:24}}>
          <h1 style={{fontSize:24,fontWeight:900,color:TEXT,margin:0}}>📋 Milestone Letters</h1>
          <div style={{fontSize:13,color:DIM,marginTop:4}}>AI-generated in seconds. Print, sign, and send.</div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:16,marginBottom:28}}>
          {LETTER_CARDS.map((card) => {
            const gen = generating === card.type;
            return (
              <div key={card.type} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:18,display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <div style={{fontSize:22,marginBottom:4}}>{card.icon}</div>
                  <div style={{fontSize:15,fontWeight:900,color:TEXT}}>{card.title}</div>
                  <div style={{fontSize:12,color:DIM,marginTop:4,lineHeight:1.4}}>{card.description}</div>
                </div>
                <div>
                  <label style={LBL}>Effective Date</label>
                  <input
                    type="date"
                    value={effectiveDates[card.type] || ''}
                    onChange={(e) => setEffectiveDates({...effectiveDates, [card.type]: e.target.value})}
                    style={INP}
                  />
                </div>
                <div>
                  <label style={LBL}>Additional Notes (optional)</label>
                  <textarea
                    value={notes[card.type] || ''}
                    onChange={(e) => setNotes({...notes, [card.type]: e.target.value})}
                    rows={2}
                    style={{...INP,resize:'vertical',fontFamily:'inherit'}}
                    placeholder="Any project-specific notes to include…"
                  />
                </div>
                <button
                  disabled={gen}
                  onClick={() => generate(card.type)}
                  style={{...BTN_PRIMARY,opacity:gen?.6:1,cursor:gen?'wait':'pointer'}}
                >
                  {gen ? 'Generating with Sage AI…' : 'Generate with Sage AI'}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:`1px solid ${BORDER}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:13,fontWeight:900,textTransform:'uppercase',letterSpacing:.5,color:GOLD}}>Past Letters</div>
            <div style={{fontSize:12,color:DIM}}>{letters.length} total</div>
          </div>
          {loading ? <div style={{padding:40,textAlign:'center',color:DIM}}>Loading…</div> : (
            letters.length === 0 ? <div style={{padding:40,textAlign:'center',color:DIM}}>No letters yet. Generate one above.</div> : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{background:'rgba(255,255,255,.03)'}}>
                      <th style={{padding:'10px 14px',textAlign:'left',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Title</th>
                      <th style={{padding:'10px 14px',textAlign:'left',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Type</th>
                      <th style={{padding:'10px 14px',textAlign:'left',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Effective</th>
                      <th style={{padding:'10px 14px',textAlign:'center',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Status</th>
                      <th style={{padding:'10px 14px',textAlign:'right',fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {letters.map(l => (
                      <tr key={l.id} style={{borderTop:`1px solid ${BORDER}`}}>
                        <td style={{padding:'12px 14px',fontSize:13,fontWeight:700,color:TEXT}}>{l.title}</td>
                        <td style={{padding:'12px 14px',fontSize:12,color:DIM}}>{l.letter_type.replace(/_/g,' ')}</td>
                        <td style={{padding:'12px 14px',fontSize:13,color:TEXT}}>{fmtDate(l.effective_date)}</td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>{statusBadge(l.status || 'draft')}</td>
                        <td style={{padding:'12px 14px',textAlign:'right'}}>
                          <div style={{display:'flex',gap:6,justifyContent:'flex-end',alignItems:'center',flexWrap:'wrap'}}>
                            <a href={`/api/milestone-letters/generate?id=${l.id}`} target="_blank" rel="noopener noreferrer" style={{...BTN_GHOST,textDecoration:'none',display:'inline-flex',alignItems:'center'}}>View</a>
                            {l.status !== 'sent' && <button onClick={() => send(l.id)} style={BTN_PRIMARY}>Send</button>}
                            <DocumentVersionHistory compact sourceType="milestone_letter" sourceId={l.id} />
                          </div>
                        </td>
                      </tr>
                    ))}
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

      {letterPreviewOpen && letterPreviewMeta && (
        <DocumentPreviewModal
          isOpen={letterPreviewOpen}
          onClose={() => setLetterPreviewOpen(false)}
          onApprove={async () => {
            setLetterPreviewOpen(false);
            showToast(`Letter approved: ${letterPreviewMeta.title}`);
          }}
          onRegenerate={lastLetterType ? () => generate(lastLetterType) : undefined}
          htmlContent={letterPreviewHtml}
          title={letterPreviewMeta.title}
          docType={`milestone_letter_${letterPreviewMeta.letterType}`}
          sourceType="milestone_letter"
          sourceId={letterPreviewMeta.letterId}
          projectId={projectId}
          emailLabel="Send Letter"
          emailSubject={letterPreviewMeta.title}
          keyFields={[
            { label: 'Letter Type',     value: (letterPreviewMeta.letterType || '').replace(/_/g, ' ') },
            { label: 'Effective Date',  value: letterPreviewMeta.effectiveDate },
            { label: 'Sent To',         value: letterPreviewMeta.sentTo },
          ]}
        />
      )}
    </div>
  );
}
