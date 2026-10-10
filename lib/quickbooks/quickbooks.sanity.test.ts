/**
 * QuickBooks sanity — config, OAuth state, token expiry and the Saguaro →
 * QuickBooks mapping, pinned. No network, no database.
 * Run: bundle with esbuild (--bundle --platform=node) and run with node; exit 0 = every assertion held.
 */
import {
  apiBaseFor, environmentFrom, isQuickBooksConfigured, publicQuickBooksConfig, quickBooksConfig, redirectUriFrom,
  QBO_CALLBACK_PATH, QBO_SCOPE,
} from './config';
import {
  accessTokenExpired, buildAuthorizeUrl, checkOAuthState, isNavigation, newOAuthState, parseStateCookie,
  safeEqual, stateCookieSecure, stateCookieValue, tokenColumnsFromGrant,
} from './oauth';
import {
  cleanName, countOutcomes, customerPayload, invoiceDocNumber, invoiceMarker, invoicePayload, normalizeEntities,
  ownerOf, parseQboFault, parseStartDay, payAppAmount, payAppSkipReason, payAppTxnDate, pickIncomeAccount,
  qboQuote, vendorPayload, type PayAppIn, type ProjectIn,
} from './mapping';
import { cacheFor, companyChanged, pushHistory, stripSecrets, MAX_HISTORY, type QboHistoryEntry } from './settings';
import { QBO_RETURN_MESSAGES, qboReturnPath } from './return-codes';
import { QboApiError, QboReconnectError } from './client';
import { runQuickBooksPush } from './sync';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* ── 1. Config: one set of names, old names only as fallbacks ─────────── */
check('not configured with nothing set', !isQuickBooksConfigured({}));
check('not configured with only an id', !isQuickBooksConfigured({ QUICKBOOKS_CLIENT_ID: 'id' }));
check('configured with QUICKBOOKS_* pair', isQuickBooksConfigured({ QUICKBOOKS_CLIENT_ID: 'id', QUICKBOOKS_CLIENT_SECRET: 's' }));
check('configured with legacy QB_* pair', isQuickBooksConfigured({ QB_CLIENT_ID: 'id', QB_CLIENT_SECRET: 's' }));
check('whitespace-only values do not count', !isQuickBooksConfigured({ QUICKBOOKS_CLIENT_ID: '  ', QUICKBOOKS_CLIENT_SECRET: 's' }));
check('NEXT_PUBLIC id alone does not configure the server', !isQuickBooksConfigured({ NEXT_PUBLIC_QUICKBOOKS_CLIENT_ID: 'id' }));
const newWins = quickBooksConfig('https://x.test', { QUICKBOOKS_CLIENT_ID: 'new', QB_CLIENT_ID: 'old', QUICKBOOKS_CLIENT_SECRET: 's', QB_CLIENT_SECRET: 'olds' });
check('QUICKBOOKS_* wins over QB_*', newWins?.clientId === 'new' && newWins?.clientSecret === 's', JSON.stringify(newWins));
check('environment defaults to production', environmentFrom({}) === 'production');
check('QUICKBOOKS_ENVIRONMENT=sandbox', environmentFrom({ QUICKBOOKS_ENVIRONMENT: ' Sandbox ' }) === 'sandbox');
check("Intuit's word 'development' is sandbox", environmentFrom({ QUICKBOOKS_ENVIRONMENT: 'development' }) === 'sandbox');
check('legacy QB_SANDBOX=true is sandbox', environmentFrom({ QB_SANDBOX: 'true' }) === 'sandbox');
check('explicit production beats legacy sandbox flag', environmentFrom({ QUICKBOOKS_ENVIRONMENT: 'production', QB_SANDBOX: 'true' }) === 'production');
check('sandbox API host', apiBaseFor('sandbox') === 'https://sandbox-quickbooks.api.intuit.com');
check('production API host', apiBaseFor('production') === 'https://quickbooks.api.intuit.com');
check('explicit redirect URI wins', redirectUriFrom({ QUICKBOOKS_REDIRECT_URI: 'https://www.saguarocontrol.net/api/integrations/quickbooks/callback', NEXT_PUBLIC_APP_URL: 'https://a.test' }, 'https://b.test') === 'https://www.saguarocontrol.net/api/integrations/quickbooks/callback');
check('legacy QB_REDIRECT_URI is a fallback', redirectUriFrom({ QB_REDIRECT_URI: 'https://old.test/cb' }) === 'https://old.test/cb');
check('default redirect from NEXT_PUBLIC_APP_URL (path and slash dropped)', redirectUriFrom({ NEXT_PUBLIC_APP_URL: 'https://www.saguarocontrol.net/app/' }, 'https://b.test') === `https://www.saguarocontrol.net${QBO_CALLBACK_PATH}`);
check('default redirect from the request origin', redirectUriFrom({}, 'https://preview.test') === `https://preview.test${QBO_CALLBACK_PATH}`);
check('no redirect when nothing is absolute', redirectUriFrom({ NEXT_PUBLIC_APP_URL: 'saguaro' }) === '');
check('null config when not configured', quickBooksConfig('https://x.test', {}) === null);
const sb = quickBooksConfig('https://x.test', { QUICKBOOKS_CLIENT_ID: 'id', QUICKBOOKS_CLIENT_SECRET: 's', QUICKBOOKS_ENVIRONMENT: 'sandbox' });
check('sandbox config uses the sandbox host', sb?.apiBase === 'https://sandbox-quickbooks.api.intuit.com');
const pub = publicQuickBooksConfig({ QUICKBOOKS_CLIENT_ID: 'id', QUICKBOOKS_CLIENT_SECRET: 'shh' });
check('public config carries no id or secret', !JSON.stringify(pub).includes('shh') && !JSON.stringify(pub).includes('"id"') && pub.configured);

