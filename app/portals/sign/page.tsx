'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PortalHeader from '../../../components/PortalHeader';

export default function SignPortalLanding() {
  const router = useRouter();
  const [token, setToken] = useState('');

  return (
    <>
    <PortalHeader portalName="E-Signature Portal" />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ color: '#111827', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>E-Signature Portal</h1>
          <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>Sign documents securely in your browser. No account required.</p>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #E2E5EA', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <label style={{ color: '#6B7280', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Enter your signing token</label>
          <p style={{ color: '#6B7280', fontSize: 13, margin: '0 0 16px' }}>Check your email for a signing link, or paste your token below.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && token.trim() && router.push(`/portals/sign/${token.trim()}`)} placeholder="Paste signing token" style={{ flex: 1, padding: '12px 16px', background: '#F8F9FB', border: '1px solid #E2E5EA', borderRadius: 8, color: '#111827', fontSize: 14, outline: 'none' }} />
            <button onClick={() => token.trim() && router.push(`/portals/sign/${token.trim()}`)} disabled={!token.trim()} style={{ padding: '12px 24px', background: '#C8960F', border: 'none', borderRadius: 8, color: '#ffffff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: !token.trim() ? 0.5 : 1 }}>Sign</button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
