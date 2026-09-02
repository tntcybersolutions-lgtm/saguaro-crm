'use client';
import React, { useState, useEffect } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { ProgressBar, Badge, T } from '@/components/ui/shell';
import {
  PremiumSurface,
  ModuleHero,
  StatCard,
  SectionCard,
  StatStrip,
  FlowSteps,
  InsightRow,
  goldButtonStyle,
  ghostButtonStyle,
} from '@/components/ui/premium';
import { CheckCircle, Hourglass, ChartBar, Check, Package, ListChecks } from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';

interface ChecklistItem {
  id: string;
  label: string;
  status: 'complete' | 'incomplete';
  generateEndpoint?: string;
  generateLabel?: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'final_pay_app', label: 'Final Pay App', status: 'incomplete' },
  { id: 'g706_affidavit', label: 'G706 Affidavit', status: 'incomplete', generateEndpoint: '/api/documents/g706', generateLabel: 'Generate G706' },
  { id: 'all_lien_waivers', label: 'All Lien Waivers', status: 'incomplete' },
  { id: 'g704_certificate', label: 'G704 Certificate of Substantial Completion', status: 'incomplete', generateEndpoint: '/api/documents/g704', generateLabel: 'Generate G704' },
  { id: 'bond_rider', label: 'Bond Rider', status: 'incomplete' },
  { id: 'w9_forms', label: 'W-9 Forms', status: 'incomplete' },
  { id: 'wh347_final', label: 'WH-347 Final Certified Payroll', status: 'incomplete' },
  { id: 'as_built_drawings', label: 'As-Built Drawings', status: 'incomplete' },
  { id: 'equipment_warranties', label: 'Equipment Warranties', status: 'incomplete' },
  { id: 'om_manuals', label: 'O&M Manuals', status: 'incomplete' },
  { id: 'final_inspection', label: 'Final Inspection', status: 'incomplete' },
  { id: 'certificate_of_occupancy', label: 'Certificate of Occupancy', status: 'incomplete' },
];

