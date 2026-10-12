'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function W9PortalLanding() {
  const router = useRouter();
  const [token, setToken] = useState('');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ color: 'var(--brand-primary)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.01em', marginBottom: 8 }}>Saguaro</div>
          <h1 style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>W-9 Submission Portal</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>Securely submit your W-9 form to your general contractor.</p>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 32 }}>
          <label style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'block', marginBottom: 8 }}>Enter Your Access Token</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && token.trim() && router.push(`/portals/w9/${token.trim()}`)} placeholder="Paste token from email" style={{ flex: 1, padding: '12px 16px', background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#FFFFFF', fontSize: 14, outline: 'none' }} />
            <button onClick={() => token.trim() && router.push(`/portals/w9/${token.trim()}`)} disabled={!token.trim()} style={{ padding: '12px 24px', background: 'var(--brand-primary)', border: 'none', borderRadius: 10, color: '#101722', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: !token.trim() ? 0.5 : 1 }}>Submit</button>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}><a href="/" style={{ color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none' }}>← Back to Saguaro</a></div>
      </div>
    </div>
  );
}
