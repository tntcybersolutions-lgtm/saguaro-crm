/**
 * lib/owner-update.ts — the weekly note to the homeowner, written from the
 * job's daily logs and approved by the PM before it goes anywhere.
 *
 *   draft  the last N days of daily logs + the next two weeks of schedule →
 *          the model writes a short, plain-language update → saved as a DRAFT
 *          (portal_summaries, summary_data.kind 'owner_update'). Nothing is sent.
 *   send   the PM's edited title and body are what goes out: posted to the
 *          client portal (Updates tab + Messages) and emailed to every client
 *          with active portal access. Only a sent update is visible to clients.
 *
 * The model is told to leave out costs, internal problems, safety incidents and
 * blame — the PM still reads every word before it is sent.
 *
 * Service-role client bypasses RLS → every query is explicitly tenant-scoped.
 */
import { JSON_ONLY } from '@/lib/ai-json';

export type OwnerUpdateData = {
  kind: 'owner_update';
  status: 'draft' | 'sent';
  title: string;
  body: string;
  period: { start: string; end: string };
  generated_by: 'ai' | 'pm';
  drafted_by: string | null;
  drafted_at: string;
  approved_by?: string | null;
  sent_at?: string | null;
  recipients?: string[];
};

export const isOwnerUpdate = (d: unknown): d is OwnerUpdateData =>
  !!d && typeof d === 'object' && (d as { kind?: unknown }).kind === 'owner_update';

type Log = Record<string, unknown>;

/** One line per log day, homeowner-relevant fields only. Pure. */
export function logLine(l: Log): string {
  const parts: string[] = [];
  const work = [l.work_performed, l.activities].filter((v) => typeof v === 'string' && v.trim()).join('; ');
  if (work) parts.push(`work: ${work}`);
  if (typeof l.phase_of_work === 'string' && l.phase_of_work) parts.push(`phase: ${l.phase_of_work}`);
  const crew = Number(l.manpower_count) || Number(l.crew_count) || 0;
  if (crew > 0) parts.push(`crew on site: ${crew}`);
  if (typeof l.weather === 'string' && l.weather) parts.push(`weather: ${l.weather}`);
  if (l.work_stopped) parts.push(`work stopped${l.work_stopped_reason ? ` (${l.work_stopped_reason})` : ''}`);
  if (typeof l.delays === 'string' && l.delays.trim()) parts.push(`delays: ${l.delays}`);
  if (typeof l.materials_delivered === 'string' && l.materials_delivered.trim()) parts.push(`deliveries: ${l.materials_delivered}`);
  if (Array.isArray(l.inspections) && l.inspections.length) parts.push(`inspections: ${JSON.stringify(l.inspections).slice(0, 300)}`);
  if (Number(l.photos_count) > 0) parts.push(`${l.photos_count} photos`);
  return `${String(l.log_date)}: ${parts.join(' · ') || 'log with no details'}`;
}

export function ownerUpdatePrompt(args: {
  projectName: string; ownerName: string | null; companyName: string; percentComplete: number | null;
  logs: Log[]; upcoming: Array<{ name: string; start_date: string | null }>; start: string; end: string;
}): string {
  const up = args.upcoming.length
    ? args.upcoming.map((t) => `- ${t.start_date || 'soon'}: ${t.name}`).join('\n')
    : '(no scheduled tasks in the next two weeks)';
  return `Write a short progress update from ${args.companyName} (the builder) to the homeowner${args.ownerName ? `, ${args.ownerName},` : ''} about their project "${args.projectName}" for ${args.start} to ${args.end}.

The site's daily logs for those days:
${args.logs.map(logLine).join('\n')}

Coming up in the next two weeks (from the schedule):
${up}
${args.percentComplete ? `\nThe project is about ${Math.round(args.percentComplete)}% complete.` : ''}

Rules:
- Warm, plain language a homeowner understands. No jargon, no CSI codes, no crew names.
- Say what got done, what is next, and anything they should know or decide (weather days, an inspection, a delivery). Only what the logs and schedule say — never invent progress.
- Never mention costs, prices, budgets, subcontractor problems, safety incidents, blame, or anything internal.
- 90 to 170 words. Short paragraphs or a few "- " bullets. No sign-off line; the builder's name is added.

Return {"title": "<6–10 word subject line>", "body": "<the update>"}
${JSON_ONLY}`;
}

/** Clean the model's reply. Pure. */
export function normalizeUpdate(raw: unknown, fallbackTitle: string): { title: string; body: string } | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const body = typeof r.body === 'string' ? r.body.trim().slice(0, 4000) : '';
  if (body.length < 20) return null;
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 120) : fallbackTitle;
  return { title, body };
}
