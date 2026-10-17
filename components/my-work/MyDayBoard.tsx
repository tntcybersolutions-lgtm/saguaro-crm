'use client';
/**
 * My Day — anyone's workday on one screen, in the order the day runs.
 *
 *   Start of day      the date, your on-time ring, the numbers that matter
 *                     (late · today · this week · $ at stake · waiting on
 *                     others — each one filters), and your clock
 *   Today's agenda    meetings on an hour timeline with a live "now" line;
 *                     inspections and job starts in an Anytime lane
 *   Carried over      what is late — clear these first
 *   Today's work      due today or must be done now
 *   Waiting on others bidders, subs and owners to chase, one tap to nudge
 *   Before you leave  the daily log, clock out, first thing tomorrow
 *   Next two weeks    a runway bar per day (tap a day to filter) and the list
 *   Jobs              where the open work sits
 *
 * Every row does its real thing (Turn on, Remind, Request, Done, Snooze) through
 * the actions MyWorkView owns. Layout, density and order are the person's own
 * (lib/my-day-prefs, saved to their account). Numbers come from lib/my-day.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Gavel, Question, Stamp, ListChecks, CheckSquare, WarningOctagon, ClipboardText, CalendarCheck, Notebook,
  ShieldCheck, Receipt, Timer, Lifebuoy, Phone, HardHat, SlidersHorizontal, MagnifyingGlass, X, Clock,
  SunHorizon, MoonStars, Hourglass, BellRinging, CaretRight, Check, ArrowsClockwise, Lightning, Buildings,
} from '@phosphor-icons/react';
import type { MyWorkItem } from '@/lib/my-work';
import {
  KIND_LABEL, applyFilter, countdown, groupItems, holderOf, jobHeat, kindOf, placeItems, pressure, roleLabel, runway,
  whenOf, type BoardFilter, type ItemKind,
} from '@/lib/my-day';
import { SECTION_META, hourLabel, minutesOf, timeLabel, visibleSections, type MyDayPrefs, type SectionId } from '@/lib/my-day-prefs';
import { addDays } from '@/lib/time-zone';
import type { RowControl } from './MyWorkRow';

export interface AgendaEvent { id: string; kind: 'meeting'; title: string; projectId: string | null; start: string | null; end: string | null; location: string | null; href: string }
export type Jobs = Record<string, { name: string; color: string | null }>;

/* ── Kinds: a designer icon and an accent per kind of work (no blue) ───── */

const KIND_UI: Record<ItemKind, { Icon: React.ElementType; color: string }> = {
  bid: { Icon: Gavel, color: 'var(--kind-bid)' },
  rfi: { Icon: Question, color: 'var(--kind-rfi)' },
  submittal: { Icon: Stamp, color: 'var(--kind-submittal)' },
  punch: { Icon: ListChecks, color: 'var(--kind-punch)' },
  todo: { Icon: CheckSquare, color: 'var(--kind-todo)' },
  issue: { Icon: WarningOctagon, color: 'var(--kind-issue)' },
  inspection: { Icon: ClipboardText, color: 'var(--kind-inspection)' },
  task: { Icon: CalendarCheck, color: 'var(--kind-task)' },
  log: { Icon: Notebook, color: 'var(--warning)' },
  coi: { Icon: ShieldCheck, color: 'var(--kind-coi)' },
  payapp: { Icon: Receipt, color: 'var(--success)' },
  tm: { Icon: Timer, color: 'var(--kind-tm)' },
  assist: { Icon: Lifebuoy, color: 'var(--danger)' },
  followup: { Icon: Phone, color: 'var(--kind-followup)' },
  job: { Icon: HardHat, color: 'var(--kind-job)' },
};

