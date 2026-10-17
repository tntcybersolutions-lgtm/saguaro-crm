'use client';

/**
 * Branding — make the platform look like the tenant's own system. Pass 4 on
 * the kit.
 *
 * Two things a page like this usually gets wrong, and the reasons this one is
 * built the way it is:
 *
 * It lets you pick a color that hides the text, then leaves you to work out
 * why the product looks broken. Here every color is run through
 * lib/brand-theme, which measures each pair against WCAG and adjusts anything
 * that falls short — and then SAYS SO, on this page, in words, with the
 * before-and-after ratio. A GC whose brand had to be darkened learns that from
 * us rather than from a screen they cannot read.
 *
 * And it shows swatches instead of the product. The preview here is a real
 * card, a real button, real body and secondary text, on the real surfaces —
 * because a color that looks fine as a square can still be unreadable as a
 * label.
 *
 * Reads / writes (unchanged): GET /api/branding · PUT /api/branding
 * { company_name, primary_color, surface_color, show_saguaro_credit }.
 * Saving here never touches the logo URL — that lives on the main settings
 * page — so unrelated config is never reset.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Warning, UploadSimple, ArrowCounterClockwise } from '@phosphor-icons/react';
import { deriveTheme, contrast, parseHex, AA_TEXT } from '@/lib/brand-theme';
import { paletteHex } from '@/lib/design-tokens';
import { PageShell, Card, Badge, Button, Field, Input } from '@/components/ui/kit';
import { layout } from '@/lib/design-tokens';

/* Saguaro's default brand colour as a real hex: the colour picker, the
   contrast maths and the save all need a hex, never a CSS variable (a
   variable here showed a black swatch and the text "var(--brand-primary)"). */
const SAGUARO_GOLD: string = paletteHex.yellow;
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const PLATFORM_BASE = '#0d1117';

/* Grounds that are known-good starting points, so nobody has to guess a hex. */
const GROUND_PRESETS = [
  { label: 'Platform Dark', value: '' },
  { label: 'True Black', value: 'var(--bg-base)' },
  { label: 'Charcoal', value: '#14171C' },
  { label: 'Navy', value: '#0B1524' },
  { label: 'Warm Dark', value: '#161310' },
  { label: 'Light', value: 'var(--text-primary)' },
];

const CSS = `
.brWs > .k-page { max-width: none; }
.brCq { container: brws / inline-size; min-width: 0; }
.brSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.brSplit > * { min-width: 0; }
@container brws (min-width: 1080px) {
  .brSplit { grid-template-columns: minmax(340px, 1fr) clamp(${layout.detailRailMin}px, 36%, 440px); }
}
.brRail { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 16px; }
.brStack { display: flex; flex-direction: column; gap: 16px; }
.brProse { font-size: var(--fs-sm); color: var(--text-secondary); line-height: 1.6; margin: 0; max-width: ${layout.readingMaxWidth}; }
.brList { margin: 10px 0 14px; padding-left: 18px; color: var(--text-tertiary); font-size: var(--fs-xs); line-height: 1.75; }
.brColor { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.brColor input[type="color"] { width: 56px; height: 40px; padding: 0; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: transparent; cursor: pointer; }
.brColor .k-input { font-family: ui-monospace, monospace; max-width: 160px; }
.brChips { display: flex; flex-wrap: wrap; gap: 8px; }
.brChip { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 13px; border-radius: var(--radius-sm); cursor: pointer; background: var(--bg-surface-2); border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: var(--fs-sm); font-weight: 700; }
.brChip:hover { border-color: var(--border-strong); color: var(--text-primary); }
.brChip[aria-pressed="true"] { background: var(--brand-primary-12); border-color: var(--brand-primary); color: var(--text-primary); }
.brChip:focus-visible { outline: 2px solid var(--focus-ring); }
.brSwatch { width: 15px; height: 15px; border-radius: 4px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2); }
.brCheck { display: flex; align-items: flex-start; gap: 11px; cursor: pointer; }
.brCheck input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--brand-primary); cursor: pointer; flex-shrink: 0; }
.brCheckTitle { display: block; font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); }
.brCheckSub { display: block; font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 3px; line-height: 1.55; }
.brMsg { display: flex; align-items: center; gap: 9px; padding: 11px 14px; border-radius: var(--radius-sm); font-size: var(--fs-sm); font-weight: 600; }
.brMsg[data-ok="true"] { background: rgba(74,222,128,.10); border: 1px solid rgba(74,222,128,.35); color: var(--status-ongoing); }
.brMsg[data-ok="false"] { background: rgba(248,113,113,.08); border: 1px solid rgba(248,113,113,.35); color: var(--status-overdue); }
.brFix { background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px 12px; }
.brFixWhat { font-size: var(--fs-sm); font-weight: 800; color: var(--text-primary); margin-bottom: 5px; }
.brFixRow { display: flex; align-items: center; gap: 8px; font-size: var(--fs-xs); color: var(--text-tertiary); font-family: ui-monospace, monospace; }
.brFixRow i { width: 13px; height: 13px; border-radius: 3px; display: inline-block; border: 1px solid rgba(255,255,255,0.2); }
.brFixRatio { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 5px; }
.brFixRatio b { color: var(--status-ongoing); }
.brRisk { margin-top: 12px; font-size: var(--fs-xs); color: var(--status-completed); line-height: 1.55; }
.brQ { font-size: var(--fs-md); font-weight: 800; color: var(--text-primary); margin-bottom: 5px; }
.brA { font-size: var(--fs-sm); color: var(--text-secondary); line-height: 1.65; }
.brFaq { display: grid; gap: 16px; max-width: ${layout.readingMaxWidth}; }
.brFoot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: var(--fs-xs); color: var(--text-tertiary); }
@media (max-width: 640px) {
  .brWs .k-btn, .brWs .k-input, .brChip { min-height: 44px; }
}
`;

