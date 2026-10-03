'use client';
/**
 * My Work — the signed-in user's whole day on one page.
 *
 * One card per assigned project (assignment lives in work_assignments, made
 * from Project → Team), with every open item that carries the user's name —
 * to-dos, RFIs, punch, field issues, T&M awaiting approval, assists — grouped
 * by module and deep-linked to where the work gets done.
 *
 * Server shape (/api/my-work): {projects:[{project:{id,name,status},role,scope,
 * counts:{todos,rfis,punch,issues,tmAwaiting,assists,overdue,dueToday},
 * items:{todos,rfis,punch,issues,tm,assists}}],totals}. Built in parallel —
 * every read below tolerates a missing key so loading/partial payloads never
 * crash the hub.
 */
import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Briefcase, ListChecks, ChatCenteredText, Hammer, Warning, Receipt, Handshake,
  ArrowRight, WarningCircle, FolderSimple, CalendarCheck, ClockCountdown, Stamp,
} from '@phosphor-icons/react';
import { colors } from '../../../lib/design-tokens';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, IconChip, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';
import { accentForProject, projectMonogram } from '@/lib/project-identity';
import { moduleAccent } from '@/lib/module-identity';

const GOLD = colors.gold, DIM = colors.textMuted, TEXT = colors.text, RED = colors.red;
const PANEL = 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))';
const PANEL_BORDER = 'rgba(255,255,255,0.08)';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

/* ── Module groups — key into items{}, accent key, deep-link fallback ──────── */
const MODULE_GROUPS = [
  { key: 'todos', accent: 'todos', label: 'To-Dos', icon: ListChecks, fallback: 'To-do', href: (pid: string) => `/app/projects/${pid}/todos` },
  { key: 'rfis', accent: 'rfis', label: 'RFIs', icon: ChatCenteredText, fallback: 'RFI', href: (pid: string) => `/app/projects/${pid}/rfis` },
  { key: 'punch', accent: 'punch', label: 'Punch List', icon: Hammer, fallback: 'Punch item', href: (pid: string) => `/app/projects/${pid}/punch-list` },
  { key: 'issues', accent: 'safety', label: 'Field Issues', icon: Warning, fallback: 'Field issue', href: (pid: string) => `/app/projects/${pid}/safety` },
  { key: 'tm', accent: 'tm', label: 'T&M Awaiting Approval', icon: Receipt, fallback: 'T&M ticket', href: (pid: string) => `/app/projects/${pid}/tm-tickets` },
  { key: 'assists', accent: 'team', label: 'Assists — Ball in Your Court', icon: Handshake, fallback: 'Assist', href: (pid: string) => `/app/projects/${pid}/rfis` },
] as const;

