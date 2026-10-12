'use client';
/**
 * API Documentation — the developer surface for the Saguaro REST API.
 * Full premium anatomy (aurora surface, hero, stat strip, section cards);
 * endpoint tables get the machined treatment and every code sample sits in a
 * dark inset panel. Live/soon labels stay honest: only endpoints that accept
 * sk_live_ keys today are marked Live.
 */
import React, { useState } from 'react';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { WEBHOOK_EVENT_CATALOG } from '@/lib/webhook-events';
import {
  PremiumSurface, ModuleHero, SectionCard, StatStrip,
  goldButtonStyle, goldOutlineButtonStyle,
} from '@/components/ui/premium';
import {
  Code, Key, WebhooksLogo, Terminal, Plugs, BracketsCurly, Cube, Broadcast, PaperPlaneTilt,
} from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)', CARD = 'var(--bg-surface)', INSET = 'var(--bg-base)', BORDER = 'rgba(255,255,255,0.12)', HAIRLINE = 'rgba(255,255,255,0.07)';
const DIM = 'var(--text-secondary)', MUTED = 'var(--text-secondary)', TEXT = 'var(--text-primary)', GREEN = 'var(--success)';

// Integrations accent — steel blue, local because 'integrations' is not a key in
// lib/module-identity (owned elsewhere). Chips / eyebrows / badges ONLY.
const API_ACCENT = 'var(--acc)';

// Dark inset panel for code — every sample and payload sits on this material.
const CODE_PANEL: React.CSSProperties = {
  background: INSET, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16,
  fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
};

const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: MUTED, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };

type Endpoint = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  // 'live' = actually reachable today with an sk_live_ key; 'soon' = documented
  // but not yet accepting API-key auth. The UI marks these honestly.
  status: 'live' | 'soon';
  body?: string;
};

type APIModule = {
  name: string;
  icon: string;
  endpoints: Endpoint[];
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--success)',
  POST: 'var(--brand-primary)',
  PATCH: 'var(--brand-primary)',
  DELETE: 'var(--danger)',
};

