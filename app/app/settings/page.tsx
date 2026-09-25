'use client';
/**
 * Settings — workspace control panel.
 * Every control on this page does something real: profile fields save to
 * profiles, branding saves to tenants.settings (with instant sidebar refresh
 * via the `saguaro:branding-updated` event), and every hub row links to a
 * live route. No dead clicks.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { CreditCard, DeviceMobile, Bell, Users, Clipboard, FileText, Gear, Rocket, GraduationCap, Books, ChatCircle, Clock, ArrowRight, CloudArrowUp, ShieldCheck, Plugs, UserCircle, Palette, Lifebuoy, UploadSimple, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, GoldButton, DangerButton, Pill, goldButtonStyle } from '@/components/ui/premium';

const GOLD  = '#F59E0B';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM   = '#CBD5E1';
const TEXT  = '#FFFFFF';
const GREEN = '#22c55e';
const RED   = '#ef4444';
// Premium-surface field styling — legible on the aurora/glass backdrop.
const FIELD_BG = 'rgba(0,0,0,0.22)';

const inputStyle: React.CSSProperties = {
  width: '100%', background: FIELD_BG, border: `1px solid ${BORDER}`, borderRadius: 10,
  padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: DIM, fontWeight: 700, display: 'block', marginBottom: 6,
  letterSpacing: '0.08em', textTransform: 'uppercase',
};

interface SubInfo {
  plan_name: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
}
interface MeInfo {
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  role: string;
}

const SETTINGS_SECTIONS = [
  {
    title: 'Account & Billing',
    sectionIcon: CreditCard,
    items: [
      { icon: CreditCard, label: 'Subscription & Plan', desc: 'Manage your plan, upgrade, view invoices', href: '/app/billing', highlight: true },
      { icon: DeviceMobile, label: 'Get the iOS App', desc: 'Download Saguaro Control Systems for iPhone & iPad on Apple TestFlight — Android coming soon', href: '/get-the-app' },
      { icon: Bell, label: 'Notifications', desc: 'Configure email and push notification preferences', href: '/app/notification-settings' },
    ],
  },
  {
    title: 'Team & Permissions',
    sectionIcon: Users,
    items: [
      { icon: Users, label: 'Roles & Permissions', desc: 'Control what each team role can access', href: '/app/people?tab=access' },
      { icon: Palette, label: 'Branding & White Label', desc: 'Your logo and colours across every screen, report and email', href: '/app/settings/branding' },
      { icon: Plugs, label: 'Integration Hub', desc: 'API keys, outbound webhooks, and the integration marketplace', href: '/app/settings/integrations-hub' },
      { icon: CloudArrowUp, label: 'External Storage', desc: 'Connect S3, OneDrive, SharePoint, Egnyte, Dropbox, Google Drive, or Box', href: '/app/settings/storage' },
    ],
  },
  {
    title: 'Compliance & Documents',
    sectionIcon: Clipboard,
    items: [
      { icon: Clipboard, label: 'Custom Fields', desc: 'Add custom fields to projects, contacts, and bids', href: '/app/custom-fields' },
      { icon: FileText, label: 'Document Templates', desc: 'Manage your company document templates', href: '/app/documents' },
      { icon: Gear, label: 'Autopilot Rules', desc: 'Configure RFI, change order, and approval automations', href: '/app/autopilot' },
    ],
  },
  {
    title: 'Support & Resources',
    sectionIcon: Lifebuoy,
    items: [
      { icon: Rocket, label: 'Free Migration', desc: 'Migrate your data from any platform or spreadsheet', href: '/contact?reason=Migration%20help' },
      { icon: GraduationCap, label: 'Guided Onboarding', desc: 'Book a hands-on setup session with a Saguaro specialist ($1,200)', href: '/contact?reason=Demo%20request' },
      { icon: Books, label: 'Help Center', desc: 'Tutorials, walkthroughs, and FAQs', href: '/help-center' },
      { icon: ChatCircle, label: 'Contact Support', desc: 'Send us a message — we respond within 48hrs', href: '/contact?reason=Support%20request' },
    ],
  },
];

function daysLeft(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

/** "Acme General Contractors" -> "AG" — matches the sidebar lockup fallback. */
function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/** Inline save feedback — ✓ green when saved, warning red on failure. */
function SaveNotice({ notice }: { notice: { text: string; ok: boolean } | null }) {
  if (!notice) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: notice.ok ? GREEN : RED, fontWeight: 600 }}>
      {notice.ok ? <CheckCircle size={15} weight="fill" color={GREEN} /> : <WarningCircle size={15} weight="fill" color={RED} />}
      {notice.text}
    </span>
  );
}

