import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const DEFAULT_PREFERENCES = {
  theme: 'dark',
  sidebar_collapsed: false,
  focus_mode: false,
  notifications_enabled: true,
  email_digest: 'daily',
  default_project_view: 'grid',
  currency_format: 'USD',
  date_format: 'MM/DD/YYYY',
};

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createServerClient();

    const { data, error } = await db
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (error) {
      console.error('[user-preferences GET]', error);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        preferences: {
          ...DEFAULT_PREFERENCES,
          user_id: user.id,
          tenant_id: user.tenantId,
        },
      });
    }

    return NextResponse.json({ preferences: data });
  } catch (err) {
    console.error('[user-preferences GET] unexpected', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
