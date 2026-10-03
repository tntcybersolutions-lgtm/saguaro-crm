'use client';
/**
 * My Work — the signed-in user's whole day on one page. Pass 4 on the kit.
 *
 * One card per assigned project (assignment lives in work_assignments, made
 * from Project → Team), with every open item that carries the user's name —
 * to-dos, RFIs, punch, field issues, T&M awaiting approval, assists — grouped
 * by module and deep-linked to where the work gets done. Sales follow-ups
 * hang off a lead, not a project, so they render whether or not this person
 * holds a single work_assignment.
 *
 * Server shape (/api/my-work): {projects:[{project:{id,name,status},role,scope,
 * counts:{todos,rfis,punch,issues,tmAwaiting,assists,overdue,dueToday},
 * items:{todos,rfis,punch,issues,tm,assists}}],totals,followUps,followUpCounts}.
 * Built in parallel — every read below tolerates a missing key so loading /
 * partial payloads never crash the hub.
 */
import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Briefcase, ListChecks, ChatCenteredText, Hammer, Warning, Receipt, Handshake,
  ArrowRight, WarningCircle, FolderSimple,
} from '@phosphor-icons/react';
import { PageShell, Card, StatRow, Badge, Button, EmptyState, type StatItem } from '@/components/ui/kit';
import { accentForProject, projectMonogram } from '@/lib/project-identity';
import { moduleAccent } from '@/lib/module-identity';

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
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) => money.format(Number(n) || 0);
const dueLabelOf = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return d;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const CSS = `
.mwWs > .k-page { max-width: none; }
.mwStack { display: flex; flex-direction: column; gap: 16px; }
.mwRow { display: flex; align-items: center; gap: 12px; text-decoration: none; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); color: var(--text-primary); min-height: 44px; }
.mwRow:hover { border-color: var(--border-strong); }
.mwRow:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.mwRow[data-overdue="true"] { background: rgba(255,77,94,.06); border-color: rgba(255,77,94,.35); }
.mwChip { flex-shrink: 0; display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; border: 1px solid transparent; }
.mwTitle { flex: 1; min-width: 0; font-size: var(--fs-md); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mwSub { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mwDue { flex-shrink: 0; font-size: var(--fs-xs); font-weight: 600; color: var(--text-tertiary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.mwDue[data-today="true"] { color: var(--brand-primary); font-weight: 800; }
.mwDue[data-late="true"] { color: var(--status-overdue); font-weight: 800; }
.mwRow > svg:last-child { flex-shrink: 0; color: var(--text-tertiary); }
.mwGroup + .mwGroup { margin-top: 16px; }
.mwGroupHead { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: var(--fs-xs); font-weight: 800; color: var(--text-tertiary); }
.mwGroupHead .mwChip { width: 20px; height: 20px; border-radius: 6px; }
.mwList { display: flex; flex-direction: column; gap: 6px; }
.mwCardTitle { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mwBucket { font-size: var(--fs-xs); font-weight: 700; margin-bottom: 7px; }
.mwBucket[data-tone="late"] { color: var(--status-overdue); }
.mwBucket[data-tone="today"] { color: var(--brand-primary); }
.mwBucket[data-tone="soon"] { color: var(--text-tertiary); }
.mwFollow { border-left-width: 3px; }
.mwFollow[data-tone="late"] { border-left-color: var(--status-overdue); }
.mwFollow[data-tone="today"] { border-left-color: var(--brand-primary); }
.mwFollow[data-tone="soon"] { border-left-color: var(--border-strong); }
.mwRight { text-align: right; flex-shrink: 0; }
.mwNote { display: flex; align-items: center; gap: 10px; padding: 6px 0; color: var(--text-secondary); font-size: var(--fs-sm); }
.mwSkel { border-radius: var(--radius-md); background: var(--bg-surface); border: 1px solid var(--glass-border); padding: 18px; }
.mwSkel div { border-radius: 6px; background: rgba(255,255,255,0.06); }
@media (max-width: 640px) {
  .mwWs .k-btn, .mwWs .k-stat { min-height: 44px; }
}
`;

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
    <Link href={href} className="mwRow" data-overdue={overdue ? 'true' : undefined}>
      <span aria-hidden className="mwChip" style={{ background: acc.soft, borderColor: acc.ring }}><Icon size={15} weight="duotone" color={acc.hex} /></span>
      <span className="mwTitle">{itemTitle(it, group.fallback)}</span>
      {status && <Badge tone="neutral">{status}</Badge>}
      {overdue && <Badge tone="overdue">Overdue</Badge>}
      {dueLabel && <span className="mwDue" data-today={dueToday && !overdue ? 'true' : undefined} data-late={overdue ? 'true' : undefined}>{dueLabel}</span>}
      <ArrowRight size={13} weight="bold" />
    </Link>
  );
}

