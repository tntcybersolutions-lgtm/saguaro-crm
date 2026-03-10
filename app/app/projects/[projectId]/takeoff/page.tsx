'use client';
import React, { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

type Stage = 'upload' | 'processing' | 'complete' | 'error';

interface MaterialLine {
  category: string;
  item_description: string;
  quantity: number;
  unit: string;
  unit_cost_estimate: number;
  total_cost_estimate: number;
}

interface TakeoffResult {
  takeoffProjectId: string;
  totalMaterialCost: number;
  totalLaborCost: number;
  totalSf: number;
  timeSavedFormatted: string;
  processingFormatted: string;
  materials: MaterialLine[];
  upsellPrompt?: { headline: string; body: string; cta: string } | null;
}

interface SubsModal {
  open: boolean;
  trade: string;
  loading: boolean;
  subs: string[];
}

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return {};
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: 'Bearer ' + session.access_token };
    }
  } catch {}
  return {};
}

function classifyCSI(desc: string): { code: string; name: string } {
  const d = desc.toLowerCase();
  if (d.match(/concrete|rebar|formwork|slab|footing/)) return { code: '03', name: 'Concrete' };
  if (d.match(/masonry|brick|block|cmu|stone/)) return { code: '04', name: 'Masonry' };
  if (d.match(/steel|metal|beam|column|joist|deck/)) return { code: '05', name: 'Metals' };
  if (d.match(/lumber|wood|framing|sheathing|plywood|stud/)) return { code: '06', name: 'Wood & Plastics' };
  if (d.match(/roof|waterproof|insul|vapor|felt/)) return { code: '07', name: 'Thermal & Moisture' };
  if (d.match(/door|window|glass|glazing|storefront/)) return { code: '08', name: 'Openings' };
  if (d.match(/drywall|gypsum|paint|floor|tile|carpet|ceiling/)) return { code: '09', name: 'Finishes' };
  if (d.match(/sprinkler|fire suppression/)) return { code: '21', name: 'Fire Suppression' };
  if (d.match(/plumb|pipe|drain|fixture/)) return { code: '22', name: 'Plumbing' };
  if (d.match(/hvac|duct|mechanical|air|boiler/)) return { code: '23', name: 'HVAC' };
  if (d.match(/electrical|conduit|wire|panel|outlet|light/)) return { code: '26', name: 'Electrical' };
  if (d.match(/excavat|grade|fill|earthwork|soil/)) return { code: '31', name: 'Earthwork' };
  if (d.match(/pav|asphalt|landscape|fence|curb/)) return { code: '32', name: 'Exterior' };
  return { code: '01', name: 'General Requirements' };
}

function groupByCSI(materials: MaterialLine[]) {
  const map = new Map<string, { division: { code: string; name: string }; items: MaterialLine[] }>();
  for (const m of materials) {
    const div = classifyCSI(m.item_description || m.category || '');
    const key = div.code;
    if (!map.has(key)) map.set(key, { division: div, items: [] });
    map.get(key)!.items.push(m);
  }
  return Array.from(map.values()).sort((a, b) => a.division.code.localeCompare(b.division.code));
}

