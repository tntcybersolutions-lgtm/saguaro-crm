import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { computeHealth } from '@/lib/portfolio-health';
import { STAGE_META } from '@/lib/franchise-template';
import { requestDay } from '@/lib/time-zone';

/**
 * PUBLIC franchisee portal feed. Access control IS the unguessable token — it maps
 * to exactly one project. Every query is scoped to that token's tenant_id + project_id,
 * and only owner-safe fields are returned (no internal cost detail, no vendor POs).
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = String(params?.token || '');
    if (!token || token.length < 16) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const db = createServerClient() as any;
    const { data: tok } = await db.from('owner_portal_tokens').select('*').eq('token', token).maybeSingle();
    if (!tok || tok.is_active === false) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (tok.expires_at && Date.parse(tok.expires_at) < Date.now()) return NextResponse.json({ error: 'expired' }, { status: 410 });

    const tid = tok.tenant_id, pid = tok.project_id;
    const { data: proj } = await db.from('projects').select('*').eq('id', pid).eq('tenant_id', tid).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const [{ data: ms }, { data: verifs }] = await Promise.all([
      db.from('schedule_milestones').select('title,name,baseline_date,current_date,actual_date,status,is_critical_path').eq('tenant_id', tid).eq('project_id', pid),
      db.from('franchise_verifications').select('title,status,verified_at').eq('tenant_id', tid).eq('project_id', pid),
    ]);

    const h = computeHealth(proj);
    // "Next up" from the contractor's day (the viewer's device zone, else the company's), not the server's.
    const nowMs = Date.parse((await requestDay(_req.headers, db, tid, 'franchise/portal')).today);
    const upcoming = (ms || [])
      .map((m: any) => ({ title: m.title || m.name, date: m.actual_date || m.current_date || m.baseline_date, done: !!m.actual_date || /complete|done/i.test(String(m.status || '')) }))
      .filter((m: any) => m.date)
      .sort((a: any, b: any) => Date.parse(String(a.date)) - Date.parse(String(b.date)));
    const recentDone = upcoming.filter((m: any) => m.done).slice(-3);
    const nextUp = upcoming.filter((m: any) => !m.done && Date.parse(String(m.date)) >= nowMs).slice(0, 4);
    const verifiedRecent = (verifs || []).filter((v: any) => v.status === 'verified').slice(0, 5);

    // fire-and-forget access stamp
    db.from('owner_portal_tokens').update({ last_accessed_at: new Date().toISOString() }).eq('id', tok.id).then(() => {}, () => {});

    const stage = proj.rollout_stage ? STAGE_META[proj.rollout_stage] : null;
    return NextResponse.json({
      owner: { name: tok.owner_name || null, company: tok.owner_company || null },
      project: {
        name: proj.name, city: proj.city, state: proj.state,
        stage: stage ? stage.label : (proj.phase || null),
        status: h.status, // green/yellow/red
        percentComplete: h.percentComplete,
        targetDate: h.finishDate,
        // owner-safe budget: contract value + a status word only
        contractValue: h.budget,
        budgetStatus: h.variancePct == null ? 'on-budget' : h.variancePct > 5 ? 'over-budget' : h.variancePct > 1 ? 'watch' : 'on-budget',
        openItems: (h.openRfis || 0) + (h.openCos || 0),
      },
      milestones: { next: nextUp, recentlyCompleted: recentDone },
      verifications: verifiedRecent,
    });
  } catch {
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}
