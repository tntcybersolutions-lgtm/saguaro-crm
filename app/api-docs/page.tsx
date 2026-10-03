'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const C = {
  dark: 'var(--bg-base)',
  gold: 'var(--brand-primary)',
  goldBright: 'var(--brand-primary-strong)',
  text: '#F5F5F7',
  dim: '#A1A1AA',
  border: 'rgba(255,255,255,0.10)',
  raised: 'var(--bg-surface)',
  raisedAlt: 'var(--bg-surface-2)',
  green: '#22C55E',
  blue: '#6366F1',
  code: 'var(--bg-surface)',
  font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  mono: "ui-monospace,'SF Mono','JetBrains Mono','Cascadia Code',Menlo,Consolas,monospace",
};

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'The App', href: '/get-the-app' },
  { label: 'Security', href: '/security' },
];

const BASE_URL = 'https://api.saguarocontrol.net/v1';

const METHOD_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  GET: { bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.30)', text: C.green },
  POST: { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.30)', text: '#FBBF24' },
  PATCH: { bg: 'rgba(245, 158, 11,0.12)', border: 'rgba(245, 158, 11,0.30)', text: C.gold },
  DELETE: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)', text: '#F87171' },
};

const RESOURCES = [
  {
    name: 'Projects',
    blurb: 'Create and manage jobs — budgets, schedule of values, contacts, and statuses.',
    endpoints: [
      { method: 'GET', path: '/projects', desc: 'List all projects in your company' },
      { method: 'POST', path: '/projects', desc: 'Create a new project' },
      { method: 'GET', path: '/projects/{id}', desc: 'Retrieve a single project' },
      { method: 'PATCH', path: '/projects/{id}', desc: 'Update budget, status, or details' },
    ],
  },
  {
    name: 'RFIs',
    blurb: 'Submit, track, and respond to Requests for Information across every job.',
    endpoints: [
      { method: 'GET', path: '/projects/{id}/rfis', desc: 'List RFIs on a project' },
      { method: 'POST', path: '/projects/{id}/rfis', desc: 'Open a new RFI' },
      { method: 'PATCH', path: '/rfis/{id}', desc: 'Answer or change RFI status' },
    ],
  },
  {
    name: 'Pay Applications',
    blurb: 'Generate AIA G702/G703 pay apps, sync line items, and pull approval status.',
    endpoints: [
      { method: 'GET', path: '/projects/{id}/pay-apps', desc: 'List pay applications' },
      { method: 'POST', path: '/projects/{id}/pay-apps', desc: 'Draft a G702/G703 pay app' },
      { method: 'GET', path: '/pay-apps/{id}', desc: 'Retrieve a pay app + line items' },
    ],
  },
];

const REQUEST_SAMPLE = `curl ${BASE_URL}/projects \\
  -H "Authorization: Bearer sk_live_••••••••••••••••" \\
  -H "Content-Type: application/json"`;

const RESPONSE_SAMPLE = `{
  "data": [
    {
      "id": "prj_8Kd2mQ1xRa",
      "name": "Desert Ridge — Building C",
      "number": "2026-014",
      "status": "active",
      "contract_value": 4250000.00,
      "address": {
        "city": "Phoenix",
        "state": "AZ"
      },
      "created_at": "2026-03-11T17:42:08Z"
    }
  ],
  "has_more": false
}`;

const POST_SAMPLE = `curl ${BASE_URL}/projects/prj_8Kd2mQ1xRa/rfis \\
  -H "Authorization: Bearer sk_live_••••••••••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject": "Slab penetration conflict — Grid D4",
    "question": "Mechanical and structural drawings conflict at D4. Which governs?",
    "discipline": "structural",
    "due_date": "2026-06-21",
    "assignee_id": "usr_3Pn7vT9wLc"
  }'`;

const PAYAPP_SAMPLE = `{
  "id": "pay_5Hb9kF2yWm",
  "project_id": "prj_8Kd2mQ1xRa",
  "form": "G702",
  "period_to": "2026-05-31",
  "application_number": 7,
  "completed_to_date": 2890400.00,
  "retainage": 144520.00,
  "current_payment_due": 318060.00,
  "status": "submitted"
}`;

