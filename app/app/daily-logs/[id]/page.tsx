'use client';
/**
 * Daily Log Detail — wired to GET/PUT /api/daily-logs/[id].
 * Renders a single field daily log (date, weather, temps, crew, work performed,
 * delays, safety notes, materials, visitors, notes, photos) and edits it in
 * place: every section carries a uniform ghost edit affordance that flips the
 * SectionCard into an inline editor (Save = optimistic write + rollback toast),
 * empty sections get an add-composer, and header stats (superintendent, phase,
 * crew) edit through a compact drawer. Weather stays auto-stamped.
 *
 * Machined to the premium kit standard (components/ui/premium): PremiumSurface
 * wrapper, hero-lite ModuleHero (module accent 'daily' on the eyebrow/chips
 * only), StatStrip conditions band, and a SectionCard per log section.
 * Auth is cookie-based via getUser on the route, so a plain same-origin fetch
 * carries the session.
 *
 * API surface:
 *   GET /api/daily-logs/[id] -> { log }
 *   PUT /api/daily-logs/[id] -> { success } (allowlist includes the text
 *     columns edited here AND the structured jsonb columns — manpower_by_trade,
 *     equipment_on_site, etc. — so partial PUTs never drop mobile data.)
 *
 * Mobile parity: the native app (Saguaro-Field app/daily.tsx) already has a
 * full edit flow (Edit daily log form, photos, status transitions) — this page
 * brings web to parity for the sections both surfaces share.
 *
 * Note: the daily_logs table stores temperatures as high_temp / low_temp; this
 * page reads those columns (the GET route returns raw rows). Photos are rendered
 * defensively only when the row carries a photos/photo_urls array.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Warning, ClipboardText, Sun, Thermometer, UsersThree,
  HourglassMedium, ShieldCheck, Package, UserCircle, NotePencil, ImageSquare,
  HardHat, Wrench, CloudRain, Wind, Info, PencilSimple, Plus, Check,
} from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, ghostButtonStyle, GoldButton, GhostButton, DangerButton } from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';

const ACCENT = moduleAccent('daily'); // sun amber — chips, eyebrow, section markers only
const TEXT = '#FFFFFF';
const DIM = 'rgba(255,255,255,0.62)';
const FAINT = 'rgba(255,255,255,0.45)';
const RED = '#EF4444';
const GREEN = '#22C55E';
const ORANGE = '#F97316';
const HAIRLINE = 'rgba(255,255,255,0.08)';

interface DailyLog {
  id: string;
  project_id: string | null;
  log_date: string | null;
  weather: string | null;
  high_temp: number | null;
  low_temp: number | null;
  crew_count: number | null;
  work_performed: string | null;
  delays: string | null;
  safety_notes: string | null;
  materials_delivered: string | null;
  visitors: string | null;
  notes: string | null;
  // Mobile-app text columns (app/daily.tsx) — surfaced here so a log created on
  // the native app renders fully on web instead of showing partial data.
  superintendent: string | null;
  precipitation: string | null;
  wind_conditions: string | null;
  phase_of_work: string | null;
  equipment: string | null;
  photos?: string[] | null;
  photo_urls?: string[] | null;
  created_at: string | null;
}

interface Project { id: string; name: string; }

/** Section editor keys — one per editable surface on the page. */
type EditKey =
  | 'work' | 'equipment' | 'delays' | 'safety' | 'materials' | 'notes'
  | 'meta' | 'header';

