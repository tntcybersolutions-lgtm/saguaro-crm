import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { loadAutomationRules, logSageActivity } from '@/lib/sage-brain';
import { apiError } from '@/lib/api-error';

/**
 * R18 — Consent-first automation rules.
 * GET    → all non-revoked rules for this user (visible in Sage settings).
 * POST   → create a rule (this IS the explicit GC approval).
 * PATCH  → toggle enabled on/off.
 * DELETE → revoke permanently (?id=...). Kept in the table for the audit trail.
 *
 * Every mutation is written to the Sage activity trail.
 * Tolerant of 064_sage_brain.sql not being applied yet — mutations then return
 * an honest 503 instead of pretending to succeed.
 */

const MIGRATION_NOTE =
  'Automation rules storage is not migrated yet (064_sage_brain.sql). Rules cannot be saved until the migration is applied.';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rules = await loadAutomationRules(user.id);
  return NextResponse.json({ rules });
}

interface CreateRuleBody {
  title?: string;
  description?: string;
  trigger_type?: string;
  action_type?: string;
  config?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: CreateRuleBody = await req.json();
    if (!body.title?.trim() || !body.trigger_type?.trim() || !body.action_type?.trim()) {
      return NextResponse.json(
        { error: 'title, trigger_type, and action_type are required' },
        { status: 400 }
      );
    }
    const db = createServerClient();
    let created: { id: string } | null = null;
    try {
      const { data, error } = await (db as any)
        .from('sage_automation_rules')
        .insert({
          user_id: user.id,
          tenant_id: user.tenantId,
          title: body.title.trim().slice(0, 200),
          description: body.description?.trim().slice(0, 1000) ?? null,
          trigger_type: body.trigger_type.trim().slice(0, 100),
          action_type: body.action_type.trim().slice(0, 100),
          config: body.config ?? {},
          enabled: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      created = data as { id: string };
    } catch {
      return NextResponse.json({ error: MIGRATION_NOTE }, { status: 503 });
    }

    await logSageActivity({
      userId: user.id,
      tenantId: user.tenantId,
      actor: 'user',
      ruleId: created?.id ?? null,
      actionType: 'rule_created',
      summary: `Automation rule approved by GC: "${body.title.trim()}" (trigger: ${body.trigger_type}, action: ${body.action_type}).`,
      detail: { config: body.config ?? {} },
    });

    const rules = await loadAutomationRules(user.id);
    return NextResponse.json({ ok: true, id: created?.id, rules });
  } catch (e) {
    return apiError('sage/rules POST', e, 'Failed to create rule');
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: { id?: string; enabled?: boolean } = await req.json();
    if (!body.id || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'id and enabled are required' }, { status: 400 });
    }
    const db = createServerClient();
    try {
      const { error } = await (db as any)
        .from('sage_automation_rules')
        .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
        .eq('id', body.id)
        .eq('user_id', user.id);
      if (error) throw error;
    } catch {
      return NextResponse.json({ error: MIGRATION_NOTE }, { status: 503 });
    }

    await logSageActivity({
      userId: user.id,
      tenantId: user.tenantId,
      actor: 'user',
      ruleId: body.id,
      actionType: body.enabled ? 'rule_enabled' : 'rule_disabled',
      summary: `Automation rule turned ${body.enabled ? 'on' : 'off'} by GC.`,
    });

    const rules = await loadAutomationRules(user.id);
    return NextResponse.json({ ok: true, rules });
  } catch (e) {
    return apiError('sage/rules PATCH', e, 'Failed to update rule');
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const db = createServerClient();
    try {
      const { error } = await (db as any)
        .from('sage_automation_rules')
        .update({
          enabled: false,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    } catch {
      return NextResponse.json({ error: MIGRATION_NOTE }, { status: 503 });
    }

    await logSageActivity({
      userId: user.id,
      tenantId: user.tenantId,
      actor: 'user',
      ruleId: id,
      actionType: 'rule_revoked',
      summary: 'Automation rule revoked by GC. Sage no longer has this authority.',
    });

    const rules = await loadAutomationRules(user.id);
    return NextResponse.json({ ok: true, rules });
  } catch (e) {
    return apiError('sage/rules DELETE', e, 'Failed to revoke rule');
  }
}
