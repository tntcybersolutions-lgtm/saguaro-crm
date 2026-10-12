'use client';
/**
 * The one place the app says what it is doing.
 *
 * Every action the person starts becomes a numbered step in the status box
 * (components/StatusCenter): "1. Saving punch item…" → "✓ Punch item saved",
 * "2. Uploading photos — 2 of 3", "3. Send to Ruiz & Sons — waiting". Steps
 * that start while a box is open join it, in the order they started; the box
 * closes a few seconds after its last step finishes. A failure stays until it
 * is dismissed, with the reason in plain words.
 *
 * Most steps come from lib/ui/status-fetch (every write the person triggers);
 * flows with their own progress (the photo upload queue, saving offline) add
 * steps here directly with step().
 */

export type StepState = 'running' | 'waiting' | 'done' | 'failed' | 'offline';

export interface StatusStep {
  id: number;
  /** Shown while running / waiting. */
  label: string;
  /** Shown once settled (done / failed / offline). */
  result?: string;
  /** A second line: the reason, or what happens next. */
  detail?: string;
  state: StepState;
  /** 0..1 when the step knows its progress. */
  progress?: number;
  /** "2 of 3" style count. */
  count?: { done: number; total: number };
  /** Navigation steps vanish when done instead of showing a check. */
  transient?: boolean;
  /** It failed because there was no signal (the box says NO SIGNAL). */
  net?: boolean;
  startedAt: number;
}

export interface StatusGroup {
  id: number;
  steps: StatusStep[];
  /** When every step settled (closing countdown starts). */
  settledAt: number | null;
  dismissed: boolean;
}

/** How long a finished box stays up. Failures stay until dismissed. */
export const DONE_LINGER_MS = 3000;

let seq = 0;
let groups: StatusGroup[] = [];
const subs = new Set<() => void>();
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  groups = [...groups];
  subs.forEach((f) => f());
}

export function subscribeStatus(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getStatusGroups(): StatusGroup[] { return groups; }
const EMPTY: StatusGroup[] = [];
export function getServerStatusGroups(): StatusGroup[] { return EMPTY; }

const isSettled = (s: StatusStep) => s.state === 'done' || s.state === 'failed' || s.state === 'offline';

/** The open box new steps join, or a new one. */
function currentGroup(): StatusGroup {
  const g = groups[groups.length - 1];
  if (g && !g.dismissed && (g.settledAt == null || Date.now() - g.settledAt < 1200)) return g;
  // One box at a time: a new action replaces a finished one (a failure too — it was seen).
  const fresh: StatusGroup = { id: ++seq, steps: [], settledAt: null, dismissed: false };
  groups = [fresh];
  return fresh;
}

function recompute(g: StatusGroup) {
  // Done navigation steps leave without a trace.
  g.steps = g.steps.filter((s) => !(s.transient && s.state === 'done'));
  if (!g.steps.length) { groups = groups.filter((x) => x !== g); emit(); return; }
  const settled = g.steps.every(isSettled);
  g.settledAt = settled ? (g.settledAt ?? Date.now()) : null;
  emit();
  if (closeTimer) clearTimeout(closeTimer);
  const anyFailed = g.steps.some((s) => s.state === 'failed');
  if (settled && !anyFailed) {
    closeTimer = setTimeout(() => {
      const still = groups.find((x) => x.id === g.id);
      if (still && still.settledAt != null && still.steps.every(isSettled)) dismissGroup(g.id);
    }, DONE_LINGER_MS);
  }
}

export function dismissGroup(id: number) {
  groups = groups.filter((g) => g.id !== id);
  emit();
}

export interface StepHandle {
  id: number;
  update(p: Partial<Pick<StatusStep, 'label' | 'detail' | 'progress' | 'count' | 'state'>>): void;
  done(result?: string, detail?: string): void;
  fail(result: string, detail?: string, net?: boolean): void;
  /** Kept on this phone; it goes when the signal is back. */
  offline(result: string, detail?: string): void;
  /** Take the step away without a result (the person cancelled it). */
  drop(): void;
}

/** Add a step to the open box (or open one). */
export function step(label: string, o: { state?: StepState; transient?: boolean; detail?: string } = {}): StepHandle {
  const g = currentGroup();
  const s: StatusStep = { id: ++seq, label, state: o.state ?? 'running', transient: o.transient, detail: o.detail, startedAt: Date.now() };
  g.steps = [...g.steps, s];
  recompute(g);
  const set = (p: Partial<StatusStep>) => {
    const owner = groups.find((x) => x.steps.some((y) => y.id === s.id));
    if (!owner) return; // dismissed already
    owner.steps = owner.steps.map((y) => (y.id === s.id ? { ...y, ...p } : y));
    recompute(owner);
  };
  return {
    id: s.id,
    update: (p) => set(p),
    done: (result, detail) => set({ state: 'done', result, detail, progress: undefined }),
    fail: (result, detail, net) => set({ state: 'failed', result, detail, net, progress: undefined }),
    offline: (result, detail) => set({ state: 'offline', result, detail, progress: undefined }),
    drop: () => set({ state: 'done', transient: true }),
  };
}

/** Run `fn` as one step: running while it works, then its result. */
export async function withStatus<T>(label: string, done: string, fn: () => Promise<T>, failed = `Couldn't finish: ${label.toLowerCase()}`): Promise<T> {
  const h = step(label);
  try {
    const out = await fn();
    h.done(done);
    return out;
  } catch (e) {
    h.fail(failed, e instanceof Error && e.message ? e.message : undefined);
    throw e;
  }
}

/** Tests only. */
/* Whether a <StatusCenter> is on screen. Toasts route into the status box when
   one is (the signed-in app), so two notifications never stack on each other;
   portals and public pages, which have no status box, keep the plain toast. */
let centers = 0;
export function registerStatusCenter(): () => void { centers += 1; return () => { centers -= 1; }; }
export function hasStatusCenter(): boolean { return centers > 0; }

/* A toast posted into the status box. If the last step settled a moment ago
   (the request that the toast is announcing), the toast's words become that
   step's result instead of a second line saying the same thing. */
export function note(message: string, ok = true) {
  const g = groups[groups.length - 1];
  const last = g?.steps[g.steps.length - 1];
  if (g && last && (last.state === 'done' || last.state === 'failed') && Date.now() - last.startedAt < 8000 && !last.result) {
    const owner = g;
    owner.steps = owner.steps.map((y) => (y.id === last.id ? { ...y, result: message, state: ok ? y.state : 'failed' } : y));
    recompute(owner);
    return;
  }
  step(message, { state: ok ? 'done' : 'failed' });
}

export function __resetStatus() { groups = []; seq = 0; if (closeTimer) clearTimeout(closeTimer); closeTimer = null; emit(); }
