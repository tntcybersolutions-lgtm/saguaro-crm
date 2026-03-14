'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PageWrap, SectionHeader, StatCard, Badge, Btn,
  Card, CardHeader, CardBody, Table, ProgressBar, T,
} from '@/components/ui/shell';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Project { id: string; name: string; }
interface TakeoffMaterial {
  id: string; csi_code: string; csi_name: string; description: string;
  quantity: number; unit: string; unit_cost: number; total_cost: number;
  labor_hours: number; notes: string; sort_order: number;
}
interface Takeoff {
  id: string; name: string; project_id: string;
  project_name?: string;
  status: 'pending' | 'uploaded' | 'analyzing' | 'complete' | 'failed';
  total_cost: number; material_cost: number; labor_cost: number;
  building_area: number; floor_count: number; confidence: number;
  building_type: string; summary: string; project_name_detected: string;
  contingency_pct: number; recommendations: string[];
  file_name: string; created_at: string; analyzed_at: string;
  materials?: TakeoffMaterial[];
}

type UploadPhase = 'idle' | 'project-select' | 'uploading' | 'analyzing' | 'done' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function confidenceColor(c: number): 'green' | 'amber' | 'red' {
  if (c >= 75) return 'green';
  if (c >= 50) return 'amber';
  return 'red';
}

function statusColor(s: string): 'green' | 'amber' | 'blue' | 'red' | 'muted' {
  if (s === 'complete') return 'green';
  if (s === 'analyzing') return 'blue';
  if (s === 'uploaded') return 'amber';
  if (s === 'failed') return 'red';
  return 'muted';
}

// Group materials by CSI division (first 2 chars of csi_code)
interface CsiDivision {
  divCode: string;
  divName: string;
  items: TakeoffMaterial[];
  totalCost: number;
  totalLaborHours: number;
}

function groupByDivision(materials: TakeoffMaterial[]): CsiDivision[] {
  const map = new Map<string, CsiDivision>();
  for (const m of materials) {
    const divCode = (m.csi_code || '00').slice(0, 2).replace(/\s/g, '');
    if (!map.has(divCode)) {
      map.set(divCode, {
        divCode,
        divName: m.csi_name || `Division ${divCode}`,
        items: [],
        totalCost: 0,
        totalLaborHours: 0,
      });
    }
    const div = map.get(divCode)!;
    div.items.push(m);
    div.totalCost += m.total_cost || 0;
    div.totalLaborHours += m.labor_hours || 0;
  }
  return Array.from(map.values()).sort((a, b) => a.divCode.localeCompare(b.divCode));
}

