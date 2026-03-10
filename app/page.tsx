/**
 * Root page — serves the Saguaro marketing website.
 *
 * Flow:
 *   saguarocrm.com/           → This page (marketing site)
 *   saguarocrm.com/sandbox    → Signup page → /app (CRM)
 *   saguarocrm.com/login      → Login → /app (CRM)
 *   saguarocrm.com/app        → Full CRM dashboard
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const html = await readFile(
      join(process.cwd(), 'public', 'marketing.html'),
      'utf-8',
    );
    // Return raw HTML — bypasses React rendering entirely
    return (
      <div
        style={{ all: 'unset' } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    // Fallback: show a simple landing page
    return (
      <div style={{
        minHeight: '100vh', background: '#0d1117', color: '#e8edf8',
        fontFamily: 'system-ui', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
      }}>
        <div style={{ fontSize: 64 }}>🌵</div>
        <h1 style={{ color: '#D4A017', margin: 0, fontSize: 36, fontWeight: 900 }}>Saguaro CRM</h1>
        <p style={{ color: '#8fa3c0', fontSize: 18, margin: 0 }}>
          AI-powered construction management platform
        </p>
        <div style={{ display: 'flex', gap: 14 }}>
          <a href="/sandbox" style={{ padding: '14px 28px', background: 'linear-gradient(135deg,#D4A017,#F0C040)', color: '#0d1117', borderRadius: 8, fontWeight: 900, fontSize: 16, textDecoration: 'none' }}>
            🚀 Start Free Sandbox
          </a>
          <a href="/login" style={{ padding: '14px 24px', background: '#1f2c3e', border: '1px solid #263347', color: '#8fa3c0', borderRadius: 8, fontSize: 16, textDecoration: 'none' }}>
            Sign In
          </a>
        </div>
      </div>
    );
  }
}

// Need React import for JSX
import React from 'react';
