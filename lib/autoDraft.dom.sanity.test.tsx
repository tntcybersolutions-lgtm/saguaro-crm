/**
 * @jest-environment node
 *
 * The draft keeper and leave prompt, driven through the real shell component
 * (components/AutoUnsavedGuard) in a browser DOM (jsdom) with a real React
 * form: type → kept on the device → the form closes and opens again → filled
 * back in with "Draft restored from …" → Discard puts it back and drops the
 * copy; Cancel on a changed dialog asks "Leave without saving?"; a password
 * is never written down.
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
import { draftKey, setDraftOwner } from './autoDraft';

declare const jest: { mock: (m: string, f: () => unknown) => void };
declare const require: (m: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

/* A browser for this file only (the repo runs its tests in node). */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/app/projects/p1/rfis', pretendToBeVisual: true });
const g = globalThis as unknown as Record<string, unknown>;
for (const k of Object.getOwnPropertyNames(dom.window)) {
  if (k in g) continue;
  try { g[k] = dom.window[k]; } catch { /* read-only on this runtime */ }
}
// Node has its own Event classes; the DOM must use the browser's.
for (const k of ['Event', 'EventTarget', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'InputEvent', 'CustomEvent', 'UIEvent', 'PopStateEvent']) g[k] = dom.window[k];
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.IS_REACT_ACT_ENVIRONMENT = true;
/* The server: every write answers 200 unless a test says otherwise. */
const writes: string[] = [];
let answer = 200;
dom.window.fetch = async (url: string, init?: { method?: string }) => {
  if (init?.method && init.method !== 'GET') writes.push(`${init.method} ${url}`);
  return new Response('{}', { status: answer, headers: { 'Content-Type': 'application/json' } });
};
// In a browser `fetch` is window.fetch (which the shell wraps); here it must be too.
g.fetch = (...a: unknown[]) => (dom.window.fetch as (...x: unknown[]) => Promise<Response>)(...a);
// jsdom lays nothing out; the gate only acts on what is on screen.
dom.window.Element.prototype.getBoundingClientRect = function () {
  return { width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40, x: 0, y: 0, toJSON() { return {}; } };
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => '/app/projects/p1/rfis',
}));

const React = require('react');
const { useState } = React;
const { render, screen, fireEvent, act } = require('@testing-library/react');
const { default: AutoUnsavedGuard } = require('../components/AutoUnsavedGuard');
const { ToastProvider } = require('../components/Toast');

const wait = (ms: number) => act(async () => { await new Promise((r) => dom.window.setTimeout(r, ms)); });

