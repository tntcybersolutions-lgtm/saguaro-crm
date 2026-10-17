/**
 * @jest-environment node
 *
 * Drafts on this device (lib/autoDraft — the rules the shell's draft keeper in
 * components/AutoUnsavedGuard follows). Pins: one key per screen and form;
 * what is kept and restored; that a save (or Discard) removes the copy; that
 * passwords, card numbers and opted-out fields are never written down; and
 * that sign-out wipes every draft, the page-owned ones included; and that a
 * draft belongs to the signed-in user — another person signing in on the same
 * device never gets it back, and it is wiped.
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  DRAFT_PREFIX, DRAFT_TTL_MS, type DraftStore, ownerPrefix, setDraftOwner, getDraftOwner, pageDraftKey,
  draftKey as keyFor, routeOf, saveDraft, readDraft, removeDraft, draftKeysForRoute, clearRouteDrafts, wipeDrafts, canKeepDrafts,
  isSecretField, looksLikeCardNumber, fieldBase, numberKeys, formIdOf, restorePlan, restoredLabel,
} from './autoDraft';
import { formNoun, isCloseLabel, leaveMessage } from './autoGuard';

/** localStorage, in memory. */
function memStore(): DraftStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const ME = 'user-a';
const draftKey = (route: string, formId: string) => keyFor(ME, route, formId);

let s: ReturnType<typeof memStore>;
beforeEach(() => { s = memStore(); });

describe('keys', () => {
  test('one key per screen and form; query and hash do not split it', () => {
    const k = draftKey('/app/projects/p1/rfis/?tab=open#top', formIdOf({ kind: 'dialog', title: 'New RFI' }));
    expect(k).toBe(`${DRAFT_PREFIX}u:user-a:auto:/app/projects/p1/rfis|dialog:New RFI`);
    expect(routeOf('/app/time/')).toBe('/app/time');
    expect(draftKey('/app/projects/p1/rfis', 'dialog:New RFI')).toBe(k);
  });
  test('a different record or form is a different key', () => {
    expect(draftKey('/app/projects/p1/rfis/r1', 'page')).not.toBe(draftKey('/app/projects/p1/rfis/r2', 'page'));
    expect(formIdOf({ kind: 'dialog', title: 'New RFI' })).not.toBe(formIdOf({ kind: 'dialog', title: 'New submittal' }));
  });
  test('an explicit data-draft-key wins over the title', () => {
    expect(formIdOf({ explicit: 'invoice-create', kind: 'form', title: 'Anything' })).toBe('k:invoice-create');
  });
  test('field names: name, a stable id, the label; never a generated id', () => {
    expect(fieldBase({ tag: 'INPUT', type: 'text', name: 'subject' })).toBe('text:subject');
    expect(fieldBase({ tag: 'TEXTAREA', id: ':r5:', label: 'Question' })).toBe('textarea:Question');
    expect(fieldBase({ tag: 'SELECT', id: 'status' })).toBe('select:status');
    expect(fieldBase({ tag: 'INPUT', type: 'radio', name: 'priority', value: 'high' })).toBe('radio:priority=high');
    expect(numberKeys(['text:qty', 'text:desc', 'text:qty'])).toEqual(['text:qty', 'text:desc', 'text:qty#2']);
  });
});

