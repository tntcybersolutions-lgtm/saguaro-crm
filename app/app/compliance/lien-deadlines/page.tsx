'use client';
/**
 * Saguaro — Lien Deadline Tracker
 * Calendar-style view of upcoming lien deadlines with AZ auto-calculation.
 */
import React, { useState, useEffect, useCallback } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { getSupabaseBrowser, ensureBrowserSession } from '@/lib/supabase-browser';
import {
  PremiumSurface,
  ModuleHero,
  SectionCard,
  StatCard,
  PremiumEmpty,
  goldButtonStyle,
  ghostButtonStyle,
} from '@/components/ui/premium';
import {
  Gavel,
  Plus,
  WarningCircle,
  Clock,
  CalendarCheck,
  CalendarDots,
  CalendarBlank,
  CalendarPlus,
} from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const GOLD = 'var(--brand-primary)';
const AMBER = 'var(--warning)';
const GREEN = '#2CFF7A';
const BLUE = 'var(--brand-primary)';
const RED = '#FF3B30';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';
const BORDER = 'rgba(255,255,255,0.12)';
const GRAY = '#8094B0';
const ROW_BG = 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))';

const STATES = ['AZ', 'CA', 'TX', 'NV', 'CO', 'FL'];
const DEADLINE_TYPES = [
  { value: 'preliminary_notice', label: 'Preliminary Notice' },
  { value: 'mechanics_lien', label: "Mechanic's Lien" },
  { value: 'stop_notice', label: 'Stop Notice' },
  { value: 'bond_claim', label: 'Bond Claim' },
];

