'use client';
/**
 * Saguaro Field — QR Code Scanner + Generator
 * Scan tab: BarcodeDetector API via camera feed.
 * Generate tab: qrserver.com API for instant QR images.
 */
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD = '#D4A017', RAISED = '#0D1D2E', BORDER = '#1E3A5F', TEXT = '#F0F4FF', DIM = '#8BAAC8';
const GREEN = '#22C55E', BLUE = '#3B82F6';

function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

const MAX_HISTORY = 5;

interface ScanResult {
  text: string;
  scannedAt: string;
}

type Tab = 'scan' | 'generate';

const QUICK_OPTS = [
  { label: 'Current Project', path: '' },
  { label: 'Punch List', path: '/field/punch' },
  { label: 'Daily Log', path: '/field/log' },
  { label: 'Inspect', path: '/field/inspect' },
  { label: 'Photos', path: '/field/photos' },
];

function QRPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [tab, setTab] = useState<Tab>('scan');

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string>('');
  const [scanError, setScanError] = useState<string>('');
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } | null>(null);
  const scanLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate state
  const [genText, setGenText] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // Load scan history from localStorage
    try {
      const stored = localStorage.getItem('field_qr_history');
      if (stored) setScanHistory(JSON.parse(stored));
    } catch { /* ignore */ }

    // Set default generate text
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    setGenText(projectId ? `${base}/field?projectId=${projectId}` : `${base}/field`);

    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    if (scanLoopRef.current) { clearInterval(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const startCamera = async () => {
    setScanResult('');
    setScanError('');

    // Check BarcodeDetector support
    if (!('BarcodeDetector' in window)) {
      setScanError('QR scanning is not supported on this browser. Try Chrome on Android or a modern desktop Chrome.');
      return;
    }

    try {
      detectorRef.current = new (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({ formats: ['qr_code'] });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScanning(true);

      // Scan every 400ms
      scanLoopRef.current = setInterval(async () => {
        if (!videoRef.current || !detectorRef.current) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes.length > 0) {
            const text = codes[0].rawValue;
            stopCamera();
            setScanResult(text);
            addToHistory(text);
          }
        } catch { /* continue */ }
      }, 400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanError(`Camera access denied: ${msg}`);
    }
  };

  const addToHistory = (text: string) => {
    const entry: ScanResult = { text, scannedAt: new Date().toISOString() };
    setScanHistory(prev => {
      const updated = [entry, ...prev.filter(h => h.text !== text)].slice(0, MAX_HISTORY);
      try { localStorage.setItem('field_qr_history', JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  };

  const isFieldUrl = (text: string): boolean => {
    try {
      const u = new URL(text);
      return u.pathname.startsWith('/field') || u.pathname.startsWith('/app/');
    } catch { return false; }
  };

  const generateQR = () => {
    if (!genText.trim()) return;
    setGenerating(true);
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(genText.trim())}&bgcolor=0f1d2b&color=D4A017`;
    setQrUrl(url);
  };

  const downloadQR = async () => {
    if (!qrUrl) return;
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'saguaro-qr.png';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* fallback */ window.open(qrUrl, '_blank'); }
  };

  const shareQR = async () => {
    if (!genText.trim()) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Saguaro QR Code', url: genText.trim() });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(genText.trim());
      alert('Link copied to clipboard!');
    }
  };

  const setQuickOpt = (path: string) => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const suffix = projectId ? `?projectId=${projectId}` : '';
    if (path === '') {
      setGenText(`${base}/field${suffix}`);
    } else {
      setGenText(`${base}${path}${suffix}`);
    }
    setQrUrl('');
  };

  const relTime = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div style={{ padding: '18px 16px', paddingBottom: 40 }}>
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>

      <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: TEXT }}>QR Scanner</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#07101C', borderRadius: 12, padding: 4, marginBottom: 20, border: `1px solid ${BORDER}` }}>
        {(['scan', 'generate'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === 'scan' && scanning) { /* keep */ } else if (t !== 'scan') stopCamera(); }}
            style={{
              flex: 1,
              background: tab === t ? RAISED : 'transparent',
              border: `1px solid ${tab === t ? BORDER : 'transparent'}`,
              borderRadius: 9,
              padding: '10px',
              color: tab === t ? TEXT : DIM,
              fontSize: 14,
              fontWeight: tab === t ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {t === 'scan' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx={12} cy={13} r={4}/></svg>Scan</span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Generate</span>
            )}
          </button>
        ))}
      </div>

      {/* SCAN TAB */}
      {tab === 'scan' && (
        <div>
          {/* Camera box */}
          <div style={{
            width: '100%',
            aspectRatio: '1',
            background: '#000',
            borderRadius: 16,
            overflow: 'hidden',
            border: `2px solid ${scanning ? GOLD : BORDER}`,
            position: 'relative',
            marginBottom: 16,
          }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: scanning ? 'block' : 'none' }}
            />
            {!scanning && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ color: DIM, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={56} height={56}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx={12} cy={13} r={4}/></svg></div>
                <p style={{ margin: 0, fontSize: 14, color: DIM, textAlign: 'center', padding: '0 20px' }}>Point camera at a QR code</p>
              </div>
            )}
            {scanning && (
              <>
                {/* Corner marks */}
                {[['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']].map(([v, h]) => (
                  <div key={`${v}${h}`} style={{
                    position: 'absolute',
                    [v]: 20,
                    [h]: 20,
                    width: 24,
                    height: 24,
                    borderTop: v === 'top' ? `3px solid ${GOLD}` : 'none',
                    borderBottom: v === 'bottom' ? `3px solid ${GOLD}` : 'none',
                    borderLeft: h === 'left' ? `3px solid ${GOLD}` : 'none',
                    borderRight: h === 'right' ? `3px solid ${GOLD}` : 'none',
                  }} />
                ))}
                <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: 'rgba(255,255,255,.6)', background: 'rgba(0,0,0,.5)', borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  Scanning...
                </div>
              </>
            )}
          </div>

          {scanError && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 13, color: '#EF4444' }}>
              {scanError}
            </div>
          )}

          {/* Scan result */}
          {scanResult && (
            <div style={{ background: `rgba(${hr(GREEN)}, .08)`, border: `1px solid rgba(${hr(GREEN)}, .3)`, borderRadius: 14, padding: '14px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 0.8 }}>Scanned Successfully</p>
              <p style={{ margin: '0 0 10px', fontSize: 14, color: TEXT, wordBreak: 'break-all', lineHeight: 1.4 }}>{scanResult}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {isFieldUrl(scanResult) && (
                  <button
                    onClick={() => {
                      try { const u = new URL(scanResult); router.push(u.pathname + u.search); } catch { window.location.href = scanResult; }
                    }}
                    style={{ flex: 1, background: GOLD, border: 'none', borderRadius: 8, padding: '10px', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                  >
                    Open →
                  </button>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(scanResult); }}
                  style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}
                >
                  Copy
                </button>
                <button
                  onClick={() => { setScanResult(''); }}
                  style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Camera controls */}
          {!scanning ? (
            <button
              onClick={startCamera}
              style={{ width: '100%', background: GOLD, border: 'none', borderRadius: 12, padding: '16px', color: '#000', fontSize: 16, fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}
            >
              Start Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              style={{ width: '100%', background: 'transparent', border: `1px solid #EF4444`, borderRadius: 12, padding: '14px', color: '#EF4444', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}
            >
              Stop Camera
            </button>
          )}

          {/* Scan history */}
          {scanHistory.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Recent Scans</p>
                <button
                  onClick={() => { setScanHistory([]); localStorage.removeItem('field_qr_history'); }}
                  style={{ background: 'none', border: 'none', color: DIM, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Clear
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scanHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setScanResult(h.text)}
                    style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <span style={{ flexShrink: 0, color: DIM, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM }}>{relTime(h.scannedAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* GENERATE TAB */}
      {tab === 'generate' && (
        <div>
          {/* Quick options */}
          <p style={{ margin: '0 0 8px', fontSize: 12, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Quick Options</p>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
            {QUICK_OPTS.map(opt => (
              <button
                key={opt.label}
                onClick={() => setQuickOpt(opt.path)}
                style={{
                  flexShrink: 0,
                  background: 'transparent',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 20,
                  padding: '6px 13px',
                  color: DIM,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Text input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Content to Encode</label>
            <textarea
              value={genText}
              onChange={e => { setGenText(e.target.value); setQrUrl(''); }}
              placeholder="URL or text to encode..."
              rows={3}
              style={{ ...inp, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>

          <button
            onClick={generateQR}
            disabled={!genText.trim()}
            style={{
              width: '100%',
              background: genText.trim() ? GOLD : '#1E3A5F',
              border: 'none',
              borderRadius: 12,
              padding: '15px',
              color: genText.trim() ? '#000' : DIM,
              fontSize: 15,
              fontWeight: 800,
              cursor: genText.trim() ? 'pointer' : 'default',
              marginBottom: 20,
            }}
          >
            Generate QR Code
          </button>

          {/* QR Display */}
          {qrUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, display: 'inline-flex' }}>
                <img
                  src={qrUrl}
                  alt="QR Code"
                  width={250}
                  height={250}
                  onLoad={() => setGenerating(false)}
                  onError={() => setGenerating(false)}
                  style={{ borderRadius: 8, display: 'block' }}
                />
              </div>

              <p style={{ margin: 0, fontSize: 12, color: DIM, textAlign: 'center', wordBreak: 'break-all', maxWidth: 280 }}>
                {genText}
              </p>

              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                <button
                  onClick={shareQR}
                  style={{ flex: 1, background: `rgba(${hr(BLUE)}, .15)`, border: `1px solid rgba(${hr(BLUE)}, .3)`, borderRadius: 10, padding: '13px', color: BLUE, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  Share
                </button>
                <button
                  onClick={downloadQR}
                  style={{ flex: 1, background: GOLD, border: 'none', borderRadius: 10, padding: '13px', color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
                >
                  Download
                </button>
              </div>
            </div>
          )}

          {!qrUrl && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: DIM }}>
              <div style={{ marginBottom: 10, color: DIM, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={48} height={48}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
              <p style={{ margin: 0, fontSize: 14 }}>Select a quick option or enter custom text, then tap Generate.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FieldQRPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <QRPage />
    </Suspense>
  );
}
