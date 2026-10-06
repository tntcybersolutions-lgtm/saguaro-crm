'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { useVerifications, createVerification, decideVerification } from '@/lib/hooks/useFranchise';
import { ROLLOUT_STAGES, STAGE_META } from '@/lib/franchise-template';
import { C, font, fmtDate, useFranchiseGate, GateLoading, Chip, SearchInput } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, GoldButton, GhostButton, Pill } from '@/components/ui/premium';
import { VideoCamera, MapPin, Camera, CheckCircle, XCircle, AirplaneTilt, Globe, House, FilmSlate, Phone, LinkSimple, Plus } from '@phosphor-icons/react';

type VStatus = 'pending' | 'verified' | 'rejected';
const STATUS_COLOR: Record<VStatus, string> = { pending: C.gold, verified: C.green, rejected: C.red };
const STATUS_LABEL: Record<VStatus, string> = { pending: 'Pending', verified: 'Verified', rejected: 'Rejected' };
const STATUS_TONE: Record<VStatus, 'gold' | 'green' | 'red'> = { pending: 'gold', verified: 'green', rejected: 'red' };

// Verification methods — remote evidence types plus a physical on-site visit.
const METHOD_META: Record<string, { label: string; linkLabel: string }> = {
  photo:      { label: 'Photo',            linkLabel: 'Evidence Photo URL' },
  drone:      { label: 'Drone',            linkLabel: 'Drone Footage URL' },
  '360':      { label: '360° Walkthrough', linkLabel: '360° Walkthrough URL' },
  matterport: { label: 'Matterport',       linkLabel: 'Matterport Scan URL' },
  facetime:   { label: 'Live Video',       linkLabel: 'Video Call / FaceTime Link' },
  video:      { label: 'Video',            linkLabel: 'Video URL' },
  site_visit: { label: 'On-Site Visit',    linkLabel: 'Scheduling / Calendar Link' },
};
const METHOD_ICON: Record<string, React.ComponentType<any>> = {
  photo: Camera, drone: AirplaneTilt, '360': Globe, matterport: House, facetime: VideoCamera, video: FilmSlate, site_visit: MapPin,
};
const METHOD_OPTIONS = Object.keys(METHOD_META);

