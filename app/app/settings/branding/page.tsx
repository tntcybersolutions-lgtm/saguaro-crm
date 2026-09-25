'use client';

/**
 * Branding — make the platform look like the tenant's own system.
 *
 * Two things a page like this usually gets wrong, and the reasons this one is
 * built the way it is:
 *
 * It lets you pick a colour that hides the text, then leaves you to work out
 * why the product looks broken. Here every colour is run through
 * lib/brand-theme, which measures each pair against WCAG and adjusts anything
 * that falls short — and then SAYS SO, on this page, in words, with the
 * before-and-after ratio. A GC whose brand had to be darkened learns that from
 * us rather than from a screen they cannot read.
 *
 * And it shows swatches instead of the product. The preview here is a real
 * card, a real button, real body and secondary text, on the real surfaces —
 * because a colour that looks fine as a square can still be unreadable as a
 * label.
 *
 * The help below is written for somebody who has never done this and does not
 * want to think about contrast ratios. It says what to do, in order, and what
 * to do when something looks wrong.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Palette, CheckCircle, Warning, Info, UploadSimple, ArrowCounterClockwise, Eye,
} from '@phosphor-icons/react';
import { deriveTheme, contrast, parseHex, AA_TEXT } from '@/lib/brand-theme';
import { ModuleHero, SectionCard, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';

const GOLD = '#F59E0B';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';

const SAGUARO_GOLD = '#F59E0B';
const PLATFORM_BASE = '#0d1117';

/* Grounds that are known-good starting points, so nobody has to guess a hex. */
const GROUND_PRESETS = [
  { label: 'Platform dark', value: '' },
  { label: 'True black', value: '#000000' },
  { label: 'Charcoal', value: '#14171C' },
  { label: 'Navy', value: '#0B1524' },
  { label: 'Warm dark', value: '#161310' },
  { label: 'Light', value: '#F7F8FA' },
];

