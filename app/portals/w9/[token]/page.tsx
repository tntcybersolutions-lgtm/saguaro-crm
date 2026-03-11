'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';

export default function W9Portal() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    legalName: '', businessName: '', taxClassification: 'individual',
    exemptPayeeCode: '', exemptFromFatca: '',
    address: '', cityStateZip: '', accountNumbers: '',
    tinType: 'ssn', tin: '',
    certify: false,
    signatureName: '', signatureDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetch('/api/portals/w9/' + token)
      .then(r => r.json())
      .then(d => { setInfo(d.request); if (d.request?.status === 'submitted') setSubmitted(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.certify) { alert('You must check the certification box to submit.'); return; }
    if (!form.tin || form.tin.replace(/\D/g,'').length < 9) { alert('Please enter a valid TIN (9 digits).'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/portals/w9/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (d.success) setSubmitted(true);
      else alert(d.error || 'Failed to submit. Please try again.');
    } catch { alert('Network error. Please try again.'); }
    setSaving(false);
  }

  const inp = (label: string, key: string, placeholder?: string, type?: string) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</label>
      <input
        type={type || 'text'}
        value={(form as any)[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{ width: '100%', background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontFamily: 'system-ui,sans-serif' }}>
      Loading...
    </div>
  );

  if (!info) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', color: RED }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Invalid or Expired Link</div>
        <div style={{ fontSize: 14, color: DIM, marginTop: 8 }}>This W-9 request link is no longer valid. Please contact your project manager.</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', color: GREEN }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: TEXT }}>W-9 Submitted Successfully</div>
        <div style={{ fontSize: 14, color: DIM, marginTop: 12, maxWidth: 400 }}>
          Thank you, <strong style={{ color: TEXT }}>{info.vendorName}</strong>. Your W-9 information has been securely submitted for the project <strong style={{ color: TEXT }}>{info.projectName}</strong>. You will receive a confirmation email shortly.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: DARK, fontFamily: 'system-ui,sans-serif', color: TEXT }}>
      {/* Header */}
      <div style={{ background: 'rgba(13,17,23,.96)', borderBottom: `1px solid ${BORDER}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22 }}>🌵</span>
        <span style={{ fontWeight: 800, fontSize: 16, color: GOLD, letterSpacing: 1 }}>SAGUARO CRM</span>
        <span style={{ fontSize: 11, color: DIM, marginLeft: 8 }}>Secure W-9 Collection Portal</span>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        {/* Banner */}
        <div style={{ background: 'rgba(212,160,23,.06)', border: `1px solid rgba(212,160,23,.2)`, borderRadius: 10, padding: '16px 20px', marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: GOLD, marginBottom: 4 }}>W-9 Request — {info.projectName}</div>
          <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6 }}>
            You have been requested to provide W-9 tax information for <strong style={{ color: TEXT }}>{info.vendorName}</strong>. This form is required to process payments. All information is transmitted securely and encrypted.
          </div>
        </div>

        <form onSubmit={submit}>
          {/* Part 1: Identification */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 14 }}>Part I — Identification</div>
            <div style={{ padding: 20 }}>
              {inp('Legal Name (as shown on income tax return)', 'legalName', 'John Smith or ABC Construction LLC')}
              {inp('Business / DBA Name (if different)', 'businessName', 'Trade name or DBA')}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>Federal Tax Classification</label>
                <select
                  value={form.taxClassification}
                  onChange={e => setForm(f => ({ ...f, taxClassification: e.target.value }))}
                  style={{ width: '100%', background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none' }}
                >
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {inp('Exempt Payee Code (if applicable)', 'exemptPayeeCode', 'See instructions')}
                {inp('Exemption from FATCA Reporting Code', 'exemptFromFatca', 'See instructions')}
              </div>
              {inp('Address (number, street, apt or suite)', 'address', '123 Main St Suite 100')}
              {inp('City, State, ZIP Code', 'cityStateZip', 'Phoenix, AZ 85001')}
              {inp('Account Number(s) (optional)', 'accountNumbers', 'Optional — leave blank if not applicable')}
            </div>
          </div>

          {/* Part 2: TIN */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 14 }}>Part II — Taxpayer Identification Number (TIN)</div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 16, display: 'flex', gap: 20 }}>
                {(['ssn','ein'] as const).map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: TEXT }}>
                    <input type="radio" value={t} checked={form.tinType === t} onChange={() => setForm(f => ({ ...f, tinType: t, tin: '' }))} />
                    {t === 'ssn' ? 'Social Security Number (SSN)' : 'Employer Identification Number (EIN)'}
                  </label>
                ))}
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>
                  {form.tinType === 'ssn' ? 'SSN (XXX-XX-XXXX)' : 'EIN (XX-XXXXXXX)'}
                </label>
                <input
                  type="password"
                  value={form.tin}
                  onChange={e => setForm(f => ({ ...f, tin: e.target.value }))}
                  placeholder={form.tinType === 'ssn' ? '___-__-____' : '__-_______'}
                  maxLength={11}
                  style={{ width: '100%', background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box', letterSpacing: 2 }}
                />
                <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Your TIN is encrypted and stored securely. It will never be shared with unauthorized parties.</div>
              </div>
            </div>
          </div>

          {/* Part 3: Certification */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 14 }}>Part III — Certification</div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: DIM, lineHeight: 1.7, marginBottom: 16, background: 'rgba(0,0,0,.2)', borderRadius: 6, padding: '12px 14px' }}>
                Under penalties of perjury, I certify that: (1) The number shown on this form is my correct taxpayer identification number; (2) I am not subject to backup withholding; (3) I am a U.S. citizen or other U.S. person; (4) The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
                <input type="checkbox" checked={form.certify} onChange={e => setForm(f => ({ ...f, certify: e.target.checked }))} style={{ marginTop: 2, width: 16, height: 16 }} />
                <span style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>I certify under penalty of perjury that the above information is true and correct.</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {inp('Signature (type your full legal name)', 'signatureName', 'John Smith')}
                {inp('Date', 'signatureDate', '', 'date')}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{ width: '100%', padding: '14px', background: saving ? '#4a5f7a' : `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 9, color: '#0d1117', fontWeight: 800, fontSize: 16, cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: .5 }}
          >
            {saving ? 'Submitting...' : 'Submit W-9 Securely →'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: DIM }}>
            🔒 256-bit encrypted · Your information is never sold or shared · Powered by Saguaro CRM
          </div>
        </form>
      </div>
    </div>
  );
}
