'use client';
/**
 * Saguaro Field — Drone Photo Analysis
 * Upload drone photos, run AI analysis for progress & safety.
 * Real API: /api/drone/upload, /api/drone/{jobId}/analyze
 */
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';

const BASE = '#F8F9FB';
const CARD = '#F8F9FB';
const CARD_GLASS = 'rgba(26,31,46,0.7)';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#EEF0F3';
const RADIUS = 16;

const glass: React.CSSProperties = {
  background: CARD_GLASS,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS,
};

interface DroneJob {
  id: string;
  project_id: string;
  photo_count: number;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  captured_date: string;
  created_at: string;
  progress_summary?: string;
  areas?: AreaResult[];
  safety_concerns?: SafetyConcern[];
}

interface AreaResult {
  id: string;
  name: string;
  status: string;
  percent_complete: number;
  ai_notes: string;
}

interface SafetyConcern {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string;
}

interface UploadedPhoto {
  file: File;
  preview: string;
  analyzed: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: GOLD, processing: BLUE, complete: GREEN, failed: RED,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: AMBER, medium: AMBER, high: RED, critical: RED,
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

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

type Tab = 'upload' | 'jobs';

function DronePage() {
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState<Tab>('upload');

  // Upload state
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [capturedDate, setCapturedDate] = useState(todayISO());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [currentResult, setCurrentResult] = useState<DroneJob | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Jobs state
  const [jobs, setJobs] = useState<DroneJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<DroneJob | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelections, setCompareSelections] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<{ job1: DroneJob; job2: DroneJob } | null>(null);

