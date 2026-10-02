'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { Badge, Table, T } from '@/components/ui/shell';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { Clipboard, NotePencil, CheckCircle, CurrencyDollar, Plus, X, Warning, ClockCounterClockwise, ArrowRight } from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import PermitCorrespondence from '@/components/PermitCorrespondence';

interface Permit {
  id: string;
  permit_type: string;
  permit_number: string;
  issuing_authority: string;
  applied_date: string;
  issued_date: string | null;
  expiry_date: string | null;
  fee: number;
  status: string;
  project_id: string;
}

const TYPES = ['Building', 'Electrical', 'Plumbing', 'Mechanical', 'Fire', 'Grading'];

const STATUS_BADGE: Record<string, 'amber' | 'green' | 'red' | 'muted' | 'blue'> = {
  applied: 'amber',
  issued: 'green',
  inspections: 'blue',
  expired: 'red',
  closed: 'muted',
};

// The permit lifecycle — applied for, issued by the AHJ, inspected while work
// proceeds, then closed at final sign-off.
const PIPELINE: { key: string; label: string; desc: string }[] = [
  { key: 'applied', label: 'Applied', desc: 'submitted to the AHJ' },
  { key: 'issued', label: 'Issued', desc: 'approved — work may start' },
  { key: 'inspections', label: 'Inspections', desc: 'AHJ sign-offs in progress' },
  { key: 'closed', label: 'Closed', desc: 'final approval on record' },
];

const EMPTY_FORM = {
  permit_type: 'Building',
  number: '',
  authority: '',
  fee: 0,
  applied_date: '',
  issued_date: '',
  expiry_date: '',
};