const JOB_FALLBACK = ['var(--kind-bid)', 'var(--kind-punch)', 'var(--kind-rfi)', 'var(--kind-submittal)', 'var(--kind-inspection)', 'var(--kind-todo)', 'var(--kind-issue)', 'var(--kind-task)'];
const jobColor = (pid: string | null, jobs: Jobs) => {
  if (!pid) return 'var(--text-tertiary)';
  const c = jobs[pid]?.color;
  if (c && /^#[0-9a-f]{6}$/i.test(c)) return c;
  let h = 0;
  for (const ch of pid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return JOB_FALLBACK[h % JOB_FALLBACK.length];
};

/** '$2.79M', '$412K', '$950'. */
function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (a >= 10_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Minutes after midnight, now, in the person's zone. */
function nowMinutes(zone: string): number {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    return Number(p.find((x) => x.type === 'hour')?.value || 0) * 60 + Number(p.find((x) => x.type === 'minute')?.value || 0);
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parseDay = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));

/* ── Styles ─────────────────────────────────────────────────────────────── */

const CSS = `
.md{container:md/inline-size;--md-pad:14px;--md-gap:12px;--md-line:var(--sg-border,var(--border-default));--md-text:var(--sg-text,var(--text-primary));--md-2:var(--sg-text-2,var(--text-secondary));--md-3:var(--sg-text-3,var(--text-tertiary));--md-neon:var(--brand-primary,var(--brand-primary));--md-red:var(--danger,var(--danger));--md-amber:var(--warning,var(--warning));--md-green:var(--success,var(--success));--md-gold:var(--kind-job);color:var(--md-text);max-width:1320px;margin:0 auto;padding-bottom:64px}
.md[data-density=compact]{--md-pad:8px;--md-gap:8px}
.md *{box-sizing:border-box}
.md button{font:inherit}
.md :focus-visible{outline:2px solid var(--md-neon);outline-offset:2px;border-radius:8px}

/* Start band */
.md-start{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'id side' 'score score';gap:22px 28px;align-items:center;padding:18px 0 22px;border-bottom:1px solid var(--md-line)}
.md-id{grid-area:id;min-width:0}
.md-dow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--md-3)}
.md-date{margin:4px 0 0;font-size:clamp(30px,4.4cqi,48px);line-height:1.02;font-weight:900;letter-spacing:-.02em;color:var(--md-text)}
.md-sub{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.md-role{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:700;color:var(--md-2);border:1px solid var(--md-line)}
.md-scope{display:inline-flex;padding:3px;border-radius:999px;border:1px solid var(--md-line);gap:2px}
.md-scope button{height:26px;padding:0 12px;border-radius:999px;border:0;background:none;color:var(--md-3);font-size:12px;font-weight:800;cursor:pointer}
.md-scope button[aria-pressed=true]{background:var(--md-neon);color:var(--bg-base)}

.md-press{grid-area:score;display:flex;align-items:center;gap:28px;min-width:0}
.md-ring{flex:none;position:relative;width:118px;height:118px;border:0;background:none;padding:0;cursor:pointer;border-radius:50%}
.md-ring svg{display:block;transform:rotate(-90deg)}
.md-ring b{position:absolute;inset:0;display:grid;place-items:center;align-content:center;font-size:28px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.md-ring b small{display:block;margin-top:2px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--md-3)}
.md-nums{flex:1;min-width:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0}
.md-num{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;padding:10px 18px;border:0;border-left:1px solid var(--md-line);background:none;color:inherit;text-align:left;cursor:pointer;border-radius:0;transition:background .15s}
.md-num:hover{background:rgba(255,255,255,.035)}
.md-num b{font-size:clamp(26px,3.2cqi,40px);font-weight:900;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;white-space:nowrap}
.md-num span{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--md-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.md-num span em{font-style:normal}
.md-short{display:none}
.md-num[data-tone=red] b{color:var(--md-red)}
.md-num[data-tone=amber] b{color:var(--md-amber)}
.md-num[data-tone=green] b{color:var(--md-green)}
.md-num[data-tone=zero] b{color:var(--md-3)}
.md-num[aria-pressed=true]{background:rgba(232,255,42,.07)}
.md-num[aria-pressed=true]::after{content:'';position:absolute;left:12px;right:12px;bottom:0;height:3px;border-radius:3px;background:var(--md-neon)}

.md-side{grid-area:side;display:flex;align-items:center;gap:14px;min-width:0}
.md-clock{display:flex;align-items:center;gap:12px;min-width:0}
.md-clock-face{display:flex;flex-direction:column;align-items:flex-end;min-width:0}
.md-clock-face b{font-size:22px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.1}
.md-clock-face span{font-size:12px;color:var(--md-3);white-space:nowrap}
.md-clock[data-on=true] .md-clock-face b{color:var(--md-green)}
.md-pulse{width:10px;height:10px;border-radius:50%;background:var(--md-3);flex:none}
.md-clock[data-on=true] .md-pulse{background:var(--md-green);box-shadow:0 0 0 0 rgba(74,222,128,.6);animation:mdPulse 2s infinite}
@keyframes mdPulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,.55)}70%{box-shadow:0 0 0 10px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
.md-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--md-line);background:transparent;color:var(--md-text);font-size:14px;font-weight:800;text-decoration:none;cursor:pointer;white-space:nowrap;transition:border-color .15s,background .15s,color .15s}
.md-btn:hover{border-color:var(--md-neon);color:var(--md-neon)}
.md-btn[data-k=primary]{background:var(--md-neon);border-color:var(--md-neon);color:var(--bg-base)}
.md-btn[data-k=primary]:hover{background:color-mix(in srgb,var(--md-neon) 88%,var(--text-primary));color:var(--bg-base)}
.md-btn[disabled]{opacity:.5;cursor:default}

/* Filter bar */
.md-filters{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 0;background:linear-gradient(var(--bg-base,var(--bg-base)) 80%,transparent)}
.md-search{position:relative;flex:1 1 220px;max-width:360px}
.md-search input{width:100%;height:40px;padding:0 12px 0 36px;border-radius:10px;border:1px solid var(--md-line);background:rgba(255,255,255,.03);color:var(--md-text);font-size:16px}
.md-search input::placeholder{color:var(--md-3)}
.md-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--md-3)}
.md-kinds{display:flex;gap:6px;flex-wrap:wrap}
.md-kind{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 10px;border-radius:999px;border:1px solid var(--md-line);background:none;color:var(--md-2);font-size:12.5px;font-weight:700;cursor:pointer}
.md-kind i{font-style:normal;font-variant-numeric:tabular-nums;color:var(--md-3);font-weight:800}
.md-kind[aria-pressed=true]{border-color:var(--k);color:var(--md-text);background:color-mix(in srgb,var(--k) 14%,transparent)}
.md-chip{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 6px 0 12px;border-radius:999px;background:rgba(232,255,42,.12);color:var(--md-neon);font-size:12.5px;font-weight:800}
.md-chip button{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;border:0;background:none;color:inherit;cursor:pointer}
.md-clear{height:34px;padding:0 10px;border:0;background:none;color:var(--md-3);font-size:12.5px;font-weight:800;cursor:pointer}
.md-clear:hover{color:var(--md-text)}

/* Sections */
.md-sec{padding:22px 0 6px}
.md-sec + .md-sec{border-top:1px solid var(--md-line)}
.md-sec-h{display:flex;align-items:baseline;gap:12px;margin:0 0 10px}
.md-sec-h .md-h2{margin:0;font-size:21px;font-weight:900;letter-spacing:-.015em;color:var(--title-section)}
.md-sec-h .md-when{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--md-3)}
.md-sec-h .md-count{margin-left:auto;font-size:13px;font-weight:800;color:var(--md-2);font-variant-numeric:tabular-nums}
.md-empty{display:flex;align-items:center;gap:10px;padding:14px 0;color:var(--md-2);font-size:14.5px}
.md-empty svg{color:var(--md-green)}

/* Rows */
.md-list{list-style:none;margin:0;padding:0}
.md-row{position:relative;display:grid;grid-template-columns:4px 40px minmax(0,1fr) auto auto auto;align-items:center;gap:0 14px;padding:var(--md-pad) 6px var(--md-pad) 0;border-bottom:1px solid color-mix(in srgb,var(--md-line) 70%,transparent);transition:background .15s}
.md-row:hover,.md-row:focus-within{background:rgba(255,255,255,.025)}
.md-rail{align-self:stretch;border-radius:3px;background:var(--md-3);opacity:.35}
.md-row[data-tone=red] .md-rail{background:var(--md-red);opacity:1}
.md-row[data-tone=amber] .md-rail{background:var(--md-amber);opacity:1}
.md-row[data-tone=gold] .md-rail{background:var(--md-gold);opacity:.9}
.md-ic{display:grid;place-items:center;width:40px;height:40px;color:var(--k)}
.md[data-density=compact] .md-ic{width:32px;height:32px;border-radius:10px}
.md-what{min-width:0}
.md-tl{display:block;color:var(--md-text);font-size:15px;font-weight:750;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-tl::after{content:'';position:absolute;inset:0;z-index:0}
.md-meta{display:flex;align-items:center;gap:8px;min-width:0;margin-top:3px;font-size:13px;color:var(--md-3)}
.md-meta span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.md-job{display:inline-flex;align-items:center;gap:6px;flex:none;max-width:200px;font-weight:700;color:var(--md-2)}
.md-job i{width:8px;height:8px;border-radius:50%;flex:none;background:var(--j)}
.md-job b{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-due{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;min-width:84px;height:28px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--md-2);border:1px solid var(--md-line);white-space:nowrap}
.md-due[data-tone=red]{color:var(--bg-base);background:var(--md-red);border-color:var(--md-red)}
.md-due[data-tone=amber]{color:var(--md-amber);border-color:color-mix(in srgb,var(--md-amber) 55%,transparent);background:color-mix(in srgb,var(--md-amber) 10%,transparent)}
.md-amt{position:relative;z-index:1;min-width:64px;text-align:right;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--md-text)}
.md-acts{position:relative;z-index:1;display:flex;align-items:center;gap:6px;justify-content:flex-end}
.md-act{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;min-width:44px;padding:0 12px;border-radius:9px;border:1px solid var(--md-line);background:transparent;color:var(--md-text);font-size:13px;font-weight:800;text-decoration:none;cursor:pointer;white-space:nowrap;transition:border-color .15s,color .15s,background .15s}
.md-act:hover{border-color:var(--md-neon);color:var(--md-neon)}
/* A row's action is outlined: the one yellow on this screen is Clock in. */
.md-act[data-k=primary]{border-color:var(--border-strong);color:var(--md-text)}
.md-act[data-k=quiet]{border-color:transparent;color:var(--md-3);padding:0 8px}
.md-act[data-k=quiet]:hover{color:var(--md-green);border-color:transparent}
.md-act[disabled]{opacity:.5;cursor:default}
.md-note{font-size:12px;color:var(--md-green);font-weight:700}
@media (hover:hover) and (pointer:fine){.md-row:not(:hover):not(:focus-within) .md-act[data-k=quiet]{opacity:0}}

.md-group{display:flex;align-items:baseline;gap:10px;padding:16px 0 6px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--md-2)}
.md-group i{width:8px;height:8px;border-radius:50%;background:var(--g,var(--md-3));align-self:center}
.md-group em{font-style:normal;color:var(--md-3);letter-spacing:.04em}
.md-group b{margin-left:auto;font-variant-numeric:tabular-nums;letter-spacing:0;color:var(--md-text)}

/* Agenda */
.md-agenda{position:relative}
.md-tline{position:relative;height:var(--h,96px);margin:4px 0 0;border-top:1px solid var(--md-line);border-bottom:1px solid var(--md-line);background:repeating-linear-gradient(90deg,transparent 0,transparent calc(var(--hw) - 1px),rgba(255,255,255,.05) calc(var(--hw) - 1px),rgba(255,255,255,.05) var(--hw))}
.md-hours{position:relative;height:22px;margin-top:6px}
.md-hours span{position:absolute;top:0;transform:translateX(-50%);font-size:12px;font-weight:800;color:var(--md-3);white-space:nowrap}
.md-ev{position:absolute;display:flex;flex-direction:column;justify-content:center;gap:1px;height:38px;padding:0 10px;border-radius:9px;background:color-mix(in srgb,var(--j) 22%,var(--bg-surface));box-shadow:inset 3px 0 0 var(--j);color:var(--md-text);text-decoration:none;overflow:hidden;min-width:56px;transition:transform .15s}
.md-ev:hover{transform:translateY(-1px);background:color-mix(in srgb,var(--j) 30%,var(--bg-surface))}
.md-ev b{font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-ev span{font-size:12px;color:var(--md-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-ev[data-past=true]{opacity:.5}
.md-now{position:absolute;top:-6px;bottom:-6px;width:2px;background:var(--md-text);z-index:2}
.md-now::before{content:attr(data-t);position:absolute;top:-20px;left:50%;transform:translateX(-50%);padding:1px 6px;border-radius:6px;background:var(--md-text);color:var(--bg-base);font-size:12px;font-weight:900;white-space:nowrap}
.md-tline-empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--md-3);font-size:13px;font-weight:700}
.md-anytime{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
.md-anytime > em{font-style:normal;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--md-3);margin-right:4px}
.md-pill{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid color-mix(in srgb,var(--k) 40%,transparent);background:color-mix(in srgb,var(--k) 10%,transparent);color:var(--md-text);font-size:13px;font-weight:700;text-decoration:none;max-width:100%}
.md-pill svg{color:var(--k);flex:none}
.md-pill span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-alist{display:none;list-style:none;margin:0;padding:0}

/* Runway */
.md-runway{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(34px,1fr);gap:6px;align-items:end;padding:10px 0 4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}
.md-day{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:168px;min-width:0;padding:0;border:0;background:none;color:inherit;cursor:pointer;border-radius:10px}
.md-day:hover .md-stack{filter:brightness(1.2)}
.md-day b{font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--md-2)}
.md-day[data-zero=true] b{color:transparent}
.md-stack{display:flex;flex-direction:column-reverse;width:100%;max-width:38px;border-radius:7px 7px 3px 3px;overflow:hidden;background:rgba(255,255,255,.04);transition:filter .15s,height .4s cubic-bezier(.2,.8,.2,1)}
.md-stack i{display:block;width:100%}
.md-stack i[data-t=red]{background:var(--md-red)}
.md-stack i[data-t=amber]{background:var(--md-amber)}
.md-stack i[data-t=gold]{background:var(--md-gold)}
.md-stack i[data-t=grey]{background:var(--md-planned)}
.md-dl{display:flex;flex-direction:column;align-items:center;line-height:1.1;padding:4px 2px;border-radius:8px;width:100%}
.md-dl small{font-size:12px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:var(--md-3)}
.md-dl span{font-size:13px;font-weight:800;color:var(--md-2);font-variant-numeric:tabular-nums}
.md-day[data-weekend=true] .md-dl{opacity:.55}
.md-day[data-today=true] .md-dl{background:var(--bg-surface-2)}
.md-day[data-today=true] .md-dl small,.md-day[data-today=true] .md-dl span{color:var(--md-text)}
.md-day[data-late=true] .md-dl small,.md-day[data-late=true] .md-dl span{color:var(--md-red)}
.md-day[aria-pressed=true] .md-stack{box-shadow:0 0 0 2px var(--md-neon)}
.md-day[aria-pressed=true] .md-dl{outline:2px solid var(--md-neon)}
.md-legend{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0 4px;font-size:12px;color:var(--md-3);font-weight:700}
.md-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}

/* Jobs */
.md-jobs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:2px 28px}
.md-jobrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;width:100%;padding:12px 4px;border:0;border-bottom:1px solid color-mix(in srgb,var(--md-line) 70%,transparent);background:none;color:inherit;text-align:left;cursor:pointer;border-radius:0}
.md-jobrow:hover{background:rgba(255,255,255,.025)}
.md-jobrow[aria-pressed=true]{background:rgba(232,255,42,.06)}
.md-jobname{display:flex;align-items:center;gap:8px;min-width:0;font-weight:800;font-size:14px}
.md-jobname i{width:10px;height:10px;border-radius:3px;background:var(--j);flex:none}
.md-jobname span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-jobstat{font-size:12.5px;font-weight:800;color:var(--md-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.md-jobstat em{font-style:normal;color:var(--md-red)}
.md-jobbar{grid-column:1/-1;position:relative;height:8px;border-radius:5px;background:rgba(255,255,255,.05);overflow:hidden}
.md-jobbar i{position:absolute;inset:0 auto 0 0;border-radius:5px;background:var(--j)}
.md-jobbar i + i{background:var(--md-red)}

/* Wrap-up */
.md-wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 32px}
.md-wrap h3{margin:10px 0 2px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--md-3)}

.md-fail{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0;padding:10px 0 10px 14px;border-left:3px solid var(--md-red);font-size:14px}

/* Tablet */
@container md (max-width: 1000px){
  .md-press{gap:18px}
  .md-num{padding:8px 12px}
}
/* Phone */
@container md (max-width: 720px){
  .md-start{grid-template-columns:minmax(0,1fr);grid-template-areas:'id' 'side' 'score';padding-top:14px}
  .md-side{justify-content:space-between;gap:10px}
  .md-side .md-btn{padding:0 12px}
  .md-press{flex-direction:column;align-items:stretch;gap:14px}
  .md-ring{align-self:center}
  .md-nums{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:8px}
  .md-num{border-left:0;padding:8px 6px}
  .md-long{display:none}
  .md-short{display:inline}
  .md-row{grid-template-columns:4px 36px minmax(0,1fr) auto;padding-right:0}
  .md-ic{width:36px;height:36px}
  .md-amt{display:none}
  .md-due{grid-column:3;justify-self:start;min-width:0;height:24px;margin-top:6px}
  .md-acts{grid-column:4;grid-row:1/span 2}
  .md-act[data-k=quiet]{display:none}
  .md-tline,.md-hours{display:none}
  .md-alist{display:block}
  .md-wrap{grid-template-columns:minmax(0,1fr)}
  .md-jobs{grid-template-columns:minmax(0,1fr)}
  .md-runway{grid-auto-columns:40px}
  .md-search{max-width:none}
}
.md-alist li{display:grid;grid-template-columns:72px minmax(0,1fr);gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--md-line) 70%,transparent)}
.md-alist time{font-size:13px;font-weight:900;color:var(--md-text);font-variant-numeric:tabular-nums}
.md-alist a{color:var(--md-text);text-decoration:none;font-weight:750;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (prefers-reduced-motion: reduce){.md *{animation:none!important;transition:none!important}}
`;

/* ── Small pieces ──────────────────────────────────────────────────────── */

function Ring({ pct, onClick, active }: { pct: number; onClick: () => void; active: boolean }) {
  const r = 50, c = 2 * Math.PI * r;
  const color = pct >= 90 ? 'var(--md-green)' : pct >= 70 ? 'var(--md-amber)' : 'var(--md-red)';
  return (
    <button type="button" className="md-ring" onClick={onClick} aria-pressed={active} aria-label={`${pct}% of your open work is on time. Show what is late.`}>
      <svg width="118" height="118" viewBox="0 0 118 118" aria-hidden="true">
        <circle cx="59" cy="59" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="11" />
        <circle cx="59" cy="59" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <b>{pct}%<small>On time</small></b>
    </button>
  );
}

type Filter = BoardFilter & { label?: string };

export interface ClockState { onClock: boolean; todayHours: number; weekHours: number }

function Clock_({ clock }: { clock: ClockState | null | 'none' }) {
  if (clock === 'none') return null;
  const on = !!clock && clock !== null && clock.onClock;
  const h = (n: number) => `${Math.floor(n)}h ${String(Math.round((n % 1) * 60)).padStart(2, '0')}m`;
  return (
    <div className="md-clock" data-on={on}>
      <span className="md-pulse" aria-hidden="true" />
      <div className="md-clock-face">
        <b>{clock ? h(clock.todayHours) : '—'}</b>
        <span>{clock ? (on ? `On the clock · ${clock.weekHours.toFixed(1)}h this week` : `Off the clock · ${clock.weekHours.toFixed(1)}h this week`) : 'Reading your clock…'}</span>
      </div>
      <Link className="md-btn" data-k={on ? undefined : 'primary'} href="/app/time">
        <Clock size={18} weight="bold" />{on ? 'Clock out' : 'Clock in'}
      </Link>
    </div>
  );
}

function DayRow({ it, ctl, today, jobs, showMoney }: { it: MyWorkItem; ctl: RowControl; today: string; jobs: Jobs; showMoney: boolean }) {
  const k = kindOf(it);
  const { Icon, color } = KIND_UI[k];
  const busy = ctl.busy[it.key];
  const note = ctl.notes[it.key];
  const due = countdown(it, today);
  const tone = whenOf(it, today) === 'late' ? 'red' : it.tone;
  const a = it.action;
  const canRemind = a?.kind === 'remind' && ctl.portalOn(it.packageId, it.portalOn);
  const jobName = it.projectId ? jobs[it.projectId]?.name : null;
  // The meta line already carries the job name; drop it there so it reads once, as the chip.
  const meta = jobName ? it.meta.split(' · ').filter((s) => s !== jobName).join(' · ') : it.meta;

  let primary: React.ReactNode = null;
  if (a?.kind === 'portal') primary = <button type="button" className="md-act" data-k="primary" disabled={!!busy} onClick={() => ctl.turnOn(it)}>{busy || a.label}</button>;
  else if (canRemind) primary = <button type="button" className="md-act" data-k="primary" disabled={!!busy} onClick={() => ctl.remind(it)}><BellRinging size={15} weight="bold" />{busy || a!.label}</button>;
  else if (a?.kind === 'ask_coi') primary = <button type="button" className="md-act" data-k="primary" disabled={!!busy} onClick={() => ctl.askCoi(it)}>{busy || a.label}</button>;
  else if (a?.kind === 'link') primary = <Link className="md-act" href={a.href}>{a.label}</Link>;

  return (
    <li className="md-row" data-tone={tone} data-key={it.key}>
      <span className="md-rail" aria-hidden="true" />
      <span className="md-ic" style={{ ['--k' as string]: color }} aria-hidden="true"><Icon size={20} weight="duotone" /></span>
      <div className="md-what">
        <Link className="md-tl" href={it.href}>{it.title}</Link>
        <div className="md-meta">
          {jobName && <span className="md-job" style={{ ['--j' as string]: jobColor(it.projectId, jobs) }}><i /><b>{jobName}</b></span>}
          {note ? <span className="md-note">{note}</span> : null}
          {meta && <span>{meta}</span>}
        </div>
      </div>
      <span className="md-due" data-tone={due.tone}>{due.text}</span>
      {showMoney ? <span className="md-amt">{it.amount ? money(it.amount) : ''}</span> : <span />}
      <div className="md-acts">
        {it.done && <button type="button" className="md-act" data-k="quiet" disabled={!!busy} onClick={() => ctl.done(it)} aria-label={`Mark done: ${it.title}`}><Check size={16} weight="bold" />Done</button>}
        {ctl.snoozeReady && <button type="button" className="md-act" data-k="quiet" disabled={!!busy} onClick={() => ctl.snooze(it)} aria-label={`Snooze until tomorrow: ${it.title}`}>Snooze</button>}
        {primary ?? <CaretRight size={18} weight="bold" style={{ color: 'var(--md-3)' }} aria-hidden="true" />}
      </div>
    </li>
  );
}

/** Arrow keys move between rows; Enter opens (the title is a link). */
function onListKeys(e: React.KeyboardEvent<HTMLUListElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const links = [...(e.currentTarget.closest('.md') as HTMLElement).querySelectorAll<HTMLAnchorElement>('.md-tl')];
  const i = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (i < 0) return;
  e.preventDefault();
  links[Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
}

function Rows({ items, ...p }: { items: MyWorkItem[]; ctl: RowControl; today: string; jobs: Jobs; showMoney: boolean; label: string }) {
  return (
    <ul className="md-list" aria-label={p.label} onKeyDown={onListKeys}>
      {items.map((it) => <DayRow key={it.key} it={it} ctl={p.ctl} today={p.today} jobs={p.jobs} showMoney={p.showMoney} />)}
    </ul>
  );
}

function Section({ id, count, amount, showMoney, children }: { id: SectionId; count?: number; amount?: number; showMoney: boolean; children: React.ReactNode }) {
  const meta = SECTION_META[id];
  return (
    <section className="md-sec" aria-labelledby={`md-${id}`} data-section={id}>
      <header className="md-sec-h">
        <div className="md-h2" role="heading" aria-level={2} id={`md-${id}`}>{meta.label}</div>
        <span className="md-when">{meta.time}</span>
        {count != null && <span className="md-count">{count}{showMoney && amount ? ` · ${money(amount)}` : ''}</span>}
      </header>
      {children}
    </section>
  );
}

/* ── The board ─────────────────────────────────────────────────────────── */

export interface MyDayBoardProps {
  items: MyWorkItem[];
  today: string;
  zone: string;
  jobs: Jobs;
  agenda: AgendaEvent[];
  roles: string[];
  companyWide: boolean;
  canSeeCompany: boolean;
  prefs: MyDayPrefs;
  ctl: RowControl;
  clock: ClockState | null | 'none';
  failures: Array<{ label: string }>;
  onRetry: () => void;
  onCustomize: () => void;
  onScope: (s: 'company' | 'mine') => void;
}

export default function MyDayBoard(props: MyDayBoardProps) {
  const { items: all, today, zone, jobs, agenda, prefs, ctl } = props;
  const [filter, setFilter] = useState<Filter>({});
  const [q, setQ] = useState('');
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMin(nowMinutes(zone));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [zone]);

  const items = useMemo(() => applyFilter(all, { ...filter, q }, today), [all, filter, q, today]);
  const press = useMemo(() => pressure(all, today), [all, today]);
  const vis = visibleSections(prefs);
  const placed = useMemo(() => placeItems(items, { waiting: vis.includes('waiting'), wrapup: vis.includes('wrapup'), late: vis.includes('late') }, today), [items, vis.join(','), today]); // eslint-disable-line react-hooks/exhaustive-deps
  const kinds = useMemo(() => {
    const m = new Map<ItemKind, number>();
    for (const it of applyFilter(all, { ...filter, kind: null, q }, today)) m.set(kindOf(it), (m.get(kindOf(it)) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all, filter, q, today]);

  const toggle = (f: Filter) => setFilter((cur) => {
    const same = Object.entries(f).every(([k, v]) => k === 'label' || (cur as Record<string, unknown>)[k] === v);
    if (same) { const n = { ...cur }; for (const k of Object.keys(f)) delete (n as Record<string, unknown>)[k]; delete n.label; return n; }
    return { ...cur, ...f };
  });
  const chips: Array<{ k: keyof BoardFilter; text: string }> = [];
  if (filter.when) chips.push({ k: 'when', text: { late: 'Late', today: 'Today', week: 'This week', later: 'Later', waiting: 'Waiting on others' }[filter.when] });
  if (filter.day) chips.push({ k: 'day', text: filter.day === 'late' ? 'Late' : filter.day === today ? 'Today' : `${MONTH[+filter.day.slice(5, 7) - 1].slice(0, 3)} ${+filter.day.slice(8, 10)}` });
  if (filter.projectId !== undefined && filter.projectId !== null) chips.push({ k: 'projectId', text: filter.projectId === '__none' ? 'Company-wide' : jobs[filter.projectId]?.name ?? 'Job' });
  if (filter.kind) chips.push({ k: 'kind', text: KIND_LABEL[filter.kind] });
  const filtered = chips.length > 0 || !!q.trim();

  const d = parseDay(today);
  const show = prefs.showMoney;
  const common = { ctl, today, jobs, showMoney: show };

  /* Start band */
  const start = (
    <section className="md-start" aria-label="Start of day">
      <div className="md-id">
        <div className="md-dow">My Day · {WEEKDAY[d.getUTCDay()]}</div>
        <div className="md-date" role="heading" aria-level={1}>{MONTH[d.getUTCMonth()]} {d.getUTCDate()}</div>
        <div className="md-sub">
          {props.roles.slice(0, 3).map((r) => <span key={r} className="md-role">{roleLabel(r)}</span>)}
          {props.canSeeCompany && (
            <span className="md-scope" role="group" aria-label="Whose work">
              <button type="button" aria-pressed={props.companyWide} onClick={() => props.onScope('company')}><Buildings size={13} weight="bold" style={{ verticalAlign: '-2px', marginRight: 4 }} />Company</button>
              <button type="button" aria-pressed={!props.companyWide} onClick={() => props.onScope('mine')}>My jobs</button>
            </span>
          )}
        </div>
      </div>
      <div className="md-press">
        <Ring pct={press.onTimePct} active={filter.when === 'late'} onClick={() => toggle({ when: 'late' })} />
        <div className="md-nums" role="group" aria-label="Your numbers — tap to filter">
          <button type="button" className="md-num" data-tone={press.late ? 'red' : 'zero'} aria-pressed={filter.when === 'late'} onClick={() => toggle({ when: 'late' })}><b>{press.late}</b><span>Late</span></button>
          <button type="button" className="md-num" data-tone={press.today ? 'amber' : 'zero'} aria-pressed={filter.when === 'today'} onClick={() => toggle({ when: 'today' })}><b>{press.today}</b><span>Today</span></button>
          <button type="button" className="md-num" data-tone={press.week ? undefined : 'zero'} aria-pressed={filter.when === 'week'} onClick={() => toggle({ when: 'week' })}><b>{press.week}</b><span>This week</span></button>
          {show && <button type="button" className="md-num" data-tone={press.atStake ? 'green' : 'zero'} aria-pressed={false} onClick={() => toggle({ when: 'today' })} title="Money tied to what is late or due today"><b>{money(press.atStake)}</b><span>At stake</span></button>}
          <button type="button" className="md-num" data-tone={press.waiting ? undefined : 'zero'} aria-pressed={filter.when === 'waiting'} onClick={() => toggle({ when: 'waiting' })}><b>{press.waiting}</b><span><em className="md-long">Waiting on others</em><em className="md-short">Waiting</em></span></button>
        </div>
      </div>
      <div className="md-side">
        <Clock_ clock={props.clock} />
        <button type="button" className="md-btn" onClick={props.onCustomize} aria-label="Customize My Day"><SlidersHorizontal size={18} weight="bold" /><span className="md-long">Customize</span></button>
      </div>
    </section>
  );

  /* Agenda */
  const span = Math.max(4, prefs.dayEnd - prefs.dayStart);
  const pctOf = (min: number) => ((min - prefs.dayStart * 60) / (span * 60)) * 100;
  const timed = agenda.filter((e) => minutesOf(e.start) != null);
  const untimed = agenda.filter((e) => minutesOf(e.start) == null);
  const lanes: Array<Array<{ e: AgendaEvent; s: number; f: number }>> = [];
  for (const e of timed) {
    const s = minutesOf(e.start)!;
    const f = Math.max(s + 30, minutesOf(e.end) ?? s + 60);
    const lane = lanes.find((l) => l[l.length - 1].f <= s);
    if (lane) lane.push({ e, s, f }); else lanes.push([{ e, s, f }]);
  }
  const anytime = all.filter((it) => (kindOf(it) === 'inspection' || kindOf(it) === 'job' || it.tone === 'gold') && it.day === today);
  const agendaEl = (
    <Section id="agenda" count={agenda.length + anytime.length} showMoney={false}>
      <div className="md-agenda">
        <div className="md-tline" style={{ ['--hw' as string]: `${100 / span}%`, ['--h' as string]: lanes.length ? `${lanes.length * 46 + 12}px` : '52px' }}>
          {lanes.flatMap((lane, li) => lane.map(({ e, s, f }) => {
            const left = Math.max(0, pctOf(s)), right = Math.min(100, pctOf(f));
            if (right <= 0 || left >= 100) return null;
            return (
              <Link key={e.id} href={e.href} className="md-ev" data-past={nowMin != null && f < nowMin}
                style={{ left: `${left}%`, width: `calc(${Math.max(right - left, 0)}% - 4px)`, top: 6 + li * 46, ['--j' as string]: jobColor(e.projectId, jobs) }}
                title={`${timeLabel(e.start)}${e.end ? `–${timeLabel(e.end)}` : ''} · ${e.title}${e.location ? ` · ${e.location}` : ''}`}>
                <b>{e.title}</b>
                <span>{timeLabel(e.start)}{e.projectId && jobs[e.projectId] ? ` · ${jobs[e.projectId].name}` : ''}</span>
              </Link>
            );
          }))}
          {nowMin != null && pctOf(nowMin) >= 0 && pctOf(nowMin) <= 100 && (
            <span className="md-now" style={{ left: `${pctOf(nowMin)}%` }} data-t={timeLabel(`${Math.floor(nowMin / 60)}:${String(nowMin % 60).padStart(2, '0')}`)} aria-hidden="true" />
          )}
          {!timed.length && <div className="md-tline-empty">No meetings on the calendar today</div>}
        </div>
        <div className="md-hours" aria-hidden="true">
          {Array.from({ length: span + 1 }, (_, i) => <span key={i} style={{ left: `${(i / span) * 100}%` }}>{hourLabel(prefs.dayStart + i).replace(' ', '')}</span>)}
        </div>
        <ul className="md-alist" aria-label="Today's meetings">
          {timed.length ? timed.map((e) => <li key={e.id}><time>{timeLabel(e.start)}</time><Link href={e.href}>{e.title}</Link></li>) : <li><time>—</time><span style={{ color: 'var(--md-3)' }}>No meetings today</span></li>}
        </ul>
        {(anytime.length > 0 || untimed.length > 0) && (
          <div className="md-anytime">
            <em>Anytime today</em>
            {untimed.map((e) => <Link key={e.id} href={e.href} className="md-pill" style={{ ['--k' as string]: 'var(--kind-followup)' }}><CalendarCheck size={16} weight="duotone" /><span>{e.title}</span></Link>)}
            {anytime.map((it) => { const { Icon, color } = KIND_UI[kindOf(it)]; return <Link key={it.key} href={it.href} className="md-pill" style={{ ['--k' as string]: color }}><Icon size={16} weight="duotone" /><span>{it.title}</span></Link>; })}
          </div>
        )}
      </div>
    </Section>
  );

  const list = (id: SectionId, rows: MyWorkItem[], empty: string) => (filtered && !rows.length ? null :
    <Section key={id} id={id} count={rows.length} amount={rows.reduce((s, i) => s + Math.abs(i.amount || 0), 0)} showMoney={show}>
      {rows.length ? <Rows items={rows} {...common} label={SECTION_META[id].label} /> : <div className="md-empty"><Check size={18} weight="bold" />{filtered ? 'Nothing here with these filters.' : empty}</div>}
    </Section>
  );

  /* Wrap-up */
  const wrapupEl = (
    <Section id="wrapup" count={placed.wrapup.length + placed.tomorrow.length} showMoney={false}>
      <div className="md-wrap">
        <div>
          <h3>Close out today</h3>
          {placed.wrapup.length ? <Rows items={placed.wrapup} {...common} label="Close out today" /> : (
            <div className="md-empty"><Check size={18} weight="bold" />No daily log owed today.</div>
          )}
          {props.clock && props.clock !== 'none' && props.clock.onClock && (
            <div className="md-empty" style={{ color: 'var(--md-text)' }}>
              <MoonStars size={18} weight="duotone" style={{ color: 'var(--md-amber)' }} />On the clock — clock out when you leave.
              <Link className="md-act" href="/app/time">Clock out</Link>
            </div>
          )}
        </div>
        <div>
          <h3>First thing tomorrow</h3>
          {placed.tomorrow.length ? <Rows items={placed.tomorrow.slice(0, 5)} {...common} label="First thing tomorrow" /> : (
            <div className="md-empty"><SunHorizon size={18} weight="duotone" style={{ color: 'var(--md-amber)' }} />Nothing due tomorrow yet.</div>
          )}
        </div>
      </div>
    </Section>
  );

  /* Next two weeks: runway + grouped list */
  const cols = useMemo(() => runway(applyFilter(all, { ...filter, day: null, q }, today), today, prefs.runwayDays), [all, filter, q, today, prefs.runwayDays]);
  const max = Math.max(1, ...cols.map((c) => c.total));
  const horizon = addDays(today, prefs.runwayDays - 1);
  const upcoming = placed.upcoming;
  const groups = useMemo(() => {
    if (prefs.upcomingGroup === 'day') {
      const m = new Map<string, MyWorkItem[]>();
      for (const it of upcoming) { const k = it.day ?? 'none'; m.set(k, [...(m.get(k) || []), it]); }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, its]) => ({
        key: k, label: k === 'none' ? 'No date' : `${WEEKDAY[parseDay(k).getUTCDay()].slice(0, 3)} ${MONTH[+k.slice(5, 7) - 1].slice(0, 3)} ${+k.slice(8, 10)}`,
        color: null as string | null, items: its, amount: its.reduce((s, i) => s + Math.abs(i.amount || 0), 0),
      }));
    }
    return groupItems(upcoming, prefs.upcomingGroup === 'job' ? 'job' : 'type', today, jobs).map((g) => ({
      key: g.key, label: g.label, items: g.items, amount: g.amount,
      color: prefs.upcomingGroup === 'job' ? jobColor(g.key === '__none' ? null : g.key, jobs) : KIND_UI[g.key as ItemKind]?.color ?? null,
    }));
  }, [upcoming, prefs.upcomingGroup, today, jobs]);

  const weekEl = (
    <Section id="week" count={upcoming.length} amount={upcoming.reduce((s, i) => s + Math.abs(i.amount || 0), 0)} showMoney={show}>
      <div className="md-runway" role="group" aria-label={`Work due each day through ${horizon}. Tap a day to filter.`}>
        {cols.map((c) => {
          const h = c.total ? Math.max(8, (c.total / max) * 100) : 4;
          const late = c.day === 'late';
          const pd = late ? null : parseDay(c.day);
          return (
            <button key={c.day} type="button" className="md-day" data-late={late} data-today={c.isToday} data-weekend={c.weekend} data-zero={c.total === 0}
              aria-pressed={filter.day === c.day} onClick={() => toggle({ day: c.day })}
              title={`${late ? 'Late' : c.isToday ? 'Today' : `${WEEKDAY[pd!.getUTCDay()]} ${MONTH[pd!.getUTCMonth()]} ${pd!.getUTCDate()}`}: ${c.total} item${c.total === 1 ? '' : 's'}`}>
              <b>{c.total}</b>
              <span className="md-stack" style={{ height: h }}>
                {(['red', 'amber', 'gold', 'grey'] as const).map((t) => c[t] ? <i key={t} data-t={t} style={{ height: `${(c[t] / c.total) * 100}%` }} /> : null)}
              </span>
              <span className="md-dl">
                <small>{late ? 'Late' : c.isToday ? 'Today' : WEEKDAY[pd!.getUTCDay()].slice(0, 2)}</small>
                <span>{late ? '!' : pd!.getUTCDate()}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="md-legend" aria-hidden="true">
        <span><i style={{ background: 'var(--md-red)' }} />Late / at risk</span>
        <span><i style={{ background: 'var(--md-amber)' }} />Due soon</span>
        <span><i style={{ background: 'var(--md-gold)' }} />Happening</span>
        <span><i style={{ background: 'var(--md-planned)' }} />Planned</span>
      </div>
      {groups.length ? groups.map((g) => (
        <div key={g.key}>
          <div className="md-group" style={g.color ? { ['--g' as string]: g.color } : undefined}>
            {g.color && <i />}{g.label}<em>{g.items.length}</em>{show && g.amount ? <b>{money(g.amount)}</b> : null}
          </div>
          <Rows items={g.items} {...common} label={g.label} />
        </div>
      )) : <div className="md-empty"><Check size={18} weight="bold" />{filtered ? 'Nothing coming up with these filters.' : 'Nothing else on the books for the next two weeks.'}</div>}
    </Section>
  );

  /* Jobs */
  const heat = useMemo(() => jobHeat(applyFilter(all, { ...filter, projectId: null, q }, today), jobs, today), [all, filter, q, today, jobs]);
  const maxOpen = Math.max(1, ...heat.map((h) => h.open));
  const jobsEl = (
    <Section id="jobs" count={heat.length} showMoney={false}>
      {heat.length ? (
        <ul className="md-jobs" aria-label="Open work by job">
          {heat.map((h) => {
            const key = h.projectId ?? '__none';
            const c = jobColor(h.projectId, jobs);
            return (
              <li key={key}>
                <button type="button" className="md-jobrow" aria-pressed={filter.projectId === key} onClick={() => toggle({ projectId: key })} style={{ ['--j' as string]: c }}>
                  <span className="md-jobname"><i /><span>{h.name}</span></span>
                  <span className="md-jobstat">{h.open} open{h.late ? <> · <em>{h.late} late</em></> : null}{show && h.amount ? ` · ${money(h.amount)}` : ''}</span>
                  <span className="md-jobbar" aria-hidden="true">
                    <i style={{ width: `${(h.open / maxOpen) * 100}%` }} />
                    {h.late ? <i style={{ width: `${(h.late / maxOpen) * 100}%` }} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <div className="md-empty"><Check size={18} weight="bold" />No open work on any job.</div>}
    </Section>
  );

  const render: Record<SectionId, React.ReactNode> = {
    start,
    agenda: filtered ? null : agendaEl,
    late: list('late', placed.late, 'Nothing late. Clean slate.'),
    today: list('today', placed.today, 'Nothing else due today.'),
    waiting: list('waiting', placed.waiting, 'Nobody owes you anything right now.'),
    wrapup: filtered && !placed.wrapup.length && !placed.tomorrow.length ? null : wrapupEl,
    week: weekEl,
    jobs: filtered && !heat.length ? null : jobsEl,
  };

  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="md" data-density={prefs.density}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {render.start}
      {props.failures.length > 0 && (
        <p className="md-fail" role="status">
          Couldn&apos;t load {props.failures.map((f) => f.label).join(', ')}.
          <button type="button" className="md-act" onClick={props.onRetry}><ArrowsClockwise size={15} weight="bold" />Retry</button>
        </p>
      )}
      <div className="md-filters">
        <label className="md-search">
          <MagnifyingGlass size={17} weight="bold" aria-hidden="true" />
          <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your day" aria-label="Search your day" />
        </label>
        <div className="md-kinds" role="group" aria-label="Kinds of work">
          {kinds.slice(0, 7).map(([k, n]) => {
            const { Icon, color } = KIND_UI[k];
            return (
              <button key={k} type="button" className="md-kind" style={{ ['--k' as string]: color }} aria-pressed={filter.kind === k} onClick={() => toggle({ kind: k })}>
                <Icon size={15} weight="duotone" style={{ color }} />{KIND_LABEL[k]}<i>{n}</i>
              </button>
            );
          })}
        </div>
        {chips.map((c) => (
          <span key={c.k} className="md-chip"><Lightning size={13} weight="fill" />{c.text}
            <button type="button" aria-label={`Remove filter ${c.text}`} onClick={() => setFilter((f) => { const n = { ...f }; delete n[c.k]; return n; })}><X size={13} weight="bold" /></button>
          </span>
        ))}
        {filtered && <button type="button" className="md-clear" onClick={() => { setFilter({}); setQ(''); }}>Clear all</button>}
      </div>
      {vis.filter((s) => s !== 'start').map((s) => <React.Fragment key={s}>{render[s]}</React.Fragment>)}
      {!all.length && (
        <div className="md-empty" style={{ justifyContent: 'center', padding: '28px 0' }}>
          <Hourglass size={20} weight="duotone" style={{ color: 'var(--md-neon)' }} />Nothing assigned to you yet — a PM adds you to a job from its Team page.
          <Link className="md-act" href="/app/projects">Jobs</Link>
        </div>
      )}
    </div>
  );
}

export { holderOf };
