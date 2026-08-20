'use client'
import { useState } from 'react'

const BG = '#0d1117', CARD = '#161b22', BORDER = '#30363d'
const GOLD = '#C8960F', TEXT = '#e6edf3', DIM = '#8b949e'
const GREEN = '#22c55e', RED = '#ef4444', BLUE = '#3B82F6'

interface PortalPkg {
  id: string; name: string; trade: string | null; csi_division: string | null;
  estimated_value: number | null; bid_due_date: string | null;
  bid_validity_days: number | null; requires_bond: boolean | null;
  insurance_required_amount: number | null; scope_narrative: string | null;
  work_included: string | null; work_excluded: string | null;
  instructions_to_bidders: string | null; qualification_criteria: string | null;
  jacket_pdf_url: string | null;
}

interface Props {
  pkg: PortalPkg
  project: Record<string, unknown>
  token: string
}

type FormState = {
  companyName: string; licenseNumber: string; contactName: string;
  contactEmail: string; contactPhone: string; baseBid: string;
  alternate1: string; alternate2: string; exclusions: string;
  inclusions: string; clarifications: string; bidBondIncluded: boolean;
  certifiedAccurate: boolean; readBidDocuments: boolean;
}

const initForm: FormState = {
  companyName: '', licenseNumber: '', contactName: '',
  contactEmail: '', contactPhone: '', baseBid: '',
  alternate1: '', alternate2: '', exclusions: '',
  inclusions: '', clarifications: '', bidBondIncluded: false,
  certifiedAccurate: false, readBidDocuments: false,
}