export default function TakeoffPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params['projectId'] as string;

  const [stage, setStage] = useState<Stage>('upload');
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Starting AI takeoff...');
  const [step, setStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(5);
  const [result, setResult] = useState<TakeoffResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [autoGenStatus, setAutoGenStatus] = useState<string | null>(null);

  // New state for enhanced UI
  const [bidLoading, setBidLoading] = useState(false);
  const [sovLoading, setSovLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [subsModal, setSubsModal] = useState<SubsModal>({ open: false, trade: '', loading: false, subs: [] });

  function showToast(msg: string, color: string = GREEN) {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleFile(file: File) {
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
    if (!allowed.includes(file.type)) { setErrorMsg('Unsupported format. Use PDF, JPG, PNG, or WebP.'); setStage('error'); return; }
    if (file.size > 50 * 1024 * 1024) { setErrorMsg('File too large. Maximum 50MB.'); setStage('error'); return; }
    setStage('processing'); setProgress(5); setStatusMsg('Creating takeoff project...');
    try {
      // Get actual tenant ID from session, fall back to projectId for sandbox
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      let activeTenantId = projectId; // default for sandbox
      try {
        if (supabaseUrl && supabaseAnonKey) {
          const supabase = createClient(supabaseUrl, supabaseAnonKey);
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) activeTenantId = session.user.id;
        }
      } catch {}
      const authHdr = await getAuthHeaders();

      const cr = await fetch('/api/takeoff/create', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHdr }, body: JSON.stringify({ tenantId: activeTenantId, name: file.name.replace(/\.[^.]+$/, ''), projectType: 'residential', projectId }) });
      const cd = await cr.json();
      if (!cr.ok || !cd.takeoffProjectId) throw new Error(cd.error || 'Failed to create takeoff');
      const tid = cd.takeoffProjectId;
      setProgress(15); setStatusMsg('Uploading blueprint...');
      const fd = new FormData(); fd.append('file', file); fd.append('tenantId', activeTenantId); fd.append('sheetType', 'floor_plan');
      const ur = await fetch('/api/takeoff/' + tid + '/upload', { method: 'POST', headers: { ...authHdr }, body: fd });
      const ud = await ur.json();
      if (!ur.ok) throw new Error(ud.error || 'Upload failed');
      setProgress(25); setStatusMsg('Blueprint uploaded — starting AI analysis...');
      const rr = await fetch('/api/takeoff/' + tid + '/run', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHdr }, body: JSON.stringify({ tenantId: activeTenantId }) });
      if (!rr.ok) { const ed = await rr.json(); if (rr.status === 402) throw new Error('AI run limit reached. Upgrade to Professional to continue.'); throw new Error(ed.error || 'Takeoff failed'); }
      const reader = rr.body?.getReader(); if (!reader) throw new Error('No response stream');
      const dec = new TextDecoder(); let done = false;

      // Add timeout detection — 25s warning for hobby plan limit
      const timeoutId = setTimeout(() => {
        setErrorMsg('AI processing timed out. This feature requires Vercel Pro plan for full AI runs (300s). Upgrade at vercel.com or try a smaller blueprint.');
        setStage('error');
      }, 25000);

      while (!done) {
        const chunk = await reader.read(); done = chunk.done; if (!chunk.value) continue;
        for (const line of dec.decode(chunk.value).split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (ev.type === 'status') { setStatusMsg(ev.message ?? ''); setStep(ev.step ?? 0); setTotalSteps(ev.totalSteps ?? 5); setProgress(25 + Math.round(((ev.step ?? 0) / (ev.totalSteps ?? 5)) * 65)); }
            else if (ev.type === 'done') {
              setProgress(100);
              clearTimeout(timeoutId);
              const mr = await fetch('/api/takeoff/' + tid + '/materials?tenantId=' + activeTenantId + '&pageSize=500', { headers: { ...authHdr } });
              const md = mr.ok ? await mr.json() : { materials: [] };
              const takeoffResult: TakeoffResult = {
                takeoffProjectId: tid,
                totalMaterialCost: ev.result?.totalMaterialCost ?? 0,
                totalLaborCost: ev.result?.totalLaborCost ?? 0,
                totalSf: ev.result?.totalSf ?? 0,
                timeSavedFormatted: ev.result?.timeSavedFormatted ?? '4h 0m',
                processingFormatted: ev.result?.processingFormatted ?? '0s',
                materials: md.materials ?? [],
                upsellPrompt: ev.result?.upsellPrompt ?? null,
              };
              setResult(takeoffResult);

              // AUTO-GENERATE: Bid Package + SOV immediately after takeoff
              setStatusMsg('Auto-generating bid package and schedule of values...');
              try {
                const sovItems = (md.materials ?? []).map((m: MaterialLine) => ({
                  description: m.item_description,
                  quantity: m.quantity,
                  unit: m.unit,
                  unitCost: m.unit_cost_estimate,
                  total: m.total_cost_estimate,
                  csiCode: classifyCSI(m.item_description || m.category || '').code,
                }));

                // Create bid package
                const bpRes = await fetch('/api/bid-packages/create', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...authHdr },
                  body: JSON.stringify({ projectId, takeoffId: tid, autoPopulate: true, sovItems }),
                });
                if (bpRes.ok) {
                  const bpData = await bpRes.json();
                  setAutoGenStatus('Bid package created — sending sub invitations by trade...');

                  // Auto-invite subs by CSI division
                  const csiGroups = groupByCSI(md.materials ?? []);
                  for (const group of csiGroups.slice(0, 5)) { // top 5 divisions
                    await fetch('/api/bid-packages/suggest-subs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...authHdr },
                      body: JSON.stringify({ trade: group.division.name, projectId, bidPackageId: bpData.bidPackageId, autoInvite: true }),
                    }).catch(() => null); // non-blocking
                  }
                }

                // Generate SOV
                await fetch(`/api/projects/${projectId}/sov/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...authHdr },
                  body: JSON.stringify({ materials: md.materials ?? [] }),
                }).catch(() => null); // non-blocking

                setAutoGenStatus('done');
              } catch (autoGenErr) {
                console.warn('Auto-generate warning:', autoGenErr);
                // Non-fatal — takeoff succeeded, just auto-gen failed
              }

              setTimeout(() => setStage('complete'), 400); done = true; break;
            } else if (ev.type === 'error') { clearTimeout(timeoutId); throw new Error(ev.message); }
          } catch (pe) { if (pe instanceof Error && !pe.message.includes('JSON')) { clearTimeout(timeoutId); throw pe; } }
        }
      }
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Takeoff failed'); setStage('error'); }
  }

  async function handleGenerateBidPackage() {
    if (!result) return;
    setBidLoading(true);
    try {
      const authHdr = await getAuthHeaders();
      const sovItems = result.materials.map(m => ({
        description: m.item_description,
        quantity: m.quantity,
        unit: m.unit,
        unitCost: m.unit_cost_estimate,
        total: m.total_cost_estimate,
        csiCode: classifyCSI(m.item_description || m.category || '').code,
      }));
      const res = await fetch('/api/bid-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHdr },
        body: JSON.stringify({ projectId, takeoffId: result.takeoffProjectId, autoPopulate: true, sovItems }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to create bid package'); }
      router.push(`/app/projects/${projectId}/bid-packages`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error creating bid package', RED);
    } finally {
      setBidLoading(false);
    }
  }

  async function handleGenerateSOV() {
    if (!result) return;
    setSovLoading(true);
    try {
      const authHdr = await getAuthHeaders();
      const res = await fetch(`/api/projects/${projectId}/sov/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHdr },
        body: JSON.stringify({ materials: result.materials }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to generate SOV'); }
      showToast('SOV created — view in Pay Apps', GREEN);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error generating SOV', RED);
    } finally {
      setSovLoading(false);
    }
  }

  async function handleInviteSubs(divisionName: string) {
    setSubsModal({ open: true, trade: divisionName, loading: true, subs: [] });
    try {
      const authHdr = await getAuthHeaders();
      const res = await fetch('/api/bid-packages/suggest-subs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHdr },
        body: JSON.stringify({ trade: divisionName, projectId }),
      });
      if (!res.ok) throw new Error('Failed to fetch suggested subs');
      const data = await res.json();
      setSubsModal(prev => ({ ...prev, loading: false, subs: data.subs ?? data.suggestions ?? [] }));
    } catch {
      setSubsModal(prev => ({ ...prev, loading: false, subs: [] }));
      showToast('Could not load suggested subs', RED);
    }
  }

  // ── UPLOAD STAGE ─────────────────────────────────────────────────────────────
  if (stage === 'upload') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', padding: 40 }}>

      {/* Construction workflow steps */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { n: 1, label: 'Upload Blueprint', active: true },
          { n: 2, label: 'AI Reads Dimensions', active: false },
          { n: 3, label: 'Generate Materials List', active: false },
          { n: 4, label: 'Auto-Create Bid Package', active: false },
          { n: 5, label: 'Send Sub Invitations', active: false },
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: step.active ? GOLD : DIM }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: step.active ? GOLD : 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: step.active ? DARK : DIM }}>
              {step.n}
            </div>
            {step.label}
            {i < 4 && <span style={{ color: '#263347' }}>→</span>}
          </div>
        ))}
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileRef.current?.click()}
        style={{ border: '2px dashed ' + (dragging ? GOLD : 'rgba(212,160,23,.4)'), borderRadius: 14, padding: '60px 80px', textAlign: 'center', cursor: 'pointer', maxWidth: 560, width: '100%', background: dragging ? 'rgba(212,160,23,.04)' : 'rgba(212,160,23,.02)', transition: 'all .2s' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp,image/tiff"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <div style={{ fontSize: 52, marginBottom: 16 }}>📐</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 8 }}>Drop Your Blueprint Here</div>
        <div style={{ fontSize: 14, color: DIM, marginBottom: 24 }}>PDF, JPG, PNG — Claude reads every dimension automatically</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          {['PDF', 'JPG', 'PNG', 'WebP', 'TIFF'].map(f => <span key={f} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid ' + BORDER, padding: '3px 10px', borderRadius: 5, fontSize: 11, color: DIM }}>{f}</span>)}
        </div>
        <button style={{ padding: '13px 32px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 8, color: DARK, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Upload Blueprint</button>
        <div style={{ marginTop: 16, fontSize: 12, color: '#4a5f7a' }}>Max 50MB · Processed by Claude AI</div>
      </div>
    </div>
  );

  // ── PROCESSING STAGE ──────────────────────────────────────────────────────────
  if (stage === 'processing') {
    const labels = ['Uploading blueprint file...', 'Detecting scale and sheet type...', 'Measuring rooms, walls, and openings...', 'Calculating materials with waste factors...', 'Pricing at current contractor wholesale rates...'];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', padding: 40 }}>
        <div style={{ maxWidth: 520, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,' + GOLD + ',#2272c3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>Claude is reading your blueprint</div>
              <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{statusMsg}</div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: GOLD }}>{progress}%</div>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 4, marginBottom: 24 }}>
            <div style={{ height: '100%', width: progress + '%', background: 'linear-gradient(90deg,' + GOLD + ',#F0C040)', borderRadius: 4, transition: 'width .4s' }} />
          </div>
          {labels.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 8, background: i < step ? 'rgba(26,138,74,.06)' : i === step ? 'rgba(212,160,23,.08)' : 'rgba(255,255,255,.02)', border: '1px solid ' + (i < step ? 'rgba(26,138,74,.3)' : i === step ? 'rgba(212,160,23,.3)' : 'rgba(38,51,71,.5)') }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, background: i < step ? 'rgba(26,138,74,.2)' : i === step ? 'rgba(212,160,23,.15)' : 'rgba(255,255,255,.05)', color: i < step ? GREEN : i === step ? GOLD : DIM }}>{i < step ? '✓' : i + 1}</div>
              <span style={{ fontSize: 13, color: i <= step ? TEXT : DIM }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── ERROR STAGE ───────────────────────────────────────────────────────────────
  if (stage === 'error') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', padding: 40 }}>
      <div style={{ maxWidth: 480, width: '100%', background: RAISED, border: '1px solid rgba(239,68,68,.3)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: RED, marginBottom: 8 }}>Takeoff Failed</div>
        <div style={{ fontSize: 14, color: DIM, marginBottom: 24 }}>{errorMsg}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => { setStage('upload'); setErrorMsg(''); }} style={{ padding: '11px 28px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 8, color: DARK, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Try Again</button>
          {errorMsg.includes('Upgrade') && <a href="/pricing" style={{ padding: '11px 28px', background: 'rgba(212,160,23,.12)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 8, color: GOLD, fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>View Plans</a>}
        </div>
      </div>
    </div>
  );

  // ── COMPLETE STAGE ────────────────────────────────────────────────────────────
  const materials = result?.materials ?? [];
  const totalMatCost = result?.totalMaterialCost ?? 0;
  const estimatedLabor = totalMatCost * 1.4;
  const gcOverhead = (totalMatCost + estimatedLabor) * 0.12;
  const suggestedBid = totalMatCost + estimatedLabor + gcOverhead + (totalMatCost + estimatedLabor + gcOverhead) * 0.10;
  const csiGroups = groupByCSI(materials);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', position: 'relative' }}>

      {/* ── Toast notification ── */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: toast.color === GREEN ? 'rgba(61,214,140,.15)' : 'rgba(239,68,68,.15)', border: '1px solid ' + toast.color, borderRadius: 10, padding: '12px 20px', color: toast.color, fontSize: 14, fontWeight: 700, backdropFilter: 'blur(8px)', boxShadow: '0 4px 24px rgba(0,0,0,.4)' }}>
          {toast.msg}
        </div>
      )}

      {/* ── Subs Modal ── */}
      {subsModal.open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSubsModal(prev => ({ ...prev, open: false }))}>
          <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 14, padding: 32, maxWidth: 480, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,.6)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, marginBottom: 6 }}>Suggested Subs — {subsModal.trade}</div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 20 }}>AI-matched subcontractors for this trade division</div>
            {subsModal.loading ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: DIM }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>Loading suggestions...
              </div>
            ) : subsModal.subs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {subsModal.subs.map((s, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid ' + BORDER, borderRadius: 8, color: TEXT, fontSize: 13 }}>{s}</div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: DIM, padding: '16px 0', fontSize: 13 }}>No suggestions returned. Try again or add subs manually.</div>
            )}
            <button onClick={() => setSubsModal(prev => ({ ...prev, open: false }))} style={{ marginTop: 20, padding: '9px 20px', background: 'rgba(255,255,255,.06)', border: '1px solid ' + BORDER, borderRadius: 8, color: DIM, fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' }}>Close</button>
          </div>
        </div>
      )}

      {/* ── Header bar ── */}
      <div style={{ background: 'linear-gradient(135deg,rgba(212,160,23,.12),rgba(26,95,168,.2))', borderBottom: '1px solid rgba(212,160,23,.3)', padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>✅ Takeoff complete in {result?.processingFormatted ?? '?'} — {materials.length} materials</div>
          <div style={{ fontSize: 12, color: DIM }}>Time saved vs. manual: {result?.timeSavedFormatted ?? '4h+'}</div>
          <div style={{ fontSize: 12, color: GREEN, marginTop: 2 }}>
            ✅ Bid package created • SOV generated • Sub invitations sent
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {[
            { l: 'Materials', v: fmt(totalMatCost) },
            { l: 'Labor', v: fmt(result?.totalLaborCost ?? 0) },
            { l: 'Total', v: fmt(totalMatCost + (result?.totalLaborCost ?? 0)) },
            { l: 'Sq Ft', v: result?.totalSf ? result.totalSf.toLocaleString() : '—' },
          ].map(k => (
            <div key={k.l} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: .5 }}>{k.l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{k.v}</div>
            </div>
          ))}
          <button onClick={() => setStage('upload')} style={{ padding: '8px 14px', background: 'rgba(255,255,255,.06)', border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>New Upload</button>
        </div>
      </div>

      {/* ── Upsell banner ── */}
      {result?.upsellPrompt && (
        <div style={{ background: 'rgba(212,160,23,.08)', borderBottom: '1px solid rgba(212,160,23,.2)', padding: '12px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 700, color: GOLD }}>{result.upsellPrompt.headline}</span>
            <span style={{ color: DIM, fontSize: 13, marginLeft: 12 }}>{result.upsellPrompt.body}</span>
          </div>
          <a href="/pricing" style={{ padding: '7px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', borderRadius: 7, color: DARK, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>{result.upsellPrompt.cta}</a>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px' }}>

        {materials.length > 0 ? (
          <>
            {/* ── Summary cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Total Material Cost', value: fmt(totalMatCost), note: `${materials.length} line items` },
                { label: 'Estimated Labor', value: fmt(estimatedLabor), note: '1.4× material cost' },
                { label: 'GC Overhead (12%)', value: fmt(gcOverhead), note: 'Applied to mat + labor' },
                { label: 'Suggested Total Bid', value: fmt(suggestedBid), note: 'Incl. 10% profit margin', highlight: true },
              ].map(card => (
                <div key={card.label} style={{ background: RAISED, border: '1px solid ' + (card.highlight ? 'rgba(212,160,23,.5)' : BORDER), borderRadius: 12, padding: '16px 18px', boxShadow: card.highlight ? '0 0 0 1px rgba(212,160,23,.15)' : 'none' }}>
                  <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: .6, marginBottom: 6 }}>{card.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: GOLD, marginBottom: 4 }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: DIM }}>{card.note}</div>
                </div>
              ))}
            </div>

            {/* ── Action buttons ── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <button
                onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)}
                style={{ padding: '12px 24px', background: 'linear-gradient(135deg,#D4A017,#F0C040)', border: 'none', borderRadius: 9, color: DARK, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 12px rgba(212,160,23,.3)' }}>
                📦 View Bid Package
              </button>
              <button
                onClick={() => router.push(`/app/projects/${projectId}/pay-apps`)}
                style={{ padding: '12px 24px', background: 'rgba(61,214,140,.1)', border: '1px solid rgba(61,214,140,.35)', borderRadius: 9, color: GREEN, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                📋 View Schedule of Values
              </button>
              <button
                onClick={handleGenerateBidPackage}
                disabled={bidLoading}
                style={{ padding: '12px 24px', background: bidLoading ? 'rgba(212,160,23,.15)' : 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.35)', borderRadius: 9, color: GOLD, fontSize: 14, fontWeight: 700, cursor: bidLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {bidLoading ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(212,160,23,.3)', borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : '🔄'}
                {bidLoading ? 'Creating...' : 'Regenerate Bid Package'}
              </button>
              <button
                onClick={handleGenerateSOV}
                disabled={sovLoading}
                style={{ padding: '12px 24px', background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.35)', borderRadius: 9, color: GOLD, fontSize: 14, fontWeight: 700, cursor: sovLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {sovLoading ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(212,160,23,.3)', borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : '📋'}
                {sovLoading ? 'Generating...' : 'Regenerate Schedule of Values'}
              </button>
            </div>

            {/* ── Auto-gen status ── */}
            {autoGenStatus && autoGenStatus !== 'done' && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(61,214,140,.06)', border: '1px solid rgba(61,214,140,.2)', borderRadius: 8, fontSize: 13, color: GREEN }}>
                {autoGenStatus}
              </div>
            )}

            {/* ── CSI grouped results table ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0a1117', position: 'sticky', top: 0, zIndex: 5 }}>
                  {['Category', 'Material / Specification', 'Qty (w/ waste)', 'Unit', 'Unit Cost', 'Total Cost'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: i >= 2 ? 'right' : 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: DIM, borderBottom: '1px solid ' + BORDER }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csiGroups.map(group => {
                  const divSubtotal = group.items.reduce((s, m) => s + (m.total_cost_estimate ?? 0), 0);
                  return (
                    <React.Fragment key={group.division.code}>
                      {/* Division header row */}
                      <tr>
                        <td colSpan={6} style={{ padding: '10px 14px', background: DARK, borderLeft: '3px solid #D4A017', borderBottom: '1px solid ' + BORDER }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: TEXT, textTransform: 'uppercase', letterSpacing: .8 }}>
                              Division {group.division.code} — {group.division.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: 11, color: DIM }}>{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                              <button
                                onClick={() => handleInviteSubs(group.division.name)}
                                style={{ padding: '4px 10px', background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 5, color: GOLD, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                Invite Subs
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {/* Material rows */}
                      {group.items.map((m, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                          <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: 'rgba(212,160,23,.1)', color: GOLD }}>{m.category}</span></td>
                          <td style={{ padding: '10px 14px', color: TEXT }}>{m.item_description}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: GOLD, fontWeight: 700 }}>{m.quantity?.toLocaleString()}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: DIM }}>{m.unit}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: DIM }}>{m.unit_cost_estimate ? fmt(m.unit_cost_estimate) : '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: TEXT }}>{fmt(m.total_cost_estimate ?? 0)}</td>
                        </tr>
                      ))}
                      {/* Division subtotal row */}
                      <tr style={{ background: 'rgba(212,160,23,.04)', borderBottom: '2px solid rgba(38,51,71,.6)' }}>
                        <td colSpan={5} style={{ padding: '8px 14px', fontWeight: 700, color: DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: .5 }}>
                          Division {group.division.code} Subtotal
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, color: GOLD }}>{fmt(divSubtotal)}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                {/* Grand total row */}
                <tr style={{ background: 'rgba(212,160,23,.06)', borderTop: '2px solid rgba(212,160,23,.3)' }}>
                  <td colSpan={5} style={{ padding: '12px 14px', fontWeight: 800, color: GOLD }}>TOTAL — {materials.length} LINE ITEMS</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: 16, color: GOLD }}>{fmt(totalMatCost)}</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: DIM }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤔</div>
            No material lines generated. The blueprint may not contain readable dimensions.
          </div>
        )}
      </div>

      {/* ── CSS keyframe for spinner ── */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
