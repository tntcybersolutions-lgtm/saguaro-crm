#!/usr/bin/env node
/**
 * Run a build command and log how much memory the build box is using while it
 * runs.
 *
 *   node tools/build-memory.mjs next build
 *
 * Why: Vercel's standard build box has 8 GB. When `next build` goes past it the
 * container kills a build worker with SIGKILL and the log says nothing about
 * what was using the memory. This prints, every 15 seconds and whenever a new
 * peak is reached, the container's memory use (from cgroups) and the resident
 * size of each build process, so the last lines before a kill show exactly
 * which process and which phase filled the box. A one-line summary with the
 * peak is printed at the end of every build, so a green build also shows how
 * much headroom is left.
 *
 * The build itself is untouched: the command runs as a child with the same
 * environment and inherited stdout/stderr, and its exit code is passed through.
 * If the memory readings are not available (no /proc, no cgroup files: macOS,
 * Windows) the command still runs and only the readings are skipped.
 */
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import v8 from 'node:v8';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('build-memory: usage: node tools/build-memory.mjs <command> [args...]');
  process.exit(2);
}

const GB = 1024 ** 3;
const gb = (n) => (n / GB).toFixed(2) + ' GB';
const SAMPLE_MS = 2000;
const PRINT_EVERY_MS = 15000;
const PEAK_STEP = 256 * 1024 ** 2; // print again whenever the peak grows by this much

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    // Not available on this platform or in this container: the caller treats
    // a null as "no reading" and the build carries on without it.
    return null;
  }
}

function parseStat(text) {
  const out = {};
  for (const line of (text || '').split('\n')) {
    const [k, v] = line.split(' ');
    if (k && v !== undefined) out[k] = Number(v);
  }
  return out;
}

/** Container memory from cgroup v2, else v1. Bytes; null when unreadable. */
function cgroupMemory() {
  const v2 = read('/sys/fs/cgroup/memory.current');
  if (v2 !== null) {
    const stat = parseStat(read('/sys/fs/cgroup/memory.stat'));
    const max = (read('/sys/fs/cgroup/memory.max') || '').trim();
    return {
      used: Number(v2),
      limit: /^\d+$/.test(max) ? Number(max) : null,
      anon: stat.anon ?? null,
      file: stat.file ?? null,
      shmem: stat.shmem ?? null,
    };
  }
  const v1 = read('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  if (v1 !== null) {
    const stat = parseStat(read('/sys/fs/cgroup/memory/memory.stat'));
    const limit = Number((read('/sys/fs/cgroup/memory/memory.limit_in_bytes') || '').trim());
    return {
      used: Number(v1),
      limit: limit > 0 && limit < 2 ** 60 ? limit : null,
      anon: stat.total_rss ?? stat.rss ?? null,
      file: stat.total_cache ?? stat.cache ?? null,
      shmem: stat.total_shmem ?? stat.shmem ?? null,
    };
  }
  return null;
}

/** Short label for a build process from its command line and environment. */
function label(cmdline, environ) {
  if (/jest-worker[\\/]processChild/.test(cmdline)) {
    // Next runs each webpack compiler (server, edge, client) in a child with
    // NEXT_PRIVATE_BUILD_WORKER=1; the other jest-worker children collect page
    // data and render static pages.
    return environ.includes('NEXT_PRIVATE_BUILD_WORKER=1') ? 'webpack-worker' : 'page-worker';
  }
  if (/collect-build-traces/.test(cmdline)) return 'trace-worker';
  if (/next[\\/]dist[\\/]bin[\\/]next/.test(cmdline)) return 'next-build';
  const base = (cmdline.split(' ')[0] || '?').split('/').pop();
  return base.slice(0, 24);
}

