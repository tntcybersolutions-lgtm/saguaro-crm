'use client';
/**
 * Project Setup Wizard — 4 steps with auto-save on blur.
 * Calls PATCH /api/projects/[projectId] with a partial body on every blur.
 * Final step calls /completeness and routes back to the overview.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

const GOLD = '#C8960F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const RAISED = '#0D1D2E';
const DARK = '#0d1117';
const GREEN = '#22C55E';
const RED = '#EF4444';

const BUILDING_TYPES = [
  'Office Building', 'Retail/Commercial', 'Industrial/Warehouse',
  'Multi-Family Residential', 'Single Family Residential', 'Healthcare/Medical',
  'Education/School', 'Hospitality/Hotel', 'Restaurant/Food Service',
  'Government/Municipal', 'Religious/Church', 'Mixed Use',
  'Tenant Improvement', 'Infrastructure/Civil', 'Other',
];

interface ProjectForm {
  name?: string; address?: string; city?: string; state?: string; zip?: string;
  building_type?: string; project_type?: string; square_footage?: number | null;
  contract_value?: number | null; owner_name?: string; owner_email?: string;
  architect_name?: string; architect_email?: string;
  start_date?: string; end_date?: string; substantial_completion_date?: string;
  retainage_pct?: number | null; prevailing_wage?: boolean;
  pm_name?: string; pm_email?: string; pm_phone?: string;
  super_name?: string; super_email?: string; super_phone?: string;
  project_number?: string; permit_number?: string;
  davis_bacon_wage_decision?: string; liquidated_damages?: string;
  setup_step?: number | null;
}

export default function ProjectSetupWizardPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ProjectForm>({});
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [completeness, setCompleteness] = useState<{ score: number; missing: Array<{ key: string; label: string }> } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}`);
        if (r.ok) {
          const j = await r.json();
          const p = j.project || j;
          setForm(p);
          setStep(Number(p.setup_step) || 1);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [projectId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    const key = Object.keys(patch)[0];
    setSavingField(key);
    try {
      const r = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setToast(j?.error || 'Save failed');
      }
    } catch { setToast('Save failed'); }
    finally { setSavingField(null); }
  }, [projectId]);

  function setField<K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function commitField<K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    save({ [key]: value });
  }

  async function goToStep(next: number) {
    setStep(next);
    await save({ setup_step: next });
  }

  async function finish() {
    setFinishing(true);
    try {
      await save({ setup_step: 4, setup_complete: true });
      const r = await fetch(`/api/projects/${projectId}/completeness`);
      if (r.ok) {
        const j = await r.json();
        setCompleteness({ score: j.score, missing: j.missing || [] });
        setToast(`Project setup complete ✅  ·  ${j.score}% complete`);
        setTimeout(() => router.push(`/app/projects/${projectId}`), 1200);
      }
    } finally {
      setFinishing(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 40, color: DIM, background: DARK, minHeight: '100vh' }}>Loading setup wizard…</div>;
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, background: DARK, minHeight: '100vh' }}>
      {/* Header + progress */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Project Setup</h1>
          <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>
            Complete these 4 steps to unlock full document generation and accurate dashboards.
          </div>
        </div>
        <button
          onClick={() => router.push(`/app/projects/${projectId}`)}
          style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: DIM,
            fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          }}
        >
          ← Back to project
        </button>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { n: 1, label: 'Basics' },
          { n: 2, label: 'Contract' },
          { n: 3, label: 'Team' },
          { n: 4, label: 'Admin' },
        ].map(s => (
          <button
            key={s.n}
            onClick={() => goToStep(s.n)}
            style={{
              flex: 1, minWidth: 140,
              padding: '14px 16px',
              background: step === s.n ? `rgba(200,150,15,0.15)` : 'transparent',
              border: `1px solid ${step === s.n ? GOLD : BORDER}`,
              borderRadius: 10,
              color: step === s.n ? GOLD : DIM,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 2 }}>STEP {s.n}</div>
            <div>{s.label}</div>
          </button>
        ))}
      </div>

      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24 }}>
        {step === 1 && (
          <StepBasics form={form} setField={setField} commitField={commitField} savingField={savingField} />
        )}
        {step === 2 && (
          <StepContract form={form} setField={setField} commitField={commitField} savingField={savingField} />
        )}
        {step === 3 && (
          <StepTeam form={form} setField={setField} commitField={commitField} savingField={savingField} />
        )}
        {step === 4 && (
          <StepAdmin form={form} setField={setField} commitField={commitField} savingField={savingField} />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, borderTop: `1px solid ${BORDER}`, paddingTop: 20 }}>
          <button
            onClick={() => goToStep(Math.max(1, step - 1))}
            disabled={step === 1}
            style={{
              background: 'transparent', border: `1px solid ${BORDER}`, color: step === 1 ? DIM : TEXT,
              fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 8,
              cursor: step === 1 ? 'not-allowed' : 'pointer', opacity: step === 1 ? 0.5 : 1,
            }}
          >
            ← Previous
          </button>
          {step < 4 ? (
            <button
              onClick={() => goToStep(step + 1)}
              style={{
                background: GOLD, color: '#0d1117', border: 'none',
                fontSize: 13, fontWeight: 800, padding: '10px 22px', borderRadius: 8, cursor: 'pointer',
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={finishing}
              style={{
                background: finishing ? 'rgba(34,197,94,.4)' : GREEN, color: '#0d1117', border: 'none',
                fontSize: 13, fontWeight: 800, padding: '10px 22px', borderRadius: 8,
                cursor: finishing ? 'not-allowed' : 'pointer',
              }}
            >
              {finishing ? 'Finishing…' : '✓ Finish Setup'}
            </button>
          )}
        </div>
      </div>

      {completeness && (
        <div style={{
          marginTop: 20, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginBottom: 6 }}>
            Completeness: {completeness.score}%
          </div>
          {completeness.missing.length > 0 && (
            <div style={{ fontSize: 12, color: DIM }}>
              Still missing: {completeness.missing.map(m => m.label).join(' · ')}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(34,197,94,0.95)', color: '#0d1117',
            fontSize: 13, fontWeight: 800, padding: '10px 22px', borderRadius: 8, zIndex: 999,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* ── Field primitives ─────────────────────────────────────────── */

interface StepProps {
  form: ProjectForm;
  setField: <K extends keyof ProjectForm>(k: K, v: ProjectForm[K]) => void;
  commitField: <K extends keyof ProjectForm>(k: K, v: ProjectForm[K]) => void;
  savingField: string | null;
}

function TextField<K extends keyof ProjectForm>({
  label, k, form, setField, commitField, savingField, type = 'text', placeholder, required,
}: StepProps & {
  label: string; k: K;
  type?: 'text' | 'number' | 'email' | 'tel' | 'date';
  placeholder?: string; required?: boolean;
}) {
  const val = form[k] ?? '';
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{label}</span>
        {required && !val && <span style={{ color: RED, textTransform: 'none', letterSpacing: 0 }}>·  required</span>}
        {savingField === k && <span style={{ color: GOLD, textTransform: 'none', letterSpacing: 0 }}>saving…</span>}
      </div>
      <input
        type={type}
        value={val as string | number}
        placeholder={placeholder}
        onChange={e => {
          const v = type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
          setField(k, v as ProjectForm[K]);
        }}
        onBlur={e => {
          const v = type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
          commitField(k, v as ProjectForm[K]);
        }}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '10px 12px', fontSize: 14, outline: 'none',
        }}
      />
    </label>
  );
}

function SelectField<K extends keyof ProjectForm>({
  label, k, options, form, setField, commitField, savingField,
}: StepProps & { label: string; k: K; options: string[]; }) {
  const val = (form[k] as string) ?? '';
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
        {label}
        {savingField === k && <span style={{ color: GOLD, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>saving…</span>}
      </div>
      <select
        value={val}
        onChange={e => { setField(k, e.target.value as ProjectForm[K]); commitField(k, e.target.value as ProjectForm[K]); }}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '10px 12px', fontSize: 14, outline: 'none',
        }}
      >
        <option value="">— select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function ToggleField<K extends keyof ProjectForm>({
  label, k, form, setField, commitField, description,
}: StepProps & { label: string; k: K; description?: string }) {
  const val = !!form[k];
  return (
    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <button
        type="button"
        onClick={() => { const next = !val; setField(k, next as ProjectForm[K]); commitField(k, next as ProjectForm[K]); }}
        role="switch"
        aria-checked={val}
        style={{
          width: 42, height: 24, flexShrink: 0, borderRadius: 24,
          background: val ? GREEN : BORDER,
          border: 'none', cursor: 'pointer', position: 'relative', padding: 0,
          transition: 'background .15s ease',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: val ? 20 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left .15s ease',
        }} />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{description}</div>}
      </div>
    </div>
  );
}

/* ── Step components ───────────────────────────────────────────── */

function StepBasics(p: StepProps) {
  return (
    <>
      <StepHeader title="Basics" subtitle="Project identity and location." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
        <TextField {...p} label="Project Name" k="name" required placeholder="Acme HQ — Phoenix" />
        <TextField {...p} label="Street Address" k="address" required placeholder="123 Main St" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 12 }}>
          <TextField {...p} label="City" k="city" />
          <TextField {...p} label="State" k="state" />
          <TextField {...p} label="Zip" k="zip" />
        </div>
        <SelectField {...p} label="Building Type" k="building_type" options={BUILDING_TYPES} />
        <TextField {...p} label="Project Type" k="project_type" placeholder="New construction · Remodel · TI · Civil" />
        <TextField {...p} label="Square Footage" k="square_footage" type="number" placeholder="35000" />
      </div>
    </>
  );
}

function StepContract(p: StepProps) {
  return (
    <>
      <StepHeader title="Contract" subtitle="Owner, architect, and money." />
      <TextField {...p} label="Contract Value" k="contract_value" type="number" placeholder="3500000" required />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TextField {...p} label="Owner Name" k="owner_name" required />
        <TextField {...p} label="Owner Email" k="owner_email" type="email" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TextField {...p} label="Architect Name" k="architect_name" />
        <TextField {...p} label="Architect Email" k="architect_email" type="email" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <TextField {...p} label="Start Date" k="start_date" type="date" />
        <TextField {...p} label="End Date" k="end_date" type="date" />
        <TextField {...p} label="Substantial Completion" k="substantial_completion_date" type="date" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'flex-start' }}>
        <TextField {...p} label="Retainage %" k="retainage_pct" type="number" placeholder="10" />
        <div style={{ paddingTop: 26 }}>
          <ToggleField
            {...p}
            label="Prevailing Wage project"
            k="prevailing_wage"
            description="Turns on Davis-Bacon compliance (WH-347) and Wage Decision requirement."
          />
        </div>
      </div>
    </>
  );
}

