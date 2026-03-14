'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

/* ── palette ── */
const GOLD = '#D4A017';
const BG = '#07101C';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';
const PURPLE = '#8B5CF6';

/* ── types ── */
type Module = 'Change Orders' | 'Pay Apps' | 'Purchase Orders' | 'Invoices' | 'Budget Transfers';
type Tab = 'templates' | 'pending' | 'history' | 'dashboard' | 'delegation';

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

interface Workflow {
  id: string;
  name: string;
  module: Module;
  enabled: boolean;
  steps: ApprovalStep[];
  createdAt: string;
  updatedAt: string;
}

interface PendingApproval {
  id: string;
  workflowId: string;
  workflowName: string;
  module: Module;
  itemName: string;
  itemAmount: number;
  requestedBy: string;
  requestedAt: string;
  currentStep: number;
  totalSteps: number;
  status: 'pending' | 'approved' | 'rejected';
}

interface ApprovalHistoryEntry {
  id: string;
  workflowName: string;
  module: Module;
  itemName: string;
  itemAmount: number;
  action: 'approved' | 'rejected';
  decidedBy: string;
  decidedAt: string;
  comment: string;
}

interface Delegation {
  id: string;
  fromUser: string;
  toUser: string;
  startDate: string;
  endDate: string;
  reason: string;
  active: boolean;
}

interface DashboardStat {
  module: Module;
  pending: number;
  approved: number;
  rejected: number;
  avgDays: number;
}

const MODULES: Module[] = ['Change Orders', 'Pay Apps', 'Purchase Orders', 'Invoices', 'Budget Transfers'];
const ROLES = ['Project Manager', 'Superintendent', 'Controller', 'VP Operations', 'CEO', 'Owner'];
const USERS = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Williams', 'Tom Brown', 'Lisa Davis'];

/* ── helpers ── */
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtCurrency = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 });
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};
const fmtDateTime = (d: string) => {
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return d; }
};

/* ── mock data generators ── */
function generateMockWorkflows(): Workflow[] {
  return [
    {
      id: uid(), name: 'Standard CO Approval', module: 'Change Orders', enabled: true,
      steps: [
        { id: uid(), order: 1, name: 'PM Review', approverType: 'role', approverValue: 'Project Manager', required: true, autoApproveThreshold: 500, conditionalMinAmount: null },
        { id: uid(), order: 2, name: 'VP Sign-off', approverType: 'role', approverValue: 'VP Operations', required: true, autoApproveThreshold: null, conditionalMinAmount: 5000 },
        { id: uid(), order: 3, name: 'Executive Approval', approverType: 'role', approverValue: 'CEO', required: true, autoApproveThreshold: null, conditionalMinAmount: 25000 },
      ],
      createdAt: '2025-11-15T10:00:00Z', updatedAt: '2026-01-20T14:30:00Z',
    },
    {
      id: uid(), name: 'Pay App Review', module: 'Pay Apps', enabled: true,
      steps: [
        { id: uid(), order: 1, name: 'Field Verification', approverType: 'role', approverValue: 'Superintendent', required: true, autoApproveThreshold: null, conditionalMinAmount: null },
        { id: uid(), order: 2, name: 'Accounting Review', approverType: 'role', approverValue: 'Controller', required: true, autoApproveThreshold: null, conditionalMinAmount: null },
      ],
      createdAt: '2025-12-01T09:00:00Z', updatedAt: '2026-02-10T11:15:00Z',
    },
    {
      id: uid(), name: 'PO Approval Chain', module: 'Purchase Orders', enabled: true,
      steps: [
        { id: uid(), order: 1, name: 'Buyer Approval', approverType: 'user', approverValue: 'Jane Doe', required: true, autoApproveThreshold: 1000, conditionalMinAmount: null },
        { id: uid(), order: 2, name: 'Finance Check', approverType: 'role', approverValue: 'Controller', required: true, autoApproveThreshold: null, conditionalMinAmount: 10000 },
      ],
      createdAt: '2026-01-05T08:00:00Z', updatedAt: '2026-03-01T16:45:00Z',
    },
    {
      id: uid(), name: 'Invoice Processing', module: 'Invoices', enabled: false,
      steps: [
        { id: uid(), order: 1, name: 'PM Approval', approverType: 'role', approverValue: 'Project Manager', required: true, autoApproveThreshold: 2000, conditionalMinAmount: null },
      ],
      createdAt: '2026-02-01T12:00:00Z', updatedAt: '2026-02-28T09:30:00Z',
    },
    {
      id: uid(), name: 'Budget Transfer Review', module: 'Budget Transfers', enabled: true,
      steps: [
        { id: uid(), order: 1, name: 'Controller Review', approverType: 'role', approverValue: 'Controller', required: true, autoApproveThreshold: null, conditionalMinAmount: null },
        { id: uid(), order: 2, name: 'VP Approval', approverType: 'role', approverValue: 'VP Operations', required: false, autoApproveThreshold: null, conditionalMinAmount: 15000 },
      ],
      createdAt: '2026-01-20T07:00:00Z', updatedAt: '2026-03-05T13:00:00Z',
    },
  ];
}

function generateMockPending(): PendingApproval[] {
  return [
    { id: uid(), workflowId: '', workflowName: 'Standard CO Approval', module: 'Change Orders', itemName: 'CO #0042 - Extra Foundation Work', itemAmount: 18500, requestedBy: 'Mike Johnson', requestedAt: '2026-03-10T09:15:00Z', currentStep: 2, totalSteps: 3, status: 'pending' },
    { id: uid(), workflowId: '', workflowName: 'Pay App Review', module: 'Pay Apps', itemName: 'Pay App #7 - March 2026', itemAmount: 145000, requestedBy: 'Sarah Williams', requestedAt: '2026-03-08T14:00:00Z', currentStep: 1, totalSteps: 2, status: 'pending' },
    { id: uid(), workflowId: '', workflowName: 'PO Approval Chain', module: 'Purchase Orders', itemName: 'PO #318 - Steel Beams', itemAmount: 32000, requestedBy: 'Tom Brown', requestedAt: '2026-03-11T11:30:00Z', currentStep: 2, totalSteps: 2, status: 'pending' },
    { id: uid(), workflowId: '', workflowName: 'Standard CO Approval', module: 'Change Orders', itemName: 'CO #0043 - Electrical Reroute', itemAmount: 4200, requestedBy: 'Jane Doe', requestedAt: '2026-03-12T08:00:00Z', currentStep: 1, totalSteps: 3, status: 'pending' },
    { id: uid(), workflowId: '', workflowName: 'Budget Transfer Review', module: 'Budget Transfers', itemName: 'BT-015 - Contingency to Electrical', itemAmount: 22000, requestedBy: 'Lisa Davis', requestedAt: '2026-03-09T16:45:00Z', currentStep: 1, totalSteps: 2, status: 'pending' },
    { id: uid(), workflowId: '', workflowName: 'Invoice Processing', module: 'Invoices', itemName: 'INV-2088 - Lumber Supply Co', itemAmount: 8750, requestedBy: 'John Smith', requestedAt: '2026-03-11T07:20:00Z', currentStep: 1, totalSteps: 1, status: 'pending' },
  ];
}

