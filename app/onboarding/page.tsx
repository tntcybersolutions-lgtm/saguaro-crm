'use client'
import { useState, useEffect, useRef } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

type Step = 0 | 1 | 2 | 3

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = getSupabaseBrowser()
  const [step, setStep] = useState<Step>(0)
  const [loading, setLoading] = useState(false)
  const [tenantId, setTenantId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const [company, setCompany] = useState({ name: '', phone: '', address: '', city: '', state: 'AZ', zip: '', license: '' })
  const [project, setProject] = useState({ name: '', address: '', city: '', state: 'AZ', contractValue: '', startDate: new Date().toISOString().split('T')[0], type: 'commercial' })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('tenant_id, tenants(name, company_phone, company_city, company_state, onboarding_completed, onboarding_step)')
        .eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          if (!profile) return
          setTenantId(profile.tenant_id)
          if ((profile.tenants as any)?.onboarding_completed) { router.push('/app'); return }
          const savedStep = (profile.tenants as any)?.onboarding_step || 0
          setStep(savedStep as Step)
          setCompany(c => ({ ...c, name: (profile.tenants as any)?.name || '', phone: (profile.tenants as any)?.company_phone || '', city: (profile.tenants as any)?.company_city || '', state: (profile.tenants as any)?.company_state || 'AZ' }))
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveStep = async (nextStep: number) => {
    await supabase.from('tenants').update({ onboarding_step: nextStep }).eq('id', tenantId)
  }

  const handleLogoUpload = async () => {
    if (!logoFile || !tenantId) return null
    const ext = logoFile.name.split('.').pop()
    const path = `logos/${tenantId}/logo.${ext}`
    const { error } = await supabase.storage.from('company-assets').upload(path, logoFile, { upsert: true })
    if (error) return null
    const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path)
    await supabase.from('tenants').update({ logo_url: urlData.publicUrl }).eq('id', tenantId)
    return urlData.publicUrl
  }

  const handleCompanySave = async () => {
    setLoading(true)
    await supabase.from('tenants').update({
      name: company.name,
      company_phone: company.phone,
      company_address: company.address,
      company_city: company.city,
      company_state: company.state,
      company_zip: company.zip,
      license_number: company.license,
    }).eq('id', tenantId)
    if (logoFile) await handleLogoUpload()
    await saveStep(1)
    setStep(1)
    setLoading(false)
  }

  const handleProjectSave = async () => {
    if (!project.name.trim()) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('projects').insert({
      tenant_id: tenantId,
      name: project.name,
      address: project.address,
      city: project.city,
      state: project.state,
      contract_value: project.contractValue ? Number(project.contractValue) : null,
      start_date: project.startDate,
      project_type: project.type,
      status: 'active',
      created_by: user?.id,
    })
    await saveStep(2)
    setStep(2)
    setLoading(false)
  }

  const handleFinish = async () => {
    setLoading(true)
    await supabase.from('tenants').update({ onboarding_completed: true, onboarding_step: 3 }).eq('id', tenantId)
    router.push('/app')
  }

  const STEPS = ['Company Setup', 'First Project', 'Invite Team', 'Done!']

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, color: '#e6edf3', fontSize: 14, boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8b949e', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>

      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 40, width: '100%', maxWidth: 560 }}>
        {STEPS.map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: i < step ? '#3DD68C' : i === step ? '#D4A017' : '#21262d', border: `2px solid ${i < step ? '#3DD68C' : i === step ? '#D4A017' : '#30363d'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: i <= step ? '#0d1117' : '#6e7681' }}>
                {i < step ? '\u2713' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i === step ? '#e6edf3' : '#6e7681', fontWeight: i === step ? 700 : 400, whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < step ? '#3DD68C' : '#30363d', margin: '0 8px', marginBottom: 20 }} />}
          </div>
        ))}
      </div>

      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: '40px 48px', width: '100%', maxWidth: 560 }}>

        {/* Step 0: Company */}
        {step === 0 && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Set up your company</h2>
            <p style={{ color: '#8b949e', fontSize: 14, marginBottom: 28 }}>This information appears on your documents, bids, and invoices.</p>

            {/* Logo upload */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Company Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 72, height: 72, borderRadius: 10, background: '#0d1117', border: '2px dashed #30363d', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => fileRef.current?.click()}>
                  {logoPreview ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>&#x1F3E2;</span>}
                </div>
                <div>
                  <button onClick={() => fileRef.current?.click()}
                    style={{ background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', display: 'block', marginBottom: 6 }}>
                    Upload Logo
                  </button>
                  <span style={{ fontSize: 11, color: '#6e7681' }}>PNG, JPG up to 2MB</span>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) } }} />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div><label style={labelStyle}>Company Name *</label><input style={inputStyle} value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} placeholder="Martinez Construction LLC" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={company.phone} onChange={e => setCompany(c => ({ ...c, phone: e.target.value }))} placeholder="(602) 555-0100" /></div>
                <div><label style={labelStyle}>License #</label><input style={inputStyle} value={company.license} onChange={e => setCompany(c => ({ ...c, license: e.target.value }))} placeholder="ROC-123456" /></div>
              </div>
              <div><label style={labelStyle}>Address</label><input style={inputStyle} value={company.address} onChange={e => setCompany(c => ({ ...c, address: e.target.value }))} placeholder="1234 W Main St" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>City</label><input style={inputStyle} value={company.city} onChange={e => setCompany(c => ({ ...c, city: e.target.value }))} placeholder="Phoenix" /></div>
                <div><label style={labelStyle}>State</label>
                  <select style={inputStyle} value={company.state} onChange={e => setCompany(c => ({ ...c, state: e.target.value }))}>
                    {['AZ','CA','TX','NV','NM','CO','UT','FL','GA'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>ZIP</label><input style={inputStyle} value={company.zip} onChange={e => setCompany(c => ({ ...c, zip: e.target.value }))} placeholder="85001" /></div>
              </div>
            </div>
            <button onClick={handleCompanySave} disabled={loading || !company.name.trim()}
              style={{ width: '100%', marginTop: 24, padding: 14, background: company.name ? '#D4A017' : '#21262d', color: company.name ? '#0d1117' : '#6e7681', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: company.name ? 'pointer' : 'not-allowed' }}>
              {loading ? 'Saving...' : 'Save & Continue \u2192'}
            </button>
          </>
        )}

        {/* Step 1: First Project */}
        {step === 1 && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Create your first project</h2>
            <p style={{ color: '#8b949e', fontSize: 14, marginBottom: 28 }}>You can add more projects anytime. Skip this step if you want to explore first.</p>
            <div style={{ display: 'grid', gap: 14 }}>
              <div><label style={labelStyle}>Project Name *</label><input style={inputStyle} value={project.name} onChange={e => setProject(p => ({ ...p, name: e.target.value }))} placeholder="Mesa Commerce Center Phase 2" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Project Type</label>
                  <select style={inputStyle} value={project.type} onChange={e => setProject(p => ({ ...p, type: e.target.value }))}>
                    {['commercial','residential','industrial','municipal','tenant_improvement','design_build'].map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Contract Value</label><input style={inputStyle} type="number" value={project.contractValue} onChange={e => setProject(p => ({ ...p, contractValue: e.target.value }))} placeholder="2500000" /></div>
              </div>
              <div><label style={labelStyle}>Project Address</label><input style={inputStyle} value={project.address} onChange={e => setProject(p => ({ ...p, address: e.target.value }))} placeholder="5678 E Commerce Dr" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>City</label><input style={inputStyle} value={project.city} onChange={e => setProject(p => ({ ...p, city: e.target.value }))} placeholder="Mesa" /></div>
                <div><label style={labelStyle}>Start Date</label><input style={inputStyle} type="date" value={project.startDate} onChange={e => setProject(p => ({ ...p, startDate: e.target.value }))} /></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => { saveStep(2); setStep(2) }}
                style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', borderRadius: 8, padding: '14px 20px', fontSize: 14, cursor: 'pointer' }}>
                Skip for now
              </button>
              <button onClick={handleProjectSave} disabled={loading || !project.name.trim()}
                style={{ flex: 1, padding: 14, background: project.name ? '#D4A017' : '#21262d', color: project.name ? '#0d1117' : '#6e7681', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: project.name ? 'pointer' : 'not-allowed' }}>
                {loading ? 'Creating...' : 'Create Project & Continue \u2192'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Invite Team */}
        {step === 2 && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Invite your team</h2>
            <p style={{ color: '#8b949e', fontSize: 14, marginBottom: 28 }}>Add your project managers, estimators, and field supervisors. You can always do this later in Settings.</p>
            <InviteTeamWidget tenantId={tenantId} />
            <button onClick={() => { saveStep(3); setStep(3 as Step) }}
              style={{ width: '100%', marginTop: 24, padding: 14, background: '#D4A017', color: '#0d1117', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
              Continue \u2192
            </button>
          </>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 20 }}>&#x1F389;</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 8 }}>You&apos;re all set!</h2>
            <p style={{ color: '#8b949e', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
              Your Saguaro account is ready. Your 14-day free trial gives you full access to every feature.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, textAlign: 'left' }}>
              {[
                ['\uD83D\uDCCA', 'Project Dashboard', 'All your jobs in one view'],
                ['\uD83D\uDCB0', 'Budget & Costs', 'Real-time cost tracking'],
                ['\uD83D\uDCCB', 'Bid Management', 'Win more work'],
                ['\uD83E\uDD16', 'Sage AI', 'Your construction intelligence engine'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 10, padding: '16px' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>{desc}</div>
                </div>
              ))}
            </div>
            <button onClick={handleFinish} disabled={loading}
              style={{ width: '100%', padding: 16, background: '#D4A017', color: '#0d1117', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
              {loading ? 'Loading...' : 'Open Saguaro CRM \u2192'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function InviteTeamWidget({ tenantId }: { tenantId: string }) {
  const supabase = getSupabaseBrowser()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('pm')
  const [invites, setInvites] = useState<Array<{ email: string; role: string; sent: boolean }>>([])
  const [sending, setSending] = useState(false)

  const sendInvite = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    setSending(true)
    const { data: { user } } = await supabase.auth.getUser()
    await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, tenantId, invitedBy: user?.id }),
    })
    setInvites(prev => [...prev, { email, role, sent: true }])
    setEmail('')
    setSending(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com"
          style={{ flex: 1, padding: '11px 14px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, color: '#e6edf3', fontSize: 14 }} />
        <select value={role} onChange={e => setRole(e.target.value)}
          style={{ padding: '11px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, color: '#e6edf3', fontSize: 14 }}>
          <option value="admin">Admin</option>
          <option value="pm">Project Manager</option>
          <option value="field">Field</option>
          <option value="readonly">Read Only</option>
        </select>
        <button onClick={sendInvite} disabled={sending || !email}
          style={{ padding: '11px 18px', background: '#D4A017', color: '#0d1117', border: 'none', borderRadius: 8, fontWeight: 700, cursor: email ? 'pointer' : 'not-allowed', fontSize: 14 }}>
          {sending ? '...' : 'Invite'}
        </button>
      </div>
      {invites.map((inv, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(61,214,140,.08)', border: '1px solid rgba(61,214,140,.2)', borderRadius: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>{'\u2705'}</span>
          <span style={{ fontSize: 13, color: '#e6edf3' }}>{inv.email}</span>
          <span style={{ fontSize: 11, color: '#3DD68C', marginLeft: 'auto' }}>Invite sent &middot; {inv.role}</span>
        </div>
      ))}
    </div>
  )
}
