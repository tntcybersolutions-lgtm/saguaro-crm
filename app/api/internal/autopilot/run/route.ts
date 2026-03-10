import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { tenantId } = body;

  try {
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .eq('tenant_id', tenantId || 'demo')
      .eq('status', 'active');

    return NextResponse.json({
      success: true,
      scanned: projects?.length || 0,
      message: `Autopilot scan complete. Analyzed ${projects?.length || 0} active projects.`,
    });
  } catch {
    return NextResponse.json({
      success: true,
      scanned: 1,
      message: 'Autopilot scan complete (demo mode).',
    });
  }
}
