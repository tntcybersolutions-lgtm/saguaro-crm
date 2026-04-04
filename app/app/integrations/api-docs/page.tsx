'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const GOLD = '#C8960F', DARK = '#F8F9FB', CARD = '#F8F9FB', BORDER = '#E2E5EA';
const DIM = '#6B7280', TEXT = '#e8edf8', GREEN = '#22C55E', RED = '#EF4444', BLUE = '#3B82F6';

type Endpoint = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  body?: string;
};

type APIModule = {
  name: string;
  icon: string;
  endpoints: Endpoint[];
};

const METHOD_COLORS: Record<string, string> = {
  GET: '#22C55E',
  POST: '#3B82F6',
  PATCH: '#F59E0B',
  DELETE: '#EF4444',
};

const API_MODULES: APIModule[] = [
  {
    name: 'Projects',
    icon: 'P',
    endpoints: [
      { method: 'GET', path: '/api/projects/list', description: 'List all projects for the authenticated tenant' },
      { method: 'POST', path: '/api/projects/create', description: 'Create a new project' },
      { method: 'GET', path: '/api/projects/{id}', description: 'Get project details by ID' },
      { method: 'PATCH', path: '/api/projects/{id}', description: 'Update project fields' },
      { method: 'DELETE', path: '/api/projects/{id}', description: 'Archive a project (soft delete)' },
    ],
  },
  {
    name: 'Takeoffs',
    icon: 'T',
    endpoints: [
      { method: 'GET', path: '/api/takeoff/list', description: 'List takeoffs for a project' },
      { method: 'POST', path: '/api/takeoff/create', description: 'Create a new takeoff' },
      { method: 'GET', path: '/api/takeoff/{id}', description: 'Get takeoff with materials breakdown' },
      { method: 'PATCH', path: '/api/takeoff/{id}', description: 'Update takeoff quantities or materials' },
      { method: 'DELETE', path: '/api/takeoff/{id}', description: 'Delete a takeoff' },
    ],
  },
  {
    name: 'Pay Applications',
    icon: '$',
    endpoints: [
      { method: 'GET', path: '/api/pay-apps/list', description: 'List pay applications by project' },
      { method: 'POST', path: '/api/pay-apps/create', description: 'Create a new pay application' },
      { method: 'PATCH', path: '/api/pay-apps/{id}', description: 'Update pay app status or line items' },
      { method: 'POST', path: '/api/pay-apps/{id}/approve', description: 'Approve a pay application' },
    ],
  },
  {
    name: 'Change Orders',
    icon: 'CO',
    endpoints: [
      { method: 'GET', path: '/api/change-orders/list', description: 'List change orders for a project' },
      { method: 'POST', path: '/api/change-orders/create', description: 'Create a new change order' },
      { method: 'PATCH', path: '/api/change-orders/{id}', description: 'Update change order details' },
      { method: 'POST', path: '/api/change-orders/{id}/approve', description: 'Approve a change order' },
    ],
  },
  {
    name: 'RFIs',
    icon: '?',
    endpoints: [
      { method: 'GET', path: '/api/rfis/list', description: 'List RFIs for a project' },
      { method: 'POST', path: '/api/rfis/create', description: 'Create a new RFI' },
      { method: 'PATCH', path: '/api/rfis/{id}', description: 'Update RFI or add response' },
      { method: 'POST', path: '/api/rfis/{id}/respond', description: 'Submit an RFI response' },
    ],
  },
  {
    name: 'Invoices',
    icon: 'I',
    endpoints: [
      { method: 'GET', path: '/api/invoices/list', description: 'List invoices with optional filters' },
      { method: 'POST', path: '/api/invoices/create', description: 'Create a new invoice' },
      { method: 'GET', path: '/api/invoices/{id}', description: 'Get invoice details' },
      { method: 'PATCH', path: '/api/invoices/{id}', description: 'Update invoice status or fields' },
      { method: 'DELETE', path: '/api/invoices/{id}', description: 'Delete an invoice' },
    ],
  },
  {
    name: 'Contracts',
    icon: 'C',
    endpoints: [
      { method: 'GET', path: '/api/contracts/list', description: 'List contracts for a project' },
      { method: 'POST', path: '/api/contracts/create', description: 'Create a new contract' },
      { method: 'GET', path: '/api/contracts/{id}', description: 'Get contract details' },
      { method: 'PATCH', path: '/api/contracts/{id}', description: 'Update contract fields' },
    ],
  },
  {
    name: 'Subcontractors',
    icon: 'S',
    endpoints: [
      { method: 'GET', path: '/api/subcontractors/list', description: 'List subcontractors for the tenant' },
      { method: 'POST', path: '/api/subcontractors/create', description: 'Add a new subcontractor' },
      { method: 'PATCH', path: '/api/subcontractors/{id}', description: 'Update subcontractor details' },
      { method: 'GET', path: '/api/subcontractors/{id}/compliance', description: 'Get compliance status and documents' },
    ],
  },
];

