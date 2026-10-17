import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { LOCAL_DAY_HEADER, daysUntilDay, plausibleToday } from '@/lib/calendar-day';
import { requestDay } from '@/lib/time-zone';
import { fileNameFromUrl } from '@/lib/sub-portal-view';
import { apiError } from '@/lib/api-error';
import { isLiveJob } from '@/lib/live-jobs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sub-portal
 *
 * Returns everything the Sub Portal management screen renders, tenant-scoped:
 *   {
 *     data:          portal_users (portal_type='sub') — the roster,
 *     activity:      portal_activity mapped to the Activity Log shape,
 *     documents:     portal_documents mapped to the Shared-Document shape
 *                    (visibility derived from `status`, same convention as
 *                     /api/sub-portal/doc-visibility),
 *     compliance:    portal_sub_compliance_docs joined to the roster,
 *     announcements: portal_messages rows tagged sender_type='announcement'
 *                    (see POST /api/sub-portal/announce),
 *   }
 *
 * Every list is a REAL query against the live tables; when a table is genuinely
 * empty the array is empty and the UI shows an honest empty state. Service role
 * bypasses RLS, so every query is pinned to the caller's tenant_id.
 */

/** Keep in sync with /api/sub-portal/doc-visibility statusFromVisibility(). */
function visibilityFromStatus(status: string | null): string[] {
  if (status === 'visible') return ['all'];
  if (status === 'restricted') return ['restricted'];
  if (status === 'hidden') return [];
  // Unknown/legacy statuses (e.g. a doc uploaded elsewhere): treat as visible to
  // all subs so a real document is never silently hidden from the sharing view.
  return status ? ['all'] : [];
}