function generateMockHistory(): ApprovalHistoryEntry[] {
  return [
    { id: uid(), workflowName: 'Standard CO Approval', module: 'Change Orders', itemName: 'CO #0040 - Plumbing Revision', itemAmount: 6800, action: 'approved', decidedBy: 'You', decidedAt: '2026-03-07T10:00:00Z', comment: 'Approved per field report.' },
    { id: uid(), workflowName: 'Pay App Review', module: 'Pay Apps', itemName: 'Pay App #6 - February 2026', itemAmount: 132000, action: 'approved', decidedBy: 'You', decidedAt: '2026-03-04T15:30:00Z', comment: 'All line items verified.' },
    { id: uid(), workflowName: 'PO Approval Chain', module: 'Purchase Orders', itemName: 'PO #310 - HVAC Units', itemAmount: 48000, action: 'rejected', decidedBy: 'You', decidedAt: '2026-03-02T09:00:00Z', comment: 'Quote expired; need updated pricing.' },
    { id: uid(), workflowName: 'Standard CO Approval', module: 'Change Orders', itemName: 'CO #0039 - Grading Adjustment', itemAmount: 3500, action: 'approved', decidedBy: 'You', decidedAt: '2026-02-28T11:45:00Z', comment: '' },
    { id: uid(), workflowName: 'Budget Transfer Review', module: 'Budget Transfers', itemName: 'BT-012 - Landscaping Realloc', itemAmount: 8000, action: 'approved', decidedBy: 'You', decidedAt: '2026-02-25T14:00:00Z', comment: 'Owner approved reallocation.' },
    { id: uid(), workflowName: 'Invoice Processing', module: 'Invoices', itemName: 'INV-1022 - Concrete Supply', itemAmount: 15600, action: 'approved', decidedBy: 'You', decidedAt: '2026-02-20T08:15:00Z', comment: '' },
    { id: uid(), workflowName: 'PO Approval Chain', module: 'Purchase Orders', itemName: 'PO #305 - Rebar Shipment', itemAmount: 21400, action: 'approved', decidedBy: 'You', decidedAt: '2026-02-18T13:30:00Z', comment: 'Verified against budget.' },
    { id: uid(), workflowName: 'Standard CO Approval', module: 'Change Orders', itemName: 'CO #0037 - Window Upgrade', itemAmount: 12200, action: 'rejected', decidedBy: 'You', decidedAt: '2026-02-15T09:00:00Z', comment: 'Not in scope; needs owner approval first.' },
  ];
}

function generateMockDashboard(): DashboardStat[] {
  return [
    { module: 'Change Orders', pending: 4, approved: 18, rejected: 2, avgDays: 2.3 },
    { module: 'Pay Apps', pending: 2, approved: 7, rejected: 0, avgDays: 3.1 },
    { module: 'Purchase Orders', pending: 3, approved: 22, rejected: 5, avgDays: 1.8 },
    { module: 'Invoices', pending: 1, approved: 34, rejected: 3, avgDays: 1.2 },
    { module: 'Budget Transfers', pending: 2, approved: 9, rejected: 1, avgDays: 2.7 },
  ];
}

function generateMockDelegations(): Delegation[] {
  return [
    { id: uid(), fromUser: 'You', toUser: 'Jane Doe', startDate: '2026-03-20', endDate: '2026-03-27', reason: 'Vacation - Spring Break', active: false },
  ];
}

/* ── shared styles ── */
const btnBase = (bg: string, fg: string, outlined = false): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  border: outlined ? `1px solid ${bg}` : 'none',
  background: outlined ? 'transparent' : bg,
  color: outlined ? bg : fg,
  transition: 'opacity .15s, filter .15s',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

