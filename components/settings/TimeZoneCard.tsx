'use client';
/**
 * Settings → Time zone. The company's clock: "today", due dates, COI expiry,
 * clock-ins and reminders run on it whenever a person's own device doesn't say
 * (lib/time-zone). Recorded automatically from the first owner/admin device;
 * changed here.
 *
 * Reads / writes: GET /api/settings/time-zone · PATCH /api/settings/time-zone
 * (Admin ≥ Full — the server checks; non-admins see it read-only).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Crosshair, Globe, WarningCircle } from '@phosphor-icons/react';
import { Button, Card, Field, Input } from '@/components/ui/kit';
import { deviceTimeZone } from '@/lib/time-zone';
import { searchZones, timeIn, zoneChoices, zoneName, type ZoneChoice } from '@/lib/time-zone-choices';

/** Rendered at once; typing narrows the rest (there are ~420 zones). */
const SHOW = 80;
const SAVE_STATUS = "Saving time zone|Time zone saved|Couldn't save the time zone";

const CSS = `
.tzNow { display: flex; align-items: baseline; gap: 6px 12px; flex-wrap: wrap; min-width: 0; }
.tzNowName { font-size: 20px; font-weight: 800; color: var(--text-primary); }
.tzNowMeta { font-size: var(--fs-sm); color: var(--text-tertiary); overflow-wrap: anywhere; }
.tzHint { font-size: var(--fs-xs); color: var(--text-tertiary); line-height: 1.5; margin-top: 6px; }
.tzStack { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.tzDevice { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tzDevice .k-btn { min-height: 44px; }
.tzList { max-height: 320px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--bg-surface-2); }
.tzGroup { position: sticky; top: 0; z-index: 1; padding: 6px 12px; font-size: var(--fs-xs); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-tertiary); background: var(--bg-solid); border-bottom: 1px solid var(--border-subtle); }
.tzOpt { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 52px; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); }
.tzOpt:last-child { border-bottom: 0; }
.tzOpt:hover { background: rgba(255,255,255,0.03); }
.tzOpt:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: -2px; }
.tzOpt[aria-selected="true"] { background: var(--brand-primary-08); box-shadow: inset 3px 0 0 var(--brand-primary); }
.tzOptText { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tzOptName { font-size: var(--fs-md); font-weight: 650; }
.tzOptId { font-size: var(--fs-xs); color: var(--text-tertiary); overflow-wrap: anywhere; }
.tzOptTime { font-size: var(--fs-sm); color: var(--text-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.tzMore { padding: 10px 12px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.tzActions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.tzActions .k-btn { min-height: 44px; }
.tzNotice { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 600; }
.tzNotice[data-ok="true"] { color: var(--status-ongoing); }
.tzNotice[data-ok="false"] { color: var(--status-overdue); }
`;

type Loaded = { timeZone: string | null; canEdit: boolean };

