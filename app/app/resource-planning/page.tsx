'use client';
import { StatusPill } from '@/components/ui/Status';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { TRADESPERSON_ROLES as ROLES } from '@/lib/contractor-trades';
import { tradeOptions } from '@/lib/taxonomy';
import { StandardSelect } from '@/components/ui/Select';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { UsersThree, ClipboardText, UserGear, Warning, Gauge, Scales, Plus, DownloadSimple, ArrowsClockwise, FunnelSimple, CurrencyDollar, Clock, TrendDown, UserMinus, CalendarBlank, Buildings } from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { localDay, toDay } from '@/lib/calendar-day';

const GOLD='var(--brand-primary)',BG = 'var(--bg-base)',RAISED = 'var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',TEXT='var(--text-primary)',DIM='var(--text-secondary)',GREEN='var(--success)',RED='var(--danger)',AMBER ='var(--warning)',BLUE='var(--brand-primary)',PURPLE='var(--warning)';

/* ===== TYPES ===== */
interface Assignment {
  id?: string;
  person_name: string;
  person_id?: string;
  role: string;
  trade: string;
  certifications: string[];
  start_date: string;
  end_date: string;
  hours_per_day: number;
  days_per_week: number;
  /** null when this role may not see pay rates (Budget or Admin view — the server decides). */
  hourly_rate: number | null;
  status: 'assigned' | 'tentative' | 'confirmed' | 'released' | 'unavailable';
  notes: string;
  project_id: string;
}
interface Project { id: string; name: string; status?: string; }

/* ===== CONSTANTS ===== */
// Trade options = canonical taxonomy (@/lib/taxonomy tradeOptions, CSI-division grouped); ROLES from @/lib/contractor-trades
const TRADE_OPTIONS = tradeOptions();
const CERTS = ['OSHA 10','OSHA 30','First Aid/CPR','Confined Space','Fall Protection','Crane Operator','Welding','CDL','Master Electrician','Master Plumber','EPA 608','Rigging','Scaffolding'];
const STATUS_COLORS: { [k: string]: string } = { assigned: BLUE, tentative: AMBER, confirmed: GREEN, released: DIM, unavailable: RED };
const STATUS_OPTS: Assignment['status'][] = ['assigned','tentative','confirmed','released','unavailable'];

type Tab = 'grid' | 'timeline' | 'people' | 'staffing' | 'utilization' | 'availability' | 'forecast' | 'costs';