describe('save, restore, discard', () => {
  const key = draftKey('/app/projects/p1/rfis', 'dialog:New RFI');

  test('what was typed is kept with its time and title', () => {
    expect(saveDraft(s, key, { 'text:subject': 'Door hardware', 'textarea:Question': 'Which closer?' }, 'New RFI', 1_000)).toBe(true);
    const d = readDraft(s, key, 2_000);
    expect(d).toEqual({ t: 1_000, title: 'New RFI', fields: { 'text:subject': 'Door hardware', 'textarea:Question': 'Which closer?' } });
  });

  test('restore changes only the fields that differ, and only ones still on the form', () => {
    saveDraft(s, key, { 'text:subject': 'Door hardware', 'select:status': 'open', 'text:gone': 'x' });
    const d = readDraft(s, key)!;
    expect(restorePlan(d, { 'text:subject': '', 'select:status': 'open' })).toEqual([['text:subject', 'Door hardware']]);
  });

  test('a save leaves nothing unsaved, so the copy goes (no fields → removed)', () => {
    saveDraft(s, key, { 'text:subject': 'Door hardware' });
    expect(readDraft(s, key)).not.toBeNull();
    expect(saveDraft(s, key, {})).toBe(false);
    expect(readDraft(s, key)).toBeNull();
  });

  test('Discard removes the copy; a page-level save clears the whole screen', () => {
    const other = draftKey('/app/projects/p1/rfis', 'page');
    const elsewhere = draftKey('/app/projects/p1/punch-list', 'page');
    saveDraft(s, key, { a: '1' });
    saveDraft(s, other, { b: '2' });
    saveDraft(s, elsewhere, { c: '3' });
    removeDraft(s, key);
    expect(readDraft(s, key)).toBeNull();
    expect(draftKeysForRoute(s, ME, '/app/projects/p1/rfis')).toEqual([other]);
    clearRouteDrafts(s, ME, '/app/projects/p1/rfis/');
    expect(draftKeysForRoute(s, ME, '/app/projects/p1/rfis')).toEqual([]);
    expect(readDraft(s, elsewhere)).not.toBeNull();
  });

  test('a copy older than a week, or a broken one, is dropped', () => {
    saveDraft(s, key, { a: '1' }, undefined, 0);
    expect(readDraft(s, key, DRAFT_TTL_MS + 1)).toBeNull();
    expect(s.map.has(key)).toBe(false);
    s.setItem(key, '{not json');
    expect(readDraft(s, key)).toBeNull();
    expect(s.map.has(key)).toBe(false);
  });

  test('storage that refuses writes never breaks the form', () => {
    const full: DraftStore = { ...memStore(), setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(saveDraft(full, key, { a: '1' })).toBe(false);
    expect(canKeepDrafts(full)).toBe(false);
    expect(canKeepDrafts(s)).toBe(true);
    expect(canKeepDrafts(null)).toBe(false);
  });

  test('the toast names the time it was kept', () => {
    const at = new Date(2026, 9, 17, 14, 14).getTime();
    expect(restoredLabel(at, at + 60_000)).toBe('Draft restored from 2:14 PM');
    expect(restoredLabel(at, at + 3 * 86_400_000)).toBe('Draft restored from Oct 17, 2:14 PM');
  });
});

describe('secrets are never kept', () => {
  test('passwords, card fields, codes and opted-out fields', () => {
    expect(isSecretField({ tag: 'INPUT', type: 'password', name: 'pw' })).toBe(true);
    expect(isSecretField({ tag: 'INPUT', type: 'text', autocomplete: 'cc-number' })).toBe(true);
    expect(isSecretField({ tag: 'INPUT', type: 'text', autocomplete: 'section-pay cc-csc' })).toBe(true);
    expect(isSecretField({ tag: 'INPUT', type: 'text', autocomplete: 'one-time-code' })).toBe(true);
    expect(isSecretField({ tag: 'INPUT', type: 'text', name: 'card_number' })).toBe(true);
    expect(isSecretField({ tag: 'INPUT', type: 'text', placeholder: 'Routing number' })).toBe(true);
    expect(isSecretField({ tag: 'INPUT', type: 'text', ariaLabel: 'API key' })).toBe(true);
    expect(isSecretField({ tag: 'INPUT', type: 'text', name: 'ssn' })).toBe(true);
    expect(isSecretField({ tag: 'INPUT', type: 'text', name: 'notes', noDraft: true })).toBe(true);
  });
  test('ordinary work fields are kept', () => {
    expect(isSecretField({ tag: 'INPUT', type: 'text', name: 'subject' })).toBe(false);
    expect(isSecretField({ tag: 'TEXTAREA', name: 'description' })).toBe(false);
    expect(isSecretField({ tag: 'INPUT', type: 'email', autocomplete: 'email' })).toBe(false);
    expect(isSecretField({ tag: 'INPUT', type: 'number', name: 'spinner_count' })).toBe(false);
  });
  test('a card number typed into any field is dropped from the copy', () => {
    expect(looksLikeCardNumber('4242 4242 4242 4242')).toBe(true);
    expect(looksLikeCardNumber('4242424242424241')).toBe(false); // fails Luhn
    expect(looksLikeCardNumber('12500')).toBe(false);
    const key = draftKey('/app/invoicing', 'page');
    saveDraft(s, key, { 'text:memo': '4111-1111-1111-1111', 'text:amount': '12500' });
    expect(readDraft(s, key)!.fields).toEqual({ 'text:amount': '12500' });
  });
});

describe('sign-out', () => {
  test('wipes every draft — automatic and page-owned — and nothing else', () => {
    saveDraft(s, draftKey('/app/projects/p1/rfis', 'page'), { a: '1' });
    saveDraft(s, draftKey('/app/time', 'form:Clock in'), { b: '2' });
    s.setItem(pageDraftKey(ME, 'invoice:42'), JSON.stringify({ t: Date.now(), data: { amount: 1 } }));
    s.setItem('saguaro-sidebar-collapsed', 'true');
    setDraftOwner(s, ME);
    expect(wipeDrafts(s)).toBe(3);
    expect([...s.map.keys()]).toEqual(['saguaro-sidebar-collapsed']);
    expect(getDraftOwner()).toBeNull(); // nothing is kept again until someone signs in
  });
});

describe('a draft belongs to the person who typed it (shared PC, trailer tablet)', () => {
  test('the key carries the user id; another user never reads it', () => {
    const route = '/app/projects/p1/rfis';
    const mine = keyFor('user-a', route, 'dialog:New RFI');
    const theirs = keyFor('user-b', route, 'dialog:New RFI');
    expect(mine.startsWith(ownerPrefix('user-a'))).toBe(true);
    expect(mine).not.toBe(theirs);
    saveDraft(s, mine, { 'text:subject': 'Door hardware' });
    expect(readDraft(s, theirs)).toBeNull();
    expect(draftKeysForRoute(s, 'user-b', route)).toEqual([]);
    expect(draftKeysForRoute(s, 'user-a', route)).toEqual([mine]);
    expect(pageDraftKey('user-a', 'invoice:42')).not.toBe(pageDraftKey('user-b', 'invoice:42'));
    expect(ownerPrefix('a:b|c')).toBe(`${DRAFT_PREFIX}u:abc:`); // separators cannot forge another user's namespace
  });

  test('signing in as a different user wipes every draft that is not theirs', () => {
    const route = '/app/time';
    saveDraft(s, keyFor('user-a', route, 'form:Clock in'), { a: '1' });
    s.setItem(pageDraftKey('user-a', 'invoice:42'), JSON.stringify({ t: Date.now(), data: { amount: 1 } }));
    saveDraft(s, keyFor('user-b', route, 'form:Clock in'), { b: '2' });
    s.setItem(`${DRAFT_PREFIX}invoice:7`, JSON.stringify({ t: Date.now(), data: {} })); // an old draft with no owner
    s.setItem('saguaro-sidebar-collapsed', 'true');

    expect(setDraftOwner(s, 'user-b')).toBe(3);
    expect(getDraftOwner()).toBe('user-b');
    expect([...s.map.keys()].sort()).toEqual([keyFor('user-b', route, 'form:Clock in'), 'saguaro-sidebar-collapsed'].sort());

    // The same person again keeps theirs.
    expect(setDraftOwner(s, 'user-b')).toBe(0);
    expect(readDraft(s, keyFor('user-b', route, 'form:Clock in'))).not.toBeNull();
  });

  test('until the shell knows who is signed in, there is no owner', () => {
    setDraftOwner(s, null);
    expect(getDraftOwner()).toBeNull();
  });
});

describe('the leave prompt', () => {
  test('names what the form edits, in a sentence', () => {
    expect(formNoun('New RFI')).toBe('RFI');
    expect(formNoun('Edit Punch Item')).toBe('punch item');
    expect(formNoun('Add a change order')).toBe('change order');
    expect(formNoun('Log a delivery')).toBe('');
    expect(formNoun('Edit details')).toBe('');
    expect(formNoun('')).toBe('');
  });
  test('says the draft is kept only when it is', () => {
    expect(leaveMessage('RFI', true)).toBe("Your changes to this RFI haven't been saved. A draft is kept on this device.");
    expect(leaveMessage(undefined, false)).toBe("Your changes haven't been saved.");
  });
  test('Cancel / Close / × close a form; Discard and Save do not ask', () => {
    expect(isCloseLabel('Cancel')).toBe(true);
    expect(isCloseLabel('', 'Close')).toBe(true);
    expect(isCloseLabel('×')).toBe(true);
    expect(isCloseLabel('Discard')).toBe(false);
    expect(isCloseLabel('Save')).toBe(false);
    expect(isCloseLabel('Back')).toBe(false);
  });
});
