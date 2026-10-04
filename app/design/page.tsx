'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';

/* ─── Palette — Sonoran minimal (gold on navy) ─── */
const BG = 'var(--bg-base)', CARD = 'var(--bg-surface)', GOLD = 'var(--brand-primary)', GREEN = '#2CFF7A';
const BORDER = 'rgba(255,255,255,0.12)', TEXT = '#FFFFFF', DIM = '#D4D4D8';
const RED = '#FF3B30';

/* ─── Room Types ─── */
const ROOMS = [
  { id: 'kitchen', label: 'Kitchen', icon: 'kitchen', gradient: 'linear-gradient(135deg, #FF8A00 0%, #FF8A00 100%)' },
  { id: 'bathroom', label: 'Bathroom', icon: 'bath', gradient: 'linear-gradient(135deg, #FF8A00 0%, #0891B2 100%)' },
  { id: 'living_room', label: 'Living Room', icon: 'sofa', gradient: 'linear-gradient(135deg, #FF8A00 0%, #FF8A00 100%)' },
  { id: 'bedroom', label: 'Bedroom', icon: 'bed', gradient: 'linear-gradient(135deg, #FF8A00 0%, #FF8A00 100%)' },
  { id: 'dining_room', label: 'Dining Room', icon: 'dining', gradient: 'linear-gradient(135deg, #FF8A00 0%, #FF8A00 100%)' },
  { id: 'home_office', label: 'Home Office', icon: 'office', gradient: 'linear-gradient(135deg, #FF8A00 0%, #FF8A00 100%)' },
  { id: 'exterior', label: 'Exterior', icon: 'house', gradient: 'linear-gradient(135deg, #2CFF7A 0%, #2CFF7A 100%)' },
  { id: 'backyard', label: 'Backyard', icon: 'yard', gradient: 'linear-gradient(135deg, #2CFF7A 0%, #2CFF7A 100%)' },
  { id: 'garage', label: 'Garage', icon: 'garage', gradient: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)' },
  { id: 'basement', label: 'Basement', icon: 'basement', gradient: 'linear-gradient(135deg, #FF8A00 0%, #4F46E5 100%)' },
];

/* ─── Design Styles with color swatches ─── */
const STYLES = [
  { id: 'modern', label: 'Modern Minimalist', colors: ['#FAFAF9','#78716C','#292524','#FF8A00'], desc: 'Clean lines, neutral tones' },
  { id: 'farmhouse', label: 'Modern Farmhouse', colors: ['#FEFCE8','#A16207','#44403C','#D6D3D1'], desc: 'Warm rustic charm' },
  { id: 'mediterranean', label: 'Mediterranean', colors: ['#FEF3C7','#B45309','#7C2D12','#2CFF7A'], desc: 'Earth tones, arched details' },
  { id: 'industrial', label: 'Industrial Loft', colors: ['#78716C','#FF3B30','#1C1917','#A8A29E'], desc: 'Exposed brick, raw metal' },
  { id: 'coastal', label: 'Coastal Beach', colors: ['#F0F9FF','#FF8A00','#BAE6FD','#FDE68A'], desc: 'Light, airy, ocean palette' },
  { id: 'scandinavian', label: 'Scandinavian', colors: ['#FAFAFA','#E7E5E4','#D6D3D1','#2CFF7A'], desc: 'Hygge warmth, birch wood' },
  { id: 'art-deco', label: 'Art Deco', colors: ['#1C1917','#FF8A00','#FF8A00','#F5F5F4'], desc: 'Glamorous geometric luxury' },
  { id: 'japanese', label: 'Japanese Zen', colors: ['#F5F5DC','#8B7355','#2D4A3E','#D4C5A9'], desc: 'Tranquil, natural, wabi-sabi' },
  { id: 'midcentury', label: 'Mid-Century Modern', colors: ['#FDE68A','#FF8A00','#2CFF7A','#78716C'], desc: 'Retro 1960s organic curves' },
  { id: 'luxury', label: 'Luxury Contemporary', colors: ['#1C1917','#FF8A00','#F5F5F4','#78716C'], desc: 'High-end sophisticated' },
  { id: 'bohemian', label: 'Bohemian', colors: ['#FF8A00','#FF8A00','#FF8A00','#2CFF7A'], desc: 'Eclectic, colorful, layered' },
  { id: 'transitional', label: 'Transitional', colors: ['#F5F5F4','#A8A29E','#57534E','#FF8A00'], desc: 'Classic meets contemporary' },
  { id: 'desert-modern', label: 'Desert Modern', colors: ['#D2B48C','#8B4513','#2F4F4F','#DAA520'], desc: 'Southwest contemporary' },
  { id: 'kitchen', label: "Chef's Kitchen", colors: ['#1E3A5A','#FF8A00','#F5F5F4','#44403C'], desc: 'Professional-grade kitchen' },
  { id: 'bathroom-spa', label: 'Spa Bathroom', colors: ['#F0FDFA','#5EEAD4','#F5F5F4','#FF8A00'], desc: 'Hotel-quality spa retreat' },
  { id: 'resort-backyard', label: 'Resort Backyard', colors: ['#FF8A00','#2CFF7A','#FDE68A','#78716C'], desc: 'Luxury pool & outdoor living' },
  { id: 'home-office', label: 'Executive Office', colors: ['#1C1917','#78716C','#FF8A00','#F5F5F4'], desc: 'Productive, stylish workspace' },
  { id: 'garage-workshop', label: 'Dream Garage', colors: ['#374151','#FF3B30','#9CA3AF','#F5F5F4'], desc: 'Organized workshop & storage' },
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
  'Analyzing room dimensions…',
  'Detecting existing features…',
  'Applying design style…',
  'Rendering materials and textures…',
  'Adding lighting and shadows…',
  'Refining photorealistic details…',
  'Calculating renovation costs…',
  'Finalizing your design…',
];

