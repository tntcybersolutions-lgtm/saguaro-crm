import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { loadAutomationRules, logSageActivity } from '@/lib/sage-brain';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/**
 * POST /api/sage/rules/run — R18 execution: "Sage auto-acts under a rule, logged."
 *
 * Iterates the caller's ENABLED, non-revoked sage_automation_rules, evaluates
 * each trigger_type against REAL rows (query patterns mirror lib/suggestions.ts),
 * and for every hit performs the rule's action_type:
 *
 *   draft_email / draft_message → a ready-to-send draft, returned to the caller
 *   AND stored on the rule's config.lastRun, AND logged to sage_activity_log
 *   with actor:'sage' ("Drafted 2 COI reminders under your rule …").
 *
 * NO actual sending — the platform has no consented send channel yet. The
 * returned drafts + the activity-trail line ARE the deliverable; the GC pastes
 * the draft into their own email client or the relevant Saguaro module.
 *
 * Supported triggers:
 *   rfi_overdue     — open RFIs past their due_date
 *   invoice_overdue — sent invoices past due with an outstanding balance
 *   coi_expiring    — active insurance certificates lapsed or expiring <30 days
 *
 * House rules honored: NUMERIC arrives as TEXT → Number() always; date-only
 * columns parsed with UTC-index math (never new Date('YYYY-MM-DD')); every
 * query is tolerant — a broken table yields zero hits for that rule, never a 500.
 */

const MAX_DRAFTS_PER_RULE = 5;