/* ── 2. OAuth state ──────────────────────────────────────────────────── */
const s1 = newOAuthState(), s2 = newOAuthState();
check('state is long and URL-safe', s1.length >= 43 && /^[A-Za-z0-9_-]+$/.test(s1), s1);
check('state is random', s1 !== s2);
const cookie = stateCookieValue(s1, 'user-1');
check('cookie round-trips', JSON.stringify(parseStateCookie(cookie)) === JSON.stringify({ state: s1, userId: 'user-1' }));
check('state accepted for the same user', checkOAuthState(cookie, s1, 'user-1').ok);
check('no cookie → rejected', JSON.stringify(checkOAuthState(undefined, s1, 'user-1')) === '{"ok":false,"reason":"no_cookie"}');
check('no state from Intuit → rejected', JSON.stringify(checkOAuthState(cookie, null, 'user-1')) === '{"ok":false,"reason":"no_state"}');
check('empty state (the old page sent state=) → rejected', !checkOAuthState(cookie, '', 'user-1').ok);
check('wrong state → rejected', JSON.stringify(checkOAuthState(cookie, s2, 'user-1')) === '{"ok":false,"reason":"mismatch"}');
check('another signed-in user → rejected', JSON.stringify(checkOAuthState(cookie, s1, 'user-2')) === '{"ok":false,"reason":"other_user"}');
check('no session → rejected', !checkOAuthState(cookie, s1, null).ok);
check('malformed cookie → rejected', !checkOAuthState('nodot', 'nodot', 'user-1').ok && !checkOAuthState('.u', '', 'u').ok);
check('safeEqual', safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('abc', 'abcd'));
const auth = new URL(buildAuthorizeUrl({ clientId: 'ABC', redirectUri: 'https://www.saguarocontrol.net/api/integrations/quickbooks/callback', state: s1 }));
check('authorize host', auth.origin + auth.pathname === 'https://appcenter.intuit.com/connect/oauth2');
check('authorize params', auth.searchParams.get('client_id') === 'ABC' && auth.searchParams.get('response_type') === 'code'
  && auth.searchParams.get('scope') === QBO_SCOPE && auth.searchParams.get('state') === s1
  && auth.searchParams.get('redirect_uri') === 'https://www.saguarocontrol.net/api/integrations/quickbooks/callback');
check('state cookie Secure in production and on https', stateCookieSecure('http:', 'production') && stateCookieSecure('https:', 'development'));
check('state cookie not Secure only on plain-http dev', !stateCookieSecure('http:', 'development'));
check('isNavigation: sec-fetch-mode navigate', isNavigation(new Headers({ 'sec-fetch-mode': 'navigate' })));
check('isNavigation: fetch is not', !isNavigation(new Headers({ 'sec-fetch-mode': 'cors', accept: 'text/html' })));
check('isNavigation: old browser by Accept', isNavigation(new Headers({ accept: 'text/html,application/xhtml+xml' })));

