'use client';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useParams } from 'next/navigation';
import { Badge, Table, T } from '@/components/ui/shell';
import {
  PremiumSurface,
  ModuleHero,
  SectionCard,
  PremiumEmpty,
  StatStrip,
  FlowSteps,
  FlowStrip,
  InsightRow,
  AutoChip,
  goldButtonStyle,
  ghostButtonStyle, secondaryButtonStyle
} from '@/components/ui/premium';
import { Clock, Plus } from '@phosphor-icons/react';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { moduleAccent } from '@/lib/module-identity';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { StatusPill } from '@/components/ui/Status';
import { localDay } from '@/lib/calendar-day';
import { addDays } from '@/lib/time-zone';

interface TimeEntry {
  id: string;
  employee: string;
  date: string;
  regular_hrs: number;
  ot_hrs: number;
  classification: string;
  status: string;
  project_id: string;
  /** "PTO" / "Sick" … on a leave row (its regular / OT are 0), else null. */
  leave_label?: string | null;
  /** Punched with no signal and sent later — the times came from the phone. */
  sent_late?: boolean;
  /** Leave hours (hours_worked) on a leave row, else null. */
  leave_hrs?: number | null;
}

type WeekFilter = 'current' | 'last' | 'all';

// Cinematic-kit accent palette (matches the dashboard) ------------------------
const GREEN = 'var(--success)';
const ORANGE = 'var(--warning)';

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 };

// Compact button + filter-chip presets derived from the kit --------------------
const goldBtnSm: React.CSSProperties = { ...goldButtonStyle, padding: '6px 14px', fontSize: 12, borderRadius: 9 };
const dangerBtnSm: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, cursor: 'pointer', background: 'rgba(248,113,113,0.12)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.35)', fontWeight: 700, fontSize: 12 };
const chipBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid', transition: 'all .16s ease' };
const chipActive: React.CSSProperties = { ...chipBase, background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-strong))', color: 'var(--on-brand)', borderColor: 'transparent', boxShadow: '0 8px 20px -10px color-mix(in srgb, var(--brand-primary) 60%, transparent)' };
const chipInactive: React.CSSProperties = { ...chipBase, background: 'rgba(255,255,255,0.04)', color: 'var(--c-text-2)', borderColor: 'rgba(255,255,255,0.10)' };

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  // The local Monday's own day — toISOString() was the UTC day, which after 7 PM in Iowa is Tuesday.
  return localDay(d);
}

const CLASSIFICATIONS = ['Laborer', 'Carpenter', 'Electrician', 'Plumber', 'Ironworker', 'Operator', 'Superintendent', 'Foreman'];

/** A blank entry dated today on this device — fresh each time, not frozen at page load (or at the server's UTC day). */
const emptyForm = () => ({ employee: '', date: localDay(), regular_hrs: 8, ot_hrs: 0, classification: 'Laborer', costCode: '' });

const fmt = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }));

