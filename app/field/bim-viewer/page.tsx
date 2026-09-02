'use client';
/**
 * Saguaro Control Systems — 3D BIM Model Viewer
 * Upload IFC/RVT/GLB/glTF/OBJ models, render real interactive 3D (three.js),
 * analyze elements, browse by type.
 * Real API data from /api/bim/upload and /api/bim/[id].
 */
import React, { useState, useEffect, Suspense, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Cube, ArrowsOutCardinal } from '@phosphor-icons/react';

// three.js viewer is client-only; dynamic import with ssr:false keeps it out of
// the server bundle and avoids any SSR access to window/document.
const ModelCanvas = dynamic(() => import('./ModelCanvas'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 13 }}>
      Loading 3D viewer…
    </div>
  ),
});

// Formats the three.js viewer can render directly today.
const RENDERABLE_FORMATS = ['glb', 'gltf', 'obj'];

function extOf(model: { file_type?: string; file_name?: string; name?: string }): string {
  if (model.file_type) return model.file_type.toLowerCase();
  const src = model.file_name || model.name || '';
  return (src.split('.').pop() || '').toLowerCase();
}

const BASE = '#0a0a0a';
const CARD = '#141416';
const CARD_GLASS = 'rgba(20,20,22,0.7)';
const GOLD = '#F59E0B';
const GREEN = '#34C759';
const BLUE = '#F59E0B';
const RED = '#FF3B30';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';
const BORDER = 'rgba(255,255,255,0.12)';
const RADIUS = 16;

const glass: React.CSSProperties = {
  background: CARD_GLASS,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS,
};

interface BimModel {
  id: string;
  name: string;
  file_name: string;
  file_type?: string;
  file_size: number;
  status: 'pending' | 'processing' | 'complete' | 'failed' | 'preview_only';
  element_count: number;
  error_message?: string | null;
  uploaded_at: string;
  storage_path?: string | null;
  file_url?: string | null;
  elements?: BimElement[];
}

interface BimElement {
  id: string;
  type: string;
  name: string;
  properties?: Record<string, string>;
  dimensions?: string;
  material?: string;
  linked_submittal?: string;
}

const ELEMENT_TYPES = ['Walls', 'Doors', 'Windows', 'MEP', 'Structural', 'Floors', 'Roofs', 'Furniture', 'Other'] as const;

const TYPE_ICONS: Record<string, string> = {
  Walls: '\u2588', Doors: '\uD83D\uDEAA', Windows: '\u2B1C', MEP: '\u2699\uFE0F',
  Structural: '\uD83C\uDFD7\uFE0F', Floors: '\u2B1B', Roofs: '\u25B3', Furniture: '\uD83E\uDE91', Other: '\u25CF',
};

