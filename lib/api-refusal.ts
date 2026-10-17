/**
 * What a failed /api answer says to the person — one rule for every screen.
 *
 * Live QA (17 Oct 2026, D6): a Foreman opening Budget read "Couldn't load the
 * budget. Request failed"; Invoicing said "nothing has been lost, try again";
 * People said "Please sign in and try again" to someone signed in. The server
 * had answered 403 with "You don't have permission to view Budget. Ask your
 * company admin for access." and the screens threw it away.
 *
 *   const data = await apiJson(`/api/projects/${id}/budget`, undefined, "Couldn't load the budget.");
 *   …catch (e) { setError(errorText(e)); setRefused(isRefusal(e)); }
 *
 * A refusal is not a failure: there is nothing to retry, so screens show it
 * without a Retry button (isRefusal).
 *
 * Client-safe: no imports beyond lib/errors.
 */
import { humanError } from './errors';

export class ApiError extends Error {
  status: number;
  reason?: string;
  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
  }
}

export const NO_PERMISSION = "You don't have permission to do this. Ask your company admin for access.";
export const SIGNED_OUT = 'Your session expired. Sign in again to continue.';

/** The person-facing sentence for a status and (optional) server body. */
export function messageFor(status: number, body: unknown, fallback: string): string {
  const raw = body && typeof body === 'object'
    ? ((body as { error?: unknown; message?: unknown }).error ?? (body as { message?: unknown }).message)
    : null;
  const said = typeof raw === 'string' ? raw.trim() : '';
  if (status === 401) return SIGNED_OUT;
  if (status === 403) {
    // The guard's own words name what was refused; anything else gets the plain refusal.
    return /^you don't have permission/i.test(said) ? said : NO_PERMISSION;
  }
  if (status === 409 && said && said.length < 200) return said;
  if (status >= 500 || !said) return fallback;
  return humanError(said, fallback);
}

/** Read a failed response into an ApiError (never throws while reading). */
export async function apiErrorFrom(res: Response, fallback: string): Promise<ApiError> {
  let body: unknown = null;
  try {
    const type = res.headers.get('content-type') || '';
    if (type.includes('json')) body = await res.clone().json();
  } catch (e) {
    void e; // a body that is not JSON says nothing we can show
  }
  const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : undefined;
  return new ApiError(messageFor(res.status, body, fallback), res.status, typeof reason === 'string' ? reason : undefined);
}

/** fetch + JSON, throwing an ApiError that reads right on screen. */
export async function apiJson<T = unknown>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    void e;
    throw new ApiError('No connection — check your signal and try again.', 0);
  }
  if (!res.ok) throw await apiErrorFrom(res, fallback);
  try {
    return (await res.json()) as T;
  } catch (e) {
    void e;
    throw new ApiError(fallback, res.status);
  }
}

/** The text to show for anything a screen caught. */
export function errorText(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof ApiError) return e.message;
  return humanError(e, fallback);
}

/** A refusal (no permission): show it, but offer no Retry — retrying cannot help. */
export function isRefusal(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 403 || e.status === 401);
}