function RfiDialog({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState('');
  const [pw, setPw] = useState('');
  return (
    <div role="dialog" aria-modal="true" aria-label="New RFI">
      <input name="subject" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <input type="password" name="portal_pw" aria-label="Portal password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <span data-testid="state">{subject}</span>
      <button type="button" onClick={onClose}>Cancel</button>
      <button type="button" onClick={async () => {
        const r = await fetch('/api/projects/p1/rfis/create', { method: 'POST', body: JSON.stringify({ subject }) });
        if (r.ok) onClose();
      }}>Save RFI</button>
    </div>
  );
}

function Page() {
  const [open, setOpen] = useState(true);
  return (
    <ToastProvider>
      <main className="main-content-area">
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        <button type="button" onClick={() => setOpen(false)}>Hide</button>
        {open && <RfiDialog onClose={() => setOpen(false)} />}
      </main>
      <AutoUnsavedGuard />
    </ToastProvider>
  );
}

const KEY = draftKey('user-a', '/app/projects/p1/rfis', 'dialog:New RFI');

/** A person's click: trusted, as the browser marks real input (the gate ignores clicks code makes). */
const jsdomUtils = require('jsdom/lib/jsdom/living/generated/utils');
function userClick(el: HTMLElement) {
  const ev = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  const impl = jsdomUtils.implForWrapper(ev);
  impl.isTrusted = true;
  jsdomUtils.implForWrapper(el)._dispatch(impl);
}

beforeEach(() => { dom.window.localStorage.clear(); writes.length = 0; answer = 200; setDraftOwner(dom.window.localStorage, 'user-a'); });

function userKey(el: HTMLElement, key: string) {
  const ev = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  const impl = jsdomUtils.implForWrapper(ev);
  impl.isTrusted = true;
  jsdomUtils.implForWrapper(el)._dispatch(impl);
}

describe('drafts, end to end in the DOM', () => {
  test('typing is kept, the reopened form fills back in, Discard drops it', async () => {
    const view = render(<Page />);
    const input = screen.getByLabelText('Subject') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Door hardware at stair 2' } });
    const pw = screen.getByLabelText('Portal password') as HTMLInputElement;
    fireEvent.change(pw, { target: { value: 'hunter2' } });
    await wait(900);

    const kept = JSON.parse(dom.window.localStorage.getItem(KEY) || 'null');
    expect(kept?.fields).toEqual({ 'text:subject': 'Door hardware at stair 2' }); // the password was never written
    expect(JSON.stringify({ ...dom.window.localStorage })).not.toContain('hunter2');

    // Close without the prompt (as a crash or lost tab would), then open again.
    act(() => { fireEvent.click(screen.getByText('Hide')); });
    act(() => { fireEvent.click(screen.getByText('Open')); });
    await wait(1500);

    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Door hardware at stair 2');
    expect(screen.getByTestId('state').textContent).toBe('Door hardware at stair 2'); // React state followed
    expect(screen.getByText(/^Draft restored from \d{1,2}:\d{2} [AP]M$/)).toBeTruthy();

    act(() => { fireEvent.click(screen.getByText('Discard')); });
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('');
    expect(dom.window.localStorage.getItem(KEY)).toBeNull();
    view.unmount();
  });

  test('Cancel on a changed dialog asks, in plain professional words', async () => {
    const view = render(<Page />);
    const input = screen.getByLabelText('Subject') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Footing depth' } });
    await wait(900);
    act(() => { userClick(screen.getByText('Cancel')); });

    expect(screen.getByText('Leave without saving?')).toBeTruthy();
    expect(screen.getByText("Your changes to this RFI haven't been saved. A draft is kept on this device.")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Keep editing');
    expect(screen.getByText('Save and leave')).toBeTruthy();

    // Keep editing: the dialog and the typing stay.
    act(() => { fireEvent.click(screen.getByText('Keep editing')); });
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Footing depth');

    // Discard changes: the dialog closes and its copy goes.
    act(() => { userClick(screen.getByText('Cancel')); });
    act(() => { fireEvent.click(screen.getByText('Discard changes')); });
    await wait(50);
    expect(screen.queryByLabelText('Subject')).toBeNull();
    expect(dom.window.localStorage.getItem(KEY)).toBeNull();
    view.unmount();
  });

  test('a successful save drops the copy; a failed one keeps it', async () => {
    const view = render(<Page />);
    const input = screen.getByLabelText('Subject') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Slab edge detail' } });
    await wait(900);
    expect(dom.window.localStorage.getItem(KEY)).not.toBeNull();

    answer = 500; // the server fails: the form stays open and the copy stays
    await act(async () => { userClick(screen.getByText('Save RFI')); });
    await wait(50);
    expect(writes).toEqual(['POST /api/projects/p1/rfis/create']);
    expect(dom.window.localStorage.getItem(KEY)).not.toBeNull();

    answer = 200; // saved: the dialog closes and its copy goes
    await act(async () => { userClick(screen.getByText('Save RFI')); });
    await wait(50);
    expect(screen.queryByLabelText('Subject')).toBeNull();
    expect(dom.window.localStorage.getItem(KEY)).toBeNull();

    // Opening it again starts clean — nothing to restore.
    act(() => { fireEvent.click(screen.getByText('Open')); });
    await wait(1500);
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/^Draft restored/)).toBeNull();
    view.unmount();
  });

  test('Escape on a changed dialog asks instead of closing it', async () => {
    const view = render(<Page />);
    const input = screen.getByLabelText('Subject') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Rebar spacing' } });
    act(() => { userKey(input, 'Escape'); });
    expect(screen.getByText('Leave without saving?')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByText('Keep editing')); });
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Rebar spacing');
    view.unmount();
  });

  test('a failed write offers Retry, and Retry presses the same button again', async () => {
    const { installStatusFetch } = require('./ui/status-fetch');
    const { getStatusGroups, runAction, __resetStatus } = require('./ui/status');
    installStatusFetch();
    __resetStatus();
    let sent = 0;
    const rfiId = require('crypto').randomUUID();
    function SendRfi() {
      const [msg, setMsg] = useState('');
      return (
        <main className="main-content-area">
          <button type="button" onClick={async () => {
            sent++;
            const r = await fetch(`/api/projects/p1/rfis/${rfiId}/send`, { method: 'POST' });
            setMsg(r.ok ? 'sent' : 'failed');
          }}>Send RFI</button>
          <span data-testid="msg">{msg}</span>
        </main>
      );
    }
    const view = render(<SendRfi />);
    answer = 503;
    await act(async () => { userClick(screen.getByText('Send RFI')); });
    await wait(50);
    let last = getStatusGroups().at(-1).steps.at(-1);
    expect(last.state).toBe('failed');
    expect(last.result).toBe("Couldn't send RFI");
    expect(last.actions.map((a: { label: string }) => a.label)).toEqual(['Retry']);

    answer = 200;
    await act(async () => { runAction(last.id, last.actions[0]); });
    await wait(50);
    expect(sent).toBe(2); // the page's own handler ran again
    expect(screen.getByTestId('msg').textContent).toBe('sent');
    last = getStatusGroups().at(-1).steps.at(-1);
    expect(last.state).toBe('done');
    expect(last.result).toBe('RFI sent');
    view.unmount();
  });

  test("another user signing in on this device never gets the first one's draft", async () => {
    const view = render(<Page />);
    const input = screen.getByLabelText('Subject') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Owner walk punch' } });
    await wait(900);
    expect(dom.window.localStorage.getItem(KEY)).not.toBeNull();
    act(() => { fireEvent.click(screen.getByText('Hide')); });

    // The tablet changes hands: the shell learns a different user is signed in.
    act(() => { setDraftOwner(dom.window.localStorage, 'user-b'); });
    expect(dom.window.localStorage.getItem(KEY)).toBeNull();
    act(() => { fireEvent.click(screen.getByText('Open')); });
    await wait(1500);
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/^Draft restored/)).toBeNull();
    view.unmount();
  });
});
