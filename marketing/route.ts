/**
 * GET /api/marketing
 * Serves the marketing website HTML file.
 * Called via Next.js rewrite from the root URL.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const filePath = join(process.cwd(), 'public', 'marketing.html');
    const html = await readFile(filePath, 'utf-8');
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    });
  } catch {
    // Fallback if file not found
    return new Response(
      `<!DOCTYPE html><html><head><title>Saguaro CRM</title></head>
       <body style="background:#0d1117;color:#e8edf8;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px">
         <div style="font-size:48px">🌵</div>
         <h1 style="color:#D4A017;margin:0">Saguaro CRM</h1>
         <a href="/sandbox" style="background:#D4A017;color:#0d1117;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:800">Start Free Sandbox</a>
         <a href="/login" style="color:#8fa3c0;text-decoration:none">Sign In</a>
       </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}
