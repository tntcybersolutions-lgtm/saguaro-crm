'use client';
/**
 * Saguaro Field — Takeoff (AI Blueprint Analysis)
 * Upload blueprints, run AI analysis, view CSI-coded materials, export.
 */
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { F } from '@/lib/field-tokens';

interface Takeoff {
  id: string;
  project_id: string;
  name: string;
  status: string;
  file_name?: string;
  file_url?: string;
  total_cost?: number;
  material_cost?: number;
  labor_cost?: number;
  building_area?: number;
  floor_count?: number;
  confidence?: number;
  building_type?: string;
  summary?: string;
  recommendations?: string[];
  analyzed_at?: string;
  created_at: string;
}

interface Material {
  id: string;
  csi_code: string;
  csi_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  labor_hours: number;
  notes?: string;
}

type View = 'list' | 'upload' | 'analyzing' | 'detail';

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: F.dim,   bg: 'rgba(139,170,200,.1)' },
  uploaded:  { label: 'Uploaded',  color: F.blue,  bg: F.blueBg },
  analyzing: { label: 'Analyzing', color: F.amber, bg: F.amberBg },
  complete:  { label: 'Complete',  color: F.green, bg: F.greenBg },
  failed:    { label: 'Failed',    color: F.red,   bg: F.redBg },
};

