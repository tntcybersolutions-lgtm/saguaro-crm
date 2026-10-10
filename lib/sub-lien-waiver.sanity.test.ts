/**
 * Lien waivers signed from the sub portal.
 * Run: npx -y tsx lib/sub-lien-waiver.sanity.test.ts   (exit 0 = every assertion held)
 */
import {
  checkSignature, invoiceWaiver, isDbWaiverType, isSignableWaiver, isSignedWaiver,
  pdfWaiverType, waiverTypeForInvoice, waiverTypeLabel, DB_WAIVER_TYPES,
} from './sub-lien-waiver';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Types line up with the live check constraint and the PDF engine
check('db types are the check-constraint values', DB_WAIVER_TYPES.join() === 'conditional_progress,unconditional_progress,conditional_final,unconditional_final');
check('progress → partial for the PDF', pdfWaiverType('conditional_progress') === 'conditional_partial' && pdfWaiverType('unconditional_progress') === 'unconditional_partial');
check('final stays final', pdfWaiverType('unconditional_final') === 'unconditional_final');
check('isDbWaiverType rejects the PDF names', !isDbWaiverType('conditional_partial') && isDbWaiverType('conditional_final'));
check('labels', waiverTypeLabel('conditional_progress') === 'Conditional progress waiver' && waiverTypeLabel('x') === 'Lien waiver');

// Which waiver an invoice calls for
check('approved → conditional progress', waiverTypeForInvoice('approved') === 'conditional_progress');
check('paid → unconditional progress', waiverTypeForInvoice('Paid') === 'unconditional_progress');
check('submitted → none yet', waiverTypeForInvoice('submitted') === null);
check('null → none', waiverTypeForInvoice(null) === null);

// Signed / signable
check('status signed is signed', isSignedWaiver({ status: 'signed' }));
check('signed_at alone is signed', isSignedWaiver({ status: 'pending', signed_at: '2026-10-10T00:00:00Z' }));
check('pending is signable', isSignableWaiver({ status: 'pending' }));
check('sent / requested are signable', isSignableWaiver({ status: 'sent' }) && isSignableWaiver({ status: 'requested' }));
check('signed is not signable', !isSignableWaiver({ status: 'signed' }));
check('rejected is not signable', !isSignableWaiver({ status: 'rejected' }));
check('deleted is not signable', !isSignableWaiver({ status: 'pending', deleted_at: '2026-10-01' }));

// Matching an invoice to its waiver
const pa = { status: 'approved', period_to: '2026-09-30', net_amount: '11250.00' };
const ws = [
  { id: 'other-amount', waiver_type: 'conditional_progress', amount: 9000, through_date: '2026-09-30', status: 'pending' },
  { id: 'other-day', waiver_type: 'conditional_progress', amount: 11250, through_date: '2026-08-31', status: 'signed' },
  { id: 'wrong-type', waiver_type: 'unconditional_progress', amount: 11250, through_date: '2026-09-30', status: 'signed' },
  { id: 'pending-match', waiver_type: 'conditional_progress', amount: '11250', through_date: '2026-09-30', status: 'pending' },
  { id: 'signed-match', waiver_type: 'conditional_progress', amount: 11250.004, through_date: '2026-09-30T00:00:00+00:00', status: 'signed' },
];
check('signed match wins over pending match', invoiceWaiver(pa, ws)?.id === 'signed-match');
check('pending match when nothing signed', invoiceWaiver(pa, ws.filter((w) => w.id !== 'signed-match'))?.id === 'pending-match');
check('amount must match to the cent', invoiceWaiver(pa, [ws[0]]) === undefined);
check('through day must match', invoiceWaiver(pa, [ws[1]]) === undefined);
check('type follows the invoice status', invoiceWaiver({ ...pa, status: 'paid' }, ws)?.id === 'wrong-type');
check('unapproved invoice has no waiver', invoiceWaiver({ ...pa, status: 'submitted' }, ws) === undefined);
check('deleted waiver ignored', invoiceWaiver(pa, [{ ...ws[3], deleted_at: '2026-10-01' }]) === undefined);

// The signature
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const dataUrl = `data:image/png;base64,${PNG_1PX}`;
const ok = checkSignature({ signed_name: '  Maria   Lopez ', signer_title: ' Owner ', signature: dataUrl });
check('valid signature accepted', ok.ok === true);
if (ok.ok) {
  check('name collapsed + trimmed', ok.name === 'Maria Lopez');
  check('title trimmed', ok.title === 'Owner');
  check('png decoded with magic bytes', ok.png[0] === 0x89 && ok.png[1] === 0x50 && ok.png.length > 64);
}
const noTitle = checkSignature({ signed_name: 'Jo Diaz', signature: dataUrl });
check('blank title → null', noTitle.ok === true && noTitle.title === null);
const noName = checkSignature({ signed_name: ' ', signature: dataUrl });
check('missing name refused on signed_name', !noName.ok && noName.field === 'signed_name');
const noSig = checkSignature({ signed_name: 'Jo Diaz', signature: '' });
check('missing signature refused', !noSig.ok && noSig.field === 'signature');
const jpeg = checkSignature({ signed_name: 'Jo Diaz', signature: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' });
check('non-PNG data URL refused', !jpeg.ok && jpeg.field === 'signature');
const notPng = checkSignature({ signed_name: 'Jo Diaz', signature: `data:image/png;base64,${Buffer.from('x'.repeat(100)).toString('base64')}` });
check('bytes that are not a PNG refused', !notPng.ok && notPng.field === 'signature');
const huge = checkSignature({ signed_name: 'Jo Diaz', signature: `data:image/png;base64,${'A'.repeat(700_000)}` });
check('oversized signature refused', !huge.ok && huge.field === 'signature');
const longName = checkSignature({ signed_name: 'x'.repeat(121), signature: dataUrl });
check('name over 120 refused', !longName.ok && longName.field === 'signed_name');
const longTitle = checkSignature({ signed_name: 'Jo Diaz', signer_title: 'x'.repeat(81), signature: dataUrl });
check('title over 80 refused', !longTitle.ok && longTitle.field === 'signer_title');

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall sub lien waiver assertions held');
