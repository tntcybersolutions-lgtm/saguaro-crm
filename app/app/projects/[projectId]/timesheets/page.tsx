'use client';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useParams } from 'next/navigation';
import { Badge, Table, T } from '@/components/ui/shell';
import {
  PremiumSurface,
  ModuleHero,
  StatCard,
  SectionCard,
  PremiumEmpty,
  StatStrip,
  FlowSteps,
  FlowStrip,
  InsightRow,
  AutoChip,
  goldButtonStyle,
  ghostButtonStyle,
} from '@/components/ui/premium';
import { FileText, Clock, Hourglass, CheckCircle, Plus } from '@phosphor-icons/react';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { moduleAccent } from '@/lib/module-identity';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { StatusPill } from '@/components/ui/Status';

interface TimeEntry {
  id: string;
  employee: string;
  date: string;
  regular_hrs: number;
  ot_hrs: number;
  classification: string;
  status: string;
  project_id: string;
}

type WeekFilter = 'current' | 'last' | 'all';

// Cinematic-kit accent palette (matches the dashboard) ------------------------
const GOLD = '#F59E0B';
const GREEN = '#45B37D';
const ORANGE = '#F0A63C';

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.62)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 };

// Compact button + filter-chip presets derived from the kit --------------------
const goldBtnSm: React.CSSProperties = { ...goldButtonStyle, padding: '6px 14px', fontSize: 12, borderRadius: 9 };
const dangerBtnSm: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, cursor: 'pointer', background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.35)', fontWeight: 700, fontSize: 12 };
const chipBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid', transition: 'all .16s ease' };
const chipActive: React.CSSProperties = { ...chipBase, background: `linear-gradient(135deg, ${GOLD}, #FBBF24)`, color: '#1A1206', borderColor: 'transparent', boxShadow: '0 8px 20px -10px rgba(245,158,11,0.6)' };
const chipInactive: React.CSSProperties = { ...chipBase, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.10)' };

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

const CLASSIFICATIONS = ['Laborer', 'Carpenter', 'Electrician', 'Plumber', 'Ironworker', 'Operator', 'Superintendent', 'Foreman'];

const EMPTY_FORM = { employee: '', date: new Date().toISOString().split('T')[0], regular_hrs: 8, ot_hrs: 0, classification: 'Laborer', costCode: '' };

const fmt = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }));