function fmtBytes(n: number | null): string {
  if (!n || n <= 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 || v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function normalizeDocType(dt: string): string {
  const s = (dt || '').toLowerCase();
  if (s.includes('insur') || s === 'coi' || s.includes('liab')) return 'insurance';
  if (s.includes('w9') || s.includes('w-9')) return 'w9';
  if (s.includes('licen')) return 'license';
  return s || 'license';
}

/**
 * expiry_date is a calendar day, good through its end (lib/calendar-day) —
 * compared as a day against the GC's own day, not as midnight UTC, which
 * showed a COI "expired" from the evening before its last day.
 */
function complianceStatus(
  expiry: string | null,
  hasFile: boolean,
  today: string,
): 'valid' | 'expiring' | 'expired' | 'missing' {
  if (!hasFile) return 'missing';
  if (expiry) {
    const days = daysUntilDay(expiry, today);
    if (days !== null) {
      if (days < 0) return 'expired';
      if (days <= 30) return 'expiring';
    }
  }
  return 'valid';
}

export async function GET(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const tenantId = user.tenantId;

  // ── roster (sub portal users) ── this one is load-bearing: a real DB error here
  // is an actual outage, so surface it as 500 (the page shows its error state).
  const { data: rosterRows, error: rosterErr } = await db
    .from('portal_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('portal_type', 'sub')
    .order('created_at', { ascending: false });
  if (rosterErr) return apiError('sub-portal/roster', rosterErr);
  const roster = rosterRows || [];

  /* The other panels load independently. One that fails is named in
     `unavailable` (and logged) so the page can say "Compliance didn't load"
     — these used to be swallowed into empty lists that read as "nothing on
     file", which for compliance is a lie with consequences. */
  const unavailable: string[] = [];
  const failed = (label: string, e: unknown) => {
    console.error(`[sub-portal] ${label} did not load`, e);
    unavailable.push(label);
  };

  // sub id -> { name, company, trade } lookup for joins
  const subById = new Map<string, { name: string; company: string; trade: string }>();
  for (const r of roster) {
    const row = r as Record<string, unknown>;
    subById.set(String(row.id), {
      name: (row.name as string) || '',
      company: (row.company as string) || '',
      trade: (row.role as string) || '',
    });
  }

  // ── activity ──
  let activity: unknown[] = [];
  try {
    const { data, error } = await db
      .from('portal_activity')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    activity = (data || []).map((a) => {
      const row = a as Record<string, unknown>;
      const meta =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {};
      const subId = (meta.sub_id as string) || (meta.subId as string) || null;
      const joined = subId ? subById.get(String(subId)) : undefined;
      const subName =
        joined?.name ||
        (meta.sub_name as string) ||
        (meta.actor_name as string) ||
        (meta.name as string) ||
        'Portal User';
      const company = joined?.company || (meta.company as string) || '';
      return {
        id: row.id,
        subId: subId || row.id,
        subName,
        company,
        action: (row.action as string) || 'Activity',
        detail: (row.description as string) || '',
        timestamp: (row.created_at as string) || new Date().toISOString(),
      };
    });
  } catch (e) {
    failed('Recent activity', e);
  }

  // ── project-name lookup for documents ──
  const projMap = new Map<string, string>();
  // Pickers list live jobs only; archived names still label old rows.
  const liveJobNames = new Set<string>();
  const jobIdByName = new Map<string, string>();
  try {
    const { data, error } = await db.from('projects').select('id, name, is_archived, archived_at, is_deleted, deleted_at').eq('tenant_id', tenantId);
    if (error) throw error;
    for (const p of data || []) {
      const row = p as Record<string, unknown>;
      projMap.set(String(row.id), (row.name as string) || '');
      if (isLiveJob(row as Parameters<typeof isLiveJob>[0]) && row.name) {
        liveJobNames.add(row.name as string);
        jobIdByName.set(row.name as string, String(row.id));
      }
    }
  } catch (e) {
    // Names only label rows ('--' below) — but the job pickers need them too.
    failed('Job names', e);
  }

  // ── shared documents ──
  let documents: unknown[] = [];
  try {
    const { data, error } = await db
      .from('portal_documents')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    documents = (data || []).map((d) => {
      const row = d as Record<string, unknown>;
      const projectId = row.project_id ? String(row.project_id) : '';
      return {
        id: row.id,
        name: (row.title as string) || 'Untitled Document',
        category: (row.category as string) || (row.doc_type as string) || 'Document',
        projectName: (projectId && projMap.get(projectId)) || '--',
        visibleToSubs: visibilityFromStatus((row.status as string) ?? null),
        uploadedDate: (row.created_at as string) || '',
        size: fmtBytes((row.file_size as number) ?? null),
      };
    });
  } catch (e) {
    failed('Shared documents', e);
  }

  // ── compliance ──
  let compliance: unknown[] = [];
  try {
    // The GC's own day (device, else company zone) when the page sends no day.
    const today = plausibleToday(req.headers.get(LOCAL_DAY_HEADER), (await requestDay(req.headers, db, tenantId, 'sub-portal')).zone);
    const { data, error } = await db
      .from('portal_sub_compliance_docs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    compliance = (data || []).map((c) => {
      const row = c as Record<string, unknown>;
      const sub = row.sub_id ? subById.get(String(row.sub_id)) : undefined;
      const hasFile = !!row.file_url;
      return {
        id: row.id,
        subId: (row.sub_id as string) || '',
        subName: sub?.name || 'Unknown Sub',
        company: sub?.company || '',
        docType: normalizeDocType((row.doc_type as string) || ''),
        status: complianceStatus((row.expiry_date as string) ?? null, hasFile, today),
        expirationDate: (row.expiry_date as string) ?? null,
        // The file's own name: portal uploads are stored as "<13-digit upload
        // time>-<name>", and that stamp used to show on this screen.
        fileName: fileNameFromUrl((row.file_url as string) ?? null) || null,
        uploadedDate: (row.created_at as string) ?? null,
      };
    });
  } catch (e) {
    failed('Compliance documents', e);
  }

  // ── announcements (portal_messages tagged sender_type='announcement') ──
  let announcements: unknown[] = [];
  try {
    const { data, error } = await db
      .from('portal_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('sender_type', 'announcement')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    announcements = (data || []).map((m) => {
      const row = m as Record<string, unknown>;
      const att =
        row.attachments && typeof row.attachments === 'object'
          ? (row.attachments as Record<string, unknown>)
          : {};
      return {
        id: row.id,
        subject: (att.subject as string) || '(no subject)',
        body: (row.content as string) || '',
        sentDate: (row.created_at as string) || '',
        sentTo: Array.isArray(att.sentTo) ? (att.sentTo as string[]) : ['all'],
        sentBy: (row.sender_name as string) || 'You',
      };
    });
  } catch (e) {
    failed('Announcements', e);
  }

  // Real tenant project names for the roster filters / invite project-access
  // pickers (the UI used to hard-code a fake Arizona project list here).
  const projects = Array.from(liveJobNames)
    .sort((a, b) => a.localeCompare(b));

  // The same jobs with their ids, so an invite names the job it is for.
  const projectRefs = projects.map((name) => ({ id: jobIdByName.get(name) || '', name })).filter((p) => p.id);

  return NextResponse.json({ data: roster, activity, documents, compliance, announcements, projects, projectRefs, unavailable });
}
