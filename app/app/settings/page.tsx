'use client';
/**
 * Settings — workspace control panel, Pass 4 on the kit.
 * Every control on this page does something real: profile fields save to
 * profiles, branding saves to tenants.settings (with instant sidebar refresh
 * via the `saguaro:branding-updated` event), and every hub row links to a
 * live route. No dead clicks.
 *
 * Reads / writes (unchanged):
 *   GET /api/billing/subscription · GET/PUT /api/auth/me · GET /api/platform/me
 *   GET/PUT /api/branding · POST /api/branding/logo · POST /api/auth/logout
 *   GET/PATCH /api/settings/time-zone (components/settings/TimeZoneCard)
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { CreditCard, DeviceMobile, Bell, Users, Clipboard, FileText, Gear, Rocket, GraduationCap, Books, ChatCircle, Clock, ArrowRight, CloudArrowUp, ShieldCheck, Plugs, Palette, Lifebuoy, UploadSimple, CheckCircle, WarningCircle, CaretRight, SignOut } from '@phosphor-icons/react';
import { PageShell, Card, StatRow, Badge, Button, Field, Input, FormGrid, type StatItem } from '@/components/ui/kit';
import TimeZoneCard from '@/components/settings/TimeZoneCard';
import { useInApp } from '@/lib/use-in-app';

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
      { icon: CreditCard, label: 'Subscription & Plan', desc: 'Your plan, invoices and add-ons', href: '/app/billing', highlight: true },
      { icon: CreditCard, label: 'Get Paid Online', desc: 'Owners pay your invoices by card or bank — connect your Stripe account', href: '/app/settings/payments' },
      { icon: Clock, label: 'Calendar Sync', desc: 'Schedule tasks, inspections and meetings in Google, Outlook or iPhone Calendar', href: '/app/settings/calendar' },
      { icon: UploadSimple, label: 'Import From Another App', desc: 'Bring jobs, customers and leads over from Buildertrend, JobTread, CoConstruct or a spreadsheet', href: '/app/settings/import' },
      { icon: DeviceMobile, label: 'Get the iOS App', desc: 'Download Saguaro Control Systems for iPhone & iPad on Apple TestFlight. On Android, open it in Chrome.', href: '/get-the-app' },
      { icon: Bell, label: 'Notifications', desc: 'Configure email and push notification preferences', href: '/app/notification-settings' },
    ],
  },
  {
    title: 'Team & Permissions',
    sectionIcon: Users,
    items: [
      { icon: Users, label: 'People & Access', desc: 'Crew directory, roles, and what each team role can reach', href: '/app/people?tab=access' },
      { icon: Palette, label: 'Branding & White Label', desc: 'Your logo and colors across every screen, report and email', href: '/app/settings/branding' },
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
      { icon: ChatCircle, label: 'Contact Support', desc: 'Send us a message — we respond within 48 hours', href: '/contact?reason=Support%20request' },
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
    <span className="stNotice" data-ok={notice.ok ? 'true' : 'false'} role="status">
      {notice.ok ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />}
      {notice.text}
    </span>
  );
}

const GOLD = 'var(--brand-primary)';

const CSS = `
.stStack { display: flex; flex-direction: column; gap: 16px; }
.stActions { display: flex; align-items: center; gap: 14px; margin-top: 16px; flex-wrap: wrap; }
.stNotice { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 600; }
.stNotice[data-ok="true"] { color: var(--status-ongoing); }
.stNotice[data-ok="false"] { color: var(--status-overdue); }
.stPlan { text-align: right; font-size: var(--fs-xs); color: var(--text-tertiary); line-height: 1.6; }
.stPlan b { color: var(--text-primary); }
.stWarn { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid rgba(251,191,36,.35); background: rgba(251,191,36,.08); font-size: var(--fs-sm); color: var(--text-primary); }
.stWarn svg { color: var(--status-under-contract); vertical-align: -3px; }
.stBrand { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px; }
.stDrop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 22px 16px; border-radius: var(--radius-sm); cursor: pointer; border: 1.5px dashed var(--border-strong); background: var(--bg-surface-2); text-align: center; transition: border-color .15s ease, background .15s ease; }
.stDrop[data-over="true"] { border-color: var(--brand-primary); background: var(--brand-primary-08); }
.stDrop:focus-visible { outline: 2px solid var(--focus-ring); }
.stDropTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); }
.stDropSub { font-size: var(--fs-xs); color: var(--text-tertiary); }
.stShape { margin-top: 10px; padding: 10px 12px; border-radius: var(--radius-sm); font-size: var(--fs-xs); line-height: 1.5; border: 1px solid var(--border-subtle); background: var(--bg-surface-2); color: var(--text-tertiary); }
.stShape[data-portrait="true"] { border-color: var(--brand-primary-35); background: var(--brand-primary-08); color: var(--text-primary); }
.stShape b { color: var(--text-primary); }
.stColor { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.stColor input[type="color"] { width: 48px; height: 40px; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: none; cursor: pointer; padding: 2px; }
.stLink { all: unset; color: var(--text-tertiary); font-size: var(--fs-xs); cursor: pointer; text-decoration: underline; }
.stLink:focus-visible { outline: 2px solid var(--focus-ring); }
.stHint { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 5px; line-height: 1.5; }
.stPreview { border-radius: var(--radius-md); border: 1px solid var(--border-default); overflow: hidden; background: var(--bg-solid); }
.stPreviewHead { padding: 12px; border-bottom: 1px solid var(--border-subtle); }
.stLockup { padding: 12px; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); }
.stLockupRow { display: flex; align-items: center; gap: 11px; min-width: 0; }
.stLockupName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-md); font-weight: 800; color: var(--text-primary); }
.stLockupSub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); flex: 1 1 auto; min-width: 0; }
.stFaux { padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.stFaux span { display: inline-block; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.07); }
.stRow { display: flex; align-items: center; gap: 16px; padding: 14px 18px; text-decoration: none; color: inherit; border-bottom: 1px solid var(--border-subtle); min-height: 56px; }
.stRow:last-child { border-bottom: 0; }
.stRow:hover { background: rgba(255,255,255,0.03); }
.stRow:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
.stRow[data-hi="true"] { background: var(--brand-primary-08); }
.stRowIcon { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; background: var(--bg-surface-2); border: 1px solid var(--glass-border); color: var(--text-primary); }
.stRow[data-hi="true"] .stRowIcon { color: var(--text-primary); border-color: var(--brand-primary-35); }
.stRowLabel { font-size: var(--fs-md); font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.stRow[data-hi="true"] .stRowLabel { color: var(--text-primary); }
.stRowDesc { font-size: var(--fs-xs); color: var(--text-tertiary); }
.stRow > svg:last-child { color: var(--text-tertiary); flex-shrink: 0; }
.stCta { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.stCta > svg { color: var(--text-secondary); flex-shrink: 0; }
.stFoot { text-align: center; padding: 8px 0 16px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.stFoot a { font-size: var(--fs-sm); color: var(--text-tertiary); text-decoration: underline; }
@media (max-width: 640px) {
  .stWs .k-btn, .stWs .k-stat, .stWs .k-input { min-height: 44px; }
}
`;

export default function SettingsPage() {
  // No plan purchase prompts inside the iPhone app (lib/use-in-app.ts).
  const inApp = useInApp();
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
  const previewColor = /^#[0-9a-fA-F]{6}$/.test(branding.primary_color) ? branding.primary_color : GOLD;
  const roleLabel = me?.role ? String(me.role).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

  const stats: StatItem[] = [
    { label: 'Plan', value: sub?.plan_name || 'Free Trial', tone: isPastDue ? 'bad' : sub?.status === 'active' ? 'good' : 'default', sub: sub?.status === 'active' ? 'Subscription active' : isTrialing ? 'Trial in progress' : isPastDue ? 'Payment failed — fix in Billing' : 'Manage in Billing', href: '/app/billing' },
    ...(isTrialing && trialDays !== null
      ? [{ label: 'Trial', value: `${trialDays}d left`, tone: trialDays <= 5 ? 'warn' : 'default', sub: 'Upgrade any time in Billing', href: '/app/billing' } as StatItem]
      : sub?.current_period_end
        ? [{ label: 'Renews', value: new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), sub: 'Next billing date', href: '/app/billing' } as StatItem]
        : []),
    { label: 'Branding', value: (branding.logo_url || branding.company_name) ? 'Custom' : 'Default', tone: (branding.logo_url || branding.company_name) ? 'good' : 'default', sub: branding.company_name || 'Set a name + logo below', href: '#branding' },
    { label: 'Brand Color', value: branding.primary_color || 'Saguaro Gold', sub: branding.primary_color ? 'White-label accent' : 'Default accent', href: '/app/settings/branding' },
    { label: 'Signed In As', value: me?.name || '—', sub: me?.email || undefined },
  ];

  return (
    <div className="stWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Settings' }]}
        title="Settings"
        subtitle="Your account, team, billing, and app preferences — every control here saves for real."
        width="form"
      >
        {(me || sub) && <StatRow items={stats} />}

        <div className="stStack">
          {/* ── Your Profile — editable, saves to profiles ─────────────── */}
          <Card
            title="Your Profile"
            subtitle="Your name and contact info — shown on daily logs, approvals, and team lists."
            actions={sub ? (
              <div className="stPlan">
                <div>Plan: <b>{sub.plan_name ?? 'Free Trial'}</b></div>
                {isTrialing && trialDays !== null && <div style={{ color: trialDays <= 5 ? 'var(--status-under-contract)' : undefined }}>{trialDays} day{trialDays !== 1 ? 's' : ''} left in trial</div>}
                {isPastDue && <div style={{ color: 'var(--status-overdue)', fontWeight: 600 }}>Payment failed</div>}
                {sub.status === 'active' && sub.current_period_end && <div style={{ color: 'var(--status-ongoing)' }}>Active · renews {new Date(sub.current_period_end).toLocaleDateString()}</div>}
                <Button variant="ghost" size="sm" href="/app/billing" icon={<ArrowRight size={13} weight="bold" />}>Manage Billing</Button>
              </div>
            ) : undefined}
          >
            <FormGrid cols={2}>
              <Field label="Full Name" required>
                <Input type="text" value={profile.full_name} onChange={e => { setProfile(p => ({ ...p, full_name: e.target.value })); setProfileDirty(true); }} placeholder="Your name" />
              </Field>
              <Field label="Job Title">
                <Input type="text" value={profile.title} onChange={e => { setProfile(p => ({ ...p, title: e.target.value })); setProfileDirty(true); }} placeholder="e.g. Project Executive" />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={profile.phone} onChange={e => { setProfile(p => ({ ...p, phone: e.target.value })); setProfileDirty(true); }} placeholder="(602) 555-0100" />
              </Field>
              <Field label="Email · Sign-In" hint="Your sign-in email cannot be changed here — contact support to migrate accounts.">
                <Input type="email" value={me?.email ?? ''} readOnly disabled />
              </Field>
            </FormGrid>
            <div className="stActions">
              <Button variant="primary" onClick={saveProfile} disabled={profileSaving || !profileDirty}>{profileSaving ? 'Saving…' : 'Save Profile'}</Button>
              {roleLabel && <Badge tone="neutral">{roleLabel}</Badge>}
              {profileDirty && !profileSaving && <span className="stHint" style={{ marginTop: 0 }}>Unsaved changes</span>}
              <SaveNotice notice={profileMsg} />
            </div>
          </Card>

          {/* Trial warning banner */}
          {isTrialing && trialDays !== null && trialDays <= 7 && (
            <div className="stWarn" role="status">
              <div><Clock size={16} weight="fill" /> <b>{trialDays} days left</b> in your free trial — {inApp ? 'your account owner can choose a plan to keep access for your whole team.' : 'upgrade to keep access for your whole team.'}</div>
              {!inApp && <Button variant="primary" href="/app/billing">Upgrade Now</Button>}
            </div>
          )}

          {/* ── Company Branding — logo, name, color + live sidebar preview ── */}
          <div id="branding" style={{ scrollMarginTop: 72 }}>
            <Card title="Company Branding" subtitle="Shown in the sidebar and on every exported report." actions={<Button variant="ghost" size="sm" href="/app/settings/branding" icon={<Palette size={14} />}>Full Branding Studio</Button>}>
              <div className="stBrand">
                {/* ── Left: the form ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Field label="Company Name">
                    <Input type="text" value={branding.company_name} onChange={e => setBranding(b => ({ ...b, company_name: e.target.value }))} placeholder="e.g. Acme General Contractors" />
                  </Field>

                  <Field label="Company Logo" hint="PNG, JPG, WEBP, or SVG · max 5 MB · transparent PNG looks best">
                    {/* Drag-and-drop upload zone */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Upload company logo"
                      className="stDrop"
                      data-over={dragOver ? 'true' : undefined}
                      onClick={() => !uploading && fileRef.current?.click()}
                      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); fileRef.current?.click(); } }}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => {
                        e.preventDefault(); setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f && !uploading) uploadLogo(f);
                      }}
                      style={{ cursor: uploading ? 'wait' : 'pointer' }}
                    >
                      <UploadSimple size={22} weight="bold" color={dragOver ? 'var(--brand-primary)' : 'var(--text-tertiary)'} />
                      <div className="stDropTitle">{uploading ? 'Uploading…' : dragOver ? 'Drop to upload' : 'Drop your logo here, or click to browse'}</div>
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
                      <Input type="url" value={branding.logo_url} onChange={e => setBranding(b => ({ ...b, logo_url: e.target.value }))} placeholder="…or paste a public logo URL (https://yoursite.com/logo.png)" />
                    </div>

                    {/* Honest shape feedback. A tall logo is not "wrong", but it WILL
                        render small in a sidebar that caps height — say so here
                        rather than letting it look like a bug. */}
                    {logoDims && (() => {
                      const aspect = logoDims.w / logoDims.h;
                      const portrait = aspect < 0.8;
                      const rendered = Math.round(96 * aspect);
                      return (
                        <div className="stShape" data-portrait={portrait ? 'true' : 'false'}>
                          <b>{logoDims.w} x {logoDims.h}px</b>
                          {portrait ? (
                            <> — this logo is taller than it is wide, so the sidebar renders it about <b>{rendered}px wide</b>. A horizontal (landscape) version of your mark will read far better here and on report letterheads.</>
                          ) : (
                            <> — good shape for the sidebar and report letterheads.</>
                          )}
                        </div>
                      );
                    })()}
                  </Field>

                  {/* Brand color */}
                  <Field label="Brand Color" hint="Applies across your dashboard, portals, and document letterheads on the white-label plan.">
                    <div className="stColor">
                      <input
                        type="color"
                        value={previewColor === GOLD && !branding.primary_color ? 'var(--warning)' : previewColor}
                        onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))}
                        aria-label="Brand color"
                      />
                      <Input type="text" value={branding.primary_color} onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))} placeholder="var(--warning)" style={{ width: 130 }} aria-label="Brand color hex" />
                      {branding.primary_color
                        ? <button type="button" className="stLink" onClick={() => setBranding(b => ({ ...b, primary_color: '' }))}>Reset to Saguaro Default</button>
                        : <span className="stHint" style={{ marginTop: 0 }}>Defaults to the Saguaro brand color</span>}
                    </div>
                  </Field>

                  <div className="stActions" style={{ marginTop: 2 }}>
                    <Button variant="primary" onClick={saveBranding} disabled={brandingSaving}>{brandingSaving ? 'Saving…' : 'Save Branding'}</Button>
                    <SaveNotice notice={brandingMsg} />
                  </div>
                </div>

                {/* ── Right: live sidebar preview — exactly what the lockup renders ── */}
                <div>
                  <Field label="Live Sidebar Preview" hint="Updates in the real sidebar the moment you upload or save — no reload needed.">
                    <div className="stPreview">
                      <div className="stPreviewHead">
                        <div className="stLockup">
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
                              <div className="stLockupRow" style={{ gap: 8 }}>
                                {branding.company_name && <span className="stLockupSub">{branding.company_name}</span>}
                                <Badge tone={isTrialing ? 'under_contract' : 'gold'}>{isTrialing ? 'Trial' : (sub?.plan_name || 'Plan')}</Badge>
                              </div>
                            </>
                          ) : branding.company_name ? (
                            <div className="stLockupRow">
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
                                <span className="stLockupName">{branding.company_name}</span>
                                <span style={{ display: 'flex' }}><Badge tone={isTrialing ? 'under_contract' : 'gold'}>{isTrialing ? 'Trial' : (sub?.plan_name || 'Plan')}</Badge></span>
                              </span>
                            </div>
                          ) : (
                            <div className="stHint" style={{ marginTop: 0, padding: '4px 0' }}>Set a company name or upload a logo to see your sidebar lockup.</div>
                          )}
                        </div>
                      </div>
                      {/* Faux nav rows so the preview reads as the actual sidebar */}
                      <div aria-hidden className="stFaux">
                        {[92, 70, 110].map((w, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ width: 14, height: 14, borderRadius: 4 }} />
                            <span style={{ width: w }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </Field>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Company time zone — the clock "today" and every deadline run on ── */}
          <div id="time-zone" style={{ scrollMarginTop: 72 }}>
            <TimeZoneCard />
          </div>

          {/* Platform Owner section */}
          {platformAdmin && (
            <Card title="Platform Owner" flush>
              <Link href="/app/settings/platform-integrations" className="stRow" data-hi="true">
                <div className="stRowIcon"><ShieldCheck size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stRowLabel">Platform Integrations</div>
                  <div className="stRowDesc">Configure the cloud-storage OAuth apps once — enables one-click connect for every tenant</div>
                </div>
                <CaretRight size={16} weight="bold" />
              </Link>
            </Card>
          )}

          {SETTINGS_SECTIONS.map(section => (
            <Card key={section.title} title={section.title} flush>
              {section.items.map((item) => {
                /* Internal routes MUST go through next/link — client-side navigation
                 * AND prefetch when the row scrolls into view, so the lambda is
                 * already warm by the time anyone clicks (a cold hit measured 15 s).
                 * mailto: and other non-route hrefs stay plain anchors. */
                const external = !item.href.startsWith('/');
                const content = (
                  <>
                    <div className="stRowIcon"><item.icon size={20} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="stRowLabel">{item.label}</div>
                      <div className="stRowDesc">{item.desc}</div>
                    </div>
                    <CaretRight size={16} weight="bold" />
                  </>
                );
                return external
                  ? <a key={item.label} href={item.href} className="stRow" data-hi={item.highlight ? 'true' : undefined}>{content}</a>
                  : <Link key={item.label} href={item.href} prefetch className="stRow" data-hi={item.highlight ? 'true' : undefined}>{content}</Link>;
              })}
            </Card>
          ))}

          {/* Install App CTA */}
          <Card>
            <div className="stCta">
              <DeviceMobile size={40} weight="duotone" />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="stRowLabel" style={{ fontSize: 'var(--fs-lg)' }}>Get the Saguaro Control Systems iOS App</div>
                <div className="stRowDesc">Native iOS app on Apple TestFlight — free for your entire team. On Android it runs in Chrome.</div>
              </div>
              <Button href="/get-the-app">Get Install Guide</Button>
            </div>
          </Card>

          {/* Logout */}
          <div className="stFoot">
            <Button
              variant="danger"
              icon={<SignOut size={15} weight="bold" />}
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
            </Button>
            {/* The privacy policy names this page, and the iOS app needs the same
                control for App Store Guideline 5.1.1(v). Plain text under Sign Out
                rather than a second red button — it should be findable, not easy to
                hit by accident next to the one people press every day. */}
            <Link href="/app/settings/delete-account" className="k-tap">Delete account</Link>
          </div>
        </div>
      </PageShell>
    </div>
  );
}