export default function TimesheetsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

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
  const lastWeekStart = (() => { const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; })();

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
      setForm(EMPTY_FORM);
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
        eyebrow="LABOR TRACKING"
        eyebrowIcon={<Clock size={13} weight="fill" color={moduleAccent('time').hex} />}
        title="Crew"
        accent="Timesheets"
        subtitle="Weekly crew timesheets and labor tracking"
        actions={
          <button style={goldButtonStyle} className="pmBtn" onClick={() => setShowForm(p => !p)}>
            <Plus size={15} weight="bold" /> Add Entry
          </button>
        }
      />

      {/* What the system already knows about this job */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/crews`,  label: 'Crew Roster', value: String(roster.length), sub: roster.length ? 'names on file — type-ahead below' : 'builds as you log time' },
          {href: `/app/projects/${projectId}/budget`,  label: 'Budget Actuals', value: fmt(Number(ctx.budget?.actual) || 0), sub: 'approved labor posts here' },
          {href: `/app/projects/${projectId}/timesheets`,  label: 'Cost Codes', value: String(ctx.costCodes?.length || Object.keys(CSI_DIVISIONS).length), sub: ctx.costCodes?.length ? 'from the project budget' : 'CSI divisions (no budget yet)' },
          {href: `/app/projects/${projectId}/schedule`,  label: 'Schedule Tasks', value: String(ctx.counts?.scheduleTasks ?? 0), sub: ctx.schedule?.criticalCount ? `${ctx.schedule.criticalCount} critical open` : 'on the schedule' },
          {href: `/app/projects/${projectId}/rfis`,  label: 'Open RFIs', value: String(ctx.counts?.openRfis ?? 0), accent: (Number(ctx.counts?.openRfis) || 0) > 0 ? '#FBBF24' : undefined, sub: 'awaiting answers' },
          {href: `/app/projects/${projectId}/punch-list`,  label: 'Open Punch', value: String(ctx.counts?.openPunch ?? 0), accent: (Number(ctx.counts?.openPunch) || 0) > 0 ? '#F87171' : undefined, sub: 'items to close' },
        ]} />
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon={<FileText size={19} weight="duotone" color={moduleAccent('time').hex} />} label="Total Entries" value={String(totalEntries)} accent={GOLD} sub="logged this period" delay={0.02}  href={`/app/projects/${projectId}/timesheets`}/>
        <StatCard icon={<Clock size={19} weight="duotone" color={moduleAccent('time').hex} />} label="Total Hours" value={`${totalHours.toFixed(1)}h`} accent={GOLD} sub="regular + overtime" delay={0.06}  href={`/app/projects/${projectId}/timesheets`}/>
        <StatCard icon={<Hourglass size={19} weight="duotone" color={ORANGE} />} label="Pending Approval" value={String(pendingCount)} accent={pendingCount > 0 ? ORANGE : undefined} sub="awaiting review" delay={0.10}  href={`/app/projects/${projectId}/timesheets`}/>
        <StatCard icon={<CheckCircle size={19} weight="duotone" color={GREEN} />} label="Approved" value={String(approvedCount)} accent={approvedCount > 0 ? GREEN : undefined} sub="this period" delay={0.14}  href={`/app/projects/${projectId}/timesheets`}/>
      </div>

      {/* Week filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([['current', 'Current Week'], ['last', 'Last Week'], ['all', 'All']] as [WeekFilter, string][]).map(([key, label]) => (
          <button key={key} className="pmBtn" style={weekFilter === key ? chipActive : chipInactive} onClick={() => setWeekFilter(key)}>{label}</button>
        ))}
      </div>

      {toast && (
        <div style={{ marginBottom: 16, padding: '11px 16px', background: 'rgba(52,199,89,0.12)', border: '1px solid rgba(52,199,89,0.3)', borderRadius: 10, color: GREEN, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Add Timesheet Entry" icon={<Plus size={17} weight="bold" color={GOLD} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 22, alignItems: 'start' }}>
            <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div>
                <label style={lbl}>Employee *</label>
                <Suggest type="text" value={form.employee} onChange={e => setForm(p => ({ ...p, employee: e.target.value }))} style={inp} placeholder="Crew member name" options={['n']} />
                {roster.length > 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.45 }}>{roster.length} crew name{roster.length === 1 ? '' : 's'} on file — start typing to pick.</div>}
              </div>
              <div>
                <label style={lbl}>Date<AutoChip /></label>
                <SaguaroDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} style={inp} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.45 }}>Defaulted to today — edit to backfill.</div>
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
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.45 }}>{ctx?.costCodes?.length ? 'Pulled from the project budget lines.' : 'Full CSI division list — budget lines give project-specific codes.'}</div>
              </div>
              <div>
                <label style={lbl}>Regular Hours{form.regular_hrs === 8 && <AutoChip />}</label>
                <input type="number" min={0} max={24} value={form.regular_hrs} onChange={e => setForm(p => ({ ...p, regular_hrs: Number(e.target.value) }))} style={inp} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.45 }}>Standard 8h day — hours past 8 belong in OT.</div>
              </div>
              <div>
                <label style={lbl}>OT Hours</label>
                <input type="number" min={0} max={24} value={form.ot_hrs} onChange={e => setForm(p => ({ ...p, ot_hrs: Number(e.target.value) }))} style={inp} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>Total: {(Number(form.regular_hrs) || 0) + (Number(form.ot_hrs) || 0)}h</span>
                {(Number(form.ot_hrs) || 0) > 0 && <span style={{ fontSize: 11, color: ORANGE, marginTop: 2 }}>{Number(form.ot_hrs) || 0}h overtime flagged</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={{ ...goldButtonStyle, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} className="pmBtn" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Entry'}</button>
              <button style={ghostButtonStyle} className="pmBtn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
            </div>
            {/* Context rail — the downstream automation this entry triggers */}
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 20 }}>
              <FlowSteps title="After you save" steps={[
                { title: 'Entry lands as pending', desc: 'It appears in the table below for review — nothing posts yet.' },
                { title: 'Approve in one click', desc: 'Approval stamps who approved and when on the entry.' },
                { title: 'Labor posts to job cost', desc: 'Approved labor becomes a cost entry and rolls into the budget line actuals for its division — automatically.' },
              ]} />
              {ctx && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <InsightRow label="Budget actuals" value={fmt(Number(ctx.budget?.actual) || 0)} />
                  <InsightRow label="Pending entries" value={String(pendingCount)} accent={pendingCount > 0 ? ORANGE : undefined} />
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
          <div style={{ textAlign: 'center', padding: 44, color: 'rgba(255,255,255,0.62)', fontSize: 13 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#FFFFFF' }}>
                <Clock size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                {entries.length === 0 ? 'No time entries yet' : 'No entries in this period'}
                <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.62)' }}>
                  {entries.length === 0
                    ? (showForm ? ' — log the first crew entry in the form above; the roster builds as you go.' : ' — log the first crew entry to start tracking labor.')
                    : ' — switch the week filter, or add one for this period.'}
                </span>
              </div>
              {!showForm && (
                <button style={goldButtonStyle} className="pmBtn" onClick={() => setShowForm(true)}><Plus size={15} weight="bold" /> Add Entry</button>
              )}
            </div>
            <FlowStrip steps={[
              { title: 'Log hours', desc: 'name, hours, cost code' },
              { title: 'Pending review', desc: 'lands in this table' },
              { title: 'Approve in one click' },
              { title: 'Labor posts to job cost', desc: 'budget actuals update' },
            ]} />
          </div>
        ) : (
          <Table
            headers={['Employee', 'Date', 'Regular Hrs', 'OT Hrs', 'Total Hrs', 'Classification', 'Status', 'Actions']}
            rows={filtered.map(e => [
              <span key="emp" style={{ fontWeight: 600 }}>{e.employee}</span>,
              <span key="dt" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{e.date}</span>,
              <span key="rh" style={{ color: T.white }}>{e.regular_hrs}</span>,
              <span key="oh" style={{ color: e.ot_hrs > 0 ? T.amber : T.muted }}>{e.ot_hrs}</span>,
              <span key="th" style={{ fontWeight: 700, color: T.gold }}>{(e.regular_hrs + e.ot_hrs).toFixed(1)}h</span>,
              <span key="cl" style={{ color: T.muted }}>{e.classification}</span>,
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