export default function BrandingPage() {
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primary, setPrimary] = useState(SAGUARO_GOLD);
  const [surface, setSurface] = useState('');
  const [showCredit, setShowCredit] = useState(true);
  const [saved, setSaved] = useState<{ companyName: string; primary: string; surface: string; showCredit: boolean } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/branding')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const cn = d.company_name ?? '';
        const pc = isHex(d.primary_color) ? d.primary_color : SAGUARO_GOLD;
        const sc = d.surface_color ?? '';
        const cr = d.show_saguaro_credit !== false;
        setCompanyName(cn);
        setLogoUrl(d.logo_url ?? '');
        setPrimary(pc);
        setSurface(sc);
        setShowCredit(cr);
        setSaved({ companyName: cn, primary: pc, surface: sc, showCredit: cr });
      })
      .catch(() => { /* the form still works from defaults */ })
      .finally(() => setLoading(false));
  }, []);

  /* The theme the tenant would actually get, recomputed as they type. */
  const theme = useMemo(
    () => deriveTheme({ primary, surface: surface || null }),
    [primary, surface],
  );

  /* What the colors would have done WITHOUT the guarantee — this is what the
     warning panel is really reporting, and why it is worth reading. */
  const rawRisk = useMemo(() => {
    const p = parseHex(primary);
    const s = parseHex(surface || PLATFORM_BASE);
    if (!p || !s) return null;
    return contrast(p, s);
  }, [primary, surface]);

  const dirty = !!saved && (saved.companyName !== companyName || saved.primary !== primary || saved.surface !== surface || saved.showCredit !== showCredit);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          // The default is stored as "no custom colour", so a platform change still reaches this tenant.
          primary_color: primary.toLowerCase() === SAGUARO_GOLD.toLowerCase() ? '' : primary,
          surface_color: surface,
          show_saguaro_credit: showCredit,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save your branding.');
      setSaved({ companyName, primary, surface, showCredit });
      setMsg({ text: 'Saved. Your branding is live for everyone on your account.', ok: true });
      window.dispatchEvent(new Event('saguaro:branding-updated'));
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save your branding.', ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="brWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Settings', href: '/app/settings' }, { label: 'Branding' }]}
        title="Branding"
        subtitle="Your logo and colors, everywhere customers see you."
        actions={
          <>
            {saved && <Badge tone={dirty ? 'lead' : 'ongoing'} dot>{dirty ? 'Unsaved changes' : 'Saved'}</Badge>}
            <Button variant="primary" onClick={save} disabled={saving || loading || (!!saved && !dirty)}>{saving ? 'Saving…' : 'Save Branding'}</Button>
          </>
        }
      >
        {msg && (
          <div className="brMsg" data-ok={msg.ok ? 'true' : 'false'} role="status">
            {msg.ok ? <CheckCircle size={16} weight="fill" /> : <Warning size={16} weight="fill" />}
            {msg.text}
          </div>
        )}

        <div className="brCq">
          <div className="brSplit">
            {/* ── the controls ─────────────────────────────────────────── */}
            <div className="brStack">
              <Card title="Company">
                <Field label="Company Name" hint="On contracts, pay apps, lien waivers and portal invites.">
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme General Contractors" />
                </Field>
              </Card>

              <Card title="Logo" actions={logoUrl ? <Badge tone="ongoing">Uploaded</Badge> : <Badge tone="neutral">Not set</Badge>}>
                <p className="brProse">Wide PNG or SVG, 400px or more.</p>
                <Button icon={<UploadSimple size={15} weight="bold" />} href="/app/settings#branding">{logoUrl ? 'Replace Logo' : 'Upload a Logo'}</Button>
              </Card>

              <Card title="Color">
                <Field label="Brand Color" hint="Buttons, links and highlights.">
                  <div className="brColor">
                    <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} aria-label="Brand color" />
                    <Input value={primary} onChange={(e) => setPrimary(e.target.value)} spellCheck={false} aria-label="Brand color hex" />
                    <Button icon={<ArrowCounterClockwise size={14} weight="bold" />} onClick={() => setPrimary(SAGUARO_GOLD)} disabled={primary === SAGUARO_GOLD}>Reset</Button>
                  </div>
                </Field>
              </Card>

              <Card title="Background">
                <div className="brChips" role="group" aria-label="Background">
                  {GROUND_PRESETS.map((g) => (
                    <button key={g.label} type="button" className="brChip" aria-pressed={surface === g.value} onClick={() => setSurface(g.value)}>
                      <span className="brSwatch" style={{ background: g.value || PLATFORM_BASE }} />
                      {g.label}
                    </button>
                  ))}
                </div>
              </Card>

              <Card title="Saguaro Credit">
                <label className="brCheck">
                  <input type="checkbox" checked={showCredit} onChange={(e) => setShowCredit(e.target.checked)} />
                  <span>
                    <span className="brCheckTitle">Show “Powered by Saguaro”</span>
                    <span className="brCheckSub">A small footer line on customer pages.</span>
                  </span>
                </label>
              </Card>

              <div className="brFoot">
                <Button variant="primary" onClick={save} disabled={saving || loading || (!!saved && !dirty)}>{saving ? 'Saving…' : 'Save Branding'}</Button>
              </div>
            </div>

            {/* ── the preview + the honesty panel ──────────────────────── */}
            <aside className="brRail" aria-label="Preview and readability">
              <Card title="Preview">
                <div style={{ background: theme.base, borderRadius: 12, padding: 16, border: `1px solid ${theme.border}` }}>
                  <div style={{ background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 5 }}>{companyName || 'Your Company'}</div>
                    <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.55, marginBottom: 4 }}>Application for payment #4 is with the owner for review.</div>
                    <div style={{ fontSize: 12, color: theme.textFaint, fontWeight: 700, marginBottom: 12 }}>Submitted 6 days ago</div>
                    {/* A picture of a button, not a button. It exists to show the
                        label reading against the fill, and a real <button> here
                        would be a control that does nothing. */}
                    <span role="presentation" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 38, padding: '0 16px', borderRadius: 9, background: theme.primary, color: theme.onPrimary, fontSize: 13, fontWeight: 800 }}>
                      Open Pay Application
                    </span>
                  </div>
                </div>
              </Card>

              {/**
               * The panel the whole page exists for. When nothing needed changing
               * it says so plainly; when something did, it names the pair in
               * words a person can act on, with the ratio before and after.
               */}
              <Card
                title={theme.fixes.length ? 'We Adjusted a Few Things' : 'Everything Is Readable'}
                actions={theme.fixes.length ? <Badge tone="lead" dot>{theme.fixes.length} adjusted</Badge> : <Badge tone="ongoing" dot>Passes AA</Badge>}
              >
                {theme.fixes.length === 0 ? (
                  <p className="brProse">Nothing needed changing.</p>
                ) : (
                  <>
                    <p className="brProse" style={{ marginBottom: 12 }}>Shifted just enough to stay readable.</p>
                    <div style={{ display: 'grid', gap: 9 }}>
                      {theme.fixes.map((f) => (
                        <div key={f.what} className="brFix">
                          <div className="brFixWhat">{f.what}</div>
                          <div className="brFixRow"><i style={{ background: f.from }} /><span>{f.from}</span><span>→</span><i style={{ background: f.to }} /><span>{f.to}</span></div>
                          <div className="brFixRatio">Readability {f.was}:1 → <b>{f.now}:1</b> (needs {AA_TEXT}:1)</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {rawRisk !== null && rawRisk < 2 && (
                  <div className="brRisk">Your color and background are too close — buttons will be hard to pick out. Try a lighter or darker background.</div>
                )}
              </Card>
            </aside>
          </div>
        </div>

        {/* ── the help ─────────────────────────────────────────────────── */}
        <Card title="If Something Looks Wrong">
          <div className="brFaq">
            {[
              { q: 'The text is hard to read', a: 'It should not be — every color is checked before it is used, and anything that would fail is adjusted automatically. If a screen still looks wrong, change the background in step 4 to “Platform Dark” and save. That returns everything except your logo and accent to the standard theme. Then tell us what you were looking at, because that is a bug in ours, not a mistake in yours.' },
              { q: 'My brand color looks different from my letterhead', a: 'Check the panel above. If your color appears there, we lightened or darkened it because at its original value the text on top of it could not be read. The hue is unchanged — it is the same color, adjusted only as far as it had to be. If you would rather keep the exact color, use a different background so it has more to stand against.' },
              { q: 'My logo looks small, or sits on a white box', a: 'A logo with a transparent background and plenty of width works best. If your artwork is dark, we put a light plate behind it so it is visible on a dark screen — upload a light or knock-out version instead and the plate goes away.' },
              { q: 'I want to start over', a: 'Set the background to “Platform Dark”, press Reset beside the color, and save. You are back to the standard look with your logo and company name intact.' },
              { q: 'Who sees this?', a: 'Everyone on your account, and every customer who opens a portal, a PDF or an email from you. It is not per-user — one look for the whole company.' },
            ].map((item) => (
              <div key={item.q}>
                <div className="brQ">{item.q}</div>
                <div className="brA">{item.a}</div>
              </div>
            ))}
          </div>
        </Card>
      </PageShell>
    </div>
  );
}
