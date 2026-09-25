import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const url = new URL(req.url);
    const module = url.searchParams.get('module');
    // The module tabs in the UI map to the `entity_type` column (there is no
    // `module` column). Filtering the nonexistent column silently errored the
    // whole read and returned an empty list for every module.
    let q = supabase.from('custom_field_definitions').select('*').eq('tenant_id', user.tenantId);
    if (module) q = q.eq('entity_type', module);
    const { data, error } = await q.order('sort_order');
    if (error) throw error;
    return NextResponse.json({ fields: data ?? [] });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no custom fields" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('custom-fields', e, 'Could not load custom fields');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();

    // The custom-fields UI issues deletes as POST { id, _delete:true }. Actually
    // remove the definition (tenant-scoped) instead of inserting a garbage row.
    if (body._delete === true && body.id) {
      const { error: delErr } = await supabase
        .from('custom_field_definitions')
        .delete()
        .eq('id', body.id as string)
        .eq('tenant_id', user.tenantId);
      if (delErr) throw delErr;
      return NextResponse.json({ success: true, deleted: true });
    }

    // Reorder — UI issues POST { _reorder:true, module, order:[id,...] }.
    // Persist the new sort_order per field (tenant-scoped) instead of inserting
    // a garbage row that silently no-ops the drag.
    if (body._reorder === true && Array.isArray(body.order)) {
      const ids = (body.order as unknown[]).filter(
        (x): x is string => typeof x === 'string',
      );
      for (let i = 0; i < ids.length; i++) {
        const { error: upErr } = await supabase
          .from('custom_field_definitions')
          .update({ sort_order: i })
          .eq('id', ids[i])
          .eq('tenant_id', user.tenantId);
        if (upErr) throw upErr;
      }
      return NextResponse.json({ success: true, reordered: ids.length });
    }

    const entityType = body.entity_type ?? body.module;

    // Update — the UI edit form and the active toggle both POST { id, ... }.
    // Previously the route ignored `id` and INSERTed a duplicate (edit) or a
    // garbage row (toggle) — the real record never changed. Build a partial
    // patch from the keys actually present so a toggle only touches is_active.
    if (body.id) {
      const patch: Record<string, unknown> = {};
      if (entityType !== undefined) patch.entity_type = entityType;
      if (body.field_name !== undefined) patch.field_name = body.field_name;
      if (body.field_label !== undefined) patch.field_label = body.field_label;
      if (body.field_type !== undefined) patch.field_type = body.field_type || 'text';
      if (body.options !== undefined) patch.options = body.options || [];
      if (body.required !== undefined) patch.required = body.required;
      if (body.default_value !== undefined) patch.default_value = body.default_value || null;
      if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
      if (body.is_active !== undefined) patch.is_active = body.is_active;
      if (body.validation !== undefined) patch.validation = body.validation ?? null;
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .update(patch)
        .eq('id', body.id as string)
        .eq('tenant_id', user.tenantId)
        .select()
        .single();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Field not found' }, { status: 404 });
      return NextResponse.json({ field: data });
    }

    const { data, error } = await supabase.from('custom_field_definitions').insert({
      tenant_id: user.tenantId, entity_type: entityType, field_name: body.field_name,
      field_label: body.field_label, field_type: body.field_type || 'text',
      options: body.options || [], required: body.required || false,
      default_value: body.default_value || null, sort_order: body.sort_order || 0,
      is_active: body.is_active ?? true, validation: body.validation ?? null,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ field: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[custom-fields]', e);
    const msg = "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