function exportCSV(takeoff: Takeoff) {
  if (!takeoff.materials?.length) return;
  const headers = ['CSI Code', 'CSI Name', 'Description', 'Quantity', 'Unit', 'Unit Cost', 'Total Cost', 'Labor Hours', 'Notes'];
  const rows = takeoff.materials.map(m => [
    m.csi_code, m.csi_name, m.description,
    m.quantity, m.unit,
    `$${(m.unit_cost || 0).toFixed(2)}`, `$${(m.total_cost || 0).toFixed(2)}`,
    m.labor_hours, m.notes,
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `takeoff-${takeoff.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Step list for analyzing phase ───────────────────────────────────────────
const STEPS = [
  'Creating record',
  'Uploading file',
  'Reading blueprint',
  'Analyzing dimensions',
  'Calculating quantities',
  'Processing results',
  'Saving line items',
  'Complete',
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TakeoffPage() {
  const [takeoffs, setTakeoffs] = useState<Takeoff[]>([]);
  const [selectedTakeoff, setSelectedTakeoff] = useState<Takeoff | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [progress, setProgress] = useState({ pct: 0, message: '', step: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'divisions' | 'summary'>('divisions');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/takeoff/${id}`);
      const json = await res.json();
      if (json.data) setSelectedTakeoff(json.data);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadTakeoffs = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/takeoff?limit=30');
      const json = await res.json();
      const list: Takeoff[] = json.data || [];
      setTakeoffs(list);
      if (list.length > 0) {
        // Only auto-select if nothing selected yet
        setSelectedTakeoff(prev => {
          if (!prev) {
            loadDetail(list[0].id);
          }
          return prev;
        });
      }
    } finally {
      setLoadingList(false);
    }
  }, [loadDetail]);

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects/list');
      const json = await res.json();
      setProjects(json.projects || []);
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    loadTakeoffs();
    loadProjects();
  }, [loadTakeoffs]);

  // ── File handling ─────────────────────────────────────────────────────────
  function handleFile(file: File) {
    const valid = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/webp'];
    if (!valid.includes(file.type)) {
      setErrorMsg('Invalid file type. Accepted: PDF, PNG, JPG, TIFF, WebP');
      setPhase('error');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg('File too large. Maximum 50MB.');
      setPhase('error');
      return;
    }
    setPendingFile(file);
    setPhase('project-select');
  }

  function resetUpload() {
    setPhase('idle');
    setPendingFile(null);
    setSelectedProjectId('');
    setProgress({ pct: 0, message: '', step: 0 });
    setErrorMsg('');
  }

  // ── Upload + analyze flow ─────────────────────────────────────────────────
  async function startUpload(file: File, projectId: string) {
    setPhase('uploading');
    setProgress({ pct: 5, message: 'Creating takeoff record...', step: 1 });
    setErrorMsg('');

    try {
      // 1. Create takeoff record
      const createRes = await fetch('/api/takeoff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error || 'Failed to create takeoff');
      const takeoffId: string = createJson.data.id;

      // 2. Upload file
      setProgress({ pct: 20, message: 'Uploading blueprint...', step: 2 });
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch(`/api/takeoff/${takeoffId}/upload`, {
        method: 'POST',
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error || 'Upload failed');

      // 3. Analyze via SSE
      setPhase('analyzing');
      setProgress({ pct: 25, message: 'AI is reading your blueprint...', step: 3 });

      await new Promise<void>((resolve, reject) => {
        const evtSource = new EventSource(`/api/takeoff/${takeoffId}/analyze`);
        let sseResolved = false;

        evtSource.onmessage = (e) => {
          try {
            const evt = JSON.parse(e.data);
            if (evt.event === 'progress') {
              setProgress({ pct: evt.pct, message: evt.message, step: evt.step });
            } else if (evt.event === 'result') {
              // result means done — resolve here so reload happens immediately
              sseResolved = true;
              evtSource.close();
              resolve();
            } else if (evt.event === 'error') {
              sseResolved = true;
              evtSource.close();
              reject(new Error(evt.message));
            } else if (evt.event === 'done') {
              sseResolved = true;
              evtSource.close();
              resolve();
            }
          } catch {
            // ignore parse errors
          }
        };

        evtSource.onerror = () => {
          evtSource.close();
          // Natural SSE stream close fires onerror — only reject if we never got a result
          if (!sseResolved) {
            reject(new Error('Connection lost during analysis. Please try again.'));
          }
        };
      });

      // 4. Reload list and select new takeoff
      setPhase('done');
      setProgress({ pct: 100, message: 'Complete!', step: 8 });
      await loadTakeoffs();
      await loadDetail(takeoffId);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setErrorMsg(msg);
      setPhase('error');
    }
  }

  // ── Stats (from list) ─────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthComplete = takeoffs.filter(t => {
    if (t.status !== 'complete') return false;
    const d = new Date(t.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const completed = takeoffs.filter(t => t.status === 'complete');
  const avgConfidence = completed.length
    ? Math.round(completed.reduce((s, t) => s + (t.confidence || 0), 0) / completed.length)
    : 0;
  const totalBidValue = completed.reduce((s, t) => s + (t.total_cost || 0), 0);
  const totalBidStr = totalBidValue >= 1_000_000
    ? `$${(totalBidValue / 1_000_000).toFixed(1)}M`
    : totalBidValue >= 1000
    ? `$${Math.round(totalBidValue / 1000)}K`
    : fmt(totalBidValue);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <PageWrap>
      <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <SectionHeader
          title="AI Blueprint Takeoff"
          sub="Upload a blueprint for instant AI-powered material and cost estimation"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Badge label={`${takeoffs.length} Total`} color="muted" />
              <Badge label={`${completed.length} Complete`} color="green" />
            </div>
          }
        />

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard icon="📋" label="This Month" value={String(thisMonthComplete.length)} sub="completed takeoffs" />
          <StatCard icon="🎯" label="Avg Confidence" value={completed.length ? `${avgConfidence}%` : '—'} sub="across all analyses" />
          <StatCard icon="💰" label="Total Bid Value" value={completed.length ? totalBidStr : '—'} sub="sum of complete takeoffs" />
          <StatCard icon="⚡" label="Avg Processing" value="~47s" sub="per blueprint analysis" />
        </div>

        {/* Main 2-col layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

          {/* LEFT PANEL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Upload Card */}
            <Card>
              <CardHeader>
                <span style={{ fontSize: 16 }}>🏗️</span>
                <span style={{ fontWeight: 600, fontSize: 14, color: T.white }}>New Analysis</span>
              </CardHeader>
              <CardBody>
                {/* IDLE — drag drop zone */}
                {phase === 'idle' && (
                  <>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files[0];
                        if (f) handleFile(f);
                      }}
                      style={{
                        border: `2px dashed ${dragOver ? T.gold : T.border}`,
                        borderRadius: 10,
                        padding: '32px 16px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: dragOver ? T.goldDim : 'transparent',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📐</div>
                      <div style={{ color: T.white, fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
                        Drop blueprints here
                      </div>
                      <div style={{ color: T.muted, fontSize: 12, marginBottom: 14 }}>
                        or click to browse files
                      </div>
                      <div style={{ color: T.faint, fontSize: 11 }}>
                        PDF, PNG, JPG, TIFF, WebP · max 50MB
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp"
                      style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                  </>
                )}

                {/* PROJECT-SELECT */}
                {phase === 'project-select' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ color: T.muted, fontSize: 12 }}>
                      File: <span style={{ color: T.white, fontWeight: 500 }}>{pendingFile?.name}</span>
                    </div>
                    {projects.length === 0 ? (
                      <div style={{ color: T.amber, fontSize: 12, padding: '10px 0' }}>
                        No projects found. Create a project first.
                      </div>
                    ) : (
                      <select
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: 8,
                          background: T.surface2, border: `1px solid ${T.border}`,
                          color: selectedProjectId ? T.white : T.muted,
                          fontSize: 13, outline: 'none', cursor: 'pointer',
                        }}
                      >
                        <option value="" disabled>Select project…</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn variant="ghost" size="sm" onClick={resetUpload}>Cancel</Btn>
                      <Btn
                        size="sm"
                        disabled={!selectedProjectId || !pendingFile}
                        onClick={() => pendingFile && selectedProjectId && startUpload(pendingFile, selectedProjectId)}
                        style={{ flex: 1 }}
                      >
                        Start Analysis
                      </Btn>
                    </div>
                  </div>
                )}

                {/* UPLOADING */}
                {phase === 'uploading' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ color: T.muted, fontSize: 12 }}>{progress.message}</div>
                    <ProgressBar pct={progress.pct} />
                    <div style={{ color: T.muted, fontSize: 11 }}>{progress.pct}% complete</div>
                  </div>
                )}

                {/* ANALYZING */}
                {phase === 'analyzing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ color: T.white, fontSize: 13, fontWeight: 500 }}>{progress.message}</div>
                    <ProgressBar pct={progress.pct} color={T.blue} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      {STEPS.map((step, i) => {
                        const stepNum = i + 1;
                        const done = progress.step > stepNum;
                        const active = progress.step === stepNum;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700,
                              background: done ? T.greenDim : active ? T.blueDim : 'rgba(255,255,255,0.05)',
                              color: done ? T.green : active ? T.blue : T.faint,
                              border: `1px solid ${done ? 'rgba(34,197,94,0.3)' : active ? 'rgba(59,130,246,0.3)' : T.border}`,
                            }}>
                              {done ? '✓' : stepNum}
                            </span>
                            <span style={{
                              fontSize: 12,
                              color: done ? T.green : active ? T.white : T.faint,
                            }}>
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* DONE */}
                {phase === 'done' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: T.greenDim, border: `2px solid rgba(34,197,94,0.3)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22,
                    }}>✓</div>
                    <div>
                      <div style={{ color: T.white, fontWeight: 600, marginBottom: 4 }}>Analysis Complete</div>
                      {selectedTakeoff && (
                        <div style={{ color: T.muted, fontSize: 12 }}>
                          {selectedTakeoff.materials?.length || 0} line items extracted
                        </div>
                      )}
                    </div>
                    <Btn variant="ghost" size="sm" onClick={resetUpload} style={{ width: '100%' }}>
                      New Analysis
                    </Btn>
                  </div>
                )}

                {/* ERROR */}
                {phase === 'error' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{
                      background: T.redDim, border: `1px solid rgba(239,68,68,0.25)`,
                      borderRadius: 8, padding: '12px 14px', color: T.red, fontSize: 13,
                    }}>
                      {errorMsg || 'An error occurred. Please try again.'}
                    </div>
                    <Btn variant="ghost" size="sm" onClick={resetUpload}>Try Again</Btn>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Recent Takeoffs list */}
            <Card>
              <CardHeader>
                <span style={{ fontSize: 14 }}>📁</span>
                <span style={{ fontWeight: 600, fontSize: 14, color: T.white }}>Recent Analyses</span>
              </CardHeader>
              <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                {loadingList && (
                  <div style={{ padding: '24px 20px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
                    Loading…
                  </div>
                )}
                {!loadingList && takeoffs.length === 0 && (
                  <div style={{ padding: '24px 20px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
                    No takeoffs yet
                  </div>
                )}
                {takeoffs.map(t => {
                  const isSelected = selectedTakeoff?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => loadDetail(t.id)}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        background: isSelected ? T.goldDim : 'transparent',
                        borderLeft: `3px solid ${isSelected ? T.gold : 'transparent'}`,
                        borderBottom: `1px solid ${T.border}`,
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.project_name || t.name || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                            {fmtDate(t.created_at)} · #{t.id.slice(0, 8)}
                          </div>
                        </div>
                        <Badge label={t.status} color={statusColor(t.status)} />
                      </div>
                      {t.status === 'complete' && t.confidence > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <ProgressBar pct={t.confidence} color={T.green} height={3} />
                          <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{t.confidence}% confidence</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* RIGHT DETAIL PANEL */}
          <div>
            {loadingDetail && !selectedTakeoff && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: T.muted, fontSize: 14 }}>
                Loading takeoff…
              </div>
            )}

            {!loadingDetail && !selectedTakeoff && (
              <Card style={{ height: 400 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                  <div style={{ fontSize: 48 }}>📐</div>
                  <div style={{ color: T.white, fontWeight: 600, fontSize: 16 }}>No Takeoff Selected</div>
                  <div style={{ color: T.muted, fontSize: 13, textAlign: 'center', maxWidth: 260 }}>
                    Upload a blueprint to get an AI-powered material and cost estimate
                  </div>
                </div>
              </Card>
            )}

            {selectedTakeoff && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Detail header card */}
                <Card>
                  <CardBody>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.white }}>
                            {selectedTakeoff.project_name || selectedTakeoff.project_name_detected || 'Untitled Project'}
                          </h3>
                          <Badge label={selectedTakeoff.status} color={statusColor(selectedTakeoff.status)} />
                          {selectedTakeoff.building_type && (
                            <Badge label={selectedTakeoff.building_type} color="blue" />
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span style={{ color: T.muted, fontSize: 12 }}>ID: #{selectedTakeoff.id.slice(0, 8)}</span>
                          {selectedTakeoff.building_area > 0 && (
                            <span style={{ color: T.muted, fontSize: 12 }}>
                              {selectedTakeoff.building_area.toLocaleString()} SF
                            </span>
                          )}
                          {selectedTakeoff.floor_count > 0 && (
                            <span style={{ color: T.muted, fontSize: 12 }}>
                              {selectedTakeoff.floor_count} {selectedTakeoff.floor_count === 1 ? 'floor' : 'floors'}
                            </span>
                          )}
                          {selectedTakeoff.analyzed_at && (
                            <span style={{ color: T.muted, fontSize: 12 }}>
                              Analyzed {fmtDate(selectedTakeoff.analyzed_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Btn
                          variant="ghost"
                          size="sm"
                          onClick={() => exportCSV(selectedTakeoff)}
                          disabled={!selectedTakeoff.materials?.length}
                        >
                          Export CSV
                        </Btn>
                        <Btn variant="primary" size="sm" onClick={resetUpload}>
                          New Analysis
                        </Btn>
                      </div>
                    </div>

                    {/* Total cost + confidence */}
                    <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Project Cost</div>
                        <div style={{ fontSize: 36, fontWeight: 800, color: T.gold, letterSpacing: '-0.03em', lineHeight: 1 }}>
                          {fmt(selectedTakeoff.total_cost)}
                        </div>
                      </div>
                      {selectedTakeoff.confidence > 0 && (
                        <div style={{ paddingBottom: 4 }}>
                          <Badge
                            label={`${selectedTakeoff.confidence}% Confidence`}
                            color={confidenceColor(selectedTakeoff.confidence)}
                          />
                        </div>
                      )}
                      {selectedTakeoff.materials?.length ? (
                        <div style={{ paddingBottom: 4 }}>
                          <Badge label={`${selectedTakeoff.materials.length} Line Items`} color="muted" />
                        </div>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['divisions', 'summary'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                        background: activeTab === tab ? T.gold : T.surface,
                        color: activeTab === tab ? '#000' : T.muted,
                        transition: 'all 0.15s',
                      }}
                    >
                      {tab === 'divisions' ? 'CSI Line Items' : 'Summary'}
                    </button>
                  ))}
                </div>

                {/* CSI Line Items Tab */}
                {activeTab === 'divisions' && (
                  <Card>
                    {selectedTakeoff.materials?.length ? (
                      <div>
                        {groupByDivision(selectedTakeoff.materials).map(div => (
                          <div key={div.divCode}>
                            {/* Division header */}
                            <div style={{
                              padding: '10px 16px',
                              background: T.surface2,
                              borderBottom: `1px solid ${T.border}`,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: T.gold, letterSpacing: '0.04em' }}>
                                DIV {div.divCode} — {div.divName}
                              </span>
                              <div style={{ display: 'flex', gap: 16 }}>
                                <span style={{ fontSize: 12, color: T.muted }}>
                                  {div.totalLaborHours.toFixed(0)} hrs
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: T.white }}>
                                  {fmt(div.totalCost)}
                                </span>
                              </div>
                            </div>
                            {/* Items table */}
                            <Table
                              headers={['CSI Code', 'Description', 'Qty', 'Unit', '$/Unit', 'Total', 'Confidence']}
                              rows={div.items.map(m => [
                                <span key="code" style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{m.csi_code}</span>,
                                <span key="desc" style={{ fontSize: 13 }}>{m.description}</span>,
                                <span key="qty" style={{ color: T.white, fontWeight: 500 }}>{(m.quantity || 0).toLocaleString()}</span>,
                                <span key="unit" style={{ color: T.muted, fontSize: 12 }}>{m.unit}</span>,
                                <span key="uc" style={{ color: T.muted }}>{fmt(m.unit_cost)}</span>,
                                <span key="tc" style={{ color: T.white, fontWeight: 600 }}>{fmt(m.total_cost)}</span>,
                                <div key="conf" style={{ minWidth: 80 }}>
                                  <ProgressBar pct={selectedTakeoff.confidence} color={T.green} height={4} />
                                </div>,
                              ])}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <CardBody>
                        <div style={{ textAlign: 'center', color: T.muted, padding: '32px 0' }}>
                          {selectedTakeoff.status === 'analyzing' ? 'Analysis in progress…' : 'No line items available'}
                        </div>
                      </CardBody>
                    )}
                  </Card>
                )}

                {/* Summary Tab */}
                {activeTab === 'summary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Cost breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                      <StatCard
                        icon="🧱"
                        label="Material Cost"
                        value={fmt(selectedTakeoff.material_cost)}
                        sub="direct materials"
                      />
                      <StatCard
                        icon="👷"
                        label="Labor Cost"
                        value={fmt(selectedTakeoff.labor_cost)}
                        sub="all trades"
                      />
                      <StatCard
                        icon="📊"
                        label="Contingency"
                        value={`${selectedTakeoff.contingency_pct || 10}%`}
                        sub={fmt((selectedTakeoff.total_cost || 0) * ((selectedTakeoff.contingency_pct || 10) / 100))}
                      />
                      <StatCard
                        icon="📐"
                        label="Building Area"
                        value={selectedTakeoff.building_area > 0 ? `${selectedTakeoff.building_area.toLocaleString()} SF` : '—'}
                        sub={selectedTakeoff.floor_count > 0 ? `${selectedTakeoff.floor_count} floor${selectedTakeoff.floor_count !== 1 ? 's' : ''}` : undefined}
                      />
                    </div>

                    {/* AI Summary */}
                    {selectedTakeoff.summary && (
                      <Card>
                        <CardHeader>
                          <span>🤖</span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>AI Summary</span>
                        </CardHeader>
                        <CardBody>
                          <p style={{ margin: 0, color: T.muted, fontSize: 13, lineHeight: 1.7 }}>
                            {selectedTakeoff.summary}
                          </p>
                        </CardBody>
                      </Card>
                    )}

                    {/* Recommendations */}
                    {selectedTakeoff.recommendations?.length > 0 && (
                      <Card>
                        <CardHeader>
                          <span>💡</span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>Estimator Recommendations</span>
                        </CardHeader>
                        <CardBody>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {selectedTakeoff.recommendations.map((rec, i) => (
                              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <span style={{
                                  flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                                  background: T.goldDim, border: `1px solid ${T.borderGold}`,
                                  color: T.gold, fontSize: 11, fontWeight: 700,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {i + 1}
                                </span>
                                <span style={{ color: T.muted, fontSize: 13, lineHeight: 1.6 }}>{rec}</span>
                              </div>
                            ))}
                          </div>
                        </CardBody>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageWrap>
  );
}