/* ── 3. Token expiry + rotation ──────────────────────────────────────── */
const now = Date.parse('2026-10-10T12:00:00Z');
check('missing expiry = expired', accessTokenExpired(null, now));
check('garbage expiry = expired', accessTokenExpired('not a date', now));
check('59 min left = fresh', !accessTokenExpired('2026-10-10T12:59:00Z', now));
check('4 min left = refresh now (5 min skew)', accessTokenExpired('2026-10-10T12:04:00Z', now));
check('already past = expired', accessTokenExpired('2026-10-10T11:00:00Z', now));
const g1 = tokenColumnsFromGrant({ access_token: 'A', refresh_token: 'R2', expires_in: 3600 }, now, 'R1');
check('grant → columns; rotated refresh token stored', g1?.access_token === 'A' && g1?.refresh_token === 'R2' && g1?.token_expires_at === '2026-10-10T13:00:00.000Z', JSON.stringify(g1));
const g2 = tokenColumnsFromGrant({ access_token: 'A' }, now, 'R1');
check('no refresh token in grant → keep the stored one; default 1 h', g2?.refresh_token === 'R1' && g2?.token_expires_at === '2026-10-10T13:00:00.000Z');
check('no access token → nothing to store', tokenColumnsFromGrant({ refresh_token: 'R' }, now) === null);

/* ── 4. Pay app → invoice ────────────────────────────────────────────── */
const zone = 'America/Phoenix';
const project: ProjectIn = {
  id: 'proj-0001-aaaa', name: 'Pima County Adult Detention Center', project_number: '2026-014',
  owner_entity: 'Pima County', owner_name: 'Jan Ortiz', owner_email: 'ap@pima.gov', owner_phone: '520-555-0100', owner_address: '130 W Congress St, Tucson AZ',
};
const pa = (o: Partial<PayAppIn> = {}): PayAppIn => ({
  id: 'pa-1', project_id: project.id, app_number: 4, status: 'approved',
  current_payment_due: 48250.5, net_payment_due: 48250.5,
  application_date: '2026-09-30', period_from: '2026-09-01', period_to: '2026-09-30',
  approved_at: '2026-10-02T17:00:00Z', certified_at: null, created_at: '2026-09-30T20:00:00Z',
  owner_name: 'Pima County', qbo_invoice_id: null, deleted_at: null, ...o,
});
check('amount = current_payment_due (line 8)', payAppAmount(pa()) === 48250.5);
check('amount ignores a different net_payment_due', payAppAmount(pa({ current_payment_due: 1000, net_payment_due: 999999 })) === 1000);
check('amount falls back to net_payment_due only when line 8 is empty', payAppAmount(pa({ current_payment_due: null, net_payment_due: '2500.555' })) === 2500.56);
check('amount from a numeric string', payAppAmount(pa({ current_payment_due: '12.345' })) === 12.35);
check('no amount at all', payAppAmount(pa({ current_payment_due: null, net_payment_due: null })) === null);

const inv = invoicePayload({ payApp: pa(), project, customerId: '58', itemId: '7', zone });
check('invoice built', inv.ok);
if (inv.ok) {
  const body = inv.payload as { CustomerRef: { value: string }; TxnDate: string; DocNumber: string; PrivateNote: string; CustomerMemo: { value: string }; Line: { Amount: number; DetailType: string; SalesItemLineDetail: { ItemRef: { value: string } } }[] };
  check('invoice: the owner customer, not a hard-coded 1', body.CustomerRef.value === '58');
  check('invoice: one line, amount = this period only', body.Line.length === 1 && body.Line[0].Amount === 48250.5 && inv.amount === 48250.5);
  check('invoice: sales line against the resolved item', body.Line[0].DetailType === 'SalesItemLineDetail' && body.Line[0].SalesItemLineDetail.ItemRef.value === '7');
  check('invoice: dated the application date', body.TxnDate === '2026-09-30', body.TxnDate);
  check('invoice: number = job number + app', body.DocNumber === '2026-014-PA4', body.DocNumber);
  check('invoice: private note carries the pay app marker', body.PrivateNote.startsWith(invoiceMarker('pa-1')));
  check('invoice: memo names the job, app and period', body.CustomerMemo.value === 'Pima County Adult Detention Center — Pay Application #4, period 2026-09-01 to 2026-09-30', body.CustomerMemo.value);
}
check('invoice refused at $0', !invoicePayload({ payApp: pa({ current_payment_due: 0 }), project, customerId: '58', itemId: '7', zone }).ok);
check('invoice refused when negative', !invoicePayload({ payApp: pa({ current_payment_due: -10 }), project, customerId: '58', itemId: '7', zone }).ok);
check('invoice refused with no amount', !invoicePayload({ payApp: pa({ current_payment_due: null, net_payment_due: null }), project, customerId: '58', itemId: '7', zone }).ok);
check('invoice refused without a customer', !invoicePayload({ payApp: pa(), project, customerId: '', itemId: '7', zone }).ok);

