/**
 * Documents, by job: each job's paperwork in one line — what's billed against
 * the contract, which pay apps have a signed lien waiver behind them, certified
 * payroll filed, closeout done — and one colour for the lot. Pure (no I/O);
 * the route feeds it rows, lib/documents-by-job.sanity.test.ts checks it.
 *
 * "Waiver on file" for a pay app = a signed lien_waivers row pointing at it
 * (pay_application_id) OR the pay app's own conditional / unconditional
 * waiver flag. A PAID pay app with neither is the real risk: money went out
 * with no release behind it. That — and only that — makes a job red.
 */
import { contractOf } from '@/lib/job-picker';

type Money = number | string | null | undefined;
const num = (v: Money) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type DocTone = 'red' | 'yellow' | 'green';
export type WaiverState = 'signed' | 'waiting' | 'missing' | 'not-needed';

const SIGNED = new Set(['signed', 'received', 'verified', 'executed', 'complete', 'completed', 'accepted']);
const PAID = new Set(['paid']);
const AWAITING = new Set(['submitted', 'approved', 'certified', 'under_review', 'pending']);
const CLOSEOUT_DONE = new Set(['accepted', 'na']);

export interface JobRow { id: string; name?: string | null; project_number?: string | null; status?: string | null; phase?: string | null; revised_contract_value?: Money; contract_amount?: Money; contract_value?: Money }
export interface PayAppRow { id: string; project_id: string | null; status?: string | null; current_payment_due?: Money; net_payment_due?: Money; total_completed_stored?: Money; conditional_waiver_signed?: boolean | null; unconditional_waiver_signed?: boolean | null }
export interface WaiverRow { id: string; project_id: string | null; pay_application_id?: string | null; status?: string | null }
export interface PayrollRow { project_id: string | null; week_ending?: string | null }
export interface CloseoutRow { project_id: string | null; status?: string | null }

export interface JobDocs {
  id: string;
  name: string;
  number: string | null;
  phase: string | null;
  contract: number | null;
  billed: number;
  payApps: { total: number; paid: number; awaiting: number; awaitingAmount: number };
  waivers: { signed: number; waiting: number };
  paidNoWaiver: number;
  payroll: { weeks: number; latest: string | null };
  closeout: { done: number; total: number };
  tone: DocTone;
  /** One line saying why the colour is what it is. */
  why: string;
}

export function waiverStateFor(pa: PayAppRow, signedFor: Set<string>, pendingFor: Set<string>): WaiverState {
  const status = String(pa.status || '').toLowerCase();
  if (signedFor.has(pa.id) || pa.conditional_waiver_signed || pa.unconditional_waiver_signed) return 'signed';
  if (pendingFor.has(pa.id)) return 'waiting';
  if (PAID.has(status)) return 'missing';
  return 'not-needed';
}

export function buildJobDocs(input: {
  jobs: JobRow[];
  payApps: PayAppRow[];
  waivers: WaiverRow[];
  payroll: PayrollRow[];
  closeout: CloseoutRow[];
}): { jobs: JobDocs[]; payAppWaiver: Record<string, WaiverState> } {
  const signedFor = new Set<string>();
  const pendingFor = new Set<string>();
  for (const w of input.waivers) {
    if (!w.pay_application_id) continue;
    if (SIGNED.has(String(w.status || '').toLowerCase())) signedFor.add(w.pay_application_id);
    else pendingFor.add(w.pay_application_id);
  }

  const payAppWaiver: Record<string, WaiverState> = {};
  for (const pa of input.payApps) payAppWaiver[pa.id] = waiverStateFor(pa, signedFor, pendingFor);

  const byJob = <T extends { project_id: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      if (!r.project_id) continue;
      const l = m.get(r.project_id);
      if (l) l.push(r); else m.set(r.project_id, [r]);
    }
    return m;
  };
  const paBy = byJob(input.payApps);
  const wBy = byJob(input.waivers);
  const prBy = byJob(input.payroll);
  const coBy = byJob(input.closeout);

  const jobs = input.jobs.map((j): JobDocs => {
    const pas = paBy.get(j.id) || [];
    const ws = wBy.get(j.id) || [];
    const prs = prBy.get(j.id) || [];
    const cos = coBy.get(j.id) || [];
    const status = (s: string | null | undefined) => String(s || '').toLowerCase();

    const paid = pas.filter((p) => PAID.has(status(p.status))).length;
    const awaitingRows = pas.filter((p) => AWAITING.has(status(p.status)));
    const paidNoWaiver = pas.filter((p) => payAppWaiver[p.id] === 'missing').length;
    const signed = ws.filter((w) => SIGNED.has(status(w.status))).length;
    const waiting = ws.length - signed;
    const weeks = prs.map((p) => p.week_ending).filter(Boolean) as string[];
    const coDone = cos.filter((c) => CLOSEOUT_DONE.has(status(c.status))).length;
    // G702 line 4 is cumulative, so the highest "completed & stored to date" is billed-to-date.
    const billed = pas.reduce((m, p) => Math.max(m, num(p.total_completed_stored)), 0);

    let tone: DocTone = 'green';
    let why = pas.length || ws.length || prs.length || cos.length ? 'Paperwork is up to date' : 'No paperwork yet';
    if (paidNoWaiver) {
      tone = 'red';
      why = `${paidNoWaiver} paid pay app${paidNoWaiver === 1 ? '' : 's'} with no lien waiver on file`;
    } else if (waiting || awaitingRows.length) {
      tone = 'yellow';
      why = [waiting ? `${waiting} waiver${waiting === 1 ? '' : 's'} waiting` : '', awaitingRows.length ? `${awaitingRows.length} pay app${awaitingRows.length === 1 ? '' : 's'} not paid yet` : ''].filter(Boolean).join(' · ');
    }

    return {
      id: j.id,
      name: (j.name || 'Untitled job').trim(),
      number: j.project_number || null,
      phase: j.phase || null,
      contract: contractOf(j),
      billed,
      payApps: { total: pas.length, paid, awaiting: awaitingRows.length, awaitingAmount: awaitingRows.reduce((s, p) => s + num(p.current_payment_due ?? p.net_payment_due), 0) },
      waivers: { signed, waiting },
      paidNoWaiver,
      payroll: { weeks: weeks.length, latest: weeks.sort().pop() || null },
      closeout: { done: coDone, total: cos.length },
      tone,
      why,
    };
  });

  // Worst first, then the most paperwork; jobs with nothing at all go last.
  const rank: Record<DocTone, number> = { red: 0, yellow: 1, green: 2 };
  const weight = (j: JobDocs) => j.payApps.total + j.waivers.signed + j.waivers.waiting + j.payroll.weeks + j.closeout.total;
  jobs.sort((a, b) => rank[a.tone] - rank[b.tone] || weight(b) - weight(a) || a.name.localeCompare(b.name));
  return { jobs, payAppWaiver };
}
