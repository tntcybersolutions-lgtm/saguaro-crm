import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response';

/**
 * POST /api/network/generate-config
 * Takes template_id + variables object, renders template by replacing
 * {{variable}} placeholders, saves to network_generated_configs,
 * returns rendered config text.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { template_id, variables, device_id, network_project_id, name } = body;

    if (!template_id) return badRequest('template_id is required');
    if (!variables || typeof variables !== 'object') {
      return badRequest('variables object is required');
    }
    const vars = variables as Record<string, string>;

    const db = createServerClient();

    // Fetch the template
    const { data: template, error: tmplErr } = await db
      .from('network_config_templates')
      .select('*')
      .eq('id', template_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (tmplErr || !template) return notFound('Config template not found');

    // Render the template by replacing {{variable}} placeholders
    let renderedConfig = template.template_content;
    const usedVars: Record<string, string> = {};
    const missingVars: string[] = [];

    // Find all placeholders in template
    const placeholders: string[] = [...new Set(
      (renderedConfig.match(/\{\{(\w+)\}\}/g) || []).map((m: string) => m.replace(/\{\{|\}\}/g, ''))
    )] as string[];

    for (const varName of placeholders) {
      if (vars[varName] !== undefined && vars[varName] !== null) {
        const value = String(vars[varName]);
        renderedConfig = renderedConfig.replace(
          new RegExp(`\\{\\{${varName}\\}\\}`, 'g'),
          value
        );
        usedVars[varName] = value;
      } else {
        missingVars.push(String(varName));
      }
    }

    // Save the generated config
    const { data: saved, error: saveErr } = await db
      .from('network_generated_configs')
      .insert({
        tenant_id: user.tenantId,
        network_project_id: network_project_id || null,
        template_id,
        device_id: device_id || null,
        config_content: renderedConfig,
        variables_used: usedVars,
        applied_by: user.id,
        notes: name || `${template.name} - ${new Date().toLocaleDateString()}`,
      })
      .select()
      .single();

    if (saveErr) throw saveErr;

    return ok({
      id: saved.id,
      rendered_config: renderedConfig,
      template_name: template.name,
      variables_used: usedVars,
      missing_variables: missingVars,
    }, 201);
  } catch (err) {
    return serverError(err);
  }
}
