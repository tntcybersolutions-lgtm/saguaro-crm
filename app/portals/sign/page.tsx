'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignPortalLanding() {
  const router = useRouter();
  const [token, setToken] = useState('');

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ color: '#D4A017', fontWeight: 800, fontSize: 24, letterSpacing: '0.12em', marginBottom: 8 }}>SAGUARO</div>
          <h1 style={{ color: '#F5F5F7', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>E-Signature Portal</h1>
          <p style={{ color: '#86868B', fontSize: 14, margin: 0 }}>Sign documents securely in your browser. No account required.</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(40px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 32 }}>
          <label style={{ color: '#86868B', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Enter your signing token</label>
          <p style={{ color: '#86868B', fontSize: 13, margin: '0 0 16px' }}>Check your email for a signing link, or paste your token below.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && token.trim() && router.push(`/portals/sign/${token.trim()}`)} placeholder="Paste signing token" style={{ flex: 1, padding: '12px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#F5F5F7', fontSize: 14, outline: 'none' }} />
            <button onClick={() => token.trim() && router.push(`/portals/sign/${token.trim()}`)} disabled={!token.trim()} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #D4A017, #C8960F)', border: 'none', borderRadius: 10, color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: !token.trim() ? 0.5 : 1 }}>Sign</button>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}><a href="/" style={{ color: '#86868B', fontSize: 13, textDecoration: 'none' }}>Back to Saguaro</a></div>
      </div>
    </div>
  );
}
