import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [portalType, token] = path;
  const db = createServerClient();

  try {
    // GET /api/portals/owner/:token
    if (portalType === 'owner' && token) {
      const { data } = await db.from('pay_applications').select('*, projects(*)').eq('owner_approval_token', token).single();
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const pa = data as any;
      return NextResponse.json({
        approval: {
          amount: pa.current_payment_due || 0,
          title: `Pay Application #${pa.app_number}`,
          project: pa.projects?.name || 'Project',
        },
        payApp: pa,
        project: pa.projects,
      });
    }

    // GET /api/portals/sub/:token
    if (portalType === 'sub' && token && path.length === 2) {
      const { data } = await db.from('bid_package_invites').select('*, bid_packages(*, projects(*), bid_package_items(*))').eq('token', token).single();
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const invite = data as any;
      const pkg = invite.bid_packages;
      return NextResponse.json({
        package: {
          ...pkg,
          projectName: pkg?.projects?.name,
          items: pkg?.bid_package_items || [],
          invite: { status: invite.status },
        },
      });
    }

    // GET /api/portals/w9/:token — handled by specific route file
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [portalType, token, subPath] = path;
  const db = createServerClient();

  try {
    // POST /api/portals/owner/:token
    // Live pay_applications columns: status, approval_notes. owner_notes ->
    // approval_notes. NOTE: there is no owner_approval_token column in the live
    // schema, so this lookup cannot resolve a row — see flagged item.
    if (portalType === 'owner' && token) {
      const body = await req.json();
      const { decision, notes } = body;
      const newStatus = decision === 'approved' ? 'certified' : 'draft';
      await must(db.from('pay_applications').update({ status: newStatus, approval_notes: notes }).eq('owner_approval_token', token), 'pay_applications update');
      return NextResponse.json({ success: true });
    }

    // POST /api/portals/sub/:token/lien-waiver
    // Live lien_waivers columns: status, signed_at, signature_method, token.
    // There is no sign_token column (use token) and no signature_data column
    // (the captured signature payload is recorded as signature_method='portal'
    // rather than stored as data, since there is no jsonb column for it).
    if (portalType === 'sub' && token && subPath === 'lien-waiver') {
      await req.json().catch(() => ({}));
      const { error: writeErr } = await db.from('lien_waivers').update({ status: 'signed', signed_at: new Date().toISOString(), signature_method: 'portal' }).eq('token', token);
      // This route answers success right after. A rejected write used to
      // vanish — supabase-js returns { error } rather than throwing.
      if (writeErr) { console.error('[portals/lien-waiver-sign]', writeErr); throw writeErr; }
      return NextResponse.json({ success: true });
    }

    // POST /api/portals/w9/:token — handled by specific route file
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
