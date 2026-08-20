/**
 * lib/portal-auth.ts — Shared portal authentication + permission enforcement
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export interface PortalSession {
  id: string;
  tenant_id: string;
  project_id: string;
  client_name: string;
  client_email: string;
  token: string;
  status: string;
  permissions: string[];
  expires_at: string | null;
  last_accessed_at: string | null;
  created_by: string;
  created_at: string;
}

/**
 * Authenticate a portal request and optionally check a specific permission.
 * Returns the session if valid and permitted, null otherwise.
 */
export async function getPortalSession(
  req: NextRequest,
  requiredPermission?: string
): Promise<PortalSession | null> {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_client_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  if (!session) return null;

  // Check expiration
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return null;
  }

  // Check permission if required
  if (requiredPermission) {
    const perms: string[] = session.permissions || [];
    if (!perms.includes(requiredPermission)) {
      return null;
    }
  }

  return session as PortalSession;
}

/** Permission constants */
export const PORTAL_PERMS = {
  VIEW_PROJECT: 'view_project',
  VIEW_FINANCIALS: 'view_financials',
  APPROVE_DOCUMENTS: 'approve_documents',
  MESSAGING: 'messaging',
  VIEW_DOCUMENTS: 'view_documents',
  VIEW_SCHEDULE: 'view_schedule',
  VIEW_PHOTOS: 'view_photos',
  VIEW_CHANGE_ORDERS: 'view_change_orders',
  VIEW_PUNCH_LIST: 'view_punch_list',
  VIEW_WARRANTY: 'view_warranty',
  VIEW_SELECTIONS: 'view_selections',
} as const;
