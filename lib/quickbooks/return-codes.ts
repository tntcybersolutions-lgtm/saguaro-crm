/**
 * After Connect, the server sends the browser back to the QuickBooks page with
 * `?qb=<code>`. One list, so the routes that set a code and the page that reads
 * it cannot drift. Client-safe: no Node APIs.
 */
export const QBO_RETURN_MESSAGES = {
  connected: { ok: true, msg: 'QuickBooks is connected.' },
  denied: { ok: false, msg: 'QuickBooks was not connected — access was declined at Intuit.' },
  state: { ok: false, msg: 'That QuickBooks sign-in expired or was started in another tab. Press Connect again.' },
  signin: { ok: false, msg: 'Sign in to Saguaro, then press Connect again.' },
  forbidden: { ok: false, msg: 'Only a company admin can connect QuickBooks.' },
  missing: { ok: false, msg: 'Intuit did not return a company. Press Connect again and pick a company.' },
  not_configured: { ok: false, msg: 'QuickBooks is not set up on this server yet — the Intuit app keys are missing.' },
  exchange: { ok: false, msg: 'Intuit did not accept the sign-in. Press Connect again. If it repeats, the redirect URI registered at Intuit does not match this site.' },
  failed: { ok: false, msg: 'QuickBooks could not be connected. Please try again.' },
} as const;

export type QboReturnCode = keyof typeof QBO_RETURN_MESSAGES;

export const QBO_PAGE_PATH = '/app/integrations/quickbooks';

export function qboReturnPath(code: QboReturnCode): string {
  return `${QBO_PAGE_PATH}?qb=${code}`;
}