export default function SettingsPage() {
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);

  // ── Profile ────────────────────────────────────────────────────────
  const [me, setMe] = useState<MeInfo | null>(null);
  const [profile, setProfile] = useState({ full_name: '', title: '', phone: '' });
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const profileMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Branding ───────────────────────────────────────────────────────
  const [branding, setBranding] = useState({ company_name: '', logo_url: '', primary_color: '' });
  const [brandingSaving, setBrandingSaving] = useState(false);
  /* The logo's real pixel shape, read off the loaded image. The sidebar caps
   * HEIGHT, so a portrait logo collapses to a sliver however good it looks in
   * a file browser — a real 600x1301 tenant logo rendered at 22x48. We measure
   * it and say so, instead of letting the user wonder why it looks broken. */
  const [logoDims, setLogoDims] = useState<{ w: number; h: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [brandingMsg, setBrandingMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const brandingMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/billing/subscription').then(r => r.ok ? r.json() : null).then(setSub).catch(() => {});
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setMe({ name: d.name ?? '', email: d.email ?? '', phone: d.phone ?? null, title: d.title ?? null, role: d.role ?? 'member' });
        setProfile({ full_name: d.name ?? '', title: d.title ?? '', phone: d.phone ?? '' });
      }
    }).catch(() => {});
    fetch('/api/platform/me').then(r => r.ok ? r.json() : null).then(d => setPlatformAdmin(!!d?.isPlatformAdmin)).catch(() => {});
    fetch('/api/branding').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setBranding({ company_name: d.company_name ?? '', logo_url: d.logo_url ?? '', primary_color: d.primary_color ?? '' });
    }).catch(() => {});
  }, []);

  // The sidebar lockup deep-links to /app/settings#branding — land on the card.
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#branding') return undefined;
    const t = setTimeout(() => document.getElementById('branding')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return () => clearTimeout(t);
  }, []);

  const flashProfile = (text: string, ok: boolean) => {
    setProfileMsg({ text, ok });
    if (profileMsgTimer.current) clearTimeout(profileMsgTimer.current);
    profileMsgTimer.current = setTimeout(() => setProfileMsg(null), 3500);
  };
  const flashBranding = (text: string, ok: boolean) => {
    setBrandingMsg({ text, ok });
    if (brandingMsgTimer.current) clearTimeout(brandingMsgTimer.current);
    brandingMsgTimer.current = setTimeout(() => setBrandingMsg(null), 3500);
  };

  // Tell the app shell the tenant brand changed → sidebar lockup refreshes instantly.
  const notifyShellBrandingChanged = () => {
    try { window.dispatchEvent(new CustomEvent('saguaro:branding-updated')); } catch { /* SSR-safe no-op */ }
  };

  const saveProfile = async () => {
    if (!profile.full_name.trim()) { flashProfile('Name cannot be empty.', false); return; }
    setProfileSaving(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: profile.full_name, title: profile.title, phone: profile.phone }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMe(m => m ? { ...m, name: profile.full_name.trim(), title: profile.title.trim() || null, phone: profile.phone.trim() || null } : m);
        setProfileDirty(false);
        flashProfile('Profile saved.', true);
      } else {
        flashProfile(d.error || 'Save failed.', false);
      }
    } catch {
      flashProfile('Save failed.', false);
    } finally {
      setProfileSaving(false);
    }
  };

  const saveBranding = async () => {
    setBrandingSaving(true);
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });
      if (res.ok) {
        flashBranding('Branding saved.', true);
        notifyShellBrandingChanged();
      } else {
        const d = await res.json().catch(() => ({}));
        flashBranding(d.error || 'Save failed.', false);
      }
    } catch {
      flashBranding('Save failed.', false);
    } finally {
      setBrandingSaving(false);
    }
  };

  const uploadLogo = useCallback(async (file: File) => {
    const okTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!okTypes.includes(file.type)) { flashBranding('Use PNG, JPG, WEBP, or SVG.', false); return; }
    if (file.size > 5 * 1024 * 1024) { flashBranding('Logo must be under 5 MB.', false); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/branding/logo', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.logo_url) {
        setBranding(b => ({ ...b, logo_url: d.logo_url }));
        flashBranding('Logo uploaded — sidebar updated.', true);
        // The upload endpoint persists the URL server-side, so refresh the shell now.
        notifyShellBrandingChanged();
      } else {
        flashBranding(d.error || 'Upload failed.', false);
      }
    } catch {
      flashBranding('Upload failed.', false);
    } finally {
      setUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trialDays = sub?.trial_ends_at ? daysLeft(sub.trial_ends_at) : null;
  const isTrialing = sub?.status === 'trialing';
  const isPastDue = sub?.status === 'past_due';

  const acctBorder = isPastDue ? RED : (isTrialing && trialDays !== null && trialDays <= 5 ? 'rgba(245,158,11,0.4)' : undefined);
  const previewColor = /^#[0-9a-fA-F]{6}$/.test(branding.primary_color) ? branding.primary_color : GOLD;

  return (
    <PremiumSurface maxWidth={920}>

      <ModuleHero
        eyebrow="Workspace"
        eyebrowIcon={<Gear size={13} weight="fill" color={GOLD} />}
        title="Settings"
        accent="& Preferences"
        subtitle="Manage your account, team, billing, and app preferences."
      />

      {/* Workspace snapshot — what the system knows about this account */}
      {(me || sub) && (
        <StatStrip items={[
          { label: 'Plan', value: sub?.plan_name || 'Free Trial', accent: isPastDue ? RED : undefined, sub: sub?.status === 'active' ? 'subscription active' : isTrialing ? 'trial in progress' : isPastDue ? 'payment failed — fix in Billing' : 'manage in Billing' },
          ...(isTrialing && trialDays !== null
            ? [{ label: 'Trial', value: `${trialDays}d left`, accent: trialDays <= 5 ? GOLD : undefined, sub: 'upgrade any time in Billing' }]
            : sub?.current_period_end
              ? [{ label: 'Renews', value: new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), sub: 'next billing date' }]
              : []),
          { label: 'Branding', value: (branding.logo_url || branding.company_name) ? 'Custom' : 'Default', accent: (branding.logo_url || branding.company_name) ? GREEN : undefined, sub: branding.company_name || 'set a name + logo below' },
          { label: 'Brand Color', value: branding.primary_color || 'Saguaro Gold', sub: branding.primary_color ? 'white-label accent' : 'default accent' },
          { label: 'Signed In As', value: me?.name || '—', sub: me?.email || undefined },
        ]} />
      )}

      {/* ── Your Profile — editable, saves to profiles ─────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard
          title="Your Profile"
          subtitle="Your name and contact info — shown on daily logs, approvals, and team lists."
          icon={<UserCircle size={18} weight="duotone" color={GOLD} />}
          accent={isPastDue ? RED : GOLD}
          style={acctBorder ? { borderColor: acctBorder } : undefined}
          action={sub ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12.5, color: DIM, marginBottom: 3 }}>
                Plan: <strong style={{ color: TEXT }}>{sub.plan_name ?? 'Free Trial'}</strong>
              </div>
              {isTrialing && trialDays !== null && (
                <div style={{ fontSize: 12.5, color: trialDays <= 5 ? GOLD : DIM }}>{trialDays} day{trialDays !== 1 ? 's' : ''} left in trial</div>
              )}
              {isPastDue && <div style={{ fontSize: 12.5, color: RED, fontWeight: 600 }}>Payment failed</div>}
              {sub.status === 'active' && sub.current_period_end && (
                <div style={{ fontSize: 12.5, color: GREEN }}>Active · renews {new Date(sub.current_period_end).toLocaleDateString()}</div>
              )}
              <Link href="/app/billing" style={{ fontSize: 12, color: GOLD, textDecoration: 'none', fontWeight: 600 }}>
                Manage Billing <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><ArrowRight size={12} weight="regular" color={GOLD} /></span>
              </Link>
            </div>
          ) : undefined}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input
                type="text"
                value={profile.full_name}
                onChange={e => { setProfile(p => ({ ...p, full_name: e.target.value })); setProfileDirty(true); }}
                placeholder="Your name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Job Title</label>
              <input
                type="text"
                value={profile.title}
                onChange={e => { setProfile(p => ({ ...p, title: e.target.value })); setProfileDirty(true); }}
                placeholder="e.g. Project Executive"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={e => { setProfile(p => ({ ...p, phone: e.target.value })); setProfileDirty(true); }}
                placeholder="(602) 555-0100"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Email · Sign-In</label>
              <input type="email" value={me?.email ?? ''} readOnly disabled title="Your sign-in email cannot be changed here — contact support to migrate accounts."
                style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
            <GoldButton size="md" onClick={saveProfile} disabled={profileSaving || !profileDirty}>
              {profileSaving ? 'Saving…' : 'Save Profile'}
            </GoldButton>
            {me?.role && <Pill tone="neutral" caps>{me.role}</Pill>}
            <SaveNotice notice={profileMsg} />
          </div>
        </SectionCard>
      </div>

      {/* Trial warning banner */}
      {isTrialing && trialDays !== null && trialDays <= 7 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 12, padding: '14px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 14, color: TEXT }}>
            <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><Clock size={16} weight="fill" color={GOLD} /></span> <strong>{trialDays} days left</strong> in your free trial — upgrade to keep access for your whole team.
          </div>
          <Link href="/app/billing" className="pmBtn" style={{ ...goldButtonStyle, whiteSpace: 'nowrap' }}>
            Upgrade Now
          </Link>
        </div>
      )}

      {/* ── Company Branding — logo, name, color + live sidebar preview ── */}
      <div id="branding" style={{ marginBottom: 24, scrollMarginTop: 72 }}>
        <SectionCard
          title="Company Branding"
          subtitle="Shown in the sidebar and on every exported report."
          icon={<Palette size={18} weight="duotone" color={GOLD} />}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>

            {/* ── Left: the form ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Company Name</label>
                <input
                  type="text"
                  value={branding.company_name}
                  onChange={e => setBranding(b => ({ ...b, company_name: e.target.value }))}
                  placeholder="e.g. Acme General Contractors"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Company Logo</label>
                {/* Drag-and-drop upload zone */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload company logo"
                  onClick={() => !uploading && fileRef.current?.click()}
                  onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); fileRef.current?.click(); } }}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault(); setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f && !uploading) uploadLogo(f);
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '22px 16px', borderRadius: 12, cursor: uploading ? 'wait' : 'pointer',
                    border: `1.5px dashed ${dragOver ? GOLD : 'rgba(255,255,255,0.2)'}`,
                    background: dragOver ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                    transition: 'border-color .15s ease, background .15s ease',
                    textAlign: 'center',
                  }}
                >
                  <UploadSimple size={22} weight="bold" color={dragOver ? GOLD : DIM} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                    {uploading ? 'Uploading…' : dragOver ? 'Drop to upload' : 'Drop your logo here, or click to browse'}
                  </div>
                  <div style={{ fontSize: 11.5, color: DIM }}>PNG, JPG, WEBP, or SVG · max 5 MB · transparent PNG looks best</div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.currentTarget.value = ''; }}
                />
                {/* Advanced: paste a hosted URL instead */}
                <div style={{ marginTop: 10 }}>
                  <input
                    type="url"
                    value={branding.logo_url}
                    onChange={e => setBranding(b => ({ ...b, logo_url: e.target.value }))}
                    placeholder="…or paste a public logo URL (https://yoursite.com/logo.png)"
                    style={{ ...inputStyle, fontSize: 12.5, padding: '8px 12px' }}
                  />
                </div>

                {/* Honest shape feedback. A tall logo is not "wrong", but it WILL
                    render small in a sidebar that caps height — say so here
                    rather than letting it look like a bug. */}
                {logoDims && (() => {
                  const aspect = logoDims.w / logoDims.h;
                  const portrait = aspect < 0.8;
                  const rendered = Math.round(96 * aspect);
                  return (
                    <div style={{
                      marginTop: 10, padding: '10px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5,
                      border: `1px solid ${portrait ? 'rgba(245,158,11,0.35)' : BORDER}`,
                      background: portrait ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.02)',
                      color: portrait ? TEXT : DIM,
                    }}>
                      <strong style={{ color: portrait ? GOLD : TEXT }}>
                        {logoDims.w} x {logoDims.h}px
                      </strong>
                      {portrait ? (
                        <> — this logo is taller than it is wide, so the sidebar renders it about{' '}
                          <strong>{rendered}px wide</strong>. A horizontal (landscape) version of your
                          mark will read far better here and on report letterheads.</>
                      ) : (
                        <> — good shape for the sidebar and report letterheads.</>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Brand color */}
              <div>
                <label style={labelStyle}>Brand Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <input
                    type="color"
                    value={previewColor === GOLD && !branding.primary_color ? '#F59E0B' : previewColor}
                    onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))}
                    style={{ width: 48, height: 40, border: `1px solid ${BORDER}`, borderRadius: 8, background: 'none', cursor: 'pointer', padding: 2 }}
                    aria-label="Brand color"
                  />
                  <input
                    type="text"
                    value={branding.primary_color}
                    onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))}
                    placeholder="#F59E0B"
                    style={{ ...inputStyle, width: 130 }}
                  />
                  {branding.primary_color
                    ? <button onClick={() => setBranding(b => ({ ...b, primary_color: '' }))} style={{ background: 'none', border: 'none', color: DIM, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Reset to Saguaro gold</button>
                    : <span style={{ fontSize: 12, color: DIM }}>Defaults to Saguaro gold</span>}
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 5 }}>
                  Applies across your dashboard, portals, and document letterheads on the white-label plan.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2, flexWrap: 'wrap' }}>
                <GoldButton size="md" onClick={saveBranding} disabled={brandingSaving}>
                  {brandingSaving ? 'Saving…' : 'Save Branding'}
                </GoldButton>
                <SaveNotice notice={brandingMsg} />
              </div>
            </div>

            {/* ── Right: live sidebar preview — exactly what the lockup renders ── */}
            <div>
              <label style={labelStyle}>Live Sidebar Preview</label>
              <div style={{
                borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden',
                background: 'linear-gradient(180deg, #141416, #0c0d10)',
              }}>
                <div style={{ padding: '12px 12px 11px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{
                    padding: '12px 12px 11px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    {branding.logo_url ? (
                      <>
                        <img
                          src={branding.logo_url}
                          alt="Logo preview"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          onLoad={e => {
                            const im = e.target as HTMLImageElement;
                            if (im.naturalWidth && im.naturalHeight) setLogoDims({ w: im.naturalWidth, h: im.naturalHeight });
                          }}
                          /* 96 mirrors AppSidebar exactly — a preview that lies
                             about the cap is worse than no preview. */
                          style={{ display: 'block', maxWidth: '100%', maxHeight: 96, width: 'auto', height: 'auto', objectFit: 'contain', objectPosition: 'left center', marginBottom: 9 }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {branding.company_name && (
                            <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: DIM }}>
                              {branding.company_name}
                            </span>
                          )}
                          <Pill tone={isTrialing ? 'amber' : 'gold'} caps>{isTrialing ? 'Trial' : (sub?.plan_name || 'Plan')}</Pill>
                        </div>
                      </>
                    ) : branding.company_name ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <span aria-hidden style={{
                          width: 42, height: 42, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 11,
                          background: `linear-gradient(150deg, ${previewColor}, color-mix(in srgb, ${previewColor} 72%, #000000))`,
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                          color: '#241500', fontSize: 16, fontWeight: 900,
                        }}>
                          {companyInitials(branding.company_name)}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                            {branding.company_name}
                          </span>
                          <span style={{ display: 'flex' }}>
                            <Pill tone={isTrialing ? 'amber' : 'gold'} caps>{isTrialing ? 'Trial' : (sub?.plan_name || 'Plan')}</Pill>
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: DIM, padding: '4px 0' }}>
                        Set a company name or upload a logo to see your sidebar lockup.
                      </div>
                    )}
                  </div>
                </div>
                {/* Faux nav rows so the preview reads as the actual sidebar */}
                <div aria-hidden style={{ padding: '10px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[92, 70, 110].map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }} />
                      <span style={{ width: w, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 7 }}>
                Updates in the real sidebar the moment you upload or save — no reload needed.
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Platform Owner section */}
      {platformAdmin && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Platform Owner" icon={<ShieldCheck size={18} weight="duotone" color={GOLD} />} flush>
            <a href="/app/settings/platform-integrations" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px', textDecoration: 'none', background: 'rgba(245,158,11,0.03)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.08)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.03)')}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ShieldCheck size={20} color={GOLD} /></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: GOLD, marginBottom: 2 }}>Platform Integrations</div><div style={{ fontSize: 12, color: DIM }}>Configure the cloud-storage OAuth apps once — enables one-click connect for every tenant</div></div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
            </a>
          </SectionCard>
        </div>
      )}

      {SETTINGS_SECTIONS.map(section => (
        <div key={section.title} style={{ marginBottom: 24 }}>
          <SectionCard title={section.title} icon={<section.sectionIcon size={18} weight="duotone" color={GOLD} />} flush>
            {section.items.map((item, i) => {
              /* Internal routes MUST go through next/link.
               *
               * Every row here was a plain <a href>, which means a full page
               * reload and NO prefetch — so each click woke a cold serverless
               * function. Measured on production: /app/notification-settings
               * took 15,526ms cold and 86-108ms warm. That 15-second first hit
               * is the reported "not opening / super slow"; the page was fine
               * once something had warmed it.
               *
               * <Link> gives client-side navigation AND prefetches the route
               * when the row scrolls into view, so the lambda is already warm
               * by the time anyone clicks.
               *
               * mailto: and other non-route hrefs stay plain anchors — Link
               * would try to route them. */
              const external = !item.href.startsWith('/');
              const Row: any = external ? 'a' : Link;
              const rowProps = external
                ? { href: item.href }
                : { href: item.href, prefetch: true };
              return (
              <Row key={item.label} {...rowProps} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '18px 24px',
                borderBottom: i < section.items.length - 1 ? `1px solid rgba(255,255,255,0.06)` : 'none',
                textDecoration: 'none',
                background: item.highlight ? 'rgba(245,158,11,0.05)' : 'transparent',
                transition: 'background .15s',
              }}
                onMouseEnter={(e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={(e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = item.highlight ? 'rgba(245,158,11,0.05)' : 'transparent')}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: item.highlight ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${item.highlight ? 'rgba(245,158,11,0.2)' : BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  <item.icon size={20} weight="regular" color={item.highlight ? GOLD : TEXT} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: item.highlight ? GOLD : TEXT, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: DIM }}>{item.desc}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Row>
              );
            })}
          </SectionCard>
        </div>
      ))}

      {/* Install App CTA */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 40, display: 'flex' }}><DeviceMobile size={40} weight="duotone" color={GOLD} /></div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Get the Saguaro Control Systems iOS app</div>
              <div style={{ fontSize: 13, color: DIM }}>Native iOS app on Apple TestFlight — free for your entire team. Android coming soon.</div>
            </div>
            <Link href="/get-the-app" className="pmBtn" style={{ ...goldButtonStyle, whiteSpace: 'nowrap' }}>
              Get Install Guide
            </Link>
          </div>
        </SectionCard>
      </div>

      {/* Logout */}
      <div style={{ textAlign: 'center', paddingBottom: 8 }}>
        <DangerButton
          size="md"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            try {
              for (const k of Object.keys(localStorage)) {
                if (k.startsWith('sb-') || k.toLowerCase().includes('supabase')) localStorage.removeItem(k);
              }
              sessionStorage.clear();
            } catch { /* storage unavailable — ignore */ }
            window.location.replace('/login');
          }}
        >
          Sign Out
        </DangerButton>
        {/* The privacy policy names this page, and the iOS app needs the same
            control for App Store Guideline 5.1.1(v). Plain text under Sign Out
            rather than a second red button — it should be findable, not easy to
            hit by accident next to the one people press every day. */}
        <div style={{ marginTop: 14 }}>
          <Link
            href="/app/settings/delete-account"
            style={{ fontSize: 13, color: DIM, textDecoration: 'underline' }}
          >
            Delete account
          </Link>
        </div>
      </div>

    </PremiumSurface>
  );
}