  useEffect(() => {
    const pid = localStorage.getItem('sag_active_project') || '';
    setProjectId(pid);
  }, []);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    if (!projectId) return;
    setJobsLoading(true);
    try {
      const res = await fetch(`/api/drone/upload?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || data.data || []);
      }
    } catch {
      // network error
    } finally {
      setJobsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) fetchJobs();
  }, [projectId, fetchJobs]);

  // Handle file selection
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const newPhotos: UploadedPhoto[] = [];
    const maxPhotos = 20 - photos.length;
    for (let i = 0; i < Math.min(files.length, maxPhotos); i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      newPhotos.push({
        file,
        preview: URL.createObjectURL(file),
        analyzed: false,
      });
    }
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return next;
    });
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  // Upload and analyze
  const handleStartAnalysis = async () => {
    if (photos.length === 0 || !projectId) return;
    setUploading(true);
    setUploadProgress('Uploading photos...');

    try {
      const formData = new FormData();
      formData.append('projectId', projectId);
      formData.append('captured_date', capturedDate);
      photos.forEach((p, i) => {
        formData.append(`photo_${i}`, p.file);
      });

      const uploadRes = await fetch('/api/drone/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();
      const jobId = uploadData.jobId || uploadData.id;

      setUploading(false);
      setAnalyzing(true);
      setAnalysisProgress('Starting AI analysis...');

      // Connect SSE for analysis progress
      const evtSource = new EventSource(`/api/drone/${jobId}/analyze`);
      let photosDone = 0;

      evtSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.photo_index !== undefined) {
            photosDone = msg.photo_index + 1;
            setAnalysisProgress(`Analyzing photo ${photosDone} of ${photos.length}...`);
            setPhotos(prev => prev.map((p, i) => i < photosDone ? { ...p, analyzed: true } : p));
          }
          if (msg.status === 'complete') {
            evtSource.close();
            setAnalyzing(false);
            setAnalysisProgress('');
            setCurrentResult(msg.result || msg);
            fetchJobs();
          }
          if (msg.status === 'failed') {
            evtSource.close();
            setAnalyzing(false);
            setAnalysisProgress('Analysis failed. Please try again.');
          }
          if (msg.progress) {
            setAnalysisProgress(`Analyzing... ${msg.progress}%`);
          }
        } catch {
          if (event.data && event.data !== '[DONE]') {
            setAnalysisProgress(event.data);
          }
        }
      };

      evtSource.onerror = () => {
        evtSource.close();
        setAnalyzing(false);
        setAnalysisProgress('');
        fetchJobs();
      };
    } catch {
      setUploading(false);
      setAnalyzing(false);
      setUploadProgress('Upload failed. Please try again.');
    }
  };

  // Reset upload state
  const resetUpload = () => {
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setCurrentResult(null);
    setAnalysisProgress('');
    setUploadProgress('');
    setCapturedDate(todayISO());
  };

  // Fetch job detail
  const handleSelectJob = async (job: DroneJob) => {
    try {
      const res = await fetch(`/api/drone/${job.id}/analyze?detail=true`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data.job || data);
      } else {
        setSelectedJob(job);
      }
    } catch {
      setSelectedJob(job);
    }
  };

  // Compare mode
  const toggleCompareSelection = (jobId: string) => {
    setCompareSelections(prev => {
      if (prev.includes(jobId)) return prev.filter(id => id !== jobId);
      if (prev.length >= 2) return [prev[1], jobId];
      return [...prev, jobId];
    });
  };

  const handleCompare = () => {
    if (compareSelections.length !== 2) return;
    const job1 = jobs.find(j => j.id === compareSelections[0]);
    const job2 = jobs.find(j => j.id === compareSelections[1]);
    if (job1 && job2) {
      setCompareData({ job1, job2 });
    }
  };

  // Render results panel (shared between upload result and job detail)
  const renderResults = (result: DroneJob) => (
    <>
      {/* Progress summary */}
      {result.progress_summary && (
        <div style={{ ...glass, padding: 14, marginBottom: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>AI Progress Summary</p>
          <p style={{ margin: 0, fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{result.progress_summary}</p>
        </div>
      )}

      {/* Area cards */}
      {result.areas && result.areas.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Areas</p>
          {result.areas.map(area => (
            <div key={area.id} style={{ ...glass, padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>{area.name}</h4>
                <span style={{
                  background: area.percent_complete >= 80 ? 'rgba(34,197,94,0.15)' : area.percent_complete >= 40 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                  color: area.percent_complete >= 80 ? GREEN : area.percent_complete >= 40 ? AMBER : RED,
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                }}>
                  {area.status}
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                  <span style={{ color: DIM }}>Completion</span>
                  <span style={{ color: TEXT, fontWeight: 700 }}>{area.percent_complete}%</span>
                </div>
                <div style={{ height: 6, background: '#EEF0F3', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${area.percent_complete}%`,
                    background: area.percent_complete >= 80 ? GREEN : area.percent_complete >= 40 ? AMBER : RED,
                    borderRadius: 3, transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
              {area.ai_notes && (
                <p style={{ margin: 0, fontSize: 12, color: DIM, lineHeight: 1.5 }}>{area.ai_notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Safety concerns */}
      {result.safety_concerns && result.safety_concerns.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Safety Concerns ({result.safety_concerns.length})
          </p>
          {result.safety_concerns.map(concern => (
            <div key={concern.id} style={{
              ...glass,
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.15)',
              padding: 14, marginBottom: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{
                  background: `rgba(${SEVERITY_COLORS[concern.severity] === RED ? '239,68,68' : '245,158,11'},0.2)`,
                  color: SEVERITY_COLORS[concern.severity],
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase',
                }}>
                  {concern.severity}
                </span>
                {concern.location && (
                  <span style={{ fontSize: 11, color: DIM }}>{concern.location}</span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{concern.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {!result.progress_summary && (!result.areas || result.areas.length === 0) && (
        <div style={{ ...glass, padding: 24, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: DIM }}>Analysis results will appear here once processing completes.</p>
        </div>
      )}
    </>
  );

  if (!projectId) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: DIM }}>
        <p style={{ fontSize: 14 }}>No project selected. Choose a project from the header.</p>
      </div>
    );
  }

  // Compare view
  if (compareData) {
    const { job1, job2 } = compareData;
    const allAreas = new Set<string>();
    (job1.areas || []).forEach(a => allAreas.add(a.name));
    (job2.areas || []).forEach(a => allAreas.add(a.name));

    return (
      <div style={{ padding: '12px 14px 100px', maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => { setCompareData(null); setCompareMode(false); setCompareSelections([]); }}
          style={{ background: 'none', border: 'none', color: GOLD, fontSize: 14, cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Jobs
        </button>

        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: TEXT }}>Job Comparison</h2>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: DIM }}>
          {job1.captured_date} vs {job2.captured_date}
        </p>

        {/* Area comparison cards */}
        {Array.from(allAreas).map(areaName => {
          const a1 = (job1.areas || []).find(a => a.name === areaName);
          const a2 = (job2.areas || []).find(a => a.name === areaName);
          const pct1 = a1?.percent_complete ?? 0;
          const pct2 = a2?.percent_complete ?? 0;
          const change = pct2 - pct1;

          return (
            <div key={areaName} style={{ ...glass, padding: 14, marginBottom: 8 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TEXT }}>{areaName}</h4>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {/* Job 1 */}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, color: DIM, fontWeight: 600 }}>{job1.captured_date}</p>
                  <div style={{ height: 6, background: '#EEF0F3', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct1}%`, background: 'rgba(59,130,246,0.5)', borderRadius: 3 }} />
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 700, color: BLUE }}>{pct1}%</p>
                </div>

                {/* Change arrow */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <div style={{
                    fontSize: 16, fontWeight: 800,
                    color: change > 0 ? GREEN : change < 0 ? RED : DIM,
                  }}>
                    {change > 0 ? '\u2191' : change < 0 ? '\u2193' : '\u2192'}
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 800,
                    color: change > 0 ? GREEN : change < 0 ? RED : DIM,
                  }}>
                    {change > 0 ? '+' : ''}{change}%
                  </div>
                </div>

                {/* Job 2 */}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, color: DIM, fontWeight: 600 }}>{job2.captured_date}</p>
                  <div style={{ height: 6, background: '#EEF0F3', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct2}%`, background: change >= 0 ? GREEN : RED, borderRadius: 3 }} />
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 700, color: change >= 0 ? GREEN : RED }}>{pct2}%</p>
                </div>
              </div>
            </div>
          );
        })}

        {allAreas.size === 0 && (
          <div style={{ ...glass, padding: 24, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, color: DIM }}>No area data available for comparison.</p>
          </div>
        )}
      </div>
    );
  }

