'use client';
/**
 * Progress Billing — AIA G702/G703. Enter the Schedule of Values + this period's
 * progress; the shared lib/finance engine computes the certificate live (same
 * numbers as iOS). Seed the SOV straight from a takeoff to close the money loop.
 */
import { useEffect, useMemo, useState } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useRouter } from 'next/navigation';
import { computePayApp, estimateToSov, usd, type SovLine } from '@/lib/finance';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { humanError } from '@/lib/errors';
import { Plus, DownloadSimple, CheckCircle, FloppyDisk, Receipt, Calculator, ListNumbers, Buildings, CurrencyDollar, Percent, Coins, Scales, ChartPieSlice } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { openPdf } from '@/components/PdfViewer';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';

import { printHtml } from '@/lib/print-doc';
const PANEL = 'var(--bg-surface-2)', LINE = 'rgba(255,255,255,0.09)', GOLD = 'var(--brand-primary)', TEXT = 'var(--text-secondary)', DIM = 'var(--text-tertiary)', GREEN = 'var(--success)';
const uid = () => Math.random().toString(36).slice(2, 9);
const c = (dollars: string) => Math.round((parseFloat(dollars) || 0) * 100);
const d = (cents: number) => (cents / 100).toFixed(2);

export default function PayAppPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [takeoffs, setTakeoffs] = useState<{ id: string; name: string }[]>([]);
  const [appNo, setAppNo] = useState('1');
  const [period, setPeriod] = useState('');
  const [contract, setContract] = useState('0'); const [cos, setCos] = useState('0');
  const [ret, setRet] = useState('10'); const [prevCerts, setPrevCerts] = useState('0');
  const [lines, setLines] = useState<(SovLine & { _prev: string; _this: string; _stored: string; _sv: string })[]>([]);
  const [msg, setMsg] = useState('');
  // A failed save is said next to the Save button — the status line above sits
  // a full screen away on a phone.
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { projects: liveProjects } = useProjects();
  useEffect(() => { const ps = liveProjects; setProjects(ps); if (ps[0]) setProjectId((prev) => prev || ps[0].id); }, [liveProjects]);
  useEffect(() => { if (!projectId) return; (async () => { const h = await getAuthHeaders(); fetch(`/api/takeoff?limit=30`, { headers: h }).then((r) => r.json()).then((x) => setTakeoffs((x.takeoffs || x.data || []).filter((t: any) => !t.project_id || t.project_id === projectId))).catch(() => {}); })(); }, [projectId]);
  // The server numbers the application and rolls the terms forward from the
  // last one. Show those figures, so App # is the number that will be saved and
  // the approved COs / previous certificates are not silently sent as $0.
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    (async () => {
      try {
        const r = await fetch(`/api/pay-apps/create?projectId=${encodeURIComponent(projectId)}`, { headers: await getAuthHeaders() });
        const x = await r.json().catch(() => ({}));
        if (!live || !r.ok) return;
        setAppNo(String(x.nextAppNumber ?? 1));
        setRet(String(x.retainagePercent ?? 10));
        setCos(String(Number(x.changeOrdersTotal) || 0));
        setPrevCerts(String(Number(x.previousCertificates) || 0));
      } catch (e) { console.error('pay app seed failed', e); }
    })();
    return () => { live = false; };
  }, [projectId]);

  const seedFromTakeoff = async (tid: string) => {
    if (!tid) return;
    setMsg('Loading takeoff…');
    try {
      const t = await fetch(`/api/takeoff/${tid}`, { headers: await getAuthHeaders() }).then((r) => r.json());
      const tk = t.takeoff || t;
      const items = tk.line_items || tk.takeoff_line_items || [];
      const byTrade = new Map<string, number>();
      for (const it of items) { const tot = Math.round(((Number(it.quantity) || 0) * ((Number(it.unit_material_cost) || 0) + (Number(it.unit_labor_cost) || 0))) * 100); byTrade.set(it.category || 'Other', (byTrade.get(it.category || 'Other') || 0) + tot); }
      const subtotal = [...byTrade.values()].reduce((s, v) => s + v, 0);
      const sell = Math.round((Number(tk.sell_price) || Number(tk.total_cost) || subtotal / 100) * 100) || subtotal;
      const sov = estimateToSov([...byTrade.entries()].map(([trade, totalCents]) => ({ trade, totalCents })), sell || subtotal, subtotal);
      setContract(d(sell || subtotal));
      setLines(sov.map((l) => ({ ...l, _sv: d(l.scheduledValueCents), _prev: '0', _this: '0', _stored: '0' })));
      setMsg(`✓ Seeded ${sov.length} SOV lines from takeoff — contract ${usd(sell || subtotal)}.`);
    } catch (e) { console.error(e); setMsg(humanError(e, "Couldn't seed from takeoff. Please try again.")); }
  };

  // Persist to the money-of-record. The server route (/api/pay-apps/create) re-runs the
  // AIA G702/G703 calc from these raw SOV lines + terms and is the source of truth — we
  // send inputs (dollars), never our preview totals. Returns the saved pay app row.
  const createPayApp = async () => {
    const payload = {
      projectId,
      status: 'draft',
      periodTo: period || null,
      contractSum: parseFloat(contract) || 0,
      changeOrdersTotal: parseFloat(cos) || 0,
      retainagePercent: parseFloat(ret) || 0,
      prevPayments: parseFloat(prevCerts) || 0, // G702 line 7 — less previous certificates
      lineItems: lines.map((l) => ({
        description: l.description,
        scheduledValue: parseFloat(l._sv) || 0,
        workFromPrev: parseFloat(l._prev) || 0,
        workThisPeriod: parseFloat(l._this) || 0,
        materialsStored: parseFloat(l._stored) || 0,
      })),
    };
    const res = await fetch('/api/pay-apps/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) { console.error('pay app save failed', res.status, json.error); throw new Error(json.error || 'Save failed'); }
    const pa = json.payApp;
    if (!pa?.id) throw new Error('The saved pay application could not be read back.');
    return pa;
  };

  // Save, then jump into the project pay-app detail page for submit → approve → certify.
  /** What stops a save, said plainly; null when the form can go. */
  const blocker = (): string | null => {
    if (!projectId) return 'Pick a project first.';
    if (!lines.length) return 'Add at least one SOV line.';
    if (period && !/^\d{4}-\d{2}-\d{2}$/.test(period)) {
      document.getElementById('payapp-period-to')?.focus();
      return 'Period To must be a date.';
    }
    return null;
  };

  const save = async () => {
    const stop = blocker();
    if (stop) { setFormErr(stop); return; }
    setFormErr('');
    setSaving(true); setMsg('Saving pay application…');
    try {
      const pa = await createPayApp();
      router.push(`/app/projects/${pa.project_id || projectId}/pay-apps/${pa.id}`);
    } catch (e) {
      console.error(e);
      const m = humanError(e, "Couldn't save the pay application. Please try again.");
      setMsg(m); setFormErr(m);
      setSaving(false);
    }
  };

  // The REAL document: save through the server engine, then run the pdf-engine
  // route so the button produces the stored, numbered G702/G703 the Documents
  // library and the detail page serve — not a window.print approximation.
  const generatePdfs = async () => {
    const stop = blocker();
    if (stop) { setFormErr(stop); return; }
    setFormErr('');
    setGenerating(true); setMsg('Saving pay application…');
    try {
      const pa = await createPayApp();
      setMsg('Generating AIA G702/G703 PDFs…');
      const res = await fetch('/api/documents/pay-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ payAppId: pa.id, projectId: pa.project_id || projectId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error || !json.g702Url) throw new Error(json.error || 'PDF generation failed');
      openPdf({ url: json.g702Url });
      if (json.g703Url) openPdf({ url: json.g703Url });
      setMsg(`✓ Application #${pa.app_number} G702/G703 generated — stored on the pay application.`);
      router.push(`/app/projects/${pa.project_id || projectId}/pay-apps/${pa.id}`);
    } catch (e) {
      console.error(e);
      const m = humanError(e, "Couldn't generate the G702/G703 PDFs. Please try again.");
      setMsg(m); setFormErr(m);
    } finally {
      setGenerating(false);
    }
  };

  const addLine = () => setLines((ls) => [...ls, { id: uid(), itemNo: String(ls.length + 1), description: '', scheduledValueCents: 0, fromPreviousCents: 0, thisPeriodCents: 0, storedCents: 0, _sv: '', _prev: '0', _this: '0', _stored: '0' }]);
  const upd = (id: string, k: '_sv' | '_prev' | '_this' | '_stored' | 'description', v: string) => setLines((ls) => ls.map((l) => l.id === id ? { ...l, [k]: v } : l));

  const input: SovLine[] = lines.map((l) => ({ id: l.id, itemNo: l.itemNo, description: l.description, scheduledValueCents: c(l._sv), fromPreviousCents: c(l._prev), thisPeriodCents: c(l._this), storedCents: c(l._stored) }));
  const result = useMemo(() => computePayApp({ contractSumCents: c(contract), changeOrdersCents: c(cos), retainagePct: parseFloat(ret) || 0, previousCertificatesCents: c(prevCerts), lines: input }), [contract, cos, ret, prevCerts, lines]);

  const printForm = () => {
    const proj = projects.find((p) => p.id === projectId)?.name || 'Project';
    const row = (r: any) => `<tr><td>${r.itemNo}</td><td>${r.description}</td><td class=r>${usd(r.scheduledValueCents)}</td><td class=r>${usd(r.fromPreviousCents)}</td><td class=r>${usd(r.thisPeriodCents)}</td><td class=r>${usd(r.storedCents)}</td><td class=r>${usd(r.totalCompletedStoredCents)}</td><td class=r>${r.percentComplete}%</td><td class=r>${usd(r.balanceToFinishCents)}</td><td class=r>${usd(r.retainageCents)}</td></tr>`;
    const g702 = [['1. Original Contract Sum', result.originalContractCents], ['2. Net Change by Change Orders', result.changeOrdersCents], ['3. Contract Sum to Date', result.contractSumToDateCents], ['4. Total Completed & Stored to Date', result.totalCompletedStoredCents], ['5. Retainage', result.retainageCents], ['6. Total Earned Less Retainage', result.totalEarnedLessRetainageCents], ['7. Less Previous Certificates', result.previousCertificatesCents], ['8. CURRENT PAYMENT DUE', result.currentPaymentDueCents], ['9. Balance to Finish, Incl. Retainage', result.balanceToFinishCents]];
    const html = (`<!doctype html><html><head><title>Application ${appNo} — ${proj}</title><style>
      body{font-family:-apple-system,system-ui,sans-serif;color:#111;margin:0;padding:24px}
      .band{background:linear-gradient(100deg,#0a0a0a,#161b22);color:var(--c-text);padding:16px 22px;border-radius:4px;display:flex;justify-content:space-between;align-items:center}
      .tag{color:#FF8A00;font-size:10px;letter-spacing:1.4px;font-weight:700;text-transform:uppercase}
      h1{font-size:17px;margin:2px 0 0} h2{font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#333;border-bottom:2px solid #FF8A00;padding-bottom:4px;display:inline-block;margin:20px 0 8px}
      table{width:100%;border-collapse:collapse;font-size:11px} td,th{border:1px solid #ccc;padding:5px 6px}.r{text-align:right}
      th{background:#f4f4f6;font-size:9.5px;text-transform:uppercase} .g702 td{border:none;padding:5px 8px;font-size:13px}.g702 tr:nth-child(8){font-weight:800;background:rgba(255,138,0,.12)}
      .meta{font-size:12px;color:#444;margin:10px 0}
    </style></head><body>
      <div class=band><div><div class=tag>Saguaro Control Systems</div><h1>Application &amp; Certificate for Payment (AIA G702/G703)</h1></div><div style="text-align:right"><div>Application No. <b>${appNo}</b></div><div style="font-size:12px">${period || new Date().toLocaleDateString()}</div></div></div>
      <div class=meta>Project: <b>${proj}</b></div>
      <h2>G702 — Summary</h2>
      <table class=g702>${g702.map(([k, v]) => `<tr><td>${k}</td><td class=r>${usd(v as number)}</td></tr>`).join('')}</table>
      <h2>G703 — Continuation Sheet</h2>
      <table><thead><tr><th>#</th><th>Description of Work</th><th>Scheduled Value</th><th>From Previous</th><th>This Period</th><th>Stored</th><th>Total Completed</th><th>%</th><th>Balance</th><th>Retainage</th></tr></thead><tbody>${result.rows.map(row).join('')}</tbody></table>
      <p style="color:#888;font-size:10px;margin-top:16px">Generated by Saguaro Control Systems · figures computed by the shared finance engine.</p>
    </body></html>`);
    printHtml(html, `Application ${appNo} — ${proj}`)
      .catch((e) => { console.error(e); setMsg("Couldn't open the pay application to print. Try again."); });
  };

  const inp: React.CSSProperties = { background: 'var(--bg-base)', border: `1px solid ${LINE}`, borderRadius: 6, color: TEXT, padding: '7px 9px', fontSize: 13, width: '100%' };
  const num: React.CSSProperties = { ...inp, textAlign: 'right' as const };

  // G702 summary metrics → premium StatCards (values still computed live by the finance engine).
  // Plain figures: they used to link to this same page, so a tap reloaded it
  // and threw away every number typed into the form.
  const g702Stats: { label: string; value: string; icon: React.ReactNode; accent?: string }[] = [
    { label: 'Contract w/ COs', value: usd(result.contractSumToDateCents), icon: <CurrencyDollar size={19} weight="duotone" color={GOLD} />, accent: GOLD },
    { label: 'Completed & Stored', value: usd(result.totalCompletedStoredCents), icon: <CheckCircle size={19} weight="duotone" color={GREEN} />, accent: GREEN },
    { label: 'Retainage', value: usd(result.retainageCents), icon: <Percent size={19} weight="duotone" color={GOLD} /> },
    { label: 'Earned Less Retainage', value: usd(result.totalEarnedLessRetainageCents), icon: <Coins size={19} weight="duotone" color={GOLD} /> },
    { label: 'Balance to Finish', value: usd(result.balanceToFinishCents), icon: <Scales size={19} weight="duotone" color={GOLD} /> },
    { label: '% Complete', value: `${result.percentComplete}%`, icon: <ChartPieSlice size={19} weight="duotone" color={GREEN} />, accent: GREEN },
  ];

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="Progress Billing · AIA G702 / G703"
        eyebrowIcon={<Receipt size={13} weight="fill" color={GOLD} />}
        title="Pay"
        accent="Application"
        subtitle="Enter this period's progress; the certificate computes live."
      />

      {/* Setup — project, takeoff seed source & contract terms */}
      <SectionCard title="Application Setup" icon={<Buildings size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inp, width: 'auto' }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select onChange={(e) => seedFromTakeoff(e.target.value)} defaultValue="" style={{ ...inp, width: 'auto' }}><option value="">Seed SOV from takeoff…</option>{takeoffs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          {msg && <span style={{ fontSize: 12.5, color: msg.startsWith('✓') ? GREEN : DIM, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{msg.startsWith('✓') && <CheckCircle size={14} weight="fill" color={GREEN} />}{msg.replace(/^✓ /, '')}</span>}
        </div>

        {/* contract terms */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {/* The server assigns the number — shown, not typed. */}
          <label style={{ fontSize: 11, color: DIM, fontWeight: 700 }}>App #<input value={appNo} readOnly aria-readonly="true" title="Numbered automatically — the next application on this job." style={{ ...inp, marginTop: 5, width: 60, opacity: 0.75 }} /></label>
          {/* period_to is a DATE column — a date picker, not free text. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label htmlFor="payapp-period-to" style={{ fontSize: 11, color: DIM, fontWeight: 700 }}>Period To</label><SaguaroDatePicker id="payapp-period-to" value={period} onChange={(v) => { setPeriod(v); setFormErr(''); }} style={{ ...inp, width: 160 }} placeholder="Pick a date" /></div>
          {[['Contract $', contract, setContract, 130], ['Change Orders $', cos, setCos, 130], ['Retainage %', ret, setRet, 90], ['Prev. Certs $', prevCerts, setPrevCerts, 130]].map(([lbl, val, set, w]: any) => (
            <label key={lbl} style={{ fontSize: 11, color: DIM, fontWeight: 700 }}>{lbl}<input inputMode="decimal" value={val} onChange={(e) => set(e.target.value)} style={{ ...inp, marginTop: 5, width: w }} /></label>
          ))}
        </div>
      </SectionCard>

      {/* G702 summary */}
      <SectionCard flat title="G702 — Application Summary" icon={<Calculator size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {g702Stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} accent={s.accent} />
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '16px 20px', borderRadius: 14, background: 'var(--brand-primary-08)', border: '1px solid var(--brand-primary-35)' }}>
          <div style={{ fontSize: 12, color: 'var(--c-text-2)', fontWeight: 800 }}>Current Payment Due This Period</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: GOLD, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{usd(result.currentPaymentDueCents)}</div>
        </div>
      </SectionCard>

      {/* SOV / G703 */}
      <SectionCard
        title="G703 — Continuation Sheet (Schedule of Values)"
        icon={<ListNumbers size={17} weight="duotone" color={GOLD} />}
        flush
        style={{ marginBottom: 20 }}
        action={lines.length > 0 ? <button onClick={addLine} style={{ ...ghostButtonStyle, padding: '8px 14px', fontSize: 12.5 }} className="pmBtn"><Plus size={14} weight="bold" /> Add SOV Line</button> : undefined}
      >
        {lines.length === 0 ? (
          <PremiumEmpty
            compact
            icon={<ListNumbers size={30} weight="duotone" color={GOLD} />}
            title="No schedule of values yet"
            description="Add lines manually or seed the SOV straight from a takeoff above to skip the re-keying."
            action={<button onClick={addLine} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add SOV Line</button>}
          />
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 0.9fr 0.6fr', background: PANEL, padding: '9px 12px', fontSize: 10.5, color: DIM, fontWeight: 700, minWidth: 780 }}>
              <span>Description</span><span style={{ textAlign: 'right' }}>Sched. Value</span><span style={{ textAlign: 'right' }}>Prev</span><span style={{ textAlign: 'right' }}>This Period</span><span style={{ textAlign: 'right' }}>Stored</span><span style={{ textAlign: 'right' }}>Total</span><span style={{ textAlign: 'right' }}>%</span>
            </div>
            {lines.map((l) => {
              const rr = result.rows.find((x) => x.id === l.id);
              return (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 0.9fr 0.6fr', padding: '7px 12px', borderTop: `1px solid ${LINE}`, gap: 6, alignItems: 'center', minWidth: 780 }}>
                  <input value={l.description} onChange={(e) => upd(l.id, 'description', e.target.value)} placeholder="Work" style={inp} />
                  <input value={l._sv} onChange={(e) => upd(l.id, '_sv', e.target.value)} style={num} />
                  <input value={l._prev} onChange={(e) => upd(l.id, '_prev', e.target.value)} style={num} />
                  <input value={l._this} onChange={(e) => upd(l.id, '_this', e.target.value)} style={{ ...num, borderColor: GOLD }} />
                  <input value={l._stored} onChange={(e) => upd(l.id, '_stored', e.target.value)} style={num} />
                  <span style={{ textAlign: 'right', fontSize: 12.5 }}>{rr ? usd(rr.totalCompletedStoredCents) : ''}</span>
                  <span style={{ textAlign: 'right', fontSize: 12.5, color: DIM }}>{rr ? `${rr.percentComplete}%` : ''}</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {formErr && (
        <div role="alert" style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.45)', color: 'var(--danger)', fontSize: 13.5, lineHeight: 1.5 }}>{formErr}</div>
      )}
      {/* Enabled whenever idle: a tap on an incomplete form says what is
          missing, instead of a greyed-out button that says nothing. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={save} disabled={saving || generating} style={{ ...goldButtonStyle, padding: '12px 24px', fontSize: 15, minHeight: 44, cursor: saving ? 'default' : 'pointer', opacity: (saving || generating || !lines.length || !projectId) ? 0.5 : 1 }} className="pmBtn"><FloppyDisk size={16} weight="bold" /> {saving ? 'Saving…' : 'Save Pay Application'}</button>
        <button onClick={generatePdfs} disabled={saving || generating} style={{ ...ghostButtonStyle, padding: '12px 24px', fontSize: 15, minHeight: 44, opacity: (saving || generating || !lines.length || !projectId) ? 0.5 : 1 }} className="pmBtn"><DownloadSimple size={16} weight="bold" /> {generating ? 'Generating…' : 'Generate AIA G702 / G703 (PDF)'}</button>
        <button onClick={printForm} disabled={!lines.length} title="Unsaved on-screen preview for review only — the PDF button produces the stored, numbered document." style={{ ...ghostButtonStyle, padding: '10px 18px', fontSize: 13, opacity: lines.length ? 0.85 : 0.5 }} className="pmBtn">Print Preview</button>
      </div>
      <p style={{ color: DIM, fontSize: 12, marginTop: 12 }}>Save records the pay application against the project (numbers computed server-side by the shared finance engine) and opens it for submit, approve &amp; certify. Generate saves it, then produces the stored, numbered G702/G703 PDFs through the pdf engine; Print Preview is an unsaved approximation for review only.</p>
    </PremiumSurface>
  );
}
