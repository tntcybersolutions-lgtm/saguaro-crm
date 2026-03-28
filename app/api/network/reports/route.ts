import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/network/reports?network_project_id=xxx
 * List network reports.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const networkProjectId = searchParams.get('network_project_id');

    const db = createServerClient();

    let query = db
      .from('network_reports')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (networkProjectId) query = query.eq('network_project_id', networkProjectId);

    const { data, error } = await query;
    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * Build report data payload for a given report type.
 */
async function buildReportData(
  db: any,
  networkProjectId: string,
  reportType: string
): Promise<{ title: string; data: any }> {
  switch (reportType) {
    case 'ip_schedule': {
      const { data: vlans } = await db
        .from('network_vlans')
        .select('*')
        .eq('network_project_id', networkProjectId)
        .order('vlan_id', { ascending: true });

      const { data: devices } = await db
        .from('network_devices')
        .select('name, device_type, ip_address, mac_address, vlan_id, location')
        .eq('network_project_id', networkProjectId)
        .order('ip_address', { ascending: true });

      return {
        title: 'IP Address Schedule',
        data: { vlans: vlans || [], devices: devices || [] },
      };
    }

    case 'cable_schedule': {
      const { data: cables } = await db
        .from('network_cable_runs')
        .select('*')
        .eq('network_project_id', networkProjectId)
        .order('cable_id', { ascending: true });

      const totalCables = cables?.length || 0;
      const testedCount = cables?.filter((c: any) => c.tested).length || 0;
      const passedCount = cables?.filter((c: any) => c.test_result === 'pass').length || 0;
      const totalLength = cables?.reduce((sum: number, c: any) => sum + (c.length_ft || 0), 0) || 0;

      return {
        title: 'Cable Schedule',
        data: {
          cables: cables || [],
          summary: { totalCables, testedCount, passedCount, totalLength },
        },
      };
    }

    case 'port_map': {
      const { data: devices } = await db
        .from('network_devices')
        .select('*')
        .eq('network_project_id', networkProjectId)
        .order('name', { ascending: true });

      const deviceIds = (devices || []).map((d: any) => d.id);
      let ports: any[] = [];
      if (deviceIds.length > 0) {
        const { data: portData } = await db
          .from('network_port_assignments')
          .select('*')
          .in('device_id', deviceIds)
          .order('port_number', { ascending: true });
        ports = portData || [];
      }

      // Group ports by device
      const portsByDevice: Record<string, any[]> = {};
      for (const port of ports) {
        if (!portsByDevice[port.device_id]) portsByDevice[port.device_id] = [];
        portsByDevice[port.device_id].push(port);
      }

      const devicePortMap = (devices || []).map((d: any) => ({
        ...d,
        ports: portsByDevice[d.id] || [],
        used_ports: (portsByDevice[d.id] || []).filter((p: any) => p.status === 'in_use').length,
      }));

      return {
        title: 'Port Map',
        data: { devices: devicePortMap },
      };
    }

    case 'executive_summary': {
      const [vlansRes, devicesRes, cablesRes, firewallRes, wifiRes] = await Promise.all([
        db.from('network_vlans').select('*').eq('network_project_id', networkProjectId),
        db.from('network_devices').select('*').eq('network_project_id', networkProjectId),
        db.from('network_cable_runs').select('*').eq('network_project_id', networkProjectId),
        db.from('network_firewall_rules').select('*').eq('network_project_id', networkProjectId),
        db.from('network_wifi_networks').select('*').eq('network_project_id', networkProjectId),
      ]);

      const devices = devicesRes.data || [];
      const cables = cablesRes.data || [];

      // Device breakdown by type
      const deviceBreakdown: Record<string, number> = {};
      for (const d of devices) {
        deviceBreakdown[d.device_type] = (deviceBreakdown[d.device_type] || 0) + 1;
      }

      return {
        title: 'Executive Summary',
        data: {
          totals: {
            vlans: vlansRes.data?.length || 0,
            devices: devices.length,
            cables: cables.length,
            firewall_rules: firewallRes.data?.length || 0,
            wifi_networks: wifiRes.data?.length || 0,
          },
          device_breakdown: deviceBreakdown,
          cable_summary: {
            total: cables.length,
            tested: cables.filter((c: any) => c.tested).length,
            passed: cables.filter((c: any) => c.test_result === 'pass').length,
            total_length_ft: cables.reduce((s: number, c: any) => s + (c.length_ft || 0), 0),
          },
          vlans: (vlansRes.data || []).map((v: any) => ({
            vlan_id: v.vlan_id,
            name: v.name,
            subnet: v.subnet,
            purpose: v.purpose,
          })),
        },
      };
    }

    default:
      return { title: reportType, data: {} };
  }
}

/**
 * POST /api/network/reports
 * Generate a report — accepts report_type, queries relevant tables,
 * builds data payload, saves to network_reports.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { network_project_id, report_type } = body;

    if (!network_project_id) return badRequest('network_project_id is required');

    const validTypes = ['ip_schedule', 'cable_schedule', 'port_map', 'executive_summary'];
    if (!report_type || !validTypes.includes(report_type)) {
      return badRequest(`report_type must be one of: ${validTypes.join(', ')}`);
    }

    const db = createServerClient();

    // Verify project belongs to tenant
    const { data: project } = await db
      .from('network_projects')
      .select('id, name')
      .eq('id', network_project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    // Build the report data
    const { title, data: reportData } = await buildReportData(db, network_project_id, report_type);

    // Save to network_reports
    const { data: saved, error: saveErr } = await db
      .from('network_reports')
      .insert({
        tenant_id: user.tenantId,
        network_project_id,
        report_type,
        title: `${title} — ${project.name}`,
        data: reportData,
        generated_by: user.id,
      })
      .select()
      .single();

    if (saveErr) throw saveErr;

    return ok(saved, 201);
  } catch (err) {
    return serverError(err);
  }
}