export default function TimeZoneCard() {
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loaded, setLoaded] = useState<Loaded>({ timeZone: null, canEdit: false });
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const listRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<string | null>(null);

  // The device's zone is read in the browser only (the server render has none).
  useEffect(() => { setDevice(deviceTimeZone()); }, []);
  // The times beside each zone stay current while the page is open.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/settings/time-zone', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Loaded;
      setLoaded({ timeZone: j.timeZone ?? null, canEdit: !!j.canEdit });
      setPicked(j.timeZone ?? null);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const choices = useMemo(() => zoneChoices(undefined, [device, loaded.timeZone]), [device, loaded.timeZone]);
  const matches = useMemo(() => searchZones(choices, query), [choices, query]);
  const shown = matches.slice(0, SHOW);
  const firstWorld = query ? -1 : shown.findIndex((c) => !c.us);

  // Bring the picked zone into view (after "Use this device's zone", or on load).
  useEffect(() => {
    if (!picked || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-zone="${attrValue(picked)}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [picked, query, phase]);

  const flash = (text: string, ok: boolean) => {
    setNotice({ text, ok });
    window.setTimeout(() => setNotice((n) => (n && n.text === text ? null : n)), 4000);
  };

  const save = async () => {
    if (!picked || picked === loaded.timeZone) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/time-zone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-saguaro-status': SAVE_STATUS },
        body: JSON.stringify({ timeZone: picked }),
      });
      const j = (await res.json().catch(() => ({}))) as { timeZone?: string | null; error?: string };
      if (!res.ok) { flash(j.error || "Couldn't save the time zone.", false); return; }
      setLoaded((l) => ({ ...l, timeZone: j.timeZone ?? picked }));
      setPicked(j.timeZone ?? picked);
      flash(`Saved — your company runs on ${zoneName(j.timeZone ?? picked)} time.`, true);
    } catch {
      flash("No signal — the time zone didn't save. Try again.", false);
    } finally {
      setSaving(false);
    }
  };

  const useDevice = () => {
    if (!device) return;
    setQuery('');
    setPicked(device);
  };

  const current = loaded.timeZone;
  const dirty = !!picked && picked !== current;

  return (
    <Card
      title="Time zone"
      subtitle="Today, due dates, COI expiry, clock-ins and reminders run on your company's clock."
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {phase === 'loading' && <div className="tzHint" role="status">Loading your company’s time zone…</div>}
      {phase === 'error' && (
        <div className="tzStack" role="alert">
          <span className="tzNotice" data-ok="false"><WarningCircle size={15} weight="fill" /> Couldn’t load your company’s time zone.</span>
          <div className="tzActions"><Button onClick={() => void load()}>Try again</Button></div>
        </div>
      )}
      {phase === 'ready' && (
        <div className="tzStack">
          <div>
            <div className="tzNow" data-testid="tz-current">
              <Globe size={18} weight="duotone" color="var(--text-secondary)" style={{ alignSelf: 'center' }} />
              {current ? (
                <>
                  <span className="tzNowName">{zoneName(current)}</span>
                  <span className="tzNowMeta">{current} · {timeIn(current, now)} now</span>
                </>
              ) : (
                <span className="tzNowName">Not set yet</span>
              )}
            </div>
            {!current && (
              <div className="tzHint">Until it’s set, each person’s own phone or computer zone is used, and background reminders use UTC.</div>
            )}
            {!loaded.canEdit && <div className="tzHint">Only an owner or admin can change it.</div>}
          </div>

          {loaded.canEdit && (
            <>
              {device && (
                <div className="tzDevice">
                  <Button onClick={useDevice} icon={<Crosshair size={15} weight="bold" />} aria-label={`Use this device's zone: ${zoneName(device)}`}>
                    Use this device’s zone
                  </Button>
                  <span className="tzOptTime">{zoneName(device)} · {timeIn(device, now)}</span>
                </div>
              )}

              <Field label="Find a time zone" hint="Type a zone, a city or a state — e.g. Central, Iowa, Denver, London.">
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search time zones"
                  aria-controls="tz-list"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </Field>

              <div id="tz-list" className="tzList" role="listbox" aria-label="Time zones" ref={listRef}>
                {shown.length === 0 && <div className="tzMore">No time zone matches “{query}”.</div>}
                {!query && shown.length > 0 && <div className="tzGroup" aria-hidden>United States</div>}
                {shown.map((c: ZoneChoice, i) => (
                  <React.Fragment key={c.zone}>
                    {i === firstWorld && <div className="tzGroup" aria-hidden>All time zones</div>}
                    <button
                      type="button"
                      role="option"
                      className="tzOpt"
                      data-zone={c.zone}
                      aria-selected={picked === c.zone}
                      onClick={() => setPicked(c.zone)}
                    >
                      <span className="tzOptText">
                        <span className="tzOptName">{c.name}{c.zone === device ? ' · this device' : ''}</span>
                        <span className="tzOptId">{c.us ? c.zone : c.region ? `${c.region} · ${c.zone}` : c.zone}</span>
                      </span>
                      <span className="tzOptTime">{timeIn(c.zone, now)}</span>
                    </button>
                  </React.Fragment>
                ))}
                {matches.length > SHOW && (
                  <div className="tzMore">Showing {SHOW} of {matches.length} — keep typing to narrow it.</div>
                )}
              </div>

              <div className="tzActions">
                <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : 'Save time zone'}
                </Button>
                {dirty && !saving && <span className="tzHint" style={{ marginTop: 0 }}>{zoneName(picked)} selected — not saved yet</span>}
                {notice && (
                  <span className="tzNotice" data-ok={notice.ok ? 'true' : 'false'} role="status">
                    {notice.ok ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />}
                    {notice.text}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/** A zone id is [A-Za-z0-9_+-/] (lib/time-zone isTimeZone) — quote it for an attribute selector. */
function attrValue(v: string): string {
  return v.replace(/["\\]/g, '\\$&');
}