const FEATURES = [
  { title: 'Predictable REST', desc: 'Resource-oriented URLs, JSON bodies, standard verbs, and HTTP status codes. If you have used Stripe, you already know this API.' },
  { title: 'Bearer Auth', desc: 'Authenticate with a single API key in the Authorization header. Live and test keys, scoped per company, rotatable from your dashboard.' },
  { title: 'Cursor Pagination', desc: 'List endpoints page with limit and starting_after. Every response includes has_more so you know when to stop.' },
  { title: 'Idempotency Keys', desc: 'Pass an Idempotency-Key header on POST requests so a retried network call never double-creates a project or pay app.' },
  { title: 'Webhooks', desc: 'Subscribe to events — rfi.answered, pay_app.approved, project.status_changed — and react in real time instead of polling.' },
  { title: 'Rate Limits', desc: '100 requests/second per key with burst headroom. Every response carries X-RateLimit headers so you can back off gracefully.' },
];

const ERRORS = [
  { code: '200', label: 'OK', desc: 'Request succeeded.' },
  { code: '201', label: 'Created', desc: 'Resource was created.' },
  { code: '400', label: 'Bad Request', desc: 'Missing or malformed parameters.' },
  { code: '401', label: 'Unauthorized', desc: 'Missing, invalid, or revoked API key.' },
  { code: '403', label: 'Forbidden', desc: 'Key lacks scope for this resource.' },
  { code: '404', label: 'Not Found', desc: 'No resource with that ID in your company.' },
  { code: '429', label: 'Too Many Requests', desc: 'Rate limit exceeded — back off and retry.' },
  { code: '500', label: 'Server Error', desc: 'Something went wrong on our end.' },
];

