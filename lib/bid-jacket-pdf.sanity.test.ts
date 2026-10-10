/**
 * The printed bid jacket: what it says, and that it renders.
 * Run: NEXT_PUBLIC_SUPABASE_URL=http://localhost:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x \
 *        npx -y tsx lib/bid-jacket-pdf.sanity.test.ts   (exit 0 = every assertion held)
 *
 * No database: jacketToPdfInput takes an assembled Jacket, generateBidJacket takes its output.
 */
import { PDFDocument } from 'pdf-lib';
import { fmtWhen, fmtCoverage, readInsuranceText, ownerOf, linkWindow, jacketToPdfInput, stableStorageUrl } from './bid-jacket-pdf';
import { stateTimeZone } from './time-zone';
import { generateBidJacket } from './pdf-engine';
import type { Jacket } from './bid-jacket';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Dates: a date column is its calendar day; a timestamp names its zone.
check('date-only due date is that day, not the day before in Arizona', fmtWhen('2026-10-20', 'America/Phoenix') === 'Tuesday, October 20, 2026');
check('midnight-UTC stamp is a date typed without a time', fmtWhen('2026-10-20T00:00:00+00:00', 'America/Phoenix') === 'Tuesday, October 20, 2026');
check('timestamp shows its time and zone', fmtWhen('2026-10-20T21:00:00+00:00', 'America/Phoenix') === 'Tuesday, October 20, 2026, 2:00 PM MST');
check('unparseable date shown as entered, not dropped', fmtWhen('next Friday', 'UTC') === 'next Friday');
check('zone from the job state; none when unknown (never Phoenix by default)', stateTimeZone('ca') === 'America/Los_Angeles' && stateTimeZone('IA') === 'America/Chicago' && stateTimeZone('Iowa') === 'America/Chicago' && stateTimeZone('') === null && stateTimeZone('ZZ') === null);

// Coverage: as entered.
check('numeric text reads as dollars', fmtCoverage('2000000') === '$2,000,000' && fmtCoverage('$1,000,000') === '$1,000,000');
check('words kept', fmtCoverage('Statutory') === 'Statutory');
check('empty is null, never a default', fmtCoverage(null) === null && fmtCoverage('') === null);

// Sage wrote JSON into the TEXT column.
const ins = readInsuranceText('{"general_liability":1000000,"workers_compensation":"Statutory"}');
check('JSON insurance text becomes lines', ins.text === null && ins.entries.length === 2 && ins.entries[1].value === 'Statutory', JSON.stringify(ins));
check('"{}" is nothing', readInsuranceText('{}').entries.length === 0 && readInsuranceText('{}').text === null);
check('plain text printed as written', readInsuranceText('Name owner as additional insured').text === 'Name owner as additional insured');

// Owner: owner_entity is TEXT.
check('owner_entity used as text', ownerOf({ owner_entity: 'ZZ AUDIT Holdings', owner_address: '9 Way' })?.address === '9 Way');
check('"{}" falls back to owner_name', ownerOf({ owner_entity: '{}', owner_name: 'ZZ AUDIT Owner' })?.name === 'ZZ AUDIT Owner');
check('no owner → null', ownerOf({}) === null);

// Links in the index.
const now = new Date('2026-10-10T12:00:00Z');
check('links last until 14 days after due', linkWindow('2026-10-20', now).until.toISOString().startsWith('2026-11-03'));
check('…at least 7 days, at most 60', Math.round(linkWindow('2020-01-01', now).seconds / 86400) === 7 && Math.round(linkWindow('2030-01-01', now).seconds / 86400) === 60);
check('stored URL is the stable one', stableStorageUrl('https://x.supabase.co/storage/v1/object/sign/documents/p/a.pdf?token=t') === 'https://x.supabase.co/storage/v1/object/public/documents/p/a.pdf');

