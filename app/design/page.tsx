'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useCallback, useEffect } from 'react';

/* ─── Palette ─── */
const BG = '#0F1419', CARD = '#1A1F2E', GOLD = '#D4A017', GREEN = '#22C55E';
const BORDER = '#1E2A3A', TEXT = '#F0F4FF', DIM = '#7B8FA8', DARK = '#0B0F14';
const BLUE = '#3B82F6', RED = '#EF4444', PURPLE = '#8B5CF6';

/* ─── Room Types ─── */
const ROOMS = [
  { id: 'kitchen', label: 'Kitchen', icon: '🍳', gradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)' },
  { id: 'bathroom', label: 'Bathroom', icon: '🚿', gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)' },
  { id: 'living_room', label: 'Living Room', icon: '🛋️', gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' },
  { id: 'bedroom', label: 'Bedroom', icon: '🛏️', gradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)' },
  { id: 'dining_room', label: 'Dining Room', icon: '🍽️', gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' },
  { id: 'home_office', label: 'Home Office', icon: '💼', gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' },
  { id: 'exterior', label: 'Exterior', icon: '🏠', gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' },
  { id: 'backyard', label: 'Backyard', icon: '🌿', gradient: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' },
  { id: 'garage', label: 'Garage', icon: '🔧', gradient: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)' },
  { id: 'basement', label: 'Basement', icon: '🎮', gradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)' },
];

/* ─── Design Styles with color swatches ─── */
const STYLES = [
  { id: 'modern', label: 'Modern Minimalist', colors: ['#FAFAF9','#78716C','#292524','#D4A017'], desc: 'Clean lines, neutral tones' },
  { id: 'farmhouse', label: 'Modern Farmhouse', colors: ['#FEFCE8','#A16207','#44403C','#D6D3D1'], desc: 'Warm rustic charm' },
  { id: 'mediterranean', label: 'Mediterranean', colors: ['#FEF3C7','#B45309','#7C2D12','#065F46'], desc: 'Earth tones, arched details' },
  { id: 'industrial', label: 'Industrial Loft', colors: ['#78716C','#DC2626','#1C1917','#A8A29E'], desc: 'Exposed brick, raw metal' },
  { id: 'coastal', label: 'Coastal Beach', colors: ['#F0F9FF','#0EA5E9','#BAE6FD','#FDE68A'], desc: 'Light, airy, ocean palette' },
  { id: 'scandinavian', label: 'Scandinavian', colors: ['#FAFAFA','#E7E5E4','#D6D3D1','#A3E635'], desc: 'Hygge warmth, birch wood' },
  { id: 'art-deco', label: 'Art Deco', colors: ['#1C1917','#D4A017','#7C3AED','#F5F5F4'], desc: 'Glamorous geometric luxury' },
  { id: 'japanese', label: 'Japanese Zen', colors: ['#F5F5DC','#8B7355','#2D4A3E','#D4C5A9'], desc: 'Tranquil, natural, wabi-sabi' },
  { id: 'midcentury', label: 'Mid-Century Modern', colors: ['#FDE68A','#EA580C','#065F46','#78716C'], desc: 'Retro 1960s organic curves' },
  { id: 'luxury', label: 'Luxury Contemporary', colors: ['#1C1917','#D4A017','#F5F5F4','#78716C'], desc: 'High-end sophisticated' },
  { id: 'bohemian', label: 'Bohemian', colors: ['#7C3AED','#DB2777','#F59E0B','#059669'], desc: 'Eclectic, colorful, layered' },
  { id: 'transitional', label: 'Transitional', colors: ['#F5F5F4','#A8A29E','#57534E','#D4A017'], desc: 'Classic meets contemporary' },
  { id: 'desert-modern', label: 'Desert Modern', colors: ['#D2B48C','#8B4513','#2F4F4F','#DAA520'], desc: 'Southwest contemporary' },
  { id: 'kitchen', label: 'Chef\'s Kitchen', colors: ['#1E3A5A','#D4A017','#F5F5F4','#44403C'], desc: 'Professional-grade kitchen' },
  { id: 'bathroom-spa', label: 'Spa Bathroom', colors: ['#F0FDFA','#5EEAD4','#F5F5F4','#D4A017'], desc: 'Hotel-quality spa retreat' },
  { id: 'resort-backyard', label: 'Resort Backyard', colors: ['#0EA5E9','#22C55E','#FDE68A','#78716C'], desc: 'Luxury pool & outdoor living' },
  { id: 'home-office', label: 'Executive Office', colors: ['#1C1917','#78716C','#D4A017','#F5F5F4'], desc: 'Productive, stylish workspace' },
  { id: 'garage-workshop', label: 'Dream Garage', colors: ['#374151','#EF4444','#9CA3AF','#F5F5F4'], desc: 'Organized workshop & storage' },
];

/* ─── Step wizard flow ─── */
type Step = 'upload' | 'room' | 'style' | 'customize' | 'generating' | 'results';

const STEP_LABELS: Record<Step, string> = {
  upload: 'Upload Photo',
  room: 'Room Type',
  style: 'Design Style',
  customize: 'Customize',
  generating: 'Generating',
  results: 'Your Design',
};

const STEP_ORDER: Step[] = ['upload', 'room', 'style', 'customize', 'generating', 'results'];

/* ─── Progress messages ─── */
const GEN_MESSAGES = [
  'Analyzing room dimensions...',
  'Detecting existing features...',
  'Applying design style...',
  'Rendering materials and textures...',
  'Adding lighting and shadows...',
  'Refining photorealistic details...',
  'Calculating renovation costs...',
  'Finalizing your design...',
];

export default function DesignStudioPage() {
  const [step, setStep] = useState<Step>('upload');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [room, setRoom] = useState('');
  const [style, setStyle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [intensity, setIntensity] = useState(0.75);
  const [numOutputs, setNumOutputs] = useState(2);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState({ message: '', pct: 0 });
  const [genMsgIdx, setGenMsgIdx] = useState(0);
  const [compareIdx, setCompareIdx] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Cycle generation messages
  useEffect(() => {
    if (step !== 'generating') return;
    const t = setInterval(() => setGenMsgIdx(p => (p + 1) % GEN_MESSAGES.length), 3000);
    return () => clearInterval(t);
  }, [step]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 20 * 1024 * 1024) return; // 20MB max
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => { setPhoto(e.target?.result as string); setStep('room'); };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleGenerate = async () => {
    if (!photoFile || !room || !style) return;
    setStep('generating'); setResult(null); setGenMsgIdx(0);
    setProgress({ message: 'Starting...', pct: 0 });

    try {
      const formData = new FormData();
      formData.append('photo', photoFile);
      formData.append('style', style);
      formData.append('roomType', room.replace(/_/g, ' '));
      formData.append('instructions', instructions);
      formData.append('intensity', String(intensity));
      formData.append('numOutputs', String(numOutputs));

      const res = await fetch('/api/design/reimagine', { method: 'POST', body: formData });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.event === 'progress') setProgress({ message: evt.message || '', pct: evt.pct || 0 });
            if (evt.event === 'result') { setResult(evt); setStep('results'); }
            if (evt.event === 'error') { setResult({ error: evt.message }); setStep('results'); }
          } catch { /* ignore */ }
        }
      }
      if (step === 'generating') setStep('results'); // safety
    } catch { setResult({ error: 'Generation failed. Please try again.' }); setStep('results'); }
  };

  const handleSliderMove = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    setSliderPos(Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const stepIdx = STEP_ORDER.indexOf(step);
  const canGoNext = (step === 'upload' && !!photo) || (step === 'room' && !!room) || (step === 'style' && !!style);

  const goNext = () => {
    if (step === 'upload' && photo) setStep('room');
    else if (step === 'room' && room) setStep('style');
    else if (step === 'style' && style) setStep('customize');
    else if (step === 'customize') handleGenerate();
  };

  const goBack = () => {
    if (step === 'room') setStep('upload');
    else if (step === 'style') setStep('room');
    else if (step === 'customize') setStep('style');
    else if (step === 'results') setStep('customize');
  };

  const resetAll = () => {
    setStep('upload'); setPhoto(null); setPhotoFile(null); setRoom(''); setStyle('');
    setInstructions(''); setResult(null); setCompareIdx(0); setSliderPos(50);
  };

  const fmt$ = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT }} data-landing>
      {/* ── Top Bar ── */}
      <div style={{ background: DARK, borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/" style={{ color: GOLD, fontWeight: 800, fontSize: 16, letterSpacing: 2, textDecoration: 'none' }}>SAGUARO</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: DIM, fontSize: 13 }}>AI Design Studio</span>
          <span style={{ color: GOLD, fontSize: 11, background: `${GOLD}15`, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>BETA</span>
        </div>
        <a href="/login" style={{ color: DIM, fontSize: 13, textDecoration: 'none' }}>Log In</a>
      </div>

      {/* ── Progress Steps ── */}
      {step !== 'results' && (
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 0 }}>
          {STEP_ORDER.slice(0, 4).map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  background: i < stepIdx ? GREEN : i === stepIdx ? GOLD : 'transparent',
                  color: i <= stepIdx ? '#000' : DIM,
                  border: i <= stepIdx ? 'none' : `1.5px solid ${BORDER}`,
                  transition: 'all .3s',
                }}>
                  {i < stepIdx ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, color: i === stepIdx ? TEXT : DIM, fontWeight: i === stepIdx ? 700 : 400, display: i === stepIdx ? 'inline' : 'none' }}>
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 1.5, background: i < stepIdx ? GREEN : BORDER, margin: '0 6px', transition: 'background .3s' }} />}
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>
        {/* ════════════════════════════════════════════ */}
        {/* ── STEP 1: UPLOAD ── */}
        {step === 'upload' && (
          <div style={{ animation: 'fadeInUp .25s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
                Upload Your <span style={{ color: GOLD }}>Space</span>
              </h1>
              <p style={{ color: DIM, fontSize: 15 }}>Take a photo or upload an image of the room you want to redesign</p>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                background: isDragging ? `${GOLD}08` : `${CARD}AA`,
                backdropFilter: 'blur(16px)', border: `2px dashed ${isDragging ? GOLD : BORDER}`,
                borderRadius: 20, padding: photo ? 0 : '80px 40px', cursor: 'pointer',
                transition: 'all .2s', overflow: 'hidden', maxWidth: 640, margin: '0 auto',
              }}
            >
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {photo ? (
                <div style={{ position: 'relative' }}>
                  <img src={photo} alt="Your space" style={{ width: '100%', maxHeight: 420, objectFit: 'cover', display: 'block' }} />
                  <button onClick={(e) => { e.stopPropagation(); setPhoto(null); setPhotoFile(null); }}
                    style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,.7)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Change Photo
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 72, height: 72, borderRadius: 20, background: `${GOLD}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32 }}>
                    📸
                  </div>
                  <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Drop your photo here</p>
                  <p style={{ color: DIM, fontSize: 13, marginBottom: 20 }}>or click to browse — JPG, PNG up to 20MB</p>
                  <div style={{ display: 'inline-flex', gap: 12 }}>
                    <span style={{ background: `${CARD}`, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 16px', fontSize: 12, color: DIM }}>📱 Camera</span>
                    <span style={{ background: `${CARD}`, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 16px', fontSize: 12, color: DIM }}>🖼️ Gallery</span>
                  </div>
                </div>
              )}
            </div>

            {photo && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <button onClick={goNext} style={{
                  padding: '14px 48px', background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
                  color: '#000', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16,
                  cursor: 'pointer', letterSpacing: 0.5,
                }}>
                  Continue →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* ── STEP 2: ROOM TYPE ── */}
        {step === 'room' && (
          <div style={{ animation: 'fadeInUp .25s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>What type of <span style={{ color: GOLD }}>space</span> is this?</h1>
              <p style={{ color: DIM, fontSize: 14 }}>Select the room type for the best AI results</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, maxWidth: 700, margin: '0 auto' }}>
              {ROOMS.map(r => (
                <button key={r.id} onClick={() => { setRoom(r.id); setTimeout(goNext, 200); }} style={{
                  background: room === r.id ? `${GOLD}15` : `${CARD}CC`,
                  backdropFilter: 'blur(12px)', border: `1.5px solid ${room === r.id ? GOLD : BORDER}`,
                  borderRadius: 16, padding: '20px 12px', cursor: 'pointer', transition: 'all .15s',
                  textAlign: 'center', transform: room === r.id ? 'scale(1.03)' : 'scale(1)',
                }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: r.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 22 }}>
                    {r.icon}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: room === r.id ? GOLD : TEXT }}>{r.label}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 28 }}>
              <button onClick={goBack} style={{ padding: '10px 24px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: DIM, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Back</button>
              {room && <button onClick={goNext} style={{ padding: '10px 32px', background: `linear-gradient(135deg, ${GOLD}, #B8860B)`, color: '#000', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Continue →</button>}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* ── STEP 3: DESIGN STYLE ── */}
        {step === 'style' && (
          <div style={{ animation: 'fadeInUp .25s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Choose your <span style={{ color: GOLD }}>style</span></h1>
              <p style={{ color: DIM, fontSize: 14 }}>Pick the design aesthetic you love</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {STYLES.map(s => (
                <button key={s.id} onClick={() => { setStyle(s.id); setTimeout(goNext, 200); }} style={{
                  background: style === s.id ? `${GOLD}12` : `${CARD}CC`,
                  backdropFilter: 'blur(12px)', border: `1.5px solid ${style === s.id ? GOLD : BORDER}`,
                  borderRadius: 16, padding: '16px', cursor: 'pointer', transition: 'all .15s',
                  textAlign: 'left', transform: style === s.id ? 'scale(1.02)' : 'scale(1)',
                }}>
                  {/* Color swatches */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    {s.colors.map((c, i) => (
                      <div key={i} style={{ width: i === 0 ? 32 : 18, height: 18, borderRadius: 4, background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: style === s.id ? GOLD : TEXT, marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: DIM }}>{s.desc}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 28 }}>
              <button onClick={goBack} style={{ padding: '10px 24px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: DIM, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Back</button>
              {style && <button onClick={goNext} style={{ padding: '10px 32px', background: `linear-gradient(135deg, ${GOLD}, #B8860B)`, color: '#000', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Continue →</button>}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* ── STEP 4: CUSTOMIZE ── */}
        {step === 'customize' && (
          <div style={{ animation: 'fadeInUp .25s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Fine-tune your <span style={{ color: GOLD }}>design</span></h1>
              <p style={{ color: DIM, fontSize: 14 }}>Adjust settings or add custom instructions</p>
            </div>

            {/* Preview strip */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 12 }}>
              {photo && <img src={photo} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{ROOMS.find(r => r.id === room)?.label} → {STYLES.find(s => s.id === style)?.label}</div>
                <div style={{ fontSize: 12, color: DIM }}>
                  {STYLES.find(s => s.id === style)?.desc}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {STYLES.find(s => s.id === style)?.colors.map((c, i) => (
                  <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              {/* Intensity */}
              <div style={{ background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Transformation</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>{Math.round(intensity * 100)}%</span>
                </div>
                <input type="range" min={30} max={95} value={Math.round(intensity * 100)}
                  onChange={(e) => setIntensity(Number(e.target.value) / 100)}
                  style={{ width: '100%', accentColor: GOLD, cursor: 'pointer', height: 6 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: DIM, marginTop: 6 }}>
                  <span>Subtle refresh</span>
                  <span>Complete reimagine</span>
                </div>
              </div>

              {/* Variations */}
              <div style={{ background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Design Variations</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3].map(n => (
                    <button key={n} onClick={() => setNumOutputs(n)} style={{
                      flex: 1, padding: '12px', borderRadius: 10, border: numOutputs === n ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
                      background: numOutputs === n ? `${GOLD}15` : 'transparent', color: numOutputs === n ? GOLD : DIM,
                      fontWeight: 800, fontSize: 18, cursor: 'pointer', transition: 'all .15s',
                    }}>{n}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 8, textAlign: 'center' }}>
                  ~${(0.02 * numOutputs).toFixed(2)} per generation
                </div>
              </div>
            </div>

            {/* Custom instructions */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Custom Instructions <span style={{ fontWeight: 400, color: DIM }}>(optional)</span>
              </div>
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
                placeholder="Add specific details... e.g., 'I want a large island with seating for 4, pendant lights, and a wine fridge'"
                rows={3} style={{
                  width: '100%', background: `${CARD}CC`, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: 14, color: TEXT, fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={goBack} style={{ padding: '10px 24px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: DIM, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Back</button>
              <button onClick={handleGenerate} style={{
                padding: '14px 48px', background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
                color: '#000', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 16,
                cursor: 'pointer', letterSpacing: 0.5,
              }}>
                ✨ Generate Design
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* ── STEP 5: GENERATING ── */}
        {step === 'generating' && (
          <div style={{ animation: 'fadeInUp .25s ease-out', textAlign: 'center', paddingTop: 60 }}>
            {/* Animated orb */}
            <div style={{ width: 100, height: 100, borderRadius: '50%', margin: '0 auto 32px', position: 'relative' }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: `conic-gradient(${GOLD}, ${GREEN}, ${BLUE}, ${PURPLE}, ${GOLD})`,
                animation: 'spin 3s linear infinite', opacity: 0.7,
              }} />
              <div style={{
                position: 'absolute', inset: 8, borderRadius: '50%', background: BG,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
              }}>✨</div>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              Creating Your <span style={{ color: GOLD }}>Design</span>
            </h2>
            <p style={{ color: DIM, fontSize: 14, marginBottom: 32, minHeight: 20, transition: 'all .3s' }}>
              {progress.message || GEN_MESSAGES[genMsgIdx]}
            </p>

            {/* Progress bar */}
            <div style={{ maxWidth: 400, margin: '0 auto' }}>
              <div style={{ height: 6, background: `${CARD}`, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, transition: 'width .5s ease',
                  width: `${progress.pct || 10}%`,
                  background: `linear-gradient(90deg, ${GOLD}, ${GREEN})`,
                }} />
              </div>
              <div style={{ fontSize: 13, color: GOLD, fontWeight: 700, marginTop: 8 }}>
                {progress.pct || 10}%
              </div>
            </div>

            {/* Tips while waiting */}
            <div style={{ marginTop: 48, background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 24px', maxWidth: 500, margin: '48px auto 0', textAlign: 'left' }}>
              <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Did you know?</div>
              <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6 }}>
                Saguaro uses ControlNet AI to preserve your room&apos;s structure while completely transforming the style. Walls, windows, and doors stay in place — only the design changes.
              </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* ── STEP 6: RESULTS ── */}
        {step === 'results' && result && !result.error && (
          <div style={{ animation: 'fadeInUp .25s ease-out' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>
                  Your <span style={{ color: GOLD }}>{STYLES.find(s => s.id === style)?.label}</span> Design
                </h1>
                <p style={{ color: DIM, fontSize: 13 }}>{ROOMS.find(r => r.id === room)?.label} Redesign</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={resetAll} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>New Design</button>
                <button onClick={() => setStep('customize')} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${GOLD}`, borderRadius: 8, color: GOLD, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Adjust & Retry</button>
              </div>
            </div>

            {/* Before/After Slider */}
            {result.generatedUrls?.length > 0 && photo && (
              <div style={{ background: `${CARD}CC`, backdropFilter: 'blur(16px)', border: `1px solid ${BORDER}`, borderRadius: 20, overflow: 'hidden', marginBottom: 20 }}>
                {/* Variation tabs */}
                {result.generatedUrls.length > 1 && (
                  <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}` }}>
                    {result.generatedUrls.map((_: string, idx: number) => (
                      <button key={idx} onClick={() => setCompareIdx(idx)} style={{
                        flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                        background: compareIdx === idx ? `${GOLD}15` : 'transparent',
                        color: compareIdx === idx ? GOLD : DIM, fontWeight: 700, fontSize: 13,
                        borderBottom: compareIdx === idx ? `2px solid ${GOLD}` : '2px solid transparent',
                        transition: 'all .15s',
                      }}>Design {idx + 1}</button>
                    ))}
                  </div>
                )}

                {/* Slider */}
                <div ref={sliderRef} style={{ position: 'relative', cursor: 'ew-resize', userSelect: 'none', aspectRatio: '16/10', overflow: 'hidden' }}
                  onMouseDown={(e) => { handleSliderMove(e.clientX); const mv = (ev: MouseEvent) => handleSliderMove(ev.clientX); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); }}
                  onTouchStart={(e) => handleSliderMove(e.touches[0].clientX)}
                  onTouchMove={(e) => handleSliderMove(e.touches[0].clientX)}>
                  {/* After */}
                  <img src={result.generatedUrls[compareIdx]} alt="After" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  {/* Before (clipped) */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: `${sliderPos}%`, height: '100%', overflow: 'hidden' }}>
                    <img src={photo} alt="Before" style={{ width: sliderRef.current ? sliderRef.current.offsetWidth : 900, height: '100%', objectFit: 'cover' }} />
                  </div>
                  {/* Line */}
                  <div style={{ position: 'absolute', top: 0, left: `${sliderPos}%`, width: 2, height: '100%', background: '#fff', transform: 'translateX(-1px)', zIndex: 10, boxShadow: '0 0 12px rgba(0,0,0,0.5)' }} />
                  {/* Handle */}
                  <div style={{ position: 'absolute', top: '50%', left: `${sliderPos}%`, width: 36, height: 36, borderRadius: '50%', background: '#fff', border: `3px solid ${GOLD}`, transform: 'translate(-50%,-50%)', zIndex: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.4)', fontSize: 14, cursor: 'ew-resize' }}>⇔</div>
                  {/* Labels */}
                  <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,.75)', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, zIndex: 5, backdropFilter: 'blur(4px)' }}>BEFORE</div>
                  <div style={{ position: 'absolute', top: 12, right: 12, background: `${GOLD}EE`, color: '#000', padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, zIndex: 5 }}>AFTER</div>
                </div>
              </div>
            )}

            {/* Claude fallback notice */}
            {(!result.generatedUrls || result.generatedUrls.length === 0) && result.note && (
              <div style={{ background: `${GOLD}08`, border: `1px solid ${GOLD}30`, borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 24 }}>💡</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 2 }}>Text-Only Mode</div>
                  <div style={{ fontSize: 12, color: DIM }}>{result.note}</div>
                </div>
              </div>
            )}

            {/* Cost + Details */}
            {result.costEstimate && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Estimated Cost</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>
                    {fmt$(result.costEstimate.cost_low || 0)} – {fmt$(result.costEstimate.cost_high || 0)}
                  </div>
                </div>
                <div style={{ background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Timeline</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{result.costEstimate.timeline_weeks || '?'} <span style={{ fontSize: 14, fontWeight: 400, color: DIM }}>weeks</span></div>
                </div>
                <div style={{ background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Difficulty</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: result.costEstimate.difficulty === 'complex' ? RED : result.costEstimate.difficulty === 'moderate' ? GOLD : GREEN }}>
                    {(result.costEstimate.difficulty || 'moderate').charAt(0).toUpperCase() + (result.costEstimate.difficulty || 'moderate').slice(1)}
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            {result.costEstimate?.description && (
              <div style={{ background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Design Description</div>
                <p style={{ color: DIM, fontSize: 13, lineHeight: 1.7 }}>{result.costEstimate.description}</p>
                {result.costEstimate.color_palette && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    {result.costEstimate.color_palette.map((c: string, i: number) => (
                      <div key={i} style={{ width: 28, height: 28, borderRadius: 6, background: c, border: '1px solid rgba(255,255,255,0.15)' }} title={c} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Materials */}
            {result.costEstimate?.materials?.length > 0 && (
              <div style={{ background: `${CARD}CC`, backdropFilter: 'blur(12px)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Materials & Cost Breakdown</div>
                {result.costEstimate.materials.map((m: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < result.costEstimate.materials.length - 1 ? `1px solid ${BORDER}` : 'none', fontSize: 13 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>
                      {m.csi_code && <span style={{ color: GOLD, fontSize: 11, marginLeft: 8 }}>{m.csi_code}</span>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ color: DIM, marginRight: 12 }}>{m.quantity} {m.unit}</span>
                      <span style={{ fontWeight: 700, color: GOLD }}>{fmt$(m.total || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CTAs */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="/design/discover" style={{ textDecoration: 'none' }}>
                <button style={{ padding: '14px 36px', background: `linear-gradient(135deg, ${GOLD}, #B8860B)`, color: '#000', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Get a Free Quote</button>
              </a>
              <a href="/design/packages" style={{ textDecoration: 'none' }}>
                <button style={{ padding: '12px 28px', background: 'transparent', border: `2px solid ${GOLD}`, color: GOLD, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Smart Packages</button>
              </a>
              <a href="/design/roi" style={{ textDecoration: 'none' }}>
                <button style={{ padding: '12px 28px', background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 12, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>ROI Calculator</button>
              </a>
            </div>
          </div>
        )}

        {/* Error */}
        {step === 'results' && result?.error && (
          <div style={{ animation: 'fadeInUp .25s ease-out', textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ color: DIM, fontSize: 14, marginBottom: 24 }}>{result.error}</p>
            <button onClick={() => setStep('customize')} style={{ padding: '12px 32px', background: `linear-gradient(135deg, ${GOLD}, #B8860B)`, color: '#000', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Try Again</button>
          </div>
        )}
      </div>

      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
