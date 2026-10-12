'use client';

/**
 * Delete account (web).
 *
 * The iOS app needs this screen for App Store Guideline 5.1.1(v), but the
 * obligation is not really Apple's — a product that lets you sign up owes you a
 * way out that does not route through a support queue. The privacy policy
 * points here by name, so this page has to exist for that sentence to be true.
 *
 * Same contract as app/delete-account.tsx in the field app, and the same two
 * outcomes, because both call GET /api/account/delete first and show the answer
 * before offering the button: deleting a login off a ten-person account is not
 * the same act as deleting the last login on a company's workspace, and the
 * person doing it should be told which one they are about to do.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Warning, ArrowLeft } from '@phosphor-icons/react';
import { PremiumSurface, SectionCard, DangerButton } from '@/components/ui/premium';

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';
const RED = 'var(--danger)';
const BORDER = 'var(--surface-raised)';
const CARD = 'var(--bg-surface-2)';

type Preview = {
  email: string;
  otherMembers: number;
  scope: 'member' | 'workspace';
  purgeDays: number;
  summary: string;
};

export default function DeleteAccountPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/account/delete');
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) { setLoadErr(body?.error || 'Could not load your account details.'); return; }
        setPreview(body as Preview);
      } catch {
        if (live) setLoadErr('Could not reach the server.');
      }
    })();
    return () => { live = false; };
  }, []);

  const matches = !!preview && typed.trim().toLowerCase() === preview.email.trim().toLowerCase();
  const workspace = preview?.scope === 'workspace';

  async function onDelete() {
    if (!matches || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_email: typed.trim(), source: 'web' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.error || 'Could not delete the account.'); setBusy(false); return; }
      /* The credential is already dead server-side; clearing local storage stops
         the browser holding a token that can only ever 401 from here on. */
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('sb-') || k.toLowerCase().includes('supabase')) localStorage.removeItem(k);
        }
        sessionStorage.clear();
      } catch { /* storage unavailable — the server-side delete already happened */ }
      window.location.replace('/login?deleted=1');
    } catch {
      setErr('Could not reach the server. Nothing was deleted.');
      setBusy(false);
    }
  }

  return (
    <PremiumSurface>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <Link
          href="/app/settings"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: DIM, textDecoration: 'none', fontSize: 13, marginBottom: 16 }}
        >
          <ArrowLeft size={14} weight="bold" /> Settings
        </Link>

        <h1 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: '0 0 20px' }}>Delete Account</h1>

        {loadErr ? (
          <SectionCard><div style={{ color: DIM, fontSize: 14 }}>{loadErr}</div></SectionCard>
        ) : null}

        {!preview && !loadErr ? (
          <SectionCard><div style={{ color: DIM, fontSize: 14 }}>Checking your account…</div></SectionCard>
        ) : null}

        {preview ? (
          <>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginBottom: 20,
                borderRadius: 12,
                border: `1px solid ${workspace ? 'rgba(248,113,113,0.45)' : 'color-mix(in srgb, var(--warning) 35%, transparent)'}`,
                background: workspace ? 'rgba(248,113,113,0.10)' : 'color-mix(in srgb, var(--warning) 8%, transparent)',
              }}
            >
              <Warning size={22} weight="fill" color={workspace ? RED : 'var(--warning)'} />
              <div style={{ fontSize: 14, fontWeight: 800, color: workspace ? RED : 'var(--warning)' }}>
                {workspace ? 'This deletes the whole company account' : 'This cannot be undone'}
              </div>
            </div>

            <SectionCard title="What Happens">
              <div style={{ fontSize: 14, lineHeight: 1.75, color: DIM }}>{preview.summary}</div>
            </SectionCard>

            <div style={{ height: 20 }} />

            <SectionCard title="Confirm">
              <div style={{ fontSize: 14, color: DIM, marginBottom: 12 }}>
                Type <span style={{ color: TEXT, fontWeight: 700 }}>{preview.email}</span> to confirm.
              </div>
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="your email address"
                disabled={busy}
                style={{
                  width: '100%', boxSizing: 'border-box', height: 44, borderRadius: 10,
                  border: `1px solid ${BORDER}`, background: CARD, color: TEXT,
                  padding: '0 12px', fontSize: 15, fontWeight: 600, outline: 'none',
                }}
              />
              {err ? <div style={{ marginTop: 10, fontSize: 13, color: RED }}>{err}</div> : null}
              <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <DangerButton size="md" disabled={!matches || busy} onClick={onDelete}>
                  {busy ? 'Deleting…' : 'Delete My Account'}
                </DangerButton>
                <Link href="/app/settings" style={{ color: 'var(--link)', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                  Keep My Account
                </Link>
              </div>
            </SectionCard>

            <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: DIM }}>
              Questions about your data: privacy@saguarocontrol.net
            </div>
          </>
        ) : null}
      </div>
    </PremiumSurface>
  );
}