export default function TimesheetsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `timesheets:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('current');
  // Project snapshot (/api/project-context): cost codes, budget actuals, open
  // items — the entry form walks in knowing the job.
  const { ctx } = useProjectContext(projectId);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timesheets?week=${weekFilter}`);
      const json = await res.json();
      setEntries(json.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, weekFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Dead-space kill (spec 4.1): an empty log opens straight into the entry
  // composer (today + 8h defaulted, roster type-ahead). One-shot per visit so
  // Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && entries.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [loading, entries.length]);

  const currentWeekStart = getWeekStart(new Date());
  const lastWeekStart = addDays(currentWeekStart, -7);

  const filtered = entries.filter(e => {
    if (weekFilter === 'all') return true;
    if (weekFilter === 'current') return e.date >= currentWeekStart;
    if (weekFilter === 'last') return e.date >= lastWeekStart && e.date < currentWeekStart;
    return true;
  });

  // Roster the system already knows — every name ever logged on this job.
  const roster = Array.from(new Set(entries.map(e => (e.employee || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  // Cost codes: real budget lines when the project has them, else the full CSI division list.
  const codeOptions: { value: string; label: string; division: string }[] = (ctx?.costCodes?.length
    ? ctx.costCodes.map((c: any) => ({ value: String(c.costCode || c.division || ''), label: `${c.costCode || c.division} — ${c.description || ''}`.trim(), division: String(c.division || '').slice(0, 2) }))
    : Object.entries(CSI_DIVISIONS).map(([code, d]) => ({ value: code, label: `${code} — ${d.name}`, division: code })));

  const totalEntries = filtered.length;
  const totalHours = filtered.reduce((s, e) => s + e.regular_hrs + e.ot_hrs, 0);
  const pendingCount = filtered.filter(e => e.status === 'pending').length;
  const approvedCount = filtered.filter(e => e.status === 'approved').length;

  async function handleSave(): Promise<boolean> {
    if (!form.employee) return false;
    setSaving(true);
    try {
      const res = await fetch('/api/timesheets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          work_date: form.date || undefined,
          status: 'pending',
          // Structured fields so the crew member, hours, and trade actually
          // persist (previously only work_description survived; hours + name
          // were dropped and the entry showed the logged-in user at 0 hrs).
          employee_name: form.employee,
          regular_hours: form.regular_hrs,
          overtime_hours: form.ot_hrs,
          trade: form.classification,
          // Cost-code attribution (additive — no existing field renamed) so the
          // approval step can post this labor against the right budget division.
          csi_division: form.costCode ? (codeOptions.find(c => c.value === form.costCode)?.division || String(form.costCode).slice(0, 2)) : undefined,
          cost_code_description: form.costCode ? (codeOptions.find(c => c.value === form.costCode)?.label || form.costCode) : undefined,
          work_description: [form.employee, form.classification, form.costCode ? (codeOptions.find(c => c.value === form.costCode)?.label || form.costCode) : ''].filter(Boolean).join(' — '),
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setShowForm(false);
      setForm(emptyForm());
      setToast('Timesheet entry added.');
      setTimeout(() => setToast(''), 4000);
      fetchEntries();
      guard.clearDraft();
      return true;
    } catch {
      setToast('Could not add the entry. Please try again.');
      setTimeout(() => setToast(''), 4000);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(id: string, action: 'approved' | 'rejected') {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: action } : e));
    try {
      const res = await fetch(`/api/timesheets/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) throw new Error('update failed');
      setToast(`Timesheet ${action}.`);
      setTimeout(() => setToast(''), 4000);
    } catch {
      setToast('Could not update the timesheet. Please try again.');
      setTimeout(() => setToast(''), 4000);
      fetchEntries();
    }
  }

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="Labor Tracking"
        eyebrowIcon={<Clock size={13} weight="fill" color={moduleAccent('time').hex} />}
        title="Crew"
        accent="Timesheets"
        subtitle="Weekly crew timesheets and labor tracking."
        actions={
          <button style={showForm ? ghostButtonStyle : goldButtonStyle} className="pmBtn" onClick={() => setShowForm(p => !p)}>
            <Plus size={15} weight="bold" /> Add Entry
          </button>
        }
      />

      {/* One summary: this period's entries, plus where approved labor posts once the project context is in */}
      <StatStrip items={[
        { href: `/app/projects/${projectId}/timesheets`, label: 'Total Entries', value: String(totalEntries), sub: 'Logged this period' },
        { href: `/app/projects/${projectId}/timesheets`, label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, sub: 'Regular + overtime' },
        { href: `/app/projects/${projectId}/timesheets`, label: 'Pending Approval', value: String(pendingCount), accent: pendingCount > 0 ? ORANGE : undefined, sub: 'Awaiting review' },
        { href: `/app/projects/${projectId}/timesheets`, label: 'Approved', value: String(approvedCount), accent: approvedCount > 0 ? GREEN : undefined, sub: 'This period' },
        ...(ctx ? [
          { href: `/app/projects/${projectId}/budget`, label: 'Budget Actuals', value: fmt(Number(ctx.budget?.actual) || 0), sub: 'Approved labor posts here' },
        ] : []),
      ]} />

      {/* Week filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([['current', 'Current Week'], ['last', 'Last Week'], ['all', 'All']] as [WeekFilter, string][]).map(([key, label]) => (
          <button key={key} className="pmBtn" style={weekFilter === key ? chipActive : chipInactive} onClick={() => setWeekFilter(key)}>{label}</button>
        ))}
      </div>

      {toast && (
        <div style={{ marginBottom: 16, padding: '11px 16px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, color: GREEN, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Add Timesheet Entry" icon={<Plus size={17} weight="bold" style={{ color: 'var(--text-primary)' }} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 22, alignItems: 'start' }}>
            <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div>
                <label style={lbl}>Employee *</label>
                <Suggest type="text" value={form.employee} onChange={e => setForm(p => ({ ...p, employee: e.target.value }))} style={inp} placeholder="Crew member name" options={roster} />
                {roster.length > 0 && <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 4, lineHeight: 1.45 }}>{roster.length} crew name{roster.length === 1 ? '' : 's'} on file — start typing to pick.</div>}
              </div>
              <div>
                <label style={lbl}>Date<AutoChip /></label>
                <SaguaroDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} style={inp} />
                <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 4, lineHeight: 1.45 }}>Defaulted to today — edit to backfill.</div>
              </div>
              <div>
                <label style={lbl}>Classification</label>
                <select value={form.classification} onChange={e => setForm(p => ({ ...p, classification: e.target.value }))} style={inp}>
                  {CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Cost Code</label>
                <select value={form.costCode} onChange={e => setForm(p => ({ ...p, costCode: e.target.value }))} style={inp}>
                  <option value="">Unassigned</option>
                  {codeOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 4, lineHeight: 1.45 }}>{ctx?.costCodes?.length ? 'Pulled from the project budget lines.' : 'Full CSI division list — budget lines give project-specific codes.'}</div>
              </div>
              <div>
                <label style={lbl}>Regular Hours{form.regular_hrs === 8 && <AutoChip />}</label>
                <input type="number" min={0} max={24} value={form.regular_hrs} onChange={e => setForm(p => ({ ...p, regular_hrs: Number(e.target.value) }))} style={inp} />
                <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 4, lineHeight: 1.45 }}>Standard 8h day — hours past 8 belong in OT.</div>
              </div>
              <div>
                <label style={lbl}>OT Hours</label>
                <input type="number" min={0} max={24} value={form.ot_hrs} onChange={e => setForm(p => ({ ...p, ot_hrs: Number(e.target.value) }))} style={inp} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Total: {(Number(form.regular_hrs) || 0) + (Number(form.ot_hrs) || 0)}h</span>
                {(Number(form.ot_hrs) || 0) > 0 && <span style={{ fontSize: 12, color: ORANGE, marginTop: 2 }}>{Number(form.ot_hrs) || 0}h overtime flagged</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={{ ...goldButtonStyle, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} className="pmBtn" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Entry'}</button>
              <button style={ghostButtonStyle} className="pmBtn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
            </div>
            {/* Context rail — the downstream automation this entry triggers */}
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 20 }}>
              <FlowSteps title="After You Save" steps={[
                { title: 'Entry Lands as Pending', desc: 'It appears in the table below for review — nothing posts yet.' },
                { title: 'Approve in One Click', desc: 'Approval stamps who approved and when on the entry.' },
                { title: 'Labor Posts to Job Cost', desc: 'Approved labor becomes a cost entry and rolls into the budget line actuals for its division — automatically.' },
              ]} />
              {ctx && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <InsightRow label="Budget Actuals" value={fmt(Number(ctx.budget?.actual) || 0)} />
                  <InsightRow label="Pending Entries" value={String(pendingCount)} accent={pendingCount > 0 ? ORANGE : undefined} />
                  <InsightRow label="Approved" value={String(approvedCount)} accent={approvedCount > 0 ? GREEN : undefined} />
                </div>
              )}
            </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Table */}
      <SectionCard title="Time Entries" icon={<Clock size={17} weight="duotone" color={moduleAccent('time').hex} />} flush>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 44, color: 'var(--c-text-2)', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                <Clock size={16} weight="duotone" style={{ color: 'var(--text-primary)', marginRight: 7, verticalAlign: 'text-bottom' }} />
                {entries.length === 0 ? 'No time entries yet' : 'No entries in this period'}
                <span style={{ fontWeight: 400, color: 'var(--c-text-2)' }}>
                  {entries.length === 0
                    ? (showForm ? ' — log the first crew entry in the form above; the roster builds as you go.' : ' — log the first crew entry to start tracking labor.')
                    : ' — switch the week filter, or add one for this period.'}
                </span>
              </div>
              {!showForm && (
                <button style={secondaryButtonStyle} className="pmBtn" onClick={() => setShowForm(true)}><Plus size={15} weight="bold" /> Add Entry</button>
              )}
            </div>
            <FlowStrip steps={[
              { title: 'Log Hours', desc: 'Name, hours, cost code' },
              { title: 'Pending Review', desc: 'Lands in this table' },
              { title: 'Approve in One Click' },
              { title: 'Labor Posts to Job Cost', desc: 'Budget actuals update' },
            ]} />
          </div>
        ) : (
          <Table
            headers={['Employee', 'Date', 'Regular Hrs', 'OT Hrs', 'Total Hrs', 'Classification', 'Status', 'Actions']}
            rows={filtered.map(e => [
              <span key="emp" style={{ fontWeight: 600 }}>{e.employee}</span>,
              <span key="dt" style={{ color: T.muted, whiteSpace: 'nowrap' }}>
                {e.date}
                {e.sent_late && <> <Badge label="Punched offline" color="amber" /></>}
              </span>,
              ...(e.leave_label ? [
                /* A PTO / sick row: no worked hours. Show its leave hours and what kind of
                   leave it is — it used to read as an unlabeled 0-hour shift. */
                <span key="rh" style={{ color: T.muted }}>—</span>,
                <span key="oh" style={{ color: T.muted }}>—</span>,
                <span key="th" style={{ fontWeight: 700, color: T.white, whiteSpace: 'nowrap' }} title="Leave hours — not worked time, posts nothing to job cost">{Number(e.leave_hrs ?? 0).toFixed(1)}h</span>,
                <Badge key="cl" label={`${e.leave_label} · leave`} color="blue" />,
              ] : [
                <span key="rh" style={{ color: T.white }}>{e.regular_hrs}</span>,
                <span key="oh" style={{ color: e.ot_hrs > 0 ? T.amber : T.muted }}>{e.ot_hrs}</span>,
                <span key="th" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{(e.regular_hrs + e.ot_hrs).toFixed(1)}h</span>,
                <span key="cl" style={{ color: T.muted }}>{e.classification}</span>,
              ]),
              <StatusPill key="st" module="timesheets" status={e.status} size="sm" />,
              <div key="act" style={{ display: 'flex', gap: 6 }}>
                {e.status === 'pending' && (
                  <>
                    <button style={goldBtnSm} className="pmBtn" onClick={() => handleAction(e.id, 'approved')}>Approve</button>
                    <button style={dangerBtnSm} className="pmBtn" onClick={() => handleAction(e.id, 'rejected')}>Reject</button>
                  </>
                )}
              </div>,
            ])}
          />
        )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