function dateStr(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function tempStr(high: number | null | undefined, low: number | null | undefined): string {
  if (high == null && low == null) return '—';
  return `${high ?? '—'}° / ${low ?? '—'}°`;
}

export default function DailyLogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params['id'] as string;

  const [log, setLog] = useState<DailyLog | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // ── Inline editing state ─────────────────────────────────────────────────
  const [editKey, setEditKey] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const openEditor = (key: EditKey, seed: Record<string, string>) => {
    setEditKey(key);
    setDraft(seed);
  };
  const closeEditor = () => { setEditKey(null); setDraft({}); };

  /**
   * Optimistic PUT: apply `fields` to local state immediately, persist, and on
   * failure roll back to the exact prior row + surface an error toast. On
   * success a silent background GET reconciles server truth (kept best-effort —
   * the optimistic row stands if it fails).
   */
  const saveFields = useCallback(async (fields: Partial<DailyLog>, doneMsg = 'Log updated'): Promise<boolean> => {
    if (!log) return false;
    const prev = log;
    setSaving(true);
    setLog({ ...log, ...fields });
    try {
      const res = await fetch(`/api/daily-logs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast(doneMsg);
      fetch(`/api/daily-logs/${id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d?.log) setLog(d.log); })
        .catch(() => {});
      return true;
    } catch (e: any) {
      console.error(e);
      setLog(prev); // rollback — the page shows exactly what the server holds
      showToast(humanError(e, 'Save failed — your change was rolled back.'), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [log, id, showToast]);

  const loadLog = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await fetch(`/api/daily-logs/${id}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error('Failed to load daily log');
      const data = await res.json();
      const row: DailyLog = data.log ?? data;
      setLog(row);
      if (row?.project_id) {
        fetch(`/api/projects?limit=200`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d) return;
            const list: Project[] = Array.isArray(d) ? d : d.projects ?? [];
            const match = list.find(p => p.id === row.project_id);
            if (match) setProjectName(match.name);
          })
          .catch(() => {});
      }
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Failed to load the daily log. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadLog(); }, [loadLog]);

  // ── Shared bits ──────────────────────────────────────────────────────────
  const backBtn = (
    <button onClick={() => router.push('/app/daily-logs')} style={{ ...ghostButtonStyle, padding: '8px 14px', fontSize: 12.5 }}>
      <ArrowLeft size={14} /> Daily Logs
    </button>
  );
  const proseStyle: React.CSSProperties = {
    fontSize: 13.5, color: TEXT, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0,
  };
  const labelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800,
    letterSpacing: 'normal', color: FAINT, marginBottom: 5,
  };
  /** Uniform ghost icon Edit affordance — one shape on every editable card. */
  const editIconStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 9, cursor: 'pointer', padding: 0,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
    border: `1px solid ${HAIRLINE}`, color: DIM,
  };
  const fieldStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}`,
    borderRadius: 10, color: TEXT, fontSize: 13.5, lineHeight: 1.6, padding: '10px 12px',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const textareaStyle: React.CSSProperties = { ...fieldStyle, resize: 'vertical', minHeight: 96 };

  // ── Loading / Not found / Error ──────────────────────────────────────────
  if (loading) {
    return (
      <PremiumSurface maxWidth={1100}>
        <ModuleSkeleton kpis={0} rows={6} />
      </PremiumSurface>
    );
  }

  if (notFound || (!log && !error)) {
    return (
      <PremiumSurface maxWidth={1100}>
        <SectionCard flat flush>
          <PremiumEmpty
            icon={<ClipboardText size={30} weight="duotone" color={ACCENT.hex} />}
            title="Daily Log Not Found"
            description="This log may have been deleted, or the link is stale."
            action={backBtn}
          />
        </SectionCard>
      </PremiumSurface>
    );
  }

  if (error && !log) {
    return (
      <PremiumSurface maxWidth={1100}>
        <SectionCard flat flush>
          <PremiumEmpty
            tone="error"
            icon={<Warning size={30} weight="duotone" color={RED} />}
            title="Failed to Load the Daily Log"
            description={error}
            action={backBtn}
          />
        </SectionCard>
      </PremiumSurface>
    );
  }

  const l = log as DailyLog;
  const photos = (l.photos ?? l.photo_urls ?? []).filter(Boolean);

  const conditions = [
    { label: 'Superintendent', value: l.superintendent || '—', icon: <HardHat size={12} weight="fill" color={ACCENT.hex} /> },
    { label: 'Phase of Work', value: l.phase_of_work || '—', icon: <ClipboardText size={12} weight="fill" color={ACCENT.hex} /> },
    { label: 'Weather', value: l.weather || '—', icon: <Sun size={12} weight="fill" color={ACCENT.hex} /> },
    { label: 'Temp High / Low', value: tempStr(l.high_temp, l.low_temp), icon: <Thermometer size={12} weight="fill" color={ACCENT.hex} /> },
    { label: 'Precipitation', value: l.precipitation || '—', icon: <CloudRain size={12} weight="fill" color={ACCENT.hex} /> },
    { label: 'Wind', value: l.wind_conditions || '—', icon: <Wind size={12} weight="fill" color={ACCENT.hex} /> },
    { label: 'Crew', value: l.crew_count != null ? String(l.crew_count) : '0', sub: 'on site', icon: <UsersThree size={12} weight="fill" color={ACCENT.hex} /> },
  ];

  // ── Editor plumbing ──────────────────────────────────────────────────────
  const editBtn = (key: EditKey, seed: Record<string, string>, label: string) => (
    <button
      aria-label={`Edit ${label}`}
      title={`Edit ${label}`}
      onClick={() => openEditor(key, seed)}
      style={editIconStyle}
    >
      <PencilSimple size={14} />
    </button>
  );

  /** Save/Cancel (+ optional Clear-with-confirm) footer, one shape everywhere. */
  const editorFooter = (onSave: () => void, onClear?: () => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      <GoldButton size="md" icon={<Check size={14} weight="bold" />} onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </GoldButton>
      <GhostButton size="md" onClick={closeEditor} disabled={saving}>Cancel</GhostButton>
      {onClear && (
        <DangerButton size="md" onClick={onClear} disabled={saving} style={{ marginLeft: 'auto' }}>
          Clear
        </DangerButton>
      )}
    </div>
  );

  /** Single-textarea section: view / add-composer / inline editor. */
  const textSection = (opts: {
    k: EditKey; title: string; icon: React.ReactNode; field: keyof DailyLog & string;
    emptyText: string; emptyColor?: string; addLabel: string; contentColor?: string;
    placeholder: string;
  }) => {
    const value = (l[opts.field] as string | null) || '';
    const isEditing = editKey === opts.k;
    return (
      <SectionCard
        title={opts.title}
        icon={opts.icon}
        accent={ACCENT.hex}
        action={!isEditing ? editBtn(opts.k, { v: value }, opts.title) : undefined}
        style={{ marginBottom: 16 }}
      >
        {isEditing ? (
          <div>
            <textarea
              autoFocus
              value={draft.v ?? ''}
              onChange={e => setDraft(d => ({ ...d, v: e.target.value }))}
              placeholder={opts.placeholder}
              rows={5}
              style={textareaStyle}
            />
            {editorFooter(
              async () => {
                const ok = await saveFields({ [opts.field]: (draft.v ?? '').trim() || null } as Partial<DailyLog>);
                if (ok) closeEditor();
              },
              value
                ? async () => {
                    if (!window.confirm(`Clear the ${opts.title} entry? This removes the recorded text.`)) return;
                    const ok = await saveFields({ [opts.field]: null } as Partial<DailyLog>, `${opts.title} cleared`);
                    if (ok) closeEditor();
                  }
                : undefined,
            )}
          </div>
        ) : value ? (
          <p style={{ ...proseStyle, color: opts.contentColor || TEXT }}>{value}</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ ...proseStyle, color: opts.emptyColor || FAINT }}>{opts.emptyText}</p>
            <GhostButton size="md" icon={<Plus size={13} weight="bold" />} onClick={() => openEditor(opts.k, { v: '' })}>
              {opts.addLabel}
            </GhostButton>
          </div>
        )}
      </SectionCard>
    );
  };

  // Hidden-when-empty sections (equipment, notes) surface through a composer
  // strip instead of rendering empty cards.
  const composerTargets: { k: EditKey; label: string; icon: React.ReactNode }[] = [];
  if (!l.equipment && editKey !== 'equipment') composerTargets.push({ k: 'equipment', label: 'Add Equipment on Site', icon: <Wrench size={13} /> });
  if (!l.notes && editKey !== 'notes') composerTargets.push({ k: 'notes', label: 'Add General Notes', icon: <NotePencil size={13} /> });

  return (
    <PremiumSurface maxWidth={1100}>
      {/* Toast — optimistic save confirmations + rollback errors */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999,
          padding: '12px 20px', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, pointerEvents: 'none',
          background: toast.type === 'success' ? 'rgba(26,138,74,.92)' : 'rgba(192,48,48,.92)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Back link */}
      <button
        onClick={() => router.push('/app/daily-logs')}
        style={{ background: 'none', border: 'none', color: DIM, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} /> Daily Logs
      </button>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: 12, color: RED, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      {/* Hero-lite */}
      <ModuleHero
        eyebrow="Field Report"
        eyebrowIcon={<ClipboardText size={13} weight="fill" color={ACCENT.hex} />}
        title={dateStr(l.log_date)}
        subtitle={projectName || l.project_id || 'Daily Log'}
        actions={editKey !== 'header' ? editBtn('header', {
          superintendent: l.superintendent || '',
          phase: l.phase_of_work || '',
          crew: l.crew_count != null ? String(l.crew_count) : '',
        }, 'report info') : undefined}
        style={{ marginBottom: 22 }}
      />

      {/* Conditions band */}
      <StatStrip items={conditions} />

      {/* Header stats drawer — superintendent / phase / crew. Weather is
          auto-stamped at creation and intentionally not editable here. */}
      {editKey === 'header' && (
        <SectionCard
          title="Edit Report Info"
          subtitle="Superintendent, phase of work and crew count"
          icon={<HardHat size={16} weight="duotone" color={ACCENT.hex} />}
          accent={ACCENT.hex}
          style={{ marginBottom: 16 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div>
              <div style={labelStyle}><HardHat size={12} color={FAINT} /> Superintendent</div>
              <input
                autoFocus
                value={draft.superintendent ?? ''}
                onChange={e => setDraft(d => ({ ...d, superintendent: e.target.value }))}
                placeholder="Who ran the site"
                style={fieldStyle}
              />
            </div>
            <div>
              <div style={labelStyle}><ClipboardText size={12} color={FAINT} /> Phase of Work</div>
              <input
                value={draft.phase ?? ''}
                onChange={e => setDraft(d => ({ ...d, phase: e.target.value }))}
                placeholder="e.g. Rough-in, Trim"
                style={fieldStyle}
              />
            </div>
            <div>
              <div style={labelStyle}><UsersThree size={12} color={FAINT} /> Crew on Site</div>
              <input
                inputMode="numeric"
                value={draft.crew ?? ''}
                onChange={e => setDraft(d => ({ ...d, crew: e.target.value.replace(/[^0-9]/g, '') }))}
                placeholder="0"
                style={fieldStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12, color: FAINT }}>
            <Info size={13} color={ACCENT.hex} />
            Weather, temps, precipitation and wind were auto-stamped when this log was created — they stay as recorded.
          </div>
          {editorFooter(async () => {
            const ok = await saveFields({
              superintendent: (draft.superintendent ?? '').trim() || null,
              phase_of_work: (draft.phase ?? '').trim() || null,
              crew_count: Number(draft.crew) || 0,
            }, 'Report info updated');
            if (ok) closeEditor();
          })}
        </SectionCard>
      )}

      {/* Work Performed */}
      {textSection({
        k: 'work', title: 'Work Performed', field: 'work_performed',
        icon: <ClipboardText size={16} weight="duotone" color={ACCENT.hex} />,
        emptyText: 'No work recorded for this day.', addLabel: 'Add Work Note',
        placeholder: 'What did the crews get done today?',
      })}

      {/* Equipment On Site (mobile-app column) — card renders when recorded or
          being composed; otherwise it lives in the composer strip below */}
      {(l.equipment || editKey === 'equipment') && textSection({
        k: 'equipment', title: 'Equipment On Site', field: 'equipment',
        icon: <Wrench size={16} weight="duotone" color={ACCENT.hex} />,
        emptyText: 'No equipment recorded.', addLabel: 'Add Equipment Note',
        placeholder: 'Excavator, lull, scissor lifts…',
      })}

      {/* Delays */}
      {textSection({
        k: 'delays', title: 'Delays', field: 'delays',
        icon: <HourglassMedium size={16} weight="duotone" color={ACCENT.hex} />,
        emptyText: 'No delays reported.', addLabel: 'Add Delays Note',
        contentColor: ORANGE,
        placeholder: 'Weather hold, missed delivery, inspection slip…',
      })}

      {/* Safety Notes */}
      {textSection({
        k: 'safety', title: 'Safety Notes', field: 'safety_notes',
        icon: <ShieldCheck size={16} weight="duotone" color={ACCENT.hex} />,
        emptyText: 'No safety issues reported.', emptyColor: GREEN, addLabel: 'Add Safety Note',
        placeholder: 'Incidents, near-misses, toolbox talks…',
      })}

      {/* Materials & Visitors */}
      <SectionCard
        title={'Materials & Visitors'}
        icon={<Package size={16} weight="duotone" color={ACCENT.hex} />}
        accent={ACCENT.hex}
        action={editKey !== 'materials' ? editBtn('materials', { materials: l.materials_delivered || '', visitors: l.visitors || '' }, 'Materials & Visitors') : undefined}
        style={{ marginBottom: 16 }}
      >
        {editKey === 'materials' ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <div style={labelStyle}><Package size={12} color={FAINT} /> Materials Delivered</div>
                <textarea
                  autoFocus
                  value={draft.materials ?? ''}
                  onChange={e => setDraft(d => ({ ...d, materials: e.target.value }))}
                  placeholder="What hit the site today"
                  rows={4}
                  style={textareaStyle}
                />
              </div>
              <div>
                <div style={labelStyle}><UserCircle size={12} color={FAINT} /> Visitors</div>
                <textarea
                  value={draft.visitors ?? ''}
                  onChange={e => setDraft(d => ({ ...d, visitors: e.target.value }))}
                  placeholder="Inspectors, owner reps, vendors"
                  rows={4}
                  style={textareaStyle}
                />
              </div>
            </div>
            {editorFooter(
              async () => {
                const ok = await saveFields({
                  materials_delivered: (draft.materials ?? '').trim() || null,
                  visitors: (draft.visitors ?? '').trim() || null,
                });
                if (ok) closeEditor();
              },
              (l.materials_delivered || l.visitors)
                ? async () => {
                    if (!window.confirm('Clear materials and visitors? This removes both recorded entries.')) return;
                    const ok = await saveFields({ materials_delivered: null, visitors: null }, 'Materials & visitors cleared');
                    if (ok) closeEditor();
                  }
                : undefined,
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            {[
              { l: 'Materials Delivered', v: l.materials_delivered || '—', icon: <Package size={12} color={FAINT} /> },
              { l: 'Visitors', v: l.visitors || '—', icon: <UserCircle size={12} color={FAINT} /> },
            ].map(f => (
              <div key={f.l}>
                <div style={labelStyle}>{f.icon} {f.l}</div>
                <div style={{ fontSize: 13.5, color: TEXT, wordBreak: 'break-word', lineHeight: 1.55 }}>{f.v}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Notes — card renders when recorded or being composed */}
      {(l.notes || editKey === 'notes') && textSection({
        k: 'notes', title: 'Notes', field: 'notes',
        icon: <NotePencil size={16} weight="duotone" color={ACCENT.hex} />,
        emptyText: 'No notes recorded.', addLabel: 'Add Notes',
        placeholder: 'Anything else worth logging for the record',
      })}

      {/* Add-section composer — surfaces the hidden-when-empty sections */}
      {composerTargets.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {composerTargets.map(t => (
            <GhostButton key={t.k} size="md" icon={<Plus size={13} weight="bold" />} onClick={() => openEditor(t.k, { v: '' })}>
              {t.icon} {t.label}
            </GhostButton>
          ))}
        </div>
      )}

      {/* Photos (rendered only when the row carries a photo array) */}
      {photos.length > 0 && (
        <SectionCard flat
          title="Photos"
          subtitle={`${photos.length} attached`}
          icon={<ImageSquare size={16} weight="duotone" color={ACCENT.hex} />}
          accent={ACCENT.hex}
          style={{ marginBottom: 16 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                <img
                  src={src}
                  alt={`Daily log photo ${i + 1}`}
                  style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 12, border: `1px solid ${HAIRLINE}`, display: 'block' }}
                />
              </a>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Meta — log date edits through SaguaroDatePicker; project/created stay read-only */}
      <SectionCard flat
        title="Meta"
        icon={<Info size={16} weight="duotone" color={ACCENT.hex} />}
        accent={ACCENT.hex}
        action={editKey !== 'meta' ? editBtn('meta', { date: (l.log_date || '').slice(0, 10) }, 'log date') : undefined}
      >
        {editKey === 'meta' ? (
          <div>
            <div style={{ maxWidth: 340 }}>
              <div style={labelStyle}><ClipboardText size={12} color={FAINT} /> Log Date</div>
              <SaguaroDatePicker
                value={draft.date ?? ''}
                onChange={(v: string) => setDraft(d => ({ ...d, date: v }))}
                placeholder="Pick the report date"
              />
            </div>
            {editorFooter(async () => {
              const ok = await saveFields({ log_date: draft.date || null }, 'Log date updated');
              if (ok) closeEditor();
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            {[
              { l: 'Project', v: projectName || l.project_id || '—' },
              { l: 'Log Date', v: dateStr(l.log_date) },
              { l: 'Created', v: dateStr(l.created_at) },
            ].map(f => (
              <div key={f.l}>
                <div style={labelStyle}>{f.l}</div>
                <div style={{ fontSize: 13.5, color: TEXT, wordBreak: 'break-word' }}>{f.v}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
