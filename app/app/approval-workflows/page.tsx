'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import {
  Plus, PencilSimple, Copy, Trash, Power, TreeStructure, Check, CheckCircle, XCircle,
  Clock, Users, ArrowRight, X, MagnifyingGlass, WarningCircle,
  CaretUp, CaretDown, ClipboardText, ChartBar, Gauge, ArrowClockwise, ListChecks,
} from '@phosphor-icons/react';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, FlowSteps,
  goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle,
} from '@/components/ui/premium';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

/* ── palette (dark enterprise / Sonoran) ── */
const GOLD = 'var(--brand-primary)';
const BG = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = '#2C3344';
const TEXT = '#FFFFFF';
const DIM = '#D4D4D8';
const GREEN = '#2CFF7A';
const RED = '#FF3B30';
const AMBER = 'var(--warning)';
const BLUE = 'var(--brand-primary)';
const PURPLE = '#FF8A00';

/* ── entity types = real approvable modules ── */
type EntityType = 'change_order' | 'pay_app' | 'purchase_order' | 'invoice';
type Tab = 'templates' | 'pending' | 'dashboard' | 'history' | 'delegation';

const ENTITY_TYPES: EntityType[] = ['change_order', 'pay_app', 'purchase_order', 'invoice'];
const MODULE_LABEL: Record<EntityType, string> = {
  change_order: 'Change Orders', pay_app: 'Pay Apps',
  purchase_order: 'Purchase Orders', invoice: 'Invoices',
};
const MODULE_COLOR: Record<EntityType, string> = {
  change_order: AMBER, pay_app: GREEN, purchase_order: BLUE, invoice: PURPLE,
};

const ROLES = ['Project Manager', 'Superintendent', 'Controller', 'VP Operations', 'CEO', 'Owner'];

/* ── step model (stored as jsonb on approval_workflows.steps) ── */
interface ApprovalStep {
  id: string;
  order: number;
  name: string;
  approverType: 'role' | 'user';
  approverValue: string;
  required: boolean;
  autoApproveThreshold: number | null;
  conditionalMinAmount: number | null;
}

/* ── API row shapes ── */
interface Workflow {
  id: string;
  name: string;
  module: EntityType;
  steps: ApprovalStep[];
  active: boolean;
  created_at: string | null;
  updated_at: string | null;
}
interface PendingItem {
  entityType: EntityType;
  entityId: string;
  module: string;
  itemName: string;
  itemAmount: number;
  requestedBy: string | null;
  requestedAt: string | null;
  projectName: string | null;
  workflowId: string | null;
  workflowName: string;
  currentStep: number;
  totalSteps: number;
  status: string;
}
interface HistoryItem {
  entityType: EntityType;
  entityId: string;
  module: string;
  itemName: string;
  itemAmount: number;
  action: 'approved' | 'rejected';
  decidedBy: string;
  decidedAt: string | null;
  comment: string;
}
interface DashboardStat {
  module: string;
  entityType: EntityType;
  pending: number;
  approved: number;
  rejected: number;
  totalAmount: number;
  avgDays: number;
}
interface Delegation {
  id: string;
  from_user: string;
  to_user: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  active: boolean | null;
  created_at: string | null;
}
interface TeamUser { id: string; full_name: string | null; email: string | null; }

/* ── helpers ── */
const uid = () => Math.random().toString(36).slice(2, 10); // local step ids only (not persisted identity)
const fmtCurrency = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};
const fmtDateTime = (d: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return d; }
};

