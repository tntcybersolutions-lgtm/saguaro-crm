'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CONTRACTOR_TRADES as TRADES, TRADESPERSON_ROLES as ROLES } from '@/lib/contractor-trades';

const GOLD='#D4A017',BG='#07101C',RAISED='#0D1D2E',BORDER='#1E3A5F',TEXT='#F0F4FF',DIM='#8BAAC8',GREEN='#22C55E',RED='#EF4444',AMBER='#F59E0B',BLUE='#3B82F6',PURPLE='#8B5CF6';

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
  hourly_rate: number;
  status: 'assigned' | 'tentative' | 'confirmed' | 'released' | 'unavailable';
  notes: string;
  project_id: string;
}
interface Project { id: string; name: string; status?: string; }

/* ===== CONSTANTS ===== */
// TRADES and ROLES imported from @/lib/contractor-trades
const CERTS = ['OSHA 10','OSHA 30','First Aid/CPR','Confined Space','Fall Protection','Crane Operator','Welding','CDL','Master Electrician','Master Plumber','EPA 608','Rigging','Scaffolding'];
const STATUS_COLORS: { [k: string]: string } = { assigned: BLUE, tentative: AMBER, confirmed: GREEN, released: DIM, unavailable: RED };
const STATUS_OPTS: Assignment['status'][] = ['assigned','tentative','confirmed','released','unavailable'];

type Tab = 'grid' | 'timeline' | 'people' | 'staffing' | 'utilization' | 'availability' | 'forecast' | 'costs';

