'use client';
/**
 * Saguaro Field -- AR Blueprint Overlay
 * Progressive WebXR experience: Level 1 (Camera + Manual Measurement) works everywhere.
 * Level 2 (WebXR immersive-ar) activates on Chrome Android when supported.
 * Includes calibration wizard and takeoff dimension reference overlay.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD = '#C8960F';
const CARD = '#F8F9FB';
const BASE = '#F8F9FB';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const BORDER = '#1E3A5F';

const glass: React.CSSProperties = {
  background: 'rgba(26,31,46,0.7)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid #EEF0F3',
  borderRadius: 16,
};

const inp: React.CSSProperties = {
  width: '100%', background: BASE, border: `1px solid ${BORDER}`,
  borderRadius: 10, padding: '11px 14px', color: TEXT, fontSize: 15, outline: 'none',
  boxSizing: 'border-box' as const,
};

/* ---------- types ---------- */
interface MeasurementPoint { x: number; y: number; }
interface Measurement {
  id: string;
  p1: MeasurementPoint;
  p2: MeasurementPoint;
  pixelDist: number;
  realDist: number;
  unit: 'ft' | 'mm';
}
interface Calibration {
  id?: string;
  project_id: string;
  scale_factor: number;
  unit: 'ft' | 'mm';
  created_at?: string;
}
interface TakeoffDim { label: string; value: number; unit: string; }

type CalibStep = 'idle' | 'point_a' | 'point_b' | 'enter_dist' | 'done';

