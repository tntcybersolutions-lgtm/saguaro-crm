import { createServerClient } from '@/lib/supabase-server'
import BidPortalClient from './BidPortalClient'

export const dynamic = 'force-dynamic'

export default async function BidPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createServerClient()

  const { data: pkg, error } = await supabase
    .from('bid_packages')
    .select(`
      id, name, trade, csi_division, estimated_value,
      bid_due_date, bid_validity_days,
      requires_bond, insurance_required_amount,
      scope_narrative, work_included, work_excluded,
      instructions_to_bidders, qualification_criteria,
      sub_portal_enabled, sub_portal_expires_at,
      jacket_pdf_url, tenant_id, project_id,
      projects!inner(
        name, address, city, state, zip,
        project_type, owner_name, architect_name,
        square_footage
      )
    `)
    .eq('sub_portal_token', token)
    .single()

  if (error || !pkg) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>Bid Invitation Not Found</h1>
          <p style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.6 }}>This invitation link is invalid or has been deactivated. Please contact the general contractor for a valid link.</p>
        </div>
      </div>
    )
  }

  if (!pkg.sub_portal_enabled) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏸</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>Bid Portal Inactive</h1>
          <p style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.6 }}>This bid portal has been deactivated by the general contractor.</p>
        </div>
      </div>
    )
  }

  if (pkg.sub_portal_expires_at && new Date(pkg.sub_portal_expires_at) < new Date()) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>Bid Invitation Expired</h1>
          <p style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.6 }}>
            This invitation expired on {new Date(pkg.sub_portal_expires_at).toLocaleDateString()}.
            Contact the general contractor for a new invitation.
          </p>
        </div>
      </div>
    )
  }

  const project = (Array.isArray(pkg.projects) ? pkg.projects[0] : pkg.projects) as unknown as Record<string, unknown>

  return <BidPortalClient pkg={pkg} project={project} token={token} />
}
