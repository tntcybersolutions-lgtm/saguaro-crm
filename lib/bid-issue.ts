/**
 * The one way a bid jacket reaches a bidder.
 *
 * There used to be two. /issue checked the jacket was complete, snapshotted
 * what was in it and emailed every invitee; invite-subs emailed the portal link
 * the moment a sub was added and flipped the package to 'open'. The wizard
 * called invite-subs, so 48 packages reached subcontractors without the
 * completeness check or a record of what was sent — and a later /issue emailed
 * all of them again.
 *
 * Now both routes call sendJacket():
 *
 *   NOT ISSUED YET  sending issues it, at that moment. An incomplete jacket is
 *                   refused (409, naming the empty sections) unless the GC says
 *                   send anyway (force). The jacket is snapshotted as v1, the
 *                   package goes to 'sent' and its bidder portal is switched on.
 *   ALREADY ISSUED  the issued jacket goes to whoever does not hold it yet:
 *                   just the subs named on this call (invite-subs), or everyone
 *                   on the package who is missing it (/issue — which makes a
 *                   second /issue a retry for the sends that failed, never a
 *                   second email to the ones that went).
 *
 * Every email goes through onSubInvitedToBid (lib/triggers), which records it
 * on the jacket's Correspondence (withComm) and reports whether it really left.
 * The result names every invitee: emailed, failed (and why), or already had it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { must } from '@/lib/db-write';
import { assembleJacket, snapshotJacket } from '@/lib/bid-jacket';
import { onSubInvitedToBid } from '@/lib/triggers';
import { holdsIssuedJacket, inviteState, reinvitePatch } from '@/lib/bid-invite-state';

type Db = SupabaseClient<any, any, any>;
type Row = Record<string, any>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bidding on these is over; nothing more is sent. */
const OVER = ['closed', 'awarded', 'contracted', 'cancelled', 'canceled', 'archived'];

/** These become 'sent' when the jacket is issued. Anything later is left alone. */
const BEFORE_ISSUE = ['', 'draft', 'pending', 'open'];

export type NamedSub = {
  email: string;
  name: string | null;
  company: string | null;
  contactName: string | null;
  phone: string | null;
  subId: string | null;
};

export type Delivery = {
  inviteId: string | null;
  email: string;
  name: string | null;
  /** The jacket email left on this call. */
  sent: boolean;
  /** emailed now · failed to send · already held the issued jacket (not re-sent) · invite could not be saved */
  outcome: 'emailed' | 'failed' | 'already_sent' | 'not_saved';
  error?: string;
  /** When they were sent it, for already_sent. */
  at?: string | null;
};

export type SendJacketResult =
  | { kind: 'not_found' }
  | { kind: 'over'; error: string }
  | { kind: 'nobody'; error: string }
  | { kind: 'incomplete'; missing: string[]; message: string }
  | {
      kind: 'sent';
      issuedNow: boolean;
      version: number;
      issuedAt: string;
      /** Issued with sections empty because the GC chose to. */
      forced: boolean;
      missing: string[];
      /** One entry per invitee this call tried to email (or could not save). */
      delivery: Delivery[];
      /** Invitees not emailed because they already hold the issued jacket. */
      skipped: Delivery[];
      /** Entries on the call that were not usable addresses. */
      invalid: Array<{ email: string; error: string }>;
      pkg: Row;
    };

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

