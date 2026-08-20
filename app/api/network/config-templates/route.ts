import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/config-templates?manufacturer=Cisco&device_type=switch
 * List network config templates filtered by manufacturer and/or device_type.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const manufacturer = searchParams.get('manufacturer');
    const deviceType = searchParams.get('device_type');

    const db = createServerClient();

    let query = db
      .from('network_config_templates')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('name', { ascending: true });

    if (manufacturer) query = query.ilike('manufacturer', `%${manufacturer}%`);
    if (deviceType) query = query.eq('device_type', deviceType);

    const { data, error } = await query;
    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/config-templates
 * Create a config template.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      name, manufacturer, device_type, template_content,
      variables, category,
    } = body;

    if (!name) return badRequest('name is required');
    if (!template_content) return badRequest('template_content is required');
    if (!manufacturer) return badRequest('manufacturer is required');
    if (!device_type) return badRequest('device_type is required');

    const db = createServerClient();

    // Extract variable placeholders from template: {{variable_name}}
    const detectedVars = [...new Set(
      (template_content.match(/\{\{(\w+)\}\}/g) || []).map((m: string) => m.replace(/\{\{|\}\}/g, ''))
    )];

    const { data, error } = await db
      .from('network_config_templates')
      .insert({
        tenant_id: user.tenantId,
        name,
        manufacturer,
        device_type,
        template_content,
        variables: variables || detectedVars,
        category: category || 'general',
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