/* ── local date-only math (same contract as lib/suggestions.ts) ── */
type Ymd = { y: number; m: number; d: number };
const parseDateOnly = (s: unknown): Ymd | null => {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
const dayIndex = (p: Ymd): number => Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
const todayYmd = (): Ymd => {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
};
const ymdKey = (p: Ymd): string =>
  `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
const ymdDaysAhead = (base: Ymd, days: number): Ymd => {
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

const num = (v: unknown): number => Number(v) || 0; // NUMERIC arrives as TEXT — Number() ALWAYS
const usd = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
const plural = (n: number, s: string): string => `${n} ${s}${n === 1 ? '' : 's'}`;

/* status vocabularies (mirror lib/suggestions.ts + the CRM route) */
const INV_NOT_OWED = new Set(['paid', 'draft', 'cancelled', 'canceled', 'void', 'voided']);
const OPEN_RFI = ['open', 'pending_response', 'submitted'];

const effectiveTotal = (r: { total?: unknown; amount?: unknown; tax?: unknown }): number => {
  const t = num(r.total);
  return t !== 0 ? t : num(r.amount) + num(r.tax);
};

/** One bad table yields zero hits for that rule — never a 500. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRows(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<any[]> {
  try {
    const { data, error } = await q;
    if (error) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]) ?? [];
  } catch {
    return [];
  }
}

interface RuleDraft {
  /** What the draft addresses, in one plain sentence. */
  about: string;
  /** Suggested recipient (role or name from real data) — the GC confirms it. */
  to: string;
  /** Present for draft_email; omitted for draft_message. */
  subject?: string;
  body: string;
  projectName: string | null;
}

interface TriggerHit {
  about: string;
  to: string;
  subjectSeed: string;
  emailBody: string;
  messageBody: string;
  projectName: string | null;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const allRules = await loadAutomationRules(user.id);
    const rules = allRules.filter((r) => r.enabled);
    const ranAt = new Date().toISOString();

    if (rules.length === 0) {
      return NextResponse.json({
        ok: true,
        ranAt,
        rulesEvaluated: 0,
        results: [],
        note: allRules.length === 0
          ? 'No automation rules exist yet — approve one in chat ("Create rule") and it will run here.'
          : 'All rules are currently turned off, so nothing was evaluated.',
      });
    }

    const db = createServerClient();
    const today = todayYmd();
    const todayIdx = dayIndex(today);
    const todayKey = ymdKey(today);
    const in30Key = ymdKey(ymdDaysAhead(today, 30));
    const t = user.tenantId;

    /* ── project names scope every drafted line to the real job ── */
    const projRows = await safeRows(
      (db as any).from('projects').select('id, name').eq('tenant_id', t).limit(200)
    );
    const nameOf = new Map<string, string>();
    for (const p of projRows) nameOf.set(String(p.id), String(p.name ?? 'Untitled'));
    const pname = (pid: unknown): string | null => (pid ? nameOf.get(String(pid)) ?? null : null);

    const triggersNeeded = new Set(rules.map((r) => r.trigger_type));

    /* ── evaluate each supported trigger ONCE against real rows ── */
    const hitsByTrigger = new Map<string, TriggerHit[]>();

    if (triggersNeeded.has('rfi_overdue')) {
      const rows = await safeRows(
        (db as any)
          .from('rfis')
          .select('id, project_id, rfi_number, subject, status, due_date')
          .eq('tenant_id', t)
          .in('status', OPEN_RFI)
          .not('due_date', 'is', null)
          .lt('due_date', todayKey)
          .order('due_date', { ascending: true })
      );
      const hits: TriggerHit[] = [];
      for (const r of rows) {
        const due = parseDateOnly(r.due_date);
        if (!due) continue;
        const daysOver = todayIdx - dayIndex(due);
        if (daysOver <= 0) continue;
        const proj = pname(r.project_id);
        const label = r.rfi_number ? `RFI ${r.rfi_number}` : 'An open RFI';
        const subjectLine = String(r.subject ?? 'no subject on file');
        hits.push({
          about: `${label} ("${subjectLine}")${proj ? ` on ${proj}` : ''} is ${plural(daysOver, 'day')} past its response due date.`,
          to: 'Architect / design team of record',
          subjectSeed: `${label} response overdue${proj ? ` — ${proj}` : ''}: ${subjectLine}`,
          emailBody:
            `We are following up on ${label} — "${subjectLine}"${proj ? ` on the ${proj} project` : ''}. ` +
            `The response was due ${String(r.due_date).slice(0, 10)} and is now ${plural(daysOver, 'day')} overdue (status: ${String(r.status)}).\n\n` +
            `This information is required to keep the work progressing; continued delay may impact the project schedule, and we reserve our rights under the contract for any resulting time or cost impacts.\n\n` +
            `Please provide your response, or a firm date for it, by return email.`,
          messageBody:
            `Following up: ${label} ("${subjectLine}")${proj ? ` on ${proj}` : ''} was due ${String(r.due_date).slice(0, 10)} — now ${plural(daysOver, 'day')} overdue. Can you get us the response or a firm date today?`,
          projectName: proj,
        });
      }
      hitsByTrigger.set('rfi_overdue', hits);
    }

    if (triggersNeeded.has('invoice_overdue')) {
      const rows = await safeRows(
        (db as any)
          .from('invoices')
          .select('id, project_id, vendor_name, invoice_number, amount, tax, total, paid_amount, due_date, status')
          .eq('tenant_id', t)
          .not('due_date', 'is', null)
          .lt('due_date', todayKey)
      );
      const hits: TriggerHit[] = [];
      for (const inv of rows) {
        const st = String(inv.status ?? 'draft').toLowerCase();
        if (INV_NOT_OWED.has(st)) continue; // overdue excludes drafts + paid — same contract as the invoicing page
        const due = parseDateOnly(inv.due_date);
        if (!due) continue;
        const daysOver = todayIdx - dayIndex(due);
        if (daysOver <= 0) continue;
        const outstanding = Math.max(0, effectiveTotal(inv) - num(inv.paid_amount));
        if (outstanding <= 0) continue;
        const label = inv.invoice_number ? `Invoice ${inv.invoice_number}` : 'An invoice';
        const who = String(inv.vendor_name ?? 'the billed party');
        const proj = pname(inv.project_id);
        hits.push({
          about: `${label}${proj ? ` on ${proj}` : ''} is ${plural(daysOver, 'day')} overdue with ${usd(outstanding)} outstanding.`,
          to: who,
          subjectSeed: `Past-due balance — ${label}${proj ? ` (${proj})` : ''}: ${usd(outstanding)} outstanding`,
          emailBody:
            `This is a payment reminder for ${label}${proj ? ` on the ${proj} project` : ''}, which was due ${String(inv.due_date).slice(0, 10)} and is now ${plural(daysOver, 'day')} past due.\n\n` +
            `Amount billed: ${usd(effectiveTotal(inv))}\nPaid to date: ${usd(num(inv.paid_amount))}\nBalance outstanding: ${usd(outstanding)}\n\n` +
            `Please remit the outstanding balance, or reply with the expected payment date. If payment has already been sent, let us know and we will update our records.`,
          messageBody:
            `Reminder: ${label}${proj ? ` on ${proj}` : ''} was due ${String(inv.due_date).slice(0, 10)} — ${usd(outstanding)} still outstanding after ${plural(daysOver, 'day')}. When can we expect payment?`,
          projectName: proj,
        });
      }
      hits.sort((a, b) => a.about.localeCompare(b.about));
      hitsByTrigger.set('invoice_overdue', hits);
    }

    if (triggersNeeded.has('coi_expiring')) {
      const rows = await safeRows(
        (db as any)
          .from('insurance_certificates')
          .select('id, project_id, sub_name, policy_type, carrier, expiry_date, status')
          .eq('tenant_id', t)
          .eq('status', 'active')
          .not('expiry_date', 'is', null)
          .lte('expiry_date', in30Key)
          .order('expiry_date', { ascending: true })
      );
      const hits: TriggerHit[] = [];
      for (const c of rows) {
        const exp = parseDateOnly(c.expiry_date);
        if (!exp) continue;
        const delta = dayIndex(exp) - todayIdx; // negative = already lapsed
        const who = String(c.sub_name ?? 'Subcontractor');
        const pol = c.policy_type ? String(c.policy_type) : 'insurance';
        const proj = pname(c.project_id);
        const stateLine = delta < 0
          ? `expired ${plural(-delta, 'day')} ago (${ymdKey(exp)})`
          : `expires in ${plural(delta, 'day')} (${ymdKey(exp)})`;
        hits.push({
          about: `${who}'s ${pol} certificate${proj ? ` on ${proj}` : ''} ${stateLine}.`,
          to: who,
          subjectSeed: `${delta < 0 ? 'Lapsed' : 'Expiring'} insurance certificate — ${pol}${proj ? ` (${proj})` : ''}`,
          emailBody:
            `Our records show your ${pol} certificate${c.carrier ? ` with ${c.carrier}` : ''}${proj ? ` for the ${proj} project` : ''} ${stateLine}.\n\n` +
            `Per your subcontract, current insurance coverage is required at all times while working on the project${delta < 0 ? ' — work cannot continue against a lapsed certificate' : ''}.\n\n` +
            `Please send the renewed certificate of insurance, naming us as certificate holder with the required additional-insured endorsements, ${delta < 0 ? 'immediately' : 'before the expiration date'}.`,
          messageBody:
            `Heads up — our records show your ${pol} certificate${proj ? ` on ${proj}` : ''} ${stateLine}. Please send the renewed COI ${delta < 0 ? 'immediately' : 'before it lapses'}.`,
          projectName: proj,
        });
      }
      hitsByTrigger.set('coi_expiring', hits);
    }

    /* ── perform each rule's action over its trigger hits ── */
    const nounFor: Record<string, string> = {
      rfi_overdue: 'RFI follow-up',
      invoice_overdue: 'payment reminder',
      coi_expiring: 'COI reminder',
    };

    const results: Array<{
      ruleId: string;
      title: string;
      trigger_type: string;
      action_type: string;
      matches: number;
      drafts: RuleDraft[];
      note: string;
    }> = [];
    let totalDrafts = 0;

    for (const rule of rules) {
      const supported = hitsByTrigger.has(rule.trigger_type);
      const hits = hitsByTrigger.get(rule.trigger_type) ?? [];
      const isDraftAction = rule.action_type === 'draft_email' || rule.action_type === 'draft_message';

      if (!supported) {
        results.push({
          ruleId: rule.id, title: rule.title, trigger_type: rule.trigger_type, action_type: rule.action_type,
          matches: 0, drafts: [],
          note: `Trigger "${rule.trigger_type}" isn't supported by the evaluator yet — supported: rfi_overdue, invoice_overdue, coi_expiring. Nothing was checked.`,
        });
        continue;
      }
      if (!isDraftAction) {
        results.push({
          ruleId: rule.id, title: rule.title, trigger_type: rule.trigger_type, action_type: rule.action_type,
          matches: hits.length, drafts: [],
          note: `${plural(hits.length, 'match')} found, but action "${rule.action_type}" isn't supported yet — supported: draft_email, draft_message. No action taken.`,
        });
        continue;
      }

      const drafts: RuleDraft[] = hits.slice(0, MAX_DRAFTS_PER_RULE).map((h) =>
        rule.action_type === 'draft_email'
          ? { about: h.about, to: h.to, subject: h.subjectSeed, body: h.emailBody, projectName: h.projectName }
          : { about: h.about, to: h.to, body: h.messageBody, projectName: h.projectName }
      );
      totalDrafts += drafts.length;

      const capped = hits.length > drafts.length;
      const noun = nounFor[rule.trigger_type] ?? 'draft';
      const note = drafts.length === 0
        ? 'Trigger evaluated against live data — no matches right now, so nothing was drafted.'
        : `Drafted ${plural(drafts.length, noun)}${capped ? ` (top ${MAX_DRAFTS_PER_RULE} of ${hits.length} matches)` : ''}. Drafts only — nothing was sent; paste each into your email client or the relevant Saguaro module.`;

      results.push({
        ruleId: rule.id, title: rule.title, trigger_type: rule.trigger_type, action_type: rule.action_type,
        matches: hits.length, drafts, note,
      });

      /* store the run output on the rule (tolerant of missing migration) */
      try {
        await must((db as any)
          .from('sage_automation_rules')
          .update({
            config: { ...(rule.config ?? {}), lastRun: { at: ranAt, matches: hits.length, drafts, note } },
            updated_at: ranAt,
          })
          .eq('id', rule.id)
          .eq('user_id', user.id), 'sage_automation_rules write');
      } catch { /* tolerant until migration applied */ }

      /* the activity-trail line IS the deliverable — actor: sage */
      if (drafts.length > 0) {
        await logSageActivity({
          userId: user.id,
          tenantId: user.tenantId,
          actor: 'sage',
          ruleId: rule.id,
          actionType: 'rule_executed',
          summary: `Drafted ${plural(drafts.length, noun)} under your rule "${rule.title}". Drafts only — nothing was sent.`,
          detail: { trigger_type: rule.trigger_type, action_type: rule.action_type, matches: hits.length, drafts },
        });
      }
    }

    if (totalDrafts === 0) {
      await logSageActivity({
        userId: user.id,
        tenantId: user.tenantId,
        actor: 'sage',
        actionType: 'rules_run',
        summary: `Ran ${plural(rules.length, 'enabled rule')} against live data — no triggers matched, nothing drafted.`,
        detail: { ranAt, rules: rules.map((r) => ({ id: r.id, title: r.title, trigger_type: r.trigger_type })) },
      });
    }

    return NextResponse.json({
      ok: true,
      ranAt,
      rulesEvaluated: rules.length,
      totalDrafts,
      results,
      note: totalDrafts > 0
        ? `${plural(totalDrafts, 'draft')} produced. Nothing was sent — Sage has no send channel; every draft is also logged to your activity trail.`
        : 'All enabled rules evaluated against live data — no triggers matched right now.',
    });
  } catch (e) {
    return apiError('sage/rules/run POST', e, 'Failed to run rules');
  }
}