export default function CloseoutPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [items, setItems] = useState<ChecklistItem[]>(CHECKLIST_ITEMS);
  const [generating, setGenerating] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);
  // Project intelligence — punch, billing, retainage, and roster state.
  const { ctx } = useProjectContext(projectId);
  // ListToolbar state — checklist search + complete/incomplete filter (sag_flt_closeout).
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/closeout/checklist`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          setItems(prev => prev.map(item => {
            const saved = data.items.find((s: any) => s.id === item.id);
            return saved ? { ...item, status: saved.status } : item;
          }));
        }
      } catch { /* use defaults */ }
    })();
  }, [projectId]);

  const completed = items.filter(i => i.status === 'complete').length;
  const total = items.length;
  const pct = Math.round((completed / total) * 100);
  const exportDisabled = exporting || pct < 100;

  // Toolbar-driven view of the checklist; progress still reads the full list.
  const q = search.trim().toLowerCase();
  const visibleItems = items.filter(i =>
    (statusFilter === 'all' || i.status === statusFilter) &&
    (!q || i.label.toLowerCase().includes(q))
  );

  // Live figures from the project snapshot (DB numerics may arrive as strings).
  const fmtM = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money = ctx?.money;
  const revised = Number(money?.revisedContract) || 0;
  const billed = Number(money?.billedToDate) || 0;
  const billedPct = Number(money?.billedPct) || 0;
  const openPunch = Number(ctx?.counts?.openPunch) || 0;
  const openRfis = Number(ctx?.counts?.openRfis) || 0;
  const billCount = Number(ctx?.counts?.bills) || 0;
  const subCount = (ctx?.subs || []).length;
  const lastApp = money?.lastPayApp || null;
  const retainageHeld = billed * ((Number(money?.retainagePct) || 0) / 100);
  const balanceToFinish = Math.max(0, revised - billed);
  const pctComplete = Number(ctx?.project?.percentComplete) || 0;
  const docsDone = ['as_built_drawings', 'om_manuals', 'equipment_warranties', 'w9_forms'].every(id => items.find(i => i.id === id)?.status === 'complete');
  const inspectDone = ['final_inspection', 'certificate_of_occupancy'].every(id => items.find(i => i.id === id)?.status === 'complete');
  // What the data says about each checklist item — hints plus ready/attention flags.
  const ITEM_SIGNALS: Record<string, { hint?: string; ready?: boolean; warn?: boolean }> = ctx ? {
    final_pay_app: lastApp
      ? { hint: `App #${lastApp.appNumber} ${String(lastApp.status || '').replace(/_/g, ' ')} — billed ${billedPct}% of ${fmtM(revised)}.`, ready: billedPct >= 100, warn: billedPct > 0 && billedPct < 100 }
      : { hint: 'No pay applications yet — the final app closes out the contract sum.', warn: true },
    all_lien_waivers: { hint: subCount > 0 ? `${subCount} sub${subCount === 1 ? '' : 's'} on the job — each needs an unconditional final waiver before retainage releases.` : 'No subs on the roster — only your own final waiver applies.' },
    final_inspection: openPunch > 0
      ? { hint: `${openPunch} punch item${openPunch === 1 ? '' : 's'} still open — clear the list before calling the inspection.`, warn: true }
      : { hint: 'Punch list is clear — schedule the final inspection.', ready: true },
    w9_forms: subCount > 0 ? { hint: `Collect a W-9 from each of the ${subCount} subs before final payment.` } : {},
    equipment_warranties: subCount > 0 ? { hint: `Request warranty letters from all ${subCount} subs for the owner's turnover binder.` } : {},
    g704_certificate: pctComplete > 0 ? { hint: `Project is ${pctComplete}% complete — the G704 fixes the substantial completion date.` } : {},
    g706_affidavit: billCount > 0
      ? { hint: `Swears payrolls, bills, and sub debts are settled — ${billCount} bill${billCount === 1 ? '' : 's'} recorded on this project.` }
      : { hint: 'Contractor affidavit that all debts are paid — generate it from live project data.' },
    as_built_drawings: openRfis > 0
      ? { hint: `${openRfis} RFI${openRfis === 1 ? '' : 's'} still open — close them so the as-builts capture the final answers.`, warn: true }
      : { hint: 'Mark up the record set with every field change and closed RFI.' },
    om_manuals: subCount > 0
      ? { hint: `Collect operating and maintenance manuals from equipment subs — ${subCount} on the roster.` }
      : { hint: 'Operating and maintenance manuals for every installed system, in one binder.' },
    wh347_final: { hint: 'Required on prevailing-wage work — the final certified payroll closes the labor record.' },
    bond_rider: { hint: 'Ask your surety to extend the performance bond through the warranty period.' },
    certificate_of_occupancy: items.find(i => i.id === 'final_inspection')?.status === 'complete'
      ? { hint: 'Final inspection passed — request the C of O from the building department.', ready: true }
      : { hint: 'Issued by the building department once the final inspection passes.' },
  } : {};

  async function toggleItem(id: string) {
    const prevItems = items;
    const newItems = items.map(i =>
      i.id === id ? { ...i, status: (i.status === 'complete' ? 'incomplete' : 'complete') as 'complete' | 'incomplete' } : i
    );
    setItems(newItems);
    try {
      const res = await fetch(`/api/projects/${projectId}/closeout/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems.map(i => ({ id: i.id, status: i.status })) }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      // Revert the optimistic toggle so the UI reflects what actually persisted.
      setItems(prevItems);
      setToast('Could not save the checklist. Please try again.');
      setTimeout(() => setToast(''), 4000);
    }
  }

  async function generateDoc(item: ChecklistItem) {
    if (!item.generateEndpoint) return;
    setGenerating(item.id);
    try {
      const res = await fetch(item.generateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      const url = data.url || data.pdfUrl || data.downloadUrl;
      if (!res.ok || !url) throw new Error(data.error || 'generation failed');
      window.open(url, '_blank');
      setToast(`${item.generateLabel} generated successfully.`);
    } catch {
      setToast(`Could not generate ${item.generateLabel}. Please try again.`);
    } finally {
      setGenerating(null);
      setTimeout(() => setToast(''), 4000);
    }
  }

  async function exportCloseout() {
    setExporting(true);
    try {
      const res = await fetch('/api/documents/closeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      const url = data.url || data.pdfUrl || data.downloadUrl;
      if (!res.ok || !url) throw new Error(data.error || 'generation failed');
      window.open(url, '_blank');
      setToast('Closeout package generated.');
    } catch {
      setToast('Could not generate the closeout package. Please try again.');
    } finally {
      setExporting(false);
      setTimeout(() => setToast(''), 4000);
    }
  }

  return (
    <PremiumSurface maxWidth={1600}>
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Closeout'}
        eyebrowIcon={<Package size={13} weight="fill" color="#F59E0B" />}
        title="Project"
        accent="Closeout"
        subtitle={`${completed} of ${total} items complete — ${pct}% ready for handover.`}
        actions={
          <>
            <button
              onClick={() => generateDoc({ id: 'g704', label: 'G704', status: 'incomplete', generateEndpoint: '/api/documents/g704', generateLabel: 'G704' })}
              disabled={!!generating}
              className="pmBtn"
              style={{ ...ghostButtonStyle, opacity: generating ? 0.5 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
            >
              Generate G704
            </button>
            <button
              onClick={() => generateDoc({ id: 'g706', label: 'G706', status: 'incomplete', generateEndpoint: '/api/documents/g706', generateLabel: 'G706' })}
              disabled={!!generating}
              className="pmBtn"
              style={{ ...ghostButtonStyle, opacity: generating ? 0.5 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
            >
              Generate G706
            </button>
            <button
              onClick={exportCloseout}
              disabled={exportDisabled}
              className="pmBtn"
              style={{ ...goldButtonStyle, opacity: exportDisabled ? 0.5 : 1, cursor: exportDisabled ? 'not-allowed' : 'pointer' }}
            >
              {exporting ? 'Generating...' : 'Export Closeout Package'}
            </button>
          </>
        }
      />

      {/* Contract intelligence strip — what the system already knows */}
      {ctx && (
        <StatStrip items={[
          { label: 'Revised Contract', value: fmtM(revised), sub: `${Number(money?.approvedCoCount) || 0} approved CO${(Number(money?.approvedCoCount) || 0) === 1 ? '' : 's'}` },
          { label: 'Billed to Date', value: fmtM(billed), sub: `${billedPct}% of revised` },
          { label: 'Balance to Finish', value: fmtM(balanceToFinish), accent: balanceToFinish > 0 ? '#FBBF24' : T.green, sub: balanceToFinish > 0 ? 'still to bill' : 'fully billed' },
          { label: 'Retainage Held', value: `≈${fmtM(retainageHeld)}`, sub: `${Number(money?.retainagePct) || 0}% — releases at closeout` },
          { label: 'Open Punch', value: String(openPunch), accent: openPunch > 0 ? '#ef4444' : T.green, sub: openPunch > 0 ? 'blocks final inspection' : 'list is clear' },
          { label: 'Subs to Clear', value: String(subCount), sub: 'final waivers + W-9s' },
        ]} />
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<CheckCircle size={19} weight="duotone" color={T.green} />}
          label="Completed"
          value={String(completed)}
          sub={`of ${total} items`}
          accent={completed > 0 ? T.green : undefined}
          delay={0.02}
        />
        <StatCard
          icon={<Hourglass size={19} weight="duotone" color="#F59E0B" />}
          label="Remaining"
          value={String(total - completed)}
          sub={total - completed === 0 ? 'all complete' : 'still outstanding'}
          delay={0.06}
        />
        <StatCard
          icon={<ChartBar size={19} weight="duotone" color="#F59E0B" />}
          label="Progress"
          value={`${pct}%`}
          sub={pct === 100 ? 'ready to export' : 'to handover'}
          accent={pct === 100 ? T.green : '#F59E0B'}
          delay={0.10}
        />
      </div>

      {toast && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 10, color: T.green, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* Checklist + context rail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 22, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
      {/* Progress Bar */}
      <SectionCard flat
        title="Closeout Progress"
        icon={<ChartBar size={17} weight="duotone" color="#F59E0B" />}
        action={<span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? T.green : '#FBBF24', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>}
        style={{ marginBottom: 24 }}
      >
        <ProgressBar pct={pct} color={pct === 100 ? T.green : T.gold} height={10} />
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>
          {pct === 100 ? 'Ready to export closeout package' : `${total - completed} items remaining`}
        </div>
      </SectionCard>

      {/* List toolbar — find a closeout item fast */}
      <ListToolbar
        module="closeout"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search closeout items..."
        filters={[{ key: 'status', label: 'Status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All Items', options: [
          { value: 'incomplete', label: 'Incomplete' },
          { value: 'complete', label: 'Complete' },
        ] }]}
        count={{ shown: visibleItems.length, total: items.length }}
        style={{ marginBottom: 16 }}
      />

      {/* Checklist */}
      <SectionCard
        title="Closeout Checklist"
        subtitle={`${completed}/${total} complete`}
        icon={<ListChecks size={17} weight="duotone" color="#F59E0B" />}
        flush
      >
        {visibleItems.length === 0 ? (
          <div style={{ padding: '18px 20px', fontSize: 13, color: 'rgba(255,255,255,0.62)' }}>No checklist items match.</div>
        ) : visibleItems.map((item, idx) => { const sig = ITEM_SIGNALS[item.id]; return (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: idx === visibleItems.length - 1 ? 'none' : `1px solid rgba(255,255,255,0.06)` }}>
            <button
              onClick={() => toggleItem(item.id)}
              style={{
                width: 22, height: 22, borderRadius: 6,
                border: `2px solid ${item.status === 'complete' ? T.green : 'rgba(255,255,255,0.22)'}`,
                background: item.status === 'complete' ? T.green : 'transparent',
                cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {item.status === 'complete' && <Check size={14} weight="bold" color="#000" />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 14, color: item.status === 'complete' ? T.green : '#FFFFFF',
                textDecoration: item.status === 'complete' ? 'line-through' : 'none',
              }}>
                {item.label}
              </span>
              {sig?.hint && item.status !== 'complete' && (
                <div style={{ fontSize: 11.5, color: sig.warn ? '#FBBF24' : sig.ready ? T.green : 'rgba(255,255,255,0.5)', marginTop: 3, lineHeight: 1.45 }}>{sig.hint}</div>
              )}
            </div>
            {sig?.ready && item.status !== 'complete' && <Badge label="Ready" color="green" />}
            {sig?.warn && item.status !== 'complete' && <Badge label="Attention" color="amber" />}
            <Badge label={item.status === 'complete' ? 'Complete' : 'Incomplete'} color={item.status === 'complete' ? 'green' : 'muted'} />
            {item.generateEndpoint && (
              <button
                onClick={() => generateDoc(item)}
                disabled={generating === item.id}
                className="pmBtn"
                style={{ ...ghostButtonStyle, padding: '7px 14px', fontSize: 12.5, opacity: generating === item.id ? 0.5 : 1, cursor: generating === item.id ? 'not-allowed' : 'pointer' }}
              >
                {generating === item.id ? 'Generating...' : item.generateLabel}
              </button>
            )}
          </div>
        ); })}
      </SectionCard>
      </div>

      {/* Context rail — the path to handover, from live project data */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard flat title="Path to Handover" icon={<Package size={17} weight="duotone" color="#F59E0B" />}>
          <FlowSteps title="" steps={[
            { title: 'Clear the punch list', done: !!ctx && openPunch === 0, desc: openPunch > 0 ? `${openPunch} item${openPunch === 1 ? '' : 's'} still open.` : 'No open punch items on record.' },
            { title: 'Bill the contract out', done: billedPct >= 100, desc: revised > 0 ? `${fmtM(billed)} of ${fmtM(revised)} billed (${billedPct}%).` : 'Contract money flows in from pay applications.' },
            { title: 'Collect final waivers', done: items.find(i => i.id === 'all_lien_waivers')?.status === 'complete', desc: subCount > 0 ? `Unconditional finals from all ${subCount} subs release retainage cleanly.` : 'Your own final waiver clears the owner.' },
            { title: 'Assemble turnover docs', done: docsDone, desc: 'As-builts, O&M manuals, warranties, and W-9s in one binder.' },
            { title: 'Inspect and certify', done: inspectDone, desc: 'Final inspection, then the certificate of occupancy.' },
            { title: 'Export the package', done: pct === 100, desc: pct === 100 ? 'All items complete — export the closeout package above.' : `Unlocks at 100% — ${total - completed} item${total - completed === 1 ? '' : 's'} to go.` },
          ]} />
        </SectionCard>
        {ctx && (
          <SectionCard flat title="What Saguaro Knows" icon={<ChartBar size={17} weight="duotone" color="#F59E0B" />}>
            <InsightRow label="Revised contract" value={fmtM(revised)} strong />
            <InsightRow label="Billed to date" value={`${fmtM(billed)} · ${billedPct}%`} />
            <InsightRow label="Balance to finish" value={fmtM(balanceToFinish)} accent={balanceToFinish > 0 ? '#FBBF24' : T.green} />
            <InsightRow label="Retainage held" value={`≈${fmtM(retainageHeld)}`} />
            <InsightRow label="Open punch items" value={String(openPunch)} accent={openPunch > 0 ? '#ef4444' : T.green} />
            <InsightRow label="Subs to clear" value={String(subCount)} />
            {lastApp && <InsightRow label={`Pay App #${lastApp.appNumber}`} value={String(lastApp.status || '—').replace(/_/g, ' ')} />}
          </SectionCard>
        )}
      </div>
      </div>
    </PremiumSurface>
  );
}
