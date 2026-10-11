/**
 * Unsaved-changes gate + Back history sanity.
 * Run: npx -y tsx lib/autoGuard.sanity.test.ts   (exit 0 = every assertion held)
 *
 * Pins what the app-wide gate treats as work (never a search box), which
 * button it presses for "Save and exit" (never Cancel or Delete), which
 * requests count as a form saving, and how Back tracks the prior screen.
 */
import { isGuardableField, isLooseWorkField, pickSaveButton, isSaveRequest } from './autoGuard';
import { nextStack } from './navHistory';
import { registerNavGuard, requestNavigation, isPageGuardDirty } from './navGuard';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* What counts as work */
check('text input is work', isGuardableField({ tag: 'INPUT', type: 'text', name: 'title' }));
check('textarea is work', isGuardableField({ tag: 'TEXTAREA', name: 'description' }));
check('select is work', isGuardableField({ tag: 'SELECT', name: 'status' }));
check('checkbox is work', isGuardableField({ tag: 'INPUT', type: 'checkbox', name: 'billable' }));
check('search type is not', !isGuardableField({ tag: 'INPUT', type: 'search' }));
check('placeholder "Search jobs…" is not', !isGuardableField({ tag: 'INPUT', type: 'text', placeholder: 'Search jobs…' }));
check('a filter box is not', !isGuardableField({ tag: 'INPUT', type: 'text', ariaLabel: 'Filter by vendor' }));
check('file picker is not (it uploads on pick)', !isGuardableField({ tag: 'INPUT', type: 'file' }));
check('hidden is not', !isGuardableField({ tag: 'INPUT', type: 'hidden' }));
check('read-only is not', !isGuardableField({ tag: 'INPUT', type: 'text', readOnly: true }));
check('disabled is not', !isGuardableField({ tag: 'INPUT', type: 'text', disabled: true }));
check('combobox is not', !isGuardableField({ tag: 'INPUT', type: 'text', role: 'combobox' }));
check('a button is not', !isGuardableField({ tag: 'BUTTON' }));
check('"Sort order" field name is not', !isGuardableField({ tag: 'SELECT', name: 'sort' }));

/* On the page itself (outside a form/dialog) only typed text is work */
check('page textarea (a note, a message) is work', isLooseWorkField({ tag: 'TEXTAREA', name: 'note' }));
check('page text input is work', isLooseWorkField({ tag: 'INPUT', type: 'text', name: 'title' }));
check('page dropdown is a filter, not work', !isLooseWorkField({ tag: 'SELECT', name: 'status' }));
check('page date is a filter, not work', !isLooseWorkField({ tag: 'INPUT', type: 'date', name: 'from' }));
check('page checkbox is not work', !isLooseWorkField({ tag: 'INPUT', type: 'checkbox' }));
check('page number box is not work', !isLooseWorkField({ tag: 'INPUT', type: 'number' }));
check('page search box still not work', !isLooseWorkField({ tag: 'INPUT', type: 'text', placeholder: 'Search…' }));

/* Which button "Save and exit" presses */
check('Save wins over Cancel', pickSaveButton(['Cancel', 'Save']) === 1);
check('Save RFI wins over Send', pickSaveButton(['Send to architect', 'Save RFI', 'Cancel']) === 1);
check('Create works when there is no Save', pickSaveButton(['Cancel', 'Create Invoice']) === 1);
check('never Delete', pickSaveButton(['Delete', 'Cancel']) === -1);
check('never "Discard draft"', pickSaveButton(['Discard draft']) === -1);
check('never "Save" hidden in "Cancel and save later"? -> Cancel wins', pickSaveButton(['Cancel and save later']) === -1);
check('a plain submit counts when nothing is named', pickSaveButton(['Go', 'Cancel'], [true, false]) === 0);
check('the last of equals (primary at the end)', pickSaveButton(['Save', 'Save & close']) === 1);
check('nothing to press', pickSaveButton(['Close', 'Back']) === -1);
check('Update for edit forms', pickSaveButton(['Cancel', 'Update Change Order']) === 1);

/* Which requests count as a form saving */
check('POST /api/rfis', isSaveRequest('POST', '/api/rfis'));
check('PATCH /api/projects/x', isSaveRequest('patch', '/api/projects/abc'));
check('GET never', !isSaveRequest('GET', '/api/rfis'));
check('DELETE never (not a save)', !isSaveRequest('DELETE', '/api/rfis/1'));
check('Sage chat never', !isSaveRequest('POST', '/api/sage/chat'));
check('analytics never', !isSaveRequest('POST', '/api/analytics/event'));
check('outside /api never', !isSaveRequest('POST', '/auth/callback'));

/* Back history */
check('first screen', nextStack([], '/app').join() === '/app');
check('forward adds', nextStack(['/app'], '/app/projects').join() === '/app,/app/projects');
check('same screen again is no step', nextStack(['/app', '/app/projects'], '/app/projects').length === 2);
check('the screen before = a step back', nextStack(['/app', '/app/projects', '/app/projects/x'], '/app/projects').join() === '/app,/app/projects');
check('capped at 50', nextStack(Array.from({ length: 50 }, (_, i) => `/p${i}`), '/new').length === 50);

/* A page's own guard answers before the shell's fallback */
let pageDirty = true;
const asked: string[] = [];
const offShell = registerNavGuard({ isDirty: () => true, intercept: () => { asked.push('shell'); }, fallback: true });
const offPage = registerNavGuard({ isDirty: () => pageDirty, intercept: () => { asked.push('page'); } });
check('page guard dirty is seen', isPageGuardDirty());
requestNavigation(() => {}, '/app');
check('page guard asked first', asked[0] === 'page', asked.join());
pageDirty = false;
requestNavigation(() => {}, '/app');
check('shell asked when the page is clean', asked[1] === 'shell', asked.join());
check('page clean -> not page-dirty', !isPageGuardDirty());
offPage(); offShell();

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall unsaved-gate checks passed');