  // Selected job detail view
  if (selectedJob) {
    return (
      <div style={{ padding: '12px 14px 100px', maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => setSelectedJob(null)}
          style={{ background: 'none', border: 'none', color: GOLD, fontSize: 14, cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Jobs
        </button>

        <div style={{ ...glass, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>Drone Analysis</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>{selectedJob.captured_date}</p>
            </div>
            <span style={{
              background: `rgba(${STATUS_COLORS[selectedJob.status] === GREEN ? '34,197,94' : STATUS_COLORS[selectedJob.status] === BLUE ? '59,130,246' : STATUS_COLORS[selectedJob.status] === RED ? '239,68,68' : '212,160,23'},0.15)`,
              color: STATUS_COLORS[selectedJob.status],
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            }}>
              {selectedJob.status.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: DIM }}>
            <span>{selectedJob.photo_count} photos</span>
            <span>{timeAgo(selectedJob.created_at)}</span>
          </div>
        </div>

        {renderResults(selectedJob)}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 14px 100px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900, color: TEXT }}>Drone Analysis</h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: DIM }}>AI-powered site progress & safety detection</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F8F9FB', borderRadius: 12, padding: 3 }}>
        {(['upload', 'jobs'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: tab === t ? 'rgba(212,160,23,0.15)' : 'transparent',
              color: tab === t ? GOLD : DIM,
              fontSize: 14, fontWeight: tab === t ? 700 : 500,
              transition: 'all 0.2s',
            }}>
            {t === 'upload' ? 'Upload' : `Jobs${jobs.length > 0 ? ` (${jobs.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── UPLOAD TAB ── */}
      {tab === 'upload' && (
        <>
          {/* Current results after analysis */}
          {currentResult && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>Analysis Results</h3>
                <button onClick={resetUpload}
                  style={{ background: '#EEF0F3', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '6px 14px', color: DIM, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  New Upload
                </button>
              </div>
              {renderResults(currentResult)}
            </>
          )}

          {/* Upload UI (hidden when showing results) */}
          {!currentResult && (
            <>
              {/* Drag and drop zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  ...glass,
                  padding: photos.length > 0 ? '16px' : '40px 20px',
                  marginBottom: 12,
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderStyle: 'dashed',
                  borderColor: dragActive ? GOLD : BORDER,
                  background: dragActive ? 'rgba(212,160,23,0.06)' : CARD_GLASS,
                  transition: 'all 0.2s',
                }}>
                {photos.length === 0 ? (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.4 }}>{'\uD83D\uDCF7'}</div>
                    <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT }}>Drop drone photos here</p>
                    <p style={{ margin: 0, fontSize: 12, color: DIM }}>or tap to select files (max 20 photos)</p>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: DIM }}>
                    Tap to add more photos ({photos.length}/20)
                  </p>
                )}
                <input ref={fileRef} type="file" multiple accept="image/*" onChange={e => addFiles(e.target.files)}
                  style={{ display: 'none' }} />
              </div>

              {/* Photo preview grid */}
              {photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
                  {photos.map((photo, idx) => (
                    <div key={idx} style={{ position: 'relative', paddingBottom: '100%', borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.preview} alt={photo.file.name}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      {/* Analyzed overlay */}
                      {photo.analyzed && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'rgba(34,197,94,0.3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                      {/* Remove button */}
                      {!uploading && !analyzing && (
                        <button onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                          style={{
                            position: 'absolute', top: 3, right: 3,
                            background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                            width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#fff', fontSize: 12, lineHeight: 1,
                          }}>
                          {'\u00D7'}
                        </button>
                      )}
                      {/* File info */}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                        padding: '12px 4px 3px', fontSize: 8, color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {formatBytes(photo.file.size)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Captured date */}
              {photos.length > 0 && (
                <div style={{ ...glass, padding: 14, marginBottom: 12 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Captured Date</p>
                  <input type="date" value={capturedDate} onChange={e => setCapturedDate(e.target.value)}
                    style={{
                      width: '100%', background: 'rgba(15,20,25,0.8)', border: `1px solid ${BORDER}`,
                      borderRadius: 10, padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none',
                      colorScheme: 'dark',
                    }} />
                </div>
              )}

              {/* Progress indicators */}
              {(uploading || analyzing) && (
                <div style={{ ...glass, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      border: `2px solid ${analyzing ? BLUE : GOLD}`,
                      borderTopColor: 'transparent',
                      animation: 'spin 1s linear infinite',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: analyzing ? BLUE : GOLD }}>
                      {uploading ? uploadProgress : analysisProgress}
                    </span>
                  </div>
                </div>
              )}

              {/* Start analysis button */}
              {photos.length > 0 && !uploading && !analyzing && (
                <button onClick={handleStartAnalysis}
                  style={{
                    width: '100%', padding: '16px 20px',
                    background: `linear-gradient(135deg, ${GOLD} 0%, #EF8C1A 100%)`,
                    border: 'none', borderRadius: RADIUS,
                    color: '#000', fontSize: 16, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                  Start AI Analysis ({photos.length} photos)
                </button>
              )}

              {/* Empty state when no photos and no current result */}
              {photos.length === 0 && !currentResult && (
                <div style={{ ...glass, padding: 24, textAlign: 'center', marginTop: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, color: DIM, lineHeight: 1.6 }}>
                    Upload drone photos to detect progress, identify safety hazards, and track site completion with AI
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── JOBS TAB ── */}
      {tab === 'jobs' && (
        <>
          {/* Compare mode toggle */}
          {jobs.filter(j => j.status === 'complete').length >= 2 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button onClick={() => { setCompareMode(!compareMode); setCompareSelections([]); }}
                style={{
                  background: compareMode ? 'rgba(59,130,246,0.15)' : '#F3F4F6',
                  border: `1px solid ${compareMode ? 'rgba(59,130,246,0.3)' : BORDER}`,
                  borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                  color: compareMode ? BLUE : DIM, cursor: 'pointer',
                }}>
                {compareMode ? 'Cancel Compare' : 'Compare Jobs'}
              </button>
            </div>
          )}

          {/* Compare action button */}
          {compareMode && compareSelections.length === 2 && (
            <button onClick={handleCompare}
              style={{
                width: '100%', padding: '12px 16px', marginBottom: 12,
                background: `linear-gradient(135deg, ${BLUE}, #1D4ED8)`,
                border: 'none', borderRadius: 12,
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
              Compare Selected Jobs
            </button>
          )}

          {/* Loading skeleton */}
          {jobsLoading && (
            <div>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ ...glass, padding: 16, marginBottom: 10 }}>
                  <div style={{ height: 16, width: '50%', background: '#EEF0F3', borderRadius: 8, marginBottom: 10 }} />
                  <div style={{ height: 12, width: '70%', background: '#F3F4F6', borderRadius: 6, marginBottom: 8 }} />
                  <div style={{ height: 10, width: '40%', background: '#F3F4F6', borderRadius: 5 }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!jobsLoading && jobs.length === 0 && (
            <div style={{ ...glass, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>{'\uD83D\uDEE9\uFE0F'}</div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: TEXT }}>No Drone Jobs Yet</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM, lineHeight: 1.5 }}>
                Upload drone photos to create your first AI analysis job
              </p>
              <button onClick={() => setTab('upload')}
                style={{
                  background: `linear-gradient(135deg, ${GOLD} 0%, #EF8C1A 100%)`,
                  border: 'none', borderRadius: 12, padding: '12px 24px',
                  color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                }}>
                Upload Photos
              </button>
            </div>
          )}

          {/* Job cards */}
          {!jobsLoading && jobs.map(job => {
            const isSelected = compareSelections.includes(job.id);
            return (
              <div key={job.id}
                onClick={() => compareMode ? toggleCompareSelection(job.id) : handleSelectJob(job)}
                style={{
                  ...glass, padding: 14, marginBottom: 10, cursor: 'pointer',
                  borderColor: isSelected ? BLUE : BORDER,
                  background: isSelected ? 'rgba(59,130,246,0.08)' : CARD_GLASS,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {compareMode && (
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        border: `2px solid ${isSelected ? BLUE : '#D1D5DB'}`,
                        background: isSelected ? BLUE : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </div>
                    )}
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>
                        {job.captured_date}
                      </h3>
                      {job.progress_summary && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: DIM, lineHeight: 1.4,
                          overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {job.progress_summary}
                        </p>
                      )}
                    </div>
                  </div>
                  <span style={{
                    background: `rgba(${STATUS_COLORS[job.status] === GREEN ? '34,197,94' : STATUS_COLORS[job.status] === BLUE ? '59,130,246' : STATUS_COLORS[job.status] === RED ? '239,68,68' : '212,160,23'},0.15)`,
                    color: STATUS_COLORS[job.status],
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0,
                  }}>
                    {job.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: DIM }}>
                  <span>{job.photo_count} photos</span>
                  <span>{timeAgo(job.created_at)}</span>
                  {job.areas && <span>{job.areas.length} areas</span>}
                  {job.safety_concerns && job.safety_concerns.length > 0 && (
                    <span style={{ color: RED }}>{job.safety_concerns.length} concerns</span>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '12px 14px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ height: 22, width: '50%', background: '#EEF0F3', borderRadius: 8, marginBottom: 16 }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          background: CARD_GLASS, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 16, marginBottom: 10,
        }}>
          <div style={{ height: 16, width: '50%', background: '#EEF0F3', borderRadius: 8, marginBottom: 10 }} />
          <div style={{ height: 12, width: '70%', background: '#F3F4F6', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export default function DronePageWrapper() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DronePage />
    </Suspense>
  );
}