check('txn date: application date first', payAppTxnDate(pa(), zone) === '2026-09-30');
check('txn date: period end next', payAppTxnDate(pa({ application_date: null, period_to: '2026-09-28' }), zone) === '2026-09-28');
// 2026-10-03T02:00Z is still Oct 2 in Phoenix (UTC-7): the company's day, not the UTC day.
check('txn date: a timestamp is the company day', payAppTxnDate(pa({ application_date: null, period_to: null, approved_at: '2026-10-03T02:00:00Z' }), zone) === '2026-10-02');

check('doc number: two jobs with app #3 differ', invoiceDocNumber({ app_number: 3, project_id: 'aaaaaa11' }, { project_number: 'A-1' }) !== invoiceDocNumber({ app_number: 3, project_id: 'bbbbbb22' }, { project_number: 'B-1' }));
check('doc number: no job number → project id prefix', invoiceDocNumber({ app_number: 3, project_id: 'ab12cd34-ffff' }, { project_number: null }) === 'AB12CD-PA3');
const longDoc = invoiceDocNumber({ app_number: 12, project_id: 'x' }, { project_number: 'VERY-LONG-PROJECT-NUMBER-2026-0001' });
check('doc number: ≤ 21 chars, app suffix kept', longDoc.length <= 21 && longDoc.endsWith('-PA12'), longDoc);

check('eligible: approved', payAppSkipReason(pa(), null, zone) === null);
check('eligible: certified', payAppSkipReason(pa({ status: 'certified' }), null, zone) === null);
check('eligible: paid', payAppSkipReason(pa({ status: 'paid' }), null, zone) === null);
check('not sent: draft', payAppSkipReason(pa({ status: 'draft' }), null, zone) !== null);
check('not sent: submitted', payAppSkipReason(pa({ status: 'submitted' }), null, zone) !== null);
check('not sent twice: already has a QuickBooks id', payAppSkipReason(pa({ qbo_invoice_id: '991' }), null, zone) === 'already in QuickBooks');
check('not sent: deleted', payAppSkipReason(pa({ deleted_at: '2026-10-01T00:00:00Z' }), null, zone) === 'deleted');
check('start date: earlier pay app held back', (payAppSkipReason(pa(), '2026-10-01', zone) ?? '').includes('start date'));
check('start date: same day is sent', payAppSkipReason(pa(), '2026-09-30', zone) === null);

/* ── 5. Owner → customer ─────────────────────────────────────────────── */
check('owner: the entity wins over the person', ownerOf(project)?.name === 'Pima County');
check('owner: "{}" falls back to owner_name', ownerOf({ ...project, owner_entity: '{}' })?.name === 'Jan Ortiz');
check('owner: JSON entity is read', ownerOf({ ...project, owner_entity: '{"name":"Tucson USD","email":"x@tusd.org"}', owner_email: null })?.email === 'x@tusd.org');
check('owner: falls back to the pay app owner', ownerOf({ ...project, owner_entity: null, owner_name: null }, { owner_name: 'City of Mesa' })?.name === 'City of Mesa');
check('owner: none → null (no CustomerRef 1)', ownerOf({ ...project, owner_entity: null, owner_name: null }, { owner_name: null }) === null);
check('owner: bad email dropped', ownerOf({ ...project, owner_email: 'not-an-email' })?.email === '');
const cust = customerPayload(ownerOf(project)!) as { DisplayName: string; PrimaryEmailAddr?: { Address: string } };
check('customer payload', cust.DisplayName === 'Pima County' && cust.PrimaryEmailAddr?.Address === 'ap@pima.gov');
check('name: colon (Customer:Job separator) and newlines removed', cleanName(' Acme:\nBuilders  LLC ') === 'Acme- Builders LLC', cleanName(' Acme:\nBuilders  LLC '));
check("query quoting escapes ' and \\", qboQuote("O'Brien \\ Sons") === "'O\\'Brien \\\\ Sons'", qboQuote("O'Brien \\ Sons"));

