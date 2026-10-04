'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { Badge, Btn, Table, T } from '@/components/ui/shell';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { CheckCircle, XCircle, Clipboard, Warning, ShieldCheck } from '@phosphor-icons/react';
import { openPdf } from '@/components/PdfViewer';

interface ComplianceSub {
  id: string;
  name: string;
  trade: string;
  contract_amount: number;
  coi_status: string;
  coi_expiry: string | null;
  license_status: string;
  license_number: string;
  w9_status: string;
  is_prevailing_wage: boolean;
}

const STATUS_BADGE: Record<string, 'green' | 'amber' | 'red' | 'muted'> = {
  active: 'green', on_file: 'green', current: 'green', valid: 'green',
  expiring: 'amber', pending: 'amber',
  expired: 'red', missing: 'red', invalid: 'red',
  not_requested: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active', on_file: 'On File', current: 'Current', valid: 'Valid',
  expiring: 'Expiring', pending: 'Pending',
  expired: 'Expired', missing: 'Missing', invalid: 'Invalid',
  not_requested: 'Not Requested',
};

interface PrequalResult {
  verdict: 'pass' | 'flag' | 'fail';
  score: number;
  flags: string[];
  strengths: string[];
  required_before_award: string[];
  summary: string;
}

export default function CompliancePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [subs, setSubs] = useState<ComplianceSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [isPublicProject, setIsPublicProject] = useState(false);
  const [prequaling, setPrequaling] = useState<string | null>(null);
  const [prequals, setPrequals] = useState<Record<string, PrequalResult>>({});

  // Live compliance intelligence — /api/compliance scores every sub from the
  // real tables (insurance_certificates, w9_requests, lien_waivers) and
  // /api/project-context supplies the roster. Merged into the matrix by name.
  const { ctx } = useProjectContext(projectId);
  const [scored, setScored] = useState<any[]>([]);
  const [scoredSummary, setScoredSummary] = useState<any>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/compliance?projectId=${projectId}`);
        const d = await r.json();
        if (Array.isArray(d.subs)) { setScored(d.subs); setScoredSummary(d.summary || null); }
      } catch {}
    })();
  }, [projectId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      const project = data.project || data;
      setIsPublicProject(project.is_public || project.prevailing_wage || false);
      const subList = data.subs || data.subcontractors || [];
      setSubs(subList.map((s: any) => ({
        id: s.id || s.sub_id,
        name: s.name || s.company_name,
        trade: s.trade || s.specialty || '',
        contract_amount: s.contract_amount || 0,
        coi_status: s.coi_status || 'pending',
        coi_expiry: s.coi_expiry || s.coi_expiration || null,
        license_status: s.license_status || 'pending',
        license_number: s.license_number || '',
        w9_status: s.w9_status || 'pending',
        is_prevailing_wage: s.is_prevailing_wage || false,
      })));
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const norm = (v: any) => String(v || '').toLowerCase().trim();
  const scoredByName = new Map<string, any>(scored.map((s: any) => [norm(s.name), s]));
  const ctxSubs = (ctx?.subs || []) as any[];

  // Unified matrix: the contracts-derived rows enriched with live scores, plus
  // any scored subs and roster members those rows miss. One list, no blind spots.
  type MatrixRow = ComplianceSub & { live?: any };
  const seenNames = new Set(subs.map(s => norm(s.name)).filter(Boolean));
  const merged: MatrixRow[] = subs.map(s => ({ ...s, live: scoredByName.get(norm(s.name)) }));
  for (const sc of scored) {
    if (!norm(sc.name) || seenNames.has(norm(sc.name))) continue;
    seenNames.add(norm(sc.name));
    merged.push({
      id: sc.id, name: sc.name, trade: sc.trade || '', contract_amount: Number(sc.contract_amount) || 0,
      coi_status: 'pending', coi_expiry: null, license_status: 'pending', license_number: '',
      w9_status: 'pending', is_prevailing_wage: false, live: sc,
    });
  }
  for (const rs of ctxSubs) {
    if (!norm(rs.companyName) || seenNames.has(norm(rs.companyName))) continue;
    seenNames.add(norm(rs.companyName));
    merged.push({
      id: rs.id, name: rs.companyName, trade: rs.trade || '', contract_amount: Number(rs.contractAmount) || 0,
      coi_status: 'pending', coi_expiry: null, license_status: 'pending', license_number: '',
      w9_status: 'pending', is_prevailing_wage: false, live: scoredByName.get(norm(rs.companyName)),
    });
  }

  // Live-first status readers: real table data when the compliance API has it,
  // the contracts-derived fields otherwise.
  const coiStateOf = (s: MatrixRow) => s.live
    ? ((Number(s.live.insurance?.active_certs) || 0) > 0 ? ((Number(s.live.insurance?.expiring_certs) || 0) > 0 ? 'expiring' : 'active') : 'missing')
    : s.coi_status;
  const w9StateOf = (s: MatrixRow) => {
    if (!s.live) return s.w9_status;
    const w = String(s.live.w9?.status || '');
    return (w === 'submitted' || w === 'approved' || w === 'received') ? 'on_file' : w === 'pending' ? 'pending' : 'not_requested';
  };

  const compliantCount = scoredSummary ? Number(scoredSummary.compliant) || 0 : subs.filter(s => s.coi_status === 'active' && s.license_status !== 'expired' && s.license_status !== 'missing').length;
  const expiredCOIs = scored.length > 0
    ? merged.filter(s => { const c = coiStateOf(s); return c === 'expired' || c === 'expiring' || c === 'missing'; }).length
    : subs.filter(s => s.coi_status === 'expired' || s.coi_status === 'expiring').length;
  const missingLicenses = subs.filter(s => s.license_status === 'missing' || s.license_status === 'expired').length;
  const wageViolations = subs.filter(s => s.is_prevailing_wage && isPublicProject).length;

  async function scorePrequal(sub: ComplianceSub) {
    setPrequaling(sub.id);
    try {
      const res = await fetch('/api/ai/sub-prequal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId: sub.id, subData: sub }),
      });
      if (!res.ok) throw new Error('scoring failed');
      const d = await res.json();
      setPrequals(prev => ({ ...prev, [sub.id]: d }));
    } catch {
      setToast('AI scoring failed. Please try again.');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setPrequaling(null);
    }
  }

  async function requestCOI(subId: string, subName: string) {
    try {
      const res = await fetch('/api/insurance/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId, projectId }),
      });
      if (!res.ok) throw new Error('request failed');
      setToast(`COI request sent to ${subName}.`);
    } catch {
      setToast(`Could not send the COI request to ${subName}. Please try again.`);
    }
    setTimeout(() => setToast(''), 4000);
  }

  async function generatePrevailingWage() {
    try {
      const res = await fetch('/api/documents/prevailing-wage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      const url = data.url || data.pdfUrl;
      if (!res.ok || !url) throw new Error(data.error || 'generation failed');
      openPdf({ url });
      setToast('Prevailing wage rate sheet generated.');
    } catch {
      setToast('Could not generate the prevailing wage rate sheet. Please try again.');
    }
    setTimeout(() => setToast(''), 4000);
  }

  return (
    <PremiumSurface maxWidth={2200}>
      <ModuleHero
        eyebrow="Risk & Compliance"
        eyebrowIcon={<ShieldCheck size={13} weight="fill" color="var(--brand-primary)" />}
        title="Compliance"
        accent="Dashboard"
        subtitle={`Insurance, licensing, W-9, and lien-waiver compliance · ${merged.length} subcontractor${merged.length === 1 ? '' : 's'} tracked`}
        actions={
          <>
            {isPublicProject && (
              <button style={ghostButtonStyle} className="pmBtn" onClick={generatePrevailingWage}>Generate Prevailing Wage Rate Sheet</button>
            )}
            <button style={goldButtonStyle} className="pmBtn" onClick={async () => {
              try {
                const res = await fetch('/api/insurance/request', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ projectId }),
                });
                if (!res.ok) throw new Error('request failed');
                setToast('COI request emails sent to all subcontractors.');
              } catch {
                setToast('Could not send COI requests. Please try again.');
              }
              setTimeout(() => setToast(''), 4000);
            }}>
              Request All COIs
            </button>
          </>
        }
      />

      {/* Compliance intelligence strip — live scores from certs, W-9s, and waivers */}
      {scoredSummary && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/subs`,  label: 'Subs Tracked', value: String(merged.length), sub: ctxSubs.length ? `${ctxSubs.length} on the project roster` : 'From live compliance tables' },
          {href: `/app/projects/${projectId}/compliance`,  label: 'Compliant', value: String(Number(scoredSummary.compliant) || 0), accent: '#2CFF7A', sub: 'Score 80+ — cleared to work' },
          {href: `/app/projects/${projectId}/compliance`,  label: 'At Risk', value: String(Number(scoredSummary.at_risk) || 0), accent: Number(scoredSummary.at_risk) > 0 ? 'var(--warning)' : undefined, sub: 'Gaps to close this month' },
          {href: `/app/projects/${projectId}/compliance`,  label: 'Non-Compliant', value: String(Number(scoredSummary.non_compliant) || 0), accent: Number(scoredSummary.non_compliant) > 0 ? '#FF3B30' : '#2CFF7A', sub: 'Hold payment and site access' },
          {href: `/app/projects/${projectId}/compliance`,  label: 'Avg Score', value: `${Number(scoredSummary.avg_score) || 0}/100`, sub: 'W-9 25 · insurance 40 · waivers 35' },
        ]} />
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon={<CheckCircle size={19} weight="duotone" color={T.green} />} label="Compliant Subs" value={String(compliantCount)} accent={T.green} delay={0.02}  href={`/app/projects/${projectId}/compliance`}/>
        <StatCard icon={<XCircle size={19} weight="duotone" color={T.red} />} label="COI Gaps" value={String(expiredCOIs)} accent={expiredCOIs > 0 ? T.red : undefined} delay={0.06}  href={`/app/projects/${projectId}/insurance`}/>
        <StatCard icon={<Clipboard size={19} weight="duotone" color={T.muted} />} label="Missing Licenses" value={String(missingLicenses)} accent={missingLicenses > 0 ? T.amber : undefined} delay={0.10}  href={`/app/projects/${projectId}/compliance`}/>
        <StatCard icon={<Warning size={19} weight="duotone" color={T.amber} />} label="Wage Flags" value={String(wageViolations)} accent={wageViolations > 0 ? T.amber : undefined} delay={0.14}  href={`/app/projects/${projectId}/compliance`}/>
      </div>

      {toast && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(44,255,122,0.3)`, borderRadius: 12, color: T.green, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {isPublicProject && (
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 16, background: 'color-mix(in srgb, var(--warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>
          <Badge label="Public Project" color="amber" />
          <span style={{ fontSize: 13, color: T.amber }}>Prevailing wage requirements apply to this project.</span>
        </div>
      )}

      {/* Table */}
      <SectionCard title="Subcontractor Compliance" icon={<ShieldCheck size={17} weight="duotone" color="var(--brand-primary)" />} flush>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading…</div>
        ) : merged.length === 0 ? (
          <PremiumEmpty
            icon={<ShieldCheck size={30} weight="duotone" color="var(--brand-primary)" />}
            title="No Subcontractors to Track Yet"
            description="Subs join this matrix when you add them to the project roster or award a bid package. From then on their COI expiry, W-9, license, and lien-waiver status roll up here — and the award gate blocks buyout to anyone missing a W-9 or carrying lapsed insurance."
            action={<a href={`/app/projects/${projectId}/bid-packages`} className="pmBtn" style={goldButtonStyle}>Go to Bid Packages</a>}
          />
        ) : (
          <Table
            headers={['Subcontractor', 'Trade', 'Contract', 'COI', 'COI Expiry', 'License', 'W-9', 'Waivers', 'Score', 'Actions']}
            rows={merged.map(s => {
              const coi = coiStateOf(s);
              const w9 = w9StateOf(s);
              const lw = s.live?.lien_waivers;
              return [
              <span key="n" style={{ fontWeight: 600 }}>{s.name}</span>,
              <span key="t" style={{ color: T.muted }}>{s.trade}</span>,
              <span key="c" style={{ color: T.white }}>${(Number(s.contract_amount) || 0).toLocaleString()}</span>,
              <Badge key="cs" label={STATUS_LABEL[coi] || coi} color={STATUS_BADGE[coi] || 'muted'} />,
              <span key="ce" style={{ color: coi === 'expired' || coi === 'missing' ? T.red : coi === 'expiring' ? T.amber : T.muted, whiteSpace: 'nowrap' }}>
                {s.coi_expiry || (s.live ? ((Number(s.live.insurance?.active_certs) || 0) > 0 ? `${s.live.insurance.active_certs} active cert${Number(s.live.insurance.active_certs) === 1 ? '' : 's'}` : 'None on file') : '—')}
              </span>,
              <Badge key="ls" label={STATUS_LABEL[s.license_status] || s.license_status} color={STATUS_BADGE[s.license_status] || 'muted'} />,
              <Badge key="ws" label={STATUS_LABEL[w9] || w9} color={STATUS_BADGE[w9] || 'muted'} />,
              <span key="lw" style={{ color: lw ? (Number(lw.pending) > 0 ? T.amber : T.green) : T.muted, whiteSpace: 'nowrap', fontSize: 12 }}>
                {lw ? (Number(lw.total) > 0 ? `${lw.signed}/${lw.total} signed` : 'None yet') : '—'}
              </span>,
              <span key="sc" style={{ fontWeight: 800, whiteSpace: 'nowrap', color: s.live ? (Number(s.live.score) >= 80 ? T.green : Number(s.live.score) >= 50 ? T.amber : T.red) : T.muted }}>
                {s.live ? `${s.live.score}/100` : '—'}
              </span>,
              <div key="act" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {(coi === 'expired' || coi === 'expiring' || coi === 'missing') && (
                  <Btn size="sm" variant="ghost" onClick={() => requestCOI(s.id, s.name)}>Request COI</Btn>
                )}
                <Btn size="sm" variant="ghost" onClick={() => scorePrequal({ ...s, live: undefined } as any)} disabled={prequaling === s.id}>
                  {prequaling === s.id ? 'Scoring…' : prequals[s.id] ? 'Re-Score' : 'AI Score'}
                </Btn>
                {prequals[s.id] && (
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: prequals[s.id].verdict === 'pass' ? 'rgba(26,138,74,.15)' : prequals[s.id].verdict === 'flag' ? 'color-mix(in srgb, var(--warning) 15%, transparent)' : 'rgba(192,48,48,.15)',
                    color: prequals[s.id].verdict === 'pass' ? '#2CFF7A' : prequals[s.id].verdict === 'flag' ? 'var(--warning)' : '#FF3B30',
                  }}>
                    {prequals[s.id].verdict.charAt(0).toUpperCase() + prequals[s.id].verdict.slice(1)} {prequals[s.id].score}/100
                  </span>
                )}
              </div>,
            ];})}
          />
        )}
      </SectionCard>

      {/* AI Prequal Results */}
      {Object.keys(prequals).length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.white, marginBottom: 14, letterSpacing: '0.02em' }}>AI Prequalification Results</div>
          {Object.entries(prequals).map(([subId, result]) => {
            const sub = subs.find(s => s.id === subId);
            if (!sub) return null;
            const verdictColor = result.verdict === 'pass' ? '#2CFF7A' : result.verdict === 'flag' ? 'var(--warning)' : '#FF3B30';
            const verdictBg = result.verdict === 'pass' ? 'rgba(26,138,74,.08)' : result.verdict === 'flag' ? 'color-mix(in srgb, var(--warning) 8%, transparent)' : 'rgba(192,48,48,.08)';
            return (
              <SectionCard flat key={subId} accent={verdictColor} style={{ marginBottom: 12, border: `1px solid color-mix(in srgb, ${verdictColor} 19%, transparent)` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: T.white }}>{sub.name} — AI Prequalification</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: T.muted }}>Score: <strong style={{ color: verdictColor }}>{result.score}/100</strong></div>
                    <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 5, background: verdictBg, color: verdictColor }}>{result.verdict.charAt(0).toUpperCase() + result.verdict.slice(1)}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 12 }}>{result.summary}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  {result.flags.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#FF3B30', marginBottom: 6 }}>Flags</div>
                      {result.flags.map((f, i) => <div key={i} style={{ fontSize: 12, color: T.muted, marginBottom: 3 }}>• {f}</div>)}
                    </div>
                  )}
                  {result.strengths.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#2CFF7A', marginBottom: 6 }}>Strengths</div>
                      {result.strengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: T.muted, marginBottom: 3 }}>• {s}</div>)}
                    </div>
                  )}
                  {result.required_before_award.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>Required Before Award</div>
                      {result.required_before_award.map((r, i) => <div key={i} style={{ fontSize: 12, color: T.muted, marginBottom: 3 }}>• {r}</div>)}
                    </div>
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </PremiumSurface>
  );
}