/* ── Tolerant item readers — the item payloads come from six different tables ── */
const DONE_RE = /^(done|closed|complete|completed|resolved|verified|approved|billed|rejected|ended)$/i;
function itemTitle(it: any, fallback: string): string {
  const t = it?.title || it?.subject || it?.name || it?.description || it?.question;
  return String(t || fallback);
}
function itemStatus(it: any): string {
  return String(it?.status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function parseDue(it: any): Date | null {
  const raw = it?.due_date || it?.dueDate || it?.due || it?.needed_by || it?.date_needed || null;
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  // Date-only strings parse as LOCAL midnight (UTC parsing shifts the day west of GMT).
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}
function isOverdue(it: any, todayStart: number): boolean {
  if (it?.overdue === true) return true;
  if (DONE_RE.test(String(it?.status || ''))) return false;
  const d = parseDue(it);
  return !!d && d.getTime() < todayStart;
}

/* ── One work item row — icon chip · title · status pill · due date · link ── */
function ItemRow({ it, group, pid, todayStart }: { it: any; group: (typeof MODULE_GROUPS)[number]; pid: string; todayStart: number }) {
  const acc = moduleAccent(group.accent);
  const Icon = group.icon;
  const overdue = isOverdue(it, todayStart);
  const due = parseDue(it);
  const dueToday = !!due && due.getTime() >= todayStart && due.getTime() < todayStart + 86_400_000;
  const dueLabel = due ? (dueToday ? 'Due today' : `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`) : null;
  const status = itemStatus(it);
  const href = typeof it?.href === 'string' && it.href ? it.href : group.href(pid);
  return (
    <Link
      href={href}
      className="pmHover"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
        padding: '10px 12px', borderRadius: 12,
        background: overdue ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${overdue ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: acc.soft, border: `1px solid ${acc.ring}` }}>
        <Icon size={15} weight="duotone" color={acc.hex} />
      </span>
      <span style={{ flex: 1, minWidth: 0, color: TEXT, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {itemTitle(it, group.fallback)}
      </span>
      {status && (
        <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'rgba(148,163,184,0.12)', color: DIM, whiteSpace: 'nowrap' as const }}>
          {status}
        </span>
      )}
      {overdue && (
        <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, padding: '3px 9px', borderRadius: 999, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)', color: RED, whiteSpace: 'nowrap' as const }}>
          OVERDUE
        </span>
      )}
      {dueLabel && !overdue && (
        <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: dueToday ? 800 : 600, color: dueToday ? 'var(--brand-primary-strong)' : colors.textDim, whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' as const }}>
          {dueLabel}
        </span>
      )}
      {dueLabel && overdue && (
        <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: RED, whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' as const }}>
          {dueLabel}
        </span>
      )}
      <ArrowRight size={13} weight="bold" color={colors.textDim} style={{ flexShrink: 0 }} />
    </Link>
  );
}

