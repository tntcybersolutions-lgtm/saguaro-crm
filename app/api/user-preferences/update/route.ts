import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const ALLOWED_FIELDS = new Set([
  'theme',
  'sidebar_collapsed',
  'focus_mode',
  'notifications_enabled',
  'email_digest',
  'default_project_view',
  'currency_format',
  'date_format',
]);

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Filter to only allowed fields
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid preference fields provided' }, { status: 400 });
    }

    const db = createServerClient();
    const now = new Date().toISOString();

    const { data, error } = await db
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          tenant_id: user.tenantId,
          ...updates,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[user-preferences PATCH]', error);
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }

    return NextResponse.json({ preferences: data });
  } catch (err) {
    console.error('[user-preferences PATCH] unexpected', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
