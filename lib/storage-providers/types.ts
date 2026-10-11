/**
 * Unified external-storage provider contract. Every adapter (S3, OneDrive,
 * SharePoint, Egnyte, Dropbox, Google Drive, Box) implements StorageProvider so
 * the routes are provider-agnostic. Paths are provider-native opaque strings
 * (a key, a folder path, or an item id) — the UI passes them back verbatim.
 */
export type ProviderId = 's3' | 'onedrive' | 'sharepoint' | 'egnyte' | 'dropbox' | 'gdrive' | 'box';

export interface StorageItem {
  name: string;
  path: string;            // provider-native locator to fetch/list this item
  kind: 'file' | 'folder';
  size?: number | null;
  modified?: string | null;
  mime?: string | null;
  externalId?: string | null;
}

export interface ListResult {
  items: StorageItem[];
  path: string;            // the folder we listed
  parent?: string | null;  // locator of the parent folder (for "up")
}

export interface StorageProvider {
  readonly provider: ProviderId;
  /** Verify credentials; returns the connected account label when possible. */
  test(): Promise<{ ok: boolean; error?: string; account?: string }>;
  /** List a folder (default = configured root). */
  list(path?: string | null): Promise<ListResult>;
  /** Download a file's bytes. */
  download(path: string): Promise<{ bytes: Buffer; name: string; mime?: string | null }>;
  /** Upload bytes into a destination folder; returns the new item's locator. */
  upload(destFolder: string | null, name: string, bytes: Buffer, mime?: string | null): Promise<{ path: string; externalId?: string | null }>;
  /** Optional: delete an item. */
  remove?(path: string): Promise<void>;
  /** Optional: a temporary/shareable link to the item. */
  link?(path: string): Promise<string | null>;
}

/** A decrypted connector as adapters receive it (secrets already decrypted). */
export interface ConnectorCtx {
  id: string;
  tenantId: string;
  provider: ProviderId;
  config: Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  /** { accessKeyId, secretAccessKey } | { apiToken } | { access_token, refresh_token, expires_at } */
  secret: Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  rootPath?: string | null;
  /** Persist refreshed OAuth tokens back to the connector (adapters call this after a refresh). */
  saveSecret?: (secret: Record<string, any>) => Promise<void>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Human labels + which auth style each provider uses (drives the connect UI). */
export const PROVIDER_META: Record<ProviderId, { label: string; auth: 'keys' | 'token' | 'oauth'; blurb: string }> = {
  s3:         { label: 'Amazon S3 / S3-compatible', auth: 'keys',  blurb: 'AWS S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO, DO Spaces' },
  onedrive:   { label: 'OneDrive',                  auth: 'oauth', blurb: 'Microsoft 365 personal or business OneDrive' },
  sharepoint: { label: 'SharePoint',                auth: 'oauth', blurb: 'Microsoft 365 SharePoint document libraries' },
  egnyte:     { label: 'Egnyte',                    auth: 'token', blurb: 'Egnyte domain + API token (popular in AEC)' },
  dropbox:    { label: 'Dropbox',                   auth: 'oauth', blurb: 'Dropbox / Dropbox Business' },
  gdrive:     { label: 'Google Drive',              auth: 'oauth', blurb: 'Google Drive / Shared Drives' },
  box:        { label: 'Box',                       auth: 'oauth', blurb: 'Box enterprise content' },
};

/** Small fetch helper: JSON or throw with the provider's error text. */
export async function apiFetch(url: string, init: RequestInit & { raw?: boolean } = {}): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 400); } catch { /* ignore */ }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  if (init.raw) return res;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}
