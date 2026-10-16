import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';
import {
  normalizeLineItems, proposalTotal, effectiveStatus, PROPOSAL_COLUMNS, type LooseDb, type ProposalRow,
} from '@/lib/proposal-esign';

export const runtime = 'nodejs';

/**
 * /api/leads/[id]/proposals — the proposal on a deal, before it is a job.
 * GET  → the deal's proposals (newest first), each with its total and the
 *        state of its latest signing link.
 * POST → a new draft: { title?, line_items[], introduction?, scope?,
 *        payment_terms?, exclusions?, valid_until? }.
 * Sales:View / Sales:Edit; tenant from getUser(); the deal's ownership is
 * checked before anything is read or written.
 */
async function ownLead(db: LooseDb, id: string, tenantId: string) {
  const { data, error } = await db.from('lead_pipeline').select('id, company_name, contact_name, email, project_id')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return data as { id: string; company_name: string | null; contact_name: string | null; email: string | null; project_id: string | null } | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Sales', 'View');
  if (!g.ok) return g.res;
  const { id } = await params;
  try {
    const db = createServerClient() as LooseDb;
    if (!(await ownLead(db, id, g.user.tenantId))) return apiFail('Deal not found', 404);
    const { data, error } = await db.from('proposals').select(PROPOSAL_COLUMNS)
      .eq('lead_id', id).eq('tenant_id', g.user.tenantId).order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []) as ProposalRow[];
    const ids = rows.map((p) => p.id);
    const latest = new Map<string, Record<string, unknown>>();
    if (ids.length) {
      const { data: reqs, error: rErr } = await db.from('proposal_signatures')
        .select('id, proposal_id, status, expires_at, sent_at, viewed_at, signed_at, signed_name, declined_at, decline_reason, voided_at, on_sign, signer_name, signer_email')
        .in('proposal_id', ids).eq('tenant_id', g.user.tenantId).order('sent_at', { ascending: false });
      if (rErr) throw rErr;
      for (const r of (reqs || []) as Array<Record<string, unknown> & { proposal_id: string; status: string; expires_at: string }>) {
        if (!latest.has(r.proposal_id)) latest.set(r.proposal_id, { ...r, status: effectiveStatus(r) });
      }
    }
    return NextResponse.json({
      proposals: rows.map((p) => {
        const lines = normalizeLineItems(p.line_items);
        return { ...p, line_items: lines, total: proposalTotal(lines, p.total_amount ?? p.amount), latest_request: latest.get(p.id) ?? null };
      }),
    });
  } catch (e) {
    return apiError('leads/proposals GET', e, "Could not load this deal's proposals.");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiFail('Send a JSON body.', 400);
  try {
    const db = createServerClient() as LooseDb;
    const lead = await ownLead(db, id, g.user.tenantId);
    if (!lead) return apiFail('Deal not found', 404);
    const lines = normalizeLineItems(body.line_items);
    const amount = proposalTotal(lines, body.amount);
    const t = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const validUntil = typeof body.valid_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.valid_until) ? body.valid_until : null;
    const { count, error: cErr } = await db.from('proposals').select('id', { count: 'exact', head: true }).eq('lead_id', id).eq('tenant_id', g.user.tenantId);
    if (cErr) throw cErr;
    const { data, error } = await db.from('proposals').insert({
      tenant_id: g.user.tenantId,
      lead_id: id,
      project_id: lead.project_id,
      created_by: g.user.id,
      status: 'draft',
      title: t(body.title, 200) || `Proposal for ${lead.company_name || lead.contact_name || 'your project'}`,
      proposal_number: `v${(Number(count) || 0) + 1}.0`,
      line_items: lines,
      amount,
      total_amount: amount,
      introduction: t(body.introduction, 5000),
      description: t(body.scope, 20000),
      payment_terms: t(body.payment_terms, 5000),
      exclusions: t(body.exclusions, 5000),
      valid_until: validUntil,
      client_name: lead.contact_name,
      client_email: lead.email,
      client_company: lead.company_name,
    }).select(PROPOSAL_COLUMNS).single();
    if (error) throw error;
    return NextResponse.json({ proposal: { ...data, line_items: lines, total: amount, latest_request: null } }, { status: 201 });
  } catch (e) {
    return apiError('leads/proposals POST', e, 'Could not create the proposal.');
  }
}
