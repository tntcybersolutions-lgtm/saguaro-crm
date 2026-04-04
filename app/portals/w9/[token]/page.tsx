'use client';
/**
 * W-9 Portal — Full IRS W-9 collection with e-signature + PDF generation.
 * Vendors draw or type their signature, submit, get PDF download + email confirmation.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import PortalHeader from '../../../../components/PortalHeader';
import { ShieldCheck, DownloadSimple, EnvelopeSimple, CheckCircle, Warning, PenNib, Textbox } from '@phosphor-icons/react';

const GOLD='#C8960F',BG='#F8F9FB',WHITE='#ffffff',BORDER='#E2E5EA',DIM='#6B7280',TEXT='#111827',GREEN='#16A34A',RED='#DC2626';

export default function W9Portal() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [refNumber, setRefNumber] = useState('');

  // Signature state
  const [sigMode, setSigMode] = useState<'draw' | 'type'>('draw');
  const [sigTyped, setSigTyped] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const [form, setForm] = useState({
    legalName: '', businessName: '', taxClassification: 'individual',
    exemptPayeeCode: '', exemptFromFatca: '',
    address: '', cityStateZip: '', accountNumbers: '',
    tinType: 'ssn' as 'ssn' | 'ein', tin: '',
    certify: false,
    signatureDate: new Date().toISOString().split('T')[0],
  });

  // Load request info
  useEffect(() => {
    fetch('/api/portals/w9/' + token)
      .then(r => r.json())
      .then(d => { setInfo(d.request); if (d.request?.status === 'submitted') setSubmitted(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  // Canvas drawing handlers
  const getCtx = useCallback(() => canvasRef.current?.getContext('2d'), []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const ctx = getCtx();
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }, [getCtx]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = TEXT;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasDrawn(true);
  }, [isDrawing, getCtx]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  const clearCanvas = useCallback(() => {
    const ctx = getCtx();
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setHasDrawn(false);
    }
  }, [getCtx]);

  // Get signature as base64
  function getSignatureData(): string | null {
    if (sigMode === 'draw') {
      if (!hasDrawn || !canvasRef.current) return null;
      return canvasRef.current.toDataURL('image/png');
    } else {
      if (!sigTyped.trim()) return null;
      // Render typed name as image via canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 400;
      tempCanvas.height = 80;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 400, 80);
      ctx.fillStyle = TEXT;
      ctx.font = 'italic 32px Georgia, "Times New Roman", serif';
      ctx.fillText(sigTyped, 20, 52);
      return tempCanvas.toDataURL('image/png');
    }
  }

  const hasSig = sigMode === 'draw' ? hasDrawn : sigTyped.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.certify) { setFeedback('You must check the certification box.'); return; }
    if (!form.tin || form.tin.replace(/\D/g, '').length < 9) { setFeedback('Please enter a valid 9-digit TIN.'); return; }
    if (!hasSig) { setFeedback('Please provide your signature.'); return; }
    if (!form.legalName.trim()) { setFeedback('Legal name is required.'); return; }

    const signatureData = getSignatureData();
    if (!signatureData) { setFeedback('Signature capture failed. Please try again.'); return; }

    setSaving(true);
    setFeedback('');
    try {
      const res = await fetch('/api/portals/w9/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          signatureName: sigMode === 'type' ? sigTyped : form.legalName,
          signatureData,
          signatureMethod: sigMode,
          signedAt: new Date().toISOString(),
          ipAddress: 'captured-server-side',
        }),
      });
      const d = await res.json();
      if (d.success) {
        setSubmitted(true);
        if (d.pdfUrl) setPdfUrl(d.pdfUrl);
        setRefNumber(d.referenceNumber || `W9-${Date.now().toString(36).toUpperCase()}`);
      } else {
        setFeedback(d.error || 'Submission failed. Please try again.');
      }
    } catch {
      setFeedback('Network error. Please check your connection and try again.');
    }
    setSaving(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
    padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5,
    textTransform: 'uppercase', letterSpacing: 0.5,
  };

  // ── Loading State ──
  if (loading) return (
    <>
      <PortalHeader portalName="W-9 Portal" showBackToPortals={false} />
      <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM }}>Loading...</div>
    </>
  );

  // ── Invalid Token ──
  if (!info) return (
    <>
      <PortalHeader portalName="W-9 Portal" showBackToPortals={false} />
      <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Warning size={48} weight="duotone" color={RED} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: '16px 0 8px' }}>Invalid or Expired Link</h2>
          <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6 }}>This W-9 request link is no longer valid. Please contact your project manager for a new link.</p>
        </div>
      </div>
    </>
  );

  // ── Success Screen ──
  if (submitted) return (
    <>
      <PortalHeader portalName="W-9 Portal" showBackToPortals={false} />
      <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${GREEN}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={40} weight="fill" color={GREEN} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: '0 0 8px' }}>W-9 Submitted Successfully</h2>
          <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6, margin: '0 0 24px' }}>
            Thank you, <strong style={{ color: TEXT }}>{info.vendorName}</strong>. Your W-9 has been securely submitted for <strong style={{ color: TEXT }}>{info.projectName}</strong>.
          </p>

          {/* Reference Number */}
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 20px', marginBottom: 16, textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Reference Number</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, fontFamily: 'monospace' }}>{refNumber}</div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: GOLD, color: WHITE, borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
              >
                <DownloadSimple size={18} weight="bold" /> Download PDF
              </a>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 20px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 13 }}>
              <EnvelopeSimple size={16} /> Confirmation email sent
            </div>
          </div>

          <p style={{ fontSize: 12, color: DIM, marginTop: 24 }}>
            Save your reference number for your records. A copy of this W-9 has been sent to your email and to the requesting contractor.
          </p>
        </div>
      </div>
    </>
  );

  // ── W-9 Form ──
  return (
    <>
      <PortalHeader portalName="W-9 Portal" subtitle={`For: ${info.vendorName}`} showBackToPortals={false} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        {/* Project Banner */}
        <div style={{ background: `${GOLD}08`, border: `1px solid ${GOLD}30`, borderRadius: 10, padding: '16px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={24} weight="duotone" color={GOLD} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>W-9 Request — {info.projectName}</div>
            <div style={{ fontSize: 13, color: DIM, marginTop: 2 }}>
              Provide your tax information for <strong style={{ color: TEXT }}>{info.vendorName}</strong>. All data is encrypted in transit and at rest.
            </div>
          </div>
        </div>

        <form onSubmit={submit}>
          {/* Part I: Identification */}
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 14, color: TEXT, background: BG }}>Part I — Identification</div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Legal Name (as shown on income tax return) *</label>
                <input value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} placeholder="John Smith or ABC Construction LLC" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Business / DBA Name (if different)</label>
                <input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="Trade name or DBA" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Federal Tax Classification *</label>
                <select value={form.taxClassification} onChange={e => setForm(f => ({ ...f, taxClassification: e.target.value }))} style={inputStyle}>
                  <option value="individual">Individual / Sole Proprietor</option>
                  <option value="c_corp">C Corporation</option>
                  <option value="s_corp">S Corporation</option>
                  <option value="partnership">Partnership</option>
                  <option value="trust">Trust / Estate</option>
                  <option value="llc_c">LLC — C Corporation</option>
                  <option value="llc_s">LLC — S Corporation</option>
                  <option value="llc_p">LLC — Partnership</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Exempt Payee Code</label>
                  <input value={form.exemptPayeeCode} onChange={e => setForm(f => ({ ...f, exemptPayeeCode: e.target.value }))} placeholder="If applicable" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>FATCA Exemption Code</label>
                  <input value={form.exemptFromFatca} onChange={e => setForm(f => ({ ...f, exemptFromFatca: e.target.value }))} placeholder="If applicable" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Address *</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St Suite 100" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>City, State, ZIP Code *</label>
                <input value={form.cityStateZip} onChange={e => setForm(f => ({ ...f, cityStateZip: e.target.value }))} placeholder="Phoenix, AZ 85001" required style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Part II: TIN */}
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 14, color: TEXT, background: BG }}>Part II — Taxpayer Identification Number (TIN)</div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 16, display: 'flex', gap: 24 }}>
                {(['ssn', 'ein'] as const).map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: TEXT }}>
                    <input type="radio" value={t} checked={form.tinType === t} onChange={() => setForm(f => ({ ...f, tinType: t, tin: '' }))} style={{ accentColor: GOLD }} />
                    {t === 'ssn' ? 'Social Security Number (SSN)' : 'Employer ID Number (EIN)'}
                  </label>
                ))}
              </div>
              <div>
                <label style={labelStyle}>{form.tinType === 'ssn' ? 'SSN (XXX-XX-XXXX)' : 'EIN (XX-XXXXXXX)'} *</label>
                <input type="password" value={form.tin} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))} placeholder={form.tinType === 'ssn' ? '___-__-____' : '__-_______'} maxLength={11} required style={{ ...inputStyle, letterSpacing: 3, fontFamily: 'monospace' }} />
                <div style={{ fontSize: 11, color: DIM, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ShieldCheck size={12} color={GREEN} /> Your TIN is AES-256 encrypted and never stored in plaintext.
                </div>
              </div>
            </div>
          </div>

          {/* Part III: Certification + Signature */}
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 14, color: TEXT, background: BG }}>Part III — Certification & Signature</div>
            <div style={{ padding: 20 }}>
              {/* Perjury statement */}
              <div style={{ fontSize: 12, color: DIM, lineHeight: 1.7, marginBottom: 16, background: BG, borderRadius: 8, padding: '14px 16px', border: `1px solid ${BORDER}` }}>
                Under penalties of perjury, I certify that: (1) The number shown on this form is my correct taxpayer identification number; (2) I am not subject to backup withholding; (3) I am a U.S. citizen or other U.S. person; (4) The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 24 }}>
                <input type="checkbox" checked={form.certify} onChange={e => setForm(f => ({ ...f, certify: e.target.checked }))} style={{ marginTop: 2, width: 18, height: 18, accentColor: GOLD }} />
                <span style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
                  I certify under penalty of perjury that the information provided is true and correct.
                </span>
              </label>

              {/* Signature Mode Toggle */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Signature *</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button type="button" onClick={() => setSigMode('draw')} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                    background: sigMode === 'draw' ? `${GOLD}15` : 'transparent',
                    border: `1px solid ${sigMode === 'draw' ? GOLD : BORDER}`,
                    borderRadius: 8, color: sigMode === 'draw' ? GOLD : DIM,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>
                    <PenNib size={16} /> Draw
                  </button>
                  <button type="button" onClick={() => setSigMode('type')} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                    background: sigMode === 'type' ? `${GOLD}15` : 'transparent',
                    border: `1px solid ${sigMode === 'type' ? GOLD : BORDER}`,
                    borderRadius: 8, color: sigMode === 'type' ? GOLD : DIM,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>
                    <Textbox size={16} /> Type
                  </button>
                </div>

                {sigMode === 'draw' ? (
                  <div>
                    <div style={{ border: `2px dashed ${hasDrawn ? GOLD : BORDER}`, borderRadius: 8, overflow: 'hidden', position: 'relative', background: WHITE }}>
                      <canvas
                        ref={canvasRef}
                        width={660}
                        height={120}
                        style={{ width: '100%', height: 120, cursor: 'crosshair', touchAction: 'none' }}
                        onMouseDown={startDraw}
                        onMouseMove={draw}
                        onMouseUp={stopDraw}
                        onMouseLeave={stopDraw}
                        onTouchStart={startDraw}
                        onTouchMove={draw}
                        onTouchEnd={stopDraw}
                      />
                      {!hasDrawn && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: DIM, fontSize: 13 }}>
                          Draw your signature here
                        </div>
                      )}
                    </div>
                    {hasDrawn && (
                      <button type="button" onClick={clearCanvas} style={{ marginTop: 8, fontSize: 12, color: DIM, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Clear signature
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      value={sigTyped}
                      onChange={e => setSigTyped(e.target.value)}
                      placeholder="Type your full legal name"
                      style={{ ...inputStyle, fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontSize: 22, padding: '16px 20px', textAlign: 'center' }}
                    />
                    {sigTyped && (
                      <div style={{ marginTop: 8, padding: '12px 20px', background: BG, borderRadius: 8, border: `1px dashed ${BORDER}`, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>Signature preview:</div>
                        <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontSize: 28, color: TEXT }}>{sigTyped}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Signature Date */}
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={form.signatureDate} onChange={e => setForm(f => ({ ...f, signatureDate: e.target.value }))} style={{ ...inputStyle, maxWidth: 200 }} />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving || !form.certify || !hasSig}
            style={{
              width: '100%', padding: '16px', background: saving || !form.certify || !hasSig ? '#D1D5DB' : GOLD,
              border: 'none', borderRadius: 10, color: WHITE, fontWeight: 800, fontSize: 16,
              cursor: saving || !form.certify || !hasSig ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: saving || !form.certify || !hasSig ? 'none' : '0 4px 12px rgba(200,150,15,.3)',
            }}
          >
            <ShieldCheck size={20} weight="bold" />
            {saving ? 'Submitting Securely...' : 'Submit W-9 Securely'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ShieldCheck size={12} color={GREEN} /> AES-256 encrypted · Your information is never sold or shared · Powered by Saguaro CRM
          </div>
        </form>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '12px 20px', borderRadius: 8, background: RED, color: WHITE, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
          <Warning size={16} /> {feedback}
          <button onClick={() => setFeedback('')} style={{ background: 'none', border: 'none', color: WHITE, cursor: 'pointer', fontSize: 18, marginLeft: 8 }}>×</button>
        </div>
      )}
    </>
  );
}