/* ─── Inline SVG Icons ─── */
const CameraIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
const PaletteIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/>
    <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12" r="0.5" fill="currentColor"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
  </svg>
);
const SparkleIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const TildeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFE600" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12c2-3 4-4 6-4s4 5 6 5 4-1 6-4"/>
  </svg>
);
const ArrowRight = () => (
  <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
    <path d="M2 12h32M28 6l6 6-6 6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
  </svg>
);
const StarIcon = ({ filled = true }: { filled?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? '#FF8A00' : 'none'} stroke="#FF8A00" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const UploadCloudIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
    <path d="M16 16l-4-4-4 4"/>
  </svg>
);

/* ─── Room icon SVGs ─── */
const RoomIcon = ({ type }: { type: string }) => {
  const s = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: '1.5', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'kitchen': return <svg {...s}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>;
    case 'bath': return <svg {...s}><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h1a2 2 0 012 2v1"/></svg>;
    case 'sofa': return <svg {...s}><path d="M20 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v3"/><path d="M2 11v5a2 2 0 002 2h16a2 2 0 002-2v-5a2 2 0 00-4 0v2H6v-2a2 2 0 00-4 0z"/><path d="M4 18v2"/><path d="M20 18v2"/></svg>;
    case 'bed': return <svg {...s}><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v3"/></svg>;
    case 'dining': return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></svg>;
    case 'office': return <svg {...s}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
    case 'house': return <svg {...s}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case 'yard': return <svg {...s}><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M12 8v8"/><path d="M8 12l4-4 4 4"/></svg>;
    case 'garage': return <svg {...s}><path d="M22 8.35V20a2 2 0 01-2 2H4a2 2 0 01-2-2V8.35A2 2 0 012.7 6.9l8-5.1a2 2 0 012.1 0l8 5.1a2 2 0 01.7 1.45z"/><path d="M6 18h12"/><path d="M6 14h12"/></svg>;
    default: return <svg {...s}><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>;
  }
};