/* ── 6. Sub → vendor ─────────────────────────────────────────────────── */
const sub = { id: 's1', company_name: 'Sonoran Electric LLC', dba_name: null, email: '', contact_email: 'ops@sonoran.test', phone: null, contact_phone: '602-555-0101', address: '1 Main', city: 'Phoenix', state: 'AZ', zip: '85001' };
const v = vendorPayload(sub);
check('vendor payload', v.ok && (v.payload as { DisplayName: string }).DisplayName === 'Sonoran Electric LLC');
check('vendor: contact email/phone used when the company ones are blank', v.ok && JSON.stringify(v.payload).includes('ops@sonoran.test') && JSON.stringify(v.payload).includes('602-555-0101'));
check('vendor: address mapped', v.ok && JSON.stringify((v.payload as { BillAddr: unknown }).BillAddr) === '{"Line1":"1 Main","City":"Phoenix","CountrySubDivisionCode":"AZ","PostalCode":"85001"}');
check('vendor: no empty email object sent', vendorPayload({ ...sub, contact_email: null }).ok && !JSON.stringify((vendorPayload({ ...sub, contact_email: null }) as { payload: unknown }).payload).includes('PrimaryEmailAddr'));
check('vendor: no name → skipped, not sent blank', !vendorPayload({ ...sub, company_name: '  ', dba_name: null }).ok);

/* ── 7. Item account, Intuit faults, entities, start date ────────────── */
check('income account: never Uncategorized', pickIncomeAccount([{ Id: '1', Name: 'Uncategorized Income' }, { Id: '2', Name: 'Sales' }])?.Id === '2');
check('income account: construction income preferred', pickIncomeAccount([{ Id: '2', Name: 'Sales' }, { Id: '3', Name: 'Construction Income' }, { Id: '4', Name: 'Services' }])?.Id === '3');
check('income account: none usable → null', pickIncomeAccount([{ Id: '1', Name: 'Uncategorized Income' }]) === null);
const dup = parseQboFault('{"Fault":{"Error":[{"Message":"Duplicate Name Exists Error","Detail":"The name supplied already exists. : Another customer, vendor or employee is already using this name.","code":"6240"}],"type":"ValidationFault"}}');
check('fault: message + detail + code', dup.code === '6240' && dup.message.startsWith('Duplicate Name Exists Error — The name supplied'), JSON.stringify(dup));
const auth401 = parseQboFault('{"fault":{"error":[{"message":"message=AuthenticationFailed; errorCode=003200; statusCode=401","detail":"Token expired","code":"3200"}],"type":"AUTHENTICATION"}}');
check('fault: lower-case shape', auth401.code === '3200' && auth401.message.includes('Token expired'));
check('fault: OAuth error body', parseQboFault('{"error":"invalid_grant"}').message === 'invalid_grant');
check('fault: plain text', parseQboFault('Service Unavailable').message === 'Service Unavailable');
check('entities: ordered, deduped, unknown dropped (no bills, no pull)', JSON.stringify(normalizeEntities(['invoices', 'bills', 'vendors', 'invoices', 'customers'])) === '["customers","vendors","invoices"]');
check('entities: nothing usable', normalizeEntities('invoices').length === 0 && normalizeEntities(['bills']).length === 0);
check('start date parse', parseStartDay('2026-10-01') === '2026-10-01' && parseStartDay('2026-02-30') === null && parseStartDay('10/01/2026') === null && parseStartDay(null) === null);
const c = countOutcomes([
  { entity: 'invoice', id: '1', label: 'a', outcome: 'created' }, { entity: 'invoice', id: '2', label: 'b', outcome: 'failed', message: 'x' },
  { entity: 'vendor', id: '3', label: 'c', outcome: 'linked' }, { entity: 'customer', id: '4', label: 'd', outcome: 'created' },
]);
check('outcome counts', c.created === 2 && c.failed === 1 && c.linked === 1 && c.byEntity.invoice.failed === 1 && c.byEntity.vendor.linked === 1);

