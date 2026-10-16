/**
 * The Owner Home alert ticker: everything that needs the owner, as one line
 * each, coloured so the state reads at a glance.
 *
 *   red     — overdue, failed, expired (queue tiers 0 and 2)
 *   review  — new end-of-day photos / video from subs, not looked at yet
 *   yellow  — due today or this week, decisions waiting (tiers 1, 3, 4)
 *   green   — work that got done today
 *
 * Items are rolled up per job and kind ("3 RFIs past response date · Desert
 * Vista"), so a busy portfolio is a dozen lines, not two hundred, and each
 * line links to the one page that clears it. Pure: no I/O, tested in
 * lib/home/ticker.sanity.test.ts.
 */
import type { QueueItem } from './rank';

export type TickerTone = 'red' | 'review' | 'yellow' | 'waiting' | 'green';

export interface TickerItem {
  id: string;
  tone: TickerTone;
  text: string;
  href: string;
  /** How many records this line stands for (the summary counts add these). */
  count: number;
}

export interface TickerSummary { red: number; review: number; yellow: number; green: number; waiting?: number }

export interface ReviewGroup {
  projectId: string;
  projectName: string | null;
  sender: string;
  photos: number;
  videos: number;
  /** Any of it sent to the GC only (held until someone adds it to the job). */
  toGc: boolean;
}

export interface DoneToday { logs: number; photos: number; punchClosed: number }

const NOUN: Record<string, [string, string]> = {
  rfi: ['RFI', 'RFIs'],
  punch: ['punch item', 'punch items'],
  todo: ['to-do', 'to-dos'],
  field_issue: ['field issue', 'field issues'],
  inspection: ['inspection', 'inspections'],
  change_order: ['change order', 'change orders'],
  pay_app: ['pay app', 'pay apps'],
  purchase_order: ['purchase order', 'purchase orders'],
  invoice: ['invoice', 'invoices'],
};
const DECISION = new Set(['change_order', 'pay_app', 'purchase_order', 'invoice']);
const noun = (type: string, n: number) => (NOUN[type] || ['item', 'items'])[n === 1 ? 0 : 1];
const shortJob = (name: string | null) => {
  const s = (name || '').trim();
  return s.length > 28 ? `${s.slice(0, 27).trimEnd()}…` : s;
};

function redPhrase(type: string, tier: number, n: number): string {
  const what = `${n} ${noun(type, n)}`;
  if (type === 'rfi') return `${what} past response date`;
  if (type === 'inspection') return tier === 0 ? `${n === 1 ? 'Failed inspection' : `${n} failed inspections`}` : `${what} with no result recorded`;
  if (type === 'field_issue' && tier === 0) return `${n} critical field issue${n === 1 ? '' : 's'}`;
  if (DECISION.has(type)) return `${what} waiting 14+ days for a decision`;
  return `${what} overdue`;
}

function yellowPhrase(type: string, tier: number, n: number): string {
  const what = `${n} ${noun(type, n)}`;
  if (DECISION.has(type)) return `${what} waiting for your decision`;
  if (type === 'inspection' && tier <= 3) return `${what} today`;
  if (tier === 1) return `${what} blocking today`;
  if (tier === 3) return `${what} due today`;
  return `${what} due this week`;
}