function FollowUpRow({ f, tone }: { f: any; tone: 'late' | 'today' | 'soon' }) {
  return (
    <Link href="/app/leads" className="mwRow mwFollow" data-tone={tone}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mwTitle">{f.company}{f.contact ? <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{'  ·  '}{f.contact}</span> : null}</div>
        <div className="mwSub">{f.action}</div>
      </div>
      <div className="mwRight">
        <div className="mwDue" data-late={tone === 'late' ? 'true' : undefined} data-today={tone === 'today' ? 'true' : undefined}>{dueLabelOf(f.due)}</div>
        <div className="mwSub">{f.stage}{f.value ? `  ·  ${fmtUsd(f.value)}` : ''}</div>
      </div>
      <ArrowRight size={13} weight="bold" />
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

  const followUps: any[] = Array.isArray(data?.followUps) ? data.followUps : [];
  const fuCounts = data?.followUpCounts || { overdue: 0, today: 0, upcoming: 0 };
  const fuOverdue = followUps.filter((f) => f.bucket === 'overdue');
  const fuToday = followUps.filter((f) => f.bucket === 'today');
  const fuUpcoming = followUps.filter((f) => f.bucket === 'upcoming');

  const stats: StatItem[] = [
    { label: 'Assigned Projects', value: rows.length, sub: 'From Project → Team' },
    { label: 'Due Today', value: dueToday, tone: dueToday > 0 ? 'warn' : 'default', sub: dueToday > 0 ? 'Needs attention today' : 'Nothing lands today' },
    { label: 'Overdue', value: overdue, tone: overdue > 0 ? 'bad' : 'default', sub: overdue > 0 ? 'Past their due date' : 'All caught up' },
    { label: 'Awaiting My Approval', value: awaiting, tone: awaiting > 0 ? 'warn' : 'default', sub: 'T&M tickets to sign off' },
  ];

  return (
    <div className="mwWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'My Work' }]}
        title="My Work"
        subtitle={isLoading
          ? 'Pulling everything with your name on it…'
          : rows.length
            ? `${openItems} open item${openItems === 1 ? '' : 's'} across ${rows.length} assigned project${rows.length === 1 ? '' : 's'} — refreshed every minute.`
            : 'Every to-do, RFI, punch item, field issue, and T&M ticket assigned to you — one page, every project.'}
        actions={<Button icon={<FolderSimple size={15} weight="bold" />} href="/app/projects">All Projects</Button>}
      >
        {!isLoading && !error && rows.length > 0 && <StatRow items={stats} />}

        {error && !isLoading && (
          <Card flush>
            <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load your work" text="The hub couldn't reach the server. It retries automatically every minute — or reload now." action={<Button onClick={() => window.location.reload()}>Reload</Button>} />
          </Card>
        )}

        {isLoading && (
          <div className="mwStack" aria-busy="true" aria-label="Loading your work">
            <div className="mwSkel" style={{ height: 74 }} />
            {[1, 2].map((i) => (
              <div key={i} className="mwSkel">
                <div style={{ height: 14, width: '32%', marginBottom: 16 }} />
                {[1, 2, 3].map((r) => <div key={r} style={{ height: 40, marginBottom: 6, maxWidth: `${92 - r * 9}%` }} />)}
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && (
          <div className="mwStack">
            {/* Sales follow-ups — what you owe somebody, soonest first */}
            {followUps.length > 0 && (
              <Card
                title="Sales Follow-Ups"
                subtitle={`${fuCounts.overdue} past due · ${fuCounts.today} today · ${fuCounts.upcoming} in the next two weeks`}
                actions={<Button size="sm" icon={<Handshake size={15} weight="bold" />} href="/app/leads">Open Pipeline</Button>}
              >
                <div className="mwStack">
                  {([
                    { list: fuOverdue, label: 'Past Due', tone: 'late' },
                    { list: fuToday, label: 'Today', tone: 'today' },
                    { list: fuUpcoming, label: 'Next Two Weeks', tone: 'soon' },
                  ] as const).filter((g) => g.list.length > 0).map((g) => (
                    <div key={g.label}>
                      <div className="mwBucket" data-tone={g.tone}>{g.label} · {g.list.length}</div>
                      <div className="mwList">{g.list.map((f: any) => <FollowUpRow key={f.id} f={f} tone={g.tone} />)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Global empty state — teach how assignment works */}
            {rows.length === 0 && followUps.length === 0 && (
              <Card flush>
                <EmptyState
                  icon={<Briefcase size={22} />}
                  title="Nothing assigned to you yet"
                  text="A PM assigns you a project from Project → Team. The moment they do, every open to-do, RFI, punch item, field issue, and T&M ticket with your name on it lands here — with due dates, overdue flags, and one-tap deep links."
                  action={<Button variant="primary" icon={<FolderSimple size={15} weight="bold" />} href="/app/projects">Browse Projects</Button>}
                />
              </Card>
            )}

            {/* One card per assigned project */}
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
                <Card
                  key={pid || idx}
                  title={
                    <span className="mwCardTitle">
                      <span aria-hidden className="mwChip" style={{ background: acc.soft, borderColor: acc.ring, color: acc.hex, fontSize: 11, fontWeight: 900 }}>{projectMonogram(proj.name)}</span>
                      <span>{proj.name || 'Untitled Project'}</span>
                      <Badge tone="neutral">{roleLabel(p?.role)}</Badge>
                      {projOverdue > 0 && <Badge tone="overdue" dot>{projOverdue} overdue</Badge>}
                    </span>
                  }
                  subtitle={`${String(proj.status || 'active').replace(/_/g, ' ')}${p?.scope && p.scope !== 'full' ? ` · ${String(p.scope).replace(/_/g, ' ')} scope` : ''}${projDueToday > 0 ? ` · ${projDueToday} due today` : ''}`}
                  actions={pid ? <Button size="sm" variant="ghost" icon={<ArrowRight size={14} weight="bold" />} href={`/app/projects/${pid}`}>Open Project</Button> : undefined}
                >
                  {groups.length === 0 ? (
                    countOpen > 0
                      ? <div className="mwNote"><Briefcase size={16} color="var(--brand-primary)" /> {countOpen} open item{countOpen === 1 ? '' : 's'} on this project — open it for the full list.</div>
                      : <div className="mwNote"><ListChecks size={16} color="var(--status-ongoing)" /> All clear on this project — nothing open with your name on it.</div>
                  ) : (
                    groups.map(({ g, items }) => {
                      const gAcc = moduleAccent(g.accent);
                      const GIcon = g.icon;
                      return (
                        <div key={g.key} className="mwGroup">
                          <div className="mwGroupHead">
                            <span aria-hidden className="mwChip" style={{ background: gAcc.soft, borderColor: gAcc.ring }}><GIcon size={11} weight="bold" color={gAcc.hex} /></span>
                            <span>{g.label}</span>
                            <Badge tone="neutral">{items.length}</Badge>
                          </div>
                          <div className="mwList">
                            {items.map((it: any, i: number) => <ItemRow key={it?.id || `${g.key}-${i}`} it={it} group={g} pid={pid} todayStart={todayStart} />)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </PageShell>
    </div>
  );
}