export default function PermitsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `permits:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const fetchPermits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/permits`);
      const json = await res.json();
      setPermits(json.permits || []);
    } catch {
      setPermits([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchPermits(); }, [fetchPermits]);

  // Project intelligence — one snapshot; the register walks in knowing the job.
  const { ctx } = useProjectContext(projectId);
  const [autoF, setAutoF] = useState<{ authority?: boolean; applied?: boolean }>({});
  // ListToolbar state — filters persist per module via sag_flt_permits.
  const [permitSearch, setPermitSearch] = useState('');
  const [permitStatusFilter, setPermitStatusFilter] = useState('all');
  const [permitTypeFilter, setPermitTypeFilter] = useState('all');

  // Jurisdiction guess from the project address — "123 Main St, Mesa, AZ 85201"
  // -> "Mesa". Only a prefill; the GC corrects it once and moves on.
  const addr = String(ctx?.project?.address || '');
  const city = (addr.split(',')[1] || '').trim().replace(/\d.*$/, '').trim();

  // Effective status: the stored stage, flipped to expired once past expiry.
  const effStatus = (p: Permit) => (p.expiry_date && p.expiry_date < today && p.status !== 'closed') ? 'expired' : (p.status || 'applied');
  const daysToExpiry = (p: Permit) => p.expiry_date ? Math.ceil((new Date(p.expiry_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000) : null;

  const applied = permits.filter(p => effStatus(p) === 'applied').length;
  const issued = permits.filter(p => effStatus(p) === 'issued').length;
  const inInspections = permits.filter(p => effStatus(p) === 'inspections').length;
  const closed = permits.filter(p => effStatus(p) === 'closed').length;
  const expired = permits.filter(p => effStatus(p) === 'expired').length;
  const openCount = applied + issued + inInspections;
  const expiringSoon = permits.filter(p => { const d = daysToExpiry(p); const st = effStatus(p); return st !== 'closed' && st !== 'expired' && d !== null && d >= 0 && d <= 30; });
  // DB numerics can round-trip as strings — always coerce before math.
  const totalFees = permits.reduce((s, p) => s + (Number(p.fee) || 0), 0);
  const stageCount: Record<string, number> = { applied, issued, inspections: inInspections, closed };

  // Toolbar-driven view of the register. Status matches the effective (expiry-aware) status.
  const qP = permitSearch.trim().toLowerCase();
  const filteredPermits = permits.filter(p => {
    const st = effStatus(p);
    if (permitStatusFilter !== 'all' && st !== permitStatusFilter) return false;
    if (permitTypeFilter !== 'all' && p.permit_type !== permitTypeFilter) return false;
    if (!qP) return true;
    return [p.permit_number, p.issuing_authority, p.permit_type].some(v => String(v || '').toLowerCase().includes(qP));
  });

  async function handleSave(): Promise<boolean> {
    if (!form.number || !form.authority) {
      setErrorMsg('Permit number and agency are required.');
      return false;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/permits/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          status: 'applied',
          permit_type: form.permit_type,
          permit_number: form.number,
          issuing_authority: form.authority,
          fee: form.fee,
          applied_date: form.applied_date || null,
          issued_date: form.issued_date || null,
          expiry_date: form.expiry_date || null,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json();
      if (!json.permit) throw new Error('save failed');
      setPermits(prev => [...prev, json.permit as Permit]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Permit added.');
      setTimeout(() => setSuccessMsg(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not save the permit. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      applied_date: today,
      authority: city ? `City of ${city}` : '',
    });
    setAutoF({ applied: true, authority: !!city });
    setShowForm(true);
    setErrorMsg('');
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
  const hint: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 };

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Regulatory'}
        eyebrowIcon={<Clipboard size={13} weight="fill" color="#F59E0B" />}
        title="Permits &"
        accent="Approvals"
        subtitle={openCount > 0 ? `${openCount} open permit${openCount === 1 ? '' : 's'}${expiringSoon.length > 0 ? ` — ${expiringSoon.length} expiring within 30 days` : ''}${city ? ` · ${city} jurisdiction` : ''}` : 'Building permits and regulatory approvals'}
        actions={
          <button
            onClick={() => { if (showForm) { setShowForm(false); setErrorMsg(''); } else { openCreate(); } }}
            className="pmBtn"
            style={showForm ? ghostButtonStyle : goldButtonStyle}
          >
            {showForm ? <><X size={15} weight="bold" /> Cancel</> : <><Plus size={15} weight="bold" /> Add Permit</>}
          </button>
        }
      />

      {/* Project intelligence strip — open permits and the expiry watch */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/permits`,  label: 'Project', value: ctx.project?.projectNumber || ctx.project?.name || '—', sub: city ? `${city} jurisdiction` : (ctx.project?.status ? String(ctx.project.status).replace(/_/g, ' ') : 'active') },
          {href: `/app/projects/${projectId}/permits`,  label: 'Open Permits', value: String(openCount), sub: `${applied} applied · ${issued} issued${inInspections > 0 ? ` · ${inInspections} inspecting` : ''}` },
          {href: `/app/projects/${projectId}/permits`,  label: 'Expiring ≤ 30 Days', value: String(expiringSoon.length), accent: expiringSoon.length > 0 ? T.amber : T.green, sub: expiringSoon.length > 0 ? `renew ${expiringSoon[0].permit_number} first` : 'nothing lapsing soon' },
          {href: `/app/projects/${projectId}/permits`,  label: 'Expired', value: String(expired), accent: expired > 0 ? T.red : undefined, sub: expired > 0 ? 'work at risk — renew now' : 'none lapsed' },
          {href: `/app/projects/${projectId}/permits`,  label: 'Fees to Date', value: `$${totalFees.toLocaleString()}`, sub: `across ${permits.length} permit${permits.length === 1 ? '' : 's'}` },
          {href: `/app/projects/${projectId}/permits`,  label: 'Closed', value: String(closed), sub: 'final sign-off on record' },
        ]} />
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard icon={<Clipboard size={19} weight="duotone" color={T.gold} />} label="Total Permits" value={String(permits.length)} accent={T.gold} sub={closed > 0 ? `${closed} closed out` : 'on the register'} delay={0.02}  href={`/app/projects/${projectId}/permits`}/>
        <StatCard icon={<NotePencil size={19} weight="duotone" color={T.amber} />} label="Applied" value={String(applied)} accent={applied > 0 ? T.amber : undefined} sub="awaiting the AHJ" delay={0.06}  href={`/app/projects/${projectId}/permits`}/>
        <StatCard icon={<CheckCircle size={19} weight="duotone" color={T.green} />} label="Issued" value={String(issued)} accent={issued > 0 ? T.green : undefined} sub={inInspections > 0 ? `+${inInspections} in inspections` : 'work may proceed'} delay={0.10}  href={`/app/projects/${projectId}/permits`}/>
        <StatCard icon={<CurrencyDollar size={19} weight="duotone" color={T.gold} />} label="Total Fees" value={`$${totalFees.toLocaleString()}`} sub={expiringSoon.length > 0 ? `${expiringSoon.length} permit${expiringSoon.length === 1 ? '' : 's'} expiring soon` : 'plan-check + permit fees'} delay={0.14}  href={`/app/projects/${projectId}/permits`}/>
      </div>

      {successMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 10, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 10, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Expiry watch — permits lapsing within 30 days */}
      {expiringSoon.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(255,149,0,0.10)', border: '1px solid rgba(255,149,0,0.35)', borderRadius: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Warning size={17} weight="fill" color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: T.white, lineHeight: 1.55 }}>
            <b style={{ color: T.amber }}>{expiringSoon.length} permit{expiringSoon.length === 1 ? '' : 's'} expiring within 30 days:</b>{' '}
            {expiringSoon.map((p, i) => { const d = daysToExpiry(p); return <span key={p.id}>{i > 0 ? ' · ' : ''}<b>{p.permit_number}</b> ({p.permit_type}) in {d} day{d === 1 ? '' : 's'}</span>; })}
            <span style={{ color: T.muted }}> — call the issuing agency before work has to stop.</span>
          </div>
        </div>
      )}

      {/* Status pipeline — where every permit sits in the AHJ lifecycle */}
      {permits.length > 0 && (
        <SectionCard flat style={{ marginBottom: 20 }} bodyStyle={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto' }}>
            {PIPELINE.map((st, i) => (
              <React.Fragment key={st.key}>
                {i > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', flexShrink: 0 }}>
                    <ArrowRight size={14} weight="bold" color="rgba(255,255,255,0.3)" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 130, padding: '10px 14px', borderRadius: 10, background: stageCount[st.key] > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${stageCount[st.key] > 0 ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.08)'}` }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: stageCount[st.key] > 0 ? T.goldBright : T.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{st.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: stageCount[st.key] > 0 ? T.white : 'rgba(255,255,255,0.35)' }}>{stageCount[st.key]}</div>
                  <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, whiteSpace: 'nowrap' }}>{st.desc}</div>
                </div>
              </React.Fragment>
            ))}
            {expired > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', flexShrink: 0 }}>
                  <Warning size={14} weight="fill" color={T.red} />
                </div>
                <div style={{ flex: 1, minWidth: 130, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.35)' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: T.red, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Expired</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.red }}>{expired}</div>
                  <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, whiteSpace: 'nowrap' }}>renew with the AHJ</div>
                </div>
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 320px' : '1fr', gap: 18, alignItems: 'start' }}>
          <SectionCard title="Add Permit" subtitle={city ? `Filing with the ${city} AHJ — prefilled from the project record.` : undefined} icon={<NotePencil size={17} weight="duotone" color={T.gold} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div>
                <label style={lbl}>Permit Type</label>
                <select value={form.permit_type} onChange={e => setForm(p => ({ ...p, permit_type: e.target.value }))} style={inp}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <div style={hint}>Most jobs carry Building plus separate trade permits.</div>
              </div>
              <div>
                <label style={lbl}>Permit Number *</label>
                <input value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} placeholder="e.g. BLD-2026-01423" style={inp} />
                <div style={hint}>Exactly as stamped by the AHJ — inspectors pull it up by this number.</div>
              </div>
              <div>
                <label style={lbl}>Issuing Agency (AHJ) *{autoF.authority && <AutoChip />}</label>
                <Suggest value={form.authority} onChange={e => { const v = e.target.value; setAutoF(a => ({ ...a, authority: false })); setForm(p => ({ ...p, authority: v })); }} placeholder="e.g. City Building Department" style={inp} options={['`City of ${city', '`City of ${city', '`${city', 'a']} />
                <div style={hint}>{autoF.authority ? 'Guessed from the project address — correct it if another agency has jurisdiction.' : city ? `Project sits in ${city} — its building department is the usual AHJ.` : 'The authority having jurisdiction over the site.'}</div>
              </div>
              <div>
                <label style={lbl}>Fee ($)</label>
                <input type="number" value={form.fee} onChange={e => setForm(p => ({ ...p, fee: Number(e.target.value) }))} style={inp} />
                <div style={hint}>Plan-check and permit fees — rolls into Fees to Date above.</div>
              </div>
              <div>
                <label style={lbl}>Applied Date{autoF.applied && <AutoChip />}</label>
                <SaguaroDatePicker value={form.applied_date} onChange={v => { setAutoF(a => ({ ...a, applied: false })); setForm(p => ({ ...p, applied_date: v })); }} style={inp} />
                <div style={hint}>Defaults to today — the permit enters the pipeline as Applied.</div>
              </div>
              <div>
                <label style={lbl}>Issue Date</label>
                <SaguaroDatePicker value={form.issued_date} onChange={v => setForm(p => ({ ...p, issued_date: v }))} style={inp} />
                <div style={hint}>Leave blank until the AHJ approves — work starts at issuance.</div>
              </div>
              <div>
                <label style={lbl}>Expiry Date</label>
                <SaguaroDatePicker value={form.expiry_date} onChange={v => setForm(p => ({ ...p, expiry_date: v }))} style={inp} />
                <div style={hint}>Many AHJs lapse permits 180 days after the last passed inspection — rows flag amber 30 days out.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleSave} disabled={saving} className="pmBtn" style={{ ...goldButtonStyle, opacity: saving ? 0.55 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : 'Save Permit'}
              </button>
              <button onClick={() => { setShowForm(false); setErrorMsg(''); }} className="pmBtn" style={ghostButtonStyle}>Cancel</button>
            </div>
          </SectionCard>
          {ctx && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionCard flat title="What Saguaro Knows" icon={<ClockCounterClockwise size={17} weight="duotone" color={T.gold} />}>
                <InsightRow label="Site" value={addr ? addr.split(',')[0] : '—'} />
                {city ? <InsightRow label="Jurisdiction" value={city} /> : null}
                <InsightRow label="Owner" value={ctx.defaults?.ownerName || '—'} />
                {ctx.project?.startDate ? <InsightRow label="Start date" value={String(ctx.project.startDate).substring(0, 10)} /> : null}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                <InsightRow label="Open permits" value={String(openCount)} />
                <InsightRow label="Expiring ≤ 30 days" value={String(expiringSoon.length)} accent={expiringSoon.length > 0 ? T.amber : undefined} strong={expiringSoon.length > 0} />
              </SectionCard>
              <SectionCard flat title="After You Save" icon={<CheckCircle size={17} weight="duotone" color={T.gold} />}>
                <FlowSteps title="" steps={[
                  { title: 'Permit enters the pipeline', desc: 'Starts as Applied and moves through issuance, inspections, and closeout.' },
                  { title: 'Expiry is watched', desc: 'The row flags amber 30 days before expiry and red once lapsed.' },
                  { title: 'Inspections log against it', desc: 'AHJ inspections on this permit live in the Inspections module.' },
                  { title: 'Fees roll up', desc: 'Permit fees total into the register and the project cost picture.' },
                ]} />
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <ListToolbar
        module="permits"
        search={permitSearch}
        onSearch={setPermitSearch}
        searchPlaceholder="Search permits..."
        filters={[
          { key: 'status', label: 'Status', value: permitStatusFilter, onChange: setPermitStatusFilter, allLabel: 'All Statuses', options: [
            { value: 'applied', label: 'Applied' },
            { value: 'issued', label: 'Issued' },
            { value: 'inspections', label: 'Inspections' },
            { value: 'closed', label: 'Closed' },
            { value: 'expired', label: 'Expired' },
          ] },
          { key: 'type', label: 'Type', value: permitTypeFilter, onChange: setPermitTypeFilter, allLabel: 'All Types', options: [...TYPES] },
        ]}
        count={{ shown: filteredPermits.length, total: permits.length }}
        style={{ marginBottom: 16 }}
      />

      <SectionCard title="Permit Register" icon={<Clipboard size={17} weight="duotone" color={T.gold} />} flush>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
        ) : permits.length === 0 ? (
          <PremiumEmpty
            icon={<Clipboard size={30} weight="duotone" color={T.gold} />}
            title="Start the permit register"
            description={city
              ? `This project sits in ${city} — most jobs need a Building permit plus separate trade permits (Electrical, Plumbing, Mechanical) before mobilization. The register tracks each one from application through inspections to closeout, and warns 30 days before anything expires.`
              : 'Most jobs need a Building permit plus separate trade permits before mobilization. The register tracks each one from application through inspections to closeout, and warns 30 days before anything expires.'}
            action={
              <button onClick={openCreate} className="pmBtn" style={goldButtonStyle}>
                <Plus size={15} weight="bold" /> Add First Permit
              </button>
            }
          />
        ) : (
          <div style={{ padding: '4px 8px 8px' }}>
            <Table
              headers={['Permit #', 'Type', 'Agency', 'Status', 'Fee', 'Issue Date', 'Expiry']}
              rows={filteredPermits.map(p => {
                const status = effStatus(p);
                const d = daysToExpiry(p);
                const expiringRow = status !== 'closed' && status !== 'expired' && d !== null && d >= 0 && d <= 30;
                const badgeColor = STATUS_BADGE[status] || 'muted';
                return [
                  <span key="n" style={{ color: T.gold, fontWeight: 700 }}>{p.permit_number}</span>,
                  p.permit_type,
                  <span key="a" style={{ color: T.muted }}>{p.issuing_authority}</span>,
                  <Badge key="s" label={status} color={badgeColor} />,
                  <span key="f" style={{ fontWeight: 600 }}>${(Number(p.fee) || 0).toLocaleString()}</span>,
                  <span key="i" style={{ color: T.muted }}>{p.issued_date || '—'}</span>,
                  <span key="e" style={{ color: status === 'expired' ? T.red : expiringRow ? T.amber : T.muted, fontWeight: expiringRow || status === 'expired' ? 700 : 400 }}>
                    {p.expiry_date || '—'}{status === 'expired' && d !== null ? ` · lapsed ${Math.abs(d)}d ago` : expiringRow ? ` · ${d}d left` : ''}
                  </span>,
                ];
              })}
            />
          </div>
        )}
      </SectionCard>

      {/* Tracked back-and-forth with the architect and the city/AHJ */}
      <PermitCorrespondence projectId={projectId} />
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
