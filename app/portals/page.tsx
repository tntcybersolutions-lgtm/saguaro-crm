'use client';
import PortalHeader from '../../components/PortalHeader';
import { Users, PenNib, FileText, ShieldCheck } from '@phosphor-icons/react';

export default function PortalsHub() {
  const portals = [
    { title: 'Owner / Client Portal', desc: 'View project progress, budgets, photos, and approve pay applications', href: '/portals/client', color: '#C8960F', icon: <Users size={24} weight="duotone" /> },
    { title: 'Subcontractor Portal', desc: 'Upload insurance, W-9s, lien waivers, submit daily logs, and track pay apps', href: '/portals/sub', color: '#2563EB', icon: <ShieldCheck size={24} weight="duotone" /> },
    { title: 'E-Signature Portal', desc: 'Sign contracts and documents securely in your browser', href: '/portals/sign', color: '#16A34A', icon: <PenNib size={24} weight="duotone" /> },
    { title: 'W-9 Submission', desc: 'Securely submit your W-9 to your general contractor', href: '/portals/w9', color: '#7C3AED', icon: <FileText size={24} weight="duotone" /> },
  ];

  return (
    <>
      <PortalHeader portalName="Portal Access" showBackToPortals={false} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', minHeight: 'calc(100vh - 64px)' }}>
        <div style={{ maxWidth: 640, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 style={{ color: '#111827', fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>Welcome to Saguaro Portals</h1>
            <p style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>Select your portal below to get started.</p>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {portals.map((p) => (
              <a key={p.href} href={p.href} style={{
                display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none',
                background: '#ffffff', border: '1px solid #E2E5EA', borderRadius: 12, padding: '20px 24px',
                borderLeft: `4px solid ${p.color}`,
                transition: 'box-shadow .15s, transform .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 10, background: `${p.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.color, flexShrink: 0 }}>
                  {p.icon}
                </div>
                <div>
                  <div style={{ color: '#111827', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{p.title}</div>
                  <div style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.4 }}>{p.desc}</div>
                </div>
                <span style={{ marginLeft: 'auto', color: '#D1D5DB', fontSize: 18, flexShrink: 0 }}>→</span>
              </a>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <a href="/" style={{ color: '#9CA3AF', fontSize: 13, textDecoration: 'none' }}>← Back to Saguaro CRM</a>
          </div>
        </div>
      </div>
    </>
  );
}
