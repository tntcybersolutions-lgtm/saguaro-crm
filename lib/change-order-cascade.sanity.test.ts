/**
 * What an approved change order does to a job's money (lib/change-order-cascade),
 * against an in-memory copy of Pima County Adult Detention Center's live rows:
 * original $2,412,000, two approved COs ($86,400 + $41,250), ten budget lines
 * carrying the $127,650 between them.
 * Run: npx -y tsx lib/change-order-cascade.sanity.test.ts   (exit 0 = every assertion held)
 */
import { applyChangeOrderMoney, UNALLOCATED_CO_CODE } from './change-order-cascade';

type Row = Record<string, any>;
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

/** Just enough of the supabase-js builder for the cascade's calls. */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (t: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let payload: Row | Row[] = {};
    const run = () => {
      const rows = tables[t] || (tables[t] = []);
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        list.forEach((r, i) => rows.push({ id: `${t}-new-${rows.length + i}`, ...r }));
        return { data: list, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
      return { data: hit, error: null };
    };
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => { filters.push((r) => String(r[k]) === String(v)); return b; },
      neq: (k: string, v: unknown) => { filters.push((r) => String(r[k]) !== String(v)); return b; },
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return b; },
      limit: () => b,
      update: (p: Row) => { op = 'update'; payload = p; return b; },
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return b; },
      maybeSingle: () => { const r = run(); return Promise.resolve({ data: (r.data as Row[])[0] ?? null, error: null }); },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { from };
}

const T = 'tenant-1';
const P = 'pima';
const pima = () => ({
  projects: [{ id: P, tenant_id: T, original_contract_amount: 2412000, revised_contract_value: 2539650, contract_amount: 2539650, contract_value: 2539650 }],
  change_orders: [
    { id: 'co1', tenant_id: T, project_id: P, status: 'approved', amount: 86400, cost_impact: null, deleted_at: null },
    { id: 'co2', tenant_id: T, project_id: P, status: 'approved', amount: 41250, cost_impact: null, deleted_at: null },
  ] as Row[],
  contracts: [] as Row[],
  bid_packages: [] as Row[],
  budget_lines: [
    { id: 'b1', tenant_id: T, project_id: P, cost_code: '23-0900', original_budget: 486200, approved_changes: 52400 },
    { id: 'b2', tenant_id: T, project_id: P, cost_code: '23-0901', original_budget: 220000, approved_changes: 75250 },
    { id: 'b3', tenant_id: T, project_id: P, cost_code: '26-0500', original_budget: 438000, approved_changes: 0 },
  ] as Row[],
});
const budgetChanges = (t: ReturnType<typeof pima>) => t.budget_lines.reduce((s, l) => s + Number(l.approved_changes || 0), 0);

(async () => {
  // 1. Re-check on today's rows changes nothing.
  {
    const t = pima();
    await applyChangeOrderMoney(fakeDb(t), T, t.change_orders[0], t.change_orders[0]);
    check('today: contract stays $2,539,650', t.projects[0].contract_amount === 2539650 && t.projects[0].revised_contract_value === 2539650);
    check('today: no unallocated line is made (lines already carry $127,650)', !t.budget_lines.some((l) => l.cost_code === UNALLOCATED_CO_CODE));
  }
  // 2. Approve a new $10,000 CO.
  {
    const t = pima();
    const before = { id: 'co3', tenant_id: T, project_id: P, status: 'pending', amount: 10000, cost_impact: '10000', deleted_at: null };
    const after = { ...before, status: 'approved' };
    t.change_orders.push(after);
    const { delta } = await applyChangeOrderMoney(fakeDb(t), T, before, after);
    check('approve: delta is +$10,000', delta === 10000);
    check('approve: contract_amount $2,549,650', t.projects[0].contract_amount === 2549650);
    check('approve: revised_contract_value $2,549,650 (the Budget screen reads it first)', t.projects[0].revised_contract_value === 2549650);
    check('approve: original untouched at $2,412,000', t.projects[0].original_contract_amount === 2412000);
    const un = t.budget_lines.find((l) => l.cost_code === UNALLOCATED_CO_CODE);
    check('approve: $10,000 lands on the unallocated line', !!un && un.approved_changes === 10000 && un.revised_budget === 10000);
    check('approve: budget approved changes = approved COs ($137,650)', budgetChanges(t) === 137650);
    check('approve: committed is not touched', t.budget_lines.every((l) => l.committed === undefined || l.committed === 0));
    // 3. Running it again (a second door) changes nothing.
    await applyChangeOrderMoney(fakeDb(t), T, after, after);
    check('approve twice: contract still $2,549,650', t.projects[0].contract_amount === 2549650);
    check('approve twice: budget still $137,650', budgetChanges(t) === 137650);
    // 4. Edit Amount on the approved CO: $10,000 → $12,500.
    const edited = { ...after, amount: 12500, cost_impact: '12500' };
    t.change_orders[2] = edited;
    await applyChangeOrderMoney(fakeDb(t), T, after, edited);
    check('edit amount: contract $2,552,150', t.projects[0].contract_amount === 2552150);
    check('edit amount: budget $140,150', budgetChanges(t) === 140150);
    // 5. Reject it: everything comes back off.
    const rejected = { ...edited, status: 'rejected' };
    t.change_orders[2] = rejected;
    await applyChangeOrderMoney(fakeDb(t), T, edited, rejected);
    check('reject: contract back to $2,539,650', t.projects[0].contract_amount === 2539650 && t.projects[0].revised_contract_value === 2539650);
    check('reject: unallocated line back to $0', t.budget_lines.find((l) => l.cost_code === UNALLOCATED_CO_CODE)?.approved_changes === 0);
    check('reject: budget back to $127,650', budgetChanges(t) === 127650);
  }
  // 6. A CO whose bid package names a cost code goes on that line.
  {
    const t = pima();
    t.bid_packages.push({ id: 'bp', tenant_id: T, csi_codes: ['26-0500'], csi_division: '26' });
    const before = { id: 'co4', tenant_id: T, project_id: P, status: 'pending', amount: 5000, related_bid_package_id: 'bp', deleted_at: null };
    const after = { ...before, status: 'approved' };
    t.change_orders.push(after);
    await applyChangeOrderMoney(fakeDb(t), T, before, after);
    const elec = t.budget_lines.find((l) => l.cost_code === '26-0500')!;
    check('cost code: 26-0500 approved changes $5,000, revised $443,000', elec.approved_changes === 5000 && elec.revised_budget === 443000);
    check('cost code: nothing unallocated', !t.budget_lines.some((l) => l.cost_code === UNALLOCATED_CO_CODE && l.approved_changes !== 0));
  }
  // 7. A job with no original column: the original is read before the write and pinned.
  {
    const t = pima();
    Object.assign(t.projects[0], { original_contract_amount: 0, revised_contract_value: 2539650, contract_amount: 2539650 });
    const before = { id: 'co5', tenant_id: T, project_id: P, status: 'pending', amount: 1000, deleted_at: null };
    const after = { ...before, status: 'approved' };
    t.change_orders.push(after);
    await applyChangeOrderMoney(fakeDb(t), T, before, after);
    check('no original column: original pinned at $2,412,000', t.projects[0].original_contract_amount === 2412000);
    check('no original column: contract $2,540,650', t.projects[0].contract_amount === 2540650);
  }
  // 8. Deleting an approved CO takes it off.
  {
    const t = pima();
    const gone = t.change_orders.splice(1, 1)[0];
    await applyChangeOrderMoney(fakeDb(t), T, gone, null);
    check('delete: contract $2,498,400', t.projects[0].contract_amount === 2498400);
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