// Only the GET /api/v1/* endpoints below are LIVE — they accept sk_live_ keys
// and are tenant-scoped. Everything marked 'soon' is on the roadmap but does
// not yet accept API-key auth, and is labeled as such rather than implied to work.
const API_MODULES: APIModule[] = [
  {
    name: 'Projects',
    icon: 'P',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects', description: 'List all projects for the authenticated tenant', status: 'live' },
      { method: 'POST', path: '/api/v1/projects', description: 'Create a new project', status: 'soon' },
      { method: 'GET', path: '/api/v1/projects/{id}', description: 'Get project details by ID', status: 'soon' },
      { method: 'PATCH', path: '/api/v1/projects/{id}', description: 'Update project fields', status: 'soon' },
      { method: 'DELETE', path: '/api/v1/projects/{id}', description: 'Archive a project (soft delete)', status: 'soon' },
    ],
  },
  {
    name: 'RFIs',
    icon: '?',
    endpoints: [
      { method: 'GET', path: '/api/v1/rfis', description: 'List RFIs for the tenant, optional ?projectId= filter', status: 'live' },
      { method: 'POST', path: '/api/v1/rfis', description: 'Create a new RFI', status: 'soon' },
      { method: 'PATCH', path: '/api/v1/rfis/{id}', description: 'Update RFI or add response', status: 'soon' },
      { method: 'POST', path: '/api/v1/rfis/{id}/respond', description: 'Submit an RFI response', status: 'soon' },
    ],
  },
  {
    name: 'Change Orders',
    icon: 'CO',
    endpoints: [
      { method: 'GET', path: '/api/v1/change-orders', description: 'List change orders, optional ?projectId= filter', status: 'live' },
      { method: 'POST', path: '/api/v1/change-orders', description: 'Create a new change order', status: 'soon' },
      { method: 'PATCH', path: '/api/v1/change-orders/{id}', description: 'Update change order details', status: 'soon' },
      { method: 'POST', path: '/api/v1/change-orders/{id}/approve', description: 'Approve a change order', status: 'soon' },
    ],
  },
  {
    name: 'Pay Applications',
    icon: '$',
    endpoints: [
      { method: 'GET', path: '/api/v1/pay-apps', description: 'List pay applications, optional ?projectId= filter', status: 'live' },
      { method: 'POST', path: '/api/v1/pay-apps', description: 'Create a new pay application', status: 'soon' },
      { method: 'PATCH', path: '/api/v1/pay-apps/{id}', description: 'Update pay app status or line items', status: 'soon' },
      { method: 'POST', path: '/api/v1/pay-apps/{id}/approve', description: 'Approve a pay application', status: 'soon' },
    ],
  },
  {
    name: 'Invoices',
    icon: 'I',
    endpoints: [
      { method: 'GET', path: '/api/v1/invoices', description: 'List invoices, optional ?projectId= filter', status: 'live' },
      { method: 'POST', path: '/api/v1/invoices', description: 'Create a new invoice', status: 'soon' },
      { method: 'PATCH', path: '/api/v1/invoices/{id}', description: 'Update invoice status or fields', status: 'soon' },
      { method: 'DELETE', path: '/api/v1/invoices/{id}', description: 'Delete an invoice', status: 'soon' },
    ],
  },
  {
    name: 'Contracts',
    icon: 'C',
    endpoints: [
      { method: 'GET', path: '/api/v1/contracts', description: 'List contracts, optional ?projectId= filter', status: 'live' },
      { method: 'POST', path: '/api/v1/contracts', description: 'Create a new contract', status: 'soon' },
      { method: 'GET', path: '/api/v1/contracts/{id}', description: 'Get contract details', status: 'soon' },
      { method: 'PATCH', path: '/api/v1/contracts/{id}', description: 'Update contract fields', status: 'soon' },
    ],
  },
  {
    name: 'Subcontractors',
    icon: 'S',
    endpoints: [
      { method: 'GET', path: '/api/v1/subcontractors', description: 'List the tenant subcontractor directory', status: 'live' },
      { method: 'POST', path: '/api/v1/subcontractors', description: 'Add a new subcontractor', status: 'soon' },
      { method: 'PATCH', path: '/api/v1/subcontractors/{id}', description: 'Update subcontractor details', status: 'soon' },
      { method: 'GET', path: '/api/v1/subcontractors/{id}/compliance', description: 'Get compliance status and documents', status: 'soon' },
    ],
  },
  {
    name: 'Takeoffs',
    icon: 'T',
    endpoints: [
      { method: 'GET', path: '/api/v1/takeoffs', description: 'List takeoffs for a project', status: 'soon' },
      { method: 'POST', path: '/api/v1/takeoffs', description: 'Create a new takeoff', status: 'soon' },
      { method: 'GET', path: '/api/v1/takeoffs/{id}', description: 'Get takeoff with materials breakdown', status: 'soon' },
      { method: 'PATCH', path: '/api/v1/takeoffs/{id}', description: 'Update takeoff quantities or materials', status: 'soon' },
    ],
  },
];

/** Only endpoints that answer an sk_live_ key today are documented on the page;
 *  the rest stay in the catalog above until they ship. */
const LIVE_MODULES: APIModule[] = API_MODULES
  .map((m) => ({ ...m, endpoints: m.endpoints.filter((e) => e.status === 'live') }))
  .filter((m) => m.endpoints.length > 0);

// The real, emittable event catalog — every one of these actually fires from
// lib/triggers.ts via the dispatcher, so a subscription to any of them delivers.
const WEBHOOK_EVENTS = WEBHOOK_EVENT_CATALOG;

const CODE_EXAMPLES = {
  curl: `curl -X GET "https://saguarocontrol.net/api/v1/projects" \\
  -H "Authorization: Bearer sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json"`,
  javascript: `const response = await fetch('https://saguarocontrol.net/api/v1/projects', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer sk_live_YOUR_KEY',
    'Content-Type': 'application/json',
  },
});
const { data } = await response.json();
console.log(data);`,
  python: `import requests

response = requests.get(
    'https://saguarocontrol.net/api/v1/projects',
    headers={
        'Authorization': 'Bearer sk_live_YOUR_KEY',
        'Content-Type': 'application/json',
    }
)
data = response.json()['data']
print(data)`,
};

