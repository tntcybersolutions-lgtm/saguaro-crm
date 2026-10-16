/**
 * Home's alert line, read from the same list My Day reads (GET /api/my-work),
 * so the two screens never disagree: when My Day says 3 late, Home says 3 late.
 *
 *   red      late — past its day, or a red must-do        (My Day's "Late")
 *   waiting  waiting on others — bidders, RFI answers, owner money
 *   yellow   due today or needs doing now                  (My Day's "Today")
 *   review   photos and video from subs to look at         (Home's own feed)
 *   green    done today                                    (Home's own feed)
 *
 * The counts are My Day's pressure numbers. Each line is one item and opens
 * the screen that clears it; every item lands on exactly one line (late wins,
 * then waiting, then today). Pure: tested in day-ticker.sanity.test.ts.
 */
import type { MyWorkItem, Snooze } from '@/lib/my-work';
import { applySnoozes } from '@/lib/my-work';
import { holderOf, pressure, rank, whenOf } from '@/lib/my-day';
import type { TickerItem, TickerSummary } from './ticker';

export interface DayFeed {
  today: string;
  items: MyWorkItem[];
  snoozes?: Snooze[];
  jobs?: Record<string, { name: string; color: string | null }>;
}

/** A long job name cut at a word, never mid-word: "Pima County Admin…". */
const short = (s: string, n = 30) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > n / 2 ? cut.slice(0, sp) : cut).trimEnd()}…`;
};

export function dayTicker(
  home: { items: TickerItem[]; summary: TickerSummary } | null | undefined,
  day: DayFeed | null | undefined,
  max = 18,
): { items: TickerItem[]; summary: TickerSummary } {
  const homeItems = (home?.items || []).filter((i) => i.id !== 'clear');
  const review = homeItems.filter((i) => i.tone === 'review');
  const green = homeItems.filter((i) => i.tone === 'green');
  if (!day) {
    // My Day's list didn't load: Home's own feed, as before.
    return home ? { items: home.items.slice(0, max), summary: home.summary } : { items: [], summary: { red: 0, review: 0, yellow: 0, green: 0, waiting: 0 } };
  }
  const open = rank(applySnoozes(day.items, day.snoozes || [], day.today), day.today);
  const p = pressure(open, day.today);
  const line = (it: MyWorkItem, tone: TickerItem['tone']): TickerItem => {
    const job = it.projectId ? day.jobs?.[it.projectId]?.name : null;
    return { id: `day:${it.key}`, tone, text: `${it.title}${job ? ` · ${short(job)}` : ''}`, href: it.href, count: 1 };
  };
  const red: TickerItem[] = [];
  const waiting: TickerItem[] = [];
  const yellow: TickerItem[] = [];
  for (const it of open) {
    const w = whenOf(it, day.today);
    if (w === 'late') red.push(line(it, 'red'));
    else if (holderOf(it) === 'others') waiting.push(line(it, 'waiting'));
    else if (w === 'today') yellow.push(line(it, 'yellow'));
  }
  const sum = (l: TickerItem[]) => l.reduce((s, i) => s + i.count, 0);
  const summary: TickerSummary = { red: p.late, review: sum(review), yellow: p.today, waiting: p.waiting, green: sum(green) };
  const items = [...red, ...review, ...yellow, ...waiting, ...green];
  if (!red.length && !yellow.length && !review.length && !waiting.length) {
    items.unshift({ id: 'clear', tone: 'green', text: 'All clear — nothing late, due today or waiting on you', href: '/app/my-work', count: 0 });
  }
  return { items: items.slice(0, max), summary };
}