/* ===== STYLE HELPERS ===== */
function btn(primary?: boolean): React.CSSProperties {
  return primary
    ? { padding: '8px 18px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: BG, fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'opacity .15s' }
    : { padding: '8px 18px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'opacity .15s' };
}
function inp(): React.CSSProperties {
  return { width: '100%', padding: '8px 12px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
}
function sel(): React.CSSProperties {
  return { ...inp(), cursor: 'pointer' };
}
function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${color}22`, color, textTransform: 'uppercase' as const, letterSpacing: .5 }}>{label}</span>;
}
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
    <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{title}</span>{action}
    </div>
    <div style={{ padding: 18 }}>{children}</div>
  </div>;
}
function Spinner() {
  return <div style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />;
}
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, minWidth: 520, maxWidth: 720, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>;
}

/* ===== UTILITY FUNCTIONS ===== */
function weeksBetween(a: string, b: string) { return Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / (7 * 864e5))); }
function daysBetween(a: string, b: string) { return Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 864e5)); }
function fmtDate(d: string) { if (!d) return ''; const p = new Date(d); return `${p.getMonth() + 1}/${p.getDate()}/${p.getFullYear()}`; }
function fmtMoney(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function mondayOf(d: Date) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); r.setHours(0, 0, 0, 0); return r; }
function addWeeks(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n * 7); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function weeksRange(startWeek: Date, count: number) { return Array.from({ length: count }, (_, i) => addWeeks(startWeek, i)); }

/* ===== MAIN COMPONENT ===== */
export default function ResourcePlanningPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('grid');
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
  const [reassignTarget, setReassignTarget] = useState<{ assignment: Assignment; show: boolean } | null>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  /* ---- Data loading ---- */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ra, rp] = await Promise.all([
        fetch('/api/projects/all/resource-planning'),
        fetch('/api/projects/list'),
      ]);
      if (!ra.ok) throw new Error(`Failed to load assignments: ${ra.status}`);
      if (!rp.ok) throw new Error(`Failed to load projects: ${rp.status}`);
      const da = await ra.json();
      const dp = await rp.json();
      setAssignments(Array.isArray(da) ? da : da.data ?? []);
      setProjects(Array.isArray(dp) ? dp : dp.data ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load data';
      setError(msg);
      setAssignments([]);
      setProjects([]);
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
      const now = new Date().toISOString().slice(0, 10);
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
    return mondayOf(new Date(earliest));
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
          cost += wks * a.days_per_week * a.hours_per_day * a.hourly_rate;
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
      map[a.project_id].labor += hrs * a.hourly_rate;
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
  const saveAssignment = async () => {
    if (!form.person_name || !form.project_id || !form.start_date || !form.end_date) {
      setError('Please fill in all required fields: Person Name, Project, Start Date, End Date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const endpoint = editId
        ? `/api/projects/all/resource-planning/${editId}`
        : '/api/projects/all/resource-planning';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setShowForm(false);
      setEditId(null);
      setForm({ status: 'assigned', hours_per_day: 8, days_per_week: 5, hourly_rate: 0, certifications: [], trade: 'General', role: 'Laborer' });
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save assignment';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const deleteAssignment = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/all/resource-planning/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setShowDeleteConfirm(null);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const editAssignment = (a: Assignment) => {
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
      if (!res.ok) throw new Error(`Reassign failed: ${res.status}`);
      setReassignTarget(null);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reassign';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ---- Export ---- */
  const exportCSV = () => {
    const header = 'Person,Role,Trade,Project,Start,End,Hrs/Day,Days/Wk,Rate,Status,Certifications,Notes\n';
    const rows = filtered.map(a => [a.person_name, a.role, a.trade, projMap[a.project_id] || a.project_id, a.start_date, a.end_date, a.hours_per_day, a.days_per_week, a.hourly_rate, a.status, (a.certifications || []).join(';'), `"${(a.notes || '').replace(/"/g, '""')}"`].join(',')).join('\n');
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
  return <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif' }}>
    {/* Inline keyframes for spinner */}
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

    {/* Header */}
    <div style={{ padding: '18px 28px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: RAISED }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Resource Planning</h1>
        <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Workforce scheduling, utilization, capacity planning, and cost forecasting</div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {saving && <Spinner />}
        <button onClick={exportCSV} style={btn()}>Export CSV</button>
        <button onClick={() => { load(); }} style={btn()}>Refresh</button>
        <button onClick={() => { setEditId(null); setForm({ status: 'assigned', hours_per_day: 8, days_per_week: 5, hourly_rate: 0, certifications: [], trade: 'General', role: 'Laborer' }); setShowForm(true); }} style={btn(true)}>+ New Assignment</button>
      </div>
    </div>

    {/* Error banner */}
    {error && <div style={{ margin: '16px 28px 0', padding: '12px 18px', background: `${RED}15`, border: `1px solid ${RED}40`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{error}</div>
      <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>x</button>
    </div>}

    {/* Conflict banner */}
    {conflicts.length > 0 && <div style={{ margin: '16px 28px 0', padding: '12px 18px', background: `${RED}15`, border: `1px solid ${RED}40`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 20, fontWeight: 900, color: RED, lineHeight: 1 }}>!</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: RED }}>Scheduling Conflicts Detected ({conflicts.length})</div>
        <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{conflicts.slice(0, 5).map(c => `${c.person}: ${projMap[c.a1.project_id] || '?'} vs ${projMap[c.a2.project_id] || '?'}`).join(' | ')}{conflicts.length > 5 ? ` ...and ${conflicts.length - 5} more` : ''}</div>
      </div>
    </div>}

    {/* Stats row */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, padding: '18px 28px' }}>
      {[
        { label: 'Total People', value: people.length, color: BLUE },
        { label: 'Active Assignments', value: assignments.filter(a => a.status !== 'released' && a.status !== 'unavailable').length, color: GREEN },
        { label: 'Current FTEs', value: totalFTEs, color: PURPLE },
        { label: 'Conflicts', value: conflicts.length, color: conflicts.length ? RED : GREEN },
        { label: 'Avg Utilization', value: avgUtil + '%', color: avgUtil > 100 ? RED : avgUtil > 80 ? AMBER : GREEN },
        { label: 'Overbooked / Available', value: `${overbookedCount} / ${availableCount}`, color: overbookedCount > 0 ? RED : GREEN },
      ].map(s => <div key={s.label} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5 }}>{s.label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
      </div>)}
    </div>

    {/* Filters */}
    <div style={{ padding: '0 28px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <input value={filterPerson} onChange={e => setFilterPerson(e.target.value)} placeholder="Search person..." style={{ ...inp(), width: 160 }} />
      <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={{ ...sel(), width: 180 }}>
        <option value="">All Projects</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)} style={{ ...sel(), width: 150 }}>
        <option value="">All Trades</option>
        {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ...sel(), width: 160 }}>
        <option value="">All Roles</option>
        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <select value={filterCert} onChange={e => setFilterCert(e.target.value)} style={{ ...sel(), width: 170 }}>
        <option value="">All Certifications</option>
        {CERTS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: DIM }}>From:</span>
        <input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} style={{ ...inp(), width: 140 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: DIM }}>To:</span>
        <input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} style={{ ...inp(), width: 140 }} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: DIM, cursor: 'pointer' }}>
        <input type="checkbox" checked={filterAvail} onChange={e => setFilterAvail(e.target.checked)} style={{ accentColor: GOLD }} /> Available Only
      </label>
      {hasFilters && <button onClick={clearFilters} style={{ ...btn(), fontSize: 11, padding: '5px 12px' }}>Clear Filters</button>}
    </div>

    {/* Tabs */}
    <div style={{ padding: '0 28px', display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}`, overflowX: 'auto' }}>
      {([['grid', 'Assignment Grid'], ['timeline', 'Timeline / Gantt'], ['people', 'People'], ['staffing', 'Project Staffing'], ['utilization', 'Utilization'], ['availability', 'Availability'], ['forecast', 'Headcount Forecast'], ['costs', 'Labor Costs']] as [Tab, string][]).map(([k, l]) =>
        <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 18px', border: 'none', borderBottom: tab === k ? `2px solid ${GOLD}` : '2px solid transparent', background: 'transparent', color: tab === k ? GOLD : DIM, fontSize: 13, fontWeight: tab === k ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>
      )}
    </div>

    {/* Main content */}
    <div style={{ padding: '20px 28px' }}>
      {loading && <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
        <Spinner /><div style={{ marginTop: 12 }}>Loading resource data...</div>
      </div>}

      {/* ========== ASSIGNMENT FORM MODAL ========== */}
      {showForm && <ModalOverlay onClose={() => { setShowForm(false); setEditId(null); }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20, color: TEXT }}>{editId ? 'Edit Assignment' : 'New Assignment'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Person Name *</label>
            <input value={form.person_name || ''} onChange={e => setForm({ ...form, person_name: e.target.value })} placeholder="Full name" style={inp()} list="person-suggestions" />
            <datalist id="person-suggestions">
              {allPersonNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Project *</label>
            <select value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} style={sel()}>
              <option value="">Select project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Role</label>
            <select value={form.role || ''} onChange={e => setForm({ ...form, role: e.target.value })} style={sel()}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Trade</label>
            <select value={form.trade || ''} onChange={e => setForm({ ...form, trade: e.target.value })} style={sel()}>
              {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Start Date *</label>
            <input type="date" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inp()} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>End Date *</label>
            <input type="date" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inp()} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Status</label>
            <select value={form.status || 'assigned'} onChange={e => setForm({ ...form, status: e.target.value as Assignment['status'] })} style={sel()}>
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Hours/Day</label>
            <input type="number" value={form.hours_per_day ?? 8} onChange={e => setForm({ ...form, hours_per_day: +e.target.value })} style={inp()} min={1} max={16} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Days/Week</label>
            <input type="number" value={form.days_per_week ?? 5} onChange={e => setForm({ ...form, days_per_week: +e.target.value })} style={inp()} min={1} max={7} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Hourly Rate ($)</label>
            <input type="number" value={form.hourly_rate ?? 0} onChange={e => setForm({ ...form, hourly_rate: +e.target.value })} style={inp()} min={0} step={0.5} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Certifications</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CERTS.map(c => <button key={c} onClick={() => toggleCert(c)} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 5, border: `1px solid ${(form.certifications || []).includes(c) ? GOLD : BORDER}`, background: (form.certifications || []).includes(c) ? `${GOLD}20` : 'transparent', color: (form.certifications || []).includes(c) ? GOLD : DIM, cursor: 'pointer', fontWeight: 600 }}>{c}</button>)}
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 5 }}>Notes</label>
          <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inp(), resize: 'vertical' as const }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={saveAssignment} disabled={saving} style={{ ...btn(true), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : editId ? 'Update Assignment' : 'Create Assignment'}</button>
          <button onClick={() => { setShowForm(false); setEditId(null); }} style={btn()}>Cancel</button>
        </div>
      </ModalOverlay>}

      {/* ========== DELETE CONFIRMATION MODAL ========== */}
      {showDeleteConfirm && <ModalOverlay onClose={() => setShowDeleteConfirm(null)}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12, color: RED, fontWeight: 900 }}>!</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 8 }}>Delete Assignment?</div>
          <div style={{ fontSize: 13, color: DIM, marginBottom: 24 }}>This action cannot be undone. The assignment will be permanently removed.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => deleteAssignment(showDeleteConfirm)} disabled={saving} style={{ ...btn(), borderColor: RED, color: RED, opacity: saving ? 0.6 : 1 }}>{saving ? 'Deleting...' : 'Delete'}</button>
            <button onClick={() => setShowDeleteConfirm(null)} style={btn()}>Cancel</button>
          </div>
        </div>
      </ModalOverlay>}

      {/* ========== REASSIGN MODAL ========== */}
      {reassignTarget?.show && <ModalOverlay onClose={() => setReassignTarget(null)}>
        <div style={{ fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 8 }}>Reassign Resource</div>
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
      {!loading && tab === 'grid' && <Card title={`Resource Assignment Grid (${gridData.GRID_WEEKS} Weeks)`} action={<span style={{ fontSize: 12, color: DIM }}>{filteredPeople.length} people shown</span>}>
        <div ref={gridScrollRef} style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1000 }}>
            {/* Headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `160px 140px repeat(${gridData.GRID_WEEKS}, 1fr)`, borderBottom: `1px solid ${BORDER}`, marginBottom: 6 }}>
              <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: DIM }}>Person</div>
              <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: DIM }}>Project</div>
              {gridData.gridWeeks.map((w, i) => <div key={i} style={{ padding: '6px 4px', fontSize: 10, fontWeight: 600, color: DIM, textAlign: 'center', borderLeft: `1px solid ${BORDER}22` }}>
                Wk {`${w.getMonth() + 1}/${w.getDate()}`}
              </div>)}
            </div>
            {/* Rows */}
            {gridData.rows.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: DIM }}>No assignment data to display. Create assignments to populate the grid.</div>}
            {gridData.rows.map(row => <React.Fragment key={row.name}>
              {/* Person total row */}
              <div style={{ display: 'grid', gridTemplateColumns: `160px 140px repeat(${gridData.GRID_WEEKS}, 1fr)`, background: conflictPersons.has(row.name) ? `${RED}08` : `${BG}60`, borderBottom: `1px solid ${BORDER}15`, minHeight: 32, alignItems: 'center' }}>
                <div style={{ padding: '4px 8px', fontSize: 12, fontWeight: 700, color: conflictPersons.has(row.name) ? RED : TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.name} {conflictPersons.has(row.name) && <span style={{ fontSize: 9, color: RED, fontWeight: 800 }}>CONFLICT</span>}
                </div>
                <div style={{ padding: '4px 8px', fontSize: 11, color: DIM, fontWeight: 600 }}>Total hrs/wk</div>
                {row.totalWeekHours.map((h, wi) => {
                  const pct = h / 40 * 100;
                  const bg = h === 0 ? 'transparent' : pct > 100 ? `${RED}30` : pct > 80 ? `${AMBER}20` : `${GREEN}15`;
                  const color = h === 0 ? `${DIM}60` : pct > 100 ? RED : pct > 80 ? AMBER : GREEN;
                  return <div key={wi} style={{ padding: '4px', textAlign: 'center', fontSize: 11, fontWeight: 700, color, background: bg, borderLeft: `1px solid ${BORDER}10`, borderRadius: 2 }}>
                    {h > 0 ? `${h}h` : '-'}
                  </div>;
                })}
              </div>
              {/* Per-project breakdown */}
              {row.cells.map(cell => <div key={cell.projectId} style={{ display: 'grid', gridTemplateColumns: `160px 140px repeat(${gridData.GRID_WEEKS}, 1fr)`, borderBottom: `1px solid ${BORDER}08`, minHeight: 26, alignItems: 'center' }}>
                <div />
                <div style={{ padding: '2px 8px', fontSize: 11, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.projectName}</div>
                {cell.weekHours.map((h, wi) => <div key={wi} style={{ padding: '2px 4px', textAlign: 'center', fontSize: 10, color: h > 0 ? BLUE : `${DIM}40`, borderLeft: `1px solid ${BORDER}08` }}>
                  {h > 0 ? `${h}h` : '-'}
                </div>)}
              </div>)}
            </React.Fragment>)}
          </div>
        </div>
      </Card>}

      {/* ========== TIMELINE / GANTT ========== */}
      {!loading && tab === 'timeline' && <Card title={`Timeline View (${TIMELINE_WEEKS} Weeks)`} action={<span style={{ fontSize: 12, color: DIM }}>Starting {fmtDate(isoDate(timelineStart))}</span>}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1100 }}>
            {/* Week headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${TIMELINE_WEEKS},1fr)`, borderBottom: `1px solid ${BORDER}`, marginBottom: 8 }}>
              <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: DIM }}>Person</div>
              {weeks.map((w, i) => {
                const isCurrentWeek = isoDate(w) <= isoDate(new Date()) && isoDate(addDays(w, 6)) >= isoDate(new Date());
                return <div key={i} style={{ padding: '6px 4px', fontSize: 10, fontWeight: 600, color: isCurrentWeek ? GOLD : DIM, textAlign: 'center', borderLeft: `1px solid ${BORDER}22`, background: isCurrentWeek ? `${GOLD}08` : 'transparent' }}>
                  {`${w.getMonth() + 1}/${w.getDate()}`}
                </div>;
              })}
            </div>
            {/* Rows */}
            {filteredPeople.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: DIM }}>No assignments match filters. Adjust filters or create new assignments.</div>}
            {filteredPeople.map(([name, asns]) => {
              const isConflict = conflictPersons.has(name);
              return <div key={name} style={{ display: 'grid', gridTemplateColumns: `180px repeat(${TIMELINE_WEEKS},1fr)`, borderBottom: `1px solid ${BORDER}15`, minHeight: 36, alignItems: 'center', background: isConflict ? `${RED}08` : 'transparent' }}>
                <div style={{ padding: '4px 8px', fontSize: 12, fontWeight: 600, color: isConflict ? RED : TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${name} (${asns[0]?.trade} - ${asns[0]?.role})`}>
                  {name} {isConflict && <span style={{ fontSize: 9, color: RED, fontWeight: 800 }}>CONFLICT</span>}
                </div>
                {weeks.map((w, wi) => {
                  const wStart = isoDate(w);
                  const wEnd = isoDate(addDays(w, 6));
                  const isCurrentWeek = wStart <= isoDate(new Date()) && wEnd >= isoDate(new Date());
                  const active = asns.filter(a => a.start_date <= wEnd && a.end_date >= wStart && a.status !== 'released');
                  return <div key={wi} style={{ borderLeft: `1px solid ${BORDER}15`, height: '100%', padding: '2px 1px', display: 'flex', flexDirection: 'column', gap: 1, background: isCurrentWeek ? `${GOLD}05` : 'transparent' }}>
                    {active.map((a, ai) => <div key={ai} title={`${projMap[a.project_id] || '?'} (${a.role}) - ${a.hours_per_day}h/day`} onClick={() => editAssignment(a)} style={{ height: active.length > 1 ? 10 : 20, borderRadius: 3, background: STATUS_COLORS[a.status] || BLUE, opacity: .85, fontSize: 8, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', padding: '0 3px', lineHeight: active.length > 1 ? '10px' : '20px', fontWeight: 700, cursor: 'pointer' }}>
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
            <span style={{ fontSize: 11, color: DIM, textTransform: 'capitalize' }}>{s}</span>
          </div>)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, borderRadius: 3, background: `${RED}30`, border: `1px solid ${RED}50` }} />
            <span style={{ fontSize: 11, color: DIM }}>Conflict</span>
          </div>
        </div>
      </Card>}

      {/* ========== PEOPLE LIST ========== */}
      {!loading && tab === 'people' && <Card title={`People & Assignments (${filteredPeople.length})`}>
        {filteredPeople.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: DIM }}>No people found matching filters.</div>}
        {filteredPeople.map(([name, asns]) => {
          const util = utilization.find(u => u.name === name);
          const isConflict = conflictPersons.has(name);
          return <div key={name} style={{ background: `${BG}80`, border: `1px solid ${isConflict ? RED : BORDER}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},#B85C2A)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: BG }}>{name.charAt(0)}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{name}</div>
                  <div style={{ fontSize: 11, color: DIM }}>{asns[0]?.trade} - {asns[0]?.role}</div>
                </div>
                {isConflict && <Badge label="Conflict" color={RED} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: DIM }}>Utilization (4wk)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: util && util.pct > 100 ? RED : util && util.pct > 80 ? AMBER : GREEN }}>{util?.pct || 0}%</div>
                </div>
                <div style={{ width: 60, height: 8, borderRadius: 4, background: `${BORDER}50`, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, util?.pct || 0)}%`, height: '100%', borderRadius: 4, background: util && util.pct > 100 ? RED : util && util.pct > 80 ? AMBER : GREEN }} />
                </div>
              </div>
            </div>
            {/* Certs */}
            {asns[0]?.certifications?.length > 0 && <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              {asns[0].certifications.map(c => <span key={c} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${PURPLE}18`, color: PURPLE, fontWeight: 600 }}>{c}</span>)}
            </div>}
            {/* Assignment rows */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{['Project', 'Dates', 'Hrs/Day', 'Rate', 'Status', 'Actions'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, borderBottom: `1px solid ${BORDER}30` }}>{h}</th>)}</tr></thead>
              <tbody>{asns.map(a => <tr key={a.id || a.project_id + a.start_date}>
                <td style={{ padding: '6px 8px', color: TEXT, fontWeight: 600 }}>{projMap[a.project_id] || a.project_id}</td>
                <td style={{ padding: '6px 8px', color: DIM }}>{fmtDate(a.start_date)} - {fmtDate(a.end_date)}</td>
                <td style={{ padding: '6px 8px', color: DIM }}>{a.hours_per_day}h x {a.days_per_week}d</td>
                <td style={{ padding: '6px 8px', color: GOLD, fontWeight: 600 }}>{fmtMoney(a.hourly_rate)}/hr</td>
                <td style={{ padding: '6px 8px' }}><Badge label={a.status} color={STATUS_COLORS[a.status]} /></td>
                <td style={{ padding: '6px 8px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => editAssignment(a)} style={{ ...btn(), padding: '3px 8px', fontSize: 11 }}>Edit</button>
                    <button onClick={() => setReassignTarget({ assignment: a, show: true })} style={{ ...btn(), padding: '3px 8px', fontSize: 11, borderColor: `${PURPLE}50`, color: PURPLE }}>Move</button>
                    <button onClick={() => a.id && setShowDeleteConfirm(a.id)} style={{ ...btn(), padding: '3px 8px', fontSize: 11, borderColor: `${RED}50`, color: RED }}>Del</button>
                  </div>
                </td>
              </tr>)}</tbody>
            </table>
          </div>;
        })}
      </Card>}

      {/* ========== PROJECT STAFFING ========== */}
      {!loading && tab === 'staffing' && <div>
        {projects.length === 0 && <Card title="Project Staffing"><div style={{ padding: 32, textAlign: 'center', color: DIM }}>No projects found.</div></Card>}
        {projects.map(proj => {
          const projAsns = filtered.filter(a => a.project_id === proj.id);
          if (filterProject && filterProject !== proj.id) return null;
          if (!filterProject && projAsns.length === 0) return null;
          return <Card key={proj.id} title={proj.name} action={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: DIM }}>{projAsns.length} assignment{projAsns.length !== 1 ? 's' : ''}</span>
            <Badge label={proj.status || 'active'} color={GREEN} />
          </div>}>
            {projAsns.length === 0 ? <div style={{ padding: 16, textAlign: 'center', color: DIM, fontSize: 13 }}>No assignments for this project.</div>
              : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{['Person', 'Role', 'Trade', 'Dates', 'Hours', 'Rate', 'Status', 'Reassign', 'Actions'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, borderBottom: `1px solid ${BORDER}30` }}>{h}</th>)}</tr></thead>
                <tbody>{projAsns.map(a => <tr key={a.id || a.person_name + a.start_date} style={{ borderBottom: `1px solid ${BORDER}15`, background: conflictPersons.has(a.person_name) ? `${RED}06` : 'transparent' }}>
                  <td style={{ padding: '6px 8px', color: conflictPersons.has(a.person_name) ? RED : TEXT, fontWeight: 600 }}>
                    {a.person_name}
                    {conflictPersons.has(a.person_name) && <span style={{ fontSize: 9, marginLeft: 4, color: RED }}>!</span>}
                  </td>
                  <td style={{ padding: '6px 8px', color: DIM }}>{a.role}</td>
                  <td style={{ padding: '6px 8px', color: DIM }}>{a.trade}</td>
                  <td style={{ padding: '6px 8px', color: DIM }}>{fmtDate(a.start_date)} - {fmtDate(a.end_date)}</td>
                  <td style={{ padding: '6px 8px', color: DIM }}>{a.hours_per_day}h/{a.days_per_week}d</td>
                  <td style={{ padding: '6px 8px', color: GOLD, fontWeight: 600 }}>{fmtMoney(a.hourly_rate)}</td>
                  <td style={{ padding: '6px 8px' }}><Badge label={a.status} color={STATUS_COLORS[a.status]} /></td>
                  <td style={{ padding: '6px 8px' }}>
                    <button onClick={() => setReassignTarget({ assignment: a, show: true })} style={{ ...btn(), padding: '3px 8px', fontSize: 10 }}>Move</button>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => editAssignment(a)} style={{ ...btn(), padding: '3px 8px', fontSize: 11 }}>Edit</button>
                      <button onClick={() => a.id && setShowDeleteConfirm(a.id)} style={{ ...btn(), padding: '3px 8px', fontSize: 11, borderColor: `${RED}50`, color: RED }}>Del</button>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const }}>Avg Utilization</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: avgUtil > 100 ? RED : avgUtil > 80 ? AMBER : GREEN, marginTop: 4 }}>{avgUtil}%</div>
          </div>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const }}>Overbooked (100%+)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: overbookedCount > 0 ? RED : GREEN, marginTop: 4 }}>{overbookedCount}</div>
          </div>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const }}>Under-utilized (&lt;50%)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BLUE, marginTop: 4 }}>{utilization.filter(u => u.pct < 50 && u.pct > 0).length}</div>
          </div>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const }}>Unassigned</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: DIM, marginTop: 4 }}>{utilization.filter(u => u.pct === 0).length}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {/* Utilization chart */}
          <Card title="Utilization by Person (Next 4 Weeks)">
            {utilization.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: DIM }}>No data.</div>}
            {[...utilization].sort((a, b) => b.pct - a.pct).map(u => {
              const color = u.pct > 100 ? RED : u.pct > 80 ? AMBER : u.pct > 50 ? GREEN : BLUE;
              return <div key={u.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: TEXT, fontWeight: 600 }}>{u.name} <span style={{ fontSize: 10, color: DIM }}>({u.trade})</span></span>
                  <span style={{ color, fontWeight: 700 }}>{u.pct}%</span>
                </div>
                <div style={{ width: '100%', height: 14, borderRadius: 4, background: `${BORDER}40`, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: `${Math.min(150, u.pct) / 150 * 100}%`, height: '100%', borderRadius: 4, background: color, transition: 'width .3s' }} />
                  {u.pct > 100 && <div style={{ position: 'absolute', left: '66.7%', top: 0, bottom: 0, width: 2, background: RED, opacity: .7 }} />}
                </div>
              </div>;
            })}
          </Card>
          {/* Heatmap */}
          <Card title="Weekly Heatmap (Hours)">
            <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(4,1fr)', gap: 2 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: DIM }}>Person</div>
              {[0, 1, 2, 3].map(w => <div key={w} style={{ fontSize: 10, fontWeight: 700, color: DIM, textAlign: 'center' }}>Wk {w + 1}</div>)}
              {people.map(([name, asns]) => {
                return <React.Fragment key={name}>
                  <div style={{ fontSize: 11, color: TEXT, fontWeight: 600, padding: '3px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
                  {[0, 1, 2, 3].map(w => {
                    const ws = isoDate(addWeeks(new Date(), w)), we = isoDate(addWeeks(new Date(), w + 1));
                    let hrs = 0;
                    asns.forEach(a => { if (a.status !== 'released' && a.status !== 'unavailable' && a.start_date <= we && a.end_date >= ws) hrs += a.hours_per_day * a.days_per_week; });
                    const pct = hrs / 40 * 100;
                    const bg = pct === 0 ? `${BORDER}20` : pct <= 50 ? `${GREEN}30` : pct <= 80 ? `${GREEN}60` : pct <= 100 ? `${AMBER}60` : `${RED}60`;
                    return <div key={w} style={{ background: bg, borderRadius: 3, padding: '3px 0', textAlign: 'center', fontSize: 10, fontWeight: 600, color: pct > 100 ? RED : pct > 0 ? TEXT : `${DIM}60` }}>{hrs > 0 ? `${hrs}h` : '-'}</div>;
                  })}
                </React.Fragment>;
              })}
            </div>
          </Card>
        </div>
      </div>}

      {/* ========== AVAILABILITY CALENDAR ========== */}
      {!loading && tab === 'availability' && <Card title="Availability - Next 4 Weeks">
        <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(4,1fr)', gap: 2, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: DIM, padding: 6 }}>Person / Trade / Role</div>
          {[0, 1, 2, 3].map(w => {
            const d = addWeeks(new Date(), w);
            return <div key={w} style={{ fontSize: 11, fontWeight: 700, color: DIM, textAlign: 'center', padding: 6 }}>{`${d.getMonth() + 1}/${d.getDate()}`} - {`${addDays(d, 6).getMonth() + 1}/${addDays(d, 6).getDate()}`}</div>;
          })}
        </div>
        {availability.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: DIM }}>No people tracked yet.</div>}
        {availability.map(a => <div key={a.name} style={{ display: 'grid', gridTemplateColumns: '200px repeat(4,1fr)', gap: 2, marginBottom: 2 }}>
          <div style={{ padding: '6px 8px', fontSize: 12, color: TEXT, fontWeight: 600, background: `${RAISED}80`, borderRadius: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.name} <span style={{ fontSize: 10, color: DIM }}>({a.trade} - {a.role})</span>
          </div>
          {a.weekFree.map((free, i) => <div key={i} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, textAlign: 'center', borderRadius: 3, background: free ? `${GREEN}18` : a.weekHrs[i] > 40 ? `${RED}18` : `${AMBER}12`, color: free ? GREEN : a.weekHrs[i] > 40 ? RED : AMBER }}>
            {free ? 'Available' : `${a.weekHrs[i]}h booked`}
          </div>)}
        </div>)}
        {/* Summary at bottom */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: `${BG}60`, borderRadius: 8, display: 'flex', gap: 24 }}>
          <div style={{ fontSize: 12, color: DIM }}>
            <span style={{ fontWeight: 700, color: GREEN }}>Available this week:</span> {availability.filter(a => a.weekFree[0]).length} of {availability.length}
          </div>
          <div style={{ fontSize: 12, color: DIM }}>
            <span style={{ fontWeight: 700, color: RED }}>Overbooked this week:</span> {availability.filter(a => a.weekHrs[0] > 40).length}
          </div>
          <div style={{ fontSize: 12, color: DIM }}>
            <span style={{ fontWeight: 700, color: AMBER }}>Partially booked:</span> {availability.filter(a => !a.weekFree[0] && a.weekHrs[0] <= 40).length}
          </div>
        </div>
      </Card>}

      {/* ========== HEADCOUNT FORECAST ========== */}
      {!loading && tab === 'forecast' && <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
          <Card title="Monthly Headcount Projection">
            {forecast.map(f => {
              const pct = f.count / maxForecast * 100;
              return <div key={f.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: TEXT, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ color: BLUE, fontWeight: 700 }}>{f.count} people ({f.fte} FTE)</span>
                </div>
                <div style={{ width: '100%', height: 18, borderRadius: 4, background: `${BORDER}30`, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${BLUE},${PURPLE})` }} />
                </div>
              </div>;
            })}
          </Card>
          <Card title="Monthly Labor Cost Projection">
            {forecast.map(f => {
              const maxC = Math.max(1, ...forecast.map(x => x.cost));
              const pct = f.cost / maxC * 100;
              return <div key={f.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: TEXT, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ color: GOLD, fontWeight: 700 }}>{fmtMoney(f.cost)}</span>
                </div>
                <div style={{ width: '100%', height: 18, borderRadius: 4, background: `${BORDER}30`, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${GOLD},${AMBER})` }} />
                </div>
              </div>;
            })}
          </Card>
        </div>
        {/* Forecast table */}
        <Card title="Forecast Detail">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Month', 'Headcount', 'FTEs', 'Labor Cost', 'Avg Cost/Person', 'Trend'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr></thead>
            <tbody>{forecast.map((f, fi) => {
              const prevCount = fi > 0 ? forecast[fi - 1].count : f.count;
              const trend = f.count > prevCount ? 'up' : f.count < prevCount ? 'down' : 'flat';
              return <tr key={f.label} style={{ borderBottom: `1px solid ${BORDER}20` }}>
                <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 600 }}>{f.label}</td>
                <td style={{ padding: '10px 12px', color: BLUE, fontWeight: 700 }}>{f.count}</td>
                <td style={{ padding: '10px 12px', color: PURPLE, fontWeight: 700 }}>{f.fte}</td>
                <td style={{ padding: '10px 12px', color: GOLD, fontWeight: 700 }}>{fmtMoney(f.cost)}</td>
                <td style={{ padding: '10px 12px', color: DIM }}>{f.count > 0 ? fmtMoney(f.cost / f.count) : '-'}</td>
                <td style={{ padding: '10px 12px', color: trend === 'up' ? GREEN : trend === 'down' ? RED : DIM, fontWeight: 700 }}>
                  {trend === 'up' ? '+' : trend === 'down' ? '-' : '='} {trend}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </Card>
      </div>}

      {/* ========== LABOR COSTS ========== */}
      {!loading && tab === 'costs' && <div>
        <Card title="Labor Cost by Project">
          {projectCosts.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: DIM }}>No cost data available.</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Project', 'Headcount', 'Total Hours', 'Labor Cost', 'Avg Rate', 'Cost Bar'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr></thead>
            <tbody>{projectCosts.map(pc => <tr key={pc.project} style={{ borderBottom: `1px solid ${BORDER}20` }}>
              <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 700 }}>{pc.project}</td>
              <td style={{ padding: '10px 12px', color: BLUE, fontWeight: 600 }}>{pc.headcount}</td>
              <td style={{ padding: '10px 12px', color: DIM }}>{pc.hours.toLocaleString()}h</td>
              <td style={{ padding: '10px 12px', color: GOLD, fontWeight: 700, fontSize: 14 }}>{fmtMoney(pc.labor)}</td>
              <td style={{ padding: '10px 12px', color: DIM }}>{pc.hours > 0 ? fmtMoney(pc.labor / pc.hours) + '/hr' : '-'}</td>
              <td style={{ padding: '10px 12px', width: 200 }}>
                <div style={{ width: '100%', height: 12, borderRadius: 4, background: `${BORDER}30`, overflow: 'hidden' }}>
                  <div style={{ width: `${pc.labor / maxCost * 100}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${GOLD},${AMBER})` }} />
                </div>
              </td>
            </tr>)}</tbody>
          </table>
        </Card>

        {/* Cost summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, marginBottom: 6 }}>Total Labor Cost</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: GOLD }}>{fmtMoney(projectCosts.reduce((s, p) => s + p.labor, 0))}</div>
          </div>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, marginBottom: 6 }}>Total Hours</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BLUE }}>{projectCosts.reduce((s, p) => s + p.hours, 0).toLocaleString()}</div>
          </div>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, marginBottom: 6 }}>Blended Rate</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: GREEN }}>{(() => {
              const h = projectCosts.reduce((s, p) => s + p.hours, 0);
              const c = projectCosts.reduce((s, p) => s + p.labor, 0);
              return h > 0 ? fmtMoney(c / h) + '/hr' : '-';
            })()}</div>
          </div>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, marginBottom: 6 }}>Cost per FTE/Month</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: PURPLE }}>{(() => {
              const fte = parseFloat(totalFTEs);
              const monthlyCost = forecast[0]?.cost || 0;
              return fte > 0 ? fmtMoney(monthlyCost / fte) : '-';
            })()}</div>
          </div>
        </div>

        {/* Trade breakdown */}
        <div style={{ marginTop: 18 }}>
          <Card title="Cost by Trade">
            {(() => {
              const tradeMap: Record<string, { hours: number; cost: number; count: number }> = {};
              assignments.forEach(a => {
                if (!tradeMap[a.trade]) tradeMap[a.trade] = { hours: 0, cost: 0, count: 0 };
                const wks = weeksBetween(a.start_date, a.end_date);
                const hrs = wks * a.days_per_week * a.hours_per_day;
                tradeMap[a.trade].hours += hrs;
                tradeMap[a.trade].cost += hrs * a.hourly_rate;
                tradeMap[a.trade].count++;
              });
              const trades = Object.entries(tradeMap).sort((a, b) => b[1].cost - a[1].cost);
              const maxTradeCost = Math.max(1, ...trades.map(([, v]) => v.cost));
              return <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Trade', 'Assignments', 'Hours', 'Cost', 'Avg Rate', ''].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr></thead>
                <tbody>{trades.map(([trade, v]) => <tr key={trade} style={{ borderBottom: `1px solid ${BORDER}20` }}>
                  <td style={{ padding: '8px 12px', color: TEXT, fontWeight: 600 }}>{trade}</td>
                  <td style={{ padding: '8px 12px', color: DIM }}>{v.count}</td>
                  <td style={{ padding: '8px 12px', color: DIM }}>{v.hours.toLocaleString()}h</td>
                  <td style={{ padding: '8px 12px', color: GOLD, fontWeight: 700 }}>{fmtMoney(v.cost)}</td>
                  <td style={{ padding: '8px 12px', color: DIM }}>{v.hours > 0 ? fmtMoney(v.cost / v.hours) + '/hr' : '-'}</td>
                  <td style={{ padding: '8px 12px', width: 160 }}>
                    <div style={{ width: '100%', height: 10, borderRadius: 4, background: `${BORDER}30`, overflow: 'hidden' }}>
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
  </div>;
}
