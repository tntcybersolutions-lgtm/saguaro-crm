/**
 * Verifies the two option-list fixes found during the live click-through:
 *   - the option a client has already picked reports isChosen, so the UI shows
 *     "Chosen" rather than offering a second Choose button
 *   - a fractional unit cost survives, so $10.67/SF is not displayed as "$11"
 *     next to a $12,804 total the client will try to reconcile
 *
 * Restores the selection it borrows. Run with the server up.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const { data: s, error } = await anon.auth.signInWithPassword({ email: 'claude.qa@saguarocontrol.net', password: 'Sag-QA-2026!verify' });
if (error) { console.error(error.message); process.exit(1); }
const T = s.session.access_token;
const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const api = async (p, i = {}) => {
  const r = await fetch(BASE + p, { ...i, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T, ...(i.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let fails = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); if (!c) fails++; };

const { data: sel } = await admin.from('selections').select('id, selected_amount, variance, notes').eq('item_name', 'Lobby Tile').single();
const orig = { amt: sel.selected_amount, v: sel.variance, notes: sel.notes };

try {
  const before = (await api(`/api/selections/${sel.id}/options`)).body.options;
  check('with a non-matching pick, no option is marked chosen',
    before.every((o) => !o.isChosen), before.map((o) => `${o.name}:${o.isChosen}`).join(', '));

  const unitCosts = before.map((o) => Number(o.unit_cost));
  check('a fractional unit cost survives the round trip',
    unitCosts.includes(10.67), `${unitCosts.join(', ')} — the list now renders these with cents, not "$11"`);

  const carrara = before.find((o) => o.name === 'Carrara Marble');
  await api(`/api/selections/${sel.id}`, { method: 'PUT', body: JSON.stringify({ cost: carrara.cost }) });

  const after = (await api(`/api/selections/${sel.id}/options`)).body.options;
  const c2 = after.find((o) => o.name === 'Carrara Marble');
  check('after picking it, that option reports isChosen',
    c2.isChosen === true, `isChosen=${c2.isChosen} — the row renders "Chosen" instead of a second Choose button`);
  check('and only that one is marked',
    after.filter((o) => o.isChosen).length === 1, `${after.filter((o) => o.isChosen).length} of ${after.length}`);

  const row = (await api('/api/selections/list?projectId=b8ab7fd9-0cc9-443f-b0c8-d8855dc99c3d')).body.selections.find((r) => r.id === sel.id);
  check('the pick moved the variance', row.variance === -6600, `${row.variance} (15,000 - 21,600)`);
} finally {
  await admin.from('selections').update({ selected_amount: orig.amt, variance: orig.v, notes: orig.notes }).eq('id', sel.id);
  const { data: back } = await admin.from('selections').select('selected_amount, variance').eq('id', sel.id).single();
  check('the demo selection was restored',
    String(back.selected_amount) === String(orig.amt) && String(back.variance) === String(orig.v),
    `${back.selected_amount}, variance ${back.variance}`);
}

console.log(fails === 0 ? '\nBOTH OPTION-LIST FIXES VERIFIED\n' : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