function fmt(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function TakeoffPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || (typeof window !== 'undefined' ? localStorage.getItem('sag_active_project') : '') || '';
  const fileRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>('list');
  const [takeoffs, setTakeoffs] = useState<Takeoff[]>([]);
  const [selected, setSelected] = useState<Takeoff | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState({ step: 0, message: '', pct: 0 });
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState('');

  // Load takeoffs list
  const loadTakeoffs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/takeoff?projectId=${projectId}&limit=50`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setTakeoffs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load takeoffs');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (projectId) loadTakeoffs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Load single takeoff detail + materials
  const loadDetail = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/takeoff/${id}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setSelected(data);
      setMaterials(data.materials || []);
      setView('detail');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load takeoff');
    }
  };

  // Create new takeoff + upload file
  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setError('');
    try {
      // Step 1: Create takeoff record
      const createRes = await fetch('/api/takeoff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!createRes.ok) throw new Error('Failed to create takeoff');
      const takeoff = await createRes.json();

      // Step 2: Upload file with progress
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
        xhr.open('POST', `/api/takeoff/${takeoff.id}/upload`);
        xhr.send(formData);
      });

      setToast('Blueprint uploaded — ready to analyze');
      setTimeout(() => setToast(''), 3000);

      // Load the updated takeoff and go to detail
      await loadDetail(takeoff.id);
      await loadTakeoffs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
    setUploading(false);
    setUploadProgress(0);
  };

  // Run AI analysis (SSE stream)
  const handleAnalyze = async (id: string) => {
    setView('analyzing');
    setAnalyzeProgress({ step: 0, message: 'Starting analysis...', pct: 0 });
    setError('');

    try {
      const evtSource = new EventSource(`/api/takeoff/${id}/analyze`);

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'progress') {
            setAnalyzeProgress({ step: data.step, message: data.message, pct: data.pct });
          } else if (data.event === 'result') {
            setToast(`Analysis complete — ${data.itemCount} items found`);
            setTimeout(() => setToast(''), 4000);
            evtSource.close();
            loadDetail(id);
          } else if (data.event === 'error') {
            setError(data.message || 'Analysis failed');
            evtSource.close();
            setView('detail');
          } else if (data.event === 'done') {
            evtSource.close();
            loadDetail(id);
          }
        } catch { /* ignore parse errors */ }
      };

      evtSource.onerror = () => {
        evtSource.close();
        setError('Analysis connection lost — check your network');
        setView('detail');
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start analysis');
      setView('detail');
    }
  };

  // Export XLS
  const handleExport = async (id: string) => {
    setExporting(true);
    try {
      const res = await fetch(`/api/takeoff/${id}/export-xls`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `takeoff-${id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setToast('Spreadsheet downloaded');
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
    setExporting(false);
  };

  // Generate bid packages via Sage
  const handleSageAutoDocs = async (id: string) => {
    setView('analyzing');
    setAnalyzeProgress({ step: 0, message: 'Generating bid packages...', pct: 0 });
    setError('');

    try {
      const evtSource = new EventSource(`/api/takeoff/${id}/sage-auto-docs`);
      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'progress') {
            setAnalyzeProgress({ step: data.step, message: data.message, pct: data.pct });
          } else if (data.event === 'done') {
            setToast(`Created ${data.packagesCreated} bid packages`);
            setTimeout(() => setToast(''), 4000);
            evtSource.close();
            loadDetail(id);
          } else if (data.event === 'error') {
            setError(data.message || 'Generation failed');
            evtSource.close();
            setView('detail');
          }
        } catch { /* ignore */ }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setError('Connection lost');
        setView('detail');
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
      setView('detail');
    }
  };

  // Group materials by CSI division
  const divisions = materials.reduce((acc, m) => {
    const div = m.csi_code?.substring(0, 2) || '00';
    if (!acc[div]) acc[div] = { code: div, items: [], total: 0 };
    acc[div].items.push(m);
    acc[div].total += m.total_cost || 0;
    return acc;
  }, {} as Record<string, { code: string; items: Material[]; total: number }>);

  const badge = (status: string) => {
    const s = STATUS_BADGE[status] || STATUS_BADGE.pending;
    return (
      <span style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 12, padding: '2px 10px', fontSize: F.fontXs, fontWeight: 700, color: s.color }}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="field-page-enter" style={{ padding: '14px 16px', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <button onClick={() => view === 'list' ? router.back() : setView('list')} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: F.font3xl, fontWeight: 800, color: F.text }}>Takeoff</h1>
          <p style={{ margin: 0, fontSize: F.fontMd, color: F.dim }}>AI Blueprint Analysis</p>
        </div>
        {view === 'list' && (
          <button onClick={() => setView('upload')} style={{ background: F.gold, border: 'none', borderRadius: F.radiusSm, padding: '10px 16px', color: '#000', fontSize: F.fontMd, fontWeight: 800, cursor: 'pointer' }}>
            + New
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ background: F.greenBg, border: '1px solid rgba(34,197,94,.3)', borderRadius: F.radiusSm, padding: '10px 14px', marginBottom: 12, fontSize: F.fontMd, color: F.green, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: F.redBg, border: '1px solid rgba(239,68,68,.25)', borderRadius: F.radiusSm, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: F.fontMd, color: F.red, fontWeight: 600 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: F.dim, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* ═══ LIST VIEW ═══ */}
      {view === 'list' && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: F.dim }}>Loading takeoffs...</div>
          ) : takeoffs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📐</div>
              <p style={{ margin: '0 0 6px', fontSize: F.font2xl, fontWeight: 700, color: F.text }}>No takeoffs yet</p>
              <p style={{ margin: '0 0 20px', fontSize: F.fontMd, color: F.dim }}>Upload a blueprint to get AI-powered quantity estimates</p>
              <button onClick={() => setView('upload')} style={{ background: F.gold, border: 'none', borderRadius: F.radiusSm, padding: '12px 24px', color: '#000', fontSize: F.fontLg, fontWeight: 800, cursor: 'pointer' }}>
                Upload Blueprint
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {takeoffs.map(t => (
                <button key={t.id} onClick={() => loadDetail(t.id)} style={{ background: F.raised, border: `1px solid ${F.border}`, borderRadius: F.radius, padding: '14px', cursor: 'pointer', textAlign: 'left', width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: F.fontLg, fontWeight: 700, color: F.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name || t.file_name || 'Untitled'}
                    </span>
                    {badge(t.status)}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {t.total_cost != null && <span style={{ fontSize: F.fontSm, color: F.gold, fontWeight: 700 }}>{fmt(t.total_cost)}</span>}
                    {t.building_area != null && <span style={{ fontSize: F.fontSm, color: F.dim }}>{t.building_area.toLocaleString()} SF</span>}
                    {t.confidence != null && <span style={{ fontSize: F.fontSm, color: F.dim }}>{t.confidence}% conf</span>}
                    <span style={{ fontSize: F.fontSm, color: F.faint }}>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ UPLOAD VIEW ═══ */}
      {view === 'upload' && (
        <div style={{ marginTop: 16 }}>
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ width: '100%', background: F.raised, border: `2px dashed ${F.goldBorder}`, borderRadius: F.radiusLg, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: uploading ? 'wait' : 'pointer' }}
          >
            <div style={{ fontSize: 48, color: F.gold }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={56} height={56}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1={12} y1={3} x2={12} y2={15}/></svg>
            </div>
            <span style={{ fontSize: F.font2xl, fontWeight: 800, color: F.text }}>
              {uploading ? 'Uploading...' : 'Tap to Upload Blueprint'}
            </span>
            <span style={{ fontSize: F.fontMd, color: F.dim }}>PDF, PNG, JPG, TIFF — up to 50 MB</span>
          </button>

          {uploading && (
            <div style={{ marginTop: 16 }}>
              <div style={{ background: '#060C15', borderRadius: 8, overflow: 'hidden', height: 8 }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: F.gold, borderRadius: 8, transition: 'width 0.3s' }} />
              </div>
              <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: F.fontMd, color: F.dim }}>{uploadProgress}%</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ ANALYZING VIEW ═══ */}
      {view === 'analyzing' && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: F.amberBg, border: `2px solid ${F.amber}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'fieldPulse 2s infinite' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={F.amber} strokeWidth={2} width={36} height={36}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: F.font2xl, fontWeight: 800, color: F.text }}>AI Analyzing Blueprint</p>
          <p style={{ margin: '0 0 20px', fontSize: F.fontMd, color: F.dim }}>{analyzeProgress.message}</p>
          <div style={{ background: '#060C15', borderRadius: 8, overflow: 'hidden', height: 8, maxWidth: 300, margin: '0 auto' }}>
            <div style={{ width: `${analyzeProgress.pct}%`, height: '100%', background: `linear-gradient(90deg, ${F.gold}, ${F.amber})`, borderRadius: 8, transition: 'width 0.5s' }} />
          </div>
          <p style={{ margin: '10px 0 0', fontSize: F.fontSm, color: F.faint }}>Step {analyzeProgress.step}/7 — {analyzeProgress.pct}%</p>
        </div>
      )}

      {/* ═══ DETAIL VIEW ═══ */}
      {view === 'detail' && selected && (
        <>
          {/* Summary card */}
          <div style={{ background: F.raised, border: `1px solid ${F.border}`, borderRadius: F.radius, padding: '16px', marginTop: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: F.fontLg, fontWeight: 700, color: F.text }}>{selected.name || 'Takeoff'}</span>
              {badge(selected.status)}
            </div>

            {selected.status === 'complete' && (
              <>
                {/* Cost breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <StatBox label="Total Cost" value={fmt(selected.total_cost)} color={F.gold} />
                  <StatBox label="Material" value={fmt(selected.material_cost)} color={F.blue} />
                  <StatBox label="Labor" value={fmt(selected.labor_cost)} color={F.green} />
                  <StatBox label="Building Area" value={selected.building_area ? `${selected.building_area.toLocaleString()} SF` : '—'} color={F.dim} />
                </div>

                {selected.confidence != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: F.fontSm, color: F.dim }}>AI Confidence:</span>
                    <div style={{ flex: 1, background: '#060C15', borderRadius: 4, height: 6 }}>
                      <div style={{ width: `${selected.confidence}%`, height: '100%', background: selected.confidence >= 80 ? F.green : selected.confidence >= 60 ? F.amber : F.red, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: F.fontSm, fontWeight: 700, color: F.text }}>{selected.confidence}%</span>
                  </div>
                )}

                {selected.summary && (
                  <p style={{ margin: '0 0 10px', fontSize: F.fontMd, color: F.dim, lineHeight: 1.5 }}>{selected.summary}</p>
                )}

                {selected.recommendations && selected.recommendations.length > 0 && (
                  <div style={{ background: 'rgba(212,160,23,.06)', border: `1px solid ${F.goldBorder}`, borderRadius: F.radiusSm, padding: '10px 12px', marginBottom: 10 }}>
                    <p style={{ margin: '0 0 6px', fontSize: F.fontXs, fontWeight: 700, color: F.gold, textTransform: 'uppercase', letterSpacing: 0.8 }}>AI Recommendations</p>
                    {selected.recommendations.map((r, i) => (
                      <p key={i} style={{ margin: '4px 0', fontSize: F.fontSm, color: F.dim, paddingLeft: 10, borderLeft: `2px solid ${F.gold}30` }}>{r}</p>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selected.status === 'uploaded' && (
                <button onClick={() => handleAnalyze(selected.id)} style={actionBtn(F.gold)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Run AI Analysis
                </button>
              )}
              {selected.status === 'complete' && (
                <>
                  <button onClick={() => handleExport(selected.id)} disabled={exporting} style={actionBtn(F.blue)}>
                    {exporting ? 'Exporting...' : 'Export Excel'}
                  </button>
                  <button onClick={() => handleSageAutoDocs(selected.id)} style={actionBtn(F.green)}>
                    Generate Bid Packages
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Materials table */}
          {materials.length > 0 && (
            <>
              <p style={{ margin: '0 0 10px', fontSize: F.fontXs, fontWeight: 700, color: F.dim, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Materials — {materials.length} line items
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.values(divisions).sort((a, b) => a.code.localeCompare(b.code)).map(div => (
                  <div key={div.code} style={{ background: F.raised, border: `1px solid ${F.border}`, borderRadius: F.radius, overflow: 'hidden' }}>
                    {/* Division header */}
                    <div style={{ background: 'rgba(212,160,23,.06)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${F.border}` }}>
                      <span style={{ fontSize: F.fontMd, fontWeight: 700, color: F.gold }}>Division {div.code}</span>
                      <span style={{ fontSize: F.fontSm, fontWeight: 700, color: F.text }}>{fmt(div.total)}</span>
                    </div>
                    {/* Items */}
                    {div.items.map((m, idx) => (
                      <div key={m.id || idx} style={{ padding: '10px 14px', borderBottom: idx < div.items.length - 1 ? `1px solid ${F.borderLight}` : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: F.fontMd, fontWeight: 600, color: F.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.csi_name || m.description}
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: F.fontXs, color: F.faint }}>{m.csi_code}</p>
                          </div>
                          <span style={{ fontSize: F.fontMd, fontWeight: 700, color: F.gold, whiteSpace: 'nowrap' }}>{fmt(m.total_cost)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                          <span style={{ fontSize: F.fontXs, color: F.dim }}>{m.quantity?.toLocaleString()} {m.unit}</span>
                          <span style={{ fontSize: F.fontXs, color: F.dim }}>@ {fmt(m.unit_cost)}/{m.unit}</span>
                          {m.labor_hours > 0 && <span style={{ fontSize: F.fontXs, color: F.dim }}>{m.labor_hours}h labor</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#060C15', borderRadius: F.radiusSm, padding: '10px 12px' }}>
      <p style={{ margin: 0, fontSize: F.fontXs, color: F.dim, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '2px 0 0', fontSize: F.fontLg, fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: F.dim, cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center' };
const actionBtn = (color: string): React.CSSProperties => ({
  background: `${color}18`, border: `1px solid ${color}40`, borderRadius: F.radiusSm, padding: '10px 14px',
  color, fontSize: F.fontMd, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
});

export default function FieldTakeoffPage() {
  return <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#8BAAC8' }}><div style={{ width: 24, height: 24, border: '3px solid rgba(200,150,15,.2)', borderTopColor: '#C8960F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} /><span>Loading...</span></div>}><TakeoffPage /></Suspense>;
}