// The mapping.
const jacket = {
  package: { id: 'k', name: 'ZZ AUDIT Electrical', number: 'BP-1', trade: 'Electrical', status: 'open', dueDate: '2026-10-20', validityDays: 60, preBidDate: null, preBidLocation: null, preBidRequired: false, csiDivision: '26', estimatedValue: 999999, jacketPdfUrl: null, jacketGeneratedAt: null, addendumCount: 0 },
  project: { id: 'p', name: 'ZZ AUDIT Job', address: '1 Main St', city: 'Phoenix', state: 'AZ' },
  sections: [
    { key: 'invitation', label: 'Invitation & Instructions', required: true, count: 1, pages: [{ id: 'i', title: 'Instructions to Bidders', body: 'ZZ AUDIT instructions' }], docs: [] },
    { key: 'scope', label: 'Scope of Work', required: true, count: 1, pages: [{ id: 's', title: 'Scope Narrative', body: 'ZZ AUDIT scope\n- item one' }], docs: [] },
    { key: 'drawings', label: 'Drawings', required: true, count: 1, pages: [], docs: [{ id: 'd', name: 'E-101 — Power', url: 'https://x/storage/v1/object/public/drawings/e.pdf', meta: 'Rev 2', sub: 'Electrical', kind: 'sheet' }] },
    { key: 'specs', label: 'Specifications', required: true, count: 0, pages: [], docs: [] },
    { key: 'bidform', label: 'Bid Form', required: true, count: 1, pages: [], docs: [] },
    { key: 'requirements', label: 'Insurance & Bonding', required: true, count: 1, pages: [], docs: [] },
    { key: 'addenda', label: 'Addenda', required: false, count: 0, pages: [], docs: [] },
    { key: 'attachments', label: 'Attachments', required: false, count: 0, pages: [], docs: [] },
    { key: 'correspondence', label: 'Correspondence', required: false, count: 1, pages: [], docs: [{ id: 'c', name: 'GC-ONLY MAIL', url: null, kind: 'text' }] },
  ],
  lineItems: [{ id: 'l', code: '26 05 19', description: 'ZZ AUDIT wire', quantity: 4200, unit: 'LF' }],
  requirements: { bond: true, prevailingWage: false, insuranceAmount: null, generalLiability: '2000000', autoLiability: null, workersComp: null, insuranceText: '{"auto_liability":1000000}', additional: [] },
  bidders: { invited: 9, responded: 4 },
  correspondence: [],
  completeness: { complete: 5, total: 6, missing: ['Specifications'] },
} as unknown as Jacket;
const input = jacketToPdfInput(jacket, { gc: { name: 'ZZ AUDIT Builders', address: '', license: '' }, owner: null, zone: 'America/Phoenix', preparedOn: now });
const line = (l: string) => input.insurance.lines.find((x) => x.label === l)?.value;
check('instructions are the GC’s own', input.instructions === 'ZZ AUDIT instructions');
check('due date from the jacket', input.pkg.due === 'Tuesday, October 20, 2026');
check('validity from bid_validity_days', input.pkg.validity === '60 days');
check('GL as entered', line('General Liability') === '$2,000,000');
check('auto filled from the JSON text', line('Auto Liability') === '$1,000,000');
check('WC not entered says so', line("Workers' Comp") === 'Not provided');
check('no minimum invented', line('Minimum Coverage') === 'Not provided');
check('bond as set', line('Payment & Performance Bond') === 'Required');
check('index: drawings, specs, addenda, attachments; never correspondence', input.index.map((s) => s.label).join() === 'Drawings,Specifications,Addenda,Attachments');
check('quantity formatted', input.lineItems[0].quantity === '4,200');
const flat = JSON.stringify(input);
check('no GC-only figures reach the PDF input', !flat.includes('999999') && !flat.includes('GC-ONLY') && !/"invited"|"responded"|completeness/.test(flat));

(async () => {
  const bytes = await generateBidJacket({ ...input, linksValidUntil: 'November 3, 2026' });
  const doc = await PDFDocument.load(bytes);
  check('renders a PDF', String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-' && doc.getPageCount() === 6, String(doc.getPageCount()));
  // A long unbroken word and non-WinAnsi text must not abort the document.
  const odd = await generateBidJacket({ ...input, instructions: `Use https://example.com/${'x'.repeat(300)} ☐ → ✓ 日本`, lineItems: Array.from({ length: 80 }, (_, i) => ({ code: String(i), description: `ZZ AUDIT line ${i}`, quantity: '1', unit: 'EA' })) });
  check('long words, odd characters and 80 lines still render', (await PDFDocument.load(odd)).getPageCount() >= 7);
  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})();
