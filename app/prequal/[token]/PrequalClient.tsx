'use client';

import { useState, FormEvent } from 'react';

/* ── Dark Theme Tokens ──────────────────────────────────────────────── */
const T = {
  bg: '#0d1117',
  card: '#161b22',
  border: '#30363d',
  text: '#F0F4FF',
  dim: '#8B9DB8',
  gold: '#C8960F',
  green: '#22C55E',
  red: '#EF4444',
  input: '#0d1117',
  radius: 8,
};

const sectionStyle: React.CSSProperties = {
  background: T.card,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius,
  padding: 24,
  marginBottom: 24,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  color: T.dim,
  marginBottom: 6,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  background: T.input,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  color: T.text,
  outline: 'none',
  boxSizing: 'border-box',
};

const headingStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: T.gold,
  marginBottom: 16,
  paddingBottom: 8,
  borderBottom: `1px solid ${T.border}`,
};

const gridTwo: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16,
};

/* ── Types ──────────────────────────────────────────────────────────── */
interface Reference {
  company: string;
  contact_name: string;
  phone: string;
  email: string;
  project_name: string;
  project_value: string;
  year_completed: string;
}

const emptyRef = (): Reference => ({
  company: '', contact_name: '', phone: '', email: '',
  project_name: '', project_value: '', year_completed: '',
});

