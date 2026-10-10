/* Sanity checks for lib/media-save — file naming for the in-app share sheet. */
import { fileNameFrom } from './media-save';

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  → ${String(got)}`}`);
  if (!ok) failed++;
};

check('server file name wins', fileNameFrom('attachment; filename="estimate-1042.pdf"', 'application/pdf', 'Takeoff estimate') === 'estimate-1042.pdf', fileNameFrom('attachment; filename="estimate-1042.pdf"', 'application/pdf', 'x'));
check('RFC 5987 name is decoded', fileNameFrom("attachment; filename*=UTF-8''Lien%20waiver%20%233.pdf", 'application/pdf', 'x') === 'Lien waiver #3.pdf');
check('no header: extension from a PDF type', fileNameFrom(null, 'application/pdf', 'WH-347 certified payroll') === 'WH-347 certified payroll.pdf');
check('no header: extension from an xlsx type', fileNameFrom(null, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Takeoff estimate') === 'Takeoff estimate.xlsx');
check('fallback that already has an extension is kept', fileNameFrom(null, 'application/pdf', 'jha.pdf') === 'jha.pdf');
check('unknown type: no invented extension', fileNameFrom(null, 'application/octet-stream', 'Report') === 'Report');
check('slashes in a server name are made safe', fileNameFrom('attachment; filename="a/b.pdf"', 'application/pdf', 'x') === 'a b.pdf', fileNameFrom('attachment; filename="a/b.pdf"', '', 'x'));

if (failed) { console.error(`\n${failed} media-save assertion(s) failed`); process.exit(1); }
console.log('\nall media-save assertions held');
