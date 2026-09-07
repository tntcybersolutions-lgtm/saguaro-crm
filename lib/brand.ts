/**
 * lib/brand.ts
 *
 * The platform's name, in one place.
 *
 * It was in 300 places before this, spelled four different ways — "Saguaro
 * Control Systems", "Saguaro CRM", "Saguaro Construction Software", and a
 * competing tagline in the social metadata ("— AI-Powered Construction
 * Management") that contradicted the browser title on the same page. A name
 * copied into 300 files is a name that drifts, and it had.
 *
 * PLATFORM_NAME is the whole name and the only name. Anywhere the product is
 * referred to by name — a document footer, an email, a dialog, a page title,
 * the legal pages — it is this string.
 *
 * Changing the platform's name is now a one-line edit here.
 */

/** The platform's full and only name. */
export const PLATFORM_NAME = 'Saguaro Control Systems — Construction Management & Project Controls';

/**
 * The name as an email display-name.
 *
 * RFC 5322 requires a display name containing any of ()<>[]:;@\,." or an em
 * dash to be a quoted-string. Interpolating PLATFORM_NAME raw into a From
 * header produces an address some servers reject and others mangle, so the
 * quoting happens here rather than being remembered at each call site.
 */
export const PLATFORM_EMAIL_NAME = `"${PLATFORM_NAME.replace(/"/g, '')}"`;

/** `"Name" <address>` for a From/Reply-To header. */
export function platformFrom(address: string): string {
  return `${PLATFORM_EMAIL_NAME} <${address}>`;
}

/** The domain the platform lives on, for links inside documents and emails. */
export const PLATFORM_URL = 'https://saguarocontrol.net';

/**
 * The legal entity for copyright lines.
 *
 * Deliberately the same string: a footer that reads "© 2026 Saguaro Control
 * Systems" beside a document headed with the full name is the drift this file
 * exists to stop.
 */
export const PLATFORM_LEGAL_NAME = PLATFORM_NAME;

/** "© 2026 <name> — All rights reserved." */
export function platformCopyright(year: number = new Date().getFullYear()): string {
  return `© ${year} ${PLATFORM_LEGAL_NAME}`;
}
