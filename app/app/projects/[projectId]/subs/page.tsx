'use client';
import { useProjectContext, refreshProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { Handshake, Users, Plus, ShieldCheck, ShieldWarning, AddressBook, WarningCircle, PencilSimple, Trash } from '@phosphor-icons/react';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle, secondaryButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { DataTable, FormModal, FormGrid, Field, Input } from '@/components/ui/kit';
import { StatusPill } from '@/components/ui/Status';
import Suggest from '@/components/ui/Suggest';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import type { JobSub } from '@/lib/job-subs';

/**
 * The subcontractors on this job.
 *
 * The list is the job's own subs (project_subcontractors, via
 * /api/projects/[id]/subs) with what each is contracted for and has been paid
 * HERE. It used to be the whole company directory, and "Add" created a new
 * directory company every time — picking ABC Electric made a second ABC
 * Electric — without ever putting anyone on the job; the contract amount typed
 * in was thrown away, and the trash button deleted the company itself (from
 * every job, with its insurance and documents). Now:
 *   Add     — type a company: one already in your directory fills the rest and
 *             goes on the job; a new name is added to the directory and the job.
 *   Open    — tap a row: everything on file, this job's contract and payments.
 *   Edit    — the company's details and this job's contract amount.
 *   Remove  — takes the company off THIS job; it stays in the directory.
 */

const GOLD='var(--brand-primary)',DIM='var(--text-secondary)',TEXT='var(--text-primary)';
const cap = (s:string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
/* One column below 900px / 700px; 44px buttons and 16px inputs on a phone. */
const SUBS_CSS = `
.sbAddGrid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; margin-bottom: 20px; }
.sbFields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.sbAddGrid button { min-height: 44px; }
.sbAddGrid input, .sbAddGrid select { min-height: 44px; }
.sbRec { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 4px 18px; }
.sbRecActs { display: flex; gap: 10px; flex-wrap: wrap; width: 100%; }
.sbRecActs button { min-height: 44px; }
@media (max-width: 900px) { .sbAddGrid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 700px) { .sbFields { grid-template-columns: minmax(0, 1fr); } .sbAddGrid input, .sbAddGrid select { font-size: 16px !important; } }
`;

/** A company in the tenant directory (/api/subs/list). */
interface DirSub {
  id: string; name: string; trade: string; contact_name: string; contact_email: string;
  contact_phone: string; license_number: string; insurance_expiry: string; status: string;
  w9_on_file?: boolean; w9_status?: string;
}

// The `subcontractors` table stores company_name / email / phone — normalize
// onto the names this page renders so rows never come back blank.
function normalizeDir(r: any): DirSub {
  return {
    ...r,
    name: r.company_name ?? r.name ?? '',
    contact_email: r.contact_email ?? r.email ?? '',
    contact_phone: r.contact_phone ?? r.phone ?? '',
  };
}

type Paper = { w9_on_file?: boolean | null; w9_status?: string; insurance_expiry?: string | null };
function w9Ok(s: Paper) { return s.w9_on_file === true || s.w9_status === 'submitted'; }
function coiState(s: Paper): { label: string; color: string; ok: boolean } {
  if (!s.insurance_expiry) return { label: 'COI not on file', color: 'var(--danger)', ok: false };
  const exp = new Date(String(s.insurance_expiry).slice(0, 10) + 'T00:00:00');
  const days = Math.floor((exp.getTime() - Date.now()) / 86400000);
  const d = exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (days < 0) return { label: `COI expired ${d}`, color: 'var(--danger)', ok: false };
  if (days <= 30) return { label: `COI expires in ${days}d`, color: 'var(--warning)', ok: true };
  return { label: `COI valid through ${d}`, color: 'var(--success)', ok: true };
}
function hasComplianceIssue(s: Paper) { return !w9Ok(s) || !coiState(s).ok; }

const EMPTY_FORM = { name:'', trade:'', contact_name:'', contact_email:'', contact_phone:'', license_number:'', contract_amount:'' };
type SubForm = typeof EMPTY_FORM;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The record's id lives in the URL (?sub=), so a reload lands back on it. */
function subFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('sub');
}

export default function SubsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [subs, setSubs] = useState<JobSub[]>([]);
  const [directory, setDirectory] = useState<DirSub[]>([]);
  const [dirError, setDirError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);
  const [search, setSearch] = useState('');
  const [filterTrade, setFilterTrade] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState<SubForm>(EMPTY_FORM);
  /** Why Add Subcontractor refused, said beside the button (role="alert"). */
  const [formErr, setFormErr] = useState('');
  const [pickId, setPickId] = useState('');
  const [auto, setAuto] = useState<{name?:boolean;trade?:boolean;contact?:boolean;license?:boolean;amount?:boolean}>({});
  /* The open record, and its edit form. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<SubForm>(EMPTY_FORM);
  const [editErr, setEditErr] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `subs:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm({ ...EMPTY_FORM, ...(d as Partial<SubForm>) }); setShowForm(true); },
    onSave: () => handleCreate(),
  });

  // SmartCreate: walk in knowing awards on this job.
  const { ctx } = useProjectContext(projectId);

  useEffect(() => { if(toast) { const t=setTimeout(()=>setToast(null),4000); return ()=>clearTimeout(t); } return undefined; }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    const [job, dir] = await Promise.allSettled([
      fetch(`/api/projects/${projectId}/subs`).then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Could not load this job’s subcontractors.');
        return (d.subs || []) as JobSub[];
      }),
      fetch('/api/subs/list').then(async (r) => {
        if (!r.ok) throw new Error('directory');
        const d = await r.json();
        return ((d.subs || d.data || []) as any[]).map(normalizeDir);
      }),
    ]);
    if (job.status === 'fulfilled') { setSubs(job.value); setLoadError(''); }
    else setLoadError(job.reason instanceof Error ? job.reason.message : 'Could not load this job’s subcontractors.');
    if (dir.status === 'fulfilled') { setDirectory(dir.value); setDirError(false); } else setDirError(true);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  /* ?sub= opens that record — on load, on a reload, and on Back/Forward. */
  useEffect(() => {
    const sync = () => { setOpenId(subFromUrl()); setEditing(false); setEditErr(''); };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const openSub = (id: string) => {
    const u = new URL(window.location.href); u.searchParams.set('sub', id);
    window.history.pushState(null, '', u.toString());
    setOpenId(id); setEditing(false); setEditErr('');
  };
  const closeSub = () => {
    const u = new URL(window.location.href); u.searchParams.delete('sub');
    window.history.replaceState(null, '', u.toString());
    setOpenId(null); setEditing(false); setEditErr('');
  };
  const record = openId ? subs.find((s) => s.id === openId) ?? null : null;

  const onJob = useMemo(() => new Set(subs.map((s) => s.id)), [subs]);
  /** Directory companies not on this job yet — what the Company field suggests. */
  const pickable = useMemo(() => directory.filter((d) => !onJob.has(d.id)), [directory, onJob]);

  // Typing a company already in the directory fills the rest from it.
  function onCompanyName(v: string) {
    if (formErr) setFormErr('');
    const hit = pickable.find((d) => d.name.trim().toLowerCase() === v.trim().toLowerCase());
    if (hit && hit.id !== pickId) {
      const award = ((ctx?.bidPackages || []) as any[]).find(b => b.awardedTo && String(b.awardedTo).toLowerCase() === hit.name.toLowerCase());
      const amount = Number(award?.awardedAmount) || 0;
      setPickId(hit.id);
      setForm({
        name: hit.name, trade: hit.trade || '', contact_name: hit.contact_name || '',
        contact_email: hit.contact_email || '', contact_phone: hit.contact_phone || '',
        license_number: hit.license_number || '', contract_amount: amount > 0 ? String(amount) : form.contract_amount,
      });
      setAuto({ name: true, trade: !!hit.trade, contact: !!(hit.contact_name || hit.contact_email || hit.contact_phone), license: !!hit.license_number, amount: amount > 0 });
      return;
    }
    if (!hit && pickId) { setPickId(''); setAuto({}); }
    setForm((p) => ({ ...p, name: v }));
  }
  const picked = pickId ? directory.find(x => x.id === pickId) : undefined;
  const pickedAward = picked ? ((ctx?.bidPackages || []) as any[]).find(b => b.awardedTo && picked.name && String(b.awardedTo).toLowerCase() === picked.name.toLowerCase()) : undefined;

  const closeForm = () => { setShowForm(false); setForm(EMPTY_FORM); setPickId(''); setAuto({}); setFormErr(''); };
  /* The form opens below the job's numbers — on a phone that is off screen,
     so bring it up and put the cursor in Company Name. */
  const openForm = () => {
    setShowForm(true); setFormErr('');
    requestAnimationFrame(() => {
      const el = document.getElementById('sb-company-name');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLInputElement | null)?.focus({ preventScroll: true });
    });
  };

  const handleCreate = async (e?: React.FormEvent): Promise<boolean> => {
    e?.preventDefault();
    if (saving) return false;
    // The page owns the rule (the native `required` bubble was easy to miss on a phone).
    if (!form.name.trim()) {
      setFormErr('Enter the company name.');
      document.getElementById('sb-company-name')?.focus();
      return false;
    }
    if (form.contact_email.trim() && !EMAIL_RE.test(form.contact_email.trim())) {
      setFormErr('That email doesn’t look right — fix it or leave it blank.');
      document.getElementById('sb-contact-email')?.focus();
      return false;
    }
    setFormErr('');
    setSaving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/subs`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, subcontractorId: pickId || undefined }),
      });
      const b = await r.json().catch(() => ({}));
      if (r.status === 409 && b.existing?.id) {
        // Already in the directory under that name: use it, don't copy it.
        const hit = directory.find((d) => d.id === b.existing.id);
        if (hit) onCompanyName(hit.name);
        setFormErr(`${b.existing.company_name} is already in your directory — its details are filled in. Press Add Subcontractor to put it on this job.`);
        return false;
      }
      if (!r.ok) throw new Error(b.error || 'Could not add the subcontractor.');
      closeForm();
      setToast({msg:`${b.sub?.company_name || 'Subcontractor'} is on this job`,type:'success'});
      guard.clearDraft();
      await load();
      refreshProjectContext(projectId).catch(() => { /* the job's other screens catch up on their next read */ });
      return true;
    } catch (err: unknown) {
      setFormErr(humanError(err,'Could not add the subcontractor. Please try again.'));
    } finally {
      setSaving(false);
    }
    return false;
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    const prev = subs;
    setSubs(p => p.map(s => s.id === id ? {...s, status} : s));
    try {
      const r = await fetch(`/api/projects/${projectId}/subs/${id}`, { method: 'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status}) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || 'update failed'); }
    } catch (err) { setSubs(prev); setToast({msg: humanError(err, 'Could not update status. Please try again.'), type:'error'}); }
  };

  const startEdit = (s: JobSub) => {
    setEdit({
      name: s.company_name, trade: s.trade || '', contact_name: s.contact_name || '', contact_email: s.contact_email || '',
      contact_phone: s.contact_phone || '', license_number: s.license_number || '', contract_amount: s.contract_amount ? String(s.contract_amount) : '',
    });
    setEditErr(''); setEditing(true);
  };
  const saveEdit = async () => {
    if (!record || editBusy) return;
    if (!edit.name.trim()) { setEditErr('Company Name: a company needs a name.'); return; }
    if (edit.contact_email.trim() && !EMAIL_RE.test(edit.contact_email.trim())) { setEditErr('Email: that doesn’t look right — fix it or leave it blank.'); return; }
    setEditBusy(true); setEditErr('');
    try {
      const body: Record<string, string> = {
        company_name: edit.name, trade: edit.trade, contact_name: edit.contact_name, contact_email: edit.contact_email,
        contact_phone: edit.contact_phone, license_number: edit.license_number,
      };
      if (record.assignment_ids.length === 1) body.contract_amount = edit.contract_amount;
      const r = await fetch(`/api/projects/${projectId}/subs/${record.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Could not save the subcontractor.');
      if (b.sub) setSubs(p => p.map(s => s.id === record.id ? b.sub : s));
      setEditing(false);
      setToast({msg:'Saved',type:'success'});
      refreshProjectContext(projectId).catch(() => { /* catches up on its next read */ });
    } catch (err) {
      setEditErr(humanError(err, 'Could not save the subcontractor. Please try again.'));
    } finally { setEditBusy(false); }
  };

  const removeFromJob = async (s: JobSub) => {
    const ok = await confirmDialog({
      title: `Remove ${s.company_name} from this job?`,
      message: `${s.company_name} comes off this job. They stay in your directory with their insurance, W-9 and history, ready for the next job.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/subs/${s.id}`, { method: 'DELETE' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Could not take the subcontractor off this job.');
      closeSub();
      setSubs(p => p.filter(x => x.id !== s.id));
      setToast({msg:`${s.company_name} is off this job`,type:'success'});
      refreshProjectContext(projectId).catch(() => { /* catches up on its next read */ });
    } catch (err) {
      setEditErr(humanError(err, 'Could not take the subcontractor off this job.'));
    } finally { setRemoving(false); }
  };

  const known = subs.length > 0 || (!loading && !loadError);
  const awardedPkgs = ((ctx?.bidPackages || []) as any[]).filter(b => b.awardedTo);
  const complianceIssues = subs.filter(hasComplianceIssue).length;
  const totalContract = subs.reduce((s,sub) => s + (sub.contract_amount||0), 0);
  const totalPaid = subs.reduce((s,sub) => s + (sub.paid_amount||0), 0);

  const inpS: React.CSSProperties = {width:'100%',padding:'8px 12px',background:'var(--bg-surface-2)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:6,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box'};
  const lblS: React.CSSProperties = {display:'block',fontSize:12,color:DIM,marginBottom:4,fontWeight:600};
  const hintS: React.CSSProperties = {fontSize:12,color:'var(--c-text-2)',marginTop:5,lineHeight:1.45};

  const subTrades = Array.from(new Set(subs.map(s => s.trade || '').filter(Boolean))).sort();
  const filteredSubs = subs.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      const hit = (s.company_name || '').toLowerCase().includes(q)
        || (s.contact_name || '').toLowerCase().includes(q)
        || (s.contact_email || '').toLowerCase().includes(q)
        || (s.license_number || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filterTrade !== 'all' && s.trade !== filterTrade) return false;
    if (filterStatus !== 'all' && (s.status || 'active') !== filterStatus) return false;
    return true;
  });

  return (
    <PremiumSurface maxWidth={2200}>
      <style dangerouslySetInnerHTML={{ __html: SUBS_CSS }} />
      {toast && <div role={toast.type==='error'?'alert':'status'} style={{position:'fixed',bottom:'calc(24px + var(--sag-tabbar-h, 0px))',left:'50%',transform:'translateX(-50%)',zIndex:99999,maxWidth:'calc(100vw - 32px)',padding:'12px 20px',borderRadius:8,background:toast.type==='success'?'rgba(74,222,128,0.9)':'rgba(248,113,113,0.9)',color:'var(--text-primary)',fontWeight:600,fontSize:14}}>{toast.msg}</div>}

      <ModuleHero
        eyebrow="Subcontractors"
        eyebrowIcon={<Handshake size={13} weight="fill" color="var(--text-secondary)" />}
        title="Subs on"
        accent="This Job"
        subtitle="Who is working this job, what they are contracted for, what they have been paid, and whether their paperwork is current."
        actions={
          <button type="button" onClick={()=>{ if (showForm) closeForm(); else openForm(); }} style={goldButtonStyle} className="pmBtn">
            {showForm ? 'Cancel' : <><Plus size={15} weight="bold" /> Add Subcontractor</>}
          </button>
        }
      />

      {/* Until the job's list has loaded (or when it failed) the numbers are unknown, not zero. */}
      <StatStrip items={[
        {href: '#job-subs', label: 'Subs on Job', value: known ? String(subs.length) : '—', sub: 'On this job' },
        {href: `/app/projects/${projectId}/contracts`, label: 'Sub Contracts', value: known ? fmt(totalContract) : '—', sub: known ? `${fmt(totalPaid)} paid so far` : 'Not loaded' },
        {href: `/app/projects/${projectId}/compliance`, label: 'Compliance', value: known ? String(complianceIssues) : '—', accent: !known ? undefined : complianceIssues > 0 ? 'var(--danger)' : 'var(--success)', sub: !known ? 'Not loaded' : complianceIssues > 0 ? 'W-9 or COI missing' : subs.length ? 'Everyone is current' : 'Nobody on it yet' },
        {href: '/app/subs', label: 'Directory', value: dirError ? '—' : String(directory.length), sub: 'Companies on file' },
        ...(ctx ? [{href: `/app/projects/${projectId}/bid-packages`, label: 'Awarded', value: String(awardedPkgs.length), sub: `${fmt(awardedPkgs.reduce((s, b) => s + (Number(b.awardedAmount) || 0), 0))} awarded` }] : []),
      ]} />

      {/* Add — type a company: one in the directory fills the rest */}
      {showForm && (
        <div className="sbAddGrid">
          <SectionCard title="Add Subcontractor" subtitle="Type a company in your directory — or a new one" icon={<Handshake size={17} weight="duotone" color="var(--text-secondary)" />}>
            <form onSubmit={handleCreate} noValidate>
              <div className="sbFields">
                <div>
                  <label htmlFor="sb-company-name" style={lblS}>Company Name<span style={{color:'var(--danger)'}}> *</span>{auto.name&&<AutoChip/>}</label>
                  <Suggest id="sb-company-name" placeholder="ABC Electric LLC" value={form.name} onChange={e=>onCompanyName(e.target.value)} options={pickable.map(d => d.name).filter(Boolean)} style={inpS} aria-required="true" aria-invalid={formErr && !form.name.trim() ? true : undefined} />
                  <div style={hintS}>{dirError ? 'Couldn’t load your directory — a new company still works.' : pickable.length ? `${pickable.length} in your directory — start typing to pick one.` : 'A new company is added to your directory too.'}</div>
                </div>
                <div>
                  <label htmlFor="sb-trade" style={lblS}>Trade{auto.trade&&<AutoChip/>}</label>
                  <select id="sb-trade" value={form.trade} onChange={e=>setForm(p=>({...p,trade:e.target.value}))} style={{...inpS,cursor:'pointer'}}>
                    <option value="">Select trade…</option>
                    {form.trade && !SUB_TRADES.includes(form.trade) && <option value={form.trade}>{form.trade}</option>}
                    {SUB_TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="sb-amount" style={lblS}>Contract Amount on This Job{auto.amount&&<AutoChip/>}</label>
                  <input id="sb-amount" type="number" inputMode="decimal" min={0} step="0.01" placeholder="150000" value={form.contract_amount} onChange={e=>setForm(p=>({...p,contract_amount:e.target.value}))} style={inpS} />
                  {auto.amount && <div style={hintS}>{pickedAward?`From their award on "${pickedAward.name}".`:'Their committed amount on this project.'}</div>}
                </div>
                <div>
                  <label htmlFor="sb-contact-name" style={lblS}>Contact Name{auto.contact&&<AutoChip/>}</label>
                  <input id="sb-contact-name" type="text" placeholder="John Smith" value={form.contact_name} onChange={e=>setForm(p=>({...p,contact_name:e.target.value}))} style={inpS} />
                </div>
                <div>
                  <label htmlFor="sb-contact-email" style={lblS}>Email{auto.contact&&<AutoChip/>}</label>
                  <input id="sb-contact-email" type="email" inputMode="email" autoCapitalize="none" placeholder="john@abc.com" value={form.contact_email} onChange={e=>{const v=e.target.value;setForm(p=>({...p,contact_email:v}));if(formErr)setFormErr('');}} style={inpS} />
                </div>
                <div>
                  <label htmlFor="sb-contact-phone" style={lblS}>Phone{auto.contact&&<AutoChip/>}</label>
                  <input id="sb-contact-phone" type="tel" inputMode="tel" placeholder="(602) 555-1234" value={form.contact_phone} onChange={e=>setForm(p=>({...p,contact_phone:e.target.value}))} style={inpS} />
                </div>
                <div>
                  <label htmlFor="sb-license" style={lblS}>License #{auto.license&&<AutoChip/>}</label>
                  <input id="sb-license" type="text" placeholder="ROC-123456" value={form.license_number} onChange={e=>setForm(p=>({...p,license_number:e.target.value}))} style={inpS} />
                </div>
              </div>
              {formErr && <div role="alert" style={{marginTop:14,padding:'10px 12px',borderRadius:8,background:'rgba(248,113,113,0.10)',border:'1px solid rgba(248,113,113,0.45)',color:'var(--danger)',fontSize:13,lineHeight:1.5}}>{formErr}</div>}
              <div style={{marginTop:16,display:'flex',gap:10,flexWrap:'wrap'}}>
                <button type="submit" disabled={saving} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> {saving ? 'Adding…' : 'Add Subcontractor'}</button>
                <button type="button" onClick={closeForm} style={ghostButtonStyle} className="pmBtn">Cancel</button>
              </div>
            </form>
          </SectionCard>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <SectionCard flat title="Compliance Snapshot" icon={picked ? (hasComplianceIssue(picked) ? <ShieldWarning size={17} weight="duotone" color="var(--danger)" /> : <ShieldCheck size={17} weight="duotone" color="var(--success)" />) : <ShieldCheck size={17} weight="duotone" color="var(--text-secondary)" />}>
              {picked ? (
                <>
                  <InsightRow label="W-9" value={w9Ok(picked)?'On file':'Missing'} accent={w9Ok(picked)?'var(--success)':'var(--danger)'} strong/>
                  <InsightRow label="Insurance" value={coiState(picked).label} accent={coiState(picked).color}/>
                  <InsightRow label="License" value={picked.license_number||'Not on file'} accent={picked.license_number?undefined:'var(--warning)'}/>
                  <InsightRow label="Directory Status" value={cap(picked.status||'active')}/>
                  {pickedAward && <InsightRow label="Award" value={`${fmt(Number(pickedAward.awardedAmount)||0)} — ${pickedAward.name}`} accent={GOLD} strong/>}
                </>
              ) : (
                <>
                  <InsightRow label="W-9 on File" value={`${subs.filter(w9Ok).length} / ${subs.length}`}/>
                  <InsightRow label="COI Current" value={`${subs.filter(s=>coiState(s).ok).length} / ${subs.length}`}/>
                  <div style={{...hintS,marginTop:8}}>Type a company from your directory to see its W-9, COI and license standing before it joins the job.</div>
                </>
              )}
            </SectionCard>
            <SectionCard flat title="After You Add" icon={<AddressBook size={17} weight="duotone" color="var(--text-secondary)" />}>
              <FlowSteps title="" steps={[
                {title:'On This Job',desc:'The company joins this job with its contract amount, and stays in your directory for the next one.'},
                {title:'W-9 Request Auto-Sends',desc:'Over $600 with an email on file, a W-9 e-request goes out automatically.'},
                {title:'Preliminary Notice Reminder',desc:'AZ, CA, and TX projects get a 20-day prelim notice task on compliance.'},
                {title:'Compliance Tracking Begins',desc:'COI expiry and W-9 status feed the compliance column.'},
              ]}/>
            </SectionCard>
          </div>
        </div>
      )}

      <div id="job-subs" style={{ scrollMarginTop: 76 }} />
      {loading && subs.length === 0 && (
        <SectionCard flat>
          <div style={{padding:40,textAlign:'center',color:DIM}}>Loading subcontractors…</div>
        </SectionCard>
      )}

      {/* A failed read is not an empty job. */}
      {!loading && loadError && subs.length === 0 && (
        <PremiumEmpty
          icon={<WarningCircle size={30} weight="duotone" color="var(--danger)" />}
          title="Couldn’t load this job’s subcontractors"
          description={loadError}
          tone="error"
          action={<button type="button" onClick={() => load()} style={secondaryButtonStyle} className="pmBtn">Try Again</button>}
        />
      )}

      {!loading && !loadError && subs.length === 0 && (
        <SectionCard>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:800,color:TEXT}}>
              <Handshake size={16} weight="duotone" color="var(--text-secondary)" style={{marginRight:7,verticalAlign:'text-bottom'}} />
              No subcontractors on this job yet
              <span style={{fontWeight:400,color:DIM}}>{showForm ? ' — add the first company in the form above.' : ' — add the first company to start the job’s roster.'}</span>
            </div>
            {!showForm && (
              <button type="button" onClick={openForm} style={secondaryButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Subcontractor</button>
            )}
          </div>
          <FlowStrip steps={[
            { title: 'Add the Company', desc: 'Your directory fills it in' },
            { title: 'W-9 Auto-Requests', desc: 'Over $600 with an email' },
            { title: 'Compliance Tracked', desc: 'COI expiry and W-9 status' },
            { title: 'Ready for Bids', desc: 'Invites and contracts' },
          ]} />
        </SectionCard>
      )}

      {subs.length > 0 && (
        <>
          {loadError && <div role="alert" style={{color:'var(--danger)',fontSize:13,marginBottom:10}}>{loadError}</div>}
          <ListToolbar
            module="subs"
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Company, contact or license"
            filters={[
              {key:'trade',label:'Trade',value:filterTrade,onChange:setFilterTrade,allLabel:'All Trades',
                options:subTrades},
              {key:'status',label:'Status',value:filterStatus,onChange:setFilterStatus,allLabel:'All Statuses',
                options:['active','prequalified','invited','suspended','inactive'].map(s=>({value:s,label:cap(s)}))},
            ]}
            count={{shown:filteredSubs.length,total:subs.length}}
            style={{marginBottom:14}}
          />
          <SectionCard title="Subcontractors" subtitle={`${subs.length} on this job — tap one to open it`} icon={<Users size={17} weight="duotone" color="var(--text-secondary)" />} flush>
            <DataTable<JobSub>
              columns={[
                { key: 'name', header: 'Company', primary: true, phone: 'show', accessor: (sub) => sub.company_name || '', render: (sub) => (
                  <span className="k-name"><span className="k-avatar" aria-hidden>{(sub.company_name||'?').split(/\s+/).slice(0,2).map((w: string)=>w[0]?.toUpperCase()||'').join('')}</span><span className="k-name-text"><span>{sub.company_name}</span><span>{sub.contact_email}</span></span></span>
                ) },
                { key: 'trade', header: 'Trade', phone: 'show', accessor: (sub) => sub.trade || '', render: (sub) => <span style={{color: 'var(--text-primary)',fontWeight:600}}>{sub.trade||'—'}</span> },
                { key: 'contact_name', header: 'Contact', phone: 'hide', accessor: (sub) => sub.contact_name || '', render: (sub) => <span className="k-cell-stack"><span>{sub.contact_name||'—'}</span>{sub.contact_phone && <span>{sub.contact_phone}</span>}</span> },
                { key: 'license_number', header: 'License', phone: 'hide', accessor: (sub) => sub.license_number || '', render: (sub) => sub.license_number ? <span style={{fontFamily:'monospace',fontSize:12}}>{sub.license_number}</span> : <StatusPill module="paperwork" status="not_on_file" size="sm" /> },
                { key: 'paper', header: 'W-9 / COI', sortable: false, phone: 'show', render: (sub) => { const coi = coiState(sub); return (
                  <span style={{display:'inline-flex',gap:4,flexWrap:'wrap'}}>
                    <StatusPill module="paperwork" status={w9Ok(sub)?'on_file':'missing'} label={w9Ok(sub)?'W-9 on file':'W-9 missing'} size="sm" />
                    <StatusPill module="paperwork" status={coi.ok ? 'active' : /expired/i.test(coi.label) ? 'expired' : /missing|none|not on file/i.test(coi.label) ? 'not_on_file' : 'expiring'} label={`COI · ${coi.label}`} size="sm" />
                  </span>); } },
                { key: 'contract', header: 'Contract', align: 'right', phone: 'show', accessor: (sub) => sub.contract_amount || null, render: (sub) => <span style={{color:TEXT,fontWeight:600}}>{fmt(sub.contract_amount)}</span> },
                { key: 'paid', header: 'Paid', align: 'right', phone: 'show', accessor: (sub) => sub.paid_amount || 0, render: (sub) => <span style={{color:'var(--success)',fontWeight:600}}>{fmt(sub.paid_amount)}</span> },
                { key: 'status', header: 'Status', phone: 'show', accessor: (sub) => sub.status || 'active', render: (sub) => (
                  <select aria-label={`Status of ${sub.company_name}`} value={sub.status||'active'} onClick={e=>e.stopPropagation()} onChange={e=>handleUpdateStatus(sub.id,e.target.value)} className="k-input" style={{height:30,fontSize:12,padding:'0 8px',width:'auto'}}>
                    {['active','prequalified','invited','suspended','inactive'].map(s=><option key={s} value={s}>{cap(s)}</option>)}
                  </select>) },
              ]}
              rows={filteredSubs}
              rowKey={(sub) => sub.id}
              onRowClick={(sub) => openSub(sub.id)}
              isSelected={(sub) => sub.id === openId}
              defaultSort={{ key: 'name', dir: 'asc' }}
              empty="No subcontractors match your search or filters."
            />
          </SectionCard>
        </>
      )}

      {/* The record: everything on file, this job's contract and payments; Edit; Remove from this job. */}
      {record && typeof document !== 'undefined' && createPortal(
        editing ? (
          <FormModal
            open
            onClose={() => { if (!editBusy) setEditing(false); }}
            title={`Edit ${record.company_name}`}
            subtitle="Company details change everywhere it works; the contract amount is this job's."
            onSubmit={saveEdit}
            submitLabel="Save Changes"
            busy={editBusy}
            error={editErr}
          >
            <FormGrid cols={2}>
              <Field label="Company Name" required>
                <Input id="sb-edit-name" value={edit.name} onChange={(e) => setEdit(p => ({ ...p, name: e.target.value }))} required />
              </Field>
              <Field label="Trade">
                <select id="sb-edit-trade" className="k-select" value={edit.trade} onChange={(e) => setEdit(p => ({ ...p, trade: e.target.value }))}>
                  <option value="">Select trade…</option>
                  {edit.trade && !SUB_TRADES.includes(edit.trade) && <option value={edit.trade}>{edit.trade}</option>}
                  {SUB_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Contact Name">
                <Input id="sb-edit-contact" value={edit.contact_name} onChange={(e) => setEdit(p => ({ ...p, contact_name: e.target.value }))} />
              </Field>
              <Field label="Email">
                <Input id="sb-edit-email" type="email" inputMode="email" autoCapitalize="none" value={edit.contact_email} onChange={(e) => setEdit(p => ({ ...p, contact_email: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <Input id="sb-edit-phone" type="tel" inputMode="tel" value={edit.contact_phone} onChange={(e) => setEdit(p => ({ ...p, contact_phone: e.target.value }))} />
              </Field>
              <Field label="License #">
                <Input id="sb-edit-license" value={edit.license_number} onChange={(e) => setEdit(p => ({ ...p, license_number: e.target.value }))} />
              </Field>
              <Field label="Contract Amount on This Job" hint={record.assignment_ids.length > 1 ? 'Set by its bid-package awards — change it on the package.' : undefined}>
                <Input id="sb-edit-amount" type="number" inputMode="decimal" min={0} step="0.01" value={edit.contract_amount} disabled={record.assignment_ids.length > 1} onChange={(e) => setEdit(p => ({ ...p, contract_amount: e.target.value }))} />
              </Field>
            </FormGrid>
          </FormModal>
        ) : (
          <FormModal
            open
            onClose={closeSub}
            title={record.company_name}
            subtitle={[record.trade, record.from_award ? 'Awarded through a bid package' : null].filter(Boolean).join(' · ') || 'Subcontractor on this job'}
            footer={(
              <div className="sbRecActs">
                {editErr && <span className="k-error" role="alert" style={{ width: '100%' }}>{editErr}</span>}
                <button type="button" onClick={() => startEdit(record)} style={goldButtonStyle} className="pmBtn"><PencilSimple size={15} weight="bold" /> Edit</button>
                <button type="button" onClick={() => removeFromJob(record)} disabled={removing} style={{ ...ghostButtonStyle, color: 'var(--danger)' }} className="pmBtn"><Trash size={15} weight="bold" /> {removing ? 'Removing…' : 'Remove From Job'}</button>
                <button type="button" onClick={closeSub} style={ghostButtonStyle} className="pmBtn">Close</button>
              </div>
            )}
          >
            <div className="sbRec">
              <InsightRow label="Contract on This Job" value={fmt(record.contract_amount)} accent={GOLD} strong />
              <InsightRow label="Paid on This Job" value={fmt(record.paid_amount)} accent="var(--success)" />
              <InsightRow label="Contact" value={record.contact_name || 'Not on file'} />
              <InsightRow label="Email" value={record.contact_email || 'Not on file'} />
              <InsightRow label="Phone" value={record.contact_phone || 'Not on file'} />
              <InsightRow label="License" value={record.license_number || 'Not on file'} accent={record.license_number ? undefined : 'var(--warning)'} />
              <InsightRow label="W-9" value={w9Ok(record) ? 'On file' : 'Missing'} accent={w9Ok(record) ? 'var(--success)' : 'var(--danger)'} />
              <InsightRow label="Insurance" value={coiState(record).label} accent={coiState(record).color} />
              <InsightRow label="Directory Status" value={cap(record.status || 'active')} />
            </div>
          </FormModal>
        ),
        document.body,
      )}
      {openId && !record && !loading && typeof document !== 'undefined' && createPortal(
        <FormModal open onClose={closeSub} title="Not on this job" footer={<button type="button" onClick={closeSub} style={ghostButtonStyle} className="pmBtn">Close</button>}>
          <p style={{ margin: 0, color: DIM, fontSize: 14, lineHeight: 1.55 }}>That company isn’t on this job any more — it may have been removed. It is still in your directory.</p>
        </FormModal>,
        document.body,
      )}
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
