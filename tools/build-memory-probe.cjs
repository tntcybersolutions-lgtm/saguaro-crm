/**
 * Preloaded into every Node process of `npm run build` by tools/build-memory.mjs
 * (NODE_OPTIONS=--require). Every 15 seconds each Next.js build process prints
 * its own V8 heap next to its resident size, so the log separates JavaScript
 * heap (which --max-old-space-size limits) from memory outside it (buffers,
 * native code such as SWC). It only reads numbers; it never changes the build.
 */
'use strict';

const v8 = require('node:v8');

const isWebpackWorker = process.env.NEXT_PRIVATE_BUILD_WORKER === '1';
const isNextWorker = process.env.IS_NEXT_WORKER === 'true';
const isNextMain = /next[\\/]dist[\\/]bin[\\/]next$/.test(process.argv[1] || '');

if (isWebpackWorker || isNextWorker || isNextMain) {
  const name = isWebpackWorker ? 'webpack-worker' : isNextWorker ? 'page-worker' : 'next-build';
  const GB = 1024 ** 3;
  const gb = (n) => (n / GB).toFixed(2);
  const started = Date.now();
  const report = () => {
    const h = v8.getHeapStatistics();
    const m = process.memoryUsage();
    process.stdout.write(
      `build-memory heap ${name} pid ${process.pid} +${Math.round((Date.now() - started) / 1000)}s: ` +
        `heap used ${gb(h.used_heap_size)} / committed ${gb(h.total_heap_size)} / limit ${gb(h.heap_size_limit)} GB, ` +
        `buffers ${gb(m.arrayBuffers)} GB, outside heap ${gb(Math.max(0, m.rss - h.total_heap_size))} GB, rss ${gb(m.rss)} GB\n`,
    );
  };
  const timer = setInterval(report, 15000);
  timer.unref();
}