const card: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`,
  background: BG, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
  padding: 28, width: 640, maxHeight: '85vh', overflowY: 'auto', color: TEXT,
};

const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: 12,
  fontSize: 11, fontWeight: 700, background: color + '22', color,
});

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, color: DIM,
  borderBottom: `1px solid ${BORDER}`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: 13, color: TEXT, borderBottom: `1px solid ${BORDER}20`,
};

const MODULE_COLORS: Record<Module, string> = {
  'Change Orders': AMBER, 'Pay Apps': GREEN, 'Purchase Orders': BLUE,
  'Invoices': PURPLE, 'Budget Transfers': GOLD,
};

/* ── main component ── */
export default function ApprovalWorkflowsPage() {
  const [tab, setTab] = useState<Tab>('templates');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* data state */
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [historyLog, setHistoryLog] = useState<ApprovalHistoryEntry[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStat[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);

  /* wizard state */
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [wfName, setWfName] = useState('');
  const [wfModule, setWfModule] = useState<Module>('Change Orders');
  const [wfSteps, setWfSteps] = useState<ApprovalStep[]>([]);

  /* approval action modal */
  const [actionModal, setActionModal] = useState<PendingApproval | null>(null);
  const [actionComment, setActionComment] = useState('');

  /* delegation modal */
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delToUser, setDelToUser] = useState('');
  const [delStart, setDelStart] = useState('');
  const [delEnd, setDelEnd] = useState('');
  const [delReason, setDelReason] = useState('');

  /* diagram modal */
  const [diagramWorkflow, setDiagramWorkflow] = useState<Workflow | null>(null);

  /* delete confirm */
  const [deleteConfirm, setDeleteConfirm] = useState<Workflow | null>(null);

  /* search / filter */
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<Module | ''>('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'approved' | 'rejected'>('all');

  /* ── toast helper ── */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── data loading ── */
  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await new Promise(r => setTimeout(r, 600));
      setWorkflows(generateMockWorkflows());
      setPendingApprovals(generateMockPending());
      setHistoryLog(generateMockHistory());
      setDashboardStats(generateMockDashboard());
      setDelegations(generateMockDelegations());
    } catch {
      setError('Failed to load approval workflow data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── filtered data ── */
  const filteredWorkflows = useMemo(() => {
    let list = workflows;
    if (search) list = list.filter(w => w.name.toLowerCase().includes(search.toLowerCase()));
    if (moduleFilter) list = list.filter(w => w.module === moduleFilter);
    return list;
  }, [workflows, search, moduleFilter]);

  const filteredPending = useMemo(() => {
    let list = pendingApprovals;
    if (moduleFilter) list = list.filter(p => p.module === moduleFilter);
    return list;
  }, [pendingApprovals, moduleFilter]);

  const filteredHistory = useMemo(() => {
    let list = historyLog;
    if (moduleFilter) list = list.filter(h => h.module === moduleFilter);
    if (historyFilter !== 'all') list = list.filter(h => h.action === historyFilter);
    return list;
  }, [historyLog, moduleFilter, historyFilter]);

  /* ── wizard actions ── */
  const openCreateWizard = () => {
    setEditingWorkflow(null);
    setWfName('');
    setWfModule('Change Orders');
    setWfSteps([{
      id: uid(), order: 1, name: 'Step 1', approverType: 'role', approverValue: 'Project Manager',
      required: true, autoApproveThreshold: null, conditionalMinAmount: null,
    }]);
    setWizardStep(0);
    setShowWizard(true);
  };

  const openEditWizard = (wf: Workflow) => {
    setEditingWorkflow(wf);
    setWfName(wf.name);
    setWfModule(wf.module);
    setWfSteps(wf.steps.map(s => ({ ...s })));
    setWizardStep(0);
    setShowWizard(true);
  };

  const cloneWorkflow = (wf: Workflow) => {
    const cloned: Workflow = {
      ...wf, id: uid(), name: wf.name + ' (Copy)',
      steps: wf.steps.map(s => ({ ...s, id: uid() })),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setWorkflows(prev => [...prev, cloned]);
    showToast('Workflow cloned successfully.');
  };

  const addWizardStep = () => {
    setWfSteps(prev => [...prev, {
      id: uid(), order: prev.length + 1, name: `Step ${prev.length + 1}`,
      approverType: 'role', approverValue: ROLES[0],
      required: true, autoApproveThreshold: null, conditionalMinAmount: null,
    }]);
  };

  const removeWizardStep = (id: string) => {
    setWfSteps(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1, name: s.name || `Step ${i + 1}` })));
  };

  const updateWizardStep = (id: string, patch: Partial<ApprovalStep>) => {
    setWfSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const moveWizardStep = (id: string, dir: -1 | 1) => {
    setWfSteps(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if ((dir === -1 && idx === 0) || (dir === 1 && idx === prev.length - 1)) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[idx + dir];
      next[idx + dir] = tmp;
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  };

  const saveWorkflow = async () => {
    if (!wfName.trim() || wfSteps.length === 0) return;
    const now = new Date().toISOString();
    if (editingWorkflow) {
      setWorkflows(prev => prev.map(w => w.id === editingWorkflow.id
        ? { ...w, name: wfName, module: wfModule, steps: wfSteps, updatedAt: now }
        : w
      ));
      showToast('Workflow updated successfully.');
    } else {
      const newWf: Workflow = {
        id: uid(), name: wfName, module: wfModule, enabled: true,
        steps: wfSteps, createdAt: now, updatedAt: now,
      };
      setWorkflows(prev => [...prev, newWf]);
      showToast('Workflow created successfully.');
    }
    setShowWizard(false);
  };

  const toggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(w => {
      if (w.id !== id) return w;
      const next = { ...w, enabled: !w.enabled, updatedAt: new Date().toISOString() };
      showToast(`${next.name} ${next.enabled ? 'enabled' : 'disabled'}.`);
      return next;
    }));
  };

  const deleteWorkflow = (wf: Workflow) => {
    setWorkflows(prev => prev.filter(w => w.id !== wf.id));
    setDeleteConfirm(null);
    showToast(`"${wf.name}" deleted.`);
  };

  /* ── approval actions ── */
  const handleApprovalAction = (action: 'approved' | 'rejected') => {
    if (!actionModal) return;
    const entry: ApprovalHistoryEntry = {
      id: uid(), workflowName: actionModal.workflowName, module: actionModal.module,
      itemName: actionModal.itemName, itemAmount: actionModal.itemAmount,
      action, decidedBy: 'You', decidedAt: new Date().toISOString(), comment: actionComment,
    };
    setHistoryLog(prev => [entry, ...prev]);
    setPendingApprovals(prev => prev.filter(p => p.id !== actionModal.id));
    setActionModal(null);
    setActionComment('');
    showToast(`Item ${action}.`);
  };

  /* ── delegation actions ── */
  const saveDelegation = () => {
    if (!delToUser || !delStart || !delEnd) return;
    const d: Delegation = {
      id: uid(), fromUser: 'You', toUser: delToUser,
      startDate: delStart, endDate: delEnd, reason: delReason, active: true,
    };
    setDelegations(prev => [...prev, d]);
    setShowDelegationModal(false);
    setDelToUser(''); setDelStart(''); setDelEnd(''); setDelReason('');
    showToast('Delegation created.');
  };

  const revokeDelegation = (id: string) => {
    setDelegations(prev => prev.map(d => d.id === id ? { ...d, active: false } : d));
    showToast('Delegation revoked.');
  };

  /* ── workflow diagram render ── */
  const renderDiagram = (wf: Workflow) => {
    const steps = [...wf.steps].sort((a, b) => a.order - b.order);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '20px 4px' }}>
        {/* Start node */}
        <div style={{
          minWidth: 70, height: 38, borderRadius: 19, background: GREEN + '28', border: `2px solid ${GREEN}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: GREEN, flexShrink: 0, letterSpacing: .5,
        }}>START</div>

        {steps.map((step) => (
          <React.Fragment key={step.id}>
            {/* Arrow connector */}
            <svg width="44" height="40" viewBox="0 0 44 40" style={{ flexShrink: 0 }}>
              <line x1="0" y1="20" x2="32" y2="20" stroke={GOLD} strokeWidth="2" />
              <polygon points="32,14 44,20 32,26" fill={GOLD} />
            </svg>

            {/* Step box */}
            <div style={{
              minWidth: 150, maxWidth: 200, border: `2px solid ${step.required ? BLUE : BORDER}`,
              borderRadius: 8, padding: '10px 14px', background: BG, position: 'relative', flexShrink: 0,
            }}>
              <div style={{ fontSize: 10, color: DIM, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>
                Step {step.order}
                {!step.required && <span style={{ color: AMBER, marginLeft: 6 }}>(Optional)</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>
                {step.name || step.approverValue}
              </div>
              <div style={{ fontSize: 11, color: DIM }}>
                {step.approverType === 'role' ? 'Role' : 'User'}: {step.approverValue}
              </div>
              {step.autoApproveThreshold !== null && (
                <div style={{ ...badgeStyle(GREEN), marginTop: 6, fontSize: 9 }}>
                  Auto-approve &lt; {fmtCurrency(step.autoApproveThreshold)}
                </div>
              )}
              {step.conditionalMinAmount !== null && (
                <div style={{ ...badgeStyle(AMBER), marginTop: 4, fontSize: 9 }}>
                  Only if &ge; {fmtCurrency(step.conditionalMinAmount)}
                </div>
              )}
            </div>
          </React.Fragment>
        ))}

        {/* Arrow to end */}
        <svg width="44" height="40" viewBox="0 0 44 40" style={{ flexShrink: 0 }}>
          <line x1="0" y1="20" x2="32" y2="20" stroke={GOLD} strokeWidth="2" />
          <polygon points="32,14 44,20 32,26" fill={GOLD} />
        </svg>

        {/* End node */}
        <div style={{
          minWidth: 70, height: 38, borderRadius: 19, background: GOLD + '28', border: `2px solid ${GOLD}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: GOLD, flexShrink: 0, letterSpacing: .5,
        }}>DONE</div>
      </div>
    );
  };

  /* ── inline mini diagram for templates list ── */
  const renderMiniDiagram = (wf: Workflow) => {
    const steps = [...wf.steps].sort((a, b) => a.order - b.order);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', marginTop: 12 }}>
        <div style={{ fontSize: 9, color: GREEN, fontWeight: 800, padding: '2px 8px', border: `1px solid ${GREEN}40`, borderRadius: 10, whiteSpace: 'nowrap' }}>START</div>
        {steps.map((step) => (
          <React.Fragment key={step.id}>
            <span style={{ color: GOLD, fontSize: 12, flexShrink: 0 }}>&rarr;</span>
            <div style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap',
              border: `1px solid ${step.required ? BLUE + '50' : BORDER}`,
              background: BG, color: step.required ? TEXT : DIM,
            }}>
              {step.order}. {step.name || step.approverValue}
              {step.conditionalMinAmount !== null ? ` (>=${fmtCurrency(step.conditionalMinAmount)})` : ''}
            </div>
          </React.Fragment>
        ))}
        <span style={{ color: GOLD, fontSize: 12, flexShrink: 0 }}>&rarr;</span>
        <div style={{ fontSize: 9, color: GOLD, fontWeight: 800, padding: '2px 8px', border: `1px solid ${GOLD}40`, borderRadius: 10, whiteSpace: 'nowrap' }}>DONE</div>
      </div>
    );
  };

  /* ── tab button render ── */
  const renderTabButton = (t: Tab, label: string, count?: number) => (
    <button key={t} onClick={() => setTab(t)} style={{
      ...btnBase(tab === t ? GOLD : BORDER, tab === t ? '#000' : DIM, tab !== t),
      marginRight: 6, position: 'relative',
      background: tab === t ? GOLD : 'transparent',
      color: tab === t ? '#000' : DIM,
      border: `1px solid ${tab === t ? GOLD : BORDER}`,
    }}>
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          position: 'absolute', top: -7, right: -7, background: RED, color: '#fff',
          borderRadius: '50%', width: 20, height: 20, fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{count}</span>
      )}
    </button>
  );

  /* ── LOADING STATE ── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 44, height: 44, border: `3px solid ${BORDER}`, borderTopColor: GOLD,
            borderRadius: '50%', animation: 'aw-spin 1s linear infinite', margin: '0 auto 16px',
          }} />
          <div style={{ color: DIM, fontSize: 14 }}>Loading approval workflows...</div>
          <style>{`@keyframes aw-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  /* ── ERROR STATE ── */
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...card, textAlign: 'center', maxWidth: 420, marginBottom: 0 }}>
          <div style={{ fontSize: 40, marginBottom: 12, color: RED }}>!</div>
          <div style={{ color: RED, fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{error}</div>
          <button style={btnBase(GOLD, '#000')} onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  /* ── MAIN RENDER ── */
  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 40px', fontFamily: 'inherit' }}>
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, background: GOLD, color: BG, padding: '10px 24px',
          borderRadius: 8, fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,.5)',
        }}>{toast}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: TEXT }}>Approval Workflows</h1>
          <p style={{ margin: '4px 0 0', color: DIM, fontSize: 14 }}>
            Configure and manage multi-step approval chains across all project modules
          </p>
        </div>
        <button style={btnBase(GOLD, '#000')} onClick={openCreateWizard}>+ New Workflow</button>
      </div>

      {/* Summary stats bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Active Workflows', val: workflows.filter(w => w.enabled).length, color: GREEN },
          { label: 'Disabled', val: workflows.filter(w => !w.enabled).length, color: DIM },
          { label: 'Pending Approvals', val: pendingApprovals.length, color: AMBER },
          { label: 'Approved (30d)', val: historyLog.filter(h => h.action === 'approved').length, color: GREEN },
          { label: 'Rejected (30d)', val: historyLog.filter(h => h.action === 'rejected').length, color: RED },
        ].map(s => (
          <div key={s.label} style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '10px 20px', minWidth: 130, textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: 20, flexWrap: 'wrap', gap: 4 }}>
        {renderTabButton('templates', 'Workflow Templates')}
        {renderTabButton('pending', 'Pending Approvals', pendingApprovals.length)}
        {renderTabButton('dashboard', 'Status Dashboard')}
        {renderTabButton('history', 'Approval History')}
        {renderTabButton('delegation', 'Delegation')}
      </div>

      {/* Filter bar (contextual) */}
      {(tab === 'templates' || tab === 'pending' || tab === 'history') && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {tab === 'templates' && (
            <input
              placeholder="Search workflows..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, maxWidth: 260 }}
            />
          )}
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value as Module | '')} style={{ ...selectStyle, maxWidth: 200 }}>
            <option value="">All Modules</option>
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {tab === 'history' && (
            <select value={historyFilter} onChange={e => setHistoryFilter(e.target.value as 'all' | 'approved' | 'rejected')} style={{ ...selectStyle, maxWidth: 160 }}>
              <option value="all">All Decisions</option>
              <option value="approved">Approved Only</option>
              <option value="rejected">Rejected Only</option>
            </select>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: TEMPLATES                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {filteredWorkflows.length === 0 && (
            <div style={{ ...card, textAlign: 'center', padding: 48, color: DIM }}>
              No workflow templates found. Click "+ New Workflow" to create one.
            </div>
          )}
          {filteredWorkflows.map(wf => (
            <div key={wf.id} style={{ ...card, opacity: wf.enabled ? 1 : 0.55, transition: 'opacity .2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{wf.name}</span>
                    <span style={badgeStyle(MODULE_COLORS[wf.module])}>{wf.module}</span>
                    <span style={badgeStyle(wf.enabled ? GREEN : DIM)}>{wf.enabled ? 'Active' : 'Disabled'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: DIM }}>
                    {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''} &middot; Created {fmtDate(wf.createdAt)} &middot; Updated {fmtDate(wf.updatedAt)}
                  </div>
                  {/* Conditional routing summary */}
                  {wf.steps.some(s => s.conditionalMinAmount !== null) && (
                    <div style={{ fontSize: 11, color: AMBER, marginTop: 4 }}>
                      Has conditional routing: {wf.steps.filter(s => s.conditionalMinAmount !== null).map(s =>
                        `${s.name || s.approverValue} activates at ${fmtCurrency(s.conditionalMinAmount!)}`
                      ).join('; ')}
                    </div>
                  )}
                  {/* Auto-approve summary */}
                  {wf.steps.some(s => s.autoApproveThreshold !== null) && (
                    <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>
                      Auto-approve: {wf.steps.filter(s => s.autoApproveThreshold !== null).map(s =>
                        `${s.name || s.approverValue} below ${fmtCurrency(s.autoApproveThreshold!)}`
                      ).join('; ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={btnBase(BLUE, '#fff', true)} onClick={() => setDiagramWorkflow(wf)}>Diagram</button>
                  <button style={btnBase(GOLD, '#fff', true)} onClick={() => openEditWizard(wf)}>Edit</button>
                  <button style={btnBase(PURPLE, '#fff', true)} onClick={() => cloneWorkflow(wf)}>Clone</button>
                  <button style={btnBase(wf.enabled ? AMBER : GREEN, '#fff', true)} onClick={() => toggleWorkflow(wf.id)}>
                    {wf.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button style={btnBase(RED, '#fff', true)} onClick={() => setDeleteConfirm(wf)}>Delete</button>
                </div>
              </div>
              {renderMiniDiagram(wf)}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: PENDING APPROVALS                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === 'pending' && (
        <div>
          {filteredPending.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 48, color: DIM }}>
              No pending approvals. You are all caught up.
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: BG }}>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Module</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Requested By</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Progress</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map(pa => (
                    <tr key={pa.id}
                        onMouseEnter={e => (e.currentTarget.style.background = BORDER + '25')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{pa.itemName}</div>
                        <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{pa.workflowName}</div>
                      </td>
                      <td style={tdStyle}><span style={badgeStyle(MODULE_COLORS[pa.module])}>{pa.module}</span></td>
                      <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(pa.itemAmount)}</td>
                      <td style={tdStyle}>{pa.requestedBy}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: DIM }}>{fmtDate(pa.requestedAt)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 3, maxWidth: 80, overflow: 'hidden' }}>
                            <div style={{
                              width: `${(pa.currentStep / pa.totalSteps) * 100}%`,
                              height: '100%', background: GOLD, borderRadius: 3, transition: 'width .3s',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: DIM, whiteSpace: 'nowrap' }}>Step {pa.currentStep}/{pa.totalSteps}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={{ ...btnBase(GREEN, '#fff'), padding: '5px 12px', fontSize: 12 }}
                            onClick={() => { setActionModal(pa); setActionComment(''); }}>
                            Approve
                          </button>
                          <button style={{ ...btnBase(RED, '#fff', true), padding: '5px 12px', fontSize: 12 }}
                            onClick={() => { setActionModal(pa); setActionComment(''); }}>
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: STATUS DASHBOARD                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === 'dashboard' && (
        <div>
          {/* Module stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
            {dashboardStats.map(stat => (
              <div key={stat.module} style={{ ...card, marginBottom: 0 }}>
                <div style={{
                  fontSize: 12, color: MODULE_COLORS[stat.module], fontWeight: 800,
                  marginBottom: 14, textTransform: 'uppercase', letterSpacing: .5,
                }}>
                  {stat.module}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: AMBER }}>{stat.pending}</div>
                    <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>Pending</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: GREEN }}>{stat.approved}</div>
                    <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>Approved</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: RED }}>{stat.rejected}</div>
                    <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>Rejected</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: BLUE }}>{stat.avgDays.toFixed(1)}</div>
                    <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>Avg Days</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pipeline bar chart */}
          <div style={{ ...card, marginBottom: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: TEXT }}>Approval Pipeline by Module</div>
            {dashboardStats.map(stat => {
              const total = stat.pending + stat.approved + stat.rejected;
              const approvedPct = total > 0 ? (stat.approved / total) * 100 : 0;
              const pendingPct = total > 0 ? (stat.pending / total) * 100 : 0;
              const rejectedPct = total > 0 ? (stat.rejected / total) * 100 : 0;
              return (
                <div key={stat.module} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{stat.module}</span>
                    <span style={{ fontSize: 12, color: DIM }}>{total} total items</span>
                  </div>
                  <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: BORDER + '30' }}>
                    {approvedPct > 0 && <div style={{ width: `${approvedPct}%`, background: GREEN, transition: 'width .3s' }} />}
                    {pendingPct > 0 && <div style={{ width: `${pendingPct}%`, background: AMBER, transition: 'width .3s' }} />}
                    {rejectedPct > 0 && <div style={{ width: `${rejectedPct}%`, background: RED, transition: 'width .3s' }} />}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: GREEN }}>{stat.approved} approved</span>
                    <span style={{ fontSize: 10, color: AMBER }}>{stat.pending} pending</span>
                    <span style={{ fontSize: 10, color: RED }}>{stat.rejected} rejected</span>
                  </div>
                </div>
              );
            })}
            {/* Legend */}
            <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              {[
                { label: 'Approved', color: GREEN },
                { label: 'Pending', color: AMBER },
                { label: 'Rejected', color: RED },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
                  <span style={{ fontSize: 12, color: DIM }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Average turnaround summary */}
          <div style={{ ...card, marginTop: 16, marginBottom: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: TEXT }}>Average Turnaround Time</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {dashboardStats.map(stat => {
                const barWidth = Math.min(stat.avgDays * 30, 200);
                return (
                  <div key={stat.module} style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 12, color: DIM, marginBottom: 6 }}>{stat.module}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ height: 8, width: barWidth, background: MODULE_COLORS[stat.module], borderRadius: 4, transition: 'width .3s' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: MODULE_COLORS[stat.module] }}>{stat.avgDays.toFixed(1)}d</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: APPROVAL HISTORY                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 0 }}>
          {filteredHistory.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: DIM }}>No approval history matches your filters.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: BG }}>
                  <th style={thStyle}>Item</th>
                  <th style={thStyle}>Module</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Decision</th>
                  <th style={thStyle}>Decided By</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map(h => (
                  <tr key={h.id}
                      onMouseEnter={e => (e.currentTarget.style.background = BORDER + '25')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{h.itemName}</div>
                      <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{h.workflowName}</div>
                    </td>
                    <td style={tdStyle}><span style={badgeStyle(MODULE_COLORS[h.module])}>{h.module}</span></td>
                    <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(h.itemAmount)}</td>
                    <td style={tdStyle}>
                      <span style={badgeStyle(h.action === 'approved' ? GREEN : RED)}>
                        {h.action === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </td>
                    <td style={tdStyle}>{h.decidedBy}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: DIM, whiteSpace: 'nowrap' }}>{fmtDateTime(h.decidedAt)}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: DIM, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {h.comment || '---'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: DELEGATION                                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === 'delegation' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, color: DIM }}>
                Delegate your approval authority to another team member while you are out of office.
              </div>
              <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>
                Active delegations automatically route all approval requests to the designated delegate.
              </div>
            </div>
            <button style={btnBase(GOLD, '#000')} onClick={() => setShowDelegationModal(true)}>+ New Delegation</button>
          </div>

          {delegations.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 48, color: DIM }}>
              No delegations configured. Create one before going out of office.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {delegations.map(d => (
                <div key={d.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: TEXT, fontSize: 15 }}>{d.fromUser}</span>
                        <svg width="24" height="14" viewBox="0 0 24 14" style={{ flexShrink: 0 }}>
                          <line x1="0" y1="7" x2="16" y2="7" stroke={GOLD} strokeWidth="2" />
                          <polygon points="16,3 24,7 16,11" fill={GOLD} />
                        </svg>
                        <span style={{ fontWeight: 700, color: BLUE, fontSize: 15 }}>{d.toUser}</span>
                        <span style={badgeStyle(d.active ? GREEN : DIM)}>{d.active ? 'Active' : 'Revoked'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: DIM }}>
                        {fmtDate(d.startDate)} through {fmtDate(d.endDate)}
                        {d.reason && <span> &middot; Reason: {d.reason}</span>}
                      </div>
                    </div>
                    {d.active && (
                      <button style={btnBase(RED, '#fff', true)} onClick={() => revokeDelegation(d.id)}>Revoke</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODAL: CREATE / EDIT WORKFLOW WIZARD                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showWizard && (
        <div style={overlayStyle} onClick={() => setShowWizard(false)}>
          <div style={{ ...modalStyle, width: 740 }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: GOLD }}>
                {editingWorkflow ? 'Edit Workflow' : 'Create New Workflow'}
              </h2>
              <button style={{ background: 'none', border: 'none', color: DIM, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
                onClick={() => setShowWizard(false)}>x</button>
            </div>

            {/* Wizard progress indicators */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {['Name & Module', 'Approval Steps', 'Review & Save'].map((label, i) => (
                <div key={i} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 600,
                  background: wizardStep === i ? GOLD + '22' : BG,
                  color: wizardStep === i ? GOLD : wizardStep > i ? GREEN : DIM,
                  border: `1px solid ${wizardStep === i ? GOLD : wizardStep > i ? GREEN + '50' : BORDER}`,
                  cursor: 'pointer', transition: 'all .2s',
                }} onClick={() => setWizardStep(i)}>
                  {wizardStep > i ? '\u2713 ' : ''}{i + 1}. {label}
                </div>
              ))}
            </div>

            {/* Wizard Step 0: Name & Module */}
            {wizardStep === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Workflow Name *</label>
                  <input style={inputStyle} value={wfName} onChange={e => setWfName(e.target.value)}
                    placeholder="e.g. Standard Change Order Approval" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Module *</label>
                  <select style={selectStyle} value={wfModule} onChange={e => setWfModule(e.target.value as Module)}>
                    {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 6 }}>
                    This workflow will apply to all {wfModule} that require approval.
                  </div>
                </div>
              </div>
            )}

            {/* Wizard Step 1: Approval Steps (Step Builder) */}
            {wizardStep === 1 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: DIM }}>Define approval chain steps in order. Drag-style reorder with arrows.</span>
                  <button style={btnBase(BLUE, '#fff')} onClick={addWizardStep}>+ Add Step</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {wfSteps.map((step) => (
                    <div key={step.id} style={{
                      padding: 16, background: BG, borderRadius: 8,
                      border: `1px solid ${step.required ? BLUE + '50' : BORDER}`,
                    }}>
                      {/* Step header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>Step {step.order}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={{ background: 'none', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
                            onClick={() => moveWizardStep(step.id, -1)}>Up</button>
                          <button style={{ background: 'none', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
                            onClick={() => moveWizardStep(step.id, 1)}>Down</button>
                          {wfSteps.length > 1 && (
                            <button style={{ background: 'none', border: `1px solid ${RED}40`, color: RED, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
                              onClick={() => removeWizardStep(step.id)}>Remove</button>
                          )}
                        </div>
                      </div>
                      {/* Step fields */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Step Name</label>
                          <input style={inputStyle} value={step.name}
                            onChange={e => updateWizardStep(step.id, { name: e.target.value })}
                            placeholder="e.g. PM Review" />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Approver Type</label>
                          <select style={selectStyle} value={step.approverType}
                            onChange={e => updateWizardStep(step.id, {
                              approverType: e.target.value as 'role' | 'user',
                              approverValue: e.target.value === 'role' ? ROLES[0] : USERS[0],
                            })}>
                            <option value="role">Role</option>
                            <option value="user">Specific User</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>
                            {step.approverType === 'role' ? 'Role' : 'User'}
                          </label>
                          <select style={selectStyle} value={step.approverValue}
                            onChange={e => updateWizardStep(step.id, { approverValue: e.target.value })}>
                            {(step.approverType === 'role' ? ROLES : USERS).map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Required / Optional</label>
                          <select style={selectStyle} value={step.required ? 'required' : 'optional'}
                            onChange={e => updateWizardStep(step.id, { required: e.target.value === 'required' })}>
                            <option value="required">Required</option>
                            <option value="optional">Optional</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Auto-Approve Threshold ($)</label>
                          <input style={inputStyle} type="number" placeholder="None - always manual"
                            value={step.autoApproveThreshold ?? ''}
                            onChange={e => updateWizardStep(step.id, { autoApproveThreshold: e.target.value ? Number(e.target.value) : null })} />
                          <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>Items below this amount auto-approve at this step</div>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Conditional: Only if Amount &ge; ($)</label>
                          <input style={inputStyle} type="number" placeholder="Always active"
                            value={step.conditionalMinAmount ?? ''}
                            onChange={e => updateWizardStep(step.id, { conditionalMinAmount: e.target.value ? Number(e.target.value) : null })} />
                          <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>Step skipped for amounts below this threshold</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wizard Step 2: Review */}
            {wizardStep === 2 && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 }}>Workflow Name</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{wfName || '(unnamed)'}</div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 }}>Module</div>
                  <span style={badgeStyle(MODULE_COLORS[wfModule])}>{wfModule}</span>
                </div>

                {/* Full visual diagram */}
                <div style={{ fontSize: 13, color: DIM, marginBottom: 4, fontWeight: 600 }}>
                  Visual Workflow ({wfSteps.length} step{wfSteps.length !== 1 ? 's' : ''})
                </div>
                <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', marginBottom: 16, overflowX: 'auto' }}>
                  {renderDiagram({ id: '', name: wfName, module: wfModule, enabled: true, steps: wfSteps, createdAt: '', updatedAt: '' })}
                </div>

                {/* Step details list */}
                <div style={{ fontSize: 12, color: DIM, marginBottom: 8, fontWeight: 600 }}>Step Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {wfSteps.map(step => (
                    <div key={step.id} style={{
                      padding: '8px 14px', background: BG, borderRadius: 6,
                      border: `1px solid ${BORDER}`, fontSize: 13,
                    }}>
                      <span style={{ color: GOLD, fontWeight: 700 }}>Step {step.order}:</span>{' '}
                      <span style={{ color: TEXT, fontWeight: 600 }}>{step.name}</span>{' '}
                      <span style={{ color: DIM }}>({step.approverType}: {step.approverValue})</span>{' '}
                      {step.required
                        ? <span style={{ color: BLUE }}>[Required]</span>
                        : <span style={{ color: AMBER }}>[Optional]</span>}
                      {step.autoApproveThreshold !== null && (
                        <span style={{ color: GREEN }}> | Auto-approve below {fmtCurrency(step.autoApproveThreshold)}</span>
                      )}
                      {step.conditionalMinAmount !== null && (
                        <span style={{ color: AMBER }}> | Only if amount &ge; {fmtCurrency(step.conditionalMinAmount)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wizard navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 18, borderTop: `1px solid ${BORDER}` }}>
              <button
                style={btnBase(BORDER, DIM, true)}
                onClick={() => wizardStep > 0 ? setWizardStep(wizardStep - 1) : setShowWizard(false)}
              >
                {wizardStep === 0 ? 'Cancel' : 'Back'}
              </button>
              {wizardStep < 2 ? (
                <button style={{
                  ...btnBase(GOLD, '#000'),
                  opacity: (wizardStep === 0 && !wfName.trim()) ? 0.4 : 1,
                  pointerEvents: (wizardStep === 0 && !wfName.trim()) ? 'none' : 'auto',
                }} onClick={() => setWizardStep(wizardStep + 1)}>
                  Next
                </button>
              ) : (
                <button style={{
                  ...btnBase(GREEN, '#fff'),
                  opacity: (!wfName.trim() || wfSteps.length === 0) ? 0.4 : 1,
                  pointerEvents: (!wfName.trim() || wfSteps.length === 0) ? 'none' : 'auto',
                }} onClick={saveWorkflow}>
                  {editingWorkflow ? 'Save Changes' : 'Create Workflow'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODAL: APPROVAL ACTION (Approve / Reject)               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {actionModal && (
        <div style={overlayStyle} onClick={() => setActionModal(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: GOLD }}>Review Approval Request</h2>
            <div style={{ marginBottom: 16 }}>
              <div style={{ padding: 16, background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, color: TEXT, fontSize: 15 }}>{actionModal.itemName}</span>
                  <span style={badgeStyle(MODULE_COLORS[actionModal.module])}>{actionModal.module}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div>
                    <span style={{ color: DIM }}>Amount: </span>
                    <span style={{ fontWeight: 700, color: TEXT }}>{fmtCurrency(actionModal.itemAmount)}</span>
                  </div>
                  <div>
                    <span style={{ color: DIM }}>Requested By: </span>
                    <span style={{ color: TEXT }}>{actionModal.requestedBy}</span>
                  </div>
                  <div>
                    <span style={{ color: DIM }}>Workflow: </span>
                    <span style={{ color: TEXT }}>{actionModal.workflowName}</span>
                  </div>
                  <div>
                    <span style={{ color: DIM }}>Current Step: </span>
                    <span style={{ color: TEXT }}>{actionModal.currentStep} of {actionModal.totalSteps}</span>
                  </div>
                  <div>
                    <span style={{ color: DIM }}>Requested: </span>
                    <span style={{ color: TEXT }}>{fmtDateTime(actionModal.requestedAt)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Comment (optional)</label>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                value={actionComment}
                onChange={e => setActionComment(e.target.value)}
                placeholder="Add a comment or reason for your decision..."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={btnBase(BORDER, DIM, true)} onClick={() => setActionModal(null)}>Cancel</button>
              <button style={btnBase(RED, '#fff')} onClick={() => handleApprovalAction('rejected')}>Reject</button>
              <button style={btnBase(GREEN, '#fff')} onClick={() => handleApprovalAction('approved')}>Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODAL: WORKFLOW DIAGRAM (Full View)                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {diagramWorkflow && (
        <div style={overlayStyle} onClick={() => setDiagramWorkflow(null)}>
          <div style={{ ...modalStyle, width: 920 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: GOLD }}>{diagramWorkflow.name}</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={badgeStyle(MODULE_COLORS[diagramWorkflow.module])}>{diagramWorkflow.module}</span>
                  <span style={badgeStyle(diagramWorkflow.enabled ? GREEN : DIM)}>
                    {diagramWorkflow.enabled ? 'Active' : 'Disabled'}
                  </span>
                  <span style={{ fontSize: 11, color: DIM }}>{diagramWorkflow.steps.length} steps</span>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: DIM, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
                onClick={() => setDiagramWorkflow(null)}>x</button>
            </div>

            {/* Diagram */}
            <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', overflowX: 'auto' }}>
              {renderDiagram(diagramWorkflow)}
            </div>

            {/* Conditional routing rules */}
            {diagramWorkflow.steps.some(s => s.conditionalMinAmount !== null) && (
              <div style={{ marginTop: 16, padding: 16, background: BG, borderRadius: 8, border: `1px solid ${AMBER}30` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: AMBER, marginBottom: 10 }}>
                  Conditional Routing Rules
                </div>
                {diagramWorkflow.steps.filter(s => s.conditionalMinAmount !== null).map(s => (
                  <div key={s.id} style={{ fontSize: 12, color: TEXT, marginBottom: 6, paddingLeft: 12, borderLeft: `2px solid ${AMBER}40` }}>
                    <strong>Step {s.order}</strong> ({s.name || s.approverValue}): Only activated when item amount &ge; <strong>{fmtCurrency(s.conditionalMinAmount!)}</strong>.
                    Items below this threshold skip this step entirely.
                  </div>
                ))}
              </div>
            )}

            {/* Auto-approve rules */}
            {diagramWorkflow.steps.some(s => s.autoApproveThreshold !== null) && (
              <div style={{ marginTop: 12, padding: 16, background: BG, borderRadius: 8, border: `1px solid ${GREEN}30` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GREEN, marginBottom: 10 }}>
                  Auto-Approve Thresholds
                </div>
                {diagramWorkflow.steps.filter(s => s.autoApproveThreshold !== null).map(s => (
                  <div key={s.id} style={{ fontSize: 12, color: TEXT, marginBottom: 6, paddingLeft: 12, borderLeft: `2px solid ${GREEN}40` }}>
                    <strong>Step {s.order}</strong> ({s.name || s.approverValue}): Automatically approved when item amount &lt; <strong>{fmtCurrency(s.autoApproveThreshold!)}</strong>.
                    No manual review required.
                  </div>
                ))}
              </div>
            )}

            {/* Step details table */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Step Details</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, background: BG }}>Order</th>
                    <th style={{ ...thStyle, background: BG }}>Name</th>
                    <th style={{ ...thStyle, background: BG }}>Approver</th>
                    <th style={{ ...thStyle, background: BG }}>Type</th>
                    <th style={{ ...thStyle, background: BG }}>Required</th>
                    <th style={{ ...thStyle, background: BG }}>Auto-Approve</th>
                    <th style={{ ...thStyle, background: BG }}>Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {[...diagramWorkflow.steps].sort((a, b) => a.order - b.order).map(s => (
                    <tr key={s.id}>
                      <td style={tdStyle}>{s.order}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{s.name}</td>
                      <td style={tdStyle}>{s.approverValue}</td>
                      <td style={tdStyle}><span style={badgeStyle(s.approverType === 'role' ? BLUE : PURPLE)}>{s.approverType}</span></td>
                      <td style={tdStyle}>{s.required ? <span style={{ color: GREEN }}>Yes</span> : <span style={{ color: AMBER }}>No</span>}</td>
                      <td style={tdStyle}>{s.autoApproveThreshold !== null ? fmtCurrency(s.autoApproveThreshold) : '---'}</td>
                      <td style={tdStyle}>{s.conditionalMinAmount !== null ? `>= ${fmtCurrency(s.conditionalMinAmount)}` : 'Always'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODAL: DELETE CONFIRMATION                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      {deleteConfirm && (
        <div style={overlayStyle} onClick={() => setDeleteConfirm(null)}>
          <div style={{ ...modalStyle, width: 440 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: RED }}>Delete Workflow</h2>
            <p style={{ color: DIM, fontSize: 14, marginBottom: 8, lineHeight: 1.5 }}>
              Are you sure you want to permanently delete
              <strong style={{ color: TEXT }}> {deleteConfirm.name}</strong>?
            </p>
            <p style={{ color: DIM, fontSize: 13, marginBottom: 20 }}>
              This action cannot be undone. Any pending approvals using this workflow will be orphaned and must be
              reassigned manually.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={btnBase(BORDER, DIM, true)} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button style={btnBase(RED, '#fff')} onClick={() => deleteWorkflow(deleteConfirm)}>Delete Workflow</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODAL: NEW DELEGATION                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showDelegationModal && (
        <div style={overlayStyle} onClick={() => setShowDelegationModal(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: GOLD }}>New Approval Delegation</h2>
              <button style={{ background: 'none', border: 'none', color: DIM, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
                onClick={() => setShowDelegationModal(false)}>x</button>
            </div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>
              All approval requests assigned to you will be automatically routed to the selected delegate
              during the specified date range.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Delegate To *</label>
                <select style={selectStyle} value={delToUser} onChange={e => setDelToUser(e.target.value)}>
                  <option value="">Select a team member...</option>
                  {USERS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Start Date *</label>
                  <input style={inputStyle} type="date" value={delStart} onChange={e => setDelStart(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>End Date *</label>
                  <input style={inputStyle} type="date" value={delEnd} onChange={e => setDelEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 6, fontWeight: 600 }}>Reason (optional)</label>
                <input style={inputStyle} value={delReason} onChange={e => setDelReason(e.target.value)}
                  placeholder="e.g. Vacation, Conference, Medical Leave" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 18, borderTop: `1px solid ${BORDER}` }}>
              <button style={btnBase(BORDER, DIM, true)} onClick={() => setShowDelegationModal(false)}>Cancel</button>
              <button style={{
                ...btnBase(GREEN, '#fff'),
                opacity: (!delToUser || !delStart || !delEnd) ? 0.4 : 1,
                pointerEvents: (!delToUser || !delStart || !delEnd) ? 'none' : 'auto',
              }} onClick={saveDelegation}>
                Create Delegation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
