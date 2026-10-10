/**
 * The GC's view of what subs sent in from their portal links.
 *
 * Pure helpers (threads, money, who-wrote-it) so the screen and the routes
 * agree, plus gcSenderName for the name a sub sees on the GC's replies.
 */

export interface InboxMessage {
  id: string;
  project_id: string | null;
  sub_id: string | null;
  sender_type: string | null;
  sender_name: string | null;
  content: string;
  read_at: string | null;
  created_at: string | null;
  sub_name?: string;
  project_name?: string;
}

export interface Thread {
  key: string;
  projectId: string | null;
  subId: string | null;
  subName: string;
  projectName: string;
  messages: InboxMessage[];
  unread: number;
  last: InboxMessage;
}

/** One conversation per sub per job, newest activity first; messages oldest → newest inside. */
export function groupThreads(messages: InboxMessage[]): Thread[] {
  const by = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    const k = `${m.project_id || '-'}|${m.sub_id || '-'}`;
    by.set(k, [...(by.get(k) || []), m]);
  }
  const ts = (m: InboxMessage) => (m.created_at ? Date.parse(m.created_at) || 0 : 0);
  return [...by.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => ts(a) - ts(b));
      const last = sorted[sorted.length - 1];
      return {
        key,
        projectId: last.project_id,
        subId: last.sub_id,
        subName: sorted.find((m) => m.sub_name)?.sub_name || 'Subcontractor',
        projectName: sorted.find((m) => m.project_name)?.project_name || 'Job',
        messages: sorted,
        unread: sorted.filter((m) => m.sender_type === 'sub' && !m.read_at).length,
        last,
      };
    })
    .sort((a, b) => ts(b.last) - ts(a.last));
}

/** "$11,250.00" — a blank or junk amount reads $0.00, never NaN. */
export function usd(v: unknown): string {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Sum of a money column across rows, in exact cents. */
export function sumUsd(rows: Array<Record<string, unknown>>, col: string): number {
  return rows.reduce((s, r) => s + Math.round((Number(r[col]) || 0) * 100), 0) / 100;
}

type Db = { from: (t: string) => any };

/** The name the sub sees on the GC's replies: the person's name, else their email, else the company. */
export async function gcSenderName(db: Db, user: { id: string; tenantId: string; email?: string | null }): Promise<string> {
  try {
    const { data } = await db.from('profiles').select('full_name, preferred_name, first_name, company')
      .eq('id', user.id).eq('tenant_id', user.tenantId).maybeSingle();
    const p = (data || {}) as Record<string, string | null>;
    return (p.preferred_name || p.full_name || p.first_name || user.email || p.company || 'Your GC').trim();
  } catch (e) {
    console.error('[sub-inbox/gcSenderName]', e);
    return user.email || 'Your GC';
  }
}
