import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * Crews API — web parity with the mobile Crews screen (app/crews.tsx).
 * Two tables, one route:
 *   crews        — the crew header (name / foreman / trade / status / notes)
 *   crew_members — the roster (person_name / role / trade), one per crew
 *
 * GET  ?archived=1 flips the list to archived crews (deleted_at stamped).
 * POST is branch-dispatched on the body shape so the page needs one endpoint:
 *   {name,...}                          create a crew
 *   {crewId, name?,...}                 update the crew header
 *   {crewId, archive:true|restore:true} stamp / clear deleted_at
 *   {crewId, addMember:{personName,..}} insert a roster row
 *   {removeMemberId}                    soft-remove a roster row
 *
 * crews/crew_members are newer than the generated DB types — (db as any) is
 * the house idiom for tables the stale typegen doesn't know yet.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const { projectId } = await params;
  try {
    const db = createServerClient() as any;
    const archived = new URL(req.url).searchParams.get('archived') === '1';

    let q = db
      .from('crews')
      .select('id, tenant_id, project_id, name, foreman_name, foreman_id, trade, status, notes, created_at, updated_at, deleted_at')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('name', { ascending: true });
    q = archived ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
    const { data: crews, error } = await q;
    if (error) throw error;

    const rows = (crews ?? []) as any[];
    const ids = rows.map((c) => c.id);

    // Single batched roster query across every visible crew — never N+1.
    const membersByCrew: Record<string, any[]> = {};
    if (ids.length > 0) {
      const { data: members, error: mErr } = await db
        .from('crew_members')
        .select('id, crew_id, person_name, role, trade, created_at')
        .in('crew_id', ids)
        .eq('tenant_id', user.tenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (mErr) throw mErr;
      for (const m of (members ?? []) as any[]) {
        (membersByCrew[m.crew_id] ||= []).push({
          id: m.id, person_name: m.person_name, role: m.role, trade: m.trade,
        });
      }
    }

    return NextResponse.json({
      crews: rows.map((c) => ({
        ...c,
        memberCount: (membersByCrew[c.id] ?? []).length,
        members: membersByCrew[c.id] ?? [],
      })),
    });
  } catch (e: any) {
    return apiError('projects/[projectId]/crews GET', e, 'Failed to load crews');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { projectId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const db = createServerClient() as any;

    // ── Roster: remove a member (soft — stamps deleted_at, re-stamp is a no-op) ──
    if (body.removeMemberId) {
      const { error } = await db
        .from('crew_members')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', body.removeMemberId)
        .eq('tenant_id', user.tenantId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // Every remaining branch operates on one crew — verify it belongs to this
    // tenant + project once, up front (also supplies the trade default below).
    if (body.crewId) {
      const { data: crew, error: cErr } = await db
        .from('crews')
        .select('id, trade')
        .eq('id', body.crewId)
        .eq('tenant_id', user.tenantId)
        .eq('project_id', projectId)
        .single();
      if (cErr || !crew) return NextResponse.json({ error: 'Crew not found' }, { status: 404 });

      // ── Roster: add a member (trade defaults to the crew's trade) ──
      if (body.addMember) {
        const personName = String(body.addMember.personName ?? '').trim();
        if (!personName) return NextResponse.json({ error: 'Member name is required' }, { status: 400 });
        const { data: member, error } = await db
          .from('crew_members')
          .insert({
            tenant_id: user.tenantId,
            crew_id: crew.id,
            person_name: personName,
            role: String(body.addMember.role ?? '').trim() || null,
            trade: String(body.addMember.trade ?? '').trim() || crew.trade || null,
          })
          .select('id, crew_id, person_name, role, trade, created_at')
          .single();
        if (error) throw error;
        return NextResponse.json({ success: true, member });
      }

      // ── Archive / restore ──
      if (body.archive === true || body.restore === true) {
        const { error } = await db
          .from('crews')
          .update({ deleted_at: body.archive === true ? new Date().toISOString() : null })
          .eq('id', crew.id)
          .eq('tenant_id', user.tenantId);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      // ── Update the crew header ──
      const fields: Record<string, any> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) {
        const nm = String(body.name ?? '').trim();
        if (!nm) return NextResponse.json({ error: 'Crew name is required' }, { status: 400 });
        fields.name = nm;
      }
      if (body.foremanName !== undefined) fields.foreman_name = String(body.foremanName ?? '').trim() || null;
      if (body.trade !== undefined) fields.trade = String(body.trade ?? '').trim() || null;
      if (body.status !== undefined) fields.status = String(body.status ?? '').trim() || 'active';
      if (body.notes !== undefined) fields.notes = String(body.notes ?? '').trim() || null;
      const { data: updated, error } = await db
        .from('crews')
        .update(fields)
        .eq('id', crew.id)
        .eq('tenant_id', user.tenantId)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, crew: updated });
    }

    // ── Create a crew ──
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Crew name is required' }, { status: 400 });
    const { data: created, error } = await db
      .from('crews')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        name,
        foreman_name: String(body.foremanName ?? '').trim() || null,
        trade: String(body.trade ?? '').trim() || null,
        status: String(body.status ?? '').trim() || 'active',
        notes: String(body.notes ?? '').trim() || null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, crew: created });
  } catch (e: any) {
    return apiError('projects/[projectId]/crews POST', e, 'Failed to save crew');
  }
}