const WEBHOOK_EVENTS = [
  { event: 'project.created', description: 'A new project is created' },
  { event: 'project.updated', description: 'A project is updated' },
  { event: 'project.status_changed', description: 'A project status changes' },
  { event: 'invoice.created', description: 'A new invoice is created' },
  { event: 'invoice.sent', description: 'An invoice is sent to the client' },
  { event: 'invoice.paid', description: 'An invoice is marked as paid' },
  { event: 'pay_app.submitted', description: 'A pay application is submitted' },
  { event: 'pay_app.approved', description: 'A pay application is approved' },
  { event: 'pay_app.rejected', description: 'A pay application is rejected' },
  { event: 'change_order.created', description: 'A new change order is created' },
  { event: 'change_order.approved', description: 'A change order is approved' },
  { event: 'rfi.submitted', description: 'A new RFI is submitted' },
  { event: 'rfi.responded', description: 'An RFI receives a response' },
  { event: 'contract.signed', description: 'A contract is signed' },
  { event: 'daily_log.created', description: 'A daily log is submitted' },
  { event: 'safety_incident.reported', description: 'A safety incident is reported' },
  { event: 'document.uploaded', description: 'A document is uploaded' },
];

const CODE_EXAMPLES = {
  curl: `curl -X GET "https://app.saguarocrm.com/api/projects/list" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
  javascript: `const response = await fetch('https://app.saguarocrm.com/api/projects/list', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
});
const data = await response.json();
console.log(data.projects);`,
  python: `import requests

