/**
 * The header the offline outbox puts on a write it kept on the phone and sends
 * later: the moment the person actually tapped (ISO). Shared by the outbox
 * (client) and the routes that honour it (lib/timeclock/server punchTime).
 */
export const SAVED_AT_HEADER = 'x-saguaro-saved-at';
