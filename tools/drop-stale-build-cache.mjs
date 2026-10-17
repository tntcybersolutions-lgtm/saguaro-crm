#!/usr/bin/env node
/**
 * Delete webpack's production disk cache before `next build`.
 *
 * next.config.js keeps the production webpack cache in memory only (restoring
 * the disk copy is what filled Vercel's 8 GB build box). Vercel still restores
 * .next/cache from the previous deployment, so the old disk copy (about 2 GB
 * unpacked) would be carried forward, re-packed and re-uploaded on every build
 * without ever being read. This removes the three production folders; the
 * development cache (`next dev`) and the rest of .next/cache (images, fetch
 * cache) are left alone. Runs in prebuild.
 */
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, '.next', 'cache', 'webpack');
const removed = [];

for (const name of ['client-production', 'server-production', 'edge-server-production']) {
  const dir = join(cacheDir, name);
  if (!existsSync(dir)) continue;
  rmSync(dir, { recursive: true, force: true });
  removed.push(name);
}

console.log(
  removed.length
    ? `drop-stale-build-cache: removed .next/cache/webpack/{${removed.join(',')}} (production cache is memory-only)`
    : 'drop-stale-build-cache: no production webpack cache on disk',
);