function StepTeam(p: StepProps) {
  return (
    <>
      <StepHeader title="Team" subtitle="Who runs the project day to day." />
      <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Project Manager
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: 12 }}>
        <TextField {...p} label="PM Name" k="pm_name" />
        <TextField {...p} label="PM Email" k="pm_email" type="email" />
        <TextField {...p} label="PM Phone" k="pm_phone" type="tel" />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: 0.6, margin: '18px 0 8px' }}>
        Superintendent
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: 12 }}>
        <TextField {...p} label="Super Name" k="super_name" />
        <TextField {...p} label="Super Email" k="super_email" type="email" />
        <TextField {...p} label="Super Phone" k="super_phone" type="tel" />
      </div>
    </>
  );
}

function StepAdmin(p: StepProps) {
  const prevailing = !!p.form.prevailing_wage;
  return (
    <>
      <StepHeader title="Admin" subtitle="Project identifiers and compliance fields." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TextField {...p} label="Project Number" k="project_number" placeholder="2026-018" />
        <TextField {...p} label="Permit Number" k="permit_number" />
      </div>
      {prevailing && (
        <TextField {...p} label="Davis-Bacon Wage Decision" k="davis_bacon_wage_decision" placeholder="AZ20240007 · Highway · 01-05-2024" />
      )}
      <TextField {...p} label="Liquidated Damages" k="liquidated_damages" placeholder="$1,500/day" />
    </>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{title}</div>
      <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{subtitle}</div>
    </div>
  );
}
