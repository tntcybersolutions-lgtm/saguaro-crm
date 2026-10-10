/**
 * Sub portal compliance uploads — names, paths and the folder fence.
 * Run: npx -y tsx lib/sub-portal-files.sanity.test.ts   (exit 0 = every assertion held)
 */
import {
  checkComplianceFileName, complianceFolder, complianceUploadPath, expiryDay, isComplianceDocType,
  ownsPath, safeFileName, subPortalFilePrefix, SUB_FILES_BUCKET,
} from './sub-portal-files';
import { fileNameFromUrl } from './sub-portal-view';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const T = '11111111-1111-1111-1111-111111111111';
const P = '22222222-2222-2222-2222-222222222222';
const S = '33333333-3333-3333-3333-333333333333';
const SESSION = '44444444-4444-4444-4444-444444444444';

// The same bucket and folder the Documents upload uses
check('bucket is project-files', SUB_FILES_BUCKET === 'project-files');
const prefix = subPortalFilePrefix({ tenant_id: T, project_id: P, sub_id: S, id: SESSION });
check('roster sub folder', prefix === `${T}/projects/${P}/sub-portal/${S}/`);
check('email-only falls back to the session id', subPortalFilePrefix({ tenant_id: T, project_id: P, sub_id: null, id: SESSION }) === `${T}/projects/${P}/sub-portal/${SESSION}/`);
const folder = complianceFolder(prefix);
const path = complianceUploadPath(prefix, 'COI_2026.pdf', 1760000000000);
check('upload path shape', path === `${folder}1760000000000-COI_2026.pdf`);
check('file name reads back from the stored path', fileNameFromUrl(path) === 'COI_2026.pdf');

// The fence
check('own upload accepted', ownsPath(folder, path));
check('another sub refused', !ownsPath(folder, `${T}/projects/${P}/sub-portal/${SESSION}/compliance/1-x.pdf`));
check('another tenant refused', !ownsPath(folder, path.replace(T, '99999999-9999-9999-9999-999999999999')));
check('../ escape refused', !ownsPath(folder, `${folder}../../other/1-x.pdf`));
check('./ segment refused', !ownsPath(folder, `${folder}./1-x.pdf`));
check('empty segment refused', !ownsPath(folder, `${folder}a//b.pdf`));
check('the folder itself refused', !ownsPath(folder, folder));
check('backslash refused', !ownsPath(folder, `${folder}a\\..\\b.pdf`));
check('non-string refused', !ownsPath(folder, 42) && !ownsPath(folder, null));
check('prefix-lookalike refused', !ownsPath(folder, folder.slice(0, -1) + '-evil/1-x.pdf'));

// Names
check('safe name strips spaces / symbols', safeFileName('My COI (2026).pdf') === 'My_COI_2026_.pdf');
check('leading dots dropped', safeFileName('...pdf') === 'pdf');
check('empty → file', safeFileName('') === 'file');
check('pdf allowed', checkComplianceFileName('coi.PDF').ok);
check('photo allowed', checkComplianceFileName('IMG_2041.HEIC').ok && checkComplianceFileName('w9.jpeg').ok);
check('word allowed', checkComplianceFileName('license.docx').ok);
const exe = checkComplianceFileName('payload.exe');
check('exe refused with a reason', !exe.ok && /PDF/.test(exe.message));
const blank = checkComplianceFileName('  ');
check('blank refused', !blank.ok && /Choose/.test(blank.message));

// Doc types are the Compliance tab's slots
check('insurance is a slot', isComplianceDocType('insurance'));
check('safety_certification is a slot', isComplianceDocType('safety_certification'));
check('unknown type refused', !isComplianceDocType('selfie') && !isComplianceDocType(undefined));

// Expiry
const e1 = expiryDay('2027-03-31');
check('real day accepted', e1.ok && e1.day === '2027-03-31');
const e2 = expiryDay('');
check('blank → null', e2.ok && e2.day === null);
const e3 = expiryDay(null);
check('null → null', e3.ok && e3.day === null);
check('Feb 30 refused', !expiryDay('2027-02-30').ok);
check('free text refused', !expiryDay('next year').ok);
check('number refused', !expiryDay(20270331).ok);

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall sub portal file assertions held');