/** RSS of every descendant of `rootPid` (including itself), grouped by label. */
function processTree(rootPid) {
  let pids;
  try {
    pids = readdirSync('/proc').filter((d) => /^\d+$/.test(d));
  } catch {
    // No /proc (macOS/Windows): no per-process readings.
    return null;
  }
  const parent = new Map();
  for (const pid of pids) {
    const stat = read(`/proc/${pid}/stat`);
    if (!stat) continue;
    // Field 4 (ppid) comes after the ")" that closes the command name.
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    parent.set(Number(pid), Number(after[1]));
  }
  const inTree = (pid) => {
    for (let p = pid, hops = 0; p > 1 && hops < 64; p = parent.get(p) ?? 0, hops++) {
      if (p === rootPid) return true;
    }
    return false;
  };
  const groups = new Map();
  let total = 0;
  for (const pid of parent.keys()) {
    if (!inTree(pid)) continue;
    const status = read(`/proc/${pid}/status`) || '';
    const m = /VmRSS:\s+(\d+)\s+kB/.exec(status);
    if (!m) continue;
    const rss = Number(m[1]) * 1024;
    const cmd = (read(`/proc/${pid}/cmdline`) || '').replace(/\0/g, ' ');
    const name = label(cmd, read(`/proc/${pid}/environ`) || '');
    const g = groups.get(name) || { rss: 0, n: 0 };
    g.rss += rss;
    g.n += 1;
    groups.set(name, g);
    total += rss;
  }
  return { total, groups };
}

const started = Date.now();
const secs = () => Math.round((Date.now() - started) / 1000) + 's';

const cg0 = cgroupMemory();
console.log(
  `build-memory: box ${gb(os.totalmem())}, ${os.cpus().length} cpus` +
    (cg0?.limit ? `, container limit ${gb(cg0.limit)}` : '') +
    `, node ${process.version} heap limit ${gb(v8.getHeapStatistics().heap_size_limit)}` +
    (process.env.NODE_OPTIONS ? `, NODE_OPTIONS="${process.env.NODE_OPTIONS}"` : ''),
);

// Resolve `next` to its JS entry so it runs under this same Node binary.
let command = args[0];
let commandArgs = args.slice(1);
if (command === 'next') {
  const require = createRequire(import.meta.url);
  commandArgs = [require.resolve('next/dist/bin/next'), ...commandArgs];
  command = process.execPath;
}

const child = spawn(command, commandArgs, { stdio: 'inherit', env: process.env });

let peak = { used: 0, at: '0s', line: '' };
let lastPrint = 0;
let lastPrintedPeak = 0;

function sample(force) {
  const cg = cgroupMemory();
  const tree = processTree(child.pid);
  if (!cg && !tree) return;
  // The peak tracks memory the kernel cannot reclaim (anonymous + shared). The
  // page cache ("file") also counts toward the cgroup total but is dropped
  // before anything is killed, so on its own it is not a sign of trouble.
  const used = cg ? (cg.anon !== null ? cg.anon + (cg.shmem || 0) : cg.used) : tree.total;
  const parts = [];
  if (cg) {
    parts.push(`box ${gb(cg.used)}`);
    if (cg.anon !== null) parts.push(`anon ${gb(cg.anon)}`);
    if (cg.file !== null) parts.push(`file ${gb(cg.file)}`);
    if (cg.shmem) parts.push(`shmem ${gb(cg.shmem)}`);
  }
  if (tree) {
    const procs = [...tree.groups]
      .sort((a, b) => b[1].rss - a[1].rss)
      .map(([name, g]) => `${name}${g.n > 1 ? '×' + g.n : ''} ${gb(g.rss)}`)
      .join(', ');
    parts.push(`build processes ${gb(tree.total)} [${procs}]`);
  }
  const line = parts.join(' | ');
  if (used > peak.used) peak = { used, at: secs(), line };
  const now = Date.now();
  if (force || now - lastPrint >= PRINT_EVERY_MS || peak.used - lastPrintedPeak >= PEAK_STEP) {
    console.log(`build-memory ${secs()}: ${line}`);
    lastPrint = now;
    lastPrintedPeak = peak.used;
  }
}

const timer = setInterval(() => {
  try {
    sample(false);
  } catch (err) {
    // A reading failed (a process exited mid-read). Say so once and keep the
    // build running; the readings are a diagnostic, never a reason to fail.
    console.log(`build-memory: reading skipped (${err && err.message})`);
  }
}, SAMPLE_MS);
timer.unref();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}

child.on('exit', (code, signal) => {
  clearInterval(timer);
  if (peak.used > 0) {
    console.log(`build-memory: PEAK in use ${gb(peak.used)} at ${peak.at} — ${peak.line}`);
  }
  if (signal) {
    console.error(`build-memory: build was stopped by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