export default function BrandingPage() {
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primary, setPrimary] = useState(SAGUARO_GOLD);
  const [surface, setSurface] = useState('');
  const [showCredit, setShowCredit] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/branding')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setCompanyName(d.company_name ?? '');
        setLogoUrl(d.logo_url ?? '');
        if (d.primary_color) setPrimary(d.primary_color);
        setSurface(d.surface_color ?? '');
        setShowCredit(d.show_saguaro_credit !== false);
      })
      .catch(() => { /* the form still works from defaults */ })
      .finally(() => setLoading(false));
  }, []);

  /* The theme the tenant would actually get, recomputed as they type. */
  const theme = useMemo(
    () => deriveTheme({ primary, surface: surface || null }),
    [primary, surface],
  );

  /* What the colours would have done WITHOUT the guarantee — this is what the
     warning panel is really reporting, and why it is worth reading. */
  const rawRisk = useMemo(() => {
    const p = parseHex(primary);
    const s = parseHex(surface || PLATFORM_BASE);
    if (!p || !s) return null;
    return contrast(p, s);
  }, [primary, surface]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          primary_color: primary,
          surface_color: surface,
          show_saguaro_credit: showCredit,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save your branding.');
      setMsg({ text: 'Saved. Your branding is live for everyone on your account.', ok: true });
      window.dispatchEvent(new Event('saguaro:branding-updated'));
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save your branding.', ok: false });
    } finally {
      setSaving(false);
    }
  }

  const label: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: DIM, marginBottom: 7,
  };
  const input: React.CSSProperties = {
    width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 9,
    background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
    color: TEXT, fontSize: 15, outline: 'none',
  };

  return (
    <main style={{ background: '#0d1117', minHeight: '100%', padding: '24px max(20px, 3vw) 80px' }}>
      <div style={{ maxWidth: 1080 }}>
        <ModuleHero
          eyebrow="BRANDING"
          eyebrowIcon={<Palette size={13} weight="fill" color={GOLD} />}
          title="Make it"
          accent="yours"
          subtitle="Your logo and colours, everywhere customers see you."
          note="pick your colour — we keep it readable"
        />

        {msg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderRadius: 10,
            marginBottom: 18, fontSize: 13.5, fontWeight: 600,
            background: msg.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
            color: msg.ok ? '#4ADE80' : '#F87171',
          }}>
            {msg.ok ? <CheckCircle size={16} weight="fill" /> : <Warning size={16} weight="fill" />}
            {msg.text}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,420px)', gap: 20, alignItems: 'start' }}>

          {/* ── the controls ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gap: 16 }}>

            <SectionCard title="Step 1 · Your company" icon={<Info size={17} weight="duotone" color={GOLD} />}>
              <label style={label}>Company name</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme General Contractors"
                style={input}
              />
              <p style={{ fontSize: 12.5, color: DIM, marginTop: 8, lineHeight: 1.55 }}>
                This is the name on your contracts, pay applications and lien waivers, and the
                one your customers see on a portal invite.
              </p>
            </SectionCard>

            <SectionCard title="Step 2 · Your logo" icon={<UploadSimple size={17} weight="duotone" color={GOLD} />}>
              <p style={{ fontSize: 13.5, color: '#C6D6E8', lineHeight: 1.6, margin: '0 0 12px' }}>
                Upload it on the main settings page. A wide logo works best — it sits in the
                top-left of every screen and at the head of every PDF.
              </p>
              <ul style={{ margin: '0 0 14px', paddingLeft: 18, color: DIM, fontSize: 12.5, lineHeight: 1.75 }}>
                <li>PNG or SVG with a transparent background looks best</li>
                <li>At least 400px wide so it stays sharp on a big screen</li>
                <li>A dark logo is fine — we put a light plate behind it automatically</li>
              </ul>
              <Link href="/app/settings#branding" style={{ ...ghostButtonStyle, display: 'inline-flex', textDecoration: 'none' }}>
                Upload a logo
              </Link>
            </SectionCard>

            <SectionCard title="Step 3 · Your colour" icon={<Palette size={17} weight="duotone" color={GOLD} />}>
              <label style={label}>Brand colour</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <input
                  type="color"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  aria-label="Brand colour"
                  style={{ width: 56, height: 44, padding: 0, border: `1px solid ${BORDER}`, borderRadius: 9, background: 'transparent', cursor: 'pointer' }}
                />
                <input
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  spellCheck={false}
                  style={{ ...input, fontFamily: 'ui-monospace, monospace', maxWidth: 160 }}
                />
                <button
                  onClick={() => setPrimary(SAGUARO_GOLD)}
                  style={{ ...ghostButtonStyle, minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ArrowCounterClockwise size={14} weight="bold" /> Reset
                </button>
              </div>
              <p style={{ fontSize: 12.5, color: DIM, margin: '0 0 4px', lineHeight: 1.55 }}>
                Buttons, links and highlights use this. Take it from your logo or your
                letterhead — anything you like. We will keep it readable.
              </p>
            </SectionCard>

            <SectionCard title="Step 4 · Your background (optional)" icon={<Eye size={17} weight="duotone" color={GOLD} />}>
              <p style={{ fontSize: 13.5, color: '#C6D6E8', lineHeight: 1.6, margin: '0 0 12px' }}>
                Most companies leave this alone — the dark background is easy on the eyes for a
                full day. Change it only if your brand really needs it.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {GROUND_PRESETS.map((g) => {
                  const active = surface === g.value;
                  return (
                    <button
                      key={g.label}
                      onClick={() => setSurface(g.value)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40,
                        padding: '0 13px', borderRadius: 9, cursor: 'pointer',
                        background: active ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? GOLD : BORDER}`,
                        color: active ? TEXT : DIM, fontSize: 13, fontWeight: 700,
                      }}
                    >
                      <span style={{
                        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                        background: g.value || PLATFORM_BASE,
                        border: '1px solid rgba(255,255,255,0.2)',
                      }} />
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Step 5 · The Saguaro credit" icon={<Info size={17} weight="duotone" color={GOLD} />}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showCredit}
                  onChange={(e) => setShowCredit(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: GOLD, cursor: 'pointer' }}
                />
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: TEXT }}>
                    Show “Powered by Saguaro”
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: DIM, marginTop: 3, lineHeight: 1.55 }}>
                    A small line in the footer linking to saguarocontrol.net. Turn it off and
                    the Saguaro name appears nowhere your customers can see.
                  </span>
                </span>
              </label>
            </SectionCard>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={save} disabled={saving || loading} style={{ ...goldButtonStyle, minHeight: 46, padding: '0 26px', opacity: saving || loading ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save branding'}
              </button>
              <span style={{ fontSize: 12.5, color: DIM }}>Applies to everyone on your account.</span>
            </div>
          </div>

          {/* ── the preview + the honesty panel ──────────────────────── */}
          <div style={{ position: 'sticky', top: 84, display: 'grid', gap: 16 }}>

            <SectionCard title="What it will look like" icon={<Eye size={17} weight="duotone" color={GOLD} />}>
              {/* The real thing, not swatches — a colour that reads fine as a
                  square can still be unreadable as a label. */}
              <div style={{ background: theme.base, borderRadius: 12, padding: 16, border: `1px solid ${theme.border}` }}>
                <div style={{ background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 5 }}>
                    {companyName || 'Your company'}
                  </div>
                  <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.55, marginBottom: 4 }}>
                    Application for payment #4 is with the owner for review.
                  </div>
                  <div style={{ fontSize: 11, color: theme.textFaint, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>
                    Submitted 6 days ago
                  </div>
                  {/* A picture of a button, not a button. It exists to show the
                      label reading against the fill, and a real <button> here
                      would be a control that does nothing — the exact thing the
                      dead-control audit is there to catch. */}
                  <span role="presentation" style={{
                    display: 'inline-flex', alignItems: 'center', minHeight: 38, padding: '0 16px',
                    borderRadius: 9, background: theme.primary, color: theme.onPrimary,
                    fontSize: 13, fontWeight: 800,
                  }}>
                    Open pay application
                  </span>
                </div>
              </div>
            </SectionCard>

            {/**
             * The panel the whole page exists for.
             *
             * When nothing needed changing it says so plainly, because silence
             * reads as "did it even check". When something did, it names the
             * pair in words a person can act on, and shows the ratio before and
             * after — so the tenant knows their brand was respected as far as
             * it could be, and exactly where it could not.
             */}
            <SectionCard
              title={theme.fixes.length ? 'We adjusted a few things' : 'Everything is readable'}
              icon={theme.fixes.length
                ? <Warning size={17} weight="duotone" color="#FB923C" />
                : <CheckCircle size={17} weight="duotone" color="#4ADE80" />}
            >
              {theme.fixes.length === 0 ? (
                <p style={{ fontSize: 13, color: '#C6D6E8', lineHeight: 1.6, margin: 0 }}>
                  Your colours passed every readability check on their own — nothing was changed.
                  Text, labels and buttons all clear the accessibility standard for normal sight
                  and for anyone using your system in bright sun on a jobsite.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: '#C6D6E8', lineHeight: 1.6, margin: '0 0 12px' }}>
                    Your colours are used as you chose them wherever they work. In these places
                    they would have been hard or impossible to read, so we shifted them just far
                    enough — the colour is still yours, only lighter or darker.
                  </p>
                  <div style={{ display: 'grid', gap: 9 }}>
                    {theme.fixes.map((f) => (
                      <div key={f.what} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: TEXT, marginBottom: 5 }}>{f.what}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: DIM }}>
                          <span style={{ width: 13, height: 13, borderRadius: 3, background: f.from, border: '1px solid rgba(255,255,255,0.2)' }} />
                          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{f.from}</span>
                          <span>→</span>
                          <span style={{ width: 13, height: 13, borderRadius: 3, background: f.to, border: '1px solid rgba(255,255,255,0.2)' }} />
                          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{f.to}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: DIM, marginTop: 5 }}>
                          Readability {f.was}:1 → <strong style={{ color: '#4ADE80' }}>{f.now}:1</strong>
                          {' '}(needs {AA_TEXT}:1)
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {rawRisk !== null && rawRisk < 2 && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: '#FB923C', lineHeight: 1.55 }}>
                  Your brand colour and your background are very close to each other. We can keep
                  the text readable, but buttons will be hard to pick out. Try a lighter or darker
                  background above.
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ── the help ─────────────────────────────────────────────────── */}
        <div style={{ marginTop: 26 }}>
          <SectionCard flat title="If something looks wrong" icon={<Info size={17} weight="duotone" color={GOLD} />}>
            <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
              {[
                {
                  q: 'The text is hard to read',
                  a: 'It should not be — every colour is checked before it is used, and anything that would fail is adjusted automatically. If a screen still looks wrong, change the background in step 4 to “Platform dark” and save. That returns everything except your logo and accent to the standard theme. Then tell us what you were looking at, because that is a bug in ours, not a mistake in yours.',
                },
                {
                  q: 'My brand colour looks different from my letterhead',
                  a: 'Check the panel above. If your colour appears there, we lightened or darkened it because at its original value the text on top of it could not be read. The hue is unchanged — it is the same colour, adjusted only as far as it had to be. If you would rather keep the exact colour, use a different background so it has more to stand against.',
                },
                {
                  q: 'My logo looks small, or sits on a white box',
                  a: 'A logo with a transparent background and plenty of width works best. If your artwork is dark, we put a light plate behind it so it is visible on a dark screen — upload a light or knock-out version instead and the plate goes away.',
                },
                {
                  q: 'I want to start over',
                  a: 'Set the background to “Platform dark”, press Reset beside the colour, and save. You are back to the standard look with your logo and company name intact.',
                },
                {
                  q: 'Who sees this?',
                  a: 'Everyone on your account, and every customer who opens a portal, a PDF or an email from you. It is not per-user — one look for the whole company.',
                },
              ].map((item) => (
                <div key={item.q}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, marginBottom: 5 }}>{item.q}</div>
                  <div style={{ fontSize: 13, color: '#C6D6E8', lineHeight: 1.65 }}>{item.a}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
