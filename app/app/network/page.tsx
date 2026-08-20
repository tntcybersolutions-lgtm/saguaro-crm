'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',CARD='#161b22',BORDER='#30363d',DIM='#8B9DB8',TEXT='#e6edf3';

const tools = [
  { icon: '\uD83D\uDCE1', label: 'WiFi Heat Map', desc: 'Simulate AP coverage and find dead zones', href: '/app/network/heatmap' },
  { icon: '\uD83D\uDCD6', label: 'Vendor Guides', desc: '37 step-by-step setup guides for 12 vendors', href: '/app/network/vendors' },
  { icon: '\uD83E\uDDE0', label: 'AI Network Wizard', desc: 'Generate full site network configs with AI', href: '/app/network/wizard' },
  { icon: '\uD83D\uDDA5\uFE0F', label: 'Subnet Calculator', desc: 'IP subnetting and CIDR calculator', href: '/app/network/subnet' },
  { icon: '\uD83D\uDCCD', label: 'IP Tracker', desc: 'Track assigned IPs per project', href: '/app/network/ip-tracker' },
  { icon: '\uD83D\uDD12', label: 'Firewall Rules', desc: 'Manage site firewall policies', href: '/app/network/firewall' },
];

export default function NetworkDashboard() {
  const router = useRouter();
  const [templates, setTemplates] = useState<any[]>([]);
  const [ipCount, setIpCount] = useState(0);

  useEffect(() => {
    fetch('/api/network/site-templates').then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {});
    fetch('/api/network/ip-tracker').then(r => r.json()).then(d => setIpCount((d.ips || []).length)).catch(() => {});
  }, []);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: '0 0 6px' }}>Network Management</h1>
        <p style={{ fontSize: 14, color: DIM, margin: 0 }}>Design, deploy, and manage construction site networks</p>
      </div>

      {/* Quick Tools Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 32 }}>
        {tools.map(t => (
          <button key={t.label} onClick={() => router.push(t.href)} style={{
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 18px',
            textAlign: 'left', cursor: 'pointer', transition: 'border-color .2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,160,23,.4)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{t.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>IPs Tracked</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: GOLD }}>{ipCount}</div>
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Vendor Guides</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#3B82F6' }}>37</div>
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Site Templates</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#22C55E' }}>{templates.length}</div>
        </div>
      </div>

      {/* Site Templates */}
      <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 14 }}>Site Templates</h2>
      {templates.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 10, color: '#555' }}>🌐</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ddd', marginBottom: 6 }}>No site templates available</div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 18, maxWidth: 420, margin: '0 auto 18px' }}>
            Site templates help you deploy pre-configured network setups. Start by running the Network Wizard.
          </div>
          <button
            onClick={() => router.push('/app/network/wizard')}
            style={{ background: GOLD, color: '#000', fontWeight: 700, padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
          >
            Open Network Wizard →
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {templates.map((t: any) => (
            <div key={t.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{t.name}</span>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: t.site_size === 'small' ? 'rgba(34,197,94,.1)' : t.site_size === 'medium' ? 'rgba(59,130,246,.1)' : 'rgba(212,160,23,.1)', color: t.site_size === 'small' ? '#22C55E' : t.site_size === 'medium' ? '#3B82F6' : GOLD, fontWeight: 700, textTransform: 'uppercase' }}>{t.site_size}</span>
              </div>
              <p style={{ fontSize: 12, color: DIM, margin: '0 0 12px', lineHeight: 1.5 }}>{t.description}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: DIM, background: DARK, padding: '3px 8px', borderRadius: 6 }}>{t.vlan_count} VLANs</span>
                <span style={{ fontSize: 11, color: DIM, background: DARK, padding: '3px 8px', borderRadius: 6 }}>{t.ap_count} APs</span>
                <span style={{ fontSize: 11, color: DIM, background: DARK, padding: '3px 8px', borderRadius: 6 }}>{t.switch_count} Switches</span>
                <span style={{ fontSize: 11, color: DIM, background: DARK, padding: '3px 8px', borderRadius: 6 }}>{t.firewall_rules} Rules</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>${t.estimated_cost_low?.toLocaleString()} - ${t.estimated_cost_high?.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