/* ── 8. Settings never leak a token; company change resets ids ───────── */
const leaky = { access_token: 'AT', refresh_token: 'RT', sync_history: [{ at: 'x', nested: { client_secret: 'CS', ok: 1 } }], password: 'pw', invoice_start_date: '2026-10-01' };
const clean = JSON.stringify(stripSecrets(leaky));
check('stripSecrets removes tokens/secrets at any depth', !/AT|RT|CS|pw/.test(clean.replace(/"at"/g, '')) && clean.includes('"invoice_start_date":"2026-10-01"') && clean.includes('"ok":1'), clean);
check('cache kept for the same company', cacheFor({ qbo_cache: { realm: 'R1', item: { id: '7', name: 'Services' }, customers: { 'pima county': '58' } } }, 'R1').customers['pima county'] === '58');
check('cache empty for another company', Object.keys(cacheFor({ qbo_cache: { realm: 'R1', item: { id: '7', name: 'Services' }, customers: { a: '1' } } }, 'R2').customers).length === 0);
check('company change: different realm', companyChanged({ realmId: 'R1', environment: 'sandbox' }, { realmId: 'R2', environment: 'sandbox' }));
check('company change: sandbox → production', companyChanged({ realmId: 'R1', environment: 'sandbox' }, { realmId: 'R1', environment: 'production' }));
check('company change: first connection is not a change', !companyChanged({ realmId: null, environment: undefined }, { realmId: 'R1', environment: 'production' }));
check('company change: reconnect same company keeps ids', !companyChanged({ realmId: 'R1', environment: 'production' }, { realmId: 'R1', environment: 'production' }));
const h = (n: number): QboHistoryEntry => ({ at: String(n), by: 'x', entities: ['invoices'], counts: { created: n, linked: 0, skipped: 0, failed: 0 }, errors: [], remaining: 0 });
const many = Array.from({ length: 40 }, (_, i) => h(i)).reduce<QboHistoryEntry[]>((acc, e) => pushHistory(acc, e), []);
check('history newest first, capped', many.length === MAX_HISTORY && many[0].at === '39');

/* ── 9. Return codes the routes use all have a message ───────────────── */
for (const code of ['connected', 'denied', 'state', 'signin', 'forbidden', 'missing', 'not_configured', 'exchange', 'failed'] as const) {
  check(`return code ${code}`, !!QBO_RETURN_MESSAGES[code]?.msg && qboReturnPath(code) === `/app/integrations/quickbooks?qb=${code}`);
}

/* ── 10. The push itself, against a fake QuickBooks and a fake database ── */
type Row = Record<string, unknown>;
type Write = { table: string; patch: Row; filters: [string, unknown][] };
/** Just enough of supabase-js: reads return the table's rows, updates are recorded. */
function fakeDb(tables: Record<string, Row[]>) {
  const writes: Write[] = [];
  const from = (table: string) => {
    let patch: Row | null = null;
    const filters: [string, unknown][] = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'in', 'is', 'or', 'order', 'limit', 'not']) q[m] = () => q;
    q.eq = (c: string, v: unknown) => { filters.push([c, v]); return q; };
    q.update = (p: Row) => { patch = p; return q; };
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(
      patch ? (writes.push({ table, patch, filters }), { error: null }) : { data: tables[table] ?? [], error: null, count: (tables[table] ?? []).length },
    ).then(res, rej);
    return q;
  };
  return { db: { from } as unknown as Parameters<typeof runQuickBooksPush>[0]['db'], writes };
}
type QRec = { Id: string; DisplayName?: string; Name?: string; DocNumber?: string; PrivateNote?: string; Active?: boolean; AccountType?: string };
/** A QuickBooks company: query by the one field the push filters on, create appends. */
function fakeQbo(seed: Partial<Record<'Customer' | 'Vendor' | 'Invoice' | 'Item' | 'Account', QRec[]>>, opts: { failCreate?: (entity: string, payload: Row) => QboApiError | QboReconnectError | null } = {}) {
  const store: Record<string, QRec[]> = { Customer: [], Vendor: [], Invoice: [], Item: [], Account: [], ...seed };
  const created: { entity: string; payload: Row; Id: string }[] = [];
  let next = 500;
  const client = {
    realmId: 'R1',
    async query(entity: string, where: string) {
      const m = where.match(/^(\w+) = '((?:[^'\\]|\\.)*)'$/);
      const [, field, raw] = m ?? [];
      const val = (raw ?? '').replace(/\\(.)/g, '$1');
      return (store[entity] ?? []).filter((r) => (r as Record<string, unknown>)[field] === val);
    },
    async create(entity: string, payload: Row) {
      const err = opts.failCreate?.(entity, payload);
      if (err) throw err;
      const rec = { Id: String(next++), ...payload } as QRec;
      (store[entity] ??= []).push(rec);
      created.push({ entity, payload, Id: rec.Id });
      return rec;
    },
  };
  return { client: client as unknown as Parameters<typeof runQuickBooksPush>[0]['client'], store, created };
}
const emptyCache = () => ({ realm: 'R1', item: null, customers: {} as Record<string, string> });

