import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/alerts?network_project_id=xxx&resolved=false
 * List network alerts, filter by resolved/unresolved.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const networkProjectId = searchParams.get('network_project_id');
    const resolved = searchParams.get('resolved');

    const db = createServerClient();

    let query = db
      .from('network_alerts')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (networkProjectId) query = query.eq('network_project_id', networkProjectId);
    if (resolved === 'true') query = query.eq('resolved', true);
    if (resolved === 'false') query = query.eq('resolved', false);

    const { data, error } = await query;
    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/alerts
 * Create an alert.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      network_project_id, alert_type, severity, title,
      message, device_id, related_entity_type, related_entity_id,
    } = body;

    if (!network_project_id) return badRequest('network_project_id is required');
    if (!title) return badRequest('title is required');
    if (!alert_type) return badRequest('alert_type is required');

    const db = createServerClient();

    // Verify project belongs to tenant
    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', network_project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    const { data, error } = await db
      .from('network_alerts')
      .insert({
        tenant_id: user.tenantId,
        network_project_id,
        alert_type,
        severity: severity || 'info',
        title,
        message: message || '',
        device_id: device_id || null,
        related_entity_type: related_entity_type || null,
        related_entity_id: related_entity_id || null,
        resolved: false,
        acknowledged: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * PATCH /api/network/alerts
 * Acknowledge or resolve an alert. Body: { id, acknowledged?, resolved? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { id, acknowledged, resolved } = body;

    if (!id) return badRequest('id is required');

    const db = createServerClient();

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (acknowledged !== undefined) {
      updates.acknowledged = acknowledged;
      if (acknowledged) updates.acknowledged_at = new Date().toISOString();
      updates.acknowledged_by = user.id;
    }

    if (resolved !== undefined) {
      updates.resolved = resolved;
      if (resolved) updates.resolved_at = new Date().toISOString();
      updates.resolved_by = user.id;
    }

    const { data, error } = await db
      .from('network_alerts')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return badRequest('Alert not found');

    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}