/* ── Component ─────────────────────────────────────────────────────── */
export default function PrequalClient({ token }: { token: string }) {
  /* Form state */
  const [company_name, setCompanyName] = useState('');
  const [dba_name, setDba] = useState('');
  const [year_established, setYearEst] = useState('');
  const [contact_name, setContactName] = useState('');
  const [contact_email, setContactEmail] = useState('');
  const [contact_phone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [website, setWebsite] = useState('');

  const [primary_trade, setPrimaryTrade] = useState('');
  const [license_number, setLicenseNumber] = useState('');
  const [license_state, setLicenseState] = useState('');
  const [license_expiry, setLicenseExpiry] = useState('');
  const [license_type, setLicenseType] = useState('');

  const [emr_current, setEmrCurrent] = useState('');
  const [emr_prior_year, setEmrPrior] = useState('');
  const [emr_two_years_prior, setEmrTwoYears] = useState('');
  const [osha_recordable_incidents, setOshaRecordable] = useState('');
  const [osha_lost_time_incidents, setOshaLostTime] = useState('');
  const [has_safety_officer, setHasSafetyOfficer] = useState(false);
  const [safety_program_description, setSafetyDesc] = useState('');

  const [annual_revenue, setAnnualRevenue] = useState('');
  const [largest_single_project, setLargestProject] = useState('');
  const [current_backlog, setCurrentBacklog] = useState('');
  const [bonding_limit, setBondingLimit] = useState('');
  const [bonding_agent, setBondingAgent] = useState('');
  const [bonding_agent_phone, setBondingAgentPhone] = useState('');

  const [references, setReferences] = useState<Reference[]>([emptyRef(), emptyRef(), emptyRef()]);

  const [gl_carrier, setGlCarrier] = useState('');
  const [gl_expiry, setGlExpiry] = useState('');
  const [gl_limit, setGlLimit] = useState('');
  const [wc_carrier, setWcCarrier] = useState('');
  const [wc_expiry, setWcExpiry] = useState('');
  const [auto_carrier, setAutoCarrier] = useState('');
  const [auto_expiry, setAutoExpiry] = useState('');
  const [umbrella_limit, setUmbrellaLimit] = useState('');

  const [w9_url, setW9Url] = useState('');
  const [license_cert_url, setLicenseCertUrl] = useState('');
  const [insurance_cert_url, setInsuranceCertUrl] = useState('');
  const [financial_statement_url, setFinancialUrl] = useState('');
  const [safety_program_url, setSafetyProgramUrl] = useState('');
  const [osha_logs_url, setOshaLogsUrl] = useState('');

  const [certify, setCertify] = useState(false);

  /* UI state */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  function updateRef(idx: number, key: keyof Reference, val: string) {
    setReferences(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  }

  function validateEmr(val: string): boolean {
    if (!val) return true;
    const n = parseFloat(val);
    return !isNaN(n) && n >= 0.1 && n <= 3.0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!company_name.trim()) { setError('Company name is required.'); return; }
    if (!contact_name.trim()) { setError('Contact name is required.'); return; }
    if (!contact_email.trim()) { setError('Contact email is required.'); return; }
    if (!validateEmr(emr_current) || !validateEmr(emr_prior_year) || !validateEmr(emr_two_years_prior)) {
      setError('EMR values must be between 0.1 and 3.0.'); return;
    }

    setSubmitting(true);
    try {
      const body = {
        company_name, dba_name,
        year_established: year_established ? parseInt(year_established) : null,
        contact_name, contact_email, contact_phone,
        address, city, state, zip, website,
        primary_trade, license_number, license_state,
        license_expiry: license_expiry || null,
        license_type,
        emr_current: emr_current ? parseFloat(emr_current) : null,
        emr_prior_year: emr_prior_year ? parseFloat(emr_prior_year) : null,
        emr_two_years_prior: emr_two_years_prior ? parseFloat(emr_two_years_prior) : null,
        osha_recordable_incidents: osha_recordable_incidents ? parseInt(osha_recordable_incidents) : null,
        osha_lost_time_incidents: osha_lost_time_incidents ? parseInt(osha_lost_time_incidents) : null,
        has_safety_officer, safety_program_description,
        annual_revenue: annual_revenue ? parseFloat(annual_revenue) : null,
        largest_single_project: largest_single_project ? parseFloat(largest_single_project) : null,
        current_backlog: current_backlog ? parseFloat(current_backlog) : null,
        bonding_limit: bonding_limit ? parseFloat(bonding_limit) : null,
        bonding_agent, bonding_agent_phone,
        references: references.filter(r => r.company || r.contact_name),
        gl_carrier, gl_expiry: gl_expiry || null, gl_limit: gl_limit ? parseFloat(gl_limit) : null,
        wc_carrier, wc_expiry: wc_expiry || null,
        auto_carrier, auto_expiry: auto_expiry || null,
        umbrella_limit: umbrella_limit ? parseFloat(umbrella_limit) : null,
        w9_url, license_cert_url, insurance_cert_url,
        financial_statement_url, safety_program_url, osha_logs_url,
      };

      const res = await fetch(`/api/prequal/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setConfirmation(data.confirmation_number);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Success Screen ────────────────────────────────────────────── */
  if (confirmation) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ ...sectionStyle, maxWidth: 520, textAlign: 'center', border: `1px solid ${T.green}` }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><path stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 8 }}>Application Received</h2>
          <p style={{ color: T.dim, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            Your prequalification application has been received. Our team will review your submission and follow up with next steps.
          </p>
          <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '12px 16px', display: 'inline-block' }}>
            <span style={{ fontSize: 12, color: T.dim }}>Confirmation Number</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.gold, letterSpacing: 2, marginTop: 4 }}>{confirmation}</div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Form ───────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: '20px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.gold, margin: 0 }}>Subcontractor Prequalification</h1>
        <p style={{ color: T.dim, fontSize: 13, marginTop: 6, marginBottom: 0 }}>
          Complete all sections below. Fields marked with * are required.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {error && (
          <div style={{ background: 'rgba(239,68,68,.12)', border: `1px solid ${T.red}`, borderRadius: 6, padding: '12px 16px', marginBottom: 20, color: T.red, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* ── Section 1: Company Information ──────────────────────── */}
        <div style={sectionStyle}>
          <h3 style={headingStyle}>1. Company Information</h3>
          <div style={gridTwo}>
            <Field label="Company Name *" value={company_name} onChange={setCompanyName} required />
            <Field label="DBA Name" value={dba_name} onChange={setDba} />
            <Field label="Year Established" value={year_established} onChange={setYearEst} type="number" />
            <Field label="Contact Name *" value={contact_name} onChange={setContactName} required />
            <Field label="Contact Email *" value={contact_email} onChange={setContactEmail} type="email" required />
            <Field label="Contact Phone" value={contact_phone} onChange={setContactPhone} type="tel" />
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Address" value={address} onChange={setAddress} />
            </div>
            <Field label="City" value={city} onChange={setCity} />
            <Field label="State" value={state} onChange={setState} />
            <Field label="Zip" value={zip} onChange={setZip} />
            <Field label="Website" value={website} onChange={setWebsite} type="url" />
          </div>
        </div>

        {/* ── Section 2: Trade & License ──────────────────────────── */}
        <div style={sectionStyle}>
          <h3 style={headingStyle}>2. Trade &amp; License</h3>
          <div style={gridTwo}>
            <Field label="Primary Trade *" value={primary_trade} onChange={setPrimaryTrade} required />
            <Field label="License Number" value={license_number} onChange={setLicenseNumber} />
            <Field label="License State" value={license_state} onChange={setLicenseState} />
            <Field label="License Expiry" value={license_expiry} onChange={setLicenseExpiry} type="date" />
            <Field label="License Type" value={license_type} onChange={setLicenseType} />
          </div>
        </div>

        {/* ── Section 3: Safety Record ────────────────────────────── */}
        <div style={sectionStyle}>
          <h3 style={headingStyle}>3. Safety Record</h3>
          <div style={gridTwo}>
            <Field label="EMR (Current Year)" value={emr_current} onChange={setEmrCurrent} type="number" step="0.01" />
            <Field label="EMR (Prior Year)" value={emr_prior_year} onChange={setEmrPrior} type="number" step="0.01" />
            <Field label="EMR (Two Years Prior)" value={emr_two_years_prior} onChange={setEmrTwoYears} type="number" step="0.01" />
            <Field label="OSHA Recordable Incidents" value={osha_recordable_incidents} onChange={setOshaRecordable} type="number" />
            <Field label="OSHA Lost Time Incidents" value={osha_lost_time_incidents} onChange={setOshaLostTime} type="number" />
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="safety_officer" checked={has_safety_officer} onChange={e => setHasSafetyOfficer(e.target.checked)} style={{ width: 18, height: 18, accentColor: T.gold }} />
            <label htmlFor="safety_officer" style={{ color: T.dim, fontSize: 14, cursor: 'pointer' }}>Has dedicated safety officer</label>
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Safety Program Description</label>
            <textarea
              value={safety_program_description}
              onChange={e => setSafetyDesc(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        {/* ── Section 4: Financial Capacity ───────────────────────── */}
        <div style={sectionStyle}>
          <h3 style={headingStyle}>4. Financial Capacity</h3>
          <div style={gridTwo}>
            <Field label="Annual Revenue ($)" value={annual_revenue} onChange={setAnnualRevenue} type="number" />
            <Field label="Largest Single Project ($)" value={largest_single_project} onChange={setLargestProject} type="number" />
            <Field label="Current Backlog ($)" value={current_backlog} onChange={setCurrentBacklog} type="number" />
            <Field label="Bonding Limit ($)" value={bonding_limit} onChange={setBondingLimit} type="number" />
            <Field label="Bonding Agent" value={bonding_agent} onChange={setBondingAgent} />
            <Field label="Bonding Agent Phone" value={bonding_agent_phone} onChange={setBondingAgentPhone} type="tel" />
          </div>
        </div>

        {/* ── Section 5: References ───────────────────────────────── */}
        <div style={sectionStyle}>
          <h3 style={headingStyle}>5. References</h3>
          {references.map((ref, idx) => (
            <div key={idx} style={{ marginBottom: idx < 2 ? 20 : 0, paddingBottom: idx < 2 ? 20 : 0, borderBottom: idx < 2 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.dim, marginBottom: 12 }}>Reference {idx + 1}</div>
              <div style={gridTwo}>
                <Field label="Company" value={ref.company} onChange={v => updateRef(idx, 'company', v)} />
                <Field label="Contact Name" value={ref.contact_name} onChange={v => updateRef(idx, 'contact_name', v)} />
                <Field label="Phone" value={ref.phone} onChange={v => updateRef(idx, 'phone', v)} type="tel" />
                <Field label="Email" value={ref.email} onChange={v => updateRef(idx, 'email', v)} type="email" />
                <Field label="Project Name" value={ref.project_name} onChange={v => updateRef(idx, 'project_name', v)} />
                <Field label="Project Value ($)" value={ref.project_value} onChange={v => updateRef(idx, 'project_value', v)} type="number" />
                <Field label="Year Completed" value={ref.year_completed} onChange={v => updateRef(idx, 'year_completed', v)} type="number" />
              </div>
            </div>
          ))}
        </div>

        {/* ── Section 6: Insurance Summary ────────────────────────── */}
        <div style={sectionStyle}>
          <h3 style={headingStyle}>6. Insurance Summary</h3>
          <div style={gridTwo}>
            <Field label="GL Carrier" value={gl_carrier} onChange={setGlCarrier} />
            <Field label="GL Expiry" value={gl_expiry} onChange={setGlExpiry} type="date" />
            <Field label="GL Limit ($)" value={gl_limit} onChange={setGlLimit} type="number" />
            <Field label="WC Carrier" value={wc_carrier} onChange={setWcCarrier} />
            <Field label="WC Expiry" value={wc_expiry} onChange={setWcExpiry} type="date" />
            <Field label="Auto Carrier" value={auto_carrier} onChange={setAutoCarrier} />
            <Field label="Auto Expiry" value={auto_expiry} onChange={setAutoExpiry} type="date" />
            <Field label="Umbrella Limit ($)" value={umbrella_limit} onChange={setUmbrellaLimit} type="number" />
          </div>
        </div>

        {/* ── Section 7: Document Uploads ─────────────────────────── */}
        <div style={sectionStyle}>
          <h3 style={headingStyle}>7. Document Uploads</h3>
          <p style={{ color: T.dim, fontSize: 13, marginBottom: 16, marginTop: 0 }}>
            Provide URLs to your uploaded documents. File upload functionality coming in a future update.
          </p>
          <div style={gridTwo}>
            <Field label="W-9 URL" value={w9_url} onChange={setW9Url} type="url" />
            <Field label="License Certificate URL" value={license_cert_url} onChange={setLicenseCertUrl} type="url" />
            <Field label="Insurance Certificate URL" value={insurance_cert_url} onChange={setInsuranceCertUrl} type="url" />
            <Field label="Financial Statement URL" value={financial_statement_url} onChange={setFinancialUrl} type="url" />
            <Field label="Safety Program URL" value={safety_program_url} onChange={setSafetyProgramUrl} type="url" />
            <Field label="OSHA Logs URL" value={osha_logs_url} onChange={setOshaLogsUrl} type="url" />
          </div>
        </div>

        {/* ── Section 8: Certification & Submit ──────────────────── */}
        <div style={sectionStyle}>
          <h3 style={headingStyle}>8. Certification &amp; Submit</h3>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
            <input
              type="checkbox"
              id="certify"
              checked={certify}
              onChange={e => setCertify(e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 2, accentColor: T.gold }}
            />
            <label htmlFor="certify" style={{ color: T.text, fontSize: 14, lineHeight: 1.6, cursor: 'pointer' }}>
              I certify that all information provided in this prequalification application is accurate and complete to the best of my knowledge.
            </label>
          </div>
          <button
            type="submit"
            disabled={!certify || submitting}
            style={{
              width: '100%',
              padding: '14px 24px',
              fontSize: 16,
              fontWeight: 600,
              color: '#000',
              background: certify && !submitting ? T.gold : T.border,
              border: 'none',
              borderRadius: T.radius,
              cursor: certify && !submitting ? 'pointer' : 'not-allowed',
              opacity: certify && !submitting ? 1 : 0.5,
              transition: 'all 0.2s',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Prequalification Application'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Reusable Field Component ──────────────────────────────────────── */
function Field({
  label, value, onChange, type = 'text', required, step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        step={step}
        style={inputStyle}
        placeholder={label.replace(' *', '')}
      />
    </div>
  );
}
