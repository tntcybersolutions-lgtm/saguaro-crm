'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

const BG = '#f8f9fa';
const CARD = '#ffffff';
const BORDER_LT = '#e2e8f0';
const TEXT_DARK = '#1a202c';
const TEXT_MED = '#4a5568';
const TEXT_DIM = '#718096';
const GOLD = '#C8960F';
const GREEN = '#16a34a';
const RED = '#dc2626';

interface SignatureInfo {
  id: string;
  doc_title: string;
  doc_type: string;
  pdf_url: string;
  signer_name: string;
  signer_email: string;
  signer_company: string;
  signer_role: string;
}

interface RequestInfo {
  id: string;
  message: string;
  sent_at: string;
}

type PageState = 'loading' | 'ready' | 'signed' | 'error';

export default function PublicSigningPage() {
  const params = useParams();
  const token = params?.token as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [signature, setSignature] = useState<SignatureInfo | null>(null);
  const [request, setRequest] = useState<RequestInfo | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);

  // ─── Fetch token info ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/documents/sign/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok || !data.valid) {
          setErrorMsg(data.error || 'Invalid or expired signing link');
          setPageState('error');
          return;
        }
        setSignature(data.signature);
        setRequest(data.request);
        setCompanyName(data.company_name || '');
        setPageState('ready');
      } catch {
        setErrorMsg('Failed to load signing request');
        setPageState('error');
      }
    })();
  }, [token]);

  // ─── Canvas drawing ────────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (parent) {
      c.width = parent.clientWidth;
      c.height = 160;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    // Baseline
    ctx.beginPath();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.moveTo(20, c.height - 30);
    ctx.lineTo(c.width - 20, c.height - 30);
    ctx.stroke();
    ctx.fillStyle = TEXT_DIM;
    ctx.font = '11px sans-serif';
    ctx.fillText('Sign above', 20, c.height - 12);
  }, []);

  useEffect(() => {
    if (pageState === 'ready' && mode === 'draw') {
      setTimeout(initCanvas, 50);
    }
  }, [pageState, mode, initCanvas]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) e.preventDefault();
    drawing.current = true;
    hasStrokes.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(x, y);
  };

  const moveDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing.current) return;
    if ('touches' in e) e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => { drawing.current = false; };

  const clearCanvas = () => {
    hasStrokes.current = false;
    initCanvas();
  };

  // ─── Generate typed signature as canvas ────────────────────────────
  const generateTypedSignature = (): string => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 100;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#1a202c';
    ctx.font = 'italic 36px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, 20, 50);
    return c.toDataURL('image/png');
  };

  // ─── Submit signature ──────────────────────────────────────────────
  const handleSign = async () => {
    if (!agreed) return;
    let sigData = '';

    if (mode === 'draw') {
      if (!hasStrokes.current) return;
      sigData = canvasRef.current?.toDataURL('image/png') || '';
    } else {
      if (!typedName.trim()) return;
      sigData = generateTypedSignature();
    }

    setSigning(true);
    try {
      const res = await fetch('/api/documents/sign/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signature_data: sigData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sign');
      setPageState('signed');
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  const canSign = agreed && (mode === 'draw' ? hasStrokes.current : typedName.trim().length > 0);

  // ─── Loading ───────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${BORDER_LT}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ margin: 0, color: TEXT_DIM, fontSize: 14 }}>Loading document...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  // ─── Error ─────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <div style={{ background: CARD, borderRadius: 16, padding: 40, textAlign: 'center', maxWidth: 420, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(220,38,38,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
            !
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, color: TEXT_DARK, fontWeight: 700 }}>Unable to Load</h2>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_MED }}>{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ─── Success ───────────────────────────────────────────────────────
  if (pageState === 'signed') {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <div style={{ background: CARD, borderRadius: 16, padding: 40, textAlign: 'center', maxWidth: 420, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(22,163,74,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, color: TEXT_DARK, fontWeight: 700 }}>Document Signed Successfully!</h2>
          <p style={{ margin: '0 0 4px', fontSize: 14, color: TEXT_MED }}>
            {signature?.doc_title}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
            You may close this page. A copy will be sent to your email.
          </p>
        </div>
      </div>
    );
  }

  // ─── Ready: Signing Form ───────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '24px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: TEXT_DARK }}>
            Document Signing
          </h1>
          {companyName && (
            <p style={{ margin: 0, fontSize: 14, color: TEXT_MED }}>From {companyName}</p>
          )}
        </div>

        {/* Document Info */}
        <div style={{ background: CARD, border: `1px solid ${BORDER_LT}`, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: TEXT_DARK }}>{signature?.doc_title}</h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>Signer</span>
              <p style={{ margin: '2px 0 0', fontSize: 14, color: TEXT_DARK }}>{signature?.signer_name}</p>
            </div>
            {signature?.signer_company && (
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>Company</span>
                <p style={{ margin: '2px 0 0', fontSize: 14, color: TEXT_DARK }}>{signature.signer_company}</p>
              </div>
            )}
          </div>
          {signature?.pdf_url && (
            <a
              href={signature.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(212,160,23,.06)', border: `1px solid rgba(212,160,23,.2)`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              View PDF Document
            </a>
          )}
        </div>

        {/* Message */}
        {request?.message && (
          <div style={{ background: CARD, border: `1px solid ${BORDER_LT}`, borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>Message</p>
            <p style={{ margin: 0, fontSize: 14, color: TEXT_DARK, whiteSpace: 'pre-wrap' }}>{request.message}</p>
          </div>
        )}

        {/* Signature Area */}
        <div style={{ background: CARD, border: `1px solid ${BORDER_LT}`, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: TEXT_DARK }}>Your Signature</p>

          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: '#edf2f7', borderRadius: 8, padding: 3 }}>
            {(['draw', 'type'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: 6,
                  background: mode === m ? CARD : 'transparent',
                  color: mode === m ? TEXT_DARK : TEXT_DIM,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                }}
              >
                {m === 'draw' ? 'Draw' : 'Type'}
              </button>
            ))}
          </div>

          {mode === 'draw' ? (
            <div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER_LT}` }}>
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block', width: '100%', height: 160, touchAction: 'none', cursor: 'crosshair' }}
                  onTouchStart={startDraw}
                  onTouchMove={moveDraw}
                  onTouchEnd={endDraw}
                  onMouseDown={startDraw}
                  onMouseMove={moveDraw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                />
              </div>
              <button type="button" onClick={clearCanvas} style={{ marginTop: 8, background: 'transparent', border: `1px solid ${BORDER_LT}`, borderRadius: 6, padding: '6px 16px', color: TEXT_DIM, fontSize: 12, cursor: 'pointer' }}>
                Clear
              </button>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder="Type your full name"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '12px 16px',
                  border: `1px solid ${BORDER_LT}`, borderRadius: 8,
                  fontSize: 13, color: TEXT_DARK, outline: 'none',
                }}
              />
              {typedName.trim() && (
                <div style={{ marginTop: 12, padding: '16px 20px', border: `1px solid ${BORDER_LT}`, borderRadius: 8, background: '#fefefe' }}>
                  <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 32, color: TEXT_DARK }}>{typedName}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Agreement Checkbox */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, accentColor: GOLD, width: 18, height: 18 }}
            />
            <span style={{ fontSize: 13, color: TEXT_MED, lineHeight: 1.5 }}>
              I agree to sign this document electronically. I understand this electronic signature is legally binding.
            </span>
          </label>
        </div>

        {/* Error */}
        {errorMsg && pageState === 'ready' && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: RED }}>{errorMsg}</p>
        )}

        {/* Sign Button */}
        <button
          type="button"
          disabled={!canSign || signing}
          onClick={handleSign}
          style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: 10,
            background: canSign && !signing ? GOLD : '#cbd5e1',
            color: canSign && !signing ? '#000' : '#94a3b8',
            fontSize: 15, fontWeight: 800, cursor: canSign && !signing ? 'pointer' : 'not-allowed',
          }}
        >
          {signing ? 'Signing...' : 'Sign Document'}
        </button>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: TEXT_DIM }}>
          Powered by Saguaro
        </p>
      </div>
    </div>
  );
}
