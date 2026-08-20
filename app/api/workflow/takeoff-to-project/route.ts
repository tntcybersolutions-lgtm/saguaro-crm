import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * POST /api/workflow/takeoff-to-project
 *
 * COMPLETE WORKFLOW: Takes a completed takeoff and:
 * 1. Creates a project (if not already linked)
 * 2. Creates budget_lines from takeoff_materials (CSI codes)
 * 3. Auto-generates bid packages grouped by trade/CSI division
 * 4. Matches subcontractors by trade from the sub database
 * 5. Creates bid_package_invites for matched subs
 * 6. Queues bid invite emails
 *
 * Input: { takeoff_id: string, project_name?: string, project_address?: string }
 * Returns: { project, budget_lines, bid_packages, invites_sent }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { takeoff_id, project_name, project_address } = await req.json();
    if (!takeoff_id) return NextResponse.json({ error: 'takeoff_id is required' }, { status: 400 });

    const db = createServerClient();

    // ── Step 1: Get takeoff + materials ─────────────────────────────
    // All takeoff APIs use the 'takeoffs' table (FK: takeoff_materials.takeoff_id → takeoffs.id)
    const { data: takeoff, error: tErr } = await db
      .from('takeoffs')
      .select('*, takeoff_materials(*)')
      .eq('id', takeoff_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (tErr || !takeoff) {
      return NextResponse.json({ error: 'Takeoff not found', details: tErr?.message }, { status: 404 });
    }

    const takeoffData = takeoff as any;
    const materials: any[] = takeoffData?.takeoff_materials || [];

    // ── Step 2: Create or link project ──────────────────────────────
    let projectId = takeoffData.project_id;

    if (!projectId) {
      const { data: project, error: pErr } = await db
        .from('projects')
        .insert({
          tenant_id: user.tenantId,
          name: project_name || takeoffData.project_name || takeoffData.name || 'New Project',
          address: project_address || '',
          status: 'pre_construction',
          project_type: takeoffData.building_type || 'commercial',
          contract_value: takeoffData.total_cost || 0,
          created_by: user.id,
        })
        .select()
        .single();

      if (pErr) return NextResponse.json({ error: 'Failed to create project', details: pErr.message }, { status: 500 });
      projectId = (project as any).id;

      // Link takeoff to project
      await db.from('takeoffs').update({ project_id: projectId }).eq('id', takeoff_id).eq('tenant_id', user.tenantId);
    }

    // ── Step 3: Create budget lines from materials ──────────────────
    // Group materials by CSI division (first 2 digits of code)
    const divisions: Record<string, { items: any[]; total: number }> = {};

    for (const mat of materials) {
      const code = mat.csi_code || mat.cost_code || '00';
      const division = code.substring(0, 2);
      if (!divisions[division]) divisions[division] = { items: [], total: 0 };
      divisions[division].items.push(mat);
      divisions[division].total += mat.total_cost || 0;
    }

    const budgetLines = Object.entries(divisions).map(([div, data], idx) => ({
      tenant_id: user.tenantId,
      project_id: projectId,
      cost_code: div + ' 00 00',
      division: div,
      description: getCSIDivisionName(div),
      original_budget: data.total,
      revised_budget: data.total,
      committed: 0,
      actual: 0,
      projected: data.total,
      variance: 0,
      percent_complete: 0,
      sort_order: idx,
    }));

    if (budgetLines.length > 0) {
      const { error: blErr } = await db.from('budget_lines').insert(budgetLines);
      if (blErr) {
        console.error('Budget lines insert error:', blErr.message);
        // Continue workflow — budget lines are not blocking
      }
    }

    // ── Step 4: Create bid packages by trade ────────────────────────
    const bidPackages: any[] = [];

    for (const [div, data] of Object.entries(divisions)) {
      const tradeName = getCSIDivisionName(div);
      const { data: bp, error: bpErr } = await db
        .from('bid_packages')
        .insert({
          tenant_id: user.tenantId,
          project_id: projectId,
          name: `${tradeName} — Bid Package`,
          description: `Scope: ${data.items.map(i => i.description || i.name).join(', ').slice(0, 500)}`,
          trade: tradeName,
          scope_of_work: `CSI Division ${div}: ${data.items.map(i => i.description || i.name).join('; ').slice(0, 1000)}`,
          budget_estimate: data.total,
          status: 'open',
          due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
          created_by: user.id,
        })
        .select()
        .single();

      if (bp) {
        bidPackages.push(bp);

        // Create line items for the bid package
        const lineItems = data.items.map((item, idx) => ({
          bid_package_id: (bp as any).id,
          tenant_id: user.tenantId,
          description: `${item.csi_code ? `[${item.csi_code}] ` : ''}${item.description || item.name || 'Material'}`,
          quantity: item.quantity || 1,
          unit: item.unit || 'LS',
          estimated_cost: item.total_cost || item.unit_cost || 0,
          sort_order: idx,
        }));

        if (lineItems.length > 0) {
          await db.from('bid_package_items').insert(lineItems);
        }
      }
    }

    // ── Step 5: Match subcontractors by trade ────────────────────────
    let totalInvites = 0;
    const invitedSubs: any[] = [];

    for (const bp of bidPackages) {
      const bpData = bp as any;
      const trade = bpData.trade || '';

      // Find subs that match this trade in the tenant's sub database
      const { data: matchedSubs } = await db
        .from('subcontractors')
        .select('id, company_name, email, trade, contact_name')
        .eq('tenant_id', user.tenantId)
        .or(`trade.ilike.%${trade.replace(/[^a-zA-Z0-9 ]/g, '')}%`)
        .limit(10);

      if (matchedSubs && matchedSubs.length > 0) {
        for (const sub of matchedSubs) {
          const subData = sub as any;
          if (!subData.email) continue;

          // Create bid invite
          const inviteToken = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

          const { data: invite } = await db
            .from('bid_package_invites')
            .insert({
              tenant_id: user.tenantId,
              bid_package_id: bpData.id,
              sub_id: subData.id,
              sub_email: subData.email,
              sub_name: subData.company_name,
              trade: subData.trade || trade,
              token: inviteToken,
              status: 'pending',
              invited_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (invite) {
            totalInvites++;
            invitedSubs.push({
              company: subData.company_name,
              email: subData.email,
              trade: subData.trade,
              bid_package: bpData.name,
            });

            // ── Step 6: Queue bid invite email ──────────────────────
            try {
              const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net'}/portals/sub/${inviteToken}`;

              // Dynamic import to avoid issues if email module not configured
              const emailModule = await import('@/lib/email');
              if (typeof emailModule.sendEmail === 'function') {
                await emailModule.sendEmail({
                  to: subData.email,
                  subject: `Bid Invitation — ${bpData.name}`,
                  html: `
                    <h2>You've Been Invited to Bid</h2>
                    <p>Hello ${subData.contact_name || subData.company_name},</p>
                    <p>You have been invited to submit a bid for:</p>
                    <table style="border-collapse:collapse;width:100%;margin:16px 0">
                      <tr><td style="padding:8px;border:1px solid #E2E5EA;font-weight:bold">Project</td><td style="padding:8px;border:1px solid #E2E5EA">${project_name || takeoffData.project_name || 'Construction Project'}</td></tr>
                      <tr><td style="padding:8px;border:1px solid #E2E5EA;font-weight:bold">Trade</td><td style="padding:8px;border:1px solid #E2E5EA">${trade}</td></tr>
                      <tr><td style="padding:8px;border:1px solid #E2E5EA;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #E2E5EA">${bpData.due_date}</td></tr>
                      <tr><td style="padding:8px;border:1px solid #E2E5EA;font-weight:bold">Estimated Value</td><td style="padding:8px;border:1px solid #E2E5EA">$${(bpData.budget_estimate || 0).toLocaleString()}</td></tr>
                    </table>
                    <p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#C8960F;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold">View & Submit Bid →</a></p>
                    <p style="color:#8B9DB8;font-size:12px">Powered by Saguaro CRM</p>
                  `,
                });
              }
            } catch {
              // Email is best-effort — don't fail the workflow
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      project_id: projectId,
      budget_lines_created: budgetLines.length,
      bid_packages_created: bidPackages.length,
      invites_sent: totalInvites,
      invited_subs: invitedSubs,
      message: `Project created with ${budgetLines.length} budget lines, ${bidPackages.length} bid packages, and ${totalInvites} sub invites sent.`,
    });

  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

/**
 * Map CSI division codes to trade names.
 */
function getCSIDivisionName(division: string): string {
  const CSI_DIVISIONS: Record<string, string> = {
    '00': 'General Requirements',
    '01': 'General Requirements',
    '02': 'Existing Conditions',
    '03': 'Concrete',
    '04': 'Masonry',
    '05': 'Metals / Structural Steel',
    '06': 'Wood / Plastics / Composites',
    '07': 'Thermal & Moisture Protection',
    '08': 'Openings (Doors & Windows)',
    '09': 'Finishes (Drywall, Paint, Flooring)',
    '10': 'Specialties',
    '11': 'Equipment',
    '12': 'Furnishings',
    '13': 'Special Construction',
    '14': 'Conveying Equipment (Elevators)',
    '21': 'Fire Suppression',
    '22': 'Plumbing',
    '23': 'HVAC',
    '25': 'Integrated Automation',
    '26': 'Electrical',
    '27': 'Communications / Low Voltage',
    '28': 'Electronic Safety & Security',
    '31': 'Earthwork',
    '32': 'Exterior Improvements',
    '33': 'Utilities',
    '34': 'Transportation',
    '35': 'Waterway & Marine',
    '40': 'Process Integration',
    '41': 'Material Processing',
    '42': 'Process Heating',
    '43': 'Process Gas',
    '44': 'Pollution Control',
    '46': 'Water & Wastewater',
    '48': 'Electrical Power Generation',
  };
  return CSI_DIVISIONS[division] || `Division ${division}`;
}
