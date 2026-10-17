'use client';
/**
 * "Alerts on this device" — turn phone / computer alerts on or off, and send
 * yourself a test. Renders nothing where this device can't receive alerts yet
 * (no dead buttons): e.g. the iPhone app before Apple Push is configured.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { BellRinging, BellSlash, CheckCircle, DeviceMobile, PaperPlaneTilt, Warning } from '@phosphor-icons/react';
import { loadPushConfig, pushState, sendTestPush, turnOffPush, turnOnPush, type PushConfig, type PushState } from '@/lib/push-client';

/* One slim line on the page — icon, state, the action — never a boxed card. */
const CSS = `
.pac { display: flex; gap: 10px 12px; align-items: center; flex-wrap: wrap; padding: 10px 0; margin-bottom: 14px; border-top: 1px solid var(--border-default); border-bottom: 1px solid var(--border-default); }
.pacIcon { flex: 0 0 auto; display: flex; color: var(--text-secondary); }
.pac[data-state="on"] .pacIcon { color: var(--c-green); }
.pac[data-state="blocked"] .pacIcon { color: var(--c-red); }
.pacBody { flex: 1 1 220px; min-width: 0; }
.pacBody h3 { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-primary); }
.pacBody p { margin: 2px 0 0; font-size: 13px; line-height: 1.4; color: var(--text-secondary); }
.pacRow { display: flex; flex-wrap: wrap; gap: 8px; }
.pacBtn { min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border-strong); background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.pacBtn[data-primary="true"] { border-color: var(--brand-primary); background: var(--brand-primary); color: var(--on-brand); }
.pacBtn:disabled { opacity: .55; cursor: default; }
.pacBtn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.pacMsg { flex: 1 1 100%; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
.pacMsg[data-tone="good"] { color: var(--c-green); }
.pacMsg[data-tone="bad"] { color: var(--c-red); }
@media (max-width: 767px) { .pacBtn { min-height: 44px; } }
`;

const COPY: Record<PushState, { title: string; body: string }> = {
  on: { title: 'Alerts are on for this device', body: '' },
  off: { title: 'Alerts are off on this device', body: '' },
  blocked: { title: 'Alerts are blocked on this device', body: 'Allow Saguaro in this device’s settings, then reload.' },
  'needs-home-screen': { title: 'Alerts on iPhone', body: 'Share → Add to Home Screen, then open Saguaro from there.' },
  unsupported: { title: '', body: '' },
};

export default function PushAlertsCard() {
  const [cfg, setCfg] = useState<PushConfig | null>(null);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<'' | 'on' | 'off' | 'test'>('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const c = await loadPushConfig();
      setCfg(c);
      setState(await pushState(c));
    } catch {
      setState('unsupported'); // can't tell → don't offer a button that may not work
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  if (!state || state === 'unsupported' || !cfg) return null;

  const on = async () => {
    setBusy('on'); setMsg(null);
    try {
      const s = await turnOnPush(cfg);
      setState(s);
      if (s === 'on') setMsg({ tone: 'good', text: 'Alerts are on. Send yourself a test to see one.' });
      else if (s === 'blocked') setMsg({ tone: 'bad', text: 'Notifications were blocked for Saguaro on this device.' });
    } catch (e) {
      // Chrome refuses push in private / incognito windows with an AbortError
      // ("Registration failed - permission denied") even when notifications are allowed.
      const denied = e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError');
      setMsg({ tone: 'bad', text: denied
        ? 'This browser won’t allow alerts here. Private or incognito windows can’t get them — open Saguaro in a normal window and try again.'
        : 'Couldn’t turn alerts on. Check your connection and try again.' });
    } finally { setBusy(''); }
  };
  const off = async () => {
    setBusy('off'); setMsg(null);
    try { await turnOffPush(); setState('off'); setMsg({ tone: 'good', text: 'Alerts are off for this device.' }); }
    catch { setMsg({ tone: 'bad', text: 'Couldn’t turn alerts off. Try again.' }); }
    finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test'); setMsg(null);
    try {
      const r = await sendTestPush();
      if (r.sent > 0) setMsg({ tone: 'good', text: `Test sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It should appear in a few seconds.` });
      else if (r.devices === 0) setMsg({ tone: 'bad', text: 'No devices are signed up yet. Turn alerts on first.' });
      else setMsg({ tone: 'bad', text: 'The test didn’t go through. Turn alerts off and on again on this device.' });
    } catch {
      setMsg({ tone: 'bad', text: 'Couldn’t send the test. Try again.' });
    } finally { setBusy(''); }
  };

  const c = COPY[state];
  return (
    <section className="pac" data-state={state} aria-label="Alerts on this device">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <span className="pacIcon" aria-hidden>
        {state === 'on' ? <BellRinging size={20} weight="fill" /> : state === 'blocked' ? <BellSlash size={20} weight="fill" /> : state === 'needs-home-screen' ? <DeviceMobile size={20} weight="fill" /> : <BellRinging size={20} />}
      </span>
      <div className="pacBody">
        <h3>{c.title}</h3>
        {c.body && <p>{c.body}</p>}
      </div>
        {(state === 'on' || state === 'off') && (
          <div className="pacRow">
            {state === 'off' && (
              <button type="button" className="pacBtn" data-primary="true" onClick={on} disabled={!!busy}>
                <BellRinging size={16} weight="fill" /> {busy === 'on' ? 'Turning on…' : 'Turn on alerts'}
              </button>
            )}
            {state === 'on' && (
              <>
                <button type="button" className="pacBtn" onClick={test} disabled={!!busy}>
                  <PaperPlaneTilt size={16} weight="fill" /> {busy === 'test' ? 'Sending…' : 'Send a test alert'}
                </button>
                <button type="button" className="pacBtn" onClick={off} disabled={!!busy}>
                  <BellSlash size={16} /> {busy === 'off' ? 'Turning off…' : 'Turn off'}
                </button>
              </>
            )}
          </div>
        )}
        {msg && (
          <div className="pacMsg" data-tone={msg.tone} role="status">
            {msg.tone === 'good' ? <CheckCircle size={15} weight="fill" /> : <Warning size={15} weight="fill" />} {msg.text}
          </div>
        )}
    </section>
  );
}
