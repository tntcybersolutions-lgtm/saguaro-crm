/**
 * Server-side registry: turn a stored storage_connectors row into a live
 * StorageProvider (secrets decrypted, OAuth refresh wired to persist back).
 * Adapters are dynamically imported so a route only loads the one it needs.
 */
import { createServerClient } from '@/lib/supabase-server';
import { encryptSecret, decryptSecret } from '@/lib/crypto-secrets';
import type { ConnectorCtx, StorageProvider, ProviderId } from './types';
import { must } from '@/lib/db-write';

export async function makeProvider(ctx: ConnectorCtx): Promise<StorageProvider> {
  switch (ctx.provider) {
    case 's3': return (await import('./s3')).make(ctx);
    case 'egnyte': return (await import('./egnyte')).make(ctx);
    case 'onedrive': return (await import('./onedrive')).make(ctx);
    case 'sharepoint': return (await import('./sharepoint')).make(ctx);
    case 'dropbox': return (await import('./dropbox')).make(ctx);
    case 'gdrive': return (await import('./gdrive')).make(ctx);
    case 'box': return (await import('./box')).make(ctx);
    default: throw new Error(`Unknown provider: ${ctx.provider}`);
  }
}

/** Load + decrypt a connector into a ConnectorCtx (with a saveSecret that re-encrypts). */
export async function loadConnectorCtx(id: string, tenantId: string): Promise<ConnectorCtx | null> {
  const admin = createServerClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await admin.from('storage_connectors').select('*').eq('id', id).eq('tenant_id', tenantId).single();
  if (!data) return null;
  const ctx: ConnectorCtx = {
    id: data.id,
    tenantId: data.tenant_id,
    provider: data.provider as ProviderId,
    config: data.config || {},
    secret: decryptSecret<Record<string, any>>(data.secret_enc) || {}, // eslint-disable-line @typescript-eslint/no-explicit-any
    rootPath: data.root_path,
    saveSecret: async (secret) => {
      await must(admin.from('storage_connectors').update({ secret_enc: encryptSecret(secret), updated_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId), 'storage_connectors update');
    },
  };
  return ctx;
}

/** Build a ConnectorCtx from raw parts (used before the row exists, e.g. test-on-create). */
export function ctxFromParts(provider: ProviderId, tenantId: string, config: Record<string, any>, secret: Record<string, any>, rootPath?: string | null): ConnectorCtx { // eslint-disable-line @typescript-eslint/no-explicit-any
  return { id: 'draft', tenantId, provider, config: config || {}, secret: secret || {}, rootPath };
}
