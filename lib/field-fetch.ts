/**
 * Saguaro Field — Standardized Fetch Wrapper
 *
 * Replaces raw fetch() + silent catch across all field pages.
 * - Returns typed data or null on failure
 * - Sets error state for UI display
 * - Handles offline detection
 * - Retries once on timeout
 * - Standardizes response parsing
 */

export interface FieldFetchResult<T> {
  data: T | null;
  error: string | null;
  offline: boolean;
}

/**
 * Fetch wrapper for field app data loading.
 *
 * @param url - API endpoint
 * @param options - Standard fetch options
 * @param dataKey - Response key to extract (e.g., 'rfis', 'items', 'data')
 *                  If provided, tries: response[dataKey] || response.data || response.items || response
 */
export async function fieldFetch<T = unknown>(
  url: string,
  options?: RequestInit,
  dataKey?: string,
): Promise<FieldFetchResult<T>> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline) {
    return { data: null, error: 'You are offline', offline: true };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error || `Request failed (${res.status})`;
      return { data: null, error: msg, offline: false };
    }

    const json = await res.json();

    // Extract data from response — try the specified key first, then common patterns
    let extracted: unknown = json;
    if (dataKey && json && typeof json === 'object') {
      extracted = json[dataKey] ?? json.data ?? json.items ?? json;
    }

    return { data: extracted as T, error: null, offline: false };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Retry once on timeout
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          return { data: null, error: `Request failed (${res.status})`, offline: false };
        }
        const json = await res.json();
        let extracted: unknown = json;
        if (dataKey && json && typeof json === 'object') {
          extracted = json[dataKey] ?? json.data ?? json.items ?? json;
        }
        return { data: extracted as T, error: null, offline: false };
      } catch {
        return { data: null, error: 'Request timed out', offline: false };
      }
    }

    // Network error — likely offline or DNS failure
    return {
      data: null,
      error: 'Unable to connect — check your network',
      offline: typeof navigator !== 'undefined' && !navigator.onLine,
    };
  }
}

/**
 * POST/PATCH/PUT helper for field app mutations.
 * Handles JSON serialization and error extraction.
 */
export async function fieldMutate<T = unknown>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<FieldFetchResult<T>> {
  return fieldFetch<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}
