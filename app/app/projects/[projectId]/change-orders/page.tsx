'use client';
/**
 * Change Orders — Pass 4, on the RFIs reference layout (dense table + detail).
 *
 * Anatomy: title + one primary action (New Change Order) → StatRow (contract
 * position: original / approved / pending / revised — the CO tiles filter the
 * log) → Toolbar → workspace split: DataTable log on the left, and when a row
 * is selected, the change order beside a 320–384px details + action rail.
 * Phone: stacked. The composer opens in a FormModal.
 *
 * Money: the running totals come from the exact-cents engine (lib/calc) —
 * revised contract = original + APPROVED change orders only; pending is tracked
 * separately and never invents a baseline. Deductive (negative) change orders
 * are preserved and shown with their sign. Amounts are never truncated.
 * Approve / reject stay the explicit existing workflows; the AI risk read is
 * labeled as AI and never acts on its own.
 *
 * Every write goes through a route this screen already used:
 *   list     GET    /api/change-orders/list?projectId=
 *   create   POST   /api/change-orders/create
 *   approve  POST   /api/change-orders/[id]/approve
 *   reject   POST   /api/change-orders/[id]/reject
 *   amount   PATCH  /api/change-orders/[id]/update   { cost_impact }
 *   delete   DELETE /api/change-orders/[id]
 *   risk     POST   /api/ai/change-order-risk
 */
import { useProjects } from '@/lib/hooks/useProjects';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { toCents, toDollars, summarizeContract } from '@/lib/calc';
import {
  Robot, X, Warning, CheckCircle, XCircle, Plus, Clipboard, PencilSimple, Copy, Trash,
  ArrowClockwise, WarningCircle,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, RowActions,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowSteps, FlowStrip, InsightRow, AutoChip } from '@/components/ui/premium';
import Suggest from '@/components/ui/Suggest';
import { layout } from '@/lib/design-tokens';
import { coAmount } from '@/lib/change-order-amount';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n:number) => money.format(n||0);
/** Signed money for change orders: deductive COs keep their minus sign, additive show a plus. */
const fmtSigned = (n:number) => (n<0 ? '-' : n>0 ? '+' : '') + money.format(Math.abs(n||0));
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDate = (d?:string|null) => d ? new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
const padCo = (n:number|string) => String(n??0).padStart(3,'0');

interface AIRiskResult {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  approval_likelihood: number;
  flags: string[];
  recommendations: string[];
  summary: string;
}

const RISK_TONE: Record<AIRiskResult['risk_level'], { tone: BadgeTone; label: string }> = {
  LOW: { tone: 'ongoing', label: 'Low Risk' },
  MEDIUM: { tone: 'under_contract', label: 'Medium Risk' },
  HIGH: { tone: 'overdue', label: 'High Risk' },
};

/** The AI read — labeled as AI, advisory only. It never approves, rejects or prices anything. */
/** The model answers in lowercase ("low" | "medium" | "high"); the tone map is keyed
 *  LOW / MEDIUM / HIGH. Normalise here and never let a malformed reply reach the page —
 *  an unknown level gets a neutral badge, missing lists are empty, a missing score is 0. */
function normaliseRisk(raw: AIRiskResult): { level: keyof typeof RISK_TONE | null; likelihood: number; flags: string[]; recommendations: string[]; summary: string } {
  const lvl = String(raw?.risk_level ?? '').toUpperCase();
  const level = (lvl === 'LOW' || lvl === 'MEDIUM' || lvl === 'HIGH') ? (lvl as keyof typeof RISK_TONE) : null;
  const n = Number(raw?.approval_likelihood);
  return {
    level,
    likelihood: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0,
    flags: Array.isArray(raw?.flags) ? raw.flags.filter((f): f is string => typeof f === 'string') : [],
    recommendations: Array.isArray(raw?.recommendations) ? raw.recommendations.filter((r): r is string => typeof r === 'string') : [],
    summary: typeof (raw as { summary?: unknown })?.summary === 'string' ? String((raw as { summary?: string }).summary) : '',
  };
}

