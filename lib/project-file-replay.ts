/**
 * A video kept on the phone with no signal can reach the server more than once:
 * the first send filed it, the answer never came back, so the phone sends it
 * again with the same client id (lib/offline/client-id). These two helpers let
 * /api/files/upload-url and /api/files/record find the project_files row the
 * first send made and hand it back instead of filing a second one.
 */
import { signStoredUrl } from '@/lib/storage-signing';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export const FILES_BUCKET = 'project-files';

/** The project_files row this phone already filed under `clientId`, or null. */
export async function fileFiledByClient(db: any, tenantId: string, clientId: string | null): Promise<Row | null> {
  if (!clientId) return null;
  const { data, error } = await db.from('project_files').select('*')
    .eq('tenant_id', tenantId).eq('client_id', clientId).limit(1);
  if (error) throw error;
  return ((data as Row[] | null) || [])[0] ?? null;
}

/** The row as the record route answers it: file + poster as short-lived signed links. */
export async function signedFileRow(row: Row): Promise<Row> {
  const bucket = (row.storage_bucket as string) || FILES_BUCKET;
  const url = row.storage_path ? await signStoredUrl(bucket, row.storage_path as string, 3600).catch(() => null) : null;
  const poster = row.poster_url ? await signStoredUrl(bucket, row.poster_url as string, 3600).catch(() => null) : null;
  return { ...row, ...(url ? { url, file_url: url } : {}), ...(poster ? { poster_url: poster } : {}) };
}