/** The subs named on a call, normalised and de-duplicated by address. */
export function normalizeSubs(raw: unknown): { valid: NamedSub[]; invalid: Array<{ email: string; error: string }> } {
  const valid: NamedSub[] = [];
  const invalid: Array<{ email: string; error: string }> = [];
  const seen = new Set<string>();
  for (const s of (Array.isArray(raw) ? raw : []) as Row[]) {
    const email = String(s?.email ?? '').trim().toLowerCase();
    if (!email) { invalid.push({ email: '', error: 'Email is required.' }); continue; }
    if (!EMAIL_RE.test(email)) { invalid.push({ email, error: 'That is not an email address.' }); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push({
      email,
      name: clean(s.name),
      company: clean(s.company),
      contactName: clean(s.contactName),
      phone: clean(s.phone),
      subId: clean(s.subId),
    });
  }
  return { valid, invalid };
}

/** Version written by the first issue. jacket_version defaults to 1 in the database, so "+1" on the default made the first issue v2. */
export function firstIssueVersion(p: Row): number {
  return p.jacket_generated_at ? (Number(p.jacket_version) || 1) + 1 : 1;
}

/** 'A', 'A and B', 'A, B and C'. */
export function listJoin(items: string[]): string {
  return items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Drawings and Specifications are empty." — named, not scored: a GC can go and fix a name. */
export function missingMessage(missing: string[]): string {
  return `${listJoin(missing)} ${missing.length === 1 ? 'is' : 'are'} empty. Add ${missing.length === 1 ? 'it' : 'them'}, or send anyway if that is deliberate.`;
}

const live = (r: Row) => {
  const st = inviteState(r);
  return st !== 'revoked' && st !== 'suggested';
};

export async function sendJacket(
  db: Db,
  input: { tenantId: string; packageId: string; subs?: unknown; force?: boolean; scope: 'all' | 'named' },
): Promise<SendJacketResult> {
  const { tenantId, packageId, scope } = input;
  const force = input.force === true;

  const { data: pkg, error: pkgErr } = await db
    .from('bid_packages')
    .select('*, projects(*)')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (pkgErr) throw pkgErr;
  if (!pkg) return { kind: 'not_found' };
  const p = pkg as Row;
  const status = String(p.status ?? '').toLowerCase().trim();
  if (OVER.includes(status)) {
    return { kind: 'over', error: `Bidding on this package is over — it is ${status}. Nothing was sent.` };
  }

  const { valid: named, invalid } = normalizeSubs(input.subs);

  const { data: rows, error: invErr } = await db
    .from('bid_package_invites')
    .select('*')
    .eq('bid_package_id', packageId)
    .eq('tenant_id', tenantId);
  if (invErr) throw invErr;
  const byEmail = new Map<string, Row>();
  for (const r of (rows || []) as Row[]) byEmail.set(String(r.sub_email || '').trim().toLowerCase(), r);

  if (!named.length && ![...byEmail.values()].some(live)) {
    return { kind: 'nobody', error: 'There is nobody to send this to. Invite subcontractors first.' };
  }

  /* The gate. Only a jacket that has not been issued is checked: once it is
     out, sending it to one more bidder sends what everyone else already has —
     changes after issue go out as an addendum. Nothing is written on a 409. */
  let issuedAt: string | null = p.jacket_generated_at || null;
  let version = Number(p.jacket_version) || 1;
  let missing: string[] = [];
  let manifest: ReturnType<typeof snapshotJacket> | null = null;
  if (!issuedAt) {
    const jacket = await assembleJacket(db, {
      packageId,
      tenantId,
      pkg: p,
      resolveUrl: (u) => (u ? `/api/files/open?u=${encodeURIComponent(u)}` : null),
    });
    missing = jacket.completeness.missing;
    if (missing.length && !force) {
      return { kind: 'incomplete', missing, message: missingMessage(missing) };
    }
    version = firstIssueVersion(p);
    manifest = snapshotJacket(jacket, version);
  }

  const now = new Date().toISOString();

  /* 1. Put the named subs on the package. A new address is inserted; one
        already there keeps its answer — re-inviting never turns a bid in or a
        decline back into 'invited'. */
  const namedRows: Row[] = [];
  const restored = new Set<string>();
  const notSaved: Delivery[] = [];
  for (const s of named) {
    const existing = byEmail.get(s.email);
    if (existing) {
      const { patch, restored: wasRestored } = reinvitePatch(existing, s);
      if (Object.keys(patch).length) {
        await must(
          db.from('bid_package_invites').update(patch as never).eq('id', existing.id).eq('tenant_id', tenantId),
          'bid_package_invites reinvite',
        );
        Object.assign(existing, patch);
      }
      if (wasRestored) restored.add(existing.id);
      namedRows.push(existing);
      continue;
    }
    const { data: created, error } = await db
      .from('bid_package_invites')
      .insert({
        tenant_id: tenantId,
        bid_package_id: packageId,
        sub_id: s.subId,
        sub_name: s.company || s.name || s.email,
        sub_email: s.email,
        company_name: s.company || s.name,
        contact_name: s.contactName || s.name,
        contact_phone: s.phone,
        trade: p.trade || null,
        status: 'invited',
        response_status: 'invited',
      } as never)
      .select('*')
      .single();
    if (error || !created) {
      /* Reported per sub, not thrown: one address the database refuses must
         not stop the others — but the GC is told exactly which one. */
      console.error('[bid-issue] invite not saved', s.email, error);
      notSaved.push({ inviteId: null, email: s.email, name: s.company || s.name, sent: false, outcome: 'not_saved', error: 'This invite could not be saved.' });
      continue;
    }
    byEmail.set(s.email, created as Row);
    namedRows.push(created as Row);
  }

  const everyone = [...byEmail.values()].filter(live);
  if (!everyone.length) {
    return { kind: 'nobody', error: 'There is nobody to send this to. Invite subcontractors first.' };
  }

  /* 2. The package: counts, who it went to, and the bidder portal ON — sending
        a link to a portal that is switched off sends a dead link. */
  const pkgPatch: Row = {
    num_invited: everyone.length,
    invite_sent_at: now,
    invite_sent_to: everyone.map((r) => r.sub_email),
    sub_portal_enabled: true,
    ...(BEFORE_ISSUE.includes(status) ? { status: 'sent' } : {}),
  };
  let issuedNow = false;
  if (!issuedAt) {
    /* Claimed, not just written: two clicks a second apart must not both issue
       v1 and both email everyone. Only the call that finds jacket_generated_at
       still empty issues; the other sends against that issue. */
    const { data: claimed } = await must(
      db.from('bid_packages')
        .update({ ...pkgPatch, jacket_sections: manifest, jacket_version: version, jacket_generated_at: now } as never)
        .eq('id', packageId)
        .eq('tenant_id', tenantId)
        .is('jacket_generated_at', null)
        .select('id'),
      'bid_packages issue',
    );
    if (Array.isArray(claimed) && claimed.length) {
      issuedAt = now;
      issuedNow = true;
    } else {
      const { data: fresh, error: freshErr } = await db
        .from('bid_packages')
        .select('jacket_generated_at, jacket_version')
        .eq('id', packageId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (freshErr) throw freshErr;
      issuedAt = (fresh as Row | null)?.jacket_generated_at || now;
      version = Number((fresh as Row | null)?.jacket_version) || 1;
      await must(
        db.from('bid_packages').update(pkgPatch as never).eq('id', packageId).eq('tenant_id', tenantId),
        'bid_packages invite',
      );
    }
  } else {
    await must(
      db.from('bid_packages').update(pkgPatch as never).eq('id', packageId).eq('tenant_id', tenantId),
      'bid_packages invite',
    );
  }

  /* 3. Who is emailed. A bidder who already holds the issued jacket is not
        sent it again. A declined bidder is not chased by a re-issue, only when
        the GC names them. */
  const namedIds = new Set(namedRows.map((r) => r.id));
  const pool = scope === 'named'
    ? namedRows
    : everyone.filter((r) => namedIds.has(r.id) || inviteState(r) !== 'declined');
  const recipients: Row[] = [];
  const skipped: Delivery[] = [];
  for (const r of pool) {
    if (!live(r)) continue;
    if (!restored.has(r.id) && holdsIssuedJacket(r, issuedAt)) {
      skipped.push({
        inviteId: r.id, email: r.sub_email, name: r.company_name || r.sub_name || null,
        sent: false, outcome: 'already_sent', at: r.invited_at || null,
      });
      continue;
    }
    recipients.push(r);
  }

  /* 4. One at a time, so a bad address cannot sink the batch and each result
        belongs to one bidder. */
  const delivery: Delivery[] = [];
  for (const r of recipients) {
    const res = await onSubInvitedToBid(packageId, r.id);
    delivery.push({
      inviteId: r.id,
      email: r.sub_email,
      name: r.company_name || r.sub_name || null,
      sent: res.sent,
      outcome: res.sent ? 'emailed' : 'failed',
      ...(res.sent ? {} : { error: res.error || 'The invitation was not delivered.' }),
    });
  }

  return {
    kind: 'sent',
    issuedNow,
    version,
    issuedAt: issuedAt as string,
    forced: issuedNow && force && missing.length > 0,
    missing,
    delivery: [...delivery, ...notSaved],
    skipped,
    invalid,
    pkg: p,
  };
}

/** The HTTP answer for a send — /issue and invite-subs speak the same shape. */
export function jacketSendResponse(r: SendJacketResult, extra: Record<string, unknown> = {}): NextResponse {
  switch (r.kind) {
    case 'not_found':
      return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    case 'over':
      return NextResponse.json({ error: r.error }, { status: 409 });
    case 'nobody':
      return NextResponse.json({ error: r.error }, { status: 400 });
    case 'incomplete':
      return NextResponse.json(
        { error: 'This jacket is not complete yet.', missing: r.missing, message: r.message, needsForce: true },
        { status: 409 },
      );
    case 'sent': {
      const delivered = r.delivery.filter((d) => d.sent).length;
      return NextResponse.json({
        success: true,
        issuedNow: r.issuedNow,
        version: r.version,
        issuedAt: r.issuedAt,
        /** Tried on this call. */
        invited: r.delivery.length,
        delivered,
        failed: r.delivery.length - delivered,
        alreadyHad: r.skipped.length,
        delivery: r.delivery,
        skipped: r.skipped,
        invalid: r.invalid,
        forced: r.forced,
        missing: r.missing,
        ...extra,
      });
    }
  }
}