export default function ApiDocsPage() {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [codeTab, setCodeTab] = useState<'curl' | 'javascript' | 'python'>('curl');
  const [activeSection, setActiveSection] = useState<'endpoints' | 'auth' | 'webhooks' | 'try'>('endpoints');
  const [tryApiKey, setTryApiKey] = useState('');
  const [tryEndpoint, setTryEndpoint] = useState('/api/v1/projects');
  const [tryMethod, setTryMethod] = useState('GET');
  const [tryBody, setTryBody] = useState('');
  const [tryResponse, setTryResponse] = useState('');
  const [tryLoading, setTryLoading] = useState(false);

  async function handleTryIt() {
    setTryLoading(true);
    setTryResponse('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tryApiKey) headers['Authorization'] = `Bearer ${tryApiKey}`;

      const opts: RequestInit = { method: tryMethod, headers };
      if (tryMethod !== 'GET' && tryBody.trim()) {
        opts.body = tryBody;
      }

      const res = await fetch(tryEndpoint, opts);
      const data = await res.json().catch(() => res.text());
      setTryResponse(JSON.stringify(data, null, 2));
    } catch (e: any) {
      console.error(e); setTryResponse(humanError(e, 'The request failed. Please try again.'));
    }
    setTryLoading(false);
  }

  // Honest platform counts, derived from the catalog above — nothing invented.
  const liveCount = LIVE_MODULES.reduce((n, m) => n + m.endpoints.length, 0);

  return (
    <PremiumSurface>
      <style>{`@media (max-width: 760px){ .ad-stack{ grid-template-columns: 1fr !important } }`}</style>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13, color: DIM }}>
        <Link href="/app/integrations" style={{ color: 'var(--link)', textDecoration: 'none' }}>Integrations</Link>
        <span>/</span>
        <span style={{ color: TEXT }}>API Documentation</span>
      </div>

      <ModuleHero
        eyebrow="Developer Platform"
        eyebrowIcon={<Plugs size={13} weight="fill" color={API_ACCENT} />}
        title="API"
        accent="Documentation"
        subtitle="Tenant-scoped keys. Every endpoint below answers a live key today."
        actions={
          <Link href="/app/settings/integrations-hub" style={goldOutlineButtonStyle} className="pmBtn">
            <Key size={15} weight="bold" /> Mint an API Key
          </Link>
        }
      />

      {/* Stat strip — the platform surface at a glance, counted from the catalog */}
      <StatStrip items={[
        {href: '/app/integrations/api-docs',  label: 'Live Endpoints', value: String(liveCount), accent: GREEN, sub: 'Accepting sk_live_ keys today', icon: <Broadcast size={11} weight="bold" color={GREEN} /> },
        {href: '/app/integrations/api-docs',  label: 'API Modules', value: String(LIVE_MODULES.length), sub: 'Projects to takeoffs', icon: <Cube size={11} weight="bold" color={API_ACCENT} /> },
        {href: '/app/integrations/api-docs',  label: 'Webhook Events', value: String(WEBHOOK_EVENTS.length), sub: 'All emitted by the dispatcher', icon: <WebhooksLogo size={11} weight="bold" color={API_ACCENT} /> },
      ]} />

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {[
          { key: 'endpoints' as const, label: 'Endpoints', icon: <BracketsCurly size={13} weight="bold" /> },
          { key: 'auth' as const, label: 'Authentication', icon: <Key size={13} weight="bold" /> },
          { key: 'webhooks' as const, label: 'Webhooks', icon: <WebhooksLogo size={13} weight="bold" /> },
          { key: 'try' as const, label: 'Try It', icon: <Terminal size={13} weight="bold" /> },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: 'none', whiteSpace: 'nowrap',
              background: activeSection === s.key ? `var(--brand-primary)` : 'transparent',
              color: activeSection === s.key ? 'var(--on-brand)' : DIM,
            }}
          >
            {s.icon}{s.label}
          </button>
        ))}
      </div>

      {/* ============ ENDPOINTS ============ */}
      {activeSection === 'endpoints' && (
        <div>
          {LIVE_MODULES.map((mod) => (
            <div key={mod.name} style={{ marginBottom: 14 }}>
              <button
                onClick={() => setActiveModule(activeModule === mod.name ? null : mod.name)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
                  border: `1px solid ${activeModule === mod.name ? `color-mix(in srgb, ${API_ACCENT} 45%, transparent)` : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: activeModule === mod.name ? '14px 14px 0 0' : 14,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `color-mix(in srgb, ${API_ACCENT} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${API_ACCENT} 45%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900, color: API_ACCENT, flexShrink: 0,
                }}>
                  {mod.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>{mod.name}</div>
                  <div style={{ fontSize: 12, color: GREEN }}>{mod.endpoints.length} live</div>
                </div>
                <span style={{ color: DIM, fontSize: 18, transform: activeModule === mod.name ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  {'\u25BC'}
                </span>
              </button>

              {activeModule === mod.name && (
                <div style={{
                  background: CARD, border: `1px solid rgba(255,255,255,0.08)`, borderTop: 'none',
                  borderRadius: '0 0 14px 14px', padding: '4px 0', overflowX: 'auto',
                }}>
                  {mod.endpoints.map((ep, i) => {
                    return (
                      <div
                        key={i}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', minWidth: 620,
                          borderBottom: i < mod.endpoints.length - 1 ? `1px solid ${HAIRLINE}` : 'none',
                        }}
                      >
                        <span style={{
                          padding: '3px 8px', borderRadius: 5, fontSize: 12, fontWeight: 800,
                          minWidth: 52, textAlign: 'center', fontFamily: 'monospace',
                          background: `color-mix(in srgb, ${METHOD_COLORS[ep.method]} 9%, transparent)`,
                          color: METHOD_COLORS[ep.method],
                        }}>
                          {ep.method}
                        </span>
                        <code style={{ fontSize: 13, color: TEXT, fontFamily: 'monospace', fontWeight: 500, minWidth: 260 }}>
                          {ep.path}
                        </code>
                        <span style={{ fontSize: 12, color: DIM, flex: 1 }}>{ep.description}</span>
                        <span style={{
                          padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          whiteSpace: 'nowrap',
                          background: `color-mix(in srgb, ${GREEN} 12%, transparent)`,
                          color: GREEN,
                          border: `1px solid color-mix(in srgb, ${GREEN} 33%, transparent)`,
                        }}>
                          Live
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ============ AUTHENTICATION ============ */}
      {activeSection === 'auth' && (
        <div>
          <SectionCard
            title="API Key Authentication"
            subtitle="Bearer tokens, tenant-scoped — the full secret shows exactly once."
            icon={<Key size={17} weight="duotone" color={API_ACCENT} />}
            accent={API_ACCENT}
            style={{ marginBottom: 24 }}
          >
            <p style={{ margin: '0 0 20px', fontSize: 13, color: DIM, lineHeight: 1.6 }}>
              Public REST requests authenticate with a personal API key passed as a Bearer token. Mint a key from{' '}
              <Link href="/app/settings/integrations-hub" style={{ color: 'var(--link)', textDecoration: 'none' }}>Integration Hub, under API Keys</Link>.
              The full <code style={{ fontFamily: 'monospace', color: TEXT }}>sk_live_</code> secret is shown exactly once at creation — store it securely. Every key is scoped to your tenant, so requests only ever see your company&apos;s data.
            </p>

            <div style={{ ...CODE_PANEL, fontSize: 13, color: GREEN, marginBottom: 20 }}>
              <div style={{ color: DIM, marginBottom: 8 }}>{'// Include in every request:'}</div>
              <div>Authorization: Bearer {'sk_live_<your_secret_key>'}</div>
            </div>

            <h4 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, color: MUTED }}>Key Scopes &amp; Lifecycle</h4>
            <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 13, color: DIM, lineHeight: 2 }}>
              <li>Scopes are hierarchical — <span style={{ color: TEXT }}>admin</span> implies <span style={{ color: TEXT }}>write</span> implies <span style={{ color: TEXT }}>read</span></li>
              <li>Read endpoints (like the ones below) require the <span style={{ color: TEXT }}>read</span> scope</li>
              <li>Keys never expire, but can be revoked instantly from the Integration Hub</li>
              <li>A revoked or malformed key returns <span style={{ color: TEXT }}>401</span>; a key missing the required scope returns <span style={{ color: TEXT }}>403</span></li>
            </ul>
          </SectionCard>

          <SectionCard
            title="Code Examples"
            subtitle="The same authenticated list call in curl, JavaScript, and Python."
            icon={<Code size={17} weight="duotone" color={API_ACCENT} />}
            accent={API_ACCENT}
          >
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: INSET, border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: 4, width: 'fit-content' }}>
              {(['curl', 'javascript', 'python'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setCodeTab(lang)}
                  style={{
                    padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: 'none', textTransform: 'capitalize',
                    background: codeTab === lang ? `var(--brand-primary)` : 'transparent',
                    color: codeTab === lang ? 'var(--on-brand)' : DIM,
                  }}
                >
                  {lang}
                </button>
              ))}
            </div>

            <div style={{ ...CODE_PANEL, padding: 18, color: TEXT, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
              {CODE_EXAMPLES[codeTab]}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ============ WEBHOOKS ============ */}
      {activeSection === 'webhooks' && (
        <div>
          <SectionCard
            title="Webhook Events"
            subtitle="Every event below fires from the dispatcher."
            icon={<WebhooksLogo size={17} weight="duotone" color={API_ACCENT} />}
            accent={API_ACCENT}
            style={{ marginBottom: 24 }}
          >
            <p style={{ margin: '0 0 20px', fontSize: 13, color: DIM }}>
              Subscribe to events and receive real-time notifications when things happen in Saguaro. Register webhook endpoints via the Zapier integration or the API.
            </p>

            <div style={{ ...CODE_PANEL, color: DIM, marginBottom: 20 }}>
              <div style={{ color: GREEN }}>POST /api/integrations/zapier</div>
              <div style={{ marginTop: 8, color: TEXT }}>{'{'}</div>
              <div style={{ color: TEXT }}>&nbsp;&nbsp;"url": "https://your-server.com/webhooks/saguaro",</div>
              <div style={{ color: TEXT }}>&nbsp;&nbsp;"events": ["project.created", "invoice.sent"]</div>
              <div style={{ color: TEXT }}>{'}'}</div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: INSET }}>
                    <th style={TH}>Event</th>
                    <th style={TH}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {WEBHOOK_EVENTS.map((ev, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${HAIRLINE}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '10px 14px' }}>
                        <code style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'monospace', background: 'var(--bg-surface-2)', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                          {ev.event}
                        </code>
                      </td>
                      <td style={{ padding: '10px 14px', color: DIM }}>{ev.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard flat
            title="Webhook Payload Format"
            subtitle="Every delivery carries these headers and this body shape."
            icon={<BracketsCurly size={17} weight="duotone" color={API_ACCENT} />}
            accent={API_ACCENT}
          >
            <div className="ad-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, marginBottom: 8 }}>Headers</div>
                <div style={{ ...CODE_PANEL, padding: 14, fontSize: 12, color: TEXT }}>
                  <div>Content-Type: application/json</div>
                  <div>X-Saguaro-Event: project.created</div>
                  <div>X-Saguaro-Delivery: whd_abc123</div>
                  <div>X-Saguaro-Signature: sha256=...</div>
                  <div>User-Agent: Saguaro-Webhooks/1.0</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, marginBottom: 8 }}>Body</div>
                <div style={{ ...CODE_PANEL, padding: 14, fontSize: 12, color: TEXT }}>
                  <div>{'{'}</div>
                  <div>&nbsp;&nbsp;"event": "project.created",</div>
                  <div>&nbsp;&nbsp;"timestamp": "2026-03-28T...",</div>
                  <div>&nbsp;&nbsp;"webhook_id": "whd_abc123",</div>
                  <div>&nbsp;&nbsp;"data": {'{ ... }'}</div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ============ TRY IT ============ */}
      {activeSection === 'try' && (
        <SectionCard
          title="API Explorer"
          subtitle="Test API endpoints directly from this page."
          icon={<Terminal size={17} weight="duotone" color={API_ACCENT} />}
          accent={API_ACCENT}
        >
          <div className="ad-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Request Side */}
            <div>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: DIM, display: 'block', marginBottom: 5 }}>API Key (Bearer Token)</span>
                <input
                  value={tryApiKey}
                  onChange={(e) => setTryApiKey(e.target.value)}
                  placeholder="Paste your sk_live_ key…"
                  style={{
                    width: '100%', padding: '10px 14px', background: INSET, border: `1px solid ${BORDER}`,
                    borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <select
                  value={tryMethod}
                  onChange={(e) => setTryMethod(e.target.value)}
                  style={{
                    padding: '10px 12px', background: INSET, border: `1px solid ${BORDER}`,
                    borderRadius: 8, color: METHOD_COLORS[tryMethod] || TEXT, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', width: 100,
                  }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input
                  value={tryEndpoint}
                  onChange={(e) => setTryEndpoint(e.target.value)}
                  placeholder="/api/projects/list"
                  style={{
                    flex: 1, padding: '10px 14px', background: INSET, border: `1px solid ${BORDER}`,
                    borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', fontFamily: 'monospace',
                    boxSizing: 'border-box', minWidth: 0,
                  }}
                />
              </div>

              {tryMethod !== 'GET' && (
                <label style={{ display: 'block', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: DIM, display: 'block', marginBottom: 5 }}>Request Body (JSON)</span>
                  <textarea
                    value={tryBody}
                    onChange={(e) => setTryBody(e.target.value)}
                    placeholder={'{\n  "name": "Test Project"\n}'}
                    rows={8}
                    style={{
                      width: '100%', padding: '10px 14px', background: INSET, border: `1px solid ${BORDER}`,
                      borderRadius: 8, color: TEXT, fontSize: 12, outline: 'none', fontFamily: 'monospace',
                      resize: 'vertical', boxSizing: 'border-box',
                    }}
                  />
                </label>
              )}

              <button
                onClick={handleTryIt}
                disabled={tryLoading}
                className="pmBtn"
                style={{ ...goldButtonStyle, opacity: tryLoading ? 0.6 : 1, cursor: tryLoading ? 'wait' : 'pointer' }}
              >
                <PaperPlaneTilt size={15} weight="bold" />{tryLoading ? 'Sending…' : 'Send Request'}
              </button>

              {/* Quick endpoint buttons */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, marginBottom: 8 }}>Quick Select</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['/api/v1/projects', '/api/v1/rfis', '/api/v1/change-orders', '/api/v1/pay-apps', '/api/v1/invoices', '/api/v1/contracts', '/api/v1/subcontractors'].map((ep) => (
                    <button
                      key={ep}
                      onClick={() => { setTryEndpoint(ep); setTryMethod('GET'); }}
                      style={{
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                        background: tryEndpoint === ep ? 'color-mix(in srgb, var(--brand-primary) 9%, transparent)' : 'transparent',
                        border: `1px solid ${tryEndpoint === ep ? 'color-mix(in srgb, var(--brand-primary) 27%, transparent)' : BORDER}`,
                        color: tryEndpoint === ep ? GOLD : DIM, fontFamily: 'monospace',
                      }}
                    >
                      {ep}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Response Side */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, marginBottom: 8 }}>Response</div>
              <div style={{
                ...CODE_PANEL, color: TEXT, lineHeight: 1.6,
                minHeight: 300, maxHeight: 500, overflowY: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {tryResponse || (
                  <span style={{ color: DIM }}>
                    {'// Response will appear here\n// Click "Send Request" to test an endpoint'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      )}
    </PremiumSurface>
  );
}
