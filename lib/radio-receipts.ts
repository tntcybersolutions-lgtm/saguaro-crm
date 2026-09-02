/**
 * lib/radio-receipts.ts — Saguaro Radio heard-by helpers (Task R13).
 *
 * Shared by /api/radio/messages, /api/radio/voice and /api/radio/receipts.
 * Everything here is TOLERANT: the radio_receipts table and the
 * radio_messages.present_at_send column ship in migration 063, and until
 * that's applied every call degrades to a silent no-op / empty result.
 * Receipts are garnish on a transmission — never a failure mode for it.
 */

import { tryWrite } from '@/lib/db-write';

/**
 * Stamp present_at_send on a just-inserted message: who was live on the
 * channel (radio_members.last_seen_at within 90s) when the transmission
 * landed. Call fire-and-forget (`void stampPresentAtSend(...)`) from send
 * paths — it never throws.
 */
export async function stampPresentAtSend(db: any, tenantId: string, channelId: string, messageId: string | undefined | null): Promise<void> {
  if (!messageId) return;
  try {
    const { data: live } = await db.from('radio_members')
      .select('user_id, portal_sub_id, display_name, call_sign')
      .eq('tenant_id', tenantId).eq('channel_id', channelId)
      .gte('last_seen_at', new Date(Date.now() - 90_000).toISOString())
      .limit(50);
    const present = ((live || []) as any[]).map((m) => ({
      user_id: m.user_id ?? null,
      portal_sub_id: m.portal_sub_id ?? null,
      name: m.call_sign || m.display_name || null,
    }));
    if (present.length) {
      await tryWrite(db.from('radio_messages').update({ present_at_send: present } as never).eq('id', messageId), 'radio_messages update');
    }
  } catch { /* pre-063 schema — heard-by UI degrades quietly */ }
}

/**
 * Fetch receipts for a page of message ids in ONE query and return them
 * grouped by message id. Empty map on any failure (e.g. table not migrated).
 */
export async function receiptsByMessage(db: any, tenantId: string, messageIds: string[]): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  if (!messageIds.length) return out;
  try {
    const { data } = await db.from('radio_receipts')
      .select('message_id, user_id, portal_sub_id, display_name, action, created_at')
      .eq('tenant_id', tenantId).in('message_id', messageIds.slice(0, 100))
      .order('created_at', { ascending: true });
    for (const r of ((data || []) as any[])) {
      const arr = out.get(r.message_id) ?? [];
      arr.push({ user_id: r.user_id ?? null, portal_sub_id: r.portal_sub_id ?? null, display_name: r.display_name ?? null, action: r.action ?? 'played', created_at: r.created_at });
      out.set(r.message_id, arr);
    }
  } catch { /* pre-063 schema — no receipts attached */ }
  return out;
}
