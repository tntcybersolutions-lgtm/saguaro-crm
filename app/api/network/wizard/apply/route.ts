import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * POST /api/network/wizard/apply
 *
 * Applies an AI-generated network design (the WizardResult produced by
 * /api/ai/network-wizard) to a network project by persisting its parts into
 * the existing network tables. Called by:
 *   app/projects/[projectId]/network/wizard/page.tsx -> applyAll()
 *
 * Request body:
 *   {
 *     network_project_id: string,
 *     result: {
 *       vlans:          [{ vlan_id, name, subnet, gateway, purpose }],
 *       equipment:      [{ type, manufacturer, model, quantity, unit_cost, total_cost }],
 *       ip_scheme:      [{ vlan, subnet, gateway, dhcp_range, reserved }],
 *       firewall_rules: [{ name, action, source, destination, port, protocol }],
 *       wifi_ssids:     [{ ssid, security, vlan, band, purpose }],
 *       cable_estimate: { cat6_runs, cat6a_runs, fiber_runs, total_length_ft, estimated_cost },
 *       total_equipment_cost: number,
 *       summary: string,
 *     }
 *   }
 *
 * This route only performs DATA PERSISTENCE. It does NOT push configuration to
 * any physical/cloud-managed devices (UniFi/Meraki/etc.) — that external action
 * is deferred. Existing VLAN ids in the project are skipped to stay idempotent.
 */

interface WizardResult {
  vlans?: Array<{ vlan_id?: number | string; name?: string; subnet?: string; gateway?: string; purpose?: string }>;
  equipment?: Array<{ type?: string; manufacturer?: string; model?: string; quantity?: number; unit_cost?: number; total_cost?: number }>;
  ip_scheme?: Array<{ vlan?: string; subnet?: string; gateway?: string; dhcp_range?: string; reserved?: string }>;
  firewall_rules?: Array<{ name?: string; action?: string; source?: string; destination?: string; port?: string; protocol?: string }>;
  wifi_ssids?: Array<{ ssid?: string; security?: string; vlan?: string; band?: string; purpose?: string }>;
  cable_estimate?: { cat6_runs?: number; cat6a_runs?: number; fiber_runs?: number; total_length_ft?: number; estimated_cost?: number };
  total_equipment_cost?: number;
  summary?: string;
}

export async function POST(req: NextRequest) {
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json().catch(() => ({}));
    const networkProjectId: string | undefined = body?.network_project_id;
    const result: WizardResult = (body?.result || {}) as WizardResult;

    if (!networkProjectId) {
      return NextResponse.json({ error: 'network_project_id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const tenantId = user.tenantId;

    // Verify the network project belongs to the caller's tenant.
    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', networkProjectId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ error: 'Network project not found' }, { status: 400 });
    }

    const applied = { vlans: 0, devices: 0, firewall_rules: 0, wifi_ssids: 0 };
    const skipped = { vlans: 0 };

    // ---- VLANs ----------------------------------------------------------
    if (Array.isArray(result.vlans) && result.vlans.length) {
      // Skip VLAN ids that already exist in this project (idempotent apply).
      const { data: existingVlans } = await db
        .from('network_vlans')
        .select('vlan_id')
        .eq('network_project_id', networkProjectId)
        .eq('tenant_id', tenantId);
      const existingIds = new Set((existingVlans || []).map((v) => Number(v.vlan_id)));

      const vlanRows = result.vlans
        .map((v) => {
          const vid = Number(v.vlan_id);
          if (!Number.isFinite(vid) || vid < 1 || vid > 4094) return null;
          if (existingIds.has(vid)) {
            skipped.vlans += 1;
            return null;
          }
          existingIds.add(vid);
          return {
            network_project_id: networkProjectId,
            tenant_id: tenantId,
            vlan_id: vid,
            name: v.name || `VLAN ${vid}`,
            subnet: v.subnet || null,
            gateway: v.gateway || null,
            purpose: v.purpose || null,
            description: '',
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (vlanRows.length) {
        const { data, error } = await db.from('network_vlans').insert(vlanRows).select('id');
        if (error) throw error;
        applied.vlans = data?.length || 0;
      }
    }

    // ---- Equipment -> network_devices -----------------------------------
    if (Array.isArray(result.equipment) && result.equipment.length) {
      const deviceRows = result.equipment.map((eq, i) => {
        const type = (eq.type || 'device').toString();
        const qty = Number(eq.quantity) || 1;
        return {
          network_project_id: networkProjectId,
          tenant_id: tenantId,
          device_type: type,
          manufacturer: eq.manufacturer || '',
          model: eq.model || '',
          hostname: `${type}-${i + 1}`,
          status: 'planned',
          notes: JSON.stringify({
            source: 'ai_wizard',
            quantity: qty,
            unit_cost: Number(eq.unit_cost) || 0,
            total_cost: Number(eq.total_cost) || 0,
          }),
        };
      });

      if (deviceRows.length) {
        const { data, error } = await db.from('network_devices').insert(deviceRows).select('id');
        if (error) throw error;
        applied.devices = data?.length || 0;
      }
    }

    // ---- Firewall rules -------------------------------------------------
    if (Array.isArray(result.firewall_rules) && result.firewall_rules.length) {
      const fwRows = result.firewall_rules.map((r, i) => ({
        network_project_id: networkProjectId,
        tenant_id: tenantId,
        rule_number: i + 1,
        name: r.name || `Rule ${i + 1}`,
        action: r.action || 'allow',
        direction: 'inbound',
        source_network: r.source || 'any',
        destination_network: r.destination || 'any',
        destination_port: r.port || 'any',
        protocol: r.protocol || 'tcp',
        enabled: true,
        description: '',
      }));

      const { data, error } = await db.from('firewall_rules').insert(fwRows).select('id');
      if (error) throw error;
      applied.firewall_rules = data?.length || 0;
    }

    // ---- WiFi SSIDs -----------------------------------------------------
    if (Array.isArray(result.wifi_ssids) && result.wifi_ssids.length) {
      // wifi_networks.vlan_id is a uuid FK; the wizard provides a VLAN label
      // string, which we cannot reliably resolve here, so it is preserved in
      // notes and vlan_id is left null.
      const ssidRows = result.wifi_ssids
        .filter((s) => s.ssid)
        .map((s) => ({
          network_project_id: networkProjectId,
          tenant_id: tenantId,
          ssid: s.ssid as string,
          security_type: (s.security || 'wpa3_enterprise').toString().toLowerCase().replace(/[\s-]+/g, '_'),
          band: s.band || 'dual',
          enabled: true,
          notes: JSON.stringify({ source: 'ai_wizard', vlan: s.vlan || '', purpose: s.purpose || '' }),
        }));

      if (ssidRows.length) {
        const { data, error } = await db.from('wifi_networks').insert(ssidRows).select('id');
        if (error) throw error;
        applied.wifi_ssids = data?.length || 0;
      }
    }

    // ---- Persist the full generated design for record-keeping -----------
    await must(db
      .from('network_generated_configs')
      .insert({
        tenant_id: tenantId,
        network_project_id: networkProjectId,
        config_content: JSON.stringify(result),
        variables_used: {},
        applied_by: user.id,
        applied_at: new Date().toISOString(),
        notes: result.summary || 'AI Network Wizard design',
      })
      .select('id')
      .single(), 'network_generated_configs write');

    return NextResponse.json({
      ok: true,
      applied,
      skipped,
      // External device pushes (UniFi/Meraki/etc.) are intentionally not
      // performed by this route — data persistence only.
      external_push: 'deferred',
    });
  } catch (err) {
    return apiError('network/wizard/apply POST', err);
  }
}
