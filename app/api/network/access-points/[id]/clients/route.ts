import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { ok, unauthorized, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    // Client data comes from AP controller imports — return empty until populated
    return ok({ clients: [], total: 0, band_breakdown: { '5GHz': 0, '2.4GHz': 0, '6GHz': 0 } });
  } catch (err) { return serverError(err); }
}