response = requests.get(
    'https://app.saguarocrm.com/api/projects/list',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json',
    }
)
data = response.json()
print(data['projects'])`,
};

export default function ApiDocsPage() {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [codeTab, setCodeTab] = useState<'curl' | 'javascript' | 'python'>('curl');
  const [activeSection, setActiveSection] = useState<'endpoints' | 'auth' | 'webhooks' | 'try'>('endpoints');
  const [tryApiKey, setTryApiKey] = useState('');
  const [tryEndpoint, setTryEndpoint] = useState('/api/projects/list');
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
      setTryResponse(`Error: ${e.message}`);
    }
    setTryLoading(false);
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1300, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13, color: DIM }}>
        <Link href="/app/integrations" style={{ color: GOLD, textDecoration: 'none' }}>Integrations</Link>
        <span>/</span>
        <span style={{ color: TEXT }}>API Documentation</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: TEXT }}>API Documentation</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: DIM }}>
          Build custom integrations with the Saguaro REST API
        </p>
      </div>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: CARD, borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'endpoints' as const, label: 'Endpoints' },
          { key: 'auth' as const, label: 'Authentication' },
          { key: 'webhooks' as const, label: 'Webhooks' },
          { key: 'try' as const, label: 'Try It' },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none',
              background: activeSection === s.key ? GOLD : 'transparent',
              color: activeSection === s.key ? '#0d1117' : DIM,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ============ ENDPOINTS ============ */}
      {activeSection === 'endpoints' && (
        <div>
          {API_MODULES.map((mod) => (
            <div key={mod.name} style={{ marginBottom: 16 }}>
              <button
                onClick={() => setActiveModule(activeModule === mod.name ? null : mod.name)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                  background: CARD, border: `1px solid ${activeModule === mod.name ? GOLD + '44' : BORDER}`,
                  borderRadius: activeModule === mod.name ? '14px 14px 0 0' : 14,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `linear-gradient(135deg, ${GOLD}22, ${GOLD}44)`,
                  border: `1px solid ${GOLD}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900, color: GOLD, flexShrink: 0,
                }}>
                  {mod.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{mod.name}</div>
                  <div style={{ fontSize: 12, color: DIM }}>{mod.endpoints.length} endpoints</div>
                </div>
                <span style={{ color: DIM, fontSize: 18, transform: activeModule === mod.name ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  {'\u25BC'}
                </span>
              </button>

              {activeModule === mod.name && (
                <div style={{
                  background: CARD, border: `1px solid ${BORDER}`, borderTop: 'none',
                  borderRadius: '0 0 14px 14px', padding: '4px 0',
                }}>
                  {mod.endpoints.map((ep, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                        borderBottom: i < mod.endpoints.length - 1 ? `1px solid ${BORDER}22` : 'none',
                      }}
                    >
                      <span style={{
                        padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 800,
                        minWidth: 52, textAlign: 'center', fontFamily: 'monospace',
                        background: METHOD_COLORS[ep.method] + '18',
                        color: METHOD_COLORS[ep.method],
                      }}>
                        {ep.method}
                      </span>
                      <code style={{ fontSize: 13, color: TEXT, fontFamily: 'monospace', fontWeight: 500, minWidth: 260 }}>
                        {ep.path}
                      </code>
                      <span style={{ fontSize: 12, color: DIM, flex: 1 }}>{ep.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ============ AUTHENTICATION ============ */}
      {activeSection === 'auth' && (
        <div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: TEXT }}>Bearer Token Authentication</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: DIM, lineHeight: 1.6 }}>
              All API requests require authentication via a Bearer token in the Authorization header. You can obtain a token by signing in through the Saguaro authentication flow. The token represents your user session and is scoped to your tenant.
            </p>

            <div style={{
              background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16,
              fontFamily: 'monospace', fontSize: 13, color: GREEN, marginBottom: 20,
            }}>
              <div style={{ color: DIM, marginBottom: 8 }}>// Include in every request:</div>
              <div>Authorization: Bearer {'<your_access_token>'}</div>
            </div>

            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: TEXT }}>Token Lifecycle</h4>
            <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 13, color: DIM, lineHeight: 2 }}>
              <li>Access tokens expire after <span style={{ color: TEXT }}>1 hour</span></li>
              <li>Use the refresh token to obtain a new access token</li>
              <li>Refresh tokens expire after <span style={{ color: TEXT }}>30 days</span></li>
              <li>All tokens are scoped to a single tenant</li>
            </ul>
          </div>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: TEXT }}>Code Examples</h3>

            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: DARK, borderRadius: 8, padding: 4, width: 'fit-content' }}>
              {(['curl', 'javascript', 'python'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setCodeTab(lang)}
                  style={{
                    padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: 'none', textTransform: 'capitalize',
                    background: codeTab === lang ? GOLD : 'transparent',
                    color: codeTab === lang ? '#0d1117' : DIM,
                  }}
                >
                  {lang}
                </button>
              ))}
            </div>

            <div style={{
              background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18,
              fontFamily: 'monospace', fontSize: 12, color: TEXT, lineHeight: 1.7,
              whiteSpace: 'pre-wrap', overflowX: 'auto',
            }}>
              {CODE_EXAMPLES[codeTab]}
            </div>
          </div>
        </div>
      )}

      {/* ============ WEBHOOKS ============ */}
      {activeSection === 'webhooks' && (
        <div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: TEXT }}>Webhook Events</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: DIM }}>
              Subscribe to events and receive real-time notifications when things happen in Saguaro. Register webhook endpoints via the Zapier integration or the API.
            </p>

            <div style={{
              background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16,
              fontFamily: 'monospace', fontSize: 12, color: DIM, marginBottom: 20,
            }}>
              <div style={{ color: GREEN }}>POST /api/integrations/zapier</div>
              <div style={{ marginTop: 8, color: TEXT }}>{'{'}</div>
              <div style={{ color: TEXT }}>&nbsp;&nbsp;"url": "https://your-server.com/webhooks/saguaro",</div>
              <div style={{ color: TEXT }}>&nbsp;&nbsp;"events": ["project.created", "invoice.sent"]</div>
              <div style={{ color: TEXT }}>{'}'}</div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Event</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {WEBHOOK_EVENTS.map((ev, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                      <td style={{ padding: '10px 14px' }}>
                        <code style={{ fontSize: 12, color: GOLD, fontFamily: 'monospace', background: `${GOLD}12`, padding: '2px 8px', borderRadius: 4 }}>
                          {ev.event}
                        </code>
                      </td>
                      <td style={{ padding: '10px 14px', color: DIM }}>{ev.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: TEXT }}>Webhook Payload Format</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>
              Every webhook delivery includes these headers and payload structure:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>Headers</div>
                <div style={{
                  background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14,
                  fontFamily: 'monospace', fontSize: 11, color: TEXT, lineHeight: 1.8,
                }}>
                  <div>Content-Type: application/json</div>
                  <div>X-Saguaro-Event: project.created</div>
                  <div>X-Saguaro-Delivery: whd_abc123</div>
                  <div>X-Saguaro-Signature: sha256=...</div>
                  <div>User-Agent: Saguaro-Webhooks/1.0</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>Body</div>
                <div style={{
                  background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14,
                  fontFamily: 'monospace', fontSize: 11, color: TEXT, lineHeight: 1.8,
                }}>
                  <div>{'{'}</div>
                  <div>&nbsp;&nbsp;"event": "project.created",</div>
                  <div>&nbsp;&nbsp;"timestamp": "2026-03-28T...",</div>
                  <div>&nbsp;&nbsp;"webhook_id": "whd_abc123",</div>
                  <div>&nbsp;&nbsp;"data": {'{ ... }'}</div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ TRY IT ============ */}
      {activeSection === 'try' && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: TEXT }}>API Explorer</h3>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: DIM }}>Test API endpoints directly from this page</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Request Side */}
            <div>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: DIM, display: 'block', marginBottom: 5 }}>API Key (Bearer Token)</span>
                <input
                  value={tryApiKey}
                  onChange={(e) => setTryApiKey(e.target.value)}
                  placeholder="Paste your access token..."
                  style={{
                    width: '100%', padding: '10px 14px', background: DARK, border: `1px solid ${BORDER}`,
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
                    padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`,
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
                    flex: 1, padding: '10px 14px', background: DARK, border: `1px solid ${BORDER}`,
                    borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {tryMethod !== 'GET' && (
                <label style={{ display: 'block', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: DIM, display: 'block', marginBottom: 5 }}>Request Body (JSON)</span>
                  <textarea
                    value={tryBody}
                    onChange={(e) => setTryBody(e.target.value)}
                    placeholder={'{\n  "name": "Test Project"\n}'}
                    rows={8}
                    style={{
                      width: '100%', padding: '10px 14px', background: DARK, border: `1px solid ${BORDER}`,
                      borderRadius: 8, color: TEXT, fontSize: 12, outline: 'none', fontFamily: 'monospace',
                      resize: 'vertical', boxSizing: 'border-box',
                    }}
                  />
                </label>
              )}

              <button
                onClick={handleTryIt}
                disabled={tryLoading}
                style={{
                  padding: '10px 28px', borderRadius: 8, cursor: 'pointer',
                  background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none',
                  color: '#ffffff', fontSize: 13, fontWeight: 700,
                  opacity: tryLoading ? 0.6 : 1,
                }}
              >
                {tryLoading ? 'Sending...' : 'Send Request'}
              </button>

              {/* Quick endpoint buttons */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: DIM, marginBottom: 8 }}>Quick Select:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['/api/projects/list', '/api/invoices/list', '/api/integrations/marketplace', '/api/integrations/zapier'].map((ep) => (
                    <button
                      key={ep}
                      onClick={() => { setTryEndpoint(ep); setTryMethod('GET'); }}
                      style={{
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                        background: tryEndpoint === ep ? `${GOLD}18` : 'transparent',
                        border: `1px solid ${tryEndpoint === ep ? GOLD + '44' : BORDER}`,
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
              <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>Response</div>
              <div style={{
                background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16,
                fontFamily: 'monospace', fontSize: 12, color: TEXT, lineHeight: 1.6,
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
        </div>
      )}
    </div>
  );
}
