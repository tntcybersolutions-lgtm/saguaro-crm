'use client';
import { useMemo, useState } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { useDailyLogs, submitDailyLog } from '@/lib/hooks/useFranchise';
import { C, font, fmtDate, useFranchiseGate, GateLoading, SevBadge } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, GoldButton, GhostButton } from '@/components/ui/premium';
import { Circle, Warning, CheckCircle, Clipboard, HardHat, CloudSun, Camera, Plus } from '@phosphor-icons/react';

const ACTIVE = (p: any) => !/complete|closed|closeout|won|archiv/i.test(String(p.status || ''));

export default function DailyLogsPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { logs, todayByProject, lateByProject, loading } = useDailyLogs();
  const { projects } = useProjects();
  const [submitting, setSubmitting] = useState(false);

  const activeSites = (projects as any[]).filter(ACTIVE);
  const compliance = useMemo(() => {
    const reported = activeSites.filter((p) => todayByProject[p.id]).length;
    const late = activeSites.filter((p) => todayByProject[p.id] && lateByProject[p.id]).length;
    return { reported, late, total: activeSites.length, missing: activeSites.filter((p) => !todayByProject[p.id]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, todayByProject, lateByProject]);

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={1200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Command Center"
        eyebrowIcon={<Clipboard size={13} weight="fill" color={C.gold} />}
        title="Daily Superintendent"
        accent="Reports"
        subtitle="Every site reports by 4 PM."
        actions={submitting
          ? <GhostButton onClick={() => setSubmitting(false)}>Close</GhostButton>
          : <GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setSubmitting(true)}>Submit Report</GoldButton>}
      />

      {submitting && <SubmitForm projects={activeSites} onDone={() => setSubmitting(false)} />}

      {/* Reporting pulse — today's compliance across active sites */}
      {!loading && (
        <StatStrip items={[
          { label: 'Reported Today', value: String(compliance.reported), accent: compliance.total > 0 && compliance.reported === compliance.total ? C.green : undefined, sub: `of ${compliance.total} active site${compliance.total === 1 ? '' : 's'}` },
          { label: 'Awaiting', value: String(compliance.total - compliance.reported), accent: compliance.total - compliance.reported ? C.red : C.green, sub: compliance.total - compliance.reported ? 'no report yet' : 'all sites in' },
          { label: 'Late (after 4 PM)', value: String(compliance.late), accent: compliance.late ? C.yellow : C.green, sub: 'site local time' },
          { label: 'Reports (21d)', value: String((logs as any[]).length), sub: 'across all sites' },
        ]} />
      )}

      {/* 4 PM compliance */}
      <SectionCard flat
        title="Today's 4 PM Compliance"
        icon={<CheckCircle size={16} weight="duotone" color={C.gold} />}
        action={<span style={{ fontSize: 13, fontWeight: 700, color: compliance.reported === compliance.total ? C.green : C.red, whiteSpace: 'nowrap' }}>{compliance.reported}/{compliance.total} reported</span>}
        style={{ marginBottom: 18 }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {activeSites.map((p) => {
            const ok = todayByProject[p.id];
            const late = ok && lateByProject[p.id];
            const bg = !ok ? 'rgba(255,59,48,0.10)' : late ? 'rgba(255,149,0,0.12)' : 'rgba(52,199,89,0.12)';
            const fg = !ok ? C.red : late ? C.yellow : C.green;
            const bd = !ok ? 'rgba(255,59,48,0.25)' : late ? 'rgba(255,149,0,0.3)' : 'rgba(52,199,89,0.3)';
            return (
              <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 999, background: bg, color: fg, border: `1px solid ${bd}` }}>
                {!ok ? <Circle size={13} weight="regular" color={fg} style={{ verticalAlign: 'middle' }} /> : late ? <Warning size={13} weight="fill" color={fg} style={{ verticalAlign: 'middle' }} /> : <CheckCircle size={13} weight="fill" color={fg} style={{ verticalAlign: 'middle' }} />} {p.name}{late ? ' · late' : ''}
              </span>
            );
          })}
          {activeSites.length === 0 && <span style={{ fontSize: 13, color: C.dim }}>No active sites.</span>}
        </div>
      </SectionCard>

      <SectionCard title="Recent Reports" subtitle="Last 21 days, newest first" icon={<Clipboard size={16} weight="duotone" color={C.gold} />}>
        {loading ? <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading…</div>
        : (logs as any[]).length === 0 ? (
          <PremiumEmpty icon={<Clipboard size={32} weight="duotone" color={C.gold} />} title="No daily reports yet"
            description="Every superintendent submits a daily report — photos, manpower, weather, progress, and problems — by 4 PM local. They roll up here across all sites."
            action={<GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setSubmitting(true)}>Submit the first</GoldButton>} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
            {(logs as any[]).map((l) => {
              const hasIssue = !!(l.issues || l.delays || l.incidents);
              return (
                <div key={l.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: `3px solid ${hasIssue ? C.yellow : C.green}`, borderRadius: 12, padding: '13px 15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{l.project_id ? <Link href={`/app/projects/${l.project_id}`} style={{ color: C.text, textDecoration: 'none' }}>{l.project_name || 'Site'}</Link> : 'Site'}</div>
                      <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{fmtDate(l.log_date)}{l.superintendent_name ? ` · ${l.superintendent_name}` : ''}</div>
                    </div>
                    {hasIssue && <SevBadge sev="yellow" label="Issue" />}
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: C.dim, flexWrap: 'wrap' }}>
                    {l.manpower_count != null && <span><HardHat size={13} weight="fill" color={C.dim} style={{ verticalAlign: 'middle' }} /> {l.manpower_count} crew</span>}
                    {l.weather && <span><CloudSun size={13} weight="fill" color={C.dim} style={{ verticalAlign: 'middle' }} /> {l.weather}</span>}
                    {l.photos_count != null && <span><Camera size={13} weight="regular" color={C.dim} style={{ verticalAlign: 'middle' }} /> {l.photos_count}</span>}
                  </div>
                  {l.work_performed && <div style={{ fontSize: 13, color: C.text, marginTop: 9, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.work_performed}</div>}
                  {(l.issues || l.delays) && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}><Warning size={13} weight="fill" color={C.red} style={{ verticalAlign: 'middle' }} /> {l.issues || l.delays}</div>}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
      </div>
    </PremiumSurface>
  );
}

function SubmitForm({ projects, onDone }: { projects: any[]; onDone: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ log_date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', background: '#1c1c1e', width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, display: 'block' };

  async function submit() {
    if (!f.project_id) { setErr('Pick a site.'); return; }
    setBusy(true); setErr('');
    try { await submitDailyLog(f); onDone(); } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Daily superintendent report" subtitle="Photos, manpower, weather, progress, problems — the whole day in one entry" icon={<HardHat size={16} weight="duotone" color={C.gold} />} style={{ marginBottom: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <div><label style={lbl}>Site *</label><select style={inp} value={f.project_id || ''} onChange={(e) => set('project_id', e.target.value)}><option value="">Select…</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label style={lbl}>Date</label><SaguaroDatePicker style={inp} value={f.log_date} onChange={(v) => set('log_date', v)} /></div>
        <div><label style={lbl}>Superintendent</label><input style={inp} value={f.superintendent_name || ''} onChange={(e) => set('superintendent_name', e.target.value)} /></div>
        <div><label style={lbl}>Manpower count</label><input type="number" style={inp} value={f.manpower_count || ''} onChange={(e) => set('manpower_count', e.target.value)} /></div>
        <div><label style={lbl}>Weather</label><input style={inp} placeholder="Clear, 104°F" value={f.weather || ''} onChange={(e) => set('weather', e.target.value)} /></div>
        <div><label style={lbl}>Photos count</label><input type="number" style={inp} value={f.photos_count || ''} onChange={(e) => set('photos_count', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Work performed today</label><textarea style={{ ...inp, minHeight: 54, resize: 'vertical', fontFamily: font }} value={f.work_performed || ''} onChange={(e) => set('work_performed', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Tomorrow's work</label><textarea style={{ ...inp, minHeight: 44, resize: 'vertical', fontFamily: font }} value={f.tomorrow || ''} onChange={(e) => set('tomorrow', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Problems / delays</label><input style={inp} value={f.problems || ''} onChange={(e) => set('problems', e.target.value)} /></div>
        <div><label style={lbl}>Deliveries</label><input style={inp} value={f.materials_delivered || ''} onChange={(e) => set('materials_delivered', e.target.value)} /></div>
        <div><label style={lbl}>Inspections</label><input style={inp} value={f.inspections_text || ''} onChange={(e) => set('inspections_text', e.target.value)} /></div>
        <div><label style={lbl}>Safety</label><input style={inp} value={f.safety_notes || ''} onChange={(e) => set('safety_notes', e.target.value)} /></div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <GoldButton size="md" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</GoldButton>
        <GhostButton size="md" onClick={onDone}>Cancel</GhostButton>
      </div>
    </SectionCard>
  );
}