/* ===== STYLE HELPERS ===== */
function btn(primary?: boolean): React.CSSProperties {
  return primary
    ? { padding: '8px 18px', background: `var(--brand-primary)`, border: 'none', borderRadius: 7, color: 'var(--on-brand)', fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'opacity .15s' }
    : { padding: '8px 18px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'opacity .15s' };
}
function inp(): React.CSSProperties {
  return { width: '100%', padding: '8px 12px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
}
function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 50%, transparent)`, color, whiteSpace: 'nowrap' }}>{String(label).replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())}</span>;
}
function Card({ title, children, action, icon }: { title: string; children: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return <SectionCard flat title={title} action={action} icon={icon} style={{ marginBottom: 18 }}>{children}</SectionCard>;
}
function Spinner() {
  return <div style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />;
}
/* minWidth 520 pushed the dialog off both sides of a 390px phone — Create
   Assignment started left of the screen edge. It now fits the viewport, and
   sits on the kit overlay layer, above the chat launcher (9999). */
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 'clamp(16px, 4vw, 28px)', width: 'min(720px, 100%)', maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>;
}

/* ===== UTILITY FUNCTIONS ===== */
function weeksBetween(a: string, b: string) { return Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / (7 * 864e5))); }
function daysBetween(a: string, b: string) { return Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 864e5)); }
/** 'YYYY-MM-DD' → M/D/YYYY, read as the calendar day it is (new Date(ymd) is UTC midnight — the evening before in the US). */
function fmtDate(d: string) { const day = toDay(d); if (!day) return ''; const [y, m, dd] = day.split('-').map(Number); return `${m}/${dd}/${y}`; }
function fmtMoney(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function mondayOf(d: Date) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); r.setHours(0, 0, 0, 0); return r; }
function addWeeks(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n * 7); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
/** The calendar day of a local Date on this device (toISOString is UTC — after 7 PM in Iowa it is already tomorrow). */
function isoDate(d: Date) { return localDay(d); }
/** Today on the user's calendar. */
function localToday() { return localDay(); }
function weeksRange(startWeek: Date, count: number) { return Array.from({ length: count }, (_, i) => addWeeks(startWeek, i)); }

/* ===== MAIN COMPONENT ===== */
export default function ResourcePlanningPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('grid');
  /* Pay rates and labor cost show only when the server says this role may see
     them (Budget or Admin view); otherwise the rate never leaves the server. */
  const [ratesVisible, setRatesVisible] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState('');
  const [filterTrade, setFilterTrade] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterAvail, setFilterAvail] = useState(false);
  const [filterCert, setFilterCert] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [form, setForm] = useState<Partial<Assignment>>({ status: 'assigned', hours_per_day: 8, days_per_week: 5, hourly_rate: 0, certifications: [], trade: 'General', role: 'Laborer' });
  /** Why Create Assignment refused, shown inside the dialog (the page banner sits under it). */
  const [formErr, setFormErr] = useState<{ text: string; field?: string } | null>(null);

  /* ── Unsaved-work guard: an assignment half-typed is real work, so leaving
   *    this module (sidebar, ⌘K, breadcrumb, back) confirms first and the
   *    draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: 'resource-planning',
    draftData: editId ? undefined : form,
    restoreDraft: (d) => { setForm(d as Partial<Assignment>); setEditId(null); setShowForm(true); },
    onSave: () => saveAssignment(),
  });
  const [reassignTarget, setReassignTarget] = useState<{ assignment: Assignment; show: boolean } | null>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  /* ---- Data loading ---- */
  const { projects: liveProjects } = useProjects();
  useEffect(() => { setProjects(liveProjects as any); }, [liveProjects]);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ra = await fetch('/api/projects/all/resource-planning');
      if (!ra.ok) { console.error('load assignments failed', ra.status); throw new Error('request failed'); }
      const da = await ra.json();
      setAssignments(Array.isArray(da) ? da : da.data ?? []);
      setRatesVisible(da?.ratesVisible === true);
    } catch (err: unknown) {
      console.error(err);
      setError(humanError(err, 'Failed to load resource planning. Please try again.'));
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const projMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach(p => m[p.id] = p.name);
    return m;
  }, [projects]);

  /* ---- Derived data ---- */
  const people = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    assignments.forEach(a => {
      const k = a.person_name || 'Unknown';
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assignments]);

  const allPersonNames = useMemo(() => [...new Set(assignments.map(a => a.person_name))].sort(), [assignments]);

  const filtered = useMemo(() => {
    let list = assignments;
    if (filterProject) list = list.filter(a => a.project_id === filterProject);
    if (filterTrade) list = list.filter(a => a.trade === filterTrade);
    if (filterRole) list = list.filter(a => a.role === filterRole);
    if (filterCert) list = list.filter(a => (a.certifications || []).includes(filterCert));
    if (filterPerson) list = list.filter(a => a.person_name.toLowerCase().includes(filterPerson.toLowerCase()));
    if (filterDateStart) list = list.filter(a => a.end_date >= filterDateStart);
    if (filterDateEnd) list = list.filter(a => a.start_date <= filterDateEnd);
    if (filterAvail) {
      const now = localToday();
      const busyNames = new Set(list.filter(a => a.start_date <= now && a.end_date >= now && a.status !== 'released').map(a => a.person_name));
      const allNames = new Set(assignments.map(a => a.person_name));
      const freeNames = [...allNames].filter(n => !busyNames.has(n));
      list = list.filter(a => freeNames.includes(a.person_name));
    }
    return list;
  }, [assignments, filterProject, filterTrade, filterRole, filterAvail, filterCert, filterPerson, filterDateStart, filterDateEnd]);

  const filteredPeople = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    filtered.forEach(a => {
      const k = a.person_name || 'Unknown';
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const conflicts = useMemo(() => {
    const issues: { person: string; a1: Assignment; a2: Assignment }[] = [];
    people.forEach(([name, asns]) => {
      for (let i = 0; i < asns.length; i++) {
        for (let j = i + 1; j < asns.length; j++) {
          const a = asns[i], b = asns[j];
          if (a.status === 'released' || b.status === 'released' || a.status === 'unavailable' || b.status === 'unavailable') continue;
          if (a.start_date <= b.end_date && b.start_date <= a.end_date && a.project_id !== b.project_id) {
            const totalHrs = a.hours_per_day * a.days_per_week / 5 + b.hours_per_day * b.days_per_week / 5;
            if (totalHrs > 10) issues.push({ person: name, a1: a, a2: b });
          }
        }
      }
    });
    return issues;
  }, [people]);

  const conflictPersons = useMemo(() => new Set(conflicts.map(c => c.person)), [conflicts]);

  /* ---- Timeline range ---- */
  const timelineStart = useMemo(() => {
    if (!assignments.length) return mondayOf(new Date());
    const earliest = assignments.reduce((m, a) => a.start_date < m ? a.start_date : m, assignments[0].start_date);
    return mondayOf(new Date(`${String(earliest).slice(0, 10)}T00:00:00`)); // local midnight of that day, not UTC's
  }, [assignments]);
  const TIMELINE_WEEKS = 20;
  const weeks = useMemo(() => weeksRange(timelineStart, TIMELINE_WEEKS), [timelineStart]);

  /* ---- Utilization ---- */
  const utilization = useMemo(() => {
    return people.map(([name, asns]) => {
      const now = new Date();
      const fourWeeksOut = addWeeks(now, 4);
      let totalHrs = 0;
      const availHrs = 4 * 5 * 8;
      asns.forEach(a => {
        if (a.status === 'released' || a.status === 'unavailable') return;
        const s = new Date(a.start_date), e = new Date(a.end_date);
        const overlapStart = s > now ? s : now;
        const overlapEnd = e < fourWeeksOut ? e : fourWeeksOut;
        if (overlapStart < overlapEnd) {
          const wks = Math.max(1, (overlapEnd.getTime() - overlapStart.getTime()) / (7 * 864e5));
          totalHrs += wks * a.days_per_week * a.hours_per_day;
        }
      });
      const pct = availHrs > 0 ? Math.round(totalHrs / availHrs * 100) : 0;
      return { name, pct, totalHrs, asns, trade: asns[0]?.trade || '', role: asns[0]?.role || '' };
    });
  }, [people]);

  /* ---- FTE calculation ---- */
  const totalFTEs = useMemo(() => {
    const now = isoDate(new Date());
    let totalWeeklyHrs = 0;
    assignments.forEach(a => {
      if (a.status === 'released' || a.status === 'unavailable') return;
      if (a.start_date <= now && a.end_date >= now) {
        totalWeeklyHrs += a.hours_per_day * a.days_per_week;
      }
    });
    return (totalWeeklyHrs / 40).toFixed(1);
  }, [assignments]);

  /* ---- Headcount forecast ---- */
  const forecast = useMemo(() => {
    const months: { label: string; count: number; cost: number; fte: number }[] = [];
    const now = new Date();
    for (let m = 0; m < 6; m++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
      const ms = isoDate(monthStart), me = isoDate(monthEnd);
      const active = new Set<string>();
      let cost = 0;
      let weeklyHrs = 0;
      assignments.forEach(a => {
        if (a.status === 'released' || a.status === 'unavailable') return;
        if (a.start_date <= me && a.end_date >= ms) {
          active.add(a.person_name);
          const overlapDays = daysBetween(a.start_date > ms ? a.start_date : ms, a.end_date < me ? a.end_date : me);
          const wks = overlapDays / 7;
          cost += wks * a.days_per_week * a.hours_per_day * (a.hourly_rate ?? 0);
          weeklyHrs += a.hours_per_day * a.days_per_week;
        }
      });
      months.push({ label: `${monthStart.toLocaleString('default', { month: 'short' })} ${monthStart.getFullYear()}`, count: active.size, cost, fte: parseFloat((weeklyHrs / 40).toFixed(1)) });
    }
    return months;
  }, [assignments]);

  /* ---- Cost per project ---- */
  const projectCosts = useMemo(() => {
    const map: Record<string, { labor: number; hours: number; people: Set<string> }> = {};
    assignments.forEach(a => {
      if (!map[a.project_id]) map[a.project_id] = { labor: 0, hours: 0, people: new Set() };
      const wks = weeksBetween(a.start_date, a.end_date);
      const hrs = wks * a.days_per_week * a.hours_per_day;
      map[a.project_id].hours += hrs;
      map[a.project_id].labor += hrs * (a.hourly_rate ?? 0);
      map[a.project_id].people.add(a.person_name);
    });
    return Object.entries(map).map(([pid, v]) => ({ project: projMap[pid] || pid, pid, ...v, headcount: v.people.size })).sort((a, b) => b.labor - a.labor);
  }, [assignments, projMap]);

  /* ---- Availability next 4 weeks ---- */
  const availability = useMemo(() => {
    return people.map(([name, asns]) => {
      const weekFree = [true, true, true, true];
      const weekHrs = [0, 0, 0, 0];
      asns.forEach(a => {
        if (a.status === 'released' || a.status === 'unavailable') return;
        for (let w = 0; w < 4; w++) {
          const ws = isoDate(addWeeks(new Date(), w)), we = isoDate(addWeeks(new Date(), w + 1));
          if (a.start_date <= we && a.end_date >= ws) {
            weekFree[w] = false;
            weekHrs[w] += a.hours_per_day * a.days_per_week;
          }
        }
      });
      return { name, weekFree, weekHrs, trade: asns[0]?.trade || '', role: asns[0]?.role || '' };
    });
  }, [people]);

  /* ---- Resource assignment grid data (people x projects x weeks) ---- */
  const gridData = useMemo(() => {
    const GRID_WEEKS = 8;
    const gridStart = mondayOf(new Date());
    const gridWeeks = weeksRange(gridStart, GRID_WEEKS);
    const projIds = [...new Set(filtered.map(a => a.project_id))];
    const rows = filteredPeople.map(([name, asns]) => {
      const cells: { projectId: string; projectName: string; weekHours: number[] }[] = [];
      projIds.forEach(pid => {
        const personProjAsns = asns.filter(a => a.project_id === pid);
        const weekHours = gridWeeks.map(w => {
          const ws = isoDate(w), we = isoDate(addDays(w, 6));
          let hrs = 0;
          personProjAsns.forEach(a => {
            if (a.status === 'released' || a.status === 'unavailable') return;
            if (a.start_date <= we && a.end_date >= ws) hrs += a.hours_per_day * a.days_per_week;
          });
          return hrs;
        });
        if (weekHours.some(h => h > 0)) {
          cells.push({ projectId: pid, projectName: projMap[pid] || pid, weekHours });
        }
      });
      const totalWeekHours = gridWeeks.map((_, wi) => cells.reduce((s, c) => s + c.weekHours[wi], 0));
      return { name, cells, totalWeekHours };
    });
    return { gridWeeks, rows, GRID_WEEKS };
  }, [filteredPeople, filtered, projMap]);

  /* ---- CRUD handlers ---- */
  const saveAssignment = async (): Promise<boolean> => {
    /* The refusal used to go to the page banner — underneath this dialog, so
       Create Assignment looked dead. Each missing field is now named in the
       dialog and the cursor goes to it (a date field opens its calendar). */
    const stop = (text: string, field: string) => {
      setFormErr({ text, field });
      window.setTimeout(() => document.getElementById(field)?.focus(), 0);
      return false;
    };
    if (!String(form.person_name || '').trim()) return stop('Enter the person’s name.', 'rp-person');
    if (!form.project_id) return stop('Pick the project they are assigned to.', 'rp-project');
    if (!form.start_date) return stop('Pick a Start Date.', 'rp-start');
    if (!form.end_date) return stop('Pick an End Date.', 'rp-end');
    if (form.end_date < form.start_date) return stop('End Date must be on or after the Start Date.', 'rp-end');
    setFormErr(null);
    setSaving(true);
    setError(null);
    try {
      const endpoint = editId
        ? `/api/projects/all/resource-planning/${editId}`
        : '/api/projects/all/resource-planning';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.error('save assignment failed', res.status, j?.error);
        throw new Error(j?.error || 'save failed');
      }
      setShowForm(false);
      setEditId(null);
      setForm({ status: 'assigned', hours_per_day: 8, days_per_week: 5, hourly_rate: 0, certifications: [], trade: 'General', role: 'Laborer' });
      await load();
      guard.clearDraft();
      return true;
    } catch (err: unknown) {
      console.error(err);
      setFormErr({ text: humanError(err, 'Failed to save the assignment. Please try again.') });
    } finally {
      setSaving(false);
    }
    return false;
  };

  const deleteAssignment = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/all/resource-planning/${id}`, { method: 'DELETE' });
      if (!res.ok) { console.error('delete assignment failed', res.status); throw new Error('delete failed'); }
      setShowDeleteConfirm(null);
      await load();
    } catch (err: unknown) {
      console.error(err);
      setError(humanError(err, 'Failed to delete the assignment. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const editAssignment = (a: Assignment) => {
    setFormErr(null);
    setForm({ ...a });
    setEditId(a.id || null);
    setShowForm(true);
  };

  const moveAssignment = async (a: Assignment, newProjectId: string) => {
    if (!a.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/all/resource-planning/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: newProjectId }),
      });
      if (!res.ok) { console.error('reassign failed', res.status); throw new Error('reassign failed'); }
      setReassignTarget(null);
      await load();
    } catch (err: unknown) {
      console.error(err);
      setError(humanError(err, 'Failed to reassign. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  /* ---- Export ---- */
  const exportCSV = () => {
    const header = `Person,Role,Trade,Project,Start,End,Hrs/Day,Days/Wk,${ratesVisible ? 'Rate,' : ''}Status,Certifications,Notes\n`;
    const rows = filtered.map(a => [a.person_name, a.role, a.trade, projMap[a.project_id] || a.project_id, a.start_date, a.end_date, a.hours_per_day, a.days_per_week, ...(ratesVisible ? [a.hourly_rate ?? 0] : []), a.status, (a.certifications || []).join(';'), `"${(a.notes || '').replace(/"/g, '""')}"`].join(',')).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'staffing-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ---- Cert toggle ---- */
  const toggleCert = (c: string) => {
    const cur = form.certifications || [];
    setForm({ ...form, certifications: cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c] });
  };

  /* ---- Clear filters ---- */
  const clearFilters = () => {
    setFilterProject('');
    setFilterTrade('');
    setFilterRole('');
    setFilterAvail(false);
    setFilterCert('');
    setFilterPerson('');
    setFilterDateStart('');
    setFilterDateEnd('');
  };
  const hasFilters = !!(filterProject || filterTrade || filterRole || filterAvail || filterCert || filterPerson || filterDateStart || filterDateEnd);

  /* ---- Chart helpers ---- */
  const maxForecast = Math.max(1, ...forecast.map(f => f.count));
  const maxCost = Math.max(1, ...projectCosts.map(p => p.labor));

  const avgUtil = utilization.length ? Math.round(utilization.reduce((s, u) => s + u.pct, 0) / utilization.length) : 0;
  const overbookedCount = utilization.filter(u => u.pct > 100).length;
  const availableCount = availability.filter(a => a.weekFree[0]).length;

  /* ======== RENDER ======== */
  return <PremiumSurface>
    {/* Inline keyframes for spinner */}
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

    {/* Header */}
    <ModuleHero
      eyebrow="Resource Planning"
      eyebrowIcon={<UsersThree size={13} weight="fill" color="var(--text-secondary)" />}
      title="Resource"
      accent="Planning"
      subtitle="Workforce scheduling, utilization, capacity planning, and cost forecasting"
      actions={<>
        {saving && <Spinner />}
        <button onClick={exportCSV} style={ghostButtonStyle} className="pmBtn"><DownloadSimple size={15} weight="bold" /> Export CSV</button>
        <button onClick={() => { load(); }} style={ghostButtonStyle} className="pmBtn"><ArrowsClockwise size={15} weight="bold" /> Refresh</button>
        <button onClick={() => { setEditId(null); setFormErr(null); setForm({ status: 'assigned', hours_per_day: 8, days_per_week: 5, hourly_rate: 0, certifications: [], trade: 'General', role: 'Laborer', start_date: localToday() }); setShowForm(true); }} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> New Assignment</button>
      </>}
    />

    {/* Error banner */}
    {error && <div style={{ margin: '0 0 16px', padding: '12px 18px', background: `color-mix(in srgb, ${RED} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${RED} 25%, transparent)`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{error}</div>
      <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>x</button>
    </div>}

    {/* Conflict banner */}
    {conflicts.length > 0 && <div style={{ margin: '0 0 16px', padding: '12px 18px', background: `color-mix(in srgb, ${RED} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${RED} 25%, transparent)`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 20, fontWeight: 900, color: RED, lineHeight: 1 }}>!</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: RED }}>Scheduling Conflicts Detected ({conflicts.length})</div>
        <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{conflicts.slice(0, 5).map(c => `${c.person}: ${projMap[c.a1.project_id] || '?'} vs ${projMap[c.a2.project_id] || '?'}`).join(' | ')}{conflicts.length > 5 ? ` ...and ${conflicts.length - 5} more` : ''}</div>
      </div>
    </div>}

    {/* Stats row */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
      {[
        { label: 'Total People', value: people.length, accent: BLUE, sub: 'In workforce', icon: <UsersThree size={19} weight="duotone" color="var(--text-secondary)" /> },
        { label: 'Active Assignments', value: assignments.filter(a => a.status !== 'released' && a.status !== 'unavailable').length, accent: GREEN, sub: 'Not released', icon: <ClipboardText size={19} weight="duotone" color={GREEN} /> },
        { label: 'Current FTEs', value: totalFTEs, accent: PURPLE, sub: 'Full-time equiv', icon: <UserGear size={19} weight="duotone" color={PURPLE} /> },
        { label: 'Conflicts', value: conflicts.length, accent: conflicts.length ? RED : GREEN, sub: 'Scheduling overlaps', icon: <Warning size={19} weight="duotone" color={conflicts.length ? RED : GREEN} /> },
        { label: 'Avg Utilization', value: avgUtil + '%', accent: avgUtil > 100 ? RED : avgUtil > 80 ? AMBER : GREEN, sub: 'Next 4 weeks', icon: <Gauge size={19} weight="duotone" color={avgUtil > 100 ? RED : avgUtil > 80 ? AMBER : GREEN} /> },
        { label: 'Overbooked / Available', value: `${overbookedCount} / ${availableCount}`, accent: overbookedCount > 0 ? RED : GREEN, sub: 'This week', icon: <Scales size={19} weight="duotone" color={overbookedCount > 0 ? RED : GREEN} /> },
      ].map((s, i) => <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} accent={s.accent} icon={s.icon} delay={0.04 * i}  href="/app/resource-planning"/>)}
    </div>

    {/* Filters */}
    <SectionCard
      title="Filters"
      icon={<FunnelSimple size={17} weight="duotone" color="var(--text-secondary)" />}
      action={hasFilters ? <button onClick={clearFilters} style={{ ...btn(), fontSize: 12, padding: '5px 12px' }}>Clear Filters</button> : undefined}
      style={{ marginBottom: 18 }}
    >
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <input value={filterPerson} onChange={e => setFilterPerson(e.target.value)} placeholder="Search person…" style={{ ...inp(), width: 160 }} />
      <StandardSelect value={filterProject} onChange={setFilterProject} ariaLabel="Project" placeholder="All Projects" width={180}
        options={projects.map(p => ({ value: p.id, label: p.name }))} />
      <StandardSelect value={filterTrade} onChange={setFilterTrade} ariaLabel="Trade" placeholder="All Trades" width={170}
        options={TRADE_OPTIONS} />
      <StandardSelect value={filterRole} onChange={setFilterRole} ariaLabel="Role" placeholder="All Roles" width={160}
        options={ROLES} />
      <StandardSelect value={filterCert} onChange={setFilterCert} ariaLabel="Certification" placeholder="All Certifications" width={170}
        options={CERTS} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 12, color: DIM }}>From:</span>
        <SaguaroDatePicker value={filterDateStart} onChange={v => setFilterDateStart(v)} style={{ ...inp(), width: 140 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 12, color: DIM }}>To:</span>
        <SaguaroDatePicker value={filterDateEnd} onChange={v => setFilterDateEnd(v)} style={{ ...inp(), width: 140 }} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: DIM, cursor: 'pointer' }}>
        <input type="checkbox" checked={filterAvail} onChange={e => setFilterAvail(e.target.checked)} style={{ accentColor: GOLD }} /> Available Only
      </label>
    </div>
    </SectionCard>

    {/* Tabs */}
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}`, overflowX: 'auto', marginBottom: 20 }}>
      {([['grid', 'Assignment Grid'], ['timeline', 'Timeline / Gantt'], ['people', 'People'], ['staffing', 'Project Staffing'], ['utilization', 'Utilization'], ['availability', 'Availability'], ['forecast', 'Headcount Forecast'], ['costs', 'Labor Costs']] as [Tab, string][]).filter(([k]) => ratesVisible || k !== 'costs').map(([k, l]) =>
        <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 18px', border: 'none', borderBottom: tab === k ? `2px solid ${GOLD}` : '2px solid transparent', background: 'transparent', color: tab === k ? GOLD : DIM, fontSize: 13, fontWeight: tab === k ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>
      )}
    </div>

    {/* Main content */}
    <div>
      {loading && <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
        <Spinner /><div style={{ marginTop: 12 }}>Loading resource data…</div>
      </div>}

      {/* ========== ASSIGNMENT FORM MODAL ========== */}
      {showForm && <ModalOverlay onClose={() => { setShowForm(false); setEditId(null); }}>
        <div className="k-dialog-title" style={{ marginBottom: 20 }}>{editId ? 'Edit Assignment' : 'New Assignment'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
          <div>
            <label htmlFor="rp-person" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Person Name *</label>
            {/* Suggestions are the people already on the board (it offered a lone "n" — a datalist id). */}
            <Suggest id="rp-person" value={form.person_name || ''} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, person_name: v })); setFormErr(null); }} placeholder="Full name" style={inp()} options={allPersonNames.filter(Boolean)} aria-required="true" aria-invalid={formErr?.field === 'rp-person' || undefined} />
            </div>
          <div>
            <label htmlFor="rp-project" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Project *</label>
            <StandardSelect id="rp-project" value={form.project_id || ''} onChange={v => { setForm(f => ({ ...f, project_id: v })); setFormErr(null); }} ariaLabel="Project" placeholder="Select project…" width="100%"
              options={projects.map(p => ({ value: p.id, label: p.name }))} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Role</label>
            <StandardSelect value={form.role || ''} onChange={v => setForm({ ...form, role: v })} ariaLabel="Role" width="100%" options={ROLES} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Trade</label>
            <StandardSelect value={form.trade || ''} onChange={v => setForm({ ...form, trade: v })} ariaLabel="Trade" width="100%" options={TRADE_OPTIONS} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 14 }}>
          <div>
            <label htmlFor="rp-start" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Start Date *</label>
            <SaguaroDatePicker id="rp-start" value={form.start_date || ''} onChange={v => { setForm(f => ({ ...f, start_date: v })); setFormErr(null); }} style={inp()} />
          </div>
          <div>
            <label htmlFor="rp-end" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>End Date *</label>
            <SaguaroDatePicker id="rp-end" value={form.end_date || ''} onChange={v => { setForm(f => ({ ...f, end_date: v })); setFormErr(null); }} style={inp()} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Status</label>
            <StandardSelect value={form.status || 'assigned'} onChange={v => setForm({ ...form, status: v as Assignment['status'] })} ariaLabel="Status" width="100%" options={STATUS_OPTS.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Hours/Day</label>
            <input type="number" value={form.hours_per_day ?? 8} onChange={e => setForm({ ...form, hours_per_day: +e.target.value })} style={inp()} min={1} max={16} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Days/Week</label>
            <input type="number" value={form.days_per_week ?? 5} onChange={e => setForm({ ...form, days_per_week: +e.target.value })} style={inp()} min={1} max={7} />
          </div>
          {ratesVisible && <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Hourly Rate ($)</label>
            <input type="number" value={form.hourly_rate ?? 0} onChange={e => setForm({ ...form, hourly_rate: +e.target.value })} style={inp()} min={0} step={0.5} />
          </div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Certifications</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CERTS.map(c => <button key={c} onClick={() => toggleCert(c)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 5, border: `1px solid ${(form.certifications || []).includes(c) ? GOLD : BORDER}`, background: (form.certifications || []).includes(c) ? `color-mix(in srgb, ${GOLD} 13%, transparent)` : 'transparent', color: (form.certifications || []).includes(c) ? GOLD : DIM, cursor: 'pointer', fontWeight: 600 }}>{c}</button>)}
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 5 }}>Notes</label>
          <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inp(), resize: 'vertical' as const }} />
        </div>
        {formErr && <div role="alert" style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: `color-mix(in srgb, ${RED} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${RED} 45%, transparent)`, color: RED, fontSize: 13, lineHeight: 1.5 }}>{formErr.text}</div>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={saveAssignment} disabled={saving} style={{ ...btn(true), minHeight: 44, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : editId ? 'Update Assignment' : 'Create Assignment'}</button>
          <button onClick={() => { setShowForm(false); setEditId(null); setFormErr(null); }} style={{ ...btn(), minHeight: 44 }}>Cancel</button>
        </div>
      </ModalOverlay>}

      {/* ========== DELETE CONFIRMATION MODAL ========== */}
      {showDeleteConfirm && <ModalOverlay onClose={() => setShowDeleteConfirm(null)}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12, color: RED, fontWeight: 900 }}>!</div>
          <div className="k-dialog-title" style={{ marginBottom: 8 }}>Delete Assignment?</div>
          <div style={{ fontSize: 13, color: DIM, marginBottom: 24 }}>This action cannot be undone. The assignment will be permanently removed.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => deleteAssignment(showDeleteConfirm)} disabled={saving} style={{ ...btn(), borderColor: RED, color: RED, opacity: saving ? 0.6 : 1 }}>{saving ? 'Deleting…' : 'Delete'}</button>
            <button onClick={() => setShowDeleteConfirm(null)} style={btn()}>Cancel</button>
          </div>
        </div>
      </ModalOverlay>}

      {/* ========== REASSIGN MODAL ========== */}
      {reassignTarget?.show && <ModalOverlay onClose={() => setReassignTarget(null)}>
        <div className="k-dialog-title" style={{ marginBottom: 8 }}>Reassign Resource</div>
        <div style={{ fontSize: 13, color: DIM, marginBottom: 16 }}>
          Move <strong style={{ color: TEXT }}>{reassignTarget.assignment.person_name}</strong> from <strong style={{ color: AMBER }}>{projMap[reassignTarget.assignment.project_id] || '?'}</strong> to a different project.
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {projects.filter(p => p.id !== reassignTarget.assignment.project_id).map(p =>
            <button key={p.id} onClick={() => moveAssignment(reassignTarget.assignment, p.id)} disabled={saving} style={{ ...btn(), textAlign: 'left', opacity: saving ? 0.6 : 1 }}>
              {p.name}
            </button>
          )}
        </div>
        <button onClick={() => setReassignTarget(null)} style={{ ...btn(), marginTop: 14 }}>Cancel</button>
      </ModalOverlay>}

      {/* ========== ASSIGNMENT GRID (People x Projects x Weeks) ========== */}
      {!loading && tab === 'grid' && <Card title={`Resource Assignment Grid (${gridData.GRID_WEEKS} Weeks)`} icon={<ClipboardText size={17} weight="duotone" color="var(--text-secondary)" />} action={<span style={{ fontSize: 12, color: DIM }}>{filteredPeople.length} people shown</span>}>
        <div ref={gridScrollRef} style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1000 }}>
            {/* Headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `160px 140px repeat(${gridData.GRID_WEEKS}, 1fr)`, borderBottom: `1px solid ${BORDER}`, marginBottom: 6 }}>
              <div style={{ padding: '6px 8px', fontSize: 12, fontWeight: 700, color: DIM }}>Person</div>
              <div style={{ padding: '6px 8px', fontSize: 12, fontWeight: 700, color: DIM }}>Project</div>
              {gridData.gridWeeks.map((w, i) => <div key={i} style={{ padding: '6px 4px', fontSize: 12, fontWeight: 600, color: DIM, textAlign: 'center', borderLeft: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                Wk {`${w.getMonth() + 1}/${w.getDate()}`}
              </div>)}
            </div>
            {/* Rows */}
            {gridData.rows.length === 0 && <PremiumEmpty compact icon={<UsersThree size={30} weight="duotone" color="var(--text-secondary)" />} title="No assignment data" description="Create assignments to populate the grid." />}
            {gridData.rows.map(row => <React.Fragment key={row.name}>
              {/* Person total row */}
              <div style={{ display: 'grid', gridTemplateColumns: `160px 140px repeat(${gridData.GRID_WEEKS}, 1fr)`, background: conflictPersons.has(row.name) ? `color-mix(in srgb, ${RED} 3%, transparent)` : `color-mix(in srgb, ${BG} 38%, transparent)`, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)`, minHeight: 32, alignItems: 'center' }}>
                <div style={{ padding: '4px 8px', fontSize: 12, fontWeight: 700, color: conflictPersons.has(row.name) ? RED : TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.name} {conflictPersons.has(row.name) && <span style={{ fontSize: 12, color: RED, fontWeight: 800 }}>Conflict</span>}
                </div>
                <div style={{ padding: '4px 8px', fontSize: 12, color: DIM, fontWeight: 600 }}>Total Hrs/Wk</div>
                {row.totalWeekHours.map((h, wi) => {
                  const pct = h / 40 * 100;
                  const bg = h === 0 ? 'transparent' : pct > 100 ? `color-mix(in srgb, ${RED} 19%, transparent)` : pct > 80 ? `color-mix(in srgb, ${AMBER} 13%, transparent)` : `color-mix(in srgb, ${GREEN} 8%, transparent)`;
                  const color = h === 0 ? `color-mix(in srgb, ${DIM} 38%, transparent)` : pct > 100 ? RED : pct > 80 ? AMBER : GREEN;
                  return <div key={wi} style={{ padding: '4px', textAlign: 'center', fontSize: 12, fontWeight: 700, color, background: bg, borderLeft: `1px solid color-mix(in srgb, ${BORDER} 6%, transparent)`, borderRadius: 2 }}>
                    {h > 0 ? `${h}h` : '-'}
                  </div>;
                })}
              </div>
              {/* Per-project breakdown */}
              {row.cells.map(cell => <div key={cell.projectId} style={{ display: 'grid', gridTemplateColumns: `160px 140px repeat(${gridData.GRID_WEEKS}, 1fr)`, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 3%, transparent)`, minHeight: 26, alignItems: 'center' }}>
                <div />
                <div style={{ padding: '2px 8px', fontSize: 12, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.projectName}</div>
                {cell.weekHours.map((h, wi) => <div key={wi} style={{ padding: '2px 4px', textAlign: 'center', fontSize: 12, color: h > 0 ? BLUE : `color-mix(in srgb, ${DIM} 25%, transparent)`, borderLeft: `1px solid color-mix(in srgb, ${BORDER} 3%, transparent)` }}>
                  {h > 0 ? `${h}h` : '-'}
                </div>)}
              </div>)}
            </React.Fragment>)}
          </div>
        </div>
      </Card>}

      {/* ========== TIMELINE / GANTT ========== */}
      {!loading && tab === 'timeline' && <Card title={`Timeline View (${TIMELINE_WEEKS} Weeks)`} icon={<CalendarBlank size={17} weight="duotone" color="var(--text-secondary)" />} action={<span style={{ fontSize: 12, color: DIM }}>Starting {fmtDate(isoDate(timelineStart))}</span>}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1100 }}>
            {/* Week headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${TIMELINE_WEEKS},1fr)`, borderBottom: `1px solid ${BORDER}`, marginBottom: 8 }}>
              <div style={{ padding: '6px 8px', fontSize: 12, fontWeight: 700, color: DIM }}>Person</div>
              {weeks.map((w, i) => {
                const isCurrentWeek = isoDate(w) <= isoDate(new Date()) && isoDate(addDays(w, 6)) >= isoDate(new Date());
                return <div key={i} style={{ padding: '6px 4px', fontSize: 12, fontWeight: 600, color: isCurrentWeek ? GOLD : DIM, textAlign: 'center', borderLeft: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)`, background: isCurrentWeek ? `color-mix(in srgb, ${GOLD} 3%, transparent)` : 'transparent' }}>
                  {`${w.getMonth() + 1}/${w.getDate()}`}
                </div>;
              })}
            </div>
            {/* Rows */}
            {filteredPeople.length === 0 && <PremiumEmpty compact icon={<CalendarBlank size={30} weight="duotone" color="var(--text-secondary)" />} title="No assignments match filters" description="Adjust filters or create new assignments." />}
            {filteredPeople.map(([name, asns]) => {
              const isConflict = conflictPersons.has(name);
              return <div key={name} style={{ display: 'grid', gridTemplateColumns: `180px repeat(${TIMELINE_WEEKS},1fr)`, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)`, minHeight: 36, alignItems: 'center', background: isConflict ? `color-mix(in srgb, ${RED} 3%, transparent)` : 'transparent' }}>
                <div style={{ padding: '4px 8px', fontSize: 12, fontWeight: 600, color: isConflict ? RED : TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${name} (${asns[0]?.trade} — ${asns[0]?.role})`}>
                  {name} {isConflict && <span style={{ fontSize: 12, color: RED, fontWeight: 800 }}>Conflict</span>}
                </div>
                {weeks.map((w, wi) => {
                  const wStart = isoDate(w);
                  const wEnd = isoDate(addDays(w, 6));
                  const isCurrentWeek = wStart <= isoDate(new Date()) && wEnd >= isoDate(new Date());
                  const active = asns.filter(a => a.start_date <= wEnd && a.end_date >= wStart && a.status !== 'released');
                  return <div key={wi} style={{ borderLeft: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)`, height: '100%', padding: '2px 1px', display: 'flex', flexDirection: 'column', gap: 1, background: isCurrentWeek ? `color-mix(in srgb, ${GOLD} 2%, transparent)` : 'transparent' }}>
                    {active.map((a, ai) => <div key={ai} title={`${projMap[a.project_id] || '?'} (${a.role}) — ${a.hours_per_day}h/day`} onClick={() => editAssignment(a)} style={{ height: active.length > 1 ? 10 : 20, borderRadius: 3, background: STATUS_COLORS[a.status] || BLUE, opacity: .85, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', whiteSpace: 'nowrap', padding: '0 3px', lineHeight: active.length > 1 ? '10px' : '20px', fontWeight: 700, cursor: 'pointer' }}>
                      {active.length <= 2 ? (projMap[a.project_id] || '').slice(0, 12) : ''}
                    </div>)}
                  </div>;
                })}
              </div>;
            })}
          </div>
        </div>
        {/* Legend */}
        <div style={{ marginTop: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {STATUS_OPTS.filter(s => s !== 'released').map(s => <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, borderRadius: 3, background: STATUS_COLORS[s] }} />
            <span style={{ fontSize: 12, color: DIM, textTransform: 'capitalize' }}>{s}</span>
          </div>)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, borderRadius: 3, background: `color-mix(in srgb, ${RED} 19%, transparent)`, border: `1px solid color-mix(in srgb, ${RED} 31%, transparent)` }} />
            <span style={{ fontSize: 12, color: DIM }}>Conflict</span>
          </div>
        </div>
      </Card>}

      {/* ========== PEOPLE LIST ========== */}
      {!loading && tab === 'people' && <Card title={`People & Assignments (${filteredPeople.length})`} icon={<UsersThree size={17} weight="duotone" color="var(--text-secondary)" />}>
        {filteredPeople.length === 0 && <PremiumEmpty compact icon={<UsersThree size={30} weight="duotone" color="var(--text-secondary)" />} title="No people found" description="No people match the current filters." />}
        {filteredPeople.map(([name, asns]) => {
          const util = utilization.find(u => u.name === name);
          const isConflict = conflictPersons.has(name);
          return <div key={name} style={{ background: `color-mix(in srgb, ${BG} 50%, transparent)`, border: `1px solid ${isConflict ? RED : BORDER}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},#FBBF24)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--surface-raised)' }}>{name.charAt(0)}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{name}</div>
                  <div style={{ fontSize: 12, color: DIM }}>{asns[0]?.trade} - {asns[0]?.role}</div>
                </div>
                {isConflict && <Badge label="Conflict" color={RED} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: DIM }}>Utilization (4wk)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: util && util.pct > 100 ? RED : util && util.pct > 80 ? AMBER : GREEN }}>{util?.pct || 0}%</div>
                </div>
                <div style={{ width: 60, height: 8, borderRadius: 4, background: `color-mix(in srgb, ${BORDER} 31%, transparent)`, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, util?.pct || 0)}%`, height: '100%', borderRadius: 4, background: util && util.pct > 100 ? RED : util && util.pct > 80 ? AMBER : GREEN }} />
                </div>
              </div>
            </div>
            {/* Certs */}
            {asns[0]?.certifications?.length > 0 && <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              {asns[0].certifications.map(c => <span key={c} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: `color-mix(in srgb, ${PURPLE} 9%, transparent)`, color: PURPLE, fontWeight: 600 }}>{c}</span>)}
            </div>}
            {/* Assignment rows */}
            <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Project', 'Dates', 'Hrs/Day', ...(ratesVisible ? ['Rate'] : []), 'Status', 'Actions'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: DIM, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 19%, transparent)` }}>{h}</th>)}</tr></thead>
              <tbody>{asns.map(a => <tr key={a.id || a.project_id + a.start_date}>
                <td style={{ padding: '6px 8px', color: TEXT, fontWeight: 600 }}>{projMap[a.project_id] || a.project_id}</td>
                <td style={{ padding: '6px 8px', color: DIM }}>{fmtDate(a.start_date)} – {fmtDate(a.end_date)}</td>
                <td style={{ padding: '6px 8px', color: DIM }}>{a.hours_per_day}h x {a.days_per_week}d</td>
                {ratesVisible && <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>{fmtMoney(a.hourly_rate ?? 0)}/hr</td>}
                <td style={{ padding: '6px 8px' }}><StatusPill module="resource_assignments" status={a.status} size="sm" /></td>
                <td style={{ padding: '6px 8px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => editAssignment(a)} style={{ ...btn(), padding: '3px 8px', fontSize: 12 }}>Edit</button>
                    <button onClick={() => setReassignTarget({ assignment: a, show: true })} style={{ ...btn(), padding: '3px 8px', fontSize: 12, borderColor: `color-mix(in srgb, ${PURPLE} 31%, transparent)`, color: PURPLE }}>Move</button>
                    <button onClick={() => a.id && setShowDeleteConfirm(a.id)} style={{ ...btn(), padding: '3px 8px', fontSize: 12, borderColor: `color-mix(in srgb, ${RED} 31%, transparent)`, color: RED }}>Delete</button>
                  </div>
                </td>
              </tr>)}</tbody>
            </table>
          </div>;
        })}
      </Card>}

      {/* ========== PROJECT STAFFING ========== */}
      {!loading && tab === 'staffing' && <div>
        {projects.length === 0 && <Card title="Project Staffing" icon={<Buildings size={17} weight="duotone" color="var(--text-secondary)" />}><PremiumEmpty compact icon={<Buildings size={30} weight="duotone" color="var(--text-secondary)" />} title="No projects found" description="Create a project to staff it here." /></Card>}
        {projects.map(proj => {
          const projAsns = filtered.filter(a => a.project_id === proj.id);
          if (filterProject && filterProject !== proj.id) return null;
          if (!filterProject && projAsns.length === 0) return null;
          return <Card key={proj.id} title={proj.name} icon={<Buildings size={17} weight="duotone" color="var(--text-secondary)" />} action={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: DIM }}>{projAsns.length} assignment{projAsns.length !== 1 ? 's' : ''}</span>
            <Badge label={proj.status || 'active'} color={GREEN} />
          </div>}>
            {projAsns.length === 0 ? <div style={{ padding: 16, textAlign: 'center', color: DIM, fontSize: 13 }}>No assignments for this project.</div>
              : <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Person', 'Role', 'Trade', 'Dates', 'Hours', ...(ratesVisible ? ['Rate'] : []), 'Status', 'Reassign', 'Actions'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: DIM, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 19%, transparent)` }}>{h}</th>)}</tr></thead>
                <tbody>{projAsns.map(a => <tr key={a.id || a.person_name + a.start_date} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)`, background: conflictPersons.has(a.person_name) ? `color-mix(in srgb, ${RED} 2%, transparent)` : 'transparent' }}>
                  <td style={{ padding: '6px 8px', color: conflictPersons.has(a.person_name) ? RED : TEXT, fontWeight: 600 }}>
                    {a.person_name}
                    {conflictPersons.has(a.person_name) && <span style={{ fontSize: 12, marginLeft: 4, color: RED }}>!</span>}
                  </td>
                  <td style={{ padding: '6px 8px', color: DIM }}>{a.role}</td>
                  <td style={{ padding: '6px 8px', color: DIM }}>{a.trade}</td>
                  <td style={{ padding: '6px 8px', color: DIM }}>{fmtDate(a.start_date)} – {fmtDate(a.end_date)}</td>
                  <td style={{ padding: '6px 8px', color: DIM }}>{a.hours_per_day}h/{a.days_per_week}d</td>
                  {ratesVisible && <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>{fmtMoney(a.hourly_rate ?? 0)}</td>}
                  <td style={{ padding: '6px 8px' }}><StatusPill module="resource_assignments" status={a.status} size="sm" /></td>
                  <td style={{ padding: '6px 8px' }}>
                    <button onClick={() => setReassignTarget({ assignment: a, show: true })} style={{ ...btn(), padding: '3px 8px', fontSize: 12 }}>Move</button>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => editAssignment(a)} style={{ ...btn(), padding: '3px 8px', fontSize: 12 }}>Edit</button>
                      <button onClick={() => a.id && setShowDeleteConfirm(a.id)} style={{ ...btn(), padding: '3px 8px', fontSize: 12, borderColor: `color-mix(in srgb, ${RED} 31%, transparent)`, color: RED }}>Delete</button>
                    </div>
                  </td>
                </tr>)}</tbody>
              </table>}
          </Card>;
        })}
      </div>}

      {/* ========== UTILIZATION DASHBOARD ========== */}
      {!loading && tab === 'utilization' && <div>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
          <StatCard label="Avg Utilization" value={`${avgUtil}%`} accent={avgUtil > 100 ? RED : avgUtil > 80 ? AMBER : GREEN} icon={<Gauge size={19} weight="duotone" color={avgUtil > 100 ? RED : avgUtil > 80 ? AMBER : GREEN} />}  href="/app/resource-planning"/>
          <StatCard label="Overbooked (100%+)" value={overbookedCount} accent={overbookedCount > 0 ? RED : GREEN} icon={<Warning size={19} weight="duotone" color={overbookedCount > 0 ? RED : GREEN} />}  href="/app/resource-planning"/>
          <StatCard label="Under-Utilized (<50%)" value={utilization.filter(u => u.pct < 50 && u.pct > 0).length} accent={BLUE} icon={<TrendDown size={19} weight="duotone" color="var(--text-secondary)" />}  href="/app/resource-planning"/>
          <StatCard label="Unassigned" value={utilization.filter(u => u.pct === 0).length} accent={DIM} icon={<UserMinus size={19} weight="duotone" color={DIM} />}  href="/app/resource-planning"/>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {/* Utilization chart */}
          <Card title="Utilization by Person (Next 4 Weeks)" icon={<Gauge size={17} weight="duotone" color="var(--text-secondary)" />}>
            {utilization.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: DIM }}>No data.</div>}
            {[...utilization].sort((a, b) => b.pct - a.pct).map(u => {
              const color = u.pct > 100 ? RED : u.pct > 80 ? AMBER : u.pct > 50 ? GREEN : BLUE;
              return <div key={u.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: TEXT, fontWeight: 600 }}>{u.name} <span style={{ fontSize: 12, color: DIM }}>({u.trade})</span></span>
                  <span style={{ color, fontWeight: 700 }}>{u.pct}%</span>
                </div>
                <div style={{ width: '100%', height: 14, borderRadius: 4, background: `color-mix(in srgb, ${BORDER} 25%, transparent)`, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: `${Math.min(150, u.pct) / 150 * 100}%`, height: '100%', borderRadius: 4, background: color, transition: 'width .3s' }} />
                  {u.pct > 100 && <div style={{ position: 'absolute', left: '66.7%', top: 0, bottom: 0, width: 2, background: RED, opacity: .7 }} />}
                </div>
              </div>;
            })}
          </Card>
          {/* Heatmap */}
          <Card title="Weekly Heatmap (Hours)" icon={<Gauge size={17} weight="duotone" color="var(--text-secondary)" />}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(4,1fr)', gap: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: DIM }}>Person</div>
              {[0, 1, 2, 3].map(w => <div key={w} style={{ fontSize: 12, fontWeight: 700, color: DIM, textAlign: 'center' }}>Wk {w + 1}</div>)}
              {people.map(([name, asns]) => {
                return <React.Fragment key={name}>
                  <div style={{ fontSize: 12, color: TEXT, fontWeight: 600, padding: '3px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
                  {[0, 1, 2, 3].map(w => {
                    const ws = isoDate(addWeeks(new Date(), w)), we = isoDate(addWeeks(new Date(), w + 1));
                    let hrs = 0;
                    asns.forEach(a => { if (a.status !== 'released' && a.status !== 'unavailable' && a.start_date <= we && a.end_date >= ws) hrs += a.hours_per_day * a.days_per_week; });
                    const pct = hrs / 40 * 100;
                    const bg = pct === 0 ? `color-mix(in srgb, ${BORDER} 13%, transparent)` : pct <= 50 ? `color-mix(in srgb, ${GREEN} 19%, transparent)` : pct <= 80 ? `color-mix(in srgb, ${GREEN} 38%, transparent)` : pct <= 100 ? `color-mix(in srgb, ${AMBER} 38%, transparent)` : `color-mix(in srgb, ${RED} 38%, transparent)`;
                    return <div key={w} style={{ background: bg, borderRadius: 3, padding: '3px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: pct > 100 ? RED : pct > 0 ? TEXT : `color-mix(in srgb, ${DIM} 38%, transparent)` }}>{hrs > 0 ? `${hrs}h` : '-'}</div>;
                  })}
                </React.Fragment>;
              })}
            </div>
          </Card>
        </div>
      </div>}

      {/* ========== AVAILABILITY CALENDAR ========== */}
      {!loading && tab === 'availability' && <Card title="Availability — Next 4 Weeks" icon={<CalendarBlank size={17} weight="duotone" color="var(--text-secondary)" />}>
        <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(4,1fr)', gap: 2, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: DIM, padding: 6 }}>Person / Trade / Role</div>
          {[0, 1, 2, 3].map(w => {
            const d = addWeeks(new Date(), w);
            return <div key={w} style={{ fontSize: 12, fontWeight: 700, color: DIM, textAlign: 'center', padding: 6 }}>{`${d.getMonth() + 1}/${d.getDate()}`} - {`${addDays(d, 6).getMonth() + 1}/${addDays(d, 6).getDate()}`}</div>;
          })}
        </div>
        {availability.length === 0 && <PremiumEmpty compact icon={<UsersThree size={30} weight="duotone" color="var(--text-secondary)" />} title="No people tracked yet" description="Add assignments to see availability." />}
        {availability.map(a => <div key={a.name} style={{ display: 'grid', gridTemplateColumns: '200px repeat(4,1fr)', gap: 2, marginBottom: 2 }}>
          <div style={{ padding: '6px 8px', fontSize: 12, color: TEXT, fontWeight: 600, background: `color-mix(in srgb, ${RAISED} 50%, transparent)`, borderRadius: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.name} <span style={{ fontSize: 12, color: DIM }}>({a.trade} - {a.role})</span>
          </div>
          {a.weekFree.map((free, i) => <div key={i} style={{ padding: '6px 8px', fontSize: 12, fontWeight: 700, textAlign: 'center', borderRadius: 3, background: free ? `color-mix(in srgb, ${GREEN} 9%, transparent)` : a.weekHrs[i] > 40 ? `color-mix(in srgb, ${RED} 9%, transparent)` : `color-mix(in srgb, ${AMBER} 7%, transparent)`, color: free ? GREEN : a.weekHrs[i] > 40 ? RED : AMBER }}>
            {free ? 'Available' : `${a.weekHrs[i]}h booked`}
          </div>)}
        </div>)}
        {/* Summary at bottom */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: `color-mix(in srgb, ${BG} 38%, transparent)`, borderRadius: 8, display: 'flex', gap: 24 }}>
          <div style={{ fontSize: 12, color: DIM }}>
            <span style={{ fontWeight: 700, color: GREEN }}>Available This Week:</span> {availability.filter(a => a.weekFree[0]).length} of {availability.length}
          </div>
          <div style={{ fontSize: 12, color: DIM }}>
            <span style={{ fontWeight: 700, color: RED }}>Overbooked This Week:</span> {availability.filter(a => a.weekHrs[0] > 40).length}
          </div>
          <div style={{ fontSize: 12, color: DIM }}>
            <span style={{ fontWeight: 700, color: AMBER }}>Partially Booked:</span> {availability.filter(a => !a.weekFree[0] && a.weekHrs[0] <= 40).length}
          </div>
        </div>
      </Card>}

      {/* ========== HEADCOUNT FORECAST ========== */}
      {!loading && tab === 'forecast' && <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
          <Card title="Monthly Headcount Projection" icon={<UsersThree size={17} weight="duotone" color="var(--text-secondary)" />}>
            {forecast.map(f => {
              const pct = f.count / maxForecast * 100;
              return <div key={f.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: TEXT, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{f.count} people ({f.fte} FTE)</span>
                </div>
                <div style={{ width: '100%', height: 18, borderRadius: 4, background: `color-mix(in srgb, ${BORDER} 19%, transparent)`, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${BLUE},${PURPLE})` }} />
                </div>
              </div>;
            })}
          </Card>
          {ratesVisible && <Card title="Monthly Labor Cost Projection" icon={<CurrencyDollar size={17} weight="duotone" color="var(--text-secondary)" />}>
            {forecast.map(f => {
              const maxC = Math.max(1, ...forecast.map(x => x.cost));
              const pct = f.cost / maxC * 100;
              return <div key={f.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: TEXT, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtMoney(f.cost)}</span>
                </div>
                <div style={{ width: '100%', height: 18, borderRadius: 4, background: `color-mix(in srgb, ${BORDER} 19%, transparent)`, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `var(--brand-primary)` }} />
                </div>
              </div>;
            })}
          </Card>}
        </div>
        {/* Forecast table */}
        <Card title="Forecast Detail" icon={<ClipboardText size={17} weight="duotone" color="var(--text-secondary)" />}>
          <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Month', 'Headcount', 'FTEs', ...(ratesVisible ? ['Labor Cost', 'Avg Cost/Person'] : []), 'Trend'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr></thead>
            <tbody>{forecast.map((f, fi) => {
              const prevCount = fi > 0 ? forecast[fi - 1].count : f.count;
              const trend = f.count > prevCount ? 'up' : f.count < prevCount ? 'down' : 'flat';
              return <tr key={f.label} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 600 }}>{f.label}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 700 }}>{f.count}</td>
                <td style={{ padding: '10px 12px', color: PURPLE, fontWeight: 700 }}>{f.fte}</td>
                {ratesVisible && <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 700 }}>{fmtMoney(f.cost)}</td>}
                {ratesVisible && <td style={{ padding: '10px 12px', color: DIM }}>{f.count > 0 ? fmtMoney(f.cost / f.count) : '-'}</td>}
                <td style={{ padding: '10px 12px', color: trend === 'up' ? GREEN : trend === 'down' ? RED : DIM, fontWeight: 700 }}>
                  {trend === 'up' ? '+' : trend === 'down' ? '-' : '='} {trend}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </Card>
      </div>}

      {/* ========== LABOR COSTS ========== */}
      {!loading && ratesVisible && tab === 'costs' && <div>
        <Card title="Labor Cost by Project" icon={<CurrencyDollar size={17} weight="duotone" color="var(--text-secondary)" />}>
          {projectCosts.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: DIM }}>No cost data available.</div>}
          <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Project', 'Headcount', 'Total Hours', 'Labor Cost', 'Avg Rate', 'Cost Bar'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr></thead>
            <tbody>{projectCosts.map(pc => <tr key={pc.project} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
              <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 700 }}>{pc.project}</td>
              <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{pc.headcount}</td>
              <td style={{ padding: '10px 12px', color: DIM }}>{pc.hours.toLocaleString()}h</td>
              <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>{fmtMoney(pc.labor)}</td>
              <td style={{ padding: '10px 12px', color: DIM }}>{pc.hours > 0 ? fmtMoney(pc.labor / pc.hours) + '/hr' : '-'}</td>
              <td style={{ padding: '10px 12px', width: 200 }}>
                <div style={{ width: '100%', height: 12, borderRadius: 4, background: `color-mix(in srgb, ${BORDER} 19%, transparent)`, overflow: 'hidden' }}>
                  <div style={{ width: `${pc.labor / maxCost * 100}%`, height: '100%', borderRadius: 4, background: `var(--brand-primary)` }} />
                </div>
              </td>
            </tr>)}</tbody>
          </table>
        </Card>

        {/* Cost summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <StatCard label="Total Labor Cost" value={fmtMoney(projectCosts.reduce((s, p) => s + p.labor, 0))} accent={GOLD} icon={<CurrencyDollar size={19} weight="duotone" color="var(--text-secondary)" />}  href="/app/resource-planning"/>
          <StatCard label="Total Hours" value={projectCosts.reduce((s, p) => s + p.hours, 0).toLocaleString()} accent={BLUE} icon={<Clock size={19} weight="duotone" color="var(--text-secondary)" />}  href="/app/resource-planning"/>
          <StatCard label="Blended Rate" accent={GREEN} icon={<Scales size={19} weight="duotone" color={GREEN} />} value={(() => {
            const h = projectCosts.reduce((s, p) => s + p.hours, 0);
            const c = projectCosts.reduce((s, p) => s + p.labor, 0);
            return h > 0 ? fmtMoney(c / h) + '/hr' : '-';
          })()}  href="/app/resource-planning"/>
          <StatCard label="Cost per FTE/Month" accent={PURPLE} icon={<UserGear size={19} weight="duotone" color={PURPLE} />} value={(() => {
            const fte = parseFloat(totalFTEs);
            const monthlyCost = forecast[0]?.cost || 0;
            return fte > 0 ? fmtMoney(monthlyCost / fte) : '-';
          })()}  href="/app/resource-planning"/>
        </div>

        {/* Trade breakdown */}
        <div style={{ marginTop: 18 }}>
          <Card title="Cost by Trade" icon={<Scales size={17} weight="duotone" color="var(--text-secondary)" />}>
            {(() => {
              const tradeMap: Record<string, { hours: number; cost: number; count: number }> = {};
              assignments.forEach(a => {
                if (!tradeMap[a.trade]) tradeMap[a.trade] = { hours: 0, cost: 0, count: 0 };
                const wks = weeksBetween(a.start_date, a.end_date);
                const hrs = wks * a.days_per_week * a.hours_per_day;
                tradeMap[a.trade].hours += hrs;
                tradeMap[a.trade].cost += hrs * (a.hourly_rate ?? 0);
                tradeMap[a.trade].count++;
              });
              const trades = Object.entries(tradeMap).sort((a, b) => b[1].cost - a[1].cost);
              const maxTradeCost = Math.max(1, ...trades.map(([, v]) => v.cost));
              return <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Trade', 'Assignments', 'Hours', 'Cost', 'Avg Rate', ''].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr></thead>
                <tbody>{trades.map(([trade, v]) => <tr key={trade} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                  <td style={{ padding: '8px 12px', color: TEXT, fontWeight: 600 }}>{trade}</td>
                  <td style={{ padding: '8px 12px', color: DIM }}>{v.count}</td>
                  <td style={{ padding: '8px 12px', color: DIM }}>{v.hours.toLocaleString()}h</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 700 }}>{fmtMoney(v.cost)}</td>
                  <td style={{ padding: '8px 12px', color: DIM }}>{v.hours > 0 ? fmtMoney(v.cost / v.hours) + '/hr' : '-'}</td>
                  <td style={{ padding: '8px 12px', width: 160 }}>
                    <div style={{ width: '100%', height: 10, borderRadius: 4, background: `color-mix(in srgb, ${BORDER} 19%, transparent)`, overflow: 'hidden' }}>
                      <div style={{ width: `${v.cost / maxTradeCost * 100}%`, height: '100%', borderRadius: 4, background: PURPLE }} />
                    </div>
                  </td>
                </tr>)}</tbody>
              </table>;
            })()}
          </Card>
        </div>
      </div>}
    </div>
    <UnsavedGuardModal guard={guard} />
  </PremiumSurface>;
}
