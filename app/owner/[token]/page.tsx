import { createServerClient } from '@/lib/supabase-server';
import OwnerPortalClient from './OwnerPortalClient';

export default async function OwnerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServerClient();

  // Server-side: validate token exists
  const { data: tokenData } = await db
    .from('owner_portal_tokens')
    .select('id, token, owner_name, owner_company, project_id')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (!tokenData) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <h1 style={{ fontSize: 24, color: '#1a1a2e', marginBottom: 8 }}>Portal Not Found</h1>
          <p style={{ color: '#666', fontSize: 14 }}>This portal link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return <OwnerPortalClient token={token} />;
}
