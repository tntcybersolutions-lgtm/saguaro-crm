import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PUBLIC, token-gated prequalification portal API. No session — the opaque
 * 256-bit token IS the capability. The tenant is ALWAYS derived from the invite
 * row, never from client input, so a submission can only ever land in the tenant
 * that issued the invite.
 */

type Question = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  category?: string;
  points?: number;
  scoringKey?: Record<string, number>;
};

/** Pull the question list out of a template row (or a legacy form row). */
function questionsFrom(row: any): Question[] {
  if (!row) return [];
  const q = row.questions ?? row.form_data?.questions ?? [];
  return Array.isArray(q) ? q : [];
}

/** Deterministic score: earned points per answered/qualifying question. */
function scoreAnswers(questions: Question[], answers: Record<string, any>): { score: number; max: number } {
  let score = 0;
  let max = 0;
  for (const q of questions) {
    const pts = Number(q.points ?? 0) || 0;
    max += pts;
    const a = answers?.[q.id];
    const answered = a !== undefined && a !== null && String(a).trim() !== '';
    if (!answered) continue;
    if (q.scoringKey && typeof q.scoringKey === 'object' && q.scoringKey[String(a)] !== undefined) {
      score += Number(q.scoringKey[String(a)]) || 0;
    } else if (q.type === 'yes_no') {
      score += String(a).toLowerCase() === 'yes' ? pts : 0;
    } else if (q.type === 'rating') {
      const r = Math.max(0, Math.min(5, Number(a) || 0));
      score += Math.round((r / 5) * pts);
    } else {
      // text / number / multi_choice / file_upload: providing the info earns it
      score += pts;
    }
  }
  return { score, max };
}

async function loadInvite(token: string) {
  const db = createServerClient();
  const { data } = await db
    .from('prequalification_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  return { db, invite: data as any };
}

async function companyName(db: ReturnType<typeof createServerClient>, tenantId: string): Promise<string> {
  const { data } = await db
    .from('tenants')
    .select('company_name, name')
    .eq('id', tenantId)
    .maybeSingle();
  const t = data as { company_name?: string; name?: string } | null;
  return t?.company_name || t?.name || 'the General Contractor';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const { db, invite } = await loadInvite(token);
    if (!invite) return NextResponse.json({ error: 'This prequalification link is no longer valid.' }, { status: 404 });

    // Load the template (or a legacy form) for this invite's tenant.
    let templateRow: any = null;
    if (invite.template_id) {
      const { data: tpl } = await db
        .from('prequalification_templates')
        .select('*')
        .eq('id', invite.template_id)
        .eq('tenant_id', invite.tenant_id)
        .maybeSingle();
      templateRow = tpl;
      if (!templateRow) {
        const { data: form } = await db
          .from('prequalification_forms')
          .select('*')
          .eq('id', invite.template_id)
          .eq('tenant_id', invite.tenant_id)
          .maybeSingle();
        templateRow = form;
      }
    }

    // Has this invite already been submitted?
    const { data: existing } = await db
      .from('prequalification_submissions')
      .select('id')
      .eq('invite_id', invite.id)
      .maybeSingle();
    const alreadySubmitted = !!existing || invite.status === 'completed';

    // Mark opened (first view only) — status update is the source of truth and
    // works today; opened_at is a best-effort enhancement column (see migration).
    if (!alreadySubmitted && (invite.status === 'sent' || invite.status === 'pending' || !invite.status)) {
      await must(db.from('prequalification_invites').update({ status: 'opened' }).eq('id', invite.id), 'prequalification_invites update');
      // opened_at may not exist yet (migration not applied) — never let it break the load.
      try {
        await must((db as any).from('prequalification_invites').update({ opened_at: new Date().toISOString() }).eq('id', invite.id), 'prequalification_invites update');
      } catch { /* column not present yet — ignore */ }
    }

    return NextResponse.json({
      invite: {
        subName: invite.sub_name || '',
        subEmail: invite.sub_email || '',
        status: alreadySubmitted ? 'completed' : (invite.status || 'opened'),
        companyName: await companyName(db, invite.tenant_id),
      },
      template: templateRow
        ? {
            id: templateRow.id,
            name: templateRow.name || 'Prequalification Questionnaire',
            description: templateRow.description || '',
            questions: questionsFrom(templateRow),
          }
        : null,
      submitted: alreadySubmitted,
    });
  } catch (e) {
    return apiError('prequalification/portal/[token] GET', e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = await req.json();
    const { db, invite } = await loadInvite(token);
    if (!invite) return NextResponse.json({ error: 'This prequalification link is no longer valid.' }, { status: 404 });

    // Block double-submit.
    const { data: existing } = await db
      .from('prequalification_submissions')
      .select('id')
      .eq('invite_id', invite.id)
      .maybeSingle();
    if (existing || invite.status === 'completed') {
      return NextResponse.json({ error: 'This prequalification has already been submitted.' }, { status: 409 });
    }

    const answers: Record<string, any> = (body?.answers && typeof body.answers === 'object') ? body.answers : {};
    const documents: any[] = Array.isArray(body?.documents) ? body.documents : [];

    // Load template for scoring + required-field validation.
    let questions: Question[] = [];
    if (invite.template_id) {
      const { data: tpl } = await db
        .from('prequalification_templates')
        .select('questions')
        .eq('id', invite.template_id)
        .eq('tenant_id', invite.tenant_id)
        .maybeSingle();
      questions = questionsFrom(tpl);
      if (questions.length === 0) {
        const { data: form } = await db
          .from('prequalification_forms')
          .select('form_data')
          .eq('id', invite.template_id)
          .eq('tenant_id', invite.tenant_id)
          .maybeSingle();
        questions = questionsFrom(form);
      }
    }

    // Server-side required validation (don't trust the client).
    const missing = questions
      .filter(q => q.required)
      .filter(q => {
        const a = answers[q.id];
        return a === undefined || a === null || String(a).trim() === '';
      })
      .map(q => q.label);
    if (missing.length > 0) {
      return NextResponse.json({ error: `Please answer all required questions: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` }, { status: 400 });
    }

    const { score, max } = scoreAnswers(questions, answers);

    // tenant_id is derived from the invite — NEVER from the request body.
    const { error: insErr } = await db
      .from('prequalification_submissions')
      .insert({
        tenant_id: invite.tenant_id,
        invite_id: invite.id,
        sub_id: invite.sub_id || null,
        template_id: invite.template_id || null,
        vendor_name: invite.sub_name || (body?.vendorName ?? null),
        vendor_email: invite.sub_email || null,
        answers,
        documents,
        score,
        max_score: String(max),
        status: 'submitted',
      } as Database['public']['Tables']['prequalification_submissions']['Insert']);
    if (insErr) throw insErr;

    // Mark the invite responded.
    await must(db
      .from('prequalification_invites')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', invite.id), 'prequalification_invites write');

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('prequalification/portal/[token] POST', e);
  }
}