interface LienDeadline {
  id: string;
  project_id: string;
  state: string;
  deadline_type: string;
  due_date: string;
  description: string;
  status: string;
  first_work_date?: string;
  completion_date?: string;
  last_work_date?: string;
  calculated_deadlines?: Record<string, string>;
  reminder_sent_30: boolean;
  reminder_sent_14: boolean;
  reminder_sent_7: boolean;
  created_at?: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

function deadlineTypeLabel(type: string): string {
  return DEADLINE_TYPES.find(t => t.value === type)?.label || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function urgencyColor(days: number): string {
  if (days < 0) return RED;
  if (days <= 7) return AMBER;
  if (days <= 30) return BLUE;
  return GRAY;
}

function urgencyLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days}d remaining`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function LienDeadlinePage() {
  const [deadlines, setDeadlines] = useState<LienDeadline[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [formProject, setFormProject] = useState('');
  const [formState, setFormState] = useState('AZ');
  const [formType, setFormType] = useState('preliminary_notice');
  const [formDueDate, setFormDueDate] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFirstWork, setFormFirstWork] = useState('');
  const [formCompletion, setFormCompletion] = useState('');
  const [formLastWork, setFormLastWork] = useState('');

  /* ── Unsaved-work guard: a half-entered lien deadline is real compliance
   *    work, so leaving this module (sidebar, ⌘K, breadcrumb, back) confirms
   *    first and the draft is kept on this device either way. ── */
  const deadlineDraft = { formProject, formState, formType, formDueDate, formDesc, formFirstWork, formCompletion, formLastWork };
  const composerDirty = useComposerDirty(showAdd, deadlineDraft);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: 'lien-deadline-create',
    draftData: deadlineDraft,
    restoreDraft: (d) => {
      const v = d as typeof deadlineDraft;
      setFormProject(v.formProject ?? ''); setFormState(v.formState ?? 'AZ');
      setFormType(v.formType ?? 'preliminary_notice'); setFormDueDate(v.formDueDate ?? '');
      setFormDesc(v.formDesc ?? ''); setFormFirstWork(v.formFirstWork ?? '');
      setFormCompletion(v.formCompletion ?? ''); setFormLastWork(v.formLastWork ?? '');
      setShowAdd(true);
    },
    onSave: () => createDeadline(),
  });

  // AZ auto-calculation
  const azCalc = {
    preliminary: formFirstWork ? addDays(formFirstWork, 20) : '',
    mechLien: formCompletion ? addDays(formCompletion, 120) : '',
    bondClaim: formLastWork ? addDays(formLastWork, 90) : '',
  };

  const fetchDeadlines = useCallback(async () => {
    try {
      const res = await fetch('/api/compliance/lien-deadlines');
      if (res.ok) {
        const data = await res.json();
        setDeadlines(data.deadlines || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeadlines(); }, [fetchDeadlines]);

  // Load projects for the picker (RLS-scoped browser client)
  useEffect(() => {
    (async () => {
      try {
        await ensureBrowserSession();
        const { data } = await getSupabaseBrowser()
          .from('projects')
          .select('id, name')
          .order('name', { ascending: true });
        const list = (data as ProjectOption[]) || [];
        setProjects(list);
        if (list[0]) setFormProject(prev => prev || list[0].id);
      } catch {
        // silent — form still guards against empty project
      }
    })();
  }, []);

  const createDeadline = async (): Promise<boolean> => {
    if (!formProject.trim() || !formDueDate) return false;
    setSaving(true);
    try {
      const res = await fetch('/api/compliance/lien-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: formProject.trim(),
          state: formState,
          deadline_type: formType,
          due_date: formDueDate,
          description: formDesc.trim(),
          first_work_date: formFirstWork || undefined,
          completion_date: formCompletion || undefined,
          last_work_date: formLastWork || undefined,
        }),
      });
      if (res.ok) {
        await fetchDeadlines();
        setShowAdd(false);
        setFormProject('');
        setFormDueDate('');
        setFormDesc('');
        setFormFirstWork('');
        setFormCompletion('');
        setFormLastWork('');
        guard.clearDraft();
        setSaving(false);
        return true;
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
    return false;
  };

  // Sort by date
  const sorted = [...deadlines].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const overdueCount = sorted.filter(d => daysUntil(d.due_date) < 0).length;
  const due7Count = sorted.filter(d => { const dy = daysUntil(d.due_date); return dy >= 0 && dy <= 7; }).length;
  const due30Count = sorted.filter(d => { const dy = daysUntil(d.due_date); return dy > 7 && dy <= 30; }).length;
  const futureCount = sorted.filter(d => daysUntil(d.due_date) > 30).length;

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-surface-2)',
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    color: TEXT,
    width: '100%',
    outline: 'none',
  };

  const submitDisabled = !formProject.trim() || !formDueDate || saving;

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="Compliance"
        eyebrowIcon={<Gavel size={13} weight="fill" color={GOLD} />}
        title="Lien Deadline"
        accent="Tracker"
        subtitle="Notices, liens, and bond claims. AZ statutory deadlines auto-calculated."
        actions={
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="pmBtn"
            style={showAdd ? ghostButtonStyle : goldButtonStyle}
          >
            {showAdd ? 'Cancel' : <><Plus size={15} weight="bold" /> Add Deadline</>}
          </button>
        }
      />

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<WarningCircle size={19} weight="duotone" color={RED} />}
          label="Overdue" value={String(overdueCount)} accent={RED}
          sub={overdueCount === 1 ? '1 past due' : `${overdueCount} past due`}
          delay={0.02}
         href="/app/compliance/lien-deadlines"/>
        <StatCard
          icon={<Clock size={19} weight="duotone" color={AMBER} />}
          label="Due in 7 Days" value={String(due7Count)} accent={AMBER}
          sub="Needs action" delay={0.06}
         href="/app/compliance/lien-deadlines"/>
        <StatCard
          icon={<CalendarCheck size={19} weight="duotone" color={BLUE} />}
          label="Due in 30 Days" value={String(due30Count)} accent={BLUE}
          sub="Upcoming" delay={0.10}
         href="/app/compliance/lien-deadlines"/>
        <StatCard
          icon={<CalendarDots size={19} weight="duotone" color={GRAY} />}
          label="Future" value={String(futureCount)} accent={GRAY}
          sub="Beyond 30 days" delay={0.14}
         href="/app/compliance/lien-deadlines"/>
      </div>

      {/* Add Deadline Form */}
      {showAdd && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Add Deadline" icon={<CalendarPlus size={17} weight="duotone" color={GOLD} />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Project *</label>
                <select value={formProject} onChange={e => setFormProject(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select a project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>State *</label>
                <select value={formState} onChange={e => setFormState(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Deadline Type *</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {DEADLINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Due Date *</label>
                <SaguaroDatePicker value={formDueDate} onChange={v => setFormDueDate(v)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '2 / -1' }}>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Description</label>
                <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description" style={inputStyle} />
              </div>
            </div>

            {/* AZ-specific auto-calculation inputs */}
            {formState === 'AZ' && (
              <div style={{ marginTop: 20, padding: 16, background: 'var(--brand-primary-08)', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--brand-primary) 15%, transparent)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12 }}>AZ Auto-Calculated Deadlines</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>First Work Date</label>
                    <SaguaroDatePicker value={formFirstWork} onChange={v => setFormFirstWork(v)} style={inputStyle} />
                    {azCalc.preliminary && (
                      <div style={{ fontSize: 11, color: GOLD, marginTop: 4 }}>
                        Preliminary 20-Day Notice: <strong>{azCalc.preliminary}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Completion Date</label>
                    <SaguaroDatePicker value={formCompletion} onChange={v => setFormCompletion(v)} style={inputStyle} />
                    {azCalc.mechLien && (
                      <div style={{ fontSize: 11, color: GOLD, marginTop: 4 }}>
                        Mechanic&apos;s Lien (120d): <strong>{azCalc.mechLien}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Last Work Date</label>
                    <SaguaroDatePicker value={formLastWork} onChange={v => setFormLastWork(v)} style={inputStyle} />
                    {azCalc.bondClaim && (
                      <div style={{ fontSize: 11, color: GOLD, marginTop: 4 }}>
                        Bond Claim (90d): <strong>{azCalc.bondClaim}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={createDeadline}
                disabled={submitDisabled}
                className="pmBtn"
                style={{
                  ...goldButtonStyle,
                  padding: '11px 28px',
                  ...(submitDisabled ? { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' } : {}),
                }}
              >
                {saving ? 'Saving…' : 'Add Deadline'}
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
          <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.12)', borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          Loading deadlines…
        </div>
      ) : sorted.length === 0 ? (
        <SectionCard>
          <PremiumEmpty
            icon={<CalendarBlank size={30} weight="duotone" color={GOLD} />}
            title="No Deadlines"
            description="Add your first lien deadline to start tracking preliminary notices, mechanic's liens, stop notices, and bond claims."
            action={
              <button onClick={() => setShowAdd(true)} className="pmBtn" style={goldButtonStyle}>
                <Plus size={15} weight="bold" /> Add Deadline
              </button>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard flat
          title="Upcoming Deadlines"
          icon={<CalendarBlank size={17} weight="duotone" color={GOLD} />}
          subtitle={sorted.length === 1 ? '1 deadline tracked' : `${sorted.length} deadlines tracked`}
          bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {sorted.map(dl => {
            const days = daysUntil(dl.due_date);
            const color = urgencyColor(days);
            return (
              <div
                key={dl.id}
                style={{
                  background: ROW_BG,
                  border: `1px solid rgba(255,255,255,0.08)`,
                  borderRadius: 14,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  borderLeft: `4px solid ${color}`,
                  flexWrap: 'wrap',
                }}
              >
                {/* Date block */}
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: `color-mix(in srgb, ${color} 8%, transparent)`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color }}>
                    {new Date(dl.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>
                    {new Date(dl.due_date + 'T00:00:00').getDate()}
                  </div>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: `color-mix(in srgb, ${color} 9%, transparent)`,
                      color,
                    }}>
                      {deadlineTypeLabel(dl.deadline_type)}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'var(--brand-primary-12)',
                      color: BLUE,
                    }}>
                      {dl.state}
                    </span>
                    {/* Reminder badges */}
                    {dl.reminder_sent_30 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(107,114,128,0.12)', color: GRAY }}>30d sent</span>}
                    {dl.reminder_sent_14 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--brand-primary-12)', color: GOLD }}>14d sent</span>}
                    {dl.reminder_sent_7 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,59,48,0.12)', color: RED }}>7d sent</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{dl.description || deadlineTypeLabel(dl.deadline_type)}</div>
                  <div style={{ fontSize: 12, color: DIM }}>
                    Due: {new Date(dl.due_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                {/* Urgency badge */}
                <div style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  background: `color-mix(in srgb, ${color} 8%, transparent)`,
                  color,
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                  textAlign: 'center',
                  minWidth: 100,
                }}>
                  {urgencyLabel(days)}
                </div>

                {/* Calculated AZ deadlines */}
                {dl.calculated_deadlines && Object.keys(dl.calculated_deadlines).length > 0 && (
                  <div style={{ width: '100%', marginTop: 4, paddingLeft: 72 }}>
                    <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, marginBottom: 4 }}>AZ Calculated:</div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {Object.entries(dl.calculated_deadlines).map(([key, val]) => (
                        <div key={key} style={{ fontSize: 11, color: DIM }}>
                          {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: <span style={{ color: GOLD, fontWeight: 600 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </SectionCard>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
