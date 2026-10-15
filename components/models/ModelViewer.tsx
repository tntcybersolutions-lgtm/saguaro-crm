'use client';
/**
 * ModelViewer — the 3D viewport, its toolbar and the side panel (selected
 * element's properties + IFC levels). Client only: the Models page loads it
 * through next/dynamic({ ssr: false }) so three.js and the web-ifc WASM never
 * reach the server bundle.
 *
 * One ModelEngine per open file; it is disposed when the file changes or the
 * page unmounts, which frees the GPU buffers and the WebGL context.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CornersOut, Scissors, Ruler, EyeSlash, Eye, Camera, Crosshair, Stack, WarningCircle, X, ArrowCounterClockwise,
} from '@phosphor-icons/react';
import { Button, Select, EmptyState } from '@/components/ui/kit';
import {
  detectModelFormat, formatBytes, formatDistance, modelErrorMessage, MAX_MODEL_BYTES,
  type LengthUnit, type ModelFormat,
} from '@/lib/model-viewer';
import { ModelEngine, type Axis, type ElementProps, type Level, type ToolMode, type ViewName } from './model-engine';

export interface ModelFile {
  id: string;
  file_name: string;
  file_url: string;
  file_size?: number | null;
  mime_type?: string | null;
}

type Phase =
  | { kind: 'loading'; stage: string; percent: number | null }
  | { kind: 'ready'; elements: number }
  | { kind: 'error'; message: string };

async function download(url: string, onPct: (p: number | null) => void, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to load (status ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (total > MAX_MODEL_BYTES) {
    throw new Error(`This model is too large to open here (${formatBytes(total)}). The limit is ${formatBytes(MAX_MODEL_BYTES)}.`);
  }
  if (!res.body || !total) { onPct(null); return res.arrayBuffer(); }
  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > out.length) {
      // Server lied about the length — fall back to collecting chunks.
      const bigger = new Uint8Array(Math.max(out.length * 2, got + value.length));
      bigger.set(out.subarray(0, got));
      return finishGrowing(reader, bigger, got, value);
    }
    out.set(value, got);
    got += value.length;
    onPct(Math.min(100, Math.round((got / total) * 100)));
  }
  return (out.buffer as ArrayBuffer).slice(0, got);
}

async function finishGrowing(reader: ReadableStreamDefaultReader<Uint8Array>, buf: Uint8Array, got: number, first: Uint8Array): Promise<ArrayBuffer> {
  let b = buf;
  let n = got;
  let chunk: Uint8Array | undefined = first;
  while (chunk) {
    if (n + chunk.length > b.length) { const nb = new Uint8Array(Math.max(b.length * 2, n + chunk.length)); nb.set(b.subarray(0, n)); b = nb; }
    b.set(chunk, n);
    n += chunk.length;
    if (n > MAX_MODEL_BYTES) throw new Error(`This model is too large to open here. The limit is ${formatBytes(MAX_MODEL_BYTES)}.`);
    const r = await reader.read();
    chunk = r.done ? undefined : r.value;
  }
  return (b.buffer as ArrayBuffer).slice(0, n);
}

const VIEWS: { value: ViewName; label: string }[] = [
  { value: 'iso', label: '3D' },
  { value: 'front', label: 'Front' },
  { value: 'right', label: 'Side' },
  { value: 'top', label: 'Top' },
  { value: 'back', label: 'Back' },
  { value: 'left', label: 'Left' },
];

export default function ModelViewer({ file }: { file: ModelFile }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ModelEngine | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', stage: 'Downloading', percent: 0 });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [props, setProps] = useState<ElementProps | null>(null);
  const [propsBusy, setPropsBusy] = useState(false);
  const [levels, setLevels] = useState<Level[]>([]);
  const [mode, setMode] = useState<ToolMode>('select');
  const [unit, setUnit] = useState<LengthUnit>('ft');
  const [measure, setMeasure] = useState<{ meters: number | null; points: number }>({ meters: null, points: 0 });
  const [section, setSection] = useState<{ on: boolean; axis: Axis; pct: number }>({ on: false, axis: 'y', pct: 100 });
  const [hiddenCount, setHiddenCount] = useState(0);
  const format: ModelFormat | null = detectModelFormat(file.file_name, file.mime_type);

  // Open the file: one engine per file + attempt; disposed on change/unmount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ctrl = new AbortController();
    let engine: ModelEngine | null = null;
    let cancelled = false;
    setPhase({ kind: 'loading', stage: 'Downloading', percent: 0 });
    setSelected(null); setProps(null); setLevels([]); setMeasure({ meters: null, points: 0 });
    setMode('select'); setSection({ on: false, axis: 'y', pct: 100 }); setHiddenCount(0);

    (async () => {
      if (!format) throw new Error('unsupported');
      if ((file.file_size || 0) > MAX_MODEL_BYTES) {
        throw new Error(`This model is too large to open here (${formatBytes(file.file_size)}). The limit is ${formatBytes(MAX_MODEL_BYTES)}.`);
      }
      try {
        engine = new ModelEngine(host, {
          onSelect: (id) => { if (!cancelled) setSelected(id); },
          onMeasure: (meters, points) => { if (!cancelled) setMeasure({ meters, points }); },
          onLevels: (l) => { if (!cancelled) setLevels(l); },
          onContextLost: () => { if (!cancelled) setPhase({ kind: 'error', message: 'This device ran out of graphics memory showing the model. Close other tabs and try again, or open it on a computer.' }); },
        });
      } catch {
        throw new Error('This device or browser cannot show 3D (WebGL is off or unavailable).');
      }
      engineRef.current = engine;
      const buf = await download(file.file_url, (p) => {
        if (!cancelled) setPhase({ kind: 'loading', stage: 'Downloading', percent: p });
      }, ctrl.signal);
      if (cancelled) return;
      setPhase({ kind: 'loading', stage: 'Reading the model', percent: null });
      const { elements } = await engine.load(buf, format, (stage) => {
        if (!cancelled) setPhase({ kind: 'loading', stage, percent: null });
      });
      if (!cancelled) setPhase({ kind: 'ready', elements });
    })().catch((err) => {
      if (cancelled || ctrl.signal.aborted) return;
      console.error('[models] load failed', err);
      setPhase({ kind: 'error', message: modelErrorMessage(err, format) });
    });

    return () => {
      cancelled = true;
      ctrl.abort();
      engine?.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [file.id, file.file_url, file.file_size, format, attempt]);

  // Selected element → its properties.
  useEffect(() => {
    const eng = engineRef.current;
    if (selected === null || !eng) { setProps(null); return; }
    let live = true;
    setPropsBusy(true);
    eng.properties(selected)
      .then((p) => { if (live) setProps(p); })
      .catch((e) => { console.error('[models] properties failed', e); if (live) setProps(null); })
      .finally(() => { if (live) setPropsBusy(false); });
    return () => { live = false; };
  }, [selected]);

  useEffect(() => { engineRef.current?.setSection(section.on, section.axis, section.pct); }, [section]);
  useEffect(() => { engineRef.current?.setMode(mode); }, [mode]);

  const eng = () => engineRef.current;
  const ready = phase.kind === 'ready';

  const shot = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    const url = e.screenshot();
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.file_name.replace(/\.[^.]+$/, '')}-view.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [file.file_name]);

  const syncHidden = () => setHiddenCount(engineRef.current?.hiddenCount() || 0);

  return (
    <div className="mv-wrap">
      <div className="mv-toolbar" role="toolbar" aria-label="Model tools">
        <Button size="sm" icon={<CornersOut size={15} />} onClick={() => eng()?.fit()} disabled={!ready} title="Fit to view">Fit</Button>
        <Select aria-label="View" className="mv-select" value="" disabled={!ready}
          onChange={(e) => { const v = e.target.value as ViewName; if (v) eng()?.setView(v); }}
          placeholder="View" options={VIEWS} />
        <span className="mv-sep" aria-hidden />
        <Button size="sm" icon={<Scissors size={15} />} disabled={!ready} aria-pressed={section.on}
          variant={section.on ? 'secondary' : 'ghost'}
          onClick={() => setSection((s) => ({ ...s, on: !s.on, pct: s.on ? 100 : s.pct === 100 ? 60 : s.pct }))}>Section</Button>
        {section.on && (
          <>
            <Select aria-label="Section axis" className="mv-select" value={section.axis}
              onChange={(e) => setSection((s) => ({ ...s, axis: e.target.value as Axis, pct: 60 }))}
              options={[{ value: 'y', label: 'Height' }, { value: 'x', label: 'Width' }, { value: 'z', label: 'Depth' }]} />
            <input type="range" className="mv-range" min={0} max={100} step={1} value={section.pct} aria-label="Section position"
              onChange={(e) => setSection((s) => ({ ...s, pct: Number(e.target.value) }))} />
          </>
        )}
        <Button size="sm" icon={<Ruler size={15} />} disabled={!ready} aria-pressed={mode === 'measure'}
          variant={mode === 'measure' ? 'secondary' : 'ghost'}
          onClick={() => setMode((m) => (m === 'measure' ? 'select' : 'measure'))}>Measure</Button>
        <Select aria-label="Units" className="mv-select" value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)}
          options={[{ value: 'ft', label: 'Feet' }, { value: 'm', label: 'Meters' }]} />
        <span className="mv-sep" aria-hidden />
        <Button size="sm" variant="ghost" icon={<EyeSlash size={15} />} disabled={!ready || selected === null}
          onClick={() => { eng()?.hideSelected(); syncHidden(); }}>Hide</Button>
        <Button size="sm" variant="ghost" icon={<Crosshair size={15} />} disabled={!ready || selected === null}
          onClick={() => { eng()?.isolateSelected(); syncHidden(); }}>Isolate</Button>
        <Button size="sm" variant="ghost" icon={<Eye size={15} />} disabled={!ready || (hiddenCount === 0 && levels.every((l) => l.visible))}
          onClick={() => { eng()?.showAll(); syncHidden(); }}>Show all{hiddenCount ? ` (${hiddenCount})` : ''}</Button>
        <span className="mv-sep" aria-hidden />
        <Button size="sm" variant="ghost" icon={<Camera size={15} />} disabled={!ready} onClick={shot}>Screenshot</Button>
      </div>

      <div className="mv-body">
        <div className="mv-stage">
          <div ref={hostRef} className="mv-canvas" />
          {mode === 'measure' && ready && (
            <div className="mv-readout" aria-live="polite">
              <Ruler size={16} />
              {measure.meters !== null
                ? <strong>{formatDistance(measure.meters, unit)}</strong>
                : <span>{measure.points === 1 ? 'Pick the second point' : 'Pick the first point'}</span>}
              {measure.points > 0 && (
                <button type="button" className="mv-x" aria-label="Clear measurement" onClick={() => eng()?.clearMeasure()}><X size={14} /></button>
              )}
            </div>
          )}
          {phase.kind === 'loading' && (
            <div className="mv-overlay" role="status" aria-live="polite">
              <div className="mv-progress">
                <div className="mv-bar"><span style={{ width: `${phase.percent ?? 100}%` }} data-indeterminate={phase.percent === null || undefined} /></div>
                <div className="mv-stage-text">{phase.stage}{phase.percent !== null ? ` ${phase.percent}%` : '…'}</div>
                <div className="mv-file">{file.file_name}{file.file_size ? ` · ${formatBytes(file.file_size)}` : ''}</div>
              </div>
            </div>
          )}
          {phase.kind === 'error' && (
            <div className="mv-overlay">
              <EmptyState icon={<WarningCircle size={22} />} title="Couldn't open this model" text={phase.message}
                action={<Button icon={<ArrowCounterClockwise size={15} />} onClick={() => setAttempt((n) => n + 1)}>Try again</Button>} />
            </div>
          )}
        </div>

        <aside className="mv-side" aria-label="Model details">
          <section>
            <h3 className="mv-h">Selected</h3>
            {selected === null ? (
              <p className="mv-muted">{ready ? (mode === 'measure' ? '—' : 'Nothing selected') : '—'}</p>
            ) : propsBusy && !props ? (
              <p className="mv-muted">Reading properties…</p>
            ) : props ? (
              <>
                <dl className="mv-dl">
                  <dt>Type</dt><dd>{props.type || '—'}</dd>
                  <dt>Name</dt><dd>{props.name || '—'}</dd>
                  {format === 'ifc' && <><dt>GlobalId</dt><dd className="mv-mono">{props.globalId || '—'}</dd></>}
                  {format === 'ifc' && <><dt>Level</dt><dd>{props.storey || '—'}</dd></>}
                  <dt>Material</dt><dd>{props.materials.length ? props.materials.join(', ') : '—'}</dd>
                </dl>
                {groupRows(props.rows).map(([group, rows]) => (
                  <details key={group} className="mv-group">
                    <summary>{group} <span className="mv-count">{rows.length}</span></summary>
                    <dl className="mv-dl">
                      {rows.map((r, i) => <React.Fragment key={i}><dt>{r.label}</dt><dd>{r.value}</dd></React.Fragment>)}
                    </dl>
                  </details>
                ))}
              </>
            ) : <p className="mv-muted">No properties on this element</p>}
          </section>

          {format === 'ifc' && levels.length > 0 && (
            <section>
              <h3 className="mv-h"><Stack size={14} /> Levels <span className="mv-count">{levels.length}</span></h3>
              <ul className="mv-levels">
                {levels.map((l) => (
                  <li key={l.id}>
                    <label>
                      <input type="checkbox" checked={l.visible} onChange={(e) => eng()?.setLevelVisible(l.id, e.target.checked)} />
                      <span className="mv-lname">{l.name}</span>
                    </label>
                    <span className="mv-count">{l.count}</span>
                    <button type="button" className="mv-only" onClick={() => eng()?.soloLevel(l.id)} aria-label={`Show only ${l.name}`}>Only</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {ready && phase.kind === 'ready' && (
            <p className="mv-muted mv-foot">{phase.elements.toLocaleString('en-US')} elements · {format?.toUpperCase()}</p>
          )}
        </aside>
      </div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

function groupRows(rows: ElementProps['rows']): [string, ElementProps['rows']][] {
  const m = new Map<string, ElementProps['rows']>();
  for (const r of rows) { const l = m.get(r.group); if (l) l.push(r); else m.set(r.group, [r]); }
  return Array.from(m.entries());
}

const CSS = `
.mv-wrap { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.mv-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.mv-toolbar .k-btn[aria-pressed="true"] { border-color: var(--border-strong); }
.mv-select { width: auto; min-width: 92px; height: 32px; font-size: 13px; padding-top: 0; padding-bottom: 0; }
.mv-range { width: 140px; accent-color: var(--text-secondary); }
.mv-sep { width: 1px; height: 22px; background: var(--border-default); margin: 0 2px; }
.mv-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; min-width: 0; }
.mv-stage { position: relative; height: min(72vh, 760px); min-height: 360px; border-radius: var(--radius-md, 8px); overflow: hidden; background: var(--bg-base); border: 1px solid var(--border-default); }
.mv-canvas { position: absolute; inset: 0; }
.mv-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--bg-base); padding: 16px; }
.mv-progress { width: min(360px, 90%); display: flex; flex-direction: column; gap: 8px; }
.mv-bar { height: 6px; border-radius: 3px; background: var(--bg-surface-2); overflow: hidden; }
.mv-bar span { display: block; height: 100%; background: var(--text-secondary); transition: width .2s ease; }
.mv-bar span[data-indeterminate] { animation: mv-pulse 1.2s ease-in-out infinite; }
@keyframes mv-pulse { 0%, 100% { opacity: .35 } 50% { opacity: 1 } }
.mv-stage-text { font-size: 14px; color: var(--text-primary); font-weight: 600; }
.mv-file { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv-readout { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius-md, 8px); background: var(--bg-surface); border: 1px solid var(--border-default); color: var(--text-primary); font-size: 14px; }
.mv-readout strong { font-size: 18px; font-variant-numeric: tabular-nums; }
.mv-x { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.mv-side { display: flex; flex-direction: column; gap: 18px; min-width: 0; max-height: min(72vh, 760px); overflow: auto; }
.mv-h { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .04em; }
.mv-muted { margin: 0; font-size: 13px; color: var(--text-tertiary); }
.mv-foot { font-size: 12px; }
.mv-dl { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 6px 10px; margin: 0; font-size: 13px; }
.mv-dl dt { color: var(--text-tertiary); }
.mv-dl dd { margin: 0; color: var(--text-primary); overflow-wrap: anywhere; }
.mv-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.mv-group { margin-top: 10px; border-top: 1px solid var(--border-default); padding-top: 8px; }
.mv-group summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-secondary); padding: 4px 0; }
.mv-group .mv-dl { margin-top: 6px; }
.mv-count { font-size: 12px; color: var(--text-tertiary); font-weight: 500; font-variant-numeric: tabular-nums; }
.mv-levels { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.mv-levels li { display: flex; align-items: center; gap: 8px; min-height: 40px; border-bottom: 1px solid var(--border-default); }
.mv-levels label { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; cursor: pointer; font-size: 14px; color: var(--text-primary); }
.mv-levels input { width: 18px; height: 18px; accent-color: var(--text-secondary); }
.mv-lname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv-only { border: 0; background: transparent; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; padding: 6px 4px; }
@media (max-width: 900px) {
  .mv-body { grid-template-columns: minmax(0, 1fr); }
  .mv-stage { height: 58vh; min-height: 300px; }
  .mv-side { max-height: none; }
}
`;