function AIRiskPanel({ result: raw, onClose }: { result: AIRiskResult; onClose: () => void }) {
  const safe = normaliseRisk(raw);
  const result = { ...safe, approval_likelihood: safe.likelihood };
  const likelihoodTone = result.approval_likelihood >= 70 ? 'good' : result.approval_likelihood >= 40 ? 'warn' : 'bad';
  const badge = result.level ? RISK_TONE[result.level] : { tone: 'neutral' as const, label: 'Risk Unknown' };
  return (
    <div className="coRisk" role="region" aria-label="AI risk analysis">
      <div className="coRiskHead">
        <Robot size={16} />
        <span>AI Risk Analysis</span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <span className="coRiskAi">Generated by AI — advisory, not a decision.</span>
        <Button variant="ghost" size="sm" icon={<X size={14} />} aria-label="Close AI risk analysis" onClick={onClose} />
      </div>
      <div className="coRiskMeter">
        <div className="coRiskMeterLabel"><span>Approval Likelihood</span><b data-tone={likelihoodTone}>{result.approval_likelihood}%</b></div>
        <div className="coRiskTrack"><div className="coRiskFill" data-tone={likelihoodTone} style={{ width: `${Math.max(0, Math.min(100, result.approval_likelihood))}%` }} /></div>
      </div>
      <div className="coRiskSummary">{result.summary}</div>
      <div className="coRiskCols">
        {result.flags.length > 0 && (
          <div>
            <div className="coSectionTitle">Flags / Concerns</div>
            <ul className="coRiskList" data-tone="bad">
              {result.flags.map((f) => <li key={f}><Warning size={12} weight="fill" /><span>{f}</span></li>)}
            </ul>
          </div>
        )}
        {result.recommendations.length > 0 && (
          <div>
            <div className="coSectionTitle">Recommendations</div>
            <ul className="coRiskList" data-tone="good">
              {result.recommendations.map((r) => <li key={r}><CheckCircle size={12} weight="fill" /><span>{r}</span></li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** One status → one badge. Pending amber (a decision is owed), Approved green, Rejected red. */
function statusBadge(s:string|null|undefined): { label:string; tone:BadgeTone } {
  const k = String(s||'pending').toLowerCase();
  if (k==='approved') return { label:'Approved', tone:'ongoing' };
  if (k==='rejected') return { label:'Rejected', tone:'overdue' };
  return { label:'Pending', tone:'under_contract' };
}
const STATUS_RANK: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

const CSS = `
.coWs > .k-page { max-width: none; }
.coCq { container: cows / inline-size; min-width: 0; }
.coSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.coSplit > * { min-width: 0; }
@container cows (min-width: 1080px) {
  .coSplit[data-open="true"] { grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.6fr); }
}
.coDetailCq { container: codetail / inline-size; min-width: 0; }
.coDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.coDetail > * { min-width: 0; }
.coRail { order: -1; }
@container codetail (min-width: 720px) {
  .coDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .coRail { order: 0; position: sticky; top: 16px; }
}
.coList .k-table th:first-child, .coList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.coList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.coList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.coList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.coList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.coNum { color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.coTitle { display: flex; flex-direction: column; gap: 2px; max-width: 380px; min-width: 0; }
.coTitle > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.coTitle > span:first-child { color: var(--text-primary); font-weight: 600; }
.coTitle > span + span { font-size: var(--fs-xs); color: var(--text-tertiary); }
.coMoney { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary); font-weight: 700; }
.coMoney[data-sign="neg"] { color: var(--status-overdue); }
.coMoney[data-sign="zero"] { color: var(--text-tertiary); font-weight: 500; }
.coMuted { color: var(--text-tertiary); }
.coBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.coSection { display: flex; flex-direction: column; gap: 8px; }
.coSection + .coSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.coSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.coProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.coBig { font-size: 28px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1.1; }
.coBig[data-sign="neg"] { color: var(--status-overdue); }
.coActions { display: flex; flex-direction: column; gap: 8px; }
.coActions .k-btn { width: 100%; justify-content: flex-start; }
.coActionsRow { display: flex; gap: 8px; align-items: center; }
.coActionsRow > .k-btn { flex: 1 1 auto; }
.coNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.coLadder { border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-surface-2); }
.coRule { height: 1px; background: var(--border-subtle); margin: 8px 0; }
.coFormBtns { display: flex; gap: 8px; flex-wrap: wrap; }
.coInlineErr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--status-overdue); }
.coRisk { border: 1px solid var(--brand-primary-25); border-radius: var(--radius-sm); padding: 14px 16px; background: var(--bg-surface-2); display: flex; flex-direction: column; gap: 12px; }
.coRiskHead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 800; color: var(--text-primary); font-size: var(--fs-md); }
.coRiskHead > .k-btn { margin-left: auto; }
.coRiskAi { font-size: var(--fs-xs); font-weight: 600; color: var(--text-tertiary); }
.coRiskMeterLabel { display: flex; justify-content: space-between; align-items: center; font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); margin-bottom: 6px; }
.coRiskMeterLabel > b { font-size: var(--fs-lg); color: var(--text-primary); font-variant-numeric: tabular-nums; }
.coRiskMeterLabel > b[data-tone="good"], .coRiskFill[data-tone="good"] { color: var(--status-ongoing); background-color: var(--status-ongoing); }
.coRiskMeterLabel > b[data-tone="warn"], .coRiskFill[data-tone="warn"] { color: var(--status-under-contract); background-color: var(--status-under-contract); }
.coRiskMeterLabel > b[data-tone="bad"], .coRiskFill[data-tone="bad"] { color: var(--status-overdue); background-color: var(--status-overdue); }
.coRiskMeterLabel > b { background: none !important; }
.coRiskTrack { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.08); overflow: hidden; }
.coRiskFill { height: 100%; border-radius: 4px; transition: width .6s ease; }
.coRiskSummary { font-size: var(--fs-sm); color: var(--text-primary); line-height: 1.6; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--brand-primary-08); border: 1px solid var(--brand-primary-12); }
.coRiskCols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.coRiskList { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; font-size: var(--fs-xs); }
.coRiskList li { display: flex; gap: 7px; align-items: flex-start; color: var(--text-secondary); }
.coRiskList li > svg { flex-shrink: 0; margin-top: 2px; }
.coRiskList[data-tone="bad"] li > svg { color: var(--status-overdue); }
.coRiskList[data-tone="good"] li > svg { color: var(--status-ongoing); }
@media (max-width: 640px) {
  .coWs .k-btn, .coWs .k-stat, .coWs select.k-select, .coWs .k-input { min-height: 44px; }
  .coWs .k-table td { height: 48px; }
  .coTitle { max-width: 200px; }
}
`;

export default function ChangeOrdersPage() {
  const params    = useParams();
  const projectId = params['projectId'] as string;

  const [cos,setCos]         = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError]     = useState('');
  const [loadError,setLoadError] = useState('');
  const [showForm,setShowForm] = useState(false);
  const [saving,setSaving]   = useState(false);
  const [approvingId,setApprovingId] = useState<string|null>(null);
  const { toast, show } = useToast(4000);
  const setToast = (t:{msg:string;type:'success'|'error'}) => show(t.msg, t.type==='success'?'good':'bad');
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // AI Risk Analysis state
  const [riskTarget,setRiskTarget] = useState<'form'|string|null>(null); // 'form' = new CO form, or CO id
  const [riskResult,setRiskResult] = useState<AIRiskResult|null>(null);
  const [riskLoading,setRiskLoading] = useState(false);
  const [riskError,setRiskError] = useState('');
  const [coEditId, setCoEditId] = useState<string|null>(null);
  const [coEditVal, setCoEditVal] = useState('');
  const [coCopiedId, setCoCopiedId] = useState<string|null>(null);
  const [coSearch,setCoSearch] = useState('');
  const [coStatusFilter,setCoStatusFilter] = useState('all');

  // project contract sum for running total
  const [contractSum,setContractSum] = useState(0);

  // /api/project-context snapshot — the screen walks in knowing the contract
  // money, CO history, bid packages, and schedule before the GC types anything.
  const { ctx } = useProjectContext(projectId);
  useEffect(()=>{
    const original = Number(ctx?.money?.originalContract)||0;
    if(original>0) setContractSum(prev=>prev||original);
  },[ctx]);

  // form
  const [fTitle,setFTitle]         = useState('');
  const [fDesc,setFDesc]           = useState('');
  const [fReason,setFReason]       = useState('');
  const [fCost,setFCost]           = useState('');
  const [fSchedule,setFSchedule]   = useState('');
  const [fRelatedPkg,setFRelatedPkg] = useState('');

  /* ── Unsaved-work protection (R14): dirty once anything is typed in the
   *    composer; draft autosaves per project and restores on return. ── */
  const coFormDirty = showForm && (!!fTitle || !!fDesc || !!fReason || !!fCost || !!fSchedule || !!fRelatedPkg);
  const coDraft = useMemo(() => ({
    fTitle, fDesc, fReason, fCost, fSchedule, fRelatedPkg,
  }), [fTitle, fDesc, fReason, fCost, fSchedule, fRelatedPkg]);
  const guard = useUnsavedGuard({
    dirty: coFormDirty,
    draftKey: `change-order:${projectId}`,
    draftData: coDraft,
    restoreDraft: (d) => {
      const v = d as Partial<typeof coDraft>;
      if (!v) return;
      setFTitle(v.fTitle ?? ''); setFDesc(v.fDesc ?? ''); setFReason(v.fReason ?? '');
      setFCost(v.fCost ?? ''); setFSchedule(v.fSchedule ?? ''); setFRelatedPkg(v.fRelatedPkg ?? '');
      setShowForm(true);
    },
    onSave: () => submitCO(),
  });

  /** Close the composer through the guard — clean closes immediately, dirty
   *  asks Save / Discard / Stay first. */
  function closeCoForm() {
    guard.requestClose(() => { setShowForm(false); setError(''); if (riskTarget==='form') { setRiskResult(null); setRiskTarget(null); setRiskError(''); } });
  }

  async function analyzeRisk(coData: Record<string, unknown>, targetKey: 'form' | string) {
    setRiskTarget(targetKey);
    setRiskResult(null);
    setRiskError('');
    setRiskLoading(true);
    try {
      const r = await fetch('/api/ai/change-order-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...coData }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setRiskResult(d);
    } catch(e: unknown) {
      setRiskError((e as Error).message || 'AI analysis failed.');
    } finally {
      setRiskLoading(false);
    }
  }

  const { projects: allProjects } = useProjects();
  useEffect(() => {
    const project = (allProjects as any[]).find((p: any) => p.id === projectId);
    if (project?.contract_amount) setContractSum(Number(project.contract_amount) || 0);
  }, [allProjects, projectId]);

  const load = useCallback(async()=>{
    setLoading(true); setLoadError('');
    try{
      const coRes  = await fetch(`/api/change-orders/list?projectId=${projectId}`);
      const coData = await coRes.json();
      setCos((coData.changeOrders??[]).sort((a:any,b:any)=>(a.co_number||0)-(b.co_number||0)));
    }catch(e:any){
      console.error(e); setLoadError(humanError(e, 'Failed to load change orders. Please try again.'));
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  /** POST the composer — shared by the Create button and the guard's "Save & leave". */
  async function submitCO(): Promise<boolean>{
    if(!fTitle.trim()){ setError('Title is required.'); return false; }
    setSaving(true); setError('');
    try{
      const r = await fetch('/api/change-orders/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,title:fTitle,description:fDesc,reason:fReason,
        costImpact:parseFloat(fCost)||0,scheduleImpact:parseFloat(fSchedule)||0,
        relatedBidPackageId:fRelatedPkg||null,
      })});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setFTitle(''); setFDesc(''); setFReason(''); setFCost(''); setFSchedule(''); setFRelatedPkg('');
      setShowForm(false);
      if (riskTarget==='form') { setRiskResult(null); setRiskTarget(null); setRiskError(''); }
      await load();
      return true;
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to create the change order. Please try again.'));
      return false;
    }finally{
      setSaving(false);
    }
  }

  async function createCO(){
    if(await submitCO()) guard.clearDraft();
  }

  async function approveCO(id:string){
    setApprovingId(id);
    try{
      const r = await fetch(`/api/change-orders/${id}/approve`,{method:'POST',headers:{'Content-Type':'application/json'}});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setCos(prev=>prev.map(c=>c.id===id?{...c,status:'approved'}:c));
      setToast({msg:'Change order approved.',type:'success'});
    }catch(e:any){
      console.error(e); setToast({msg:humanError(e, 'Failed to approve the change order. Please try again.'),type:'error'});
    }finally{
      setApprovingId(null);
    }
  }

  async function rejectCO(id:string){
    if(!(await confirmDialog({ title: 'Reject change order?', message: 'This marks the change order rejected.', confirmLabel: 'Reject', danger: true }))) return;
    setApprovingId(id);
    try{
      const r = await fetch(`/api/change-orders/${id}/reject`,{method:'POST',headers:{'Content-Type':'application/json'}});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setCos(prev=>prev.map(c=>c.id===id?{...c,status:'rejected'}:c));
      setToast({msg:'Change order rejected.',type:'success'});
    }catch(e:any){
      console.error(e); setToast({msg:humanError(e, 'Failed to reject the change order. Please try again.'),type:'error'});
    }finally{
      setApprovingId(null);
    }
  }

  async function handleEditCO(id: string) {
    const amount = parseFloat(coEditVal);
    if (isNaN(amount)) return;
    setCos(prev => prev.map(c => c.id === id ? { ...c, cost_impact: amount } : c));
    setCoEditId(null);
    try {
      const r = await fetch(`/api/change-orders/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cost_impact: amount }) });
      if (!r.ok) throw new Error('update failed');
      setToast({ msg: 'Cost impact updated.', type: 'success' });
    } catch {
      setToast({ msg: 'Could not update the change order. Please try again.', type: 'error' });
      load();
    }
  }

  function handleCopyCO(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCoCopiedId(id); setTimeout(() => setCoCopiedId(null), 2000);
    setToast({ msg: `${fmt(amount)} copied.`, type: 'success' });
  }

  async function handleDeleteCO(id: string) {
    setCos(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      const r = await fetch(`/api/change-orders/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Delete failed');
      setToast({msg:'Change order deleted.',type:'success'});
    } catch { setToast({msg:'Failed to delete the change order. Please try again.',type:'error'}); load(); }
  }
  async function confirmDeleteCO(id: string) {
    if (await confirmDialog({ title: 'Delete change order?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) handleDeleteCO(id);
  }

  // Running totals — exact-cents engine. Revised contract = original + APPROVED
  // change orders only; pending tracked separately (summarizeContract enforces this).
  const contractSummary = summarizeContract(
    toCents(contractSum),
    cos.map((c:any)=>({ id:String(c.id), description:c.title||'', amount:toCents(coAmount(c)), status:(c.status||'pending') as 'pending'|'approved'|'rejected' })),
  );
  const approvedCOs   = toDollars(contractSummary.approvedChangeOrders);
  const pendingCOs    = toDollars(contractSummary.pendingChangeOrders);
  const currentContract = toDollars(contractSummary.revisedContract);

  // SmartCreate intelligence — the form walks in knowing the CO history, bid
  // packages, and schedule. cost_impact is TEXT in the DB: Number() everything.
  const approvedCount  = cos.filter(c=>c.status==='approved').length;
  const pendingCount   = cos.filter(c=>c.status==='pending').length;
  const rejectedCount  = cos.filter(c=>c.status==='rejected').length;
  const lastCo         = cos.length>0 ? cos[cos.length-1] : null;
  const nextCoNumber   = Math.max(cos.reduce((m,c)=>Math.max(m,Number(c.co_number)||0),0)+1, Number(ctx?.defaults?.nextCoNumber)||1);
  const fCostNum       = Number(fCost)||0;
  const fSchedNum      = Number(fSchedule)||0;
  const newContractSum = toDollars(contractSummary.revisedContract + toCents(fCostNum));
  const bidPkgs        = (ctx?.bidPackages||[]) as any[];
  const selectedPkg    = bidPkgs.find(b=>b.id===fRelatedPkg) || null;
  const projEnd        = ctx?.project?.endDate ? String(ctx.project.endDate) : null;
  const pushedEnd      = projEnd && fSchedNum>0 ? new Date(new Date(projEnd.slice(0,10)+'T12:00:00').getTime()+fSchedNum*86400000) : null;

  // Toolbar-driven view of the CO log (search matches CO number, title, reason).
  const coQ = coSearch.trim().toLowerCase();
  const filteredCos = cos.filter((c:any)=>{
    if (coStatusFilter !== 'all' && String(c.status||'pending') !== coStatusFilter) return false;
    if (!coQ) return true;
    return [c.title, c.description, c.reason, `co-${padCo(c.co_number)}`].some(v => String(v||'').toLowerCase().includes(coQ));
  });
  const filtersActive = !!coSearch || coStatusFilter !== 'all';
  const clearFilters = () => { setCoSearch(''); setCoStatusFilter('all'); };
  const toggleStatus = (s:string) => setCoStatusFilter(prev => (prev===s ? 'all' : s));

  const selected = selectedId ? cos.find(c=>c.id===selectedId) || null : null;
  const detailOpen = !!selected;
  useEffect(() => {
    if (!detailOpen) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [detailOpen, selectedId]);

  const signOf = (n:number) => (n<0 ? 'neg' : n>0 ? 'pos' : 'zero');

  // ── Stat tiles: contract position — the CO tiles filter the log ──
  const stats: StatItem[] = loading
    ? [
        { label:'Original Contract', value:'—', sub:'Loading…' },
        { label:'Approved COs', value:'—', sub:'Loading…' },
        { label:'Pending COs', value:'—', sub:'Loading…' },
        { label:'Revised Contract', value:'—', sub:'Loading…' },
      ]
    : [
        { label:'Original Contract', value:fmt(contractSum), sub:'Prime contract baseline', href:`/app/projects/${projectId}/contracts` },
        { label:'Approved COs', value:fmtSigned(approvedCOs), tone: approvedCOs>0 ? 'good' : approvedCOs<0 ? 'bad' : 'default', sub: coStatusFilter==='approved' ? 'Filtered — click to clear' : `${approvedCount} approved`, onClick:()=>toggleStatus('approved') },
        { label:'Pending COs', value:fmtSigned(pendingCOs), tone: pendingCount>0 ? 'warn' : 'default', sub: coStatusFilter==='pending' ? 'Filtered — click to clear' : pendingCount>0 ? `${pendingCount} awaiting decision` : 'None awaiting decision', onClick:()=>toggleStatus('pending') },
        { label:'Revised Contract', value:fmt(currentContract), sub:`Original + approved COs${rejectedCount>0?` · ${rejectedCount} rejected`:''}`, href:`/app/projects/${projectId}/contracts` },
      ];

  // ── Log columns: full log, or a compact log beside the change order ──
  const numCol: Column<any> = { key:'co_number', header:'CO #', accessor:c=>Number(c.co_number)||0, width:90, render:c=><span className="coNum" data-sel={c.id===selectedId?'true':undefined}>CO-{padCo(c.co_number)}</span> };
  const titleCol: Column<any> = { key:'title', header:'Title', accessor:c=>(c.title||'').toLowerCase(), render:c=>(
    <div className="coTitle"><span title={c.title}>{c.title||'Untitled change order'}</span>{c.description && <span title={c.description}>{c.description}</span>}</div>
  ) };
  const statusCol: Column<any> = { key:'status', header:'Status', accessor:c=>STATUS_RANK[String(c.status||'pending')]??9, render:c=>{const b=statusBadge(c.status);return <Badge tone={b.tone}>{b.label}</Badge>;} };
  const costCol: Column<any> = { key:'cost', header:'Cost Impact', accessor:c=>coAmount(c), align:'right', render:c=>{const n=coAmount(c);return <span className="coMoney" data-sign={signOf(n)}>{fmtSigned(n)}</span>;} };
  const schedCol: Column<any> = { key:'schedule', header:'Schedule', accessor:c=>Number(c.schedule_impact)||0, align:'right', render:c=>{const d=Number(c.schedule_impact)||0;return d>0 ? <span style={{color:'var(--text-primary)'}}>+{d} day{d===1?'':'s'}</span> : <span className="coMuted">—</span>;} };
  const reasonCol: Column<any> = { key:'reason', header:'Reason', accessor:c=>(c.reason||'').toLowerCase(), render:c=>c.reason ? <span className="coTitle" style={{maxWidth:200}}><span style={{color:'var(--text-secondary)',fontWeight:500}} title={c.reason}>{c.reason}</span></span> : <span className="coMuted">—</span> };
  const columns: Column<any>[] = detailOpen
    ? [numCol, titleCol, costCol, statusCol]
    : [numCol, titleCol, statusCol, costCol, schedCol, reasonCol];

  /** The record's verbs — shared by the row overflow and the rail. */
  function coActions(co:any): Action[] {
    const s = String(co.status||'pending');
    const busy = approvingId===co.id;
    return [
      { label:'Open Details', icon:<Clipboard size={15}/>, onClick:()=>setSelectedId(co.id) },
      { label:'Approve', icon:<CheckCircle size={15}/>, onClick:()=>approveCO(co.id), hidden:s!=='pending', disabled:busy },
      { label:'Reject', icon:<XCircle size={15}/>, onClick:()=>rejectCO(co.id), hidden:s!=='pending', disabled:busy, tone:'danger' },
      { label:'Analyze Risk (AI)', icon:<Robot size={15}/>, onClick:()=>{ setSelectedId(co.id); analyzeRisk({title:co.title,description:co.description,reason:co.reason,cost_impact:coAmount(co),schedule_impact:co.schedule_impact,status:co.status},co.id); }, disabled: riskLoading&&riskTarget===co.id },
      { label:'Edit Amount', icon:<PencilSimple size={15}/>, onClick:()=>{ setSelectedId(co.id); setCoEditId(co.id); setCoEditVal(String(coAmount(co))); } },
      { label:'Copy Amount', icon:<Copy size={15}/>, onClick:()=>handleCopyCO(co.id, coAmount(co)) },
      { label:'Delete', icon:<Trash size={15}/>, onClick:()=>confirmDeleteCO(co.id), tone:'danger' },
    ];
  }

  // ── Detail workspace ──
  const detailWorkspace = selected && (()=>{
    const s = String(selected.status||'pending');
    const cost = coAmount(selected);
    const sched = Number(selected.schedule_impact)||0;
    const busy = approvingId===selected.id;
    const editing = coEditId===selected.id;
    return (
      <div ref={detailRef} className="coDetailCq">
        <div className="coDetail">
          <Card
            title={<>CO-{padCo(selected.co_number)} — {selected.title||'Untitled change order'}</>}
            subtitle={selected.reason || undefined}
            actions={<Button variant="ghost" size="sm" icon={<X size={16}/>} aria-label="Close details" title="Close details" onClick={()=>setSelectedId(null)}/>}
          >
            <div className="coSection">
              <div className="coSectionTitle">Cost Impact</div>
              {editing ? (
                <FormGrid cols={2}>
                  <Field label="Cost Impact ($)" hint="Enter a negative number for a deductive change order.">
                    <Input type="number" step="0.01" value={coEditVal} autoFocus onChange={e=>setCoEditVal(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') handleEditCO(selected.id); if(e.key==='Escape') setCoEditId(null); }} />
                  </Field>
                  <Field label=" ">
                    <div className="coFormBtns">
                      <Button variant="primary" onClick={()=>handleEditCO(selected.id)} disabled={isNaN(parseFloat(coEditVal))}>Save Amount</Button>
                      <Button variant="ghost" onClick={()=>setCoEditId(null)}>Cancel</Button>
                    </div>
                  </Field>
                </FormGrid>
              ) : (
                <div className="coBig" data-sign={signOf(cost)}>{fmtSigned(cost)}{coCopiedId===selected.id && <span className="coMuted" style={{fontSize:'var(--fs-xs)',marginLeft:10}}>Copied</span>}</div>
              )}
            </div>
            <div className="coSection">
              <div className="coSectionTitle">Description</div>
              {selected.description ? <div className="coProse">{selected.description}</div> : <div className="coMuted" style={{fontSize:'var(--fs-sm)'}}>No description was entered.</div>}
            </div>
            {riskTarget===selected.id && (riskLoading||riskResult||riskError) && (
              <div className="coSection">
                {riskLoading && <div className="coMuted" style={{fontSize:'var(--fs-sm)'}}><Robot size={14} style={{verticalAlign:'-2px',marginRight:6}}/>Running the AI risk read…</div>}
                {riskError && <div className="coInlineErr" role="alert"><WarningCircle size={15}/> {riskError}</div>}
                {riskResult && <AIRiskPanel result={riskResult} onClose={()=>{setRiskResult(null);setRiskTarget(null);}} />}
              </div>
            )}
          </Card>

          <aside className="coRail" aria-label="Change order details and actions">
            <Card title="Details">
              <div className="coSection">
                <div className="coBadges">
                  <Badge tone={statusBadge(s).tone} dot>{statusBadge(s).label}</Badge>
                  {cost<0 && <Badge tone="neutral">Deductive</Badge>}
                </div>
                <div className="coNext">
                  {s==='pending' && 'Awaiting a decision. Approving moves the revised contract and syncs the budget line; rejecting leaves the contract untouched.'}
                  {s==='approved' && 'Approved — counted in the revised contract sum.'}
                  {s==='rejected' && 'Rejected — not counted in the contract sum.'}
                </div>
              </div>
              <div className="coSection">
                <DetailList items={[
                  ['Cost Impact', <span key="c" className="coMoney" data-sign={signOf(cost)}>{fmtSigned(cost)}</span>],
                  ['Schedule Impact', sched>0 ? `+${sched} day${sched===1?'':'s'}` : '—'],
                  ['Reason', selected.reason || ''],
                  ['Created', fmtDate(selected.created_at)],
                  ['Approved', selected.approved_at ? fmtDate(selected.approved_at) : (s==='approved' ? 'Yes' : '—')],
                ]}/>
              </div>
              <div className="coSection">
                <div className="coActions">
                  {s==='pending' && (
                    <div className="coActionsRow">
                      <Button icon={<CheckCircle size={16}/>} onClick={()=>approveCO(selected.id)} disabled={busy}>{busy?'Working…':'Approve'}</Button>
                      <Button variant="danger" icon={<XCircle size={16}/>} onClick={()=>rejectCO(selected.id)} disabled={busy}>Reject</Button>
                    </div>
                  )}
                  <Button icon={<Robot size={16}/>} onClick={()=>analyzeRisk({title:selected.title,description:selected.description,reason:selected.reason,cost_impact:coAmount(selected),schedule_impact:selected.schedule_impact,status:selected.status},selected.id)} disabled={riskLoading&&riskTarget===selected.id}>
                    {riskLoading&&riskTarget===selected.id ? 'Analyzing…' : 'Analyze Risk (AI)'}
                  </Button>
                  <div className="coActionsRow">
                    <Button icon={<PencilSimple size={16}/>} onClick={()=>{ setCoEditId(selected.id); setCoEditVal(String(coAmount(selected))); }} disabled={editing}>Edit Amount</Button>
                    <RowActions actions={[
                      { label:'Copy Amount', icon:<Copy size={15}/>, onClick:()=>handleCopyCO(selected.id, cost) },
                      { label:'Delete', icon:<Trash size={15}/>, onClick:()=>confirmDeleteCO(selected.id), tone:'danger' },
                    ]}/>
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    );
  })();

  // ── Log body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22}/>}
        title="Couldn't load change orders"
        text={`${loadError} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15}/>} onClick={load}>Retry</Button>}
      />
    );
  } else if (!loading && cos.length===0) {
    listBody = (
      <>
        <EmptyState
          icon={<Clipboard size={22}/>}
          title="No change orders yet"
          text={`Log scope changes, owner requests, and unforeseen conditions. CO-${padCo(nextCoNumber)} is numbered and ready.`}
          action={<Button icon={<Plus size={15} weight="bold"/>} onClick={()=>setShowForm(true)}>New Change Order</Button>}
        />
        <div style={{padding:'0 16px 16px'}}>
          <FlowStrip steps={[
            {title:'Log the CO',desc:'Numbered automatically'},
            {title:'Pending Decision',desc:'Approve or reject inline'},
            {title:'Contract Sum Updates',desc:'On approval, automatically'},
            {title:'Budget Line Syncs',desc:'Nothing re-typed'},
          ]} />
        </div>
      </>
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={filteredCos}
        rowKey={c=>c.id}
        loading={loading}
        defaultSort={{ key:'co_number', dir:'asc' }}
        onRowClick={c=>setSelectedId(c.id)}
        rowActions={coActions}
        empty={
          <EmptyState
            icon={<Clipboard size={22}/>}
            title="No change orders match these filters"
            text="Clear the search or status filter to see more."
            action={<Button onClick={clearFilters}>Clear Filters</Button>}
          />
        }
      />
    );
  }

  return (
    <div className="coWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label:'Projects', href:'/app/projects' },
          { label: ctx?.project?.name || 'Project', href:`/app/projects/${projectId}/overview` },
          { label:'Change Orders' },
        ]}
        title="Change Orders"
        subtitle="Scope changes, owner requests, and unforeseen conditions — priced before they are built."
        actions={
          <Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={()=>setShowForm(true)}>
            New Change Order
          </Button>
        }
      >
        {!loadError && <StatRow items={stats}/>}

        {!loading && !loadError && cos.length>0 && (
          <Toolbar
            search={coSearch}
            onSearch={setCoSearch}
            placeholder="Search by CO number, title, or reason…"
            filters={
              <>
                <Select
                  aria-label="Status"
                  value={coStatusFilter}
                  onChange={e=>setCoStatusFilter(e.target.value)}
                  style={{ width:'auto', minWidth:150 }}
                  options={[
                    { value:'all', label:'All Statuses' },
                    { value:'pending', label:`Pending${pendingCount?` (${pendingCount})`:''}` },
                    { value:'approved', label:`Approved${approvedCount?` (${approvedCount})`:''}` },
                    { value:'rejected', label:`Rejected${rejectedCount?` (${rejectedCount})`:''}` },
                  ]}
                />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="coMuted" style={{ fontSize:'var(--fs-sm)' }}>{filteredCos.length} of {cos.length}</span>}
          />
        )}

        <div className="coCq">
          <div className="coSplit" data-open={detailOpen?'true':'false'}>
            <div className="coList">
              <Card flush>{listBody}</Card>
            </div>
            {detailWorkspace}
          </div>
        </div>
      </PageShell>

      {/* ── Composer — walks in knowing the contract, CO history, and bid packages ── */}
      <FormModal
        open={showForm}
        onClose={closeCoForm}
        title={`New Change Order — CO-${padCo(nextCoNumber)}`}
        subtitle={`${ctx?.project?.name ? `${ctx.project.name} · ` : ''}revised contract ${fmt(currentContract)}${pendingCount>0?` · ${pendingCount} pending`:''}`}
        busy={saving}
        footer={
          <>
            {error && <span className="k-error" style={{ marginRight:'auto', alignSelf:'center' }}>{error}</span>}
            <Button variant="ghost" onClick={closeCoForm} disabled={saving}>Cancel</Button>
            <Button icon={<Robot size={15}/>} onClick={()=>analyzeRisk({title:fTitle,description:fDesc,reason:fReason,cost_impact:parseFloat(fCost)||0,schedule_impact:parseFloat(fSchedule)||0},'form')} disabled={(riskLoading&&riskTarget==='form')||!fTitle.trim()}>
              {riskLoading&&riskTarget==='form' ? 'Analyzing…' : 'Analyze Risk (AI)'}
            </Button>
            <Button variant="primary" onClick={createCO} disabled={saving||!fTitle.trim()}>{saving ? 'Creating…' : 'Create Change Order'}</Button>
          </>
        }
      >
        <FormGrid cols={2}>
          <Field label="CO Number" hint={<><AutoChip/> {lastCo ? `Assigned automatically — follows CO-${padCo(lastCo.co_number)}.` : 'Assigned automatically — first change order on this project.'}</>}>
            <Input value={`CO-${padCo(nextCoNumber)}`} readOnly />
          </Field>
          <Field
            label="Related Bid Package"
            hint={selectedPkg
              ? <>Awarded{selectedPkg.awardedTo?` to ${selectedPkg.awardedTo}`:''} at <b>{fmt(Number(selectedPkg.awardedAmount)||0)}</b>{Number(selectedPkg.budgetEstimate)>0 && <> vs {fmt(Number(selectedPkg.budgetEstimate)||0)} budgeted</>}{selectedPkg.csiDivision?` — Div ${selectedPkg.csiDivision}`:''}.</>
              : bidPkgs.length>0 ? `Optional — ties this CO to one of the ${bidPkgs.length} bid packages so the budget sync lands on the right scope.` : 'No bid packages on this project yet — the CO posts against the prime contract.'}
          >
            <Select value={fRelatedPkg} onChange={e=>setFRelatedPkg(e.target.value)} options={[{ value:'', label:'None — prime contract / general' }, ...bidPkgs.map(b=>({ value:String(b.id), label:`${b.name}${b.trade?` — ${b.trade}`:''}` }))]} />
          </Field>
          <Field label="Title" required span>
            <Input value={fTitle} onChange={e=>{ setFTitle(e.target.value); if (error) setError(''); }} placeholder="e.g. Add electrical outlets in server room" autoFocus aria-invalid={error==='Title is required.'||undefined} />
          </Field>
          <Field label="Cost Impact ($)" hint={<>New contract sum <b>{fmt(newContractSum)}</b> — {fmt(contractSum)} original{approvedCOs!==0 && <> {approvedCOs>0?'+':'-'} {fmt(Math.abs(approvedCOs))} approved COs</>} + this CO. Enter a negative number for a credit.</>}>
            <Input type="number" step="0.01" value={fCost} onChange={e=>setFCost(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Schedule Impact (days)" hint={pushedEnd
            ? <>Pushes completion from {fmtDate(projEnd)} to <b>{pushedEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</b>.</>
            : Number(ctx?.schedule?.criticalCount)>0
              ? `${Number(ctx?.schedule?.criticalCount)||0} critical task${Number(ctx?.schedule?.criticalCount)===1?'':'s'} on the schedule — added days land on the critical path.`
              : 'Days added to the project completion date, if any.'}>
            <Input type="number" value={fSchedule} onChange={e=>setFSchedule(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Reason" span>
            <Suggest className="k-input" value={fReason} onChange={e=>setFReason(e.target.value)} placeholder="e.g. Owner request, unforeseen conditions" options={['Owner request', 'Unforeseen conditions', 'Design change', 'Code compliance', 'Material substitution', 'Allowance reconciliation']} />
          </Field>
          <Field label="Description" span>
            <Textarea value={fDesc} onChange={e=>setFDesc(e.target.value)} rows={3} placeholder="Describe the change in detail…" />
          </Field>
        </FormGrid>

        {/* Contract position — live, from the exact-cents engine */}
        <div className="coLadder" style={{ marginTop:16 }}>
          <InsightRow label="Original Contract" value={fmt(contractSum)}/>
          <InsightRow label={`Approved COs (${approvedCount})`} value={fmtSigned(approvedCOs)}/>
          {pendingCount>0 && <InsightRow label={`Pending COs (${pendingCount}) — not in the sum`} value={fmtSigned(pendingCOs)}/>}
          <InsightRow label="This CO" value={fmtSigned(fCostNum)}/>
          <div className="coRule"/>
          <InsightRow label="New Contract Sum (on approval)" value={fmt(newContractSum)} strong/>
          {fSchedNum>0 && <InsightRow label="Schedule Impact" value={`+${fSchedNum} day${fSchedNum===1?'':'s'}`}/>}
        </div>

        {riskTarget==='form' && (riskLoading||riskResult||riskError) && (
          <div style={{ marginTop:16 }}>
            {riskLoading && <div className="coMuted" style={{fontSize:'var(--fs-sm)'}}><Robot size={14} style={{verticalAlign:'-2px',marginRight:6}}/>Running the AI risk read…</div>}
            {riskError && <div className="coInlineErr" role="alert"><WarningCircle size={15}/> {riskError}</div>}
            {riskResult && <AIRiskPanel result={riskResult} onClose={()=>{setRiskResult(null);setRiskTarget(null);}} />}
          </div>
        )}

        <div style={{ marginTop:16 }}>
          <FlowSteps title="After You Submit" steps={[
            {title:'CO Logged as Pending', desc:`Numbered CO-${padCo(nextCoNumber)} automatically and queued for a decision.`},
            {title:'Owner Approval', desc:'Approve or reject right from the log — status flips instantly.'},
            {title:'Contract Sum Auto-Updates', desc:`On approval the revised contract and prime contract move to ${fmt(newContractSum)} on their own.`},
            {title:'Budget Line Syncs', desc:'The matching budget line absorbs the approved amount — nothing re-typed in Budget.'},
          ]}/>
        </div>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position:'relative', zIndex:10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
