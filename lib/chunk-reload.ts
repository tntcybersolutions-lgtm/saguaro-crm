/**
 * Deploy skew: a tab opened before a deploy asks for a code chunk that the new
 * deploy no longer serves ("ChunkLoadError: Loading chunk 82957 failed"), and
 * the screen breaks. Seen on the live walkthrough mid-deploy. One reload picks
 * up the new build; the 30-second guard stops a reload loop if the chunk is
 * genuinely missing.
 */
const KEY = 'sg-chunk-reload-at';

export function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ''} ${e?.message ?? String(err ?? '')}`;
  return /ChunkLoadError|Loading chunk \S+ failed|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(text);
}

/** Reloads the page once per 30 s when the error is a stale-chunk failure. Returns true if it reloaded. */
export function reloadOnceForChunkError(err: unknown): boolean {
  if (typeof window === 'undefined' || !isChunkLoadError(err)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch (storageErr) {
    // Private mode / blocked storage: still reload once; the browser's own
    // reload loop protection is the fallback guard.
    console.warn('[chunk-reload] sessionStorage unavailable', storageErr);
  }
  window.location.reload();
  return true;
}

/** Inline, dependency-free twin for <head>: catches chunk failures that happen before React mounts. */
export const CHUNK_RELOAD_INLINE = `(function(){var K='${KEY}';function h(m){if(!m||!/ChunkLoadError|Loading chunk \\S+ failed|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(m))return;try{var t=+sessionStorage.getItem(K)||0;if(Date.now()-t<30000)return;sessionStorage.setItem(K,String(Date.now()));}catch(e){}location.reload();}window.addEventListener('error',function(e){h((e&&e.message)||(e&&e.error&&(e.error.name+' '+e.error.message))||'')});window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;h(r?((r.name||'')+' '+(r.message||String(r))):'')});})();`;