async function pushChecks() {
  const subRow = { ...sub, id: 'sub-1' };
  const t = () => ({ pay_applications: [pa() as unknown as Row], projects: [project as unknown as Row], subcontractors: [subRow as unknown as Row] });

  // 10a. First send: existing customer linked, Services item used, invoice + vendor created, ids saved.
  {
    const { db, writes } = fakeDb(t());
    const q = fakeQbo({ Customer: [{ Id: '58', DisplayName: 'Pima County' }], Item: [{ Id: '7', Name: 'Services' }] });
    const run = await runQuickBooksPush({ db, tenantId: 'T1', client: q.client, entities: ['customers', 'vendors', 'invoices'], zone, startDay: null, cache: emptyCache() });
    const invCreate = q.created.find((c) => c.entity === 'Invoice');
    const body = invCreate?.payload as { CustomerRef?: { value: string }; Line?: { Amount: number; SalesItemLineDetail: { ItemRef: { value: string } } }[] } | undefined;
    check('push: invoice billed to the existing owner customer (linked, not created)', body?.CustomerRef?.value === '58' && !q.created.some((c) => c.entity === 'Customer'), JSON.stringify(q.created.map((c) => c.entity)));
    check('push: invoice amount is line 8, item is Services', body?.Line?.[0].Amount === 48250.5 && body?.Line?.[0].SalesItemLineDetail.ItemRef.value === '7');
    const paWrite = writes.find((w) => w.table === 'pay_applications');
    check('push: qbo_invoice_id saved, tenant-scoped', paWrite?.patch.qbo_invoice_id === invCreate?.Id && paWrite?.filters.some(([c, v]) => c === 'tenant_id' && v === 'T1') === true, JSON.stringify(paWrite));
    const subWrite = writes.find((w) => w.table === 'subcontractors');
    check('push: vendor created and qbo_vendor_id saved', !!subWrite && subWrite.patch.qbo_vendor_id === q.created.find((c) => c.entity === 'Vendor')?.Id);
    check('push: results per record', run.results.filter((r) => r.entity === 'invoice' && r.outcome === 'created').length === 1
      && run.results.some((r) => r.entity === 'vendor' && r.outcome === 'created')
      && run.results.some((r) => r.entity === 'customer' && r.outcome === 'linked'), JSON.stringify(run.results));
    check('push: customer + item remembered for next time', run.cache.customers['pima county'] === '58' && run.cache.item?.id === '7');
    check('push: not a reconnect', run.reconnect === null);
  }

  // 10b. Re-send after a crash between "created in QuickBooks" and "id saved": linked, not duplicated.
  {
    const { db, writes } = fakeDb(t());
    const q = fakeQbo({
      Customer: [{ Id: '58', DisplayName: 'Pima County' }], Item: [{ Id: '7', Name: 'Services' }],
      Invoice: [{ Id: '900', DocNumber: '2026-014-PA4', PrivateNote: `${invoiceMarker('pa-1')} · Pima` }],
      Vendor: [{ Id: '77', DisplayName: 'Sonoran Electric LLC' }],
    });
    const run = await runQuickBooksPush({ db, tenantId: 'T1', client: q.client, entities: ['vendors', 'invoices'], zone, startDay: null, cache: emptyCache() });
    check('re-send: no invoice or vendor created', !q.created.some((c) => c.entity === 'Invoice' || c.entity === 'Vendor'), JSON.stringify(q.created));
    check('re-send: invoice 900 linked and saved', writes.some((w) => w.table === 'pay_applications' && w.patch.qbo_invoice_id === '900') && run.results.some((r) => r.entity === 'invoice' && r.outcome === 'linked'));
    check('re-send: vendor 77 linked and saved', writes.some((w) => w.table === 'subcontractors' && w.patch.qbo_vendor_id === '77'));
  }

  // 10c. Same invoice number but NOT ours (no marker): never adopted.
  {
    const { db } = fakeDb(t());
    const q = fakeQbo({ Customer: [{ Id: '58', DisplayName: 'Pima County' }], Item: [{ Id: '7', Name: 'Services' }], Invoice: [{ Id: '901', DocNumber: '2026-014-PA4', PrivateNote: 'keyed by hand' }] });
    await runQuickBooksPush({ db, tenantId: 'T1', client: q.client, entities: ['invoices'], zone, startDay: null, cache: emptyCache() });
    check('foreign invoice with the same number is not adopted', q.created.some((c) => c.entity === 'Invoice'));
  }

  // 10d. New owner, no item: customer created, Progress Billing item created on a real income account.
  {
    const { db } = fakeDb(t());
    const q = fakeQbo({ Account: [{ Id: '1', Name: 'Uncategorized Income', AccountType: 'Income' }, { Id: '2', Name: 'Job Materials', AccountType: 'Cost of Goods Sold' }, { Id: '4', Name: 'Construction Income', AccountType: 'Income' }] });
    await runQuickBooksPush({ db, tenantId: 'T1', client: q.client, entities: ['invoices'], zone, startDay: null, cache: emptyCache() });
    const item = q.created.find((c) => c.entity === 'Item')?.payload as { Name?: string; Type?: string; IncomeAccountRef?: { value: string } } | undefined;
    check('item: Progress Billing created as a Service on Construction Income', item?.Name === 'Progress Billing' && item?.Type === 'Service' && item?.IncomeAccountRef?.value === '4', JSON.stringify(item));
    check('customer: created from the job owner', (q.created.find((c) => c.entity === 'Customer')?.payload as { DisplayName?: string })?.DisplayName === 'Pima County');
  }

  // 10e. Start date holds earlier pay apps back; nothing is sent for them.
  {
    const { db, writes } = fakeDb(t());
    const q = fakeQbo({ Customer: [{ Id: '58', DisplayName: 'Pima County' }], Item: [{ Id: '7', Name: 'Services' }] });
    const run = await runQuickBooksPush({ db, tenantId: 'T1', client: q.client, entities: ['invoices'], zone, startDay: '2026-10-01', cache: emptyCache() });
    check('start date: held back, counted, nothing created or written', run.beforeStart === 1 && q.created.length === 0 && writes.length === 0);
  }

  // 10f. One record refused by QuickBooks: reported with the reason; the others still go.
  {
    const two = { ...t(), subcontractors: [subRow as unknown as Row, { ...subRow, id: 'sub-2', company_name: 'Desert Test & Balance' } as unknown as Row] };
    const { db, writes } = fakeDb(two);
    const q = fakeQbo({}, { failCreate: (e, p) => (e === 'Vendor' && p.DisplayName === 'Sonoran Electric LLC' ? new QboApiError(400, 'Duplicate Name Exists Error — Another customer, vendor or employee is already using this name.', '6240') : null) });
    const run = await runQuickBooksPush({ db, tenantId: 'T1', client: q.client, entities: ['vendors'], zone, startDay: null, cache: emptyCache() });
    const bad = run.results.find((r) => r.id === 'sub-1');
    check('refused record: failed with Intuit\'s reason, no id saved', bad?.outcome === 'failed' && (bad.message ?? '').includes('Duplicate Name') && !writes.some((w) => w.filters.some(([, v]) => v === 'sub-1')));
    check('refused record: the next one still sent', run.results.some((r) => r.id === 'sub-2' && r.outcome === 'created'));
  }

  // 10g. Authorization lost mid-run: stops, reports what it did, says reconnect.
  {
    const { db } = fakeDb(t());
    const q = fakeQbo({}, { failCreate: () => new QboReconnectError('QuickBooks authorization expired or was revoked. Connect QuickBooks again.') });
    const run = await runQuickBooksPush({ db, tenantId: 'T1', client: q.client, entities: ['vendors', 'invoices'], zone, startDay: null, cache: emptyCache() });
    check('reconnect: run stops with the reason', (run.reconnect ?? '').includes('Connect QuickBooks again') && !run.results.some((r) => r.entity === 'invoice'));
  }

  // 10h. A job with no owner: the invoice fails loudly — never billed to customer "1".
  {
    const { db } = fakeDb({ ...t(), projects: [{ ...project, owner_entity: null, owner_name: null } as unknown as Row], pay_applications: [pa({ owner_name: null }) as unknown as Row] });
    const q = fakeQbo({ Item: [{ Id: '7', Name: 'Services' }] });
    const run = await runQuickBooksPush({ db, tenantId: 'T1', client: q.client, entities: ['invoices'], zone, startDay: null, cache: emptyCache() });
    check('no owner: failed, nothing created', q.created.length === 0 && run.results[0]?.outcome === 'failed' && (run.results[0]?.message ?? '').includes('no owner'));
  }
}

pushChecks().then(() => {
  if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
  console.log('\nall quickbooks assertions held');
}, (e) => { console.error('FAIL push checks threw', e); process.exit(1); });