export default function BidPortalClient({ pkg, project, token }: Props) {
  const [form, setForm] = useState<FormState>(initForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    confirmation_number: string; company_name: string;
    base_bid: number; package_name: string; project_name: string;
  } | null>(null)

  const set = (k: keyof FormState, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }))

  const validate = (): string | null => {
    if (!form.companyName.trim()) return 'Company name is required'
    if (!form.licenseNumber.trim()) return 'License number is required'
    if (!form.contactName.trim()) return 'Contact name is required'
    if (!form.contactEmail.trim() || !form.contactEmail.includes('@')) return 'Valid email is required'
    const bid = parseFloat(form.baseBid)
    if (!bid || bid <= 0) return 'Base bid must be greater than $0'
    if (!form.exclusions.trim()) return 'Exclusions are required'
    if (!form.certifiedAccurate) return 'You must certify this bid is accurate'
    if (!form.readBidDocuments) return 'You must confirm you have read all bid documents'
    if (pkg.requires_bond && !form.bidBondIncluded) return 'Bid bond is required for this package'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setSubmitting(true); setError('')
    try {
      const r = await fetch(`/api/bid-portal/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          licenseNumber: form.licenseNumber.trim(),
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.contactPhone.trim(),
          baseBid: parseFloat(form.baseBid),
          alternate1: form.alternate1 ? parseFloat(form.alternate1) : undefined,
          alternate2: form.alternate2 ? parseFloat(form.alternate2) : undefined,
          exclusions: form.exclusions.trim(),
          inclusions: form.inclusions.trim() || undefined,
          clarifications: form.clarifications.trim() || undefined,
          bidBondIncluded: form.bidBondIncluded,
          certifiedAccurate: form.certifiedAccurate,
          readBidDocuments: form.readBidDocuments,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Submission failed')
      setResult(data)
    } catch (e: unknown) {
      setError((e as Error).message || 'Submission failed')
    } finally { setSubmitting(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: BG,
    border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT,
    fontSize: 14, outline: 'none',
  }
  const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: DIM, display: 'block',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em',
  }

  // ── SUCCESS STATE ──────────────────────────────────────
  if (result) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 500, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: GREEN, marginBottom: 8 }}>Bid Received</h1>
          <p style={{ fontSize: 14, color: DIM, marginBottom: 24 }}>Your bid has been submitted successfully.</p>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, textAlign: 'left' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><span style={label}>Confirmation</span><div style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontFamily: 'monospace' }}>{result.confirmation_number}</div></div>
              <div><span style={label}>Company</span><div style={{ color: TEXT }}>{result.company_name}</div></div>
              <div><span style={label}>Base Bid</span><div style={{ color: TEXT, fontWeight: 700 }}>${result.base_bid.toLocaleString()}</div></div>
              <div><span style={label}>Package</span><div style={{ color: TEXT }}>{result.package_name}</div></div>
              <div><span style={label}>Project</span><div style={{ color: TEXT }}>{result.project_name}</div></div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: DIM, marginTop: 16 }}>A confirmation email has been sent to {form.contactEmail}</p>
          <button onClick={() => window.print()} style={{
            marginTop: 16, padding: '10px 24px', background: 'transparent',
            border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM,
            cursor: 'pointer', fontSize: 13,
          }}>🖨 Print Confirmation</button>
        </div>
      </div>
    )
  }

  // ── FORM ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '20px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', padding: '24px 0 20px', borderBottom: `1px solid ${BORDER}`, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6 }}>
            🏗 Saguaro CRM · Bid Invitation
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{pkg.name}</div>
          <div style={{ fontSize: 14, color: DIM, marginTop: 4 }}>{project.name as string}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)', gap: 24 }}>
          {/* LEFT — Package Details */}
          <div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
                Bid Package Details
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {pkg.trade && <div><span style={label}>Trade</span><div style={{ color: TEXT }}>{pkg.trade}</div></div>}
                {pkg.csi_division && <div><span style={label}>Division</span><div style={{ color: TEXT }}>{pkg.csi_division}</div></div>}
                {pkg.bid_due_date && <div><span style={label}>Due Date</span><div style={{ color: TEXT, fontWeight: 600 }}>{new Date(pkg.bid_due_date).toLocaleDateString()}</div></div>}
                <div><span style={label}>Bond Required</span><div style={{ color: pkg.requires_bond ? RED : GREEN }}>{pkg.requires_bond ? 'Yes' : 'No'}</div></div>
                {pkg.estimated_value && <div><span style={label}>Estimated Value</span><div style={{ color: TEXT }}>${pkg.estimated_value.toLocaleString()}</div></div>}
                {!!project.address && <div><span style={label}>Location</span><div style={{ color: TEXT, fontSize: 13 }}>{String(project.address)}{project.city ? `, ${String(project.city)}` : ''} {String(project.state || '')}</div></div>}
              </div>
              {pkg.scope_narrative && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
                  <span style={label}>Scope</span>
                  <div style={{ color: DIM, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                    {pkg.scope_narrative}
                  </div>
                </div>
              )}
              {pkg.jacket_pdf_url && (
                <a href={pkg.jacket_pdf_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: 16, padding: '10px 14px', background: 'rgba(59,130,246,0.08)',
                    border: `1px solid ${BLUE}33`, borderRadius: 8, color: BLUE, fontSize: 13,
                    fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                  📄 Download Bid Jacket
                </a>
              )}
            </div>
          </div>

          {/* RIGHT — Submission Form */}
          <div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 20 }}>Submit Your Bid</div>

              {error && (
                <div style={{ padding: '10px 14px', background: `${RED}15`, border: `1px solid ${RED}40`,
                  borderRadius: 8, color: RED, fontSize: 13, marginBottom: 16 }}>{error}</div>
              )}

              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div><span style={label}>Company Name *</span><input value={form.companyName} onChange={e => set('companyName', e.target.value)} style={inp} placeholder="ABC Electric Inc." /></div>
                  <div><span style={label}>License Number *</span><input value={form.licenseNumber} onChange={e => set('licenseNumber', e.target.value)} style={inp} placeholder="ROC-123456" /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div><span style={label}>Contact Name *</span><input value={form.contactName} onChange={e => set('contactName', e.target.value)} style={inp} placeholder="John Smith" /></div>
                  <div><span style={label}>Contact Email *</span><input type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} style={inp} placeholder="john@abc-electric.com" /></div>
                </div>
                <div><span style={label}>Contact Phone</span><input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} style={inp} placeholder="(602) 555-0100" /></div>

                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div><span style={label}>Base Bid $ *</span><input type="number" value={form.baseBid} onChange={e => set('baseBid', e.target.value)} style={inp} placeholder="0.00" /></div>
                    <div><span style={label}>Alternate 1 $</span><input type="number" value={form.alternate1} onChange={e => set('alternate1', e.target.value)} style={inp} placeholder="Optional" /></div>
                    <div><span style={label}>Alternate 2 $</span><input type="number" value={form.alternate2} onChange={e => set('alternate2', e.target.value)} style={inp} placeholder="Optional" /></div>
                  </div>
                </div>

                <div><span style={label}>Exclusions *</span><textarea value={form.exclusions} onChange={e => set('exclusions', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="What is NOT included in your bid..." /></div>
                <div><span style={label}>Inclusions</span><textarea value={form.inclusions} onChange={e => set('inclusions', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="What IS included beyond the spec..." /></div>
                <div><span style={label}>Clarifications / Assumptions</span><textarea value={form.clarifications} onChange={e => set('clarifications', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Any clarifications or assumptions..." /></div>

                {pkg.requires_bond && (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', padding: '10px 14px', background: `${RED}08`, border: `1px solid ${RED}22`, borderRadius: 8 }}>
                    <input type="checkbox" checked={form.bidBondIncluded} onChange={e => set('bidBondIncluded', e.target.checked)} />
                    <span style={{ color: TEXT, fontSize: 13 }}>Bid bond is included with this submission</span>
                  </label>
                )}

                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, display: 'grid', gap: 10 }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.certifiedAccurate} onChange={e => set('certifiedAccurate', e.target.checked)} style={{ marginTop: 3 }} />
                    <span style={{ color: TEXT, fontSize: 13, lineHeight: 1.5 }}>I certify that this bid is accurate and valid for {pkg.bid_validity_days || 30} days from the date of submission.</span>
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.readBidDocuments} onChange={e => set('readBidDocuments', e.target.checked)} style={{ marginTop: 3 }} />
                    <span style={{ color: TEXT, fontSize: 13, lineHeight: 1.5 }}>I have read and understand all bid documents, drawings, and specifications for this package.</span>
                  </label>
                </div>

                <button onClick={handleSubmit} disabled={submitting}
                  style={{
                    width: '100%', padding: '14px', background: submitting ? `${GOLD}66` : `linear-gradient(135deg, ${GOLD}, #F0C040)`,
                    border: 'none', borderRadius: 10, color: BG,
                    fontSize: 15, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer',
                    marginTop: 4,
                  }}>
                  {submitting ? '⟳ Submitting...' : 'Submit Bid →'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 11, color: '#484f58' }}>
          Powered by Saguaro CRM · Secure bid submission
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          div[style*="gridTemplateColumns: minmax(0, 340px)"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="gridTemplateColumns: 1fr 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="gridTemplateColumns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
