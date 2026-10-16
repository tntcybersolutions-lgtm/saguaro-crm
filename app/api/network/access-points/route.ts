import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Access Points API for the WiFi Manager heatmap page.
 *
 * The page (app/projects/[projectId]/network/wifi/page.tsx) works with a
 * flat "AccessPoint" shape:
 *   { id, network_project_id, name, model, floor (number), x_position,
 *     y_position, coverage_radius, channel, power_dbm, status, ssid_ids }
 *
 * The underlying storage table is `wifi_ap_placements`, whose columns are:
 *   floor (text), x_pct, y_pct, coverage_radius_ft, channel_2g/5g, tx_power,
 *   mounting, antenna_type, device_id, notes ...
 *
 * There is no dedicated column for the page-only fields (name, model, status,
 * channel, power_dbm, ssid_ids), so they are persisted as JSON inside the
 * `notes` column and rehydrated on read. Positional / coverage values map onto
 * the real columns so the existing AP-placement tooling stays consistent.
 *
 * GET  /api/network/access-points?networkProjectId=xxx  -> { accessPoints: [...] }
 * POST /api/network/access-points                       -> { accessPoint: {...} }
 */

interface ApMeta {
  name?: string;
  model?: string;
  status?: string;
  channel?: number;
  power_dbm?: number;
  ssid_ids?: string[];
}

function parseMeta(notes: string | null): ApMeta {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? (parsed as ApMeta) : {};
  } catch {
    return {};
  }
}

/** Map a wifi_ap_placements row into the flat AccessPoint shape the page expects. */
function toAccessPoint(row: Record<string, any>) {
  const meta = parseMeta(row.notes);
  const floorNum = Number.parseInt(String(row.floor ?? '1'), 10);
  return {
    id: row.id,
    network_project_id: row.network_project_id,
    name: meta.name ?? '',
    model: meta.model ?? '',
    floor: Number.isFinite(floorNum) ? floorNum : 1,
    x_position: row.x_pct ?? 0,
    y_position: row.y_pct ?? 0,
    coverage_radius: row.coverage_radius_ft ?? 50,
    channel: meta.channel ?? row.channel_5g ?? row.channel_2g ?? 1,
    power_dbm: meta.power_dbm ?? 20,
    status: meta.status ?? 'planned',
    ssid_ids: Array.isArray(meta.ssid_ids) ? meta.ssid_ids : [],
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    // Page sends camelCase; accept snake_case too for safety.
    const networkProjectId =
      searchParams.get('networkProjectId') || searchParams.get('network_project_id');

    if (!networkProjectId) {
      return NextResponse.json({ accessPoints: [] });
    }

    const db = createServerClient();

    // Verify the network project belongs to the caller's tenant.
    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', networkProjectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ accessPoints: [] });
    }

    const { data, error } = await db
      .from('wifi_ap_placements')
      .select('*')
      .eq('network_project_id', networkProjectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const accessPoints = (data || []).map(toAccessPoint);
    return NextResponse.json({ accessPoints });
  } catch (err) {
    return apiError('network/access-points GET', err, undefined, 500, { accessPoints: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json().catch(() => ({}));
    const {
      network_project_id,
      name,
      model,
      floor,
      x_position,
      y_position,
      coverage_radius,
      channel,
      power_dbm,
      status,
      ssid_ids,
    } = body || {};

    if (!network_project_id) {
      return NextResponse.json({ error: 'network_project_id is required' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const db = createServerClient();

    // Verify ownership before writing.
    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', network_project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ error: 'Network project not found' }, { status: 400 });
    }

    const chan = channel !== undefined && channel !== null ? Number(channel) : null;
    const meta: ApMeta = {
      name: String(name),
      model: model ? String(model) : '',
      status: status ? String(status) : 'planned',
      channel: chan ?? 1,
      power_dbm: power_dbm !== undefined && power_dbm !== null ? Number(power_dbm) : 20,
      ssid_ids: Array.isArray(ssid_ids) ? ssid_ids : [],
    };

    const { data, error } = await db
      .from('wifi_ap_placements')
      .insert({
        network_project_id,
        tenant_id: user.tenantId,
        floor: String(floor ?? 1),
        x_pct: x_position !== undefined && x_position !== null ? Number(x_position) : 50,
        y_pct: y_position !== undefined && y_position !== null ? Number(y_position) : 50,
        coverage_radius_ft:
          coverage_radius !== undefined && coverage_radius !== null ? Number(coverage_radius) : 50,
        channel_5g: chan,
        notes: JSON.stringify(meta),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ accessPoint: toAccessPoint(data) }, { status: 201 });
  } catch (err) {
    return apiError('network/access-points POST', err);
  }
}
