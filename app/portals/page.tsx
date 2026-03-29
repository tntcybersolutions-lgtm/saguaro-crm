'use client';

export default function PortalsHub() {
  const portals = [
    { title: 'Owner / Client Portal', desc: 'View project progress, budgets, photos, and documents', href: '/portals/client', color: '#D4A017' },
    { title: 'Subcontractor Portal', desc: 'Upload insurance, W-9s, lien waivers, track pay apps', href: '/portals/sub', color: '#3B82F6' },
    { title: 'E-Signature Portal', desc: 'Sign contracts and documents securely in your browser', href: '/portals/sign', color: '#22C55E' },
    { title: 'W-9 Submission', desc: 'Securely submit your W-9 to your general contractor', href: '/portals/w9', color: '#A78BFA' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 600, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ color: '#D4A017', fontWeight: 800, fontSize: 24, letterSpacing: '0.12em', marginBottom: 8 }}>SAGUARO</div>
          <h1 style={{ color: '#F5F5F7', fontSize: 32, fontWeight: 700, margin: '0 0 8px' }}>Portal Access</h1>
          <p style={{ color: '#86868B', fontSize: 14, margin: 0 }}>Select your portal below to get started.</p>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {portals.map((p) => (
            <a key={p.href} href={p.href} style={{
              display: 'block', textDecoration: 'none',
              background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px 28px',
              borderLeft: `4px solid ${p.color}`,
            }}>
              <div style={{ color: '#F5F5F7', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{p.title}</div>
              <div style={{ color: '#86868B', fontSize: 13 }}>{p.desc}</div>
            </a>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}><a href="/" style={{ color: '#86868B', fontSize: 13, textDecoration: 'none' }}>Back to Saguaro</a></div>
      </div>
    </div>
  );
}
