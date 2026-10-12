'use client';

export default function PortalsHub() {
  const portals = [
    { title: 'Owner / Client Portal', desc: 'View project progress, budgets, photos, and documents.', href: '/portals/client', color: 'var(--text-primary)' },
    { title: 'Subcontractor Portal', desc: 'Upload insurance, W-9s, and lien waivers, and track pay apps.', href: '/portals/sub', color: 'var(--text-primary)' },
    { title: 'E-Signature Portal', desc: 'Sign contracts and documents securely in your browser.', href: '/portals/sign', color: '#4ADE80' },
    { title: 'W-9 Submission', desc: 'Securely submit your W-9 to your general contractor.', href: '/portals/w9', color: '#FBBF24' },
  ];

  return (
    <div className="mkt-page" style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 600, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.01em', marginBottom: 8 }}>Saguaro</div>
          <h1 style={{ color: '#FFFFFF', fontSize: 32, fontWeight: 700, margin: '0 0 8px' }}>Portal Access</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>Select your portal below to get started.</p>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {portals.map((p) => (
            <a key={p.href} href={p.href} style={{
              display: 'block', textDecoration: 'none',
              background: 'var(--bg-surface)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '24px 28px',
              borderLeft: `4px solid ${p.color}`,
            }}>
              <div style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{p.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{p.desc}</div>
            </a>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}><a href="/" style={{ color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none' }}>← Back to Saguaro</a></div>
      </div>
    </div>
  );
}