const STATUS_COLORS: Record<string, string> = {
  pending: GOLD, processing: BLUE, complete: GREEN, failed: RED, preview_only: BLUE,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function BimViewerPage() {
  const [projectId, setProjectId] = useState('');
  const [models, setModels] = useState<BimModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedModel, setSelectedModel] = useState<BimModel | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(ELEMENT_TYPES));
  const [expandedElement, setExpandedElement] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Load project from localStorage
  useEffect(() => {
    const pid = localStorage.getItem('sag_active_project') || '';
    setProjectId(pid);
  }, []);

  // Fetch models
  const fetchModels = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bim/upload?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || data.data || []);
      }
    } catch {
      // network error
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) fetchModels();
  }, [projectId, fetchModels]);

  // Upload handler
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable) {
          setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error('Upload failed'));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('POST', '/api/bim/upload');
        xhr.send(formData);
      });

      await fetchModels();
    } catch {
      // upload error
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Analyze model (SSE)
  const handleAnalyze = async (model: BimModel) => {
    setAnalyzing(true);
    setAnalyzeProgress('Starting analysis...');
    try {
      const res = await fetch(`/api/bim/${model.id}/convert`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start analysis');

      const data = await res.json();
      const jobId = data.jobId || data.id || model.id;

      // Try SSE for progress
      const evtSource = new EventSource(`/api/bim/${jobId}/convert?stream=true`);
      evtSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.progress) setAnalyzeProgress(`Analyzing... ${msg.progress}%`);
          if (msg.status === 'complete') {
            evtSource.close();
            setAnalyzing(false);
            setAnalyzeProgress('');
            fetchModels();
          }
          if (msg.status === 'failed') {
            evtSource.close();
            setAnalyzing(false);
            setAnalyzeProgress('Analysis failed');
          }
        } catch {
          setAnalyzeProgress(event.data);
        }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setAnalyzing(false);
        setAnalyzeProgress('');
        fetchModels();
      };
    } catch {
      setAnalyzing(false);
      setAnalyzeProgress('Failed to start analysis');
    }
  };

  // Fetch model detail — always, so we get a fresh signed file_url for the 3D
  // viewer (the model file exists from upload time, regardless of analysis status).
  const handleSelectModel = async (model: BimModel) => {
    setSelectedModel(model); // optimistic: show immediately
    try {
      const res = await fetch(`/api/bim/${model.id}`);
      if (res.ok) {
        const data = await res.json();
        const detail = data.model || data;
        setSelectedModel({ ...model, ...detail });
      }
    } catch {
      // keep optimistic row on network error
    }
  };

  // Group elements by type
  const groupedElements = (selectedModel?.elements || []).reduce<Record<string, BimElement[]>>((acc, el) => {
    const type = el.type || 'Other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(el);
    return acc;
  }, {});

  // Type counts for stats
  const typeCounts = Object.entries(groupedElements).map(([type, els]) => ({
    type,
    count: els.length,
  }));

  const totalElements = selectedModel?.element_count || (selectedModel?.elements?.length ?? 0);

  // Toggle layer
  const toggleType = (type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (!projectId) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: DIM }}>
        <p style={{ fontSize: 14 }}>No project selected. Choose a project from the header.</p>
      </div>
    );
  }

  // Detail view for selected model
  if (selectedModel) {
    return (
      <div style={{ padding: '12px 14px 100px', maxWidth: 480, margin: '0 auto' }}>
        {/* Back button */}
        <button onClick={() => { setSelectedModel(null); setExpandedElement(null); }}
          style={{ background: 'none', border: 'none', color: GOLD, fontSize: 14, cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Models
        </button>

        {/* Model header */}
        <div style={{ ...glass, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>{selectedModel.name || selectedModel.file_name}</h2>
            <span style={{
              background: `rgba(${STATUS_COLORS[selectedModel.status] === GREEN ? '34,197,94' : STATUS_COLORS[selectedModel.status] === BLUE ? '59,130,246' : STATUS_COLORS[selectedModel.status] === RED ? '239,68,68' : '245, 158, 11'},0.15)`,
              color: STATUS_COLORS[selectedModel.status],
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              border: `1px solid ${STATUS_COLORS[selectedModel.status]}33`,
            }}>
              {selectedModel.status.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: DIM }}>
            <span>{formatBytes(selectedModel.file_size)}</span>
            <span>{totalElements} elements</span>
            <span>{timeAgo(selectedModel.uploaded_at)}</span>
          </div>
        </div>

        {/* Real interactive 3D viewer — the model file exists from upload time,
            so render it for every status (not gated behind AI analysis). */}
        {RENDERABLE_FORMATS.includes(extOf(selectedModel)) ? (
          <div style={{ ...glass, overflow: 'hidden', marginBottom: 12 }}>
            <ModelCanvas
              url={selectedModel.file_url || ''}
              fileType={extOf(selectedModel)}
              height={340}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderTop: `1px solid ${BORDER}`, color: DIM, fontSize: 11 }}>
              <ArrowsOutCardinal size={15} color={GOLD} weight="bold" />
              <span>Drag to orbit · scroll to zoom · right-drag to pan</span>
            </div>
          </div>
        ) : (
          <div style={{ ...glass, padding: 20, marginBottom: 12, textAlign: 'center' }}>
            <Cube size={34} color={GOLD} weight="duotone" style={{ marginBottom: 8 }} />
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: TEXT }}>
              Interactive 3D preview: GLB, glTF & OBJ
            </p>
            <p style={{ margin: 0, fontSize: 12, color: DIM, lineHeight: 1.5 }}>
              {`.${extOf(selectedModel) || 'this'} files (IFC / Revit) are analyzed below; native 3D rendering for this format is on the roadmap. Export to GLB to view in 3D now.`}
            </p>
          </div>
        )}

        {/* Honest preview-only notice: format the AI cannot parse for elements.
            No fabricated element list is shown — the 3D preview above is the deliverable. */}
        {(selectedModel.status === 'preview_only' ||
          (selectedModel.status === 'complete' && !!selectedModel.error_message && totalElements === 0)) && (
          <div style={{ ...glass, padding: 16, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Cube size={22} color={BLUE} weight="duotone" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: TEXT }}>3D preview only</p>
              <p style={{ margin: 0, fontSize: 12, color: DIM, lineHeight: 1.5 }}>
                {selectedModel.error_message ||
                  'Automated element analysis is available for IFC / STEP files. This format supports 3D preview only.'}
              </p>
            </div>
          </div>
        )}

        {/* Analyze button for pending */}
        {selectedModel.status === 'pending' && (
          <button onClick={() => handleAnalyze(selectedModel)} disabled={analyzing}
            style={{
              width: '100%', padding: '14px 20px', marginBottom: 12,
              background: analyzing ? 'rgba(245,158,11,0.15)' : `linear-gradient(135deg, ${GOLD} 0%, #EF8C1A 100%)`,
              border: analyzing ? `1px solid ${BLUE}33` : 'none',
              borderRadius: RADIUS, color: analyzing ? BLUE : '#000',
              fontSize: 15, fontWeight: 800, cursor: analyzing ? 'default' : 'pointer',
            }}>
            {analyzing ? analyzeProgress || 'Analyzing...' : 'Analyze Model'}
          </button>
        )}

        {/* Element analysis for completed models */}
        {selectedModel.status === 'complete' && (
          <>
            {/* Stats bar */}
            <div style={{ ...glass, padding: '12px 16px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ background: 'rgba(245, 158, 11,0.1)', borderRadius: 10, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: DIM }}>Total</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>{totalElements}</span>
              </div>
              {typeCounts.map(({ type, count }) => (
                <div key={type} style={{
                  background: visibleTypes.has(type) ? 'rgba(245,158,11,0.1)' : 'rgba(0,0,0,0.03)',
                  borderRadius: 10, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4,
                  opacity: visibleTypes.has(type) ? 1 : 0.4,
                }}>
                  <span style={{ fontSize: 10 }}>{TYPE_ICONS[type] || '\u25CF'}</span>
                  <span style={{ fontSize: 11, color: DIM }}>{type}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{count}</span>
                </div>
              ))}
            </div>

            {/* Layer toggles */}
            <div style={{ ...glass, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Layer Toggles</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.keys(groupedElements).map(type => (
                  <label key={type} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: visibleTypes.has(type) ? 'rgba(245,158,11,0.12)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${visibleTypes.has(type) ? 'rgba(245,158,11,0.3)' : BORDER}`,
                    borderRadius: 10, padding: '6px 12px', cursor: 'pointer',
                    fontSize: 12, color: visibleTypes.has(type) ? BLUE : DIM,
                  }}>
                    <input type="checkbox" checked={visibleTypes.has(type)} onChange={() => toggleType(type)}
                      style={{ accentColor: BLUE, width: 14, height: 14 }} />
                    <span style={{ fontWeight: 600 }}>{type}</span>
                    <span style={{ fontSize: 10, opacity: 0.6 }}>({groupedElements[type].length})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Element list grouped by type */}
            {Object.entries(groupedElements).filter(([type]) => visibleTypes.has(type)).map(([type, elements]) => (
              <div key={type} style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{TYPE_ICONS[type] || '\u25CF'}</span>
                  {type} ({elements.length})
                </p>
                {elements.map(el => (
                  <div key={el.id} style={{ ...glass, padding: 12, marginBottom: 6, cursor: 'pointer' }}
                    onClick={() => setExpandedElement(expandedElement === el.id ? null : el.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{el.name}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="2"
                        style={{ transform: expandedElement === el.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    {expandedElement === el.id && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                        {el.dimensions && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                            <span style={{ color: DIM }}>Dimensions</span>
                            <span style={{ color: TEXT, fontWeight: 600 }}>{el.dimensions}</span>
                          </div>
                        )}
                        {el.material && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                            <span style={{ color: DIM }}>Material</span>
                            <span style={{ color: TEXT, fontWeight: 600 }}>{el.material}</span>
                          </div>
                        )}
                        {el.linked_submittal && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                            <span style={{ color: DIM }}>Linked Submittal</span>
                            <span style={{ color: BLUE, fontWeight: 600 }}>{el.linked_submittal}</span>
                          </div>
                        )}
                        {el.properties && Object.entries(el.properties).map(([key, val]) => (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                            <span style={{ color: DIM }}>{key}</span>
                            <span style={{ color: TEXT }}>{val}</span>
                          </div>
                        ))}
                        {!el.dimensions && !el.material && !el.properties && (
                          <p style={{ margin: 0, fontSize: 12, color: DIM, fontStyle: 'italic' }}>No additional properties available</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {Object.keys(groupedElements).length === 0 && (
              <div style={{ ...glass, padding: 24, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 14, color: DIM }}>No element data available for this model.</p>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(110,110,115,0.7)' }}>Element data will appear after model analysis completes.</p>
              </div>
            )}
          </>
        )}

        {/* Processing / failed states */}
        {selectedModel.status === 'processing' && (
          <div style={{ ...glass, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12, animation: 'spin 2s linear infinite' }}>{'\u2699\uFE0F'}</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: BLUE }}>Processing Model...</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: DIM }}>This may take a few minutes for large files</p>
          </div>
        )}

        {selectedModel.status === 'failed' && (
          <div style={{ ...glass, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{'\u274C'}</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: RED }}>Analysis Failed</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: DIM }}>Try re-uploading the model or contact support</p>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Model list view
  return (
    <div style={{ padding: '12px 14px 100px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: TEXT }}>BIM Viewer</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>3D model management & analysis</p>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{
            background: `linear-gradient(135deg, ${GOLD} 0%, #EF8C1A 100%)`,
            border: 'none', borderRadius: 12, padding: '10px 16px',
            color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: uploading ? 0.6 : 1,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Model
        </button>
        <input ref={fileRef} type="file" accept=".ifc,.rvt,.glb,.gltf,.obj" onChange={handleUpload} style={{ display: 'none' }} />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div style={{ ...glass, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: TEXT, fontWeight: 600 }}>Uploading model...</span>
            <span style={{ color: GOLD, fontWeight: 700 }}>{uploadProgress}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${uploadProgress}%`, background: `linear-gradient(90deg, ${GOLD}, #EF8C1A)`, borderRadius: 3, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ ...glass, padding: 16, marginBottom: 10 }}>
              <div style={{ height: 16, width: '60%', background: 'rgba(0,0,0,0.06)', borderRadius: 8, marginBottom: 10 }} />
              <div style={{ height: 12, width: '40%', background: 'rgba(0,0,0,0.04)', borderRadius: 6, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ height: 10, width: 50, background: 'rgba(0,0,0,0.04)', borderRadius: 5 }} />
                <div style={{ height: 10, width: 60, background: 'rgba(0,0,0,0.04)', borderRadius: 5 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && models.length === 0 && (
        <div style={{ ...glass, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>{'\uD83C\uDFD7\uFE0F'}</div>
          <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: TEXT }}>No BIM Models Yet</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM, lineHeight: 1.5 }}>
            Upload GLB, glTF or OBJ to view in interactive 3D, or IFC / Revit to analyze building elements
          </p>
          <button onClick={() => fileRef.current?.click()}
            style={{
              background: `linear-gradient(135deg, ${GOLD} 0%, #EF8C1A 100%)`,
              border: 'none', borderRadius: 12, padding: '12px 24px',
              color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            }}>
            Upload Your First Model
          </button>
        </div>
      )}

      {/* Model cards */}
      {!loading && models.map(model => (
        <div key={model.id} style={{ ...glass, padding: 14, marginBottom: 10, cursor: 'pointer' }}
          onClick={() => handleSelectModel(model)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {model.name || model.file_name}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: DIM }}>{model.file_name}</p>
            </div>
            <span style={{
              background: `rgba(${STATUS_COLORS[model.status] === GREEN ? '34,197,94' : STATUS_COLORS[model.status] === BLUE ? '59,130,246' : STATUS_COLORS[model.status] === RED ? '239,68,68' : '245, 158, 11'},0.15)`,
              color: STATUS_COLORS[model.status],
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0,
              border: `1px solid ${STATUS_COLORS[model.status]}33`,
            }}>
              {model.status.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: DIM }}>
            {model.element_count > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                {model.element_count} elements
              </span>
            )}
            <span>{formatBytes(model.file_size)}</span>
            <span>{timeAgo(model.uploaded_at)}</span>
          </div>
          {model.status === 'pending' && (
            <button onClick={(e) => { e.stopPropagation(); handleAnalyze(model); }} disabled={analyzing}
              style={{
                marginTop: 10, width: '100%', padding: '9px 14px',
                background: 'rgba(245,158,11,0.12)', border: `1px solid rgba(245,158,11,0.25)`,
                borderRadius: 10, color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
              {analyzing ? (analyzeProgress || 'Analyzing...') : 'Analyze Model'}
            </button>
          )}
        </div>
      ))}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '12px 14px', maxWidth: 480, margin: '0 auto' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          background: CARD_GLASS,
          border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 16, marginBottom: 10,
        }}>
          <div style={{ height: 16, width: '60%', background: 'rgba(0,0,0,0.06)', borderRadius: 8, marginBottom: 10 }} />
          <div style={{ height: 12, width: '40%', background: 'rgba(0,0,0,0.04)', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export default function BimViewerPageWrapper() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <BimViewerPage />
    </Suspense>
  );
}