export default function MyWorkPage() {
  const { data, error, isLoading } = useSWR('/api/my-work', fetcher, {
    refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 10_000,
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const rows: any[] = Array.isArray(data?.projects) ? data.projects : [];
  const sumCount = (k: string) => rows.reduce((n, p) => n + (Number(p?.counts?.[k]) || 0), 0);
  const totals: any = data?.totals || {};
  const dueToday = Number(totals.dueToday ?? sumCount('dueToday')) || 0;
  const overdue = Number(totals.overdue ?? sumCount('overdue')) || 0;
  const awaiting = Number(totals.tmAwaiting ?? sumCount('tmAwaiting')) || 0;
  const openItems = rows.reduce((n, p) => n + MODULE_GROUPS.reduce((m, g) => m + ((p?.items?.[g.key] || []) as any[]).length, 0), 0);

  const roleLabel = (r?: string) => String(r || 'assignee').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  /* Sales follow-ups hang off a lead, not a project, so they are read straight
     off the payload and rendered whether or not this person holds a single
     work_assignment. A salesperson with a full pipeline and no assigned project
     used to get "Nothing assigned to you yet" while owing four people a call. */
  const followUps: any[] = Array.isArray(data?.followUps) ? data.followUps : [];
  const fuCounts = data?.followUpCounts || { overdue: 0, today: 0, upcoming: 0 };
  const fuOverdue = followUps.filter((f) => f.bucket === 'overdue');
  const fuToday = followUps.filter((f) => f.bucket === 'today');
  const fuUpcoming = followUps.filter((f) => f.bucket === 'upcoming');
  const fuMoney = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const dueLabel = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    if (!m) return d;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const FollowUpRow = ({ f, tone }: { f: any; tone: string }) => (
    <Link
      href="/app/leads"
      className="pmBtn"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
        borderRadius: 10, background: PANEL, border: `1px solid ${PANEL_BORDER}`,
        borderLeft: `3px solid ${tone}`, textDecoration: 'none', color: TEXT,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.company}
          {f.contact ? <span style={{ color: DIM, fontWeight: 400 }}>{'  ·  '}{f.contact}</span> : null}
        </div>
        <div style={{ fontSize: 12, color: DIM, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.action}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: tone }}>{dueLabel(f.due)}</div>
        <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{f.stage}{f.value ? `  ·  ${fuMoney(f.value)}` : ''}</div>
      </div>
      <ArrowRight size={13} weight="bold" color={colors.textDim} style={{ flexShrink: 0 }} />
    </Link>
  );

  return (
    <PremiumSurface maxWidth={1200}>
      <ModuleHero
        eyebrow="My Work"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('work').vivid ?? moduleAccent('work').hex}><Briefcase size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={moduleAccent('work').hex}
        title="Your"
        accent="Day"
        subtitle={isLoading
          ? 'Pulling everything with your name on it…'
          : rows.length
            ? `${openItems} open item${openItems === 1 ? '' : 's'} across ${rows.length} assigned project${rows.length === 1 ? '' : 's'} — refreshed live.`
            : 'Every to-do, RFI, punch item, field issue, and T&M ticket assigned to you — one page, every project.'}
        actions={<Link href="/app/projects" style={ghostButtonStyle} className="pmBtn"><FolderSimple size={15} weight="bold" /> All Projects</Link>}
      />

      {/* Stat strip — the day at a glance */}
      {!isLoading && !error && rows.length > 0 && (
        <StatStrip items={[
          {href: '/app/my-work',  label: 'Assigned Projects', value: String(rows.length), icon: <Briefcase size={11} weight="bold" /> },
          {href: '/app/my-work', label: 'Due Today', value: String(dueToday), accent: dueToday > 0 ? 'var(--brand-primary-strong)' : undefined, icon: <CalendarCheck size={11} weight="bold" />, sub: dueToday > 0 ? 'Needs attention today' : 'Nothing lands today' },
          {href: '/app/my-work', label: 'Overdue', value: String(overdue), accent: overdue > 0 ? RED : undefined, icon: <ClockCountdown size={11} weight="bold" />, sub: overdue > 0 ? 'Past their due date' : 'All caught up' },
          {href: '/app/my-work',  label: 'Awaiting My Approval', value: String(awaiting), accent: awaiting > 0 ? GOLD : undefined, icon: <Stamp size={11} weight="bold" />, sub: 'T&M tickets to sign off' },
        ]} />
      )}

      {/* Error */}
      {error && !isLoading && (
        <SectionCard flat>
          <PremiumEmpty
            tone="error"
            icon={<WarningCircle size={30} weight="duotone" color={RED} />}
            title="Couldn't load your work"
            description="The hub couldn't reach the server. It retries automatically every minute — or reload now."
            compact
          />
        </SectionCard>
      )}

      {/* First-load skeletons — shaped like the project cards they become */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="pmSkeleton" style={{ height: 74, borderRadius: 14, background: PANEL, border: `1px solid ${PANEL_BORDER}` }} />
          {[1, 2].map((i) => (
            <div key={i} className="pmSkeleton" style={{ background: PANEL, border: `1px solid ${PANEL_BORDER}`, borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ height: 14, width: '32%', borderRadius: 6, background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ height: 18, width: 110, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }} />
              </div>
              {[1, 2, 3].map((r) => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.07)' }} />
                  <div style={{ height: 12, flex: 1, maxWidth: `${62 - r * 9}%`, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ height: 16, width: 64, borderRadius: 999, background: 'rgba(255,255,255,0.05)' }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Sales follow-ups — what you owe somebody, soonest first */}
      {!isLoading && !error && followUps.length > 0 && (
        <SectionCard
          title="Sales Follow-Ups"
          subtitle={`${fuCounts.overdue} past due · ${fuCounts.today} today · ${fuCounts.upcoming} in the next two weeks`}
          action={<Link href="/app/leads" style={ghostButtonStyle} className="pmBtn"><Handshake size={15} weight="bold" /> Open Pipeline</Link>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { list: fuOverdue, label: 'Past Due', tone: RED },
              { list: fuToday, label: 'Today', tone: 'var(--brand-primary-strong)' },
              { list: fuUpcoming, label: 'Next Two Weeks', tone: colors.textDim },
            ].filter((g) => g.list.length > 0).map((g) => (
              <div key={g.label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: g.tone, marginBottom: 7 }}>
                  {g.label} · {g.list.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {g.list.map((f: any) => <FollowUpRow key={f.id} f={f} tone={g.tone} />)}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Global empty state — teach how assignment works */}
      {!isLoading && !error && rows.length === 0 && followUps.length === 0 && (
        <SectionCard>
          <PremiumEmpty
            icon={<Briefcase size={32} weight="duotone" color={GOLD} />}
            title="Nothing assigned to you yet"
            description="A PM assigns you a project from Project → Team. The moment they do, every open to-do, RFI, punch item, field issue, and T&M ticket with your name on it lands here — with due dates, overdue flags, and one-tap deep links."
            action={<Link href="/app/projects" style={goldButtonStyle} className="pmBtn"><FolderSimple size={15} weight="bold" /> Browse Projects</Link>}
          />
        </SectionCard>
      )}

      {/* One card per assigned project */}
      {!isLoading && !error && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {rows.map((p: any, idx: number) => {
            const proj = p?.project || {};
            const pid = String(proj.id || '');
            const acc = accentForProject(pid);
            const counts = p?.counts || {};
            const groups = MODULE_GROUPS
              .map((g) => ({ g, items: (Array.isArray(p?.items?.[g.key]) ? p.items[g.key] : []) as any[] }))
              .filter((x) => x.items.length > 0);
            const projOverdue = Number(counts.overdue) || 0;
            const projDueToday = Number(counts.dueToday) || 0;
            // Counts and item lists arrive from the same endpoint but items may
            // be capped server-side — never show "all clear" while counts say otherwise.
            const countOpen = ['todos', 'rfis', 'punch', 'issues', 'tmAwaiting', 'assists'].reduce((n, k) => n + (Number(counts[k]) || 0), 0);
            return (
              <SectionCard flat
                key={pid || idx}
                accent={acc.hex}
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                    {/* Project identity chip — deterministic accent, same as everywhere else */}
                    <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: acc.soft, border: `1px solid ${acc.ring}`, color: acc.hex, fontSize: 11, fontWeight: 900, letterSpacing: '0.03em' }}>
                      {projectMonogram(proj.name)}
                    </span>
                    <span style={{ color: acc.hex }}>{proj.name || 'Untitled Project'}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: acc.soft, border: `1px solid ${acc.ring}`, color: acc.hex, whiteSpace: 'nowrap' as const }}>
                      {roleLabel(p?.role)}
                    </span>
                    {projOverdue > 0 && (
                      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, padding: '3px 10px', borderRadius: 999, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)', color: RED, whiteSpace: 'nowrap' as const }}>
                        {projOverdue} OVERDUE
                      </span>
                    )}
                  </span>
                }
                subtitle={`${(proj.status || 'active')}${p?.scope && p.scope !== 'full' ? ` · ${String(p.scope).replace(/_/g, ' ')} scope` : ''}${projDueToday > 0 ? ` · ${projDueToday} due today` : ''}`}
                action={pid ? (
                  <Link href={`/app/projects/${pid}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: GOLD, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                    Open Project <ArrowRight size={13} weight="bold" />
                  </Link>
                ) : undefined}
              >
                {groups.length === 0 ? (
                  countOpen > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 4px', color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-35)' }}>
                        <Briefcase size={14} weight="bold" color={GOLD} />
                      </span>
                      {countOpen} open item{countOpen === 1 ? '' : 's'} on this project — open it for the full list.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 4px', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)' }}>
                        <ListChecks size={14} weight="bold" color={colors.green} />
                      </span>
                      All clear on this project — nothing open with your name on it.
                    </div>
                  )
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {groups.map(({ g, items }) => {
                      const gAcc = moduleAccent(g.accent);
                      const GIcon = g.icon;
                      return (
                        <div key={g.key}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, background: gAcc.soft, border: `1px solid ${gAcc.ring}` }}>
                              <GIcon size={11} weight="bold" color={gAcc.hex} />
                            </span>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: DIM }}>{g.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: gAcc.soft, border: `1px solid ${gAcc.ring}`, color: gAcc.hex, fontVariantNumeric: 'tabular-nums' as const }}>{items.length}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {items.map((it: any, i: number) => (
                              <ItemRow key={it?.id || `${g.key}-${i}`} it={it} group={g} pid={pid} todayStart={todayStart} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}
    </PremiumSurface>
  );
}