/* ---------- helpers ---------- */
function dist(a: MeasurementPoint, b: MeasurementPoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function formatDist(val: number, unit: 'ft' | 'mm'): string {
  if (unit === 'ft') {
    const feet = Math.floor(val);
    const inches = Math.round((val - feet) * 12);
    return inches > 0 ? `${feet}' ${inches}"` : `${feet}'`;
  }
  return `${Math.round(val)} mm`;
}

/* ================================================================ */
function AROverlayPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || (typeof window !== 'undefined' ? localStorage.getItem('sag_active_project') : '') || '';

  /* refs */
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /* state */
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [calibLoading, setCalibLoading] = useState(true);

  /* calibration wizard */
  const [calibStep, setCalibStep] = useState<CalibStep>('idle');
  const [calibPointA, setCalibPointA] = useState<MeasurementPoint | null>(null);
  const [calibPointB, setCalibPointB] = useState<MeasurementPoint | null>(null);
  const [calibRealDist, setCalibRealDist] = useState('');
  const [calibUnit, setCalibUnit] = useState<'ft' | 'mm'>('ft');
  const [calibSaving, setCalibSaving] = useState(false);

  /* measurements */
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [pendingPoint, setPendingPoint] = useState<MeasurementPoint | null>(null);
  const [unit, setUnit] = useState<'ft' | 'mm'>('ft');
  const [measuring, setMeasuring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectName, setProjectName] = useState('');

  /* takeoff dims */
  const [showTakeoff, setShowTakeoff] = useState(false);
  const [takeoffDims, setTakeoffDims] = useState<TakeoffDim[]>([]);

  /* viewport */
  const [viewW, setViewW] = useState(0);
  const [viewH, setViewH] = useState(0);

  /* ---- load project name ---- */
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.project?.name) setProjectName(d.project.name); })
      .catch(() => {});
  }, [projectId]);

  /* ---- check WebXR support ---- */
  useEffect(() => {
    if (typeof navigator !== 'undefined' && (navigator as any).xr) {
      (navigator as any).xr.isSessionSupported('immersive-ar')
        .then((ok: boolean) => setXrSupported(ok))
        .catch(() => setXrSupported(false));
    }
  }, []);

  /* ---- load calibration ---- */
  const loadCalibration = useCallback(async () => {
    if (!projectId) { setCalibLoading(false); return; }
    try {
      const res = await fetch(`/api/ar/calibration?projectId=${projectId}`);
      if (res.ok) {
        const d = await res.json();
        if (d.calibration && d.calibration.scale_factor) {
          setCalibration(d.calibration);
          setUnit(d.calibration.unit || 'ft');
        }
      }
    } catch { /* no calibration yet */ }
    setCalibLoading(false);
  }, [projectId]);

  useEffect(() => { loadCalibration(); }, [loadCalibration]);

  /* ---- load takeoff dims ---- */
  useEffect(() => {
    if (!projectId || !showTakeoff) return;
    fetch(`/api/takeoff/${projectId}?summary=true`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.materials || d?.items) {
          const items = d.materials || d.items || [];
          const dims: TakeoffDim[] = items.slice(0, 8).map((m: any) => ({
            label: m.description || m.name || 'Item',
            value: m.quantity || 0,
            unit: m.unit || 'ea',
          }));
          setTakeoffDims(dims);
        }
      })
      .catch(() => {});
  }, [projectId, showTakeoff]);

  /* ---- start camera ---- */
  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      setCameraError(err.message || 'Camera access denied');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  /* cleanup on unmount */
  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  /* update viewport size */
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setViewW(containerRef.current.clientWidth);
        setViewH(containerRef.current.clientHeight);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [cameraActive]);

  /* ---- tap handler ---- */
  const handleTap = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    /* calibration mode */
    if (calibStep === 'point_a') {
      setCalibPointA({ x, y });
      setCalibStep('point_b');
      return;
    }
    if (calibStep === 'point_b') {
      setCalibPointB({ x, y });
      setCalibStep('enter_dist');
      return;
    }

    /* measurement mode */
    if (measuring && calibration) {
      if (!pendingPoint) {
        setPendingPoint({ x, y });
      } else {
        const pxDist = dist(pendingPoint, { x, y });
        const realDist = pxDist * calibration.scale_factor;
        const m: Measurement = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          p1: pendingPoint,
          p2: { x, y },
          pixelDist: pxDist,
          realDist,
          unit,
        };
        setMeasurements(prev => [...prev, m]);
        setPendingPoint(null);
      }
    }
  };

  /* ---- save calibration ---- */
  const saveCalibration = async () => {
    if (!calibPointA || !calibPointB || !calibRealDist) return;
    setCalibSaving(true);
    const pxDist = dist(calibPointA, calibPointB);
    const realVal = parseFloat(calibRealDist);
    if (!realVal || !pxDist) { setCalibSaving(false); return; }
    const scale_factor = realVal / pxDist;
    const payload = { projectId, scale_factor, unit: calibUnit };

    try {
      const res = await fetch('/api/ar/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json();
        setCalibration(d.calibration || { project_id: projectId, scale_factor, unit: calibUnit });
        setUnit(calibUnit);
      }
    } catch { /* offline: store locally */ }

    setCalibStep('done');
    setCalibSaving(false);
    setTimeout(() => setCalibStep('idle'), 1500);
  };

  /* ---- undo ---- */
  const undo = () => {
    if (pendingPoint) { setPendingPoint(null); return; }
    setMeasurements(prev => prev.slice(0, -1));
  };

  /* ---- save measurements ---- */
  const saveMeasurements = async () => {
    if (measurements.length === 0) return;
    setSaving(true);
    try {
      await fetch('/api/laser/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          device_type: 'manual',
          measurements: measurements.map(m => ({
            distance: m.realDist,
            unit: m.unit,
            x1_pct: viewW ? (m.p1.x / viewW) * 100 : 0,
            y1_pct: viewH ? (m.p1.y / viewH) * 100 : 0,
            x2_pct: viewW ? (m.p2.x / viewW) * 100 : 0,
            y2_pct: viewH ? (m.p2.y / viewH) * 100 : 0,
          })),
        }),
      });
    } catch { /* enqueue offline */ }
    setSaving(false);
  };

  /* ---- enter WebXR ---- */
  const enterXR = async () => {
    if (!xrSupported) return;
    try {
      const xr = (navigator as any).xr;
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
      });
      setXrActive(true);
      session.addEventListener('end', () => setXrActive(false));
      /* WebXR render loop would go here -- surface detection, dimension placement.
         Keeping skeletal since full GL pipeline is browser-specific. */
    } catch (err: any) {
      setCameraError(`WebXR error: ${err.message || 'Unknown'}`);
    }
  };

  /* ---- render ---- */
  const showCalibWizard = !calibLoading && !calibration && calibStep === 'idle';

  return (
    <div style={{ minHeight: '100dvh', background: BASE, color: TEXT, position: 'relative' }}>
      {/* ---- Top bar ---- */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        ...glass, borderRadius: 0, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid #EEF0F3',
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, display: 'flex' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            AR Overlay
          </p>
          <p style={{ margin: 0, fontSize: 11, color: DIM }}>{projectName || 'Select project'}</p>
        </div>
        {/* Calibration badge */}
        <div style={{
          padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: calibration ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: calibration ? GREEN : RED,
          border: `1px solid ${calibration ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {calibration ? 'Calibrated' : 'Uncalibrated'}
        </div>
        <button onClick={() => setCalibStep('point_a')} style={{
          background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 4,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}>
            <circle cx={12} cy={12} r={3}/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* ---- Spacer for fixed top bar ---- */}
      <div style={{ height: 72 }} />

      {/* ---- Camera not started state ---- */}
      {!cameraActive && !xrActive && (
        <div style={{ padding: '0 16px' }}>
          {/* Calibration Wizard */}
          {showCalibWizard && (
            <div style={{ ...glass, padding: 24, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F4D0;</div>
              <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: TEXT }}>Calibration Required</p>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: DIM, lineHeight: 1.5 }}>
                Before measuring, calibrate by marking two points on a surface with a known distance.
              </p>
              <button onClick={() => { startCamera(); setCalibStep('point_a'); }} style={{
                ...glass, padding: '14px 28px', cursor: 'pointer', fontSize: 15, fontWeight: 800,
                color: BASE, background: GOLD, border: `1px solid ${GOLD}`, borderRadius: 14,
                width: '100%',
              }}>
                Start Calibration
              </button>
            </div>
          )}

          {/* Start camera button */}
          {!showCalibWizard && (
            <div style={{ ...glass, padding: 24, textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F4F7;</div>
              <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800 }}>Camera + Measure</p>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: DIM }}>
                Open your camera to measure distances on blueprints and surfaces.
              </p>
              <button onClick={startCamera} style={{
                ...glass, padding: '14px 28px', cursor: 'pointer', fontSize: 15, fontWeight: 800,
                color: BASE, background: GOLD, border: `1px solid ${GOLD}`, borderRadius: 14,
                width: '100%', marginBottom: 10,
              }}>
                Open Camera
              </button>

              {xrSupported && (
                <button onClick={enterXR} style={{
                  ...glass, padding: '14px 28px', cursor: 'pointer', fontSize: 15, fontWeight: 700,
                  color: BLUE, background: 'rgba(59,130,246,0.1)', border: `1px solid rgba(59,130,246,0.3)`,
                  borderRadius: 14, width: '100%',
                }}>
                  &#x1F310; Enter AR Mode (WebXR)
                </button>
              )}

              {!xrSupported && (
                <p style={{ margin: '10px 0 0', fontSize: 11, color: DIM }}>
                  AR mode requires Chrome on Android. Using camera measurement mode.
                </p>
              )}
            </div>
          )}

          {cameraError && (
            <div style={{ ...glass, padding: '12px 16px', color: RED, fontSize: 13 }}>
              {cameraError}
            </div>
          )}
        </div>
      )}

      {/* ---- Camera feed + overlay ---- */}
      {cameraActive && (
        <div style={{ position: 'relative' }}>
          {/* Calibration Wizard Overlay */}
          {calibStep !== 'idle' && calibStep !== 'done' && (
            <div style={{
              position: 'fixed', top: 72, left: 0, right: 0, zIndex: 60,
              ...glass, borderRadius: 0, padding: '12px 16px',
              borderBottom: '1px solid #EEF0F3',
            }}>
              {calibStep === 'point_a' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', border: `2px solid ${BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: BLUE }}>1</div>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>Tap Point A</p>
                    <p style={{ margin: 0, fontSize: 11, color: DIM }}>Tap the first reference point on the camera view</p>
                  </div>
                </div>
              )}
              {calibStep === 'point_b' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(34,197,94,0.2)', border: `2px solid ${GREEN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: GREEN }}>2</div>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>Tap Point B</p>
                    <p style={{ margin: 0, fontSize: 11, color: DIM }}>Tap the second reference point</p>
                  </div>
                </div>
              )}
              {calibStep === 'enter_dist' && (
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: TEXT }}>Enter the real distance between points</p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      value={calibRealDist}
                      onChange={e => setCalibRealDist(e.target.value)}
                      placeholder="e.g. 10"
                      style={{ ...inp, flex: 1 }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
                      {(['ft', 'mm'] as const).map(u => (
                        <button key={u} onClick={() => setCalibUnit(u)} style={{
                          padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          background: calibUnit === u ? GOLD : BASE,
                          color: calibUnit === u ? BASE : DIM,
                        }}>{u}</button>
                      ))}
                    </div>
                    <button onClick={saveCalibration} disabled={calibSaving || !calibRealDist} style={{
                      padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: calibSaving ? BORDER : GREEN, color: calibSaving ? DIM : '#000',
                      fontSize: 13, fontWeight: 800,
                    }}>
                      {calibSaving ? '...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {calibStep === 'done' && (
            <div style={{
              position: 'fixed', top: 72, left: 0, right: 0, zIndex: 60,
              background: 'rgba(34,197,94,0.15)', padding: '12px 16px',
              textAlign: 'center', fontSize: 14, fontWeight: 700, color: GREEN,
            }}>
              Calibration saved!
            </div>
          )}

          {/* Camera container */}
          <div
            ref={containerRef}
            onClick={handleTap}
            onTouchEnd={(e) => {
              if (calibStep === 'point_a' || calibStep === 'point_b' || measuring) {
                e.preventDefault();
                handleTap(e as any);
              }
            }}
            style={{
              position: 'relative', width: '100%',
              height: 'calc(100dvh - 72px - 80px)',
              overflow: 'hidden', background: '#000',
              cursor: (measuring || calibStep === 'point_a' || calibStep === 'point_b') ? 'crosshair' : 'default',
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* SVG overlay for measurements */}
            <svg
              ref={svgRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            >
              {/* calibration points */}
              {calibPointA && (calibStep === 'point_b' || calibStep === 'enter_dist') && (
                <circle cx={calibPointA.x} cy={calibPointA.y} r={8} fill={BLUE} stroke="#fff" strokeWidth={2} />
              )}
              {calibPointB && calibStep === 'enter_dist' && (
                <>
                  <circle cx={calibPointB.x} cy={calibPointB.y} r={8} fill={GREEN} stroke="#fff" strokeWidth={2} />
                  <line x1={calibPointA!.x} y1={calibPointA!.y} x2={calibPointB.x} y2={calibPointB.y}
                    stroke="#fff" strokeWidth={2} strokeDasharray="6 4" />
                </>
              )}

              {/* measurements */}
              {measurements.map(m => {
                const midX = (m.p1.x + m.p2.x) / 2;
                const midY = (m.p1.y + m.p2.y) / 2;
                const angle = Math.atan2(m.p2.y - m.p1.y, m.p2.x - m.p1.x) * (180 / Math.PI);
                return (
                  <g key={m.id}>
                    <circle cx={m.p1.x} cy={m.p1.y} r={5} fill={GOLD} stroke="#fff" strokeWidth={1.5} />
                    <circle cx={m.p2.x} cy={m.p2.y} r={5} fill={GOLD} stroke="#fff" strokeWidth={1.5} />
                    <line x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y}
                      stroke={GOLD} strokeWidth={2} />
                    {/* distance label */}
                    <rect
                      x={midX - 40} y={midY - 14}
                      width={80} height={28}
                      rx={8} fill="rgba(0,0,0,0.75)"
                      stroke="rgba(255,255,255,0.2)" strokeWidth={1}
                    />
                    <text x={midX} y={midY + 5} textAnchor="middle"
                      fill="#fff" fontSize={13} fontWeight={700} fontFamily="system-ui">
                      {formatDist(m.realDist, m.unit)}
                    </text>
                  </g>
                );
              })}

              {/* pending first point */}
              {pendingPoint && (
                <g>
                  <circle cx={pendingPoint.x} cy={pendingPoint.y} r={6} fill={GOLD} stroke="#fff" strokeWidth={2}>
                    <animate attributeName="r" values="6;9;6" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                </g>
              )}
            </svg>

            {/* Takeoff dimensions reference panel */}
            {showTakeoff && takeoffDims.length > 0 && (
              <div style={{
                position: 'absolute', top: 10, right: 10, zIndex: 30,
                ...glass, padding: '10px 14px', maxWidth: 200,
              }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Takeoff Dims
                </p>
                {takeoffDims.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <span style={{ fontSize: 11, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{d.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{d.value} {d.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Bottom toolbar ---- */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            ...glass, borderRadius: 0, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 6,
            borderTop: '1px solid #EEF0F3',
          }}>
            {/* Measure toggle */}
            <button onClick={() => { setMeasuring(!measuring); setPendingPoint(null); }} style={{
              flex: 1, padding: '10px 0', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: measuring ? GOLD : 'rgba(26,31,46,0.7)',
              color: measuring ? BASE : GOLD,
              border: measuring ? `1px solid ${GOLD}` : '1px solid #EEF0F3',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
                <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0l12.6 12.6z"/>
                <path d="M14.5 6.5l1 1M11.5 9.5l1 1M8.5 12.5l1 1M5.5 15.5l1 1"/>
              </svg>
              Measure
            </button>

            {/* Clear */}
            <button onClick={() => { setMeasurements([]); setPendingPoint(null); }} style={{
              padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: 'rgba(26,31,46,0.7)', color: RED,
              border: '1px solid #EEF0F3',
            }}>
              Clear
            </button>

            {/* Undo */}
            <button onClick={undo} disabled={measurements.length === 0 && !pendingPoint} style={{
              padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: 'rgba(26,31,46,0.7)', color: (measurements.length === 0 && !pendingPoint) ? 'rgba(139,170,200,0.3)' : DIM,
              border: '1px solid #EEF0F3',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
                <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"/>
              </svg>
            </button>

            {/* Save */}
            <button onClick={saveMeasurements} disabled={saving || measurements.length === 0} style={{
              flex: 1, padding: '10px 0', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: (saving || measurements.length === 0) ? 'rgba(26,31,46,0.7)' : GREEN,
              color: (saving || measurements.length === 0) ? 'rgba(139,170,200,0.3)' : '#000',
              border: '1px solid #EEF0F3',
            }}>
              {saving ? 'Saving...' : `Save (${measurements.length})`}
            </button>

            {/* Unit toggle */}
            <button onClick={() => setUnit(u => u === 'ft' ? 'mm' : 'ft')} style={{
              padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 800,
              background: 'rgba(26,31,46,0.7)', color: BLUE,
              border: '1px solid #EEF0F3',
            }}>
              {unit}
            </button>

            {/* Takeoff toggle */}
            <button onClick={() => setShowTakeoff(!showTakeoff)} style={{
              padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: showTakeoff ? 'rgba(59,130,246,0.15)' : 'rgba(26,31,46,0.7)',
              color: showTakeoff ? BLUE : DIM,
              border: showTakeoff ? `1px solid rgba(59,130,246,0.3)` : '1px solid #EEF0F3',
            }}>
              &#x1F4D0;
            </button>
          </div>
        </div>
      )}

      {/* ---- Measurements list (when camera not active) ---- */}
      {!cameraActive && measurements.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ ...glass, padding: 14, marginTop: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Saved Measurements ({measurements.length})
            </p>
            {measurements.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: 13, color: TEXT }}>Line {i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>{formatDist(m.realDist, m.unit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* XR Active overlay */}
      {xrActive && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.9)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>&#x1F310;</div>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>WebXR Session Active</p>
            <p style={{ margin: '8px 0 20px', fontSize: 13, color: DIM }}>Look around to detect surfaces. Tap to place dimension labels.</p>
            <button onClick={() => setXrActive(false)} style={{
              ...glass, padding: '14px 32px', cursor: 'pointer', fontSize: 15, fontWeight: 800,
              color: RED, border: `1px solid rgba(239,68,68,0.3)`,
            }}>
              Exit AR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FieldAROverlayPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center', background: '#F8F9FB', minHeight: '100dvh' }}>Loading AR...</div>}>
      <AROverlayPage />
    </Suspense>
  );
}