/* ── shared styles ── */
const btnBase = (bg: string, fg: string, outlined = false): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  border: outlined ? `1px solid ${bg}` : `1px solid ${bg}`,
  background: outlined ? 'transparent' : bg,
  color: outlined ? bg : fg,
  transition: 'opacity .15s, filter .15s',
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
});
const card: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginBottom: 12,
  boxShadow: '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)',
  background: BG, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
};
const modalStyle: React.CSSProperties = {
  background: RAISED, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.05)',
  padding: 28, width: 640, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', color: TEXT,
};
const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 12,
  fontSize: 11, fontWeight: 700, background: `color-mix(in srgb, ${color} 13%, transparent)`, color,
});
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, color: DIM,
  borderBottom: `1px solid ${BORDER}`, fontWeight: 700,
};
const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: TEXT, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 20%, transparent)` };

/* ══════════════════════════════════════════════════════════════ */
export default function ApprovalWorkflowsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* data */
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);

  /* wizard */
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [wfName, setWfName] = useState('');
  const [wfModule, setWfModule] = useState<EntityType>('change_order');
  const [wfSteps, setWfSteps] = useState<ApprovalStep[]>([]);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(showWizard, { wfName, wfModule, wfSteps });
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: 'approval-workflow-create',
    draftData: editing ? undefined : { wfName, wfModule, wfSteps },
    restoreDraft: (d) => { const v = d as { wfName: string; wfModule: EntityType; wfSteps: ApprovalStep[] }; setWfName(v.wfName ?? ''); setWfModule(v.wfModule ?? 'change_order'); setWfSteps(v.wfSteps ?? []); setEditing(null); setShowWizard(true); },
  });

  /* action modal */
  const [actionItem, setActionItem] = useState<PendingItem | null>(null);
  const [actionComment, setActionComment] = useState('');

  /* delegation modal */
  const [showDel, setShowDel] = useState(false);
  const [delTo, setDelTo] = useState('');
  const [delStart, setDelStart] = useState('');
  const [delEnd, setDelEnd] = useState('');
  const [delReason, setDelReason] = useState('');

  const [diagramWf, setDiagramWf] = useState<Workflow | null>(null);
  const [deleteWf, setDeleteWf] = useState<Workflow | null>(null);

  /* filters */
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<EntityType | ''>('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'approved' | 'rejected'>('all');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  /* ── loaders ── */
  const j = async (url: string) => { const r = await fetch(url, { credentials: 'same-origin' }); return r.ok ? r.json() : null; };

  const loadWorkflows = useCallback(async () => {
    const d = await j('/api/approvals/workflows');
    setWorkflows(((d?.workflows) || []).map((w: any) => ({
      ...w, module: w.module as EntityType,
      steps: Array.isArray(w.steps) ? w.steps : [],
    })));
  }, []);
  const loadPending = useCallback(async () => { const d = await j('/api/approvals/pending'); setPending(d?.pending || []); }, []);
  const loadHistory = useCallback(async () => { const d = await j('/api/approvals/history'); setHistory(d?.history || []); }, []);
  const loadStats = useCallback(async () => { const d = await j('/api/approvals/dashboard'); setStats(d?.stats || []); }, []);
  const loadDelegations = useCallback(async () => { const d = await j('/api/approvals/delegations'); setDelegations(d?.delegations || []); }, []);
  const loadTeam = useCallback(async () => { const d = await j('/api/team/users'); setTeam(d?.users || []); }, []);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      await Promise.all([loadWorkflows(), loadPending(), loadHistory(), loadStats(), loadDelegations(), loadTeam()]);
    } catch {
      setError('Failed to load approval data. Please retry.');
    } finally { setLoading(false); }
  }, [loadWorkflows, loadPending, loadHistory, loadStats, loadDelegations, loadTeam]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── derived ── */
  const teamOptions = useMemo(() => team.map(u => ({ v: u.id, label: u.full_name || u.email || u.id })), [team]);
  const userLabel = useCallback((id: string) => teamOptions.find(o => o.v === id)?.label || id, [teamOptions]);

  const filteredWorkflows = useMemo(() => {
    let list = workflows;
    if (search) list = list.filter(w => w.name.toLowerCase().includes(search.toLowerCase()));
    if (moduleFilter) list = list.filter(w => w.module === moduleFilter);
    return list;
  }, [workflows, search, moduleFilter]);
  const filteredPending = useMemo(() => moduleFilter ? pending.filter(p => p.entityType === moduleFilter) : pending, [pending, moduleFilter]);
  const filteredHistory = useMemo(() => {
    let list = history;
    if (moduleFilter) list = list.filter(h => h.entityType === moduleFilter);
    if (historyFilter !== 'all') list = list.filter(h => h.action === historyFilter);
    return list;
  }, [history, moduleFilter, historyFilter]);

  /* ── wizard actions ── */
  const openCreate = () => {
    setEditing(null); setWfName(''); setWfModule('change_order');
    setWfSteps([{ id: uid(), order: 1, name: 'Step 1', approverType: 'role', approverValue: ROLES[0], required: true, autoApproveThreshold: null, conditionalMinAmount: null }]);
    setWizardStep(0); setShowWizard(true);
  };
  const openEdit = (wf: Workflow) => {
    setEditing(wf); setWfName(wf.name); setWfModule(wf.module);
    setWfSteps((wf.steps || []).map(s => ({ ...s, id: s.id || uid() })));
    setWizardStep(0); setShowWizard(true);
  };
  const addStep = () => setWfSteps(prev => [...prev, { id: uid(), order: prev.length + 1, name: `Step ${prev.length + 1}`, approverType: 'role', approverValue: ROLES[0], required: true, autoApproveThreshold: null, conditionalMinAmount: null }]);
  const removeStep = (id: string) => setWfSteps(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })));
  const updateStep = (id: string, patch: Partial<ApprovalStep>) => setWfSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const moveStep = (id: string, dir: -1 | 1) => setWfSteps(prev => {
    const idx = prev.findIndex(s => s.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === prev.length - 1)) return prev;
    const next = [...prev]; const tmp = next[idx]; next[idx] = next[idx + dir]; next[idx + dir] = tmp;
    return next.map((s, i) => ({ ...s, order: i + 1 }));
  });

  const saveWorkflow = async () => {
    if (!wfName.trim() || wfSteps.length === 0 || busy) return;
    setBusy(true);
    try {
      const payload = { name: wfName.trim(), module: wfModule, steps: wfSteps, active: editing ? editing.active : true };
      const res = editing
        ? await fetch(`/api/approvals/workflows/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/approvals/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      await loadWorkflows();
      setShowWizard(false);
      showToast(editing ? 'Workflow updated.' : 'Workflow created.');
    } catch { showToast('Could not save workflow.'); }
    finally { setBusy(false); }
  };
  const cloneWorkflow = async (wf: Workflow) => {
    setBusy(true);
    try {
      const res = await fetch('/api/approvals/workflows', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wf.name + ' (Copy)', module: wf.module, steps: wf.steps, active: false }),
      });
      if (!res.ok) throw new Error();
      await loadWorkflows(); showToast('Workflow cloned.');
    } catch { showToast('Could not clone.'); } finally { setBusy(false); }
  };
  const toggleWorkflow = async (wf: Workflow) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/workflows/${wf.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !wf.active }) });
      if (!res.ok) throw new Error();
      await loadWorkflows(); showToast(`${wf.name} ${!wf.active ? 'enabled' : 'disabled'}.`);
    } catch { showToast('Could not update.'); } finally { setBusy(false); }
  };
  const doDeleteWorkflow = async (wf: Workflow) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/workflows/${wf.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setDeleteWf(null); await loadWorkflows(); showToast(`"${wf.name}" deleted.`);
    } catch { showToast('Could not delete.'); } finally { setBusy(false); }
  };

  /* ── approval decision (REAL: updates the underlying entity) ── */
  const decide = async (decision: 'approved' | 'rejected') => {
    if (!actionItem || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/approvals/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: actionItem.entityType, entityId: actionItem.entityId, decision, note: actionComment.trim() }),
      });
      const data = res.ok ? await res.json() : null;
      if (!data?.success) throw new Error();
      await Promise.all([loadPending(), loadHistory(), loadStats()]);
      setActionItem(null); setActionComment('');
      if (decision === 'rejected') showToast('Rejected — status updated.');
      else if (data.final) showToast('Approved — status updated.');
      else showToast(`Approved step ${data.step} of ${data.totalSteps}.`);
    } catch { showToast('Could not record decision.'); }
    finally { setBusy(false); }
  };

  /* ── delegations ── */
  const saveDelegation = async () => {
    if (!delTo || !delStart || !delEnd || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/approvals/delegations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUser: delTo, startDate: delStart, endDate: delEnd, reason: delReason.trim() || null }),
      });
      if (!res.ok) throw new Error();
      await loadDelegations();
      setShowDel(false); setDelTo(''); setDelStart(''); setDelEnd(''); setDelReason('');
      showToast('Delegation created.');
    } catch { showToast('Could not create delegation.'); } finally { setBusy(false); }
  };
  const revokeDelegation = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/delegations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }) });
      if (!res.ok) throw new Error();
      await loadDelegations(); showToast('Delegation revoked.');
    } catch { showToast('Could not revoke.'); } finally { setBusy(false); }
  };

  const approverOptions = (t: 'role' | 'user') => t === 'role'
    ? ROLES.map(r => ({ v: r, label: r }))
    : teamOptions;

  /* ── full workflow diagram ── */
  const renderDiagram = (steps: ApprovalStep[]) => {
    const ordered = [...steps].sort((a, b) => a.order - b.order);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '18px 4px' }}>
        <div style={{ minWidth: 66, height: 36, borderRadius: 18, background: `color-mix(in srgb, ${GREEN} 16%, transparent)`, border: `2px solid ${GREEN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: GREEN, flexShrink: 0 }}>Start</div>
        {ordered.map(step => (
          <React.Fragment key={step.id}>
            <ArrowRight size={22} color={GOLD} weight="bold" style={{ margin: '0 6px', flexShrink: 0 }} />
            <div style={{ minWidth: 150, maxWidth: 210, border: `2px solid ${step.required ? BLUE : BORDER}`, borderRadius: 8, padding: '10px 14px', background: BG, flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: DIM, marginBottom: 3, fontWeight: 700 }}>
                Step {step.order}{!step.required && <span style={{ color: AMBER, marginLeft: 6 }}>(Optional)</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{step.name || step.approverValue}</div>
              <div style={{ fontSize: 11, color: DIM }}>
                {step.approverType === 'role' ? 'Role: ' : 'User: '}{step.approverType === 'user' ? userLabel(step.approverValue) : step.approverValue}
              </div>
              {step.autoApproveThreshold !== null && <div style={{ ...badgeStyle(GREEN), marginTop: 6, fontSize: 9 }}>Auto &lt; {fmtCurrency(step.autoApproveThreshold)}</div>}
              {step.conditionalMinAmount !== null && <div style={{ ...badgeStyle(AMBER), marginTop: 4, fontSize: 9 }}>Only &ge; {fmtCurrency(step.conditionalMinAmount)}</div>}
            </div>
          </React.Fragment>
        ))}
        <ArrowRight size={22} color={GOLD} weight="bold" style={{ margin: '0 6px', flexShrink: 0 }} />
        <div style={{ minWidth: 66, height: 36, borderRadius: 18, background: `color-mix(in srgb, ${GOLD} 16%, transparent)`, border: `2px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: GOLD, flexShrink: 0 }}>Done</div>
      </div>
    );
  };
  const renderMini = (wf: Workflow) => {
    const ordered = [...(wf.steps || [])].sort((a, b) => a.order - b.order);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', marginTop: 12 }}>
        <span style={{ fontSize: 9, color: GREEN, fontWeight: 800, padding: '2px 8px', border: `1px solid color-mix(in srgb, ${GREEN} 25%, transparent)`, borderRadius: 10, whiteSpace: 'nowrap' }}>Start</span>
        {ordered.map(step => (
          <React.Fragment key={step.id}>
            <ArrowRight size={12} color={GOLD} weight="bold" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap', border: `1px solid ${step.required ? `color-mix(in srgb, ${BLUE} 31%, transparent)` : BORDER}`, background: BG, color: step.required ? TEXT : DIM }}>
              {step.order}. {step.name || step.approverValue}{step.conditionalMinAmount !== null ? ` (≥${fmtCurrency(step.conditionalMinAmount)})` : ''}
            </div>
          </React.Fragment>
        ))}
        <ArrowRight size={12} color={GOLD} weight="bold" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: GOLD, fontWeight: 800, padding: '2px 8px', border: `1px solid color-mix(in srgb, ${GOLD} 25%, transparent)`, borderRadius: 10, whiteSpace: 'nowrap' }}>Done</span>
      </div>
    );
  };

  /* Vertical FlowSteps view of a chain — used in the diagram + decision modals.
     When an item is mid-chain, steps already cleared get a done check. */
  const chainSteps = (steps: ApprovalStep[], currentStep = 0) =>
    [...steps].sort((a, b) => a.order - b.order).map((s, i) => ({
      title: `${s.name || s.approverValue}${s.required ? '' : ' (Optional)'}`,
      desc: [
        s.approverType === 'user' ? `Approver: ${userLabel(s.approverValue)}` : `Role: ${s.approverValue}`,
        s.autoApproveThreshold !== null ? `auto-approves under ${fmtCurrency(Number(s.autoApproveThreshold) || 0)}` : '',
        s.conditionalMinAmount !== null ? `only runs at ${fmtCurrency(Number(s.conditionalMinAmount) || 0)}+` : '',
      ].filter(Boolean).join(' · '),
      done: currentStep > 0 && i + 1 < currentStep,
    }));

  const tabButton = (t: Tab, label: string, Icon: React.ElementType, count?: number) => (
    <button key={t} onClick={() => setTab(t)} style={{
      ...btnBase(t === tab ? GOLD : BORDER, t === tab ? '#0A0A00' : DIM, t !== tab),
      background: t === tab
        ? 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
      color: t === tab ? '#0A0A00' : DIM,
      border: `1px solid ${t === tab ? 'transparent' : 'var(--border-default)'}`, position: 'relative',
      boxShadow: t === tab ? '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
    }}>
      <Icon size={15} weight={t === tab ? 'fill' : 'bold'} />{label}
      {count !== undefined && count > 0 && (
        <span style={{ marginLeft: 2, background: t === tab ? '#00000022' : RED, color: t === tab ? '#000' : '#fff', borderRadius: 10, minWidth: 18, height: 18, padding: '0 5px', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
      )}
    </button>
  );

  /* ── loading / error ── */
  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <div style={{ minHeight: '52vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'aw-spin 1s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ color: DIM, fontSize: 14 }}>Loading approval workflows…</div>
            <style>{`@keyframes aw-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </PremiumSurface>
    );
  }
  if (error) {
    return (
      <PremiumSurface maxWidth={2200}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <SectionCard>
            <PremiumEmpty
              tone="error"
              icon={<WarningCircle size={30} weight="duotone" color={RED} />}
              title="Couldn't load approval data"
              description={error}
              action={<button style={goldOutlineButtonStyle} className="pmBtn" onClick={loadAll}><ArrowClockwise size={15} weight="bold" />Retry</button>}
            />
          </SectionCard>
        </div>
      </PremiumSurface>
    );
  }

  const activeCount = workflows.filter(w => w.active).length;
  const approvedCount = history.filter(h => h.action === 'approved').length;
  const rejectedCount = history.filter(h => h.action === 'rejected').length;

  /* ══ render ══ */
  return (
    <>
      <style>{`
        .aw-row:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))', color: '#0A0A00', padding: '10px 22px', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} weight="fill" />{toast}
        </div>
      )}
      <PremiumSurface maxWidth={2200}>

        {/* header */}
        <ModuleHero
          eyebrow="Approvals"
          eyebrowIcon={<ListChecks size={13} weight="fill" color={GOLD} />}
          title="Approval"
          accent="Workflows"
          subtitle="Approval chains for change orders, pay apps, POs, and invoices."
          actions={<>
            <button style={ghostButtonStyle} className="pmBtn" onClick={loadAll}><ArrowClockwise size={15} weight="bold" />Refresh</button>
            <button style={goldButtonStyle} className="pmBtn" onClick={openCreate}><Plus size={15} weight="bold" />New Workflow</button>
          </>}
        />

        {/* summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard icon={<TreeStructure size={19} weight="duotone" color={GREEN} />} label="Active Workflows" value={String(activeCount)} accent={GREEN} delay={0.02}  href="/app/approval-workflows"/>
          <StatCard icon={<Power size={19} weight="duotone" color={DIM} />} label="Disabled" value={String(workflows.length - activeCount)} delay={0.06}  href="/app/approval-workflows"/>
          <StatCard icon={<Clock size={19} weight="duotone" color={AMBER} />} label="Pending Approvals" value={String(pending.length)} accent={AMBER} delay={0.10}  href="/app/approval-workflows"/>
          <StatCard icon={<CheckCircle size={19} weight="duotone" color={GREEN} />} label="Approved" value={String(approvedCount)} accent={GREEN} delay={0.14}  href="/app/approval-workflows"/>
          <StatCard icon={<XCircle size={19} weight="duotone" color={RED} />} label="Rejected" value={String(rejectedCount)} accent={RED} delay={0.18}  href="/app/approval-workflows"/>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          {tabButton('pending', 'Pending', Clock, pending.length)}
          {tabButton('templates', 'Templates', TreeStructure)}
          {tabButton('dashboard', 'Dashboard', Gauge)}
          {tabButton('history', 'History', ClipboardText)}
          {tabButton('delegation', 'Delegation', Users)}
        </div>

        {/* filter bar */}
        {(tab === 'templates' || tab === 'pending' || tab === 'history') && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {tab === 'templates' && (
              <div style={{ position: 'relative', maxWidth: 260, flex: '1 1 220px' }}>
                <MagnifyingGlass size={15} color={DIM} weight="bold" style={{ position: 'absolute', left: 10, top: 10 }} />
                <input placeholder="Search workflows…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 32 }} />
              </div>
            )}
            <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value as EntityType | '')} style={{ ...selectStyle, maxWidth: 200 }}>
              <option value="">All Modules</option>
              {ENTITY_TYPES.map(m => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
            </select>
            {tab === 'history' && (
              <select value={historyFilter} onChange={e => setHistoryFilter(e.target.value as any)} style={{ ...selectStyle, maxWidth: 170 }}>
                <option value="all">All Decisions</option>
                <option value="approved">Approved Only</option>
                <option value="rejected">Rejected Only</option>
              </select>
            )}
          </div>
        )}

        {/* ── PENDING ── */}
        {tab === 'pending' && (
          filteredPending.length === 0 ? (
            <SectionCard>
              <PremiumEmpty
                icon={<CheckCircle size={30} weight="duotone" color={GREEN} />}
                title="All caught up"
                description={activeCount > 0
                  ? `Nothing is waiting on you. ${activeCount} active workflow${activeCount === 1 ? '' : 's'} ${activeCount === 1 ? 'is' : 'are'} watching ${Array.from(new Set(workflows.filter(w => w.active).map(w => MODULE_LABEL[w.module]))).join(', ') || 'your modules'} — new submissions land here the moment they need a decision.`
                  : 'Nothing is waiting on you — but no active workflow is routing items yet. Create a template so change orders, pay apps, purchase orders, and invoices require sign-off before they move.'}
                action={activeCount === 0
                  ? <button style={goldButtonStyle} className="pmBtn" onClick={openCreate}><Plus size={15} weight="bold" />Create First Workflow</button>
                  : <button style={goldOutlineButtonStyle} className="pmBtn" onClick={() => setTab('history')}><ClipboardText size={15} weight="bold" />View Decision History</button>}
              />
            </SectionCard>
          ) : (
            <SectionCard flush title="Pending Approvals" icon={<Clock size={17} weight="duotone" color={GOLD} />}>
              <div style={{ overflowX: 'auto' }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: BG }}>
                    <th style={thStyle}>Item</th><th style={thStyle}>Module</th><th style={thStyle}>Amount</th>
                    <th style={thStyle}>Project</th><th style={thStyle}>Submitted</th><th style={thStyle}>Progress</th><th style={thStyle}>Actions</th>
                  </tr></thead>
                  <tbody>
                    {filteredPending.map(p => (
                      <tr key={`${p.entityType}:${p.entityId}`} className="aw-row">
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{p.itemName}</div>
                          <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{p.workflowName} · <span style={{ textTransform: 'capitalize' }}>{p.status.replace(/_/g, ' ')}</span></div>
                        </td>
                        <td style={tdStyle}><span style={badgeStyle(MODULE_COLOR[p.entityType])}>{p.module}</span></td>
                        <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(p.itemAmount)}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: DIM }}>{p.projectName || '—'}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: DIM }}>{fmtDate(p.requestedAt)}</td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ height: 6, background: BORDER, borderRadius: 3, width: 70, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, (p.currentStep / Math.max(1, p.totalSteps)) * 100)}%`, height: '100%', background: GOLD }} />
                            </div>
                            <span style={{ fontSize: 11, color: DIM, whiteSpace: 'nowrap' }}>{p.currentStep > 0 ? `Step ${p.currentStep}/${p.totalSteps}` : `${p.totalSteps} step${p.totalSteps !== 1 ? 's' : ''}`}</span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={{ ...btnBase(GREEN, '#fff'), padding: '5px 11px', fontSize: 12 }} onClick={() => { setActionItem(p); setActionComment(''); }}><CheckCircle size={14} weight="bold" />Approve</button>
                            <button style={{ ...btnBase(RED, '#fff', true), padding: '5px 11px', fontSize: 12 }} onClick={() => { setActionItem(p); setActionComment(''); }}><XCircle size={14} weight="bold" />Reject</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )
        )}

        {/* ── TEMPLATES ── */}
        {tab === 'templates' && (
          <div>
            {filteredWorkflows.length === 0 && (
              <SectionCard>
                <PremiumEmpty
                  icon={<TreeStructure size={30} weight="duotone" color={GOLD} />}
                  title={search || moduleFilter ? 'No templates match your filters' : 'No workflow templates yet'}
                  description={search || moduleFilter
                    ? 'Clear the search or module filter to see every template on this tenant.'
                    : 'A workflow is an ordered approval chain attached to a module — every change order, pay app, purchase order, or invoice that needs sign-off routes through it automatically. Steps can auto-approve small amounts and only engage above dollar thresholds.'}
                  action={<button style={goldButtonStyle} className="pmBtn" onClick={openCreate}><Plus size={15} weight="bold" />New Workflow</button>}
                />
                {!search && !moduleFilter && (
                  <div style={{ maxWidth: 460, margin: '0 auto', padding: '4px 20px 24px' }}>
                    <FlowSteps title="A Typical Change-Order Chain" steps={[
                      { title: 'PM Review', desc: 'Role: Project Manager · auto-approves under $5,000' },
                      { title: 'Controller Sign-Off', desc: 'Role: Controller · every change order' },
                      { title: 'VP Operations', desc: 'Role: VP Operations · only runs at $50,000+' },
                    ]} />
                  </div>
                )}
              </SectionCard>
            )}
            {filteredWorkflows.map(wf => (
              <div key={wf.id} style={{ ...card, opacity: wf.active ? 1 : 0.6, transition: 'opacity .2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{wf.name}</span>
                      <span style={badgeStyle(MODULE_COLOR[wf.module])}>{MODULE_LABEL[wf.module]}</span>
                      <span style={badgeStyle(wf.active ? GREEN : DIM)}>{wf.active ? 'Active' : 'Disabled'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: DIM }}>
                      {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''} · Updated {fmtDate(wf.updated_at)}
                    </div>
                    {wf.steps.some(s => s.conditionalMinAmount !== null) && (
                      <div style={{ fontSize: 11, color: AMBER, marginTop: 4 }}>
                        Conditional routing: {wf.steps.filter(s => s.conditionalMinAmount !== null).map(s => `${s.name || s.approverValue} ≥ ${fmtCurrency(s.conditionalMinAmount!)}`).join('; ')}
                      </div>
                    )}
                    {wf.steps.some(s => s.autoApproveThreshold !== null) && (
                      <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>
                        Auto-approve: {wf.steps.filter(s => s.autoApproveThreshold !== null).map(s => `${s.name || s.approverValue} < ${fmtCurrency(s.autoApproveThreshold!)}`).join('; ')}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button style={btnBase(BLUE, BLUE, true)} onClick={() => setDiagramWf(wf)}><TreeStructure size={14} weight="bold" />Diagram</button>
                    <button style={btnBase(GOLD, GOLD, true)} onClick={() => openEdit(wf)}><PencilSimple size={14} weight="bold" />Edit</button>
                    <button style={btnBase(PURPLE, PURPLE, true)} onClick={() => cloneWorkflow(wf)}><Copy size={14} weight="bold" />Clone</button>
                    <button style={btnBase(wf.active ? AMBER : GREEN, wf.active ? AMBER : GREEN, true)} onClick={() => toggleWorkflow(wf)}><Power size={14} weight="bold" />{wf.active ? 'Disable' : 'Enable'}</button>
                    <button style={btnBase(RED, RED, true)} onClick={() => setDeleteWf(wf)}><Trash size={14} weight="bold" />Delete</button>
                  </div>
                </div>
                {renderMini(wf)}
              </div>
            ))}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (stats.length === 0 ? (
          <SectionCard>
            <PremiumEmpty
              icon={<Gauge size={30} weight="duotone" color={GOLD} />}
              title="Nothing routed yet"
              description="This dashboard aggregates every item that enters an approval chain — pending, approved, rejected, average cycle time, and total dollars routed per module. Submit a change order, pay app, purchase order, or invoice through an active workflow and these numbers build themselves."
              action={activeCount === 0
                ? <button style={goldButtonStyle} className="pmBtn" onClick={openCreate}><Plus size={15} weight="bold" />Create First Workflow</button>
                : <button style={goldOutlineButtonStyle} className="pmBtn" onClick={() => setTab('templates')}><TreeStructure size={15} weight="bold" />Review Templates</button>}
            />
          </SectionCard>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              {stats.map(s => (
                <div key={s.entityType} style={{ ...card, marginBottom: 0 }}>
                  <div style={{ fontSize: 12, color: MODULE_COLOR[s.entityType], fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChartBar size={15} weight="fill" />{s.module}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><div style={{ fontSize: 24, fontWeight: 700, color: AMBER }}>{s.pending}</div><div style={{ fontSize: 10, color: DIM }}>Pending</div></div>
                    <div><div style={{ fontSize: 24, fontWeight: 700, color: GREEN }}>{s.approved}</div><div style={{ fontSize: 10, color: DIM }}>Approved</div></div>
                    <div><div style={{ fontSize: 24, fontWeight: 700, color: RED }}>{s.rejected}</div><div style={{ fontSize: 10, color: DIM }}>Rejected</div></div>
                    <div><div style={{ fontSize: 24, fontWeight: 700, color: BLUE }}>{(Number(s.avgDays) || 0).toFixed(1)}</div><div style={{ fontSize: 10, color: DIM }}>Avg Days</div></div>
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: DIM, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span>Total Value Routed</span>
                    <span style={{ fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(Number(s.totalAmount) || 0)}</span>
                  </div>
                </div>
              ))}
            </div>

            <SectionCard flat title="Approval Pipeline by Module" icon={<Gauge size={17} weight="duotone" color={GOLD} />}>
              {stats.map(s => {
                const total = (Number(s.pending) || 0) + (Number(s.approved) || 0) + (Number(s.rejected) || 0);
                const pc = (n: number) => total > 0 ? (n / total) * 100 : 0;
                return (
                  <div key={s.entityType} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{s.module}</span>
                      <span style={{ fontSize: 12, color: DIM }}>{total} item{total !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: `color-mix(in srgb, ${BORDER} 19%, transparent)` }}>
                      {pc(s.approved) > 0 && <div style={{ width: `${pc(s.approved)}%`, background: GREEN }} />}
                      {pc(s.pending) > 0 && <div style={{ width: `${pc(s.pending)}%`, background: AMBER }} />}
                      {pc(s.rejected) > 0 && <div style={{ width: `${pc(s.rejected)}%`, background: RED }} />}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: GREEN }}>{s.approved} approved</span>
                      <span style={{ fontSize: 10, color: AMBER }}>{s.pending} pending</span>
                      <span style={{ fontSize: 10, color: RED }}>{s.rejected} rejected</span>
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
                {[{ label: 'Approved', color: GREEN }, { label: 'Pending', color: AMBER }, { label: 'Rejected', color: RED }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
                    <span style={{ fontSize: 12, color: DIM }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        ))}

        {/* ── HISTORY ── */}
        {tab === 'history' && (
          <SectionCard flush title="Decision History" icon={<ClipboardText size={17} weight="duotone" color={GOLD} />}>
            {filteredHistory.length === 0 ? (
              <PremiumEmpty compact icon={<ClipboardText size={30} weight="duotone" color={GOLD} />} title="No history yet" description="No decided items match your filters." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: BG }}>
                    <th style={thStyle}>Item</th><th style={thStyle}>Module</th><th style={thStyle}>Amount</th>
                    <th style={thStyle}>Decision</th><th style={thStyle}>Decided By</th><th style={thStyle}>Date</th><th style={thStyle}>Comment</th>
                  </tr></thead>
                  <tbody>
                    {filteredHistory.map(h => (
                      <tr key={`${h.entityType}:${h.entityId}`} className="aw-row">
                        <td style={tdStyle}><div style={{ fontWeight: 600 }}>{h.itemName}</div></td>
                        <td style={tdStyle}><span style={badgeStyle(MODULE_COLOR[h.entityType])}>{h.module}</span></td>
                        <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(h.itemAmount)}</td>
                        <td style={tdStyle}>
                          <span style={badgeStyle(h.action === 'approved' ? GREEN : RED)}>
                            {h.action === 'approved' ? <CheckCircle size={12} weight="fill" /> : <XCircle size={12} weight="fill" />}
                            {h.action === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{h.decidedBy}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: DIM, whiteSpace: 'nowrap' }}>{fmtDateTime(h.decidedAt)}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: DIM, maxWidth: 240 }}>{h.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── DELEGATION ── */}
        {tab === 'delegation' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 13, color: DIM, maxWidth: 560 }}>
                Delegate your approval authority to a teammate while you are out of office. Delegations are recorded per tenant and can be revoked at any time.
              </div>
              <button style={goldButtonStyle} className="pmBtn" onClick={() => setShowDel(true)}><Plus size={15} weight="bold" />New Delegation</button>
            </div>
            {delegations.length === 0 ? (
              <PremiumEmpty
                icon={<Users size={30} weight="duotone" color={GOLD} />}
                title="No delegations configured"
                description="Delegate your approval authority to a teammate while you're out of office."
                action={<button style={goldButtonStyle} className="pmBtn" onClick={() => setShowDel(true)}><Plus size={15} weight="bold" />New Delegation</button>}
              />
            ) : delegations.map(d => (
              <div key={d.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{d.from_user}</span>
                      <ArrowRight size={18} color={GOLD} weight="bold" />
                      <span style={{ fontWeight: 700, color: BLUE, fontSize: 15 }}>{userLabel(d.to_user)}</span>
                      <span style={badgeStyle(d.active ? GREEN : DIM)}>{d.active ? 'Active' : 'Revoked'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: DIM }}>
                      {fmtDate(d.start_date)} through {fmtDate(d.end_date)}{d.reason ? ` · ${d.reason}` : ''}
                    </div>
                  </div>
                  {d.active && <button style={btnBase(RED, RED, true)} onClick={() => revokeDelegation(d.id)}><XCircle size={14} weight="bold" />Revoke</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </PremiumSurface>

      {/* ══ WIZARD ══ */}
      {showWizard && (
        <div style={overlayStyle} onClick={() => setShowWizard(false)}>
          <div style={{ ...modalStyle, width: 740 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: GOLD }}>{editing ? 'Edit Workflow' : 'Create New Workflow'}</h2>
              <button style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'flex' }} onClick={() => setShowWizard(false)}><X size={22} weight="bold" /></button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {['Name & Module', 'Approval Steps', 'Review & Save'].map((label, i) => (
                <div key={i} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: wizardStep === i ? `color-mix(in srgb, ${GOLD} 13%, transparent)` : BG, color: wizardStep === i ? GOLD : wizardStep > i ? GREEN : DIM,
                  border: `1px solid ${wizardStep === i ? GOLD : wizardStep > i ? `color-mix(in srgb, ${GREEN} 31%, transparent)` : BORDER}`,
                }} onClick={() => setWizardStep(i)}>{wizardStep > i ? <Check size={12} weight="bold" color={GREEN} style={{ verticalAlign: '-1px', marginRight: 4 }} /> : null}{i + 1}. {label}</div>
              ))}
            </div>

            {wizardStep === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Workflow Name *</label>
                  <input style={inputStyle} value={wfName} onChange={e => setWfName(e.target.value)} placeholder="e.g. Standard Change Order Approval" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Module *</label>
                  <select style={selectStyle} value={wfModule} onChange={e => setWfModule(e.target.value as EntityType)}>
                    {ENTITY_TYPES.map(m => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 6 }}>Applies to all {MODULE_LABEL[wfModule]} that require approval.</div>
                </div>
              </div>
            )}

            {wizardStep === 1 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: DIM }}>Define the approval chain in order.</span>
                  <button className="btn-gold" style={{ padding: '7px 14px', fontSize: 12.5, cursor: 'pointer' }} onClick={addStep}><Plus size={14} weight="bold" />Add Step</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {wfSteps.map(step => (
                    <div key={step.id} style={{ padding: 16, background: BG, borderRadius: 8, border: `1px solid ${step.required ? `color-mix(in srgb, ${BLUE} 31%, transparent)` : BORDER}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>Step {step.order}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={{ background: 'none', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 4, padding: '4px 7px', cursor: 'pointer', display: 'flex' }} onClick={() => moveStep(step.id, -1)}><CaretUp size={13} weight="bold" /></button>
                          <button style={{ background: 'none', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 4, padding: '4px 7px', cursor: 'pointer', display: 'flex' }} onClick={() => moveStep(step.id, 1)}><CaretDown size={13} weight="bold" /></button>
                          {wfSteps.length > 1 && <button style={{ background: 'none', border: `1px solid color-mix(in srgb, ${RED} 25%, transparent)`, color: RED, borderRadius: 4, padding: '4px 7px', cursor: 'pointer', display: 'flex' }} onClick={() => removeStep(step.id)}><Trash size={13} weight="bold" /></button>}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Step Name</label>
                          <input style={inputStyle} value={step.name} onChange={e => updateStep(step.id, { name: e.target.value })} placeholder="e.g. PM Review" />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Approver Type</label>
                          <select style={selectStyle} value={step.approverType} onChange={e => {
                            const t = e.target.value as 'role' | 'user';
                            updateStep(step.id, { approverType: t, approverValue: t === 'role' ? ROLES[0] : (teamOptions[0]?.v || '') });
                          }}>
                            <option value="role">Role</option>
                            <option value="user">Specific User</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>{step.approverType === 'role' ? 'Role' : 'User'}</label>
                          <select style={selectStyle} value={step.approverValue} onChange={e => updateStep(step.id, { approverValue: e.target.value })}>
                            {step.approverType === 'user' && teamOptions.length === 0 && <option value="">No teammates found</option>}
                            {approverOptions(step.approverType).map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Required / Optional</label>
                          <select style={selectStyle} value={step.required ? 'required' : 'optional'} onChange={e => updateStep(step.id, { required: e.target.value === 'required' })}>
                            <option value="required">Required</option>
                            <option value="optional">Optional</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Auto-Approve Below ($)</label>
                          <input style={inputStyle} type="number" placeholder="None" value={step.autoApproveThreshold ?? ''} onChange={e => updateStep(step.id, { autoApproveThreshold: e.target.value ? Number(e.target.value) : null })} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Only If Amount ≥ ($)</label>
                          <input style={inputStyle} type="number" placeholder="Always" value={step.conditionalMinAmount ?? ''} onChange={e => updateStep(step.id, { conditionalMinAmount: e.target.value ? Number(e.target.value) : null })} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 }}>Workflow Name</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{wfName || '(unnamed)'}</div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 }}>Module</div>
                  <span style={badgeStyle(MODULE_COLOR[wfModule])}>{MODULE_LABEL[wfModule]}</span>
                </div>
                <div style={{ fontSize: 13, color: DIM, marginBottom: 4, fontWeight: 600 }}>Visual Workflow ({wfSteps.length} step{wfSteps.length !== 1 ? 's' : ''})</div>
                <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', marginBottom: 16, overflowX: 'auto' }}>{renderDiagram(wfSteps)}</div>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 8, fontWeight: 600 }}>Step Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {wfSteps.map(step => (
                    <div key={step.id} style={{ padding: '8px 14px', background: BG, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13 }}>
                      <span style={{ color: GOLD, fontWeight: 700 }}>Step {step.order}:</span>{' '}
                      <span style={{ fontWeight: 600 }}>{step.name}</span>{' '}
                      <span style={{ color: DIM }}>({step.approverType === 'user' ? userLabel(step.approverValue) : step.approverValue})</span>{' '}
                      {step.required ? <span style={{ color: BLUE }}>[Required]</span> : <span style={{ color: AMBER }}>[Optional]</span>}
                      {step.autoApproveThreshold !== null && <span style={{ color: GREEN }}> · auto &lt; {fmtCurrency(step.autoApproveThreshold)}</span>}
                      {step.conditionalMinAmount !== null && <span style={{ color: AMBER }}> · only ≥ {fmtCurrency(step.conditionalMinAmount)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 18, borderTop: `1px solid ${BORDER}` }}>
              <button style={btnBase(BORDER, DIM, true)} onClick={() => wizardStep > 0 ? setWizardStep(wizardStep - 1) : setShowWizard(false)}>{wizardStep === 0 ? 'Cancel' : 'Back'}</button>
              {wizardStep < 2 ? (
                <button style={{ ...btnBase(GOLD, '#0A0A00'), opacity: wizardStep === 0 && !wfName.trim() ? 0.4 : 1, pointerEvents: wizardStep === 0 && !wfName.trim() ? 'none' : 'auto' }} onClick={() => setWizardStep(wizardStep + 1)}>Next</button>
              ) : (
                <button style={{ ...btnBase(GREEN, '#fff'), opacity: !wfName.trim() || wfSteps.length === 0 || busy ? 0.5 : 1, pointerEvents: !wfName.trim() || wfSteps.length === 0 || busy ? 'none' : 'auto' }} onClick={saveWorkflow}>
                  <CheckCircle size={15} weight="bold" />{editing ? 'Save Changes' : 'Create Workflow'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ ACTION MODAL ══ */}
      {actionItem && (
        <div style={overlayStyle} onClick={() => setActionItem(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: GOLD }}>Review Approval Request</h2>
            <div style={{ padding: 16, background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{actionItem.itemName}</span>
                <span style={badgeStyle(MODULE_COLOR[actionItem.entityType])}>{actionItem.module}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                <div><span style={{ color: DIM }}>Amount: </span><span style={{ fontWeight: 700 }}>{fmtCurrency(actionItem.itemAmount)}</span></div>
                <div><span style={{ color: DIM }}>Project: </span><span>{actionItem.projectName || '—'}</span></div>
                <div><span style={{ color: DIM }}>Workflow: </span><span>{actionItem.workflowName}</span></div>
                <div><span style={{ color: DIM }}>Current Status: </span><span style={{ textTransform: 'capitalize' }}>{actionItem.status.replace(/_/g, ' ')}</span></div>
                <div><span style={{ color: DIM }}>Submitted: </span><span>{fmtDate(actionItem.requestedAt)}</span></div>
                <div><span style={{ color: DIM }}>Progress: </span><span>{actionItem.currentStep > 0 ? `Step ${actionItem.currentStep} of ${actionItem.totalSteps}` : `${actionItem.totalSteps} step chain`}</span></div>
              </div>
            </div>
            {(() => {
              const wf = workflows.find(w => w.id === actionItem.workflowId);
              if (!wf || !wf.steps.length) return null;
              return (
                <div style={{ padding: 16, background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, marginBottom: 16 }}>
                  <FlowSteps title={`Chain — ${wf.name}`} steps={chainSteps(wf.steps, actionItem.currentStep)} />
                </div>
              );
            })()}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Comment (Optional)</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} value={actionComment} onChange={e => setActionComment(e.target.value)} placeholder="Reason for your decision…" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={btnBase(BORDER, DIM, true)} onClick={() => setActionItem(null)}>Cancel</button>
              <button style={{ ...btnBase(RED, '#fff'), opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => decide('rejected')}><XCircle size={15} weight="bold" />Reject</button>
              <button style={{ ...btnBase(GREEN, '#fff'), opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => decide('approved')}><CheckCircle size={15} weight="bold" />Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DIAGRAM MODAL ══ */}
      {diagramWf && (
        <div style={overlayStyle} onClick={() => setDiagramWf(null)}>
          <div style={{ ...modalStyle, width: 920 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: GOLD }}>{diagramWf.name}</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={badgeStyle(MODULE_COLOR[diagramWf.module])}>{MODULE_LABEL[diagramWf.module]}</span>
                  <span style={badgeStyle(diagramWf.active ? GREEN : DIM)}>{diagramWf.active ? 'Active' : 'Disabled'}</span>
                  <span style={{ fontSize: 11, color: DIM }}>{diagramWf.steps.length} steps</span>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'flex' }} onClick={() => setDiagramWf(null)}><X size={22} weight="bold" /></button>
            </div>
            <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', overflowX: 'auto' }}>{renderDiagram(diagramWf.steps)}</div>
            <div style={{ marginTop: 16, padding: 16, background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
              <FlowSteps title="Chain Sequence" steps={chainSteps(diagramWf.steps)} />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Step Details</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...thStyle, background: BG }}>#</th><th style={{ ...thStyle, background: BG }}>Name</th><th style={{ ...thStyle, background: BG }}>Approver</th>
                    <th style={{ ...thStyle, background: BG }}>Type</th><th style={{ ...thStyle, background: BG }}>Required</th><th style={{ ...thStyle, background: BG }}>Auto</th><th style={{ ...thStyle, background: BG }}>Condition</th>
                  </tr></thead>
                  <tbody>
                    {[...diagramWf.steps].sort((a, b) => a.order - b.order).map(s => (
                      <tr key={s.id}>
                        <td style={tdStyle}>{s.order}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{s.name}</td>
                        <td style={tdStyle}>{s.approverType === 'user' ? userLabel(s.approverValue) : s.approverValue}</td>
                        <td style={tdStyle}><span style={badgeStyle(s.approverType === 'role' ? BLUE : PURPLE)}>{s.approverType === 'role' ? 'Role' : 'User'}</span></td>
                        <td style={tdStyle}>{s.required ? <span style={{ color: GREEN }}>Yes</span> : <span style={{ color: AMBER }}>No</span>}</td>
                        <td style={tdStyle}>{s.autoApproveThreshold !== null ? fmtCurrency(s.autoApproveThreshold) : '—'}</td>
                        <td style={tdStyle}>{s.conditionalMinAmount !== null ? `≥ ${fmtCurrency(s.conditionalMinAmount)}` : 'Always'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ DELETE CONFIRM ══ */}
      {deleteWf && (
        <div style={overlayStyle} onClick={() => setDeleteWf(null)}>
          <div style={{ ...modalStyle, width: 440 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: RED, display: 'flex', alignItems: 'center', gap: 8 }}><Trash size={20} weight="fill" />Delete Workflow</h2>
            <p style={{ color: DIM, fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>Permanently delete <strong style={{ color: TEXT }}>{deleteWf.name}</strong>? This cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={btnBase(BORDER, DIM, true)} onClick={() => setDeleteWf(null)}>Cancel</button>
              <button style={{ ...btnBase(RED, '#fff'), opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => doDeleteWorkflow(deleteWf)}>Delete Workflow</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ NEW DELEGATION ══ */}
      {showDel && (
        <div style={overlayStyle} onClick={() => setShowDel(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: GOLD }}>New Approval Delegation</h2>
              <button style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'flex' }} onClick={() => setShowDel(false)}><X size={22} weight="bold" /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Delegate To *</label>
                <select style={selectStyle} value={delTo} onChange={e => setDelTo(e.target.value)}>
                  <option value="">Select a teammate…</option>
                  {teamOptions.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
                {teamOptions.length === 0 && <div style={{ fontSize: 11, color: AMBER, marginTop: 4 }}>No teammates found on this tenant.</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Start Date *</label>
                  <SaguaroDatePicker style={inputStyle} value={delStart} onChange={v => setDelStart(v)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>End Date *</label>
                  <SaguaroDatePicker style={inputStyle} value={delEnd} onChange={v => setDelEnd(v)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Reason (Optional)</label>
                <input style={inputStyle} value={delReason} onChange={e => setDelReason(e.target.value)} placeholder="e.g. Vacation, Conference" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 18, borderTop: `1px solid ${BORDER}` }}>
              <button style={btnBase(BORDER, DIM, true)} onClick={() => setShowDel(false)}>Cancel</button>
              <button style={{ ...btnBase(GREEN, '#fff'), opacity: !delTo || !delStart || !delEnd || busy ? 0.5 : 1, pointerEvents: !delTo || !delStart || !delEnd || busy ? 'none' : 'auto' }} onClick={saveDelegation}>Create Delegation</button>
            </div>
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </>
  );
}