export default function VerifyHubPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { verifications, loading } = useVerifications();
  const { projects } = useProjects();
  const [filter, setFilter] = useState<'all' | VStatus>('pending');
  const [q, setQ] = useState('');
  const [requesting, setRequesting] = useState<false | { method: string }>(false);
  const [walkthrough, setWalkthrough] = useState(false);
  const [override, setOverride] = useState<Record<string, VStatus>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const statusOf = (v: any): VStatus => (override[v.id] as VStatus) || (['pending', 'verified', 'rejected'].includes(v.status) ? v.status : 'pending');

  const summary = useMemo(() => {
    const s = { pending: 0, verified: 0, rejected: 0, sites: new Set<string>() };
    (verifications as any[]).forEach((v) => { s[statusOf(v)]++; if (v.project_id) s.sites.add(v.project_id); });
    return { ...s, sites: s.sites.size, total: (verifications as any[]).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifications, override]);

  const filtered = (verifications as any[]).filter((v) =>
    (filter === 'all' || statusOf(v) === filter) &&
    (!q || `${v.title || ''} ${v.project_name || ''} ${v.requested_by || ''}`.toLowerCase().includes(q.toLowerCase())));

  async function decide(v: any, status: VStatus) {
    if (busy[v.id]) return;
    setOverride((o) => ({ ...o, [v.id]: status }));
    setBusy((b) => ({ ...b, [v.id]: true }));
    try { await decideVerification(v.id, status); }
    catch { setOverride((o) => { const n = { ...o }; delete n[v.id]; return n; }); }
    finally { setBusy((b) => ({ ...b, [v.id]: false })); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={2200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
        <ModuleHero
          eyebrow="Command Center"
          eyebrowIcon={<Camera size={13} weight="fill" />}
          title="Remote Verification"
          accent="Hub"
          subtitle="Sign off on site milestones from anywhere."
          actions={
            <>
              <GhostButton onClick={() => setWalkthrough(true)} icon={<VideoCamera size={15} weight="bold" />}>Start Live Walkthrough</GhostButton>
              <GhostButton onClick={() => setRequesting({ method: 'site_visit' })} icon={<MapPin size={15} weight="bold" />}>Request On-Site Visit</GhostButton>
              <GoldButton onClick={() => setRequesting({ method: 'photo' })} icon={<Plus size={15} weight="bold" />}>Request Verification</GoldButton>
            </>
          }
        />

        {!loading && summary.total > 0 && (
          <StatStrip items={[
            {href: '/app/command-center/verify',  label: 'Pending', value: String(summary.pending), accent: summary.pending ? C.gold : C.green, sub: summary.pending ? 'Awaiting your sign-off' : 'All reviewed' },
            {href: '/app/command-center/verify',  label: 'Verified', value: String(summary.verified), accent: C.green },
            {href: '/app/command-center/verify',  label: 'Rejected', value: String(summary.rejected), accent: summary.rejected ? C.red : undefined },
            {href: '/app/command-center/verify',  label: 'Sites', value: String(summary.sites) },
          ]} />
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {(['pending', 'verified', 'rejected', 'all'] as const).map((f) => (
            <Chip key={f} active={filter === f} color={f === 'all' ? C.text : STATUS_COLOR[f as VStatus]}
              onClick={() => setFilter(f)} count={f === 'all' ? summary.total : (summary as any)[f]}>
              {f === 'all' ? 'All' : STATUS_LABEL[f as VStatus]}
            </Chip>
          ))}
          <SearchInput value={q} onChange={setQ} placeholder="Search item, site…" />
        </div>

        {loading ? (
          <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          (verifications as any[]).length === 0 ? (
            <SectionCard>
              <PremiumEmpty
                icon={<Camera size={32} weight="duotone" color={C.gold} />}
                title="No verifications yet"
                description="Request a remote sign-off on a milestone — the field uploads evidence, you review and verify from anywhere before the site advances a stage."
                action={<GoldButton onClick={() => setRequesting({ method: 'photo' })} icon={<Plus size={15} weight="bold" />}>Request Your First</GoldButton>}
              />
            </SectionCard>
          ) : (
            <SectionCard flat>
              <PremiumEmpty compact icon={<Camera size={26} weight="duotone" color={C.gold} />} title="Nothing matches this filter" description="Clear the search or switch status filters to see the rest of the queue." />
            </SectionCard>
          )
        ) : (
          <SectionCard
            icon={<Camera size={16} weight="duotone" color={C.gold} />}
            title="Verification Requests"
            subtitle={`${filtered.length} shown · ${summary.pending} pending across ${summary.sites} site${summary.sites === 1 ? '' : 's'}`}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {filtered.map((v) => {
                const st = statusOf(v);
                const stage = v.stage ? STAGE_META[v.stage] : null;
                return (
                  <div key={v.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.07)`, borderLeft: `4px solid ${STATUS_COLOR[st]}`, borderRadius: 14, padding: '15px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{v.title}</div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                          {v.project_id ? <Link href={`/app/projects/${v.project_id}`} style={{ color: C.blue, textDecoration: 'none' }}>{v.project_name || 'Site'}</Link> : 'Site'}
                          {v.project_city ? ` · ${v.project_city}, ${v.project_state}` : ''}
                        </div>
                      </div>
                      <Pill tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Pill>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                      {v.method && METHOD_META[v.method] && (() => { const MI = METHOD_ICON[v.method]; return <span style={{ fontSize: 11, fontWeight: 700, color: C.text, background: 'var(--bg-surface-2)', padding: '3px 9px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{MI && <MI size={12} weight="regular" color={C.text} />}{METHOD_META[v.method].label}</span>; })()}
                      {stage && <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, background: `${stage.color}18`, padding: '3px 9px', borderRadius: 6 }}>Gate: {stage.label}</span>}
                      {v.requested_by && <span style={{ fontSize: 11, color: C.dim, padding: '3px 0' }}>Requested by {v.requested_by}</span>}
                    </div>

                    {v.evidence_note && <div style={{ fontSize: 13, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>{v.evidence_note}</div>}
                    {v.media_url && (() => { const MI = METHOD_ICON[v.method] || LinkSimple; return <a href={v.media_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: C.blue, marginTop: 8, textDecoration: 'none' }}><MI size={13} weight="regular" color={C.blue} /> View {METHOD_META[v.method]?.label || 'Evidence'}</a>; })()}
                    {v.photo_url && <a href={v.photo_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: C.blue, marginTop: 8, marginLeft: v.media_url ? 12 : 0, textDecoration: 'none' }}><span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><Camera size={14} weight="regular" color={C.blue} /></span> View Evidence Photo</a>}

                    {st === 'pending' ? (
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button onClick={() => decide(v, 'verified')} disabled={busy[v.id]} className="pmBtn" style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', background: C.green, color: 'var(--text-primary)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}><span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><CheckCircle size={15} weight="regular" color="var(--text-primary)" /></span> Verify</button>
                        <button onClick={() => decide(v, 'rejected')} disabled={busy[v.id]} className="pmBtn" style={{ flex: 1, padding: '8px', borderRadius: 9, border: `1px solid ${C.red}`, background: 'var(--bg-surface)', color: C.red, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}><span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><XCircle size={15} weight="regular" color={C.red} /></span> Reject</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12, color: C.dim }}>
                        <span>{st === 'verified' ? <><span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><CheckCircle size={14} weight="fill" color={C.dim} /></span> Verified</> : <><span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><XCircle size={14} weight="fill" color={C.dim} /></span> Rejected</>}{v.verified_by ? ` by ${v.verified_by}` : ''}{v.verified_at ? ` · ${fmtDate(v.verified_at)}` : ''}</span>
                        <button onClick={() => decide(v, 'pending')} disabled={busy[v.id]} style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: 'none', border: 'none', cursor: 'pointer' }}>Reopen</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {requesting && <RequestModal projects={projects} initialMethod={requesting.method} onClose={() => setRequesting(false)} />}
        {walkthrough && <LiveWalkthroughModal projects={projects} onClose={() => setWalkthrough(false)} />}
      </div>
    </PremiumSurface>
  );
}

// One-tap live-video walkthrough: deep-links into Google Meet / Zoom / FaceTime
// (no external account or spend on our side — it launches the native call), then
// logs the session as a verification record so the walkthrough is on the books.
function LiveWalkthroughModal({ projects, onClose }: { projects: any[]; onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ platform: 'meet' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', background: 'var(--bg-surface-2)', color: C.text, width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 4, display: 'block' };

  const PLATFORMS: Record<string, { label: string; instant: boolean; url?: string }> = {
    meet:     { label: 'Google Meet (New Instant Meeting)', instant: true, url: 'https://meet.google.com/new' },
    zoom:     { label: 'Zoom (Start Instant Meeting)',      instant: true, url: 'https://zoom.us/start/videomeeting' },
    facetime: { label: 'FaceTime (Call an Address)',        instant: false },
    custom:   { label: 'Paste a Meeting Link',              instant: false },
  };
  const PLATFORM_ICON: Record<string, React.ComponentType<any>> = { meet: VideoCamera, zoom: VideoCamera, facetime: Phone, custom: LinkSimple };
  const p = PLATFORMS[f.platform] || PLATFORMS.meet;
  const PIcon = PLATFORM_ICON[f.platform] || VideoCamera;

  function launchUrl(): string {
    if (f.platform === 'facetime') return f.address ? `facetime://${encodeURIComponent(String(f.address).trim())}` : '';
    if (f.platform === 'custom') return String(f.link || '').trim();
    return p.url || '';
  }

  async function launch() {
    if (!f.project_id) { setErr('Pick a site to log the walkthrough against.'); return; }
    const url = launchUrl();
    if (!url) { setErr(f.platform === 'facetime' ? 'Enter the FaceTime address to call.' : 'Enter the meeting link.'); return; }
    setBusy(true); setErr('');
    try {
      // Launch the native call in a new tab / the OS handler.
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noreferrer';
      document.body.appendChild(a); a.click(); a.remove();
      // Log it as a verification so the walkthrough is recorded against the site.
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      await createVerification({
        project_id: f.project_id,
        method: f.platform === 'facetime' ? 'facetime' : 'video',
        title: f.title?.trim() || `Live walkthrough — ${today}`,
        stage: f.stage || '',
        media_url: f.platform === 'facetime' ? '' : url,
        evidence_note: `Live ${p.label.split(' (')[0]} walkthrough launched ${today}. Verify once the walk is complete.`,
        requested_by: f.requested_by || '',
      });
      onClose();
    } catch (e: any) { setErr(e?.message || "Couldn't log the walkthrough. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2,4,8,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: 'min(540px, 100%)', boxShadow: '0 24px 80px rgba(2,4,8,0.55)', fontFamily: font, color: C.text }}>
        <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 4 }}><span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><VideoCamera size={20} weight="regular" color={C.text} /></span> Start Live Walkthrough</div>
        <p style={{ fontSize: 13, color: C.dim, margin: '0 0 16px', lineHeight: 1.5 }}>Launch a live video walkthrough with the field and log it against the site. The call opens in your video app; Saguaro records that the walkthrough happened so you can verify the milestone after.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Site *</label><select style={inp} value={f.project_id || ''} onChange={(e) => set('project_id', e.target.value)}><option value="">Select site…</option>{projects.map((pr: any) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}</select></div>
          <div><label style={lbl}>Platform</label><select style={inp} value={f.platform} onChange={(e) => set('platform', e.target.value)}>{Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          {f.platform === 'facetime' && <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>FaceTime Address (Phone or Apple ID) *</label><input style={inp} placeholder="super@icloud.com or +1 480…" value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></div>}
          {f.platform === 'custom' && <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Meeting Link *</label><input style={inp} placeholder="https://…" value={f.link || ''} onChange={(e) => set('link', e.target.value)} /></div>}
          <div><label style={lbl}>Gates Stage</label><select style={inp} value={f.stage || ''} onChange={(e) => set('stage', e.target.value)}><option value="">None</option>{ROLLOUT_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div><label style={lbl}>Requested By</label><input style={inp} value={f.requested_by || ''} onChange={(e) => set('requested_by', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>What are you walking?</label><input style={inp} placeholder="e.g. Sim bay rough-in walk" value={f.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
        </div>
        {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <GoldButton onClick={launch} disabled={busy} icon={busy ? undefined : <PIcon size={15} weight="regular" />}>{busy ? 'Launching…' : 'Launch & Log'}</GoldButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
      </div>
    </div>
  );
}

function RequestModal({ projects, initialMethod, onClose }: { projects: any[]; initialMethod: string; onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ method: initialMethod });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', background: 'var(--bg-surface-2)', color: C.text, width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 4, display: 'block' };
  const isVisit = f.method === 'site_visit';
  const mm = METHOD_META[f.method] || METHOD_META.photo;

  async function submit() {
    if (!f.project_id || !f.title) { setErr('Site and item are required.'); return; }
    setBusy(true); setErr('');
    try { await createVerification(f); onClose(); }
    catch (e: any) { setErr(e?.message || "Couldn't save the request. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2,4,8,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: 'min(540px, 100%)', boxShadow: '0 24px 80px rgba(2,4,8,0.55)', fontFamily: font, color: C.text }}>
        <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 4 }}>{isVisit ? 'Request On-Site Visit' : 'Request Verification'}</div>
        <p style={{ fontSize: 13, color: C.dim, margin: '0 0 16px', lineHeight: 1.5 }}>{isVisit
          ? 'Flag a site where a physical on-site visit is required (additional fee). It lands as a pending item until the visit is completed and signed off.'
          : 'Flag a milestone for remote sign-off. Pick how it will be verified and attach the evidence link; you verify it before the site advances.'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>{isVisit ? 'What needs an on-site look? *' : 'What needs verifying? *'}</label><input style={inp} placeholder={isVisit ? 'e.g. Punch walk before C-of-O' : 'e.g. Sim bays installed & level'} value={f.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
          <div><label style={lbl}>Site *</label><select style={inp} value={f.project_id || ''} onChange={(e) => set('project_id', e.target.value)}><option value="">Select site…</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label style={lbl}>Method</label><select style={inp} value={f.method || 'photo'} onChange={(e) => set('method', e.target.value)}>{METHOD_OPTIONS.map((m) => <option key={m} value={m}>{METHOD_META[m].label}</option>)}</select></div>
          <div><label style={lbl}>Gates Stage</label><select style={inp} value={f.stage || ''} onChange={(e) => set('stage', e.target.value)}><option value="">None</option>{ROLLOUT_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div><label style={lbl}>Requested By</label><input style={inp} value={f.requested_by || ''} onChange={(e) => set('requested_by', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>{mm.linkLabel}</label><input style={inp} placeholder="https://…" value={f.media_url || ''} onChange={(e) => set('media_url', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Note</label><textarea style={{ ...inp, minHeight: 60, resize: 'vertical', fontFamily: font }} value={f.evidence_note || ''} onChange={(e) => set('evidence_note', e.target.value)} /></div>
        </div>
        {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <GoldButton onClick={submit} disabled={busy}>{busy ? 'Saving…' : isVisit ? 'Request Visit' : 'Request Verification'}</GoldButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
      </div>
    </div>
  );
}
