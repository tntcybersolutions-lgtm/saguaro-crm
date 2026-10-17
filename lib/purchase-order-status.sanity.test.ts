/**
 * The purchase-order transition map (lib/purchase-order-status).
 * Run: npx -y tsx lib/purchase-order-status.sanity.test.ts   (exit 0 = every assertion held)
 */
import { poTransitionError, normalizePoStatus, transitionPoStatus, PO_STATUSES } from './purchase-order-status';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ' — ' + detail}`); if (!ok) failed++; };
const allowed = (f: string, t: string) => poTransitionError(f, t) === null;

// The happy path, every step.
const path = ['draft', 'sent', 'acknowledged', 'partially_received', 'received', 'closed'];
for (let i = 0; i < path.length - 1; i++) check(`${path[i]} → ${path[i + 1]}`, allowed(path[i], path[i + 1]));
check('draft → pending_approval → approved → sent', allowed('draft', 'pending_approval') && allowed('pending_approval', 'approved') && allowed('approved', 'sent'));
check('a rejected approval goes back to draft', allowed('pending_approval', 'draft'));
check('sent → received (skip acknowledged)', allowed('sent', 'received'));
check('"issued" is the sent step', normalizePoStatus('issued') === 'sent' && allowed('draft', 'issued'));
check('"Partially Received" is accepted', normalizePoStatus('Partially Received') === 'partially_received');
// Void from anything not closed.
for (const f of PO_STATUSES.filter((s) => s !== 'closed' && s !== 'void')) check(`${f} → void`, allowed(f, 'void'));
// Refused.
check('closed → anything refused', PO_STATUSES.filter((s) => s !== 'closed').every((t) => !allowed('closed', t)));
check('void → anything refused', PO_STATUSES.filter((s) => s !== 'void').every((t) => !allowed('void', t)));
check('received → draft refused', !allowed('received', 'draft'));
check('draft → received refused (never sent)', !allowed('draft', 'received'));
check('draft → closed refused', !allowed('draft', 'closed'));
check('a made-up status refused', !allowed('draft', 'shipped') && /not a purchase-order status/.test(poTransitionError('draft', 'shipped') || ''));
check('same status is a no-op, not an error', allowed('sent', 'sent'));
check('the refusal names the next moves', /Next it can be: acknowledged or partially received or received or void/.test(poTransitionError('sent', 'draft') || ''));

// The write: conditional on the status it read, stamps applied, refusals never write.
type Row = Record<string, unknown>;
function fakeDb(rows: Row[]) {
  const writes: Row[] = [];
  return {
    writes,
    from() {
      const f: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      const b: any = {
        select: () => b,
        update: (p: Row) => { patch = p; return b; },
        eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
        is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return b; },
        maybeSingle: () => {
          const hit = rows.filter((r) => f.every((x) => x(r)));
          if (patch && hit[0]) { Object.assign(hit[0], patch); writes.push(patch); }
          return Promise.resolve({ data: hit[0] ? { ...hit[0] } : null, error: null });
        },
      };
      return b;
    },
  };
}

(async () => {
  const T = 't1';
  const po = { id: 'po1', tenant_id: T, status: 'draft', issued_date: null, delivered_at: null, approved_at: null };
  const db = fakeDb([po]);
  const r1 = await transitionPoStatus(db, T, 'po1', 'sent', { actorId: 'u1' });
  check('draft → sent writes and stamps issued_date', r1.ok && po.status === 'sent' && !!po.issued_date);
  const r2 = await transitionPoStatus(db, T, 'po1', 'draft');
  check('sent → draft refused with 409, nothing written', !r2.ok && r2.status === 409 && po.status === 'sent' && db.writes.length === 1);
  const r3 = await transitionPoStatus(db, T, 'po1', 'received');
  check('sent → received stamps delivered_at', r3.ok && po.status === 'received' && !!po.delivered_at);
  const r4 = await transitionPoStatus(db, T, 'po1', 'closed');
  const r5 = await transitionPoStatus(db, T, 'po1', 'void');
  check('closed, then void refused', r4.ok && !r5.ok && po.status === 'closed');
  const r6 = await transitionPoStatus(db, 'other-tenant', 'po1', 'void');
  check("another company's PO is not found", !r6.ok && r6.status === 404);
  const r7 = await transitionPoStatus(db, T, 'po1', 'banana');
  check('a made-up status is a 422', !r7.ok && r7.status === 422);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
