import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import {
  loadOrComputeStyleProfile,
  renderStyleProfileText,
  logSageActivity,
  type SageStyleDimensions,
} from '@/lib/sage-brain';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/**
 * R16 — Transparent communication style profile.
 * GET    → current profile (computed from real content when missing/stale).
 * PUT    → edit dimensions / profile text / enabled toggle (marks user_edited).
 * POST   → force recompute from the user's real platform content.
 *
 * Tolerant of the sage_style_profiles table not being migrated yet (064):
 * GET still returns a computed (unpersisted) profile; PUT reports honestly.
 */

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const profile = await loadOrComputeStyleProfile(user.id, user.tenantId);
    return NextResponse.json({ profile });
  } catch (e) {
    return apiError('sage/style-profile GET', e, 'Failed to load style profile');
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Force recompute: clear user_edited + computed_at so the loader rebuilds.
    const db = createServerClient();
    try {
      await must((db as any)
        .from('sage_style_profiles')
        .update({ user_edited: false, computed_at: null, updated_at: new Date().toISOString() })
        .eq('user_id', user.id), 'sage_style_profiles write');
    } catch { /* tolerant */ }
    const profile = await loadOrComputeStyleProfile(user.id, user.tenantId);
    await logSageActivity({
      userId: user.id,
      tenantId: user.tenantId,
      actor: 'user',
      actionType: 'style_profile_recomputed',
      summary: 'Style profile recomputed from platform content at user request.',
    });
    return NextResponse.json({ profile });
  } catch (e) {
    return apiError('sage/style-profile POST', e, 'Failed to recompute style profile');
  }
}

interface StyleProfileUpdateBody {
  enabled?: boolean;
  profile_text?: string;
  dimensions?: Partial<SageStyleDimensions>;
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: StyleProfileUpdateBody = await req.json();
    const db = createServerClient();

    // Load current (also seeds a row when the table exists but is empty).
    const current = await loadOrComputeStyleProfile(user.id, user.tenantId);
    if (!current) {
      return NextResponse.json({ error: 'Style profile unavailable' }, { status: 500 });
    }

    const clamp10 = (n: unknown, fallback: number) => {
      const v = Number(n);
      return Number.isFinite(v) ? Math.max(1, Math.min(10, Math.round(v))) : fallback;
    };

    const dims: SageStyleDimensions = {
      brevity: clamp10(body.dimensions?.brevity, current.brevity),
      formality: clamp10(body.dimensions?.formality, current.formality),
      emoji_use: clamp10(body.dimensions?.emoji_use, current.emoji_use),
      directness: clamp10(body.dimensions?.directness, current.directness),
      technical_depth: clamp10(body.dimensions?.technical_depth, current.technical_depth),
      humor: clamp10(body.dimensions?.humor, current.humor),
    };

    const dimsChanged = body.dimensions != null;
    const textProvided = typeof body.profile_text === 'string' && body.profile_text.trim().length > 0;
    const profile_text = textProvided
      ? (body.profile_text as string).slice(0, 4000)
      : dimsChanged
        ? renderStyleProfileText(dims, current.sample_count, current.sources)
        : current.profile_text;
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : current.enabled;
    const userEdited = dimsChanged || textProvided ? true : current.user_edited;

    let persisted = true;
    try {
      await must((db as any).from('sage_style_profiles').upsert(
        {
          user_id: user.id,
          tenant_id: user.tenantId,
          enabled,
          ...dims,
          profile_text,
          sample_count: current.sample_count,
          sources: current.sources,
          user_edited: userEdited,
          computed_at: current.computed_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      ), 'sage_style_profiles upsert');
    } catch {
      persisted = false; // table not migrated yet — report honestly
    }

    await logSageActivity({
      userId: user.id,
      tenantId: user.tenantId,
      actor: 'user',
      actionType: typeof body.enabled === 'boolean' && !dimsChanged && !textProvided
        ? (enabled ? 'style_profile_enabled' : 'style_profile_disabled')
        : 'style_profile_edited',
      summary: typeof body.enabled === 'boolean' && !dimsChanged && !textProvided
        ? `Style mirroring turned ${enabled ? 'on' : 'off'}.`
        : 'Style profile edited by user.',
    });

    return NextResponse.json({
      profile: { ...current, ...dims, enabled, profile_text, user_edited: userEdited },
      persisted,
      ...(persisted
        ? {}
        : { note: 'Style profile storage is not migrated yet (064_sage_brain.sql) — this change will not survive until the migration is applied.' }),
    });
  } catch (e) {
    return apiError('sage/style-profile PUT', e, 'Failed to update style profile');
  }
}