export function buildTicker(input: {
  items: QueueItem[];
  review: ReviewGroup[];
  done: DoneToday | null;
  max?: number;
}): { items: TickerItem[]; summary: TickerSummary } {
  const max = input.max ?? 18;
  const red: TickerItem[] = [];
  const yellow: TickerItem[] = [];

  // Grouped compliance rows (COIs, waivers, W-9s) are already one line each.
  for (const g of input.items.filter((i) => i.id.startsWith('group:'))) {
    const n = g.count || 1;
    if (g.tier === 0 || g.tier === 2) red.push({ id: g.id, tone: 'red', text: g.title, href: g.href, count: n });
    else if (g.tier <= 4 && (g.sourceType === 'coi' || /block/i.test(g.reason))) yellow.push({ id: g.id, tone: 'yellow', text: `${g.title}${/block/i.test(g.reason) ? ` · ${g.reason.toLowerCase()}` : ''}`, href: g.href, count: n });
  }

  // Everything else rolls up per job + kind + colour.
  const buckets = new Map<string, { tone: 'red' | 'yellow'; type: string; tier: number; projectName: string | null; href: string; n: number }>();
  for (const i of input.items) {
    if (i.id.startsWith('group:')) continue;
    const tone: 'red' | 'yellow' | null =
      i.tier === 0 || i.tier === 2 ? 'red' : i.tier === 1 || i.tier === 3 || i.tier === 4 ? 'yellow' : null;
    if (!tone) continue;
    // Failed inspections and critical issues read differently from overdue ones — keep them apart.
    const sub = tone === 'red' && i.tier === 0 ? 'crit' : tone === 'yellow' && (i.tier === 1 || i.tier === 3) ? 'today' : '';
    const key = `${tone}|${i.sourceType}|${sub}|${i.projectId || '-'}`;
    const b = buckets.get(key);
    if (b) b.n++;
    else buckets.set(key, { tone, type: i.sourceType, tier: i.tier, projectName: i.projectName, href: i.href, n: 1 });
  }
  for (const [key, b] of buckets) {
    const job = shortJob(b.projectName);
    const text = `${b.tone === 'red' ? redPhrase(b.type, b.tier, b.n) : yellowPhrase(b.type, b.tier, b.n)}${job ? ` · ${job}` : ''}`;
    (b.tone === 'red' ? red : yellow).push({ id: `t:${key}`, tone: b.tone, text, href: b.href, count: b.n });
  }

  const review: TickerItem[] = input.review
    .filter((r) => r.photos + r.videos > 0)
    .map((r) => {
      const what = [r.photos && `${r.photos} photo${r.photos === 1 ? '' : 's'}`, r.videos && `${r.videos} video${r.videos === 1 ? '' : 's'}`].filter(Boolean).join(' & ');
      const job = shortJob(r.projectName);
      return {
        id: `review:${r.projectId}:${r.sender}`,
        tone: 'review' as const,
        text: `${r.sender} ${r.toGc ? 'sent you' : 'posted'} ${what} to review${job ? ` · ${job}` : ''}`,
        href: `/app/projects/${r.projectId}/photos?inbox=1`,
        count: r.photos + r.videos,
      };
    });

  const green: TickerItem[] = [];
  const d = input.done;
  if (d) {
    if (d.logs) green.push({ id: 'done:logs', tone: 'green', text: `${d.logs} daily log${d.logs === 1 ? '' : 's'} in today`, href: '/app/daily-logs', count: d.logs });
    if (d.photos) green.push({ id: 'done:photos', tone: 'green', text: `${d.photos} photo${d.photos === 1 ? '' : 's'} & video added today`, href: '/app/my-work', count: d.photos });
    if (d.punchClosed) green.push({ id: 'done:punch', tone: 'green', text: `${d.punchClosed} punch item${d.punchClosed === 1 ? '' : 's'} closed today`, href: '/app/my-work', count: d.punchClosed });
  }

  const bigFirst = (a: TickerItem, b: TickerItem) => b.count - a.count;
  red.sort(bigFirst);
  yellow.sort(bigFirst);
  review.sort(bigFirst);

  const sum = (l: TickerItem[]) => l.reduce((s, i) => s + i.count, 0);
  const summary: TickerSummary = { red: sum(red), review: sum(review), yellow: sum(yellow), green: sum(green) };

  if (!red.length && !yellow.length && !review.length) {
    green.unshift({ id: 'clear', tone: 'green', text: 'All clear — nothing overdue or waiting on you', href: '/app/my-work', count: 0 });
  }
  // Red first, then what to review, then what's coming, then the good news.
  const ordered = [...red, ...review, ...yellow, ...green];
  return { items: ordered.slice(0, max), summary };
}

/** UTC instant of local midnight on `ymd` in `tz` — "today" for created_at filters. */
export function zonedMidnightIso(ymd: string, tz: string): string {
  const guess = new Date(`${ymd}T00:00:00Z`);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(guess);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString();
  } catch {
    return guess.toISOString();
  }
}
