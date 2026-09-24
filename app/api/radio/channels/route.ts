import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createNotification } from '@/lib/notifications';
import { must } from '@/lib/db-write';

/**
 * Saguaro Radio — talkgroups.
 * GET ?projectId= — list the caller's channels (org-wide + this project's).
 *   Auto-creates the project's "All Hands" talkgroup on first touch (subs
 *   allowed — approved scope) and auto-joins the caller. Each channel carries
 *   `project_name` so the rail can tell four "All Hands" rows apart. The list
 *   response also carries `patches` — the tenant's live channel patches — so
 *   the dispatch patch board needs no extra GET.
 * GET ?roster=channelId — that channel's member roster (display_name,
 *   call_sign, presence_status, role, last_seen_at). Members only.
 * GET ?directory=1 — member-picker source: tenant staff (project_team,
 *   profiles fallback) + portal-sub identities (sessions + radio history).
 * POST { name, projectId?, allowSubs? } — create a custom talkgroup.
 * POST { channelId, addUserId, memberRole? } — add a staff member (dedupes;
 *   notifies them). POST { channelId, addPortalSubId, displayName? } — add a
 *   portal sub. POST { removeMemberId } — drop a member row (a channel always
 *   keeps at least one member).
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const db = g.db as any, t = g.user.tenantId, uid = g.user.id;
  try {
    // ── Roster: one channel's members (dispatch console member panel) ──
    const rosterId = req.nextUrl.searchParams.get('roster');
    if (rosterId) {
      const { data: me } = await db.from('radio_members').select('id').eq('tenant_id', t).eq('channel_id', rosterId).eq('user_id', uid).limit(1);
      if (!me || me.length === 0) return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 });
      const { data: mem, error } = await db.from('radio_members')
        .select('id, user_id, portal_sub_id, display_name, call_sign, presence_status, role, last_seen_at')
        .eq('tenant_id', t).eq('channel_id', rosterId)
        .order('display_name', { ascending: true });
      if (error) throw error;
      return NextResponse.json({ members: mem || [] });
    }

    // ── Directory: the member-picker source (tenant staff + portal subs) ──
    if (req.nextUrl.searchParams.get('directory') === '1') {
      const [{ data: team }, { data: profs }, { data: subMems }, { data: subSessions }] = await Promise.all([
        db.from('project_team').select('user_id, name, email, role').eq('tenant_id', t).not('user_id', 'is', null),
        db.from('profiles').select('id, full_name, email, role').eq('tenant_id', t),
        db.from('radio_members').select('portal_sub_id, display_name').eq('tenant_id', t).not('portal_sub_id', 'is', null),
        db.from('portal_sub_sessions').select('sub_id, sub_company, sub_contact_name').eq('tenant_id', t),
      ]);
      const staff = new Map<string, { userId: string; name: string; role: string | null }>();
      for (const m of (team || []) as any[]) if (m.user_id && !staff.has(m.user_id)) staff.set(m.user_id, { userId: m.user_id, name: m.name || m.email || 'Team member', role: m.role ?? null });
      for (const p of (profs || []) as any[]) if (!staff.has(p.id)) staff.set(p.id, { userId: p.id, name: p.full_name || p.email || 'Team member', role: p.role ?? null });
      const subs = new Map<string, { portalSubId: string; name: string }>();
      for (const s of (subSessions || []) as any[]) if (s.sub_id && !subs.has(s.sub_id)) subs.set(s.sub_id, { portalSubId: s.sub_id, name: s.sub_company || s.sub_contact_name || 'Subcontractor' });
      for (const m of (subMems || []) as any[]) if (m.portal_sub_id && !subs.has(m.portal_sub_id)) subs.set(m.portal_sub_id, { portalSubId: m.portal_sub_id, name: m.display_name || 'Subcontractor' });
      return NextResponse.json({ staff: [...staff.values()], subs: [...subs.values()] });
    }

    const projectId = req.nextUrl.searchParams.get('projectId');

    if (projectId) {
      // Ensure the project talkgroup exists (idempotent via unique constraint).
      const { data: existing } = await db.from('radio_channels').select('id').eq('tenant_id', t).eq('project_id', projectId).eq('kind', 'project').limit(1);
      if (!existing || existing.length === 0) {
        await must(db.from('radio_channels').insert({ tenant_id: t, project_id: projectId, kind: 'project', name: 'All Hands', allow_subs: true, created_by: uid } as never), 'radio_channels insert');
      }
    }

    let q = db.from('radio_channels').select('id, project_id, name, kind, allow_subs, locked, priority, created_at').eq('tenant_id', t).is('deleted_at', null);
    if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
    const { data: channels, error } = await q.order('created_at', { ascending: true });
    if (error) throw error;
    const list = (channels || []) as any[];

    // Project names ride along — without them the rail shows four identical
    // "All Hands" rows with no way to tell which job is talking.
    const projIds = [...new Set(list.map((c) => c.project_id).filter(Boolean))];
    const projNames = new Map<string, string>();
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id, name').in('id', projIds).eq('tenant_id', t);
      for (const p of (projs || []) as any[]) projNames.set(p.id, p.name);
    }

    // ONE members query across every listed channel: caller auto-join,
    // per-channel headcount, and live presence (last_seen_at within 90s)
    // all come out of the same rows.
    const ids = list.map((c) => c.id);
    let allMembers: any[] = [];
    if (ids.length) {
      const { data: mem } = await db.from('radio_members').select('channel_id, user_id, monitoring, role, last_seen_at, last_read_at').eq('tenant_id', t).in('channel_id', ids);
      allMembers = (mem || []) as any[];
      const joined = new Set(allMembers.filter((m) => m.user_id === uid).map((m) => m.channel_id));
      const lockedIds = new Set(list.filter((c: any) => c.locked).map((c: any) => c.id));
      const toJoin = ids.filter((id) => !joined.has(id) && !lockedIds.has(id));
      if (toJoin.length) {
        await must(db.from('radio_members').insert(toJoin.map((channel_id) => ({ channel_id, tenant_id: t, user_id: uid, display_name: g.user.email || null })) as never), 'radio_members insert');
        for (const id of toJoin) allMembers.push({ channel_id: id, user_id: uid, monitoring: true, role: 'member', last_seen_at: null, last_read_at: null });
      }
    }
    const memMap = new Map(allMembers.filter((m) => m.user_id === uid).map((m) => [m.channel_id, m]));
    const ONLINE_WINDOW_MS = 90 * 1000;
    const nowMs = Date.now();

    // Last message + unread count per channel (small N — fine per channel).
    const enriched = await Promise.all(list.map(async (c) => {
      const mine = memMap.get(c.id) as any;
      let unreadQ = db.from('radio_messages').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('channel_id', c.id);
      if (mine?.last_read_at) unreadQ = unreadQ.gt('created_at', mine.last_read_at);
      const [{ data: last }, { count: unread }] = await Promise.all([
        db.from('radio_messages').select('kind, body, sender_name, created_at, audio_duration_secs').eq('tenant_id', t).eq('channel_id', c.id).order('created_at', { ascending: false }).limit(1),
        unreadQ,
      ]);
      const chMembers = allMembers.filter((m) => m.channel_id === c.id);
      const onChannel = chMembers.filter((m) => m.last_seen_at && nowMs - new Date(m.last_seen_at).getTime() <= ONLINE_WINDOW_MS).length;
      const lm = (last || [])[0] as any;
      return {
        ...c,
        project_name: c.project_id ? projNames.get(c.project_id) ?? null : null,
        members: chMembers.length,
        onChannel,
        unread: Math.min(unread ?? 0, 99),
        monitoring: mine?.monitoring ?? true,
        lastMessage: lm ? { kind: lm.kind, body: lm.body, sender: lm.sender_name, at: lm.created_at, secs: lm.audio_duration_secs } : null,
      };
    }));

    // Locked (dispatcher-invite-only) channels are invisible to non-members.
    const visible = enriched.filter((c: any) => !c.locked || memMap.has(c.id));

    // Live patches ride along for the dispatch patch board.
    const { data: livePatches } = await db.from('radio_channel_patches')
      .select('id, channel_a, channel_b, created_at')
      .eq('tenant_id', t).is('released_at', null);
    return NextResponse.json({ channels: visible, patches: livePatches || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const db = g.db as any, t = g.user.tenantId;
  try {
    const body = await req.json().catch(() => ({}));

    // ── Member profile: call sign + presence status (GroupTalk parity) ──
    if (body.profile) {
      const patch: Record<string, unknown> = {};
      if (typeof body.profile.callSign === 'string') patch.call_sign = body.profile.callSign.trim().slice(0, 24) || null;
      if (['available', 'busy', 'on_route', 'off'].includes(body.profile.presenceStatus)) patch.presence_status = body.profile.presenceStatus;
      if (Object.keys(patch).length) {
        await must(db.from('radio_members').update(patch as never).eq('tenant_id', t).eq('user_id', g.user.id), 'radio_members update');
      }
      return NextResponse.json({ ok: true });
    }

    // ── Direct 1:1 channel (deduped by sorted pair key) ──
    if (body.directToUserId) {
      const pair = [g.user.id, String(body.directToUserId)].sort().join(':');
      const { data: existing } = await db.from('radio_channels').select('id, name').eq('tenant_id', t).eq('direct_key', pair).maybeSingle();
      if (existing) return NextResponse.json({ channel: existing });
      const dname = String(body.directToName || 'Direct').trim().slice(0, 60);
      const { data: ch, error } = await db.from('radio_channels').insert({
        tenant_id: t, project_id: body.projectId ?? null, kind: 'direct',
        name: dname, allow_subs: false, direct_key: pair, created_by: g.user.id,
      } as never).select().single();
      if (error) throw error;
      await must(db.from('radio_members').insert([
        { channel_id: (ch as any).id, tenant_id: t, user_id: g.user.id, display_name: g.user.email || null },
        { channel_id: (ch as any).id, tenant_id: t, user_id: body.directToUserId, display_name: dname },
      ] as never), 'radio_members insert');
      return NextResponse.json({ channel: ch }, { status: 201 });
    }

    // ── Patch / release (GroupTalk group patching) ──
    if (body.patch) {
      const { a, b, release } = body.patch;
      if (!a || !b || a === b) return NextResponse.json({ error: 'patch needs two distinct channels' }, { status: 400 });
      const [ca, cb] = [a, b].sort();
      if (release) {
        await must(db.from('radio_channel_patches').update({ released_at: new Date().toISOString() } as never)
          .eq('tenant_id', t).eq('channel_a', ca).eq('channel_b', cb).is('released_at', null), 'radio_channel_patches update');
        return NextResponse.json({ ok: true, released: true });
      }
      const { data: ex } = await db.from('radio_channel_patches').select('id, released_at').eq('tenant_id', t).eq('channel_a', ca).eq('channel_b', cb).maybeSingle();
      if (ex && !(ex as any).released_at) return NextResponse.json({ ok: true, already: true });
      if (ex) await must(db.from('radio_channel_patches').update({ released_at: null, created_by: g.user.id, created_at: new Date().toISOString() } as never).eq('id', (ex as any).id), 'radio_channel_patches update');
      else await must(db.from('radio_channel_patches').insert({ tenant_id: t, channel_a: ca, channel_b: cb, created_by: g.user.id } as never), 'radio_channel_patches insert');
      return NextResponse.json({ ok: true, patched: true }, { status: 201 });
    }

    // ── Priority channel toggle (interrupts scanning first) ──
    if (body.priorityChannelId != null) {
      await must(db.from('radio_channels').update({ priority: body.priority === true } as never)
        .eq('id', body.priorityChannelId).eq('tenant_id', t), 'radio_channels update');
      return NextResponse.json({ ok: true });
    }

    // ── Lock/unlock (dispatcher-invite-only groups) ──
    if (body.lockChannelId != null) {
      await must(db.from('radio_channels').update({ locked: body.locked === true } as never)
        .eq('id', body.lockChannelId).eq('tenant_id', t), 'radio_channels update');
      return NextResponse.json({ ok: true });
    }

    // ── Member management: add staff / add portal sub / remove (roster panel) ──
    if (body.channelId && (body.addUserId || body.addPortalSubId)) {
      const { data: ch } = await db.from('radio_channels').select('id, name').eq('tenant_id', t).eq('id', body.channelId).maybeSingle();
      if (!ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
      if (body.addUserId) {
        const { data: ex } = await db.from('radio_members').select('id').eq('tenant_id', t).eq('channel_id', body.channelId).eq('user_id', body.addUserId).limit(1);
        if (ex && ex.length) return NextResponse.json({ ok: true, already: true });
        // Display name: project_team first, profiles fallback.
        let displayName: string | null = null;
        const { data: pt } = await db.from('project_team').select('name, email').eq('tenant_id', t).eq('user_id', body.addUserId).limit(1);
        if (pt && pt.length) displayName = (pt[0] as any).name || (pt[0] as any).email || null;
        if (!displayName) {
          const { data: prof } = await db.from('profiles').select('full_name, email').eq('tenant_id', t).eq('id', body.addUserId).maybeSingle();
          displayName = (prof as any)?.full_name || (prof as any)?.email || null;
        }
        await must(db.from('radio_members').insert({
          channel_id: body.channelId, tenant_id: t, user_id: body.addUserId,
          display_name: displayName, role: body.memberRole === 'dispatcher' ? 'dispatcher' : 'member',
        } as never), 'radio_members insert');
        await createNotification(t, body.addUserId, 'radio_added', `Added to ${(ch as any).name}`,
          `${g.user.email || 'A dispatcher'} added you to the ${(ch as any).name} talkgroup.`,
          `/app/radio?channel=${body.channelId}`);
        return NextResponse.json({ ok: true, added: true }, { status: 201 });
      }
      const { data: exSub } = await db.from('radio_members').select('id').eq('tenant_id', t).eq('channel_id', body.channelId).eq('portal_sub_id', body.addPortalSubId).limit(1);
      if (exSub && exSub.length) return NextResponse.json({ ok: true, already: true });
      await must(db.from('radio_members').insert({
        channel_id: body.channelId, tenant_id: t, portal_sub_id: body.addPortalSubId,
        display_name: String(body.displayName || 'Subcontractor').trim().slice(0, 60) || 'Subcontractor',
      } as never), 'radio_members insert');
      return NextResponse.json({ ok: true, added: true }, { status: 201 });
    }

    if (body.removeMemberId) {
      const { data: row } = await db.from('radio_members').select('id, channel_id').eq('tenant_id', t).eq('id', body.removeMemberId).maybeSingle();
      if (!row) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
      const { count } = await db.from('radio_members').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('channel_id', (row as any).channel_id);
      if ((count ?? 0) <= 1) return NextResponse.json({ error: 'A channel needs at least one member' }, { status: 400 });
      await must(db.from('radio_members').delete().eq('tenant_id', t).eq('id', body.removeMemberId), 'radio_members delete');
      return NextResponse.json({ ok: true, removed: true });
    }

    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const { data, error } = await db.from('radio_channels').insert({
      tenant_id: t, project_id: body.projectId ?? null, kind: 'custom', name,
      allow_subs: body.allowSubs === true, created_by: g.user.id,
    } as never).select().single();
    if (error) throw error;
    await must(db.from('radio_members').insert({ channel_id: (data as any).id, tenant_id: t, user_id: g.user.id, display_name: g.user.email || null, role: 'dispatcher' } as never), 'radio_members insert');
    return NextResponse.json({ channel: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
