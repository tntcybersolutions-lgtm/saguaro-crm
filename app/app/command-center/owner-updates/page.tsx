'use client';
import { useMemo, useState } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useLongLead, useRisks, useMilestones, useEscalations, emailOwnerUpdate } from '@/lib/hooks/useFranchise';
import { computeHealth } from '@/lib/portfolio-health';
import { computeLongLead, computeRisk, milestoneSlip, type Severity } from '@/lib/franchise';
import { C, font, fmtDate, fmtMoneyShort, useFranchiseGate, GateLoading, SevBadge } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, GoldButton, GhostButton } from '@/components/ui/premium';
import { CheckCircle, Warning, EnvelopeSimple, Buildings } from '@phosphor-icons/react';

const SEV_WORD: Record<Severity, string> = { green: 'On Track', yellow: 'Needs Attention', red: 'At Risk' };
const weekEnding = () => { const d = new Date(); return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };

export default function OwnerUpdatesPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { projects, loading } = useProjects();
  const { items: longLead } = useLongLead();
  const { risks } = useRisks();
  const { milestones } = useMilestones();
  const { escalations } = useEscalations();
  const [copied, setCopied] = useState<string>('');
  const [emailTo, setEmailTo] = useState<Record<string, string>>({});
  const [emailState, setEmailState] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
  const [emailErr, setEmailErr] = useState<Record<string, string>>({});

  async function sendEmail(id: string, text: string) {
    const to = (emailTo[id] || '').trim();
    if (!to) { setEmailState((s) => ({ ...s, [id]: 'error' })); setEmailErr((s) => ({ ...s, [id]: 'Enter a recipient email.' })); return; }
    setEmailState((s) => ({ ...s, [id]: 'sending' })); setEmailErr((s) => ({ ...s, [id]: '' }));
    try {
      await emailOwnerUpdate(id, to, text);
      setEmailState((s) => ({ ...s, [id]: 'sent' }));
      setTimeout(() => setEmailState((s) => ({ ...s, [id]: 'idle' })), 3000);
    } catch (e: any) {
      setEmailState((s) => ({ ...s, [id]: 'error' })); setEmailErr((s) => ({ ...s, [id]: e?.message || "Couldn't send the update. Please try again." }));
    }
  }

  const updates = useMemo(() => {
    const wk = weekEnding();
    return ((projects as any[]) || []).map((p) => {
      const h = computeHealth(p);
      const ll = ((longLead as any[]) || []).filter((i) => i.project_id === p.id).map((i) => computeLongLead(i));
      const llRisk = ll.filter((x) => x.severity !== 'green').length;
      const rk = ((risks as any[]) || []).filter((r) => r.project_id === p.id).map((r) => computeRisk(r)).filter((r) => r.isOpen);
      const critRisks = rk.filter((r) => r.severity === 'red').length;
      const ms = ((milestones as any[]) || []).filter((m) => m.project_id === p.id);
      const slipping = ms.map((m) => milestoneSlip(m.baseline_date, m.current_date, m.actual_date, m.float_days)).filter((s) => s.severity !== 'green').length;
      const nowMs = Date.parse(new Date().toISOString().slice(0, 10));
      const upcoming = ms.filter((m) => { const t = Date.parse(String(m.current_date || m.baseline_date || '')); return !isNaN(t) && t >= nowMs && t <= nowMs + 30 * 86400000; })
        .sort((a, b) => Date.parse(String(a.current_date || a.baseline_date)) - Date.parse(String(b.current_date || b.baseline_date)))
        .slice(0, 3);
      const esc = ((escalations as any[]) || []).filter((e) => e.project_id === p.id && !/resolved|closed/i.test(String(e.status || '')));

      const lines: string[] = [];
      lines.push(`OWNER PROGRESS UPDATE — ${p.name || 'Project'}`);
      lines.push(`Week ending ${wk} · Prepared by Saguaro Control Systems`);
      lines.push('');
      lines.push(`STATUS: ${SEV_WORD[h.status as Severity].toUpperCase()}${p.city ? ` · ${p.city}, ${p.state}` : ''}`);
      lines.push(`Overall completion: ${h.percentComplete != null ? Math.round(h.percentComplete) + '%' : '—'}`);
      lines.push(`Budget: ${h.variancePct != null ? (h.variancePct > 1 ? `trending ${h.variancePct.toFixed(0)}% over` : 'within budget') : (h.budget != null ? fmtMoneyShort(h.budget) + ' contract' : '—')}`);
      if (h.finishDate) lines.push(`Target completion: ${fmtDate(h.finishDate)}`);
      lines.push('');
      lines.push('SCHEDULE:');
      lines.push(slipping > 0 ? `  • ${slipping} milestone(s) slipping — recovery in progress.` : `  • Milestones tracking to baseline.`);
      if (upcoming.length) upcoming.forEach((m) => lines.push(`  • Upcoming: ${(m.title || m.name)} (${fmtDate(m.current_date || m.baseline_date)})`));
      lines.push('');
      lines.push('PROCUREMENT:');
      lines.push(llRisk > 0 ? `  • ${llRisk} long-lead item(s) need action to protect the schedule.` : `  • Long-lead procurement on track.`);
      lines.push('');
      lines.push('OPEN ITEMS:');
      lines.push(`  • ${rk.length} open risk(s)${critRisks ? ` (${critRisks} critical)` : ''}, ${esc.length} escalation(s).`);
      lines.push('');
      lines.push('Questions? Reply to this update or raise it at the weekly OAC meeting.');

      return { p, h, text: lines.join('\n'), llRisk, critRisks, openRisks: rk.length, slipping, esc: esc.length, upcoming };
    }).sort((a, b) => a.h.score - b.h.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, longLead, risks, milestones, escalations]);

  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1800); } catch { /* noop */ }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  const redCount = updates.filter((u) => u.h.status === 'red').length;
  const yellowCount = updates.filter((u) => u.h.status === 'yellow').length;
  const greenCount = updates.length - redCount - yellowCount;
  const slippingTotal = updates.reduce((s, u) => s + u.slipping, 0);
  const escTotal = updates.reduce((s, u) => s + u.esc, 0);
  const llTotal = updates.reduce((s, u) => s + u.llRisk, 0);

  return (
    <PremiumSurface maxWidth={1000} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
        <ModuleHero
          eyebrow="Command Center"
          eyebrowIcon={<EnvelopeSimple size={13} weight="fill" />}
          title="Weekly Owner"
          accent="Updates"
          subtitle="An owner-ready update drafted for every site. Review, then send."
        />

        {!loading && updates.length > 0 && (
          <StatStrip items={[
            {href: '/app/command-center/owner-updates',  label: 'Sites', value: String(updates.length), icon: <Buildings size={11} weight="bold" /> },
            {href: '/app/command-center/owner-updates',  label: 'On Track', value: String(greenCount), accent: greenCount > 0 ? C.green : undefined },
            {href: '/app/command-center/owner-updates',  label: 'Needs Attention', value: String(yellowCount), accent: yellowCount > 0 ? C.yellow : undefined },
            {href: '/app/command-center/risks',  label: 'At Risk', value: String(redCount), accent: redCount > 0 ? C.red : undefined },
            {href: '/app/command-center/milestones',  label: 'Milestones Slipping', value: String(slippingTotal), accent: slippingTotal > 0 ? C.yellow : undefined },
            {href: '/app/command-center/escalations',  label: 'Escalations', value: String(escTotal), accent: escTotal > 0 ? C.red : undefined, sub: llTotal > 0 ? `${llTotal} long-lead at risk` : 'Long-lead clear' },
          ]} />
        )}

        {loading ? (
          <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : updates.length === 0 ? (
          <SectionCard flat>
            <PremiumEmpty
              icon={<EnvelopeSimple size={32} weight="duotone" color={C.gold} />}
              title="No active sites yet"
              description="Launch a site from the Rollout Pipeline and its weekly owner update drafts itself here — status, schedule, procurement, and open items in one owner-ready note."
            />
          </SectionCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {updates.map(({ p, h, text, llRisk, openRisks, critRisks, slipping, esc, upcoming }) => (
              <SectionCard
                key={p.id}
                accent={h.status === 'red' ? C.red : h.status === 'yellow' ? C.yellow : C.green}
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {p.name}
                    <SevBadge sev={h.status as Severity} label={SEV_WORD[h.status as Severity]} />
                  </span>
                }
                subtitle={`Week ending ${weekEnding()} · ${[p.city, p.state].filter(Boolean).join(', ') || '—'}`}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <GhostButton size="md" onClick={() => copy(p.id, text)} icon={copied === p.id ? <CheckCircle size={14} weight="fill" color={C.green} /> : undefined}>
                    {copied === p.id ? 'Copied' : 'Copy Update'}
                  </GhostButton>
                  <input
                    type="email"
                    value={emailTo[p.id] || ''}
                    onChange={(e) => setEmailTo((s) => ({ ...s, [p.id]: e.target.value }))}
                    placeholder="owner@email.com"
                    style={{ padding: '8px 11px', borderRadius: 10, border: `1px solid ${emailState[p.id] === 'error' ? C.red : C.border}`, fontSize: 13, width: 180, outline: 'none', background: 'var(--bg-surface-2)', color: C.text, fontFamily: font }}
                  />
                  <GoldButton
                    size="md"
                    onClick={() => sendEmail(p.id, text)}
                    disabled={emailState[p.id] === 'sending'}
                    icon={emailState[p.id] === 'sent' ? <CheckCircle size={14} weight="fill" /> : <EnvelopeSimple size={14} weight="bold" />}
                  >
                    {emailState[p.id] === 'sending' ? 'Sending…' : emailState[p.id] === 'sent' ? 'Sent' : emailState[p.id] === 'error' ? 'Retry' : 'Email to Owner'}
                  </GoldButton>
                </div>
                {emailState[p.id] === 'error' && emailErr[p.id] && (
                  <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>{emailErr[p.id]}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 10, marginTop: 14 }}>
                  <Stat label="Complete" value={h.percentComplete != null ? `${Math.round(h.percentComplete)}%` : '—'} />
                  <Stat label="Budget" value={h.variancePct != null ? `${h.variancePct > 0 ? '+' : ''}${h.variancePct.toFixed(0)}%` : '—'} color={h.variancePct != null && h.variancePct > 5 ? C.red : h.variancePct != null && h.variancePct > 1 ? C.yellow : C.text} />
                  <Stat label="Milestones Slipping" value={slipping} color={slipping ? C.yellow : C.text} />
                  <Stat label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>Long-Lead <Warning size={12} weight="fill" color={C.faint} /></span>} value={llRisk} color={llRisk ? C.red : C.text} />
                  <Stat label="Open Risks" value={`${openRisks}${critRisks ? ` (${critRisks}!)` : ''}`} color={critRisks ? C.red : C.text} />
                  <Stat label="Escalations" value={esc} color={esc ? C.red : C.text} />
                </div>
                {upcoming.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 13, color: C.dim }}>
                    <b style={{ color: C.text }}>Next up:</b> {upcoming.map((m: any) => `${m.title || m.name} (${fmtDate(m.current_date || m.baseline_date)})`).join(' · ')}
                  </div>
                )}
              </SectionCard>
            ))}
          </div>
        )}
      </div>
    </PremiumSurface>
  );
}

function Stat({ label, value, color }: { label: React.ReactNode; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.faint }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || C.text, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