export default function DesignStudioPage() {
  /* ─── Wizard State (preserved) ─── */
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
  const [studioActive, setStudioActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<HTMLDivElement>(null);

  // Cycle generation messages
  useEffect(() => {
    if (step !== 'generating') return;
    const t = setInterval(() => setGenMsgIdx(p => (p + 1) % GEN_MESSAGES.length), 3000);
    return () => clearInterval(t);
  }, [step]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 20 * 1024 * 1024) return;
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
    setProgress({ message: 'Starting…', pct: 0 });

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
      if (step === 'generating') setStep('results');
    } catch { setResult({ error: 'Generation failed. Please try again.' }); setStep('results'); }
  };

  const handleSliderMove = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    setSliderPos(Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const stepIdx = STEP_ORDER.indexOf(step);

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

  const scrollToStudio = () => {
    setStudioActive(true);
    setTimeout(() => {
      studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const scrollToExamples = () => {
    document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ─── Shared style helpers ─── */
  const sectionPad: React.CSSProperties = { maxWidth: 1160, margin: '0 auto', padding: '96px 24px' };
  const sectionTitle: React.CSSProperties = { fontSize: 22, fontWeight: 600, textAlign: 'center', marginBottom: 12, lineHeight: 1.25, letterSpacing: '-0.01em' };
  const sectionSub: React.CSSProperties = { fontSize: 15, color: DIM, textAlign: 'center', maxWidth: 560, margin: '0 auto 56px', lineHeight: 1.6 };
  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' };
  const goldBtn: React.CSSProperties = { padding: '10px 22px', background: GOLD, color: '#0A0A00', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', transition: 'opacity .15s' };
  const outlineBtn: React.CSSProperties = { padding: '10px 22px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: DIM, borderRadius: 8, fontWeight: 500, fontSize: 13.5, cursor: 'pointer', transition: 'all .15s' };

  return (
    <div style={{ background: 'var(--bg-base)', color: '#FFFFFF', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* ── ambient layer — warm glow removed (jet-black standard) ── */}
      <div style={{
        position: 'fixed', top: -120, right: -60, width: 520, height: 520, zIndex: 0, pointerEvents: 'none',
        background: 'none',
      }} />
      <svg style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 0, opacity: 0.03, pointerEvents: 'none' }} viewBox="0 0 1440 200" preserveAspectRatio="none">
        <path d="M0,200 L0,120 L120,60 L200,90 L280,40 L360,80 L440,20 L520,70 L600,30 L680,60 L760,10 L840,50 L920,25 L1000,65 L1080,15 L1160,55 L1240,35 L1320,70 L1440,45 L1440,200 Z" fill="#8B7355"/>
      </svg>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 1. NAV BAR                                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 1000,
        background: 'rgba(20,20,22,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 24px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <style>{`@media (max-width: 768px){ .dstudio-nav-links{ display:none !important } }`}</style>
        <Link href="/" style={{ color: GOLD, fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', textDecoration: 'none' }}>Saguaro</Link>
        <div className="dstudio-nav-links" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          {['How It Works', 'Examples', 'Pricing', 'Compare'].map(link => (
            <a key={link} href={`#${link.toLowerCase().replace(/\s+/g, '-')}`} style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 400, letterSpacing: '0.02em', textDecoration: 'none', transition: 'color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = GOLD)} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}>
              {link}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/login" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 400, textDecoration: 'none' }}>Log In</Link>
          <button onClick={scrollToStudio} style={{ ...goldBtn, padding: '7px 18px' }}>Start Free</button>
        </div>
      </nav>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 2. HERO                                                        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section style={{ ...sectionPad, paddingTop: 100, paddingBottom: 100, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: DIM, fontSize: 10.5, fontWeight: 500, padding: '5px 12px', borderRadius: 999, marginBottom: 24 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD }} />AI-Powered Design Studio
            </span>
            <h1 style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 20 }}>
              Redesign Any Room<br />in Seconds
            </h1>
            <p style={{ fontSize: 15, color: DIM, lineHeight: 1.7, marginBottom: 32, maxWidth: 460 }}>
              Upload a photo of your space. Pick a style. Get a photorealistic AI redesign &mdash; with instant cost estimates and contractor-ready specs.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button onClick={scrollToStudio} style={goldBtn}>
                Start Designing &rarr;
              </button>
              <button onClick={scrollToExamples} style={outlineBtn}>
                See Examples &darr;
              </button>
            </div>
          </div>

          {/* Before/after photo mockup */}
          <div style={{ position: 'relative', height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Before panel */}
            <div style={{
              position: 'absolute', left: 0, top: 20, width: '65%', height: '85%', borderRadius: 14,
              overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)',
              background: 'linear-gradient(135deg, #18181B 0%, #18181B 100%)', zIndex: 1,
            }}>
              <span style={{ position: 'absolute', bottom: 20, left: 20, background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500 }}>Before</span>
            </div>
            {/* After panel */}
            <div style={{
              position: 'absolute', right: 0, top: 0, width: '65%', height: '85%', borderRadius: 14,
              overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
              background: 'linear-gradient(135deg, #22242f 0%, #2c2a22 100%)', zIndex: 2,
            }}>
              <span style={{ position: 'absolute', bottom: 20, right: 20, background: 'rgba(255,255,255,0.92)', color: '#0a0a0a', padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>After</span>
            </div>
            {/* Slider line */}
            <div style={{
              position: 'absolute', left: '50%', top: '5%', width: 2, height: '90%',
              background: 'rgba(255,255,255,0.85)', borderRadius: 4, zIndex: 3,
              transform: 'translateX(-50%)',
            }}>
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-surface)', border: `1.5px solid ${GOLD}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: GOLD }} strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 8l4 4-4 4"/><path d="M6 8l-4 4 4 4"/>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 3. SOCIAL PROOF BAR                                            */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
            {[
              { num: '2,400+', label: 'Designs Created' },
              { num: '4.9', label: 'Rating', star: true },
              { num: '38', label: 'States' },
              { num: '580+', label: 'Contractors' },
            ].map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', margin: '0 32px' }} />}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: TEXT, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {item.num}
                    {item.star && <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF8A00" stroke="#FF8A00" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
                  </div>
                  <div style={{ fontSize: 13, color: DIM, marginTop: 2 }}>{item.label}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 4. HOW IT WORKS                                                */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section id="how-it-works" style={sectionPad}>
          <h2 style={sectionTitle}>How It Works</h2>
          <p style={sectionSub}>Three simple steps to transform any space with AI</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, flexWrap: 'wrap' }}>
            {[
              { icon: <CameraIcon />, title: 'Upload Photo', desc: 'Take or upload a photo of any room, exterior, or yard' },
              { icon: <PaletteIcon />, title: 'Choose Style', desc: 'Pick from 18 design styles \u2014 Modern, Farmhouse, Mediterranean, and more' },
              { icon: <SparkleIcon />, title: 'Get Your Design', desc: 'AI generates photorealistic redesigns in under 30 seconds with cost estimates' },
            ].map((item, i) => (
              <React.Fragment key={i}>
                <div style={{ padding: '20px 28px', textAlign: 'center', flex: '0 1 300px', minWidth: 240 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: TEXT }}>
                    {item.icon}
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6 }}>{item.desc}</p>
                </div>
                {i < 2 && <div style={{ padding: '0 8px', flexShrink: 0 }}><ArrowRight /></div>}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 5. BEFORE/AFTER GALLERY                                        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section id="gallery" style={{ ...sectionPad, background: 'rgba(255,255,255,0.03)' }}>
          <h2 style={sectionTitle}>See the Transformation</h2>
          <p style={sectionSub}>Real results from our AI design engine</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {[
              { name: 'Kitchen', style: 'Modern Minimalist', beforeImg: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=55&fm=webp', afterImg: 'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=400&q=55&fm=webp' },
              { name: 'Living Room', style: 'Scandinavian', beforeImg: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&q=55&fm=webp', afterImg: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&q=55&fm=webp' },
              { name: 'Exterior', style: 'Desert Modern', beforeImg: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&q=55&fm=webp', afterImg: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=55&fm=webp' },
            ].map((item, i) => (
              <div key={i} style={{ ...card, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: 200 }}>
                  <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #18181B 0%, #18181B 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.45)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>Before</span>
                  </div>
                  <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #22242f 0%, #2c2a22 100%)' }}>
                    <span style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(255,255,255,0.92)', color: '#0a0a0a', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>After</span>
                  </div>
                </div>
                <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: 13, color: DIM }}>{item.style}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 6. STYLE SHOWCASE                                              */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section style={sectionPad}>
          <h2 style={sectionTitle}>18+ Design Styles</h2>
          <p style={sectionSub}>From contemporary minimalism to classic Mediterranean warmth</p>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch' }}>
            {STYLES.map(s => (
              <div key={s.id} style={{
                flexShrink: 0, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '10px 18px',
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'default', whiteSpace: 'nowrap',
              }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {s.colors.map((c, i) => (
                    <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: c, border: '1px solid rgba(0,0,0,0.15)' }} />
                  ))}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: DIM }}>{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 7. FEATURE GRID                                                */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section id="pricing" style={{ ...sectionPad, background: 'rgba(255,255,255,0.03)' }}>
          <h2 style={sectionTitle}>Why Saguaro AI Design?</h2>
          <p style={sectionSub}>Built for construction professionals, loved by homeowners</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '48px 40px' }}>
            {[
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>, title: 'Photorealistic AI', desc: 'SDXL + ControlNet generates real-looking rooms, not cartoons' },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>, title: 'Instant Cost Estimate', desc: 'Know renovation costs before calling a contractor' },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"><circle cx="13.5" cy="6.5" r=".5" fill={TEXT}/><circle cx="17.5" cy="10.5" r=".5" fill={TEXT}/><circle cx="8.5" cy="7.5" r=".5" fill={TEXT}/><circle cx="6.5" cy="12" r=".5" fill={TEXT}/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>, title: '18 Design Styles', desc: 'Modern to Mediterranean, Farmhouse to Art Deco' },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"><path d="M2 20h20"/><path d="M5 20V8l7-5 7 5v12"/><path d="M9 20v-5h6v5"/></svg>, title: 'Construction-Ready', desc: 'Designs link directly to material takeoffs and contractor bids' },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, title: 'Exterior + Interior', desc: 'Redesign kitchens, bathrooms, yards, facades — any space' },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, title: 'Smart Upsells', desc: 'AI suggests upgrades based on your location and lifestyle' },
            ].map((f, i) => (
              <div key={i}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 8. COMPARISON TABLE                                            */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section id="compare" style={sectionPad}>
          <h2 style={sectionTitle}>Saguaro vs. Traditional Design Tools</h2>
          <p style={sectionSub}>See how we stack up against the alternatives</p>
          <div style={{ ...card, overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  <th style={{ textAlign: 'left', padding: '16px 20px', fontWeight: 500, color: DIM, fontSize: 13 }}>Feature</th>
                  <th style={{ textAlign: 'center', padding: '16px 20px', fontWeight: 600, color: TEXT, fontSize: 14 }}>Saguaro</th>
                  <th style={{ textAlign: 'center', padding: '16px 20px', fontWeight: 600, color: DIM }}>HomeDesigns.ai</th>
                  <th style={{ textAlign: 'center', padding: '16px 20px', fontWeight: 600, color: DIM }}>Hiring a Designer</th>
                  <th style={{ textAlign: 'center', padding: '16px 20px', fontWeight: 600, color: DIM }}>DIY</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Price', saguaro: 'Free / $29/mo', home: '$29/mo', designer: '$2,000+', diy: 'Free' },
                  { feature: 'Speed', saguaro: '30 seconds', home: '30 seconds', designer: '2\u20134 weeks', diy: 'Hours' },
                  { feature: 'Photorealistic Output', vals: ['check', 'check', 'check', 'x'] },
                  { feature: 'Cost Estimate', vals: ['check', 'x', 'tilde', 'x'] },
                  { feature: 'Contractor Connection', vals: ['check', 'x', 'tilde', 'x'] },
                  { feature: 'Interior + Exterior', vals: ['check', 'check', 'check', 'tilde'] },
                  { feature: 'Smart Home Integration', vals: ['check', 'x', 'tilde', 'x'] },
                  { feature: 'Construction Specs', vals: ['check', 'x', 'check', 'x'] },
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '14px 20px', fontWeight: 600 }}>{row.feature}</td>
                    {row.vals ? row.vals.map((v, j) => (
                      <td key={j} style={{ textAlign: 'center', padding: '14px 20px' }}>
                        {v === 'check' ? <CheckIcon /> : v === 'x' ? <XIcon /> : <TildeIcon />}
                      </td>
                    )) : (
                      <>
                        <td style={{ textAlign: 'center', padding: '14px 20px', fontWeight: 600, color: TEXT }}>{row.saguaro}</td>
                        <td style={{ textAlign: 'center', padding: '14px 20px', color: DIM }}>{row.home}</td>
                        <td style={{ textAlign: 'center', padding: '14px 20px', color: DIM }}>{row.designer}</td>
                        <td style={{ textAlign: 'center', padding: '14px 20px', color: DIM }}>{row.diy}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 9. TESTIMONIALS                                                */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section style={{ ...sectionPad, background: 'rgba(255,255,255,0.03)' }}>
          <h2 style={sectionTitle}>What Our Users Say</h2>
          <p style={sectionSub}>Trusted by contractors and homeowners across the country</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {[
              { stars: 5, quote: 'I showed the AI render to my client and they approved the kitchen remodel on the spot. Closed a $45K job in one meeting.', name: 'Mike Hernandez', title: 'GC, Scottsdale AZ' },
              { stars: 5, quote: 'The cost estimates are surprisingly accurate. I used to spend hours on rough numbers \u2014 now I get them instantly with the design.', name: 'Sarah Chen', title: 'Interior Designer, Austin TX' },
              { stars: 5, quote: 'We tried three other AI design tools. Saguaro is the only one that connects the design to actual construction specs and material lists.', name: 'David Park', title: 'Project Manager, Denver CO' },
            ].map((t, i) => (
              <div key={i} style={{ ...card, padding: '32px 28px' }}>
                <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                  {Array.from({ length: t.stars }).map((_, j) => <StarIcon key={j} />)}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT, marginBottom: 20, fontWeight: 400 }}>&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: DIM }}>{t.title}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 10. CTA SECTION                                                */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section style={{ ...sectionPad, textAlign: 'center' }}>
          <h2 style={{ ...sectionTitle, fontSize: 24 }}>Ready to Transform Your Space?</h2>
          <p style={{ ...sectionSub, marginBottom: 32 }}>Join 2,400+ homeowners and contractors using AI to visualize renovations.</p>
          <button onClick={scrollToStudio} style={{ ...goldBtn, padding: '12px 28px', fontSize: 14 }}>
            Start Designing &mdash; It&apos;s Free
          </button>
          <p style={{ fontSize: 13, color: DIM, marginTop: 12 }}>No credit card required</p>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 11. DESIGN STUDIO (Wizard)                                     */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <section ref={studioRef} id="studio" style={{ ...sectionPad, paddingTop: 40, paddingBottom: 100 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: DIM, fontSize: 10.5, fontWeight: 500, padding: '5px 12px', borderRadius: 999, marginBottom: 16 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD }} />Design Studio
            </span>
            <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8 }}>Create Your AI Design</h2>
            <p style={{ color: DIM, fontSize: 15, maxWidth: 480, margin: '0 auto' }}>Upload a photo, pick your style, and watch AI transform your space.</p>
          </div>

          {/* Progress Steps */}
          {step !== 'results' && (
            <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 20px 28px', display: 'flex', alignItems: 'center', gap: 0 }}>
              {STEP_ORDER.slice(0, 4).map((s, i) => (
                <React.Fragment key={s}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600,
                      background: i < stepIdx ? GREEN : i === stepIdx ? GOLD : 'transparent',
                      color: i <= stepIdx ? '#0A0A00' : DIM,
                      border: i <= stepIdx ? 'none' : '1px solid rgba(255,255,255,0.14)',
                      transition: 'all .3s',
                    }}>
                      {i < stepIdx ? '\u2713' : i + 1}
                    </div>
                    <span style={{ fontSize: 12, color: i === stepIdx ? TEXT : DIM, fontWeight: i === stepIdx ? 600 : 400, display: i === stepIdx ? 'inline' : 'none' }}>
                      {STEP_LABELS[s]}
                    </span>
                  </div>
                  {i < 3 && <div style={{ flex: 1, height: 1.5, background: i < stepIdx ? GREEN : BORDER, margin: '0 6px', transition: 'background .3s' }} />}
                </React.Fragment>
              ))}
            </div>
          )}

          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {/* ── STEP 1: UPLOAD ── */}
            {step === 'upload' && (
              <div style={{ animation: 'fadeInUp .25s ease-out' }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8 }}>
                    Upload Your Space
                  </h3>
                  <p style={{ color: DIM, fontSize: 15 }}>Take a photo or upload an image of the room you want to redesign.</p>
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    background: isDragging ? 'color-mix(in srgb, var(--brand-primary) 5%, transparent)' : 'rgba(255,255,255,0.02)',
                    border: `1px dashed ${isDragging ? GOLD : 'rgba(255,255,255,0.14)'}`,
                    borderRadius: 16, padding: photo ? 0 : '72px 40px', cursor: 'pointer',
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
                      <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: DIM }}>
                        <UploadCloudIcon />
                      </div>
                      <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Drop your photo here</p>
                      <p style={{ color: DIM, fontSize: 13, marginBottom: 20 }}>or click to browse &mdash; JPG, PNG up to 20MB</p>
                      <div style={{ display: 'inline-flex', gap: 12 }}>
                        <span style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 16px', fontSize: 12, color: DIM, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                          Camera
                        </span>
                        <span style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 16px', fontSize: 12, color: DIM, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          Gallery
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {photo && (
                  <div style={{ textAlign: 'center', marginTop: 24 }}>
                    <button onClick={goNext} style={goldBtn}>Continue &rarr;</button>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 2: ROOM TYPE ── */}
            {step === 'room' && (
              <div style={{ animation: 'fadeInUp .25s ease-out' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>What Type of Space Is This?</h3>
                  <p style={{ color: DIM, fontSize: 14 }}>Select the room type for the best AI results.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, maxWidth: 700, margin: '0 auto' }}>
                  {ROOMS.map(r => (
                    <button key={r.id} onClick={() => { setRoom(r.id); setTimeout(goNext, 200); }} style={{
                      background: room === r.id ? 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${room === r.id ? GOLD : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 14, padding: '20px 12px', cursor: 'pointer', transition: 'all .15s',
                      textAlign: 'center',
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: r.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                        <RoomIcon type={r.icon} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: room === r.id ? TEXT : DIM }}>{r.label}</div>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 28 }}>
                  <button onClick={goBack} style={{ padding: '10px 24px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: DIM, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>&larr; Back</button>
                  {room && <button onClick={goNext} style={{ padding: '10px 32px', background: GOLD, color: '#0A0A00', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Continue &rarr;</button>}
                </div>
              </div>
            )}

            {/* ── STEP 3: DESIGN STYLE ── */}
            {step === 'style' && (
              <div style={{ animation: 'fadeInUp .25s ease-out' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>Choose Your Style</h3>
                  <p style={{ color: DIM, fontSize: 14 }}>Pick the design aesthetic you love.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {STYLES.map(s => (
                    <button key={s.id} onClick={() => { setStyle(s.id); setTimeout(goNext, 200); }} style={{
                      background: style === s.id ? 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${style === s.id ? GOLD : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 14, padding: '16px', cursor: 'pointer', transition: 'all .15s',
                      textAlign: 'left',
                    }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                        {s.colors.map((c, i) => (
                          <div key={i} style={{ width: i === 0 ? 32 : 18, height: 18, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.15)' }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: style === s.id ? TEXT : TEXT, marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: DIM }}>{s.desc}</div>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 28 }}>
                  <button onClick={goBack} style={{ padding: '10px 24px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: DIM, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>&larr; Back</button>
                  {style && <button onClick={goNext} style={{ padding: '10px 32px', background: GOLD, color: '#0A0A00', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Continue &rarr;</button>}
                </div>
              </div>
            )}

            {/* ── STEP 4: CUSTOMIZE ── */}
            {step === 'customize' && (
              <div style={{ animation: 'fadeInUp .25s ease-out' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>Fine-Tune Your Design</h3>
                  <p style={{ color: DIM, fontSize: 14 }}>Adjust settings or add custom instructions.</p>
                </div>

                {/* Preview strip */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', ...card, padding: 12 }}>
                  {photo && <img src={photo} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{ROOMS.find(r => r.id === room)?.label} &rarr; {STYLES.find(s => s.id === style)?.label}</div>
                    <div style={{ fontSize: 12, color: DIM }}>{STYLES.find(s => s.id === style)?.desc}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {STYLES.find(s => s.id === style)?.colors.map((c, i) => (
                      <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid rgba(0,0,0,0.06)' }} />
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                  {/* Intensity */}
                  <div style={{ ...card, padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Transformation</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{Math.round(intensity * 100)}%</span>
                    </div>
                    <input type="range" min={30} max={95} value={Math.round(intensity * 100)}
                      onChange={(e) => setIntensity(Number(e.target.value) / 100)}
                      style={{ width: '100%', accentColor: GOLD, cursor: 'pointer', height: 6 }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: DIM, marginTop: 6 }}>
                      <span>Subtle Refresh</span>
                      <span>Complete Reimagine</span>
                    </div>
                  </div>

                  {/* Variations */}
                  <div style={{ ...card, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Design Variations</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[1, 2, 3].map(n => (
                        <button key={n} onClick={() => setNumOutputs(n)} style={{
                          flex: 1, padding: '12px', borderRadius: 8, border: `1px solid ${numOutputs === n ? GOLD : 'rgba(255,255,255,0.12)'}`,
                          background: numOutputs === n ? 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' : 'transparent', color: numOutputs === n ? TEXT : DIM,
                          fontWeight: 600, fontSize: 16, cursor: 'pointer', transition: 'all .15s',
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
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    Custom Instructions <span style={{ fontWeight: 400, color: DIM }}>(optional)</span>
                  </div>
                  <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Add specific details… e.g., 'I want a large island with seating for 4, pendant lights, and a wine fridge'"
                    rows={3} style={{
                      width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                      padding: 14, color: TEXT, fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                    }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <button onClick={goBack} style={{ padding: '10px 24px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: DIM, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>&larr; Back</button>
                  <button onClick={handleGenerate} style={{ ...goldBtn, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SparkleIcon /> Generate Design
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 5: GENERATING ── */}
            {step === 'generating' && (
              <div style={{ animation: 'fadeInUp .25s ease-out', textAlign: 'center', paddingTop: 60 }}>
                <div style={{ width: 100, height: 100, borderRadius: '50%', margin: '0 auto 32px', position: 'relative' }}>
                  <div style={{
                    width: '100%', height: '100%', borderRadius: '50%',
                    background: `conic-gradient(${GOLD}, color-mix(in srgb, var(--brand-primary) 8%, transparent))`,
                    animation: 'spin 3s linear infinite', opacity: 0.9,
                  }} />
                  <div style={{
                    position: 'absolute', inset: 8, borderRadius: '50%', background: 'var(--bg-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <SparkleIcon />
                  </div>
                </div>

                <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8 }}>
                  Creating Your Design
                </h2>
                <p style={{ color: DIM, fontSize: 14, marginBottom: 32, minHeight: 20, transition: 'all .3s' }}>
                  {progress.message || GEN_MESSAGES[genMsgIdx]}
                </p>

                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4, transition: 'width .5s ease',
                      width: `${progress.pct || 10}%`,
                      background: GOLD,
                    }} />
                  </div>
                  <div style={{ fontSize: 13, color: DIM, fontWeight: 600, marginTop: 8 }}>
                    {progress.pct || 10}%
                  </div>
                </div>

                <div style={{ marginTop: 48, ...card, padding: '16px 24px', maxWidth: 500, margin: '48px auto 0', textAlign: 'left' }}>
                  <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 8 }}>Did You Know?</div>
                  <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6 }}>
                    Saguaro uses ControlNet AI to preserve your room&apos;s structure while completely transforming the style. Walls, windows, and doors stay in place &mdash; only the design changes.
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 6: RESULTS ── */}
            {step === 'results' && result && !result.error && (
              <div style={{ animation: 'fadeInUp .25s ease-out' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
                      Your {STYLES.find(s => s.id === style)?.label} Design
                    </h3>
                    <p style={{ color: DIM, fontSize: 13 }}>{ROOMS.find(r => r.id === room)?.label} Redesign</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={resetAll} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: DIM, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>New Design</button>
                    <button onClick={() => setStep('customize')} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: DIM, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Adjust &amp; Retry</button>
                  </div>
                </div>

                {/* Before/After Slider */}
                {result.generatedUrls?.length > 0 && photo && (
                  <div style={{ ...card, overflow: 'hidden', marginBottom: 20 }}>
                    {result.generatedUrls.length > 1 && (
                      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}` }}>
                        {result.generatedUrls.map((_: string, idx: number) => (
                          <button key={idx} onClick={() => setCompareIdx(idx)} style={{
                            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                            background: 'transparent',
                            color: compareIdx === idx ? TEXT : DIM, fontWeight: compareIdx === idx ? 600 : 400, fontSize: 13,
                            borderBottom: compareIdx === idx ? `2px solid ${GOLD}` : '2px solid transparent',
                            transition: 'all .15s',
                          }}>Design {idx + 1}</button>
                        ))}
                      </div>
                    )}

                    <div ref={sliderRef} style={{ position: 'relative', cursor: 'ew-resize', userSelect: 'none', aspectRatio: '16/10', overflow: 'hidden' }}
                      onMouseDown={(e) => { handleSliderMove(e.clientX); const mv = (ev: MouseEvent) => handleSliderMove(ev.clientX); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); }}
                      onTouchStart={(e) => handleSliderMove(e.touches[0].clientX)}
                      onTouchMove={(e) => handleSliderMove(e.touches[0].clientX)}>
                      <img src={result.generatedUrls[compareIdx]} alt="After" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', top: 0, left: 0, width: `${sliderPos}%`, height: '100%', overflow: 'hidden' }}>
                        <img src={photo} alt="Before" style={{ width: sliderRef.current ? sliderRef.current.offsetWidth : 900, height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ position: 'absolute', top: 0, left: `${sliderPos}%`, width: 2, height: '100%', background: '#fff', transform: 'translateX(-1px)', zIndex: 10, boxShadow: '0 0 12px rgba(0,0,0,0.5)' }} />
                      <div style={{ position: 'absolute', top: '50%', left: `${sliderPos}%`, width: 36, height: 36, borderRadius: '50%', background: '#fff', border: `3px solid ${GOLD}`, transform: 'translate(-50%,-50%)', zIndex: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.4)', cursor: 'ew-resize' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: GOLD }} strokeWidth="2.5" strokeLinecap="round">
                          <path d="M18 8l4 4-4 4"/><path d="M6 8l-4 4 4 4"/>
                        </svg>
                      </div>
                      <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,.6)', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500, zIndex: 5, backdropFilter: 'blur(4px)' }}>Before</div>
                      <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.92)', color: '#0a0a0a', padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, zIndex: 5 }}>After</div>
                    </div>
                  </div>
                )}

                {/* Claude fallback notice */}
                {(!result.generatedUrls || result.generatedUrls.length === 0) && result.note && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>Text-Only Mode</div>
                      <div style={{ fontSize: 12, color: DIM }}>{result.note}</div>
                    </div>
                  </div>
                )}

                {/* Cost + Details */}
                {result.costEstimate && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div style={{ ...card, padding: '16px 20px' }}>
                      <div style={{ fontSize: 11, color: DIM, marginBottom: 6 }}>Estimated Cost</div>
                      <div style={{ fontSize: 20, fontWeight: 600, color: GREEN }}>
                        {fmt$(result.costEstimate.cost_low || 0)} &ndash; {fmt$(result.costEstimate.cost_high || 0)}
                      </div>
                    </div>
                    <div style={{ ...card, padding: '16px 20px' }}>
                      <div style={{ fontSize: 11, color: DIM, marginBottom: 6 }}>Timeline</div>
                      <div style={{ fontSize: 20, fontWeight: 600 }}>{result.costEstimate.timeline_weeks || '?'} <span style={{ fontSize: 14, fontWeight: 400, color: DIM }}>weeks</span></div>
                    </div>
                    <div style={{ ...card, padding: '16px 20px' }}>
                      <div style={{ fontSize: 11, color: DIM, marginBottom: 6 }}>Difficulty</div>
                      <div style={{ fontSize: 20, fontWeight: 600, color: result.costEstimate.difficulty === 'complex' ? RED : result.costEstimate.difficulty === 'moderate' ? GOLD : GREEN }}>
                        {(result.costEstimate.difficulty || 'moderate').charAt(0).toUpperCase() + (result.costEstimate.difficulty || 'moderate').slice(1)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Description */}
                {result.costEstimate?.description && (
                  <div style={{ ...card, padding: 20, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Design Description</div>
                    <p style={{ color: DIM, fontSize: 13, lineHeight: 1.7 }}>{result.costEstimate.description}</p>
                    {result.costEstimate.color_palette && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                        {result.costEstimate.color_palette.map((c: string, i: number) => (
                          <div key={i} style={{ width: 28, height: 28, borderRadius: 6, background: c, border: '1px solid rgba(0,0,0,0.06)' }} title={c} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Materials */}
                {result.costEstimate?.materials?.length > 0 && (
                  <div style={{ ...card, padding: 20, marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Materials &amp; Cost Breakdown</div>
                    {result.costEstimate.materials.map((m: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < result.costEstimate.materials.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', fontSize: 13 }}>
                        <div>
                          <span style={{ fontWeight: 500 }}>{m.name}</span>
                          {m.csi_code && <span style={{ color: DIM, fontSize: 11, marginLeft: 8 }}>{m.csi_code}</span>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ color: DIM, marginRight: 12 }}>{m.quantity} {m.unit}</span>
                          <span style={{ fontWeight: 600, color: TEXT }}>{fmt$(m.total || 0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* CTAs */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Link href="/design/discover" style={{ textDecoration: 'none' }}>
                    <button style={goldBtn}>Get a Free Quote</button>
                  </Link>
                  <Link href="/design/packages" style={{ textDecoration: 'none' }}>
                    <button style={outlineBtn}>Smart Packages</button>
                  </Link>
                  <Link href="/design/roi" style={{ textDecoration: 'none' }}>
                    <button style={{ padding: '10px 22px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: DIM, borderRadius: 8, fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>ROI Calculator</button>
                  </Link>
                </div>
              </div>
            )}

            {/* Error */}
            {step === 'results' && result?.error && (
              <div style={{ animation: 'fadeInUp .25s ease-out', textAlign: 'center', paddingTop: 60 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 16 }}>
                  <circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something Went Wrong</h2>
                <p style={{ color: DIM, fontSize: 14, marginBottom: 24 }}>{result.error}</p>
                <button onClick={() => setStep('customize')} style={{ ...goldBtn, padding: '12px 32px', fontSize: 14 }}>Try Again</button>
              </div>
            )}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* 12. FOOTER                                                     */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <footer style={{ background: 'var(--bg-base)', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#A3A3A3', padding: '64px 24px 32px' }}>
          <div style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 40, marginBottom: 48 }}>
            {/* Every one of these was href="#" — fourteen footer links that took
                a click and did nothing. Each now points at the page it names.
                "Press" is gone rather than aimed somewhere wrong: there is no
                press page, and a link to the wrong page is worse than no link. */}
            {[
              { title: 'Product', links: [['AI Design', '/design'], ['Takeoff', '/takeoff'], ['Field App', '/get-the-app'], ['Portals', '/portals']] },
              { title: 'Company', links: [['About', '/about'], ['Careers', '/careers'], ['Contact', '/contact']] },
              { title: 'Resources', links: [['Help Center', '/help-center'], ['API Docs', '/api-docs'], ['Blog', '/blog'], ['Compare', '/compare']] },
              { title: 'Legal', links: [['Privacy', '/privacy'], ['Terms', '/terms'], ['Security', '/security']] },
            ].map((col, i) => (
              <div key={i}>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{col.title}</div>
                {col.links.map(([label, href]) => (
                  <Link key={label} href={href} style={{ display: 'block', color: '#A3A3A3', fontSize: 13, textDecoration: 'none', marginBottom: 10, transition: 'color .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = '#A3A3A3')}>
                    {label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: GOLD, fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>Saguaro</span>
            <span style={{ fontSize: 13, color: '#666' }}>&copy; 2026 Saguaro Control Systems. All rights reserved.</span>
          </div>
        </footer>
      </div>

      {/* ── Global Keyframe Animations ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { overflow-x: hidden; }
        input[type="range"]::-webkit-slider-thumb { cursor: pointer; }
        ::-webkit-scrollbar { height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
      ` }} />
    </div>
  );
}