function MethodBadge({ method, size = 'md' }: { method: string; size?: 'sm' | 'md' }) {
  const c = METHOD_COLORS[method] || METHOD_COLORS.GET;
  return (
    <span style={{
      display: 'inline-block', fontFamily: C.mono, fontWeight: 600,
      fontSize: size === 'sm' ? 10 : 11, letterSpacing: 0.5,
      color: c.text, background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 6, padding: size === 'sm' ? '2px 7px' : '3px 9px',
      minWidth: 52, textAlign: 'center', flexShrink: 0,
    }}>
      {method}
    </span>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }).catch(() => {});
    }
  };
  return (
    <div className="mkt-page" style={{ background: C.code, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FF5F56', display: 'inline-block' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FFBD2E', display: 'inline-block' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#27C93F', display: 'inline-block' }} />
          {label && <span style={{ marginLeft: 10, fontSize: 11, color: C.dim, fontFamily: C.mono, letterSpacing: 0.3 }}>{label}</span>}
        </div>
        <button onClick={copy} style={{
          background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${copied ? 'rgba(34,197,94,0.30)' : C.border}`,
          borderRadius: 7, color: copied ? C.green : C.dim, fontSize: 11, fontWeight: 500,
          padding: '4px 11px', cursor: 'pointer', fontFamily: C.font, letterSpacing: 0.3,
        }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '18px 20px', overflowX: 'auto', maxWidth: '100%', fontFamily: C.mono, fontSize: 12.5, lineHeight: 1.7, color: '#D8DEE9' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>
      <style>{`@media (max-width: 768px){ .apidocs-mnav-links{ display:none !important } }`}</style>

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 64, background: 'rgba(13,17,23,0.9)',
        borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', padding: '0 32px', gap: 0,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, marginRight: 40 }} aria-label="Saguaro Control Systems — home">
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
        </Link>
        <div className="apidocs-mnav-links" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {NAV_LINKS.map(link => (
            <a key={link.label} href={link.href} style={{ padding: '6px 12px', borderRadius: 6, color: C.dim, fontSize: 14, fontWeight: 400, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
              {link.label}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/login" style={{ padding: '8px 14px', color: C.dim, fontSize: 13, fontWeight: 400, textDecoration: 'none' }}>Log In</Link>
          <Link href="/signup" style={{ padding: '8px 18px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Free Trial</Link>
        </div>
      </nav>

      <div style={{ paddingTop: 64 }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '120px 24px 72px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 20, fontSize: 12, fontWeight: 400, color: C.dim, letterSpacing: 0.3, marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, display: 'inline-block' }} />
            Developer Preview — REST API v1
          </div>
          <h1 style={{ fontWeight: 600, lineHeight: 1.15, margin: '0 0 20px', letterSpacing: -0.5, color: C.text }}>
            Build on the Saguaro API
          </h1>
          <p style={{ fontSize: 17, color: C.dim, maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.65 }}>
            A clean, predictable REST API for the entire construction lifecycle — projects, RFIs, pay applications, AI takeoffs, and compliance docs. Push data in, pull it out, and wire Saguaro into your stack.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" style={{ display: 'inline-block', padding: '12px 26px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              Request API Access
            </Link>
            <a href="#quickstart" style={{ display: 'inline-block', padding: '12px 26px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontWeight: 400, fontSize: 15, textDecoration: 'none' }}>
              Read the Quickstart
            </a>
          </div>
        </section>

        {/* Base URL */}
        <section style={{ padding: '0 24px 88px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, padding: '28px 32px', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 240 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 8 }}>Base URL</div>
              <code style={{ fontFamily: C.mono, fontSize: 16, color: C.text, fontWeight: 500 }}>{BASE_URL}</code>
            </div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
              {[
                { k: 'Protocol', v: 'HTTPS Only' },
                { k: 'Format', v: 'JSON' },
                { k: 'Auth', v: 'Bearer Token' },
              ].map(item => (
                <div key={item.k}>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{item.k}</div>
                  <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{item.v}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section style={{ padding: '0 24px 120px', maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 400, color: C.dim, marginBottom: 18 }}>
              Why Developers Like It
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3, color: C.text }}>Designed to Feel Familiar</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 520, margin: '0 auto' }}>If you have integrated a modern SaaS API before, you will be productive in minutes.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0 48px' }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{ padding: '24px 0', borderTop: `1px solid rgba(255,255,255,0.08)` }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Quickstart / Authentication */}
        <section id="quickstart" style={{ padding: '0 24px 120px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 400, color: C.dim, marginBottom: 16 }}>
              Quickstart
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 14px', letterSpacing: -0.3, color: C.text }}>Authentication</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 640, margin: 0, lineHeight: 1.65 }}>
              Every request is authenticated with a secret API key passed as a Bearer token. Generate keys from{' '}
              <span style={{ color: C.text, fontWeight: 500 }}>Settings &rarr; Developers</span> in your Saguaro dashboard. Keys are scoped to your company — your data is isolated by row-level security and never crosses tenants.
            </p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <CodeBlock label="Authenticate a Request" code={REQUEST_SAMPLE} />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ color: C.gold, fontWeight: 600, fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>!</span>
            <p style={{ margin: 0, fontSize: 13.5, color: C.dim, lineHeight: 1.65 }}>
              Treat your secret key like a password. Never commit it to source control or expose it in client-side code. Use test keys (<code style={{ fontFamily: C.mono, color: C.text }}>sk_test_…</code>) in development and rotate live keys (<code style={{ fontFamily: C.mono, color: C.text }}>sk_live_…</code>) instantly if one leaks.
            </p>
          </div>
        </section>

        {/* Example endpoints */}
        <section style={{ padding: '0 24px 120px', maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 400, color: C.dim, marginBottom: 16 }}>
              Core Resources
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3, color: C.text }}>A Few Endpoints to Get You Started</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 560, margin: '0 auto' }}>Projects, RFIs, and pay applications — the resources most teams integrate first.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0 48px', marginBottom: 72 }}>
            {RESOURCES.map(res => (
              <div key={res.name} style={{ padding: '28px 0', borderTop: `1px solid rgba(255,255,255,0.08)` }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>{res.name}</div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 18 }}>{res.blurb}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {res.endpoints.map(ep => (
                    <div key={ep.method + ep.path} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <MethodBadge method={ep.method} size="sm" />
                        <code style={{ fontFamily: C.mono, fontSize: 12.5, color: C.text, fontWeight: 600, wordBreak: 'break-all' }}>{ep.path}</code>
                      </div>
                      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5, paddingLeft: 2 }}>{ep.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Worked examples: request + response */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 24, marginBottom: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <MethodBadge method="GET" />
                <code style={{ fontFamily: C.mono, fontSize: 14, color: C.text, fontWeight: 600 }}>/v1/projects</code>
              </div>
              <CodeBlock label="Request" code={REQUEST_SAMPLE} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.green, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, height: 28 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green }} /> 200 OK — Response
              </div>
              <CodeBlock label="application/json" code={RESPONSE_SAMPLE} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <MethodBadge method="POST" />
                <code style={{ fontFamily: C.mono, fontSize: 13, color: C.text, fontWeight: 600, wordBreak: 'break-all' }}>/v1/projects/{'{id}'}/rfis</code>
              </div>
              <CodeBlock label="Open an RFI" code={POST_SAMPLE} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <MethodBadge method="GET" />
                <code style={{ fontFamily: C.mono, fontSize: 13, color: C.text, fontWeight: 600, wordBreak: 'break-all' }}>/v1/pay-apps/{'{id}'}</code>
              </div>
              <CodeBlock label="Pay Application — G702" code={PAYAPP_SAMPLE} />
            </div>
          </div>
        </section>

        {/* Status codes */}
        <section style={{ padding: '0 24px 120px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 400, color: C.dim, marginBottom: 16 }}>
              Errors
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: -0.3, color: C.text }}>Standard HTTP Status Codes</h2>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, overflow: 'hidden' }}>
            {ERRORS.map((e, i) => {
              const ok = e.code.startsWith('2');
              return (
                <div key={e.code} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: i < ERRORS.length - 1 ? `1px solid rgba(255,255,255,0.08)` : 'none' }}>
                  <code style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: ok ? C.green : '#F87171', minWidth: 40 }}>{e.code}</code>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: C.text, minWidth: 150 }}>{e.label}</span>
                  <span style={{ fontSize: 13, color: C.dim, lineHeight: 1.5 }}>{e.desc}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ padding: '120px 24px', borderTop: `1px solid rgba(255,255,255,0.08)`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 16px', lineHeight: 1.2, letterSpacing: -0.4, color: C.text }}>
              Ready to Build Something?
            </h2>
            <p style={{ fontSize: 17, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              Create a free account, generate a test key from Settings &rarr; Developers, and make your first call in minutes. API access is included on Professional and Enterprise plans.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
              <Link href="/signup" style={{ display: 'inline-block', padding: '13px 30px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
                Request API Access
              </Link>
              <a href="mailto:developers@saguarocontrol.net" style={{ display: 'inline-block', padding: '13px 30px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontWeight: 400, fontSize: 15, textDecoration: 'none' }}>
                Talk to a Developer
              </a>
            </div>
            <div style={{ fontSize: 13, color: C.dim }}>
              Questions? Email <a href="mailto:developers@saguarocontrol.net" style={{ color: C.gold, textDecoration: 'none', fontWeight: 500 }}>developers@saguarocontrol.net</a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid rgba(255,255,255,0.08)`, padding: '48px 32px', background: 'transparent' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 32 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Saguaro Control Systems — home">
              <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 30, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
            </Link>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'Home', href: '/' }, { label: 'Features', href: '/features' },
                { label: 'Pricing', href: '/pricing' }, { label: 'API Docs', href: '/api-docs' },
                { label: 'The App', href: '/get-the-app' }, { label: 'Security', href: '/security' },
                { label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' },
              ].map(link => (
                <a key={link.label} href={link.href} style={{ fontSize: 13, color: C.dim, textDecoration: 'none', fontWeight: 400 }}>{link.label}</a>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap' }}>&copy; {new Date().getFullYear()} Saguaro Control Systems</div>
          </div>
        </footer>

      </div>
    </div>
  );
}
