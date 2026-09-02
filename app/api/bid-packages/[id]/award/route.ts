import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onBidAwarded } from '@/lib/triggers';
import { requirePermission } from '@/lib/permissions';
import { must, tryWrite } from '@/lib/db-write';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();

    // ── COMPLIANCE GATE: no award to a sub with no W-9 or lapsed insurance.
    //    Soft gate — body.overrideCompliance = true proceeds (and is returned in
    //    the result); query failures fail OPEN so schema drift can't block awards. ──
    if (!body.overrideCompliance) {
      try {
        const { data: subRow } = await db.from('bid_submissions').select('sub_id').eq('id', body.submissionId).eq('tenant_id', user.tenantId).single();
        const subId = (subRow as { sub_id?: string | null } | null)?.sub_id;
        if (subId) {
          const issues: string[] = [];
          const { data: subRec } = await db.from('subcontractors').select('w9_on_file').eq('id', subId).maybeSingle();
          if (subRec && (subRec as { w9_on_file?: boolean | null }).w9_on_file !== true) issues.push('W-9 not on file');
          const { data: certs } = await db.from('insurance_certificates').select('expiry_date, status').eq('sub_id', subId);
          if (certs && certs.length > 0) {
            const valid = (certs as { expiry_date: string | null; status: string | null }[]).some(
              (c) => c.status !== 'expired' && (!c.expiry_date || new Date(c.expiry_date).getTime() > Date.now()));
            if (!valid) issues.push('Insurance certificate expired');
          }
          if (issues.length > 0) {
            return NextResponse.json({
              error: `Compliance hold — ${issues.join(', ')}. Award anyway with override, or request the documents first.`,
              complianceBlock: true,
              issues,
            }, { status: 409 });
          }
        }
      } catch (e) { console.error('award compliance gate skipped:', e); }
    }

    // Award the winning submission. Tenant-scope the write — db is the service-role
    // client (RLS bypassed), so matching by submissionId alone would let one tenant
    // award another tenant's bid submission (cross-tenant IDOR).
    await tryWrite(db.from('bid_submissions').update({ status: 'awarded', is_awarded: true, awarded_at: new Date().toISOString(), awarded_by: user.id }).eq('id', body.submissionId).eq('tenant_id', user.tenantId), 'bid_submissions update');

    // Close the package AND record the award on it (was only status before → the awarded amount
    // was then hand re-keyed into POs and the budget). Now the award writes committed cost directly.
    let poId: string | null = null;
    try {
      const { data: sub } = await db.from('bid_submissions').select('sub_id, sub_name, sub_email, company_name, contact_name, contact_email, amount, base_amount').eq('id', body.submissionId).eq('tenant_id', user.tenantId).single();
      const { data: pkg } = await db.from('bid_packages').select('tenant_id, project_id, name, trade, csi_division').eq('id', id).eq('tenant_id', user.tenantId).single();
      const amount = Number((sub?.amount ?? sub?.base_amount) || 0);
      const vendor = sub?.company_name || sub?.sub_name || sub?.contact_name || 'Awarded subcontractor';
      await must(db.from('bid_packages').update({
        status: 'awarded', awarded_amount: amount, awarded_to: vendor, awarded_to_id: sub?.sub_id ?? null,
        awarded_at: new Date().toISOString(), awarded_by: user.id,
      }).eq('id', id).eq('tenant_id', user.tenantId), 'bid_packages update');

      if (pkg && amount > 0) {
        // A DRAFT subcontract PO = the committed cost (the GC reviews it before issuing). No re-keying.
        const { data: po } = await db.from('purchase_orders').insert({
          tenant_id: pkg.tenant_id, project_id: pkg.project_id,
          vendor_name: vendor, vendor_email: sub?.sub_email || sub?.contact_email || null,
          description: `${pkg.name || 'Bid package'} — awarded subcontract`,
          subtotal: amount, total: amount, status: 'draft',
          cost_code: pkg.csi_division || pkg.trade || null,
          notes: `Auto-generated on bid award (package ${id}). Committed cost.`, created_by: user.id,
        }).select('id').single();
        poId = po?.id ?? null;
      }
    } catch (e) {
      console.error('award auto-PO failed (award still recorded):', e);
      await tryWrite(db.from('bid_packages').update({ status: 'awarded' }).eq('id', id).eq('tenant_id', user.tenantId), 'bid_packages update');
    }

    onBidAwarded(body.submissionId).catch(console.error);
    return NextResponse.json({ success: true, purchaseOrderId: poId });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
