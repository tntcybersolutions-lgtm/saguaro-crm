import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const SYSTEM_PROMPT = `You are a senior low-voltage / IT network engineer with 20+ years designing structured cabling systems, enterprise networks, and building automation for commercial construction projects.

Given the site details, produce a COMPLETE network infrastructure design. Return ONLY raw JSON — no markdown, no backticks, no explanation. Start with { end with }.

{
  "vlans": [
    { "vlan_id": 10, "name": "Data", "subnet": "10.10.10.0/24", "gateway": "10.10.10.1", "purpose": "Workstations and PCs", "description": "Primary data VLAN for end-user devices" }
  ],
  "devices": [
    { "name": "Core-SW-01", "device_type": "switch", "manufacturer": "Cisco", "model": "C9300-48P", "port_count": 48, "poe_capable": true, "managed": true, "location": "MDF", "ip_address": "10.10.1.2", "quantity": 1 }
  ],
  "firewall_rules": [
    { "rule_number": 100, "name": "Allow Data to Internet", "action": "allow", "direction": "outbound", "protocol": "any", "source_ip": "10.10.10.0/24", "destination_ip": "any", "destination_port": "any", "description": "Data VLAN internet access" }
  ],
  "wifi_networks": [
    { "ssid": "CorpWiFi", "security_type": "WPA3-Enterprise", "vlan_name": "Wireless", "band": "2.4/5GHz", "hidden": false, "guest_network": false, "description": "Employee wireless" }
  ],
  "ip_plan": {
    "summary": "10.10.0.0/16 campus, /24 per VLAN",
    "management_subnet": "10.10.1.0/24",
    "allocations": [
      { "vlan_name": "Data", "subnet": "10.10.10.0/24", "usable_hosts": 254, "reserved_range": "10.10.10.1-10.10.10.10" }
    ]
  },
  "cable_estimate": [
    { "cable_type": "Cat6A", "category": "Cat6A", "estimated_runs": 120, "avg_length_ft": 150, "from_area": "MDF", "to_area": "Office Floor 1", "purpose": "Workstation drops" }
  ],
  "mdf_idf_plan": [
    { "name": "MDF", "location": "Server Room Floor 1", "devices": ["Core-SW-01", "FW-01", "UPS-01"], "rack_units_needed": 12 }
  ],
  "recommendations": ["Use Cat6A for future 10G capability", "Dedicated VLAN for IoT/BAS devices", "Redundant uplinks between MDF and IDFs"],
  "bill_of_materials": [
    { "item": "Cisco C9300-48P", "quantity": 2, "unit_cost": 8500, "total_cost": 17000, "category": "Switching" }
  ],
  "total_estimated_cost": 85000
}`;

function extractJson(raw: string): any {
  // Strip markdown fences
  let cleaned = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/im, '').trim();

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Remove trailing commas
  cleaned = cleaned.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Extract first JSON object
  const start = cleaned.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;

  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }

  if (end < 0) {
    // Attempt repair: close unclosed braces
    let repaired = cleaned.slice(start);
    repaired = repaired.replace(/,\s*$/, '');
    let d = 0;
    let iS = false;
    let e = false;
    for (const ch of repaired) {
      if (e) { e = false; continue; }
      if (ch === '\\' && iS) { e = true; continue; }
      if (ch === '"') { iS = !iS; continue; }
      if (iS) continue;
      if (ch === '{' || ch === '[') d++;
      if (ch === '}' || ch === ']') d--;
    }
    if (iS) repaired += '"';
    while (d > 0) { repaired += '}'; d--; }
    try { return JSON.parse(repaired); } catch { return null; }
  }

  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

/**
 * POST /api/ai/network-wizard (SSE streaming)
 * Takes network project details, streams back a full network design,
 * saves results to respective tables.
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const supabase = createServerClient();

  let userId: string | null = null;
  let tenantId: string | null = null;

  try {
    const user = await getUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    userId = user.id;
    tenantId = user.tenantId;
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    network_project_id, site_type, square_footage, workstation_count,
    floor_count, building_count, has_wifi, has_voip, has_cameras,
    has_building_automation, has_av_systems, server_room, budget_range,
    special_requirements,
  } = body;

  if (!network_project_id) {
    return new Response(JSON.stringify({ error: 'network_project_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const _userId = userId;
  const _tenantId = tenantId;

  const stream = new ReadableStream({
    async start(controller) {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`));
        } catch { /* closed */ }
      };

      const startHeartbeat = (message: string, pct: number, step: number) => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => send('progress', { step, message, pct }), 4000);
      };

      const stopHeartbeat = () => {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      };

      const done = () => {
        stopHeartbeat();
        send('done', {});
        try { controller.close(); } catch { /* closed */ }
      };

      try {
        // 1. Verify project
        send('progress', { step: 1, message: 'Validating network project...', pct: 5 });

        const { data: netProject } = await supabase
          .from('network_projects')
          .select('id, name, project_id')
          .eq('id', network_project_id)
          .eq('tenant_id', _tenantId)
          .single();

        if (!netProject) {
          send('error', { message: 'Network project not found' });
          return done();
        }

        // 2. Build user prompt
        send('progress', { step: 2, message: 'Preparing AI request...', pct: 10 });

        const userPrompt = `Design a complete low-voltage / IT network infrastructure for:

Site Type: ${site_type || 'commercial office'}
Square Footage: ${square_footage || 'Unknown'} SF
Workstation Count: ${workstation_count || 'Unknown'}
Floors: ${floor_count || 1}
Buildings: ${building_count || 1}
WiFi Required: ${has_wifi !== false ? 'Yes' : 'No'}
VoIP Phone System: ${has_voip ? 'Yes' : 'No'}
Security Cameras (IP): ${has_cameras ? 'Yes' : 'No'}
Building Automation (BAS/BMS): ${has_building_automation ? 'Yes' : 'No'}
AV Systems: ${has_av_systems ? 'Yes' : 'No'}
Server Room / On-prem servers: ${server_room ? 'Yes' : 'No'}
Budget Range: ${budget_range || 'Standard commercial'}
${special_requirements ? `Special Requirements: ${special_requirements}` : ''}

Requirements:
- Design VLANs for proper network segmentation (data, voice, cameras, IoT, guest, management)
- Recommend specific device models with quantities
- Create firewall rules for inter-VLAN and external access
- Design WiFi SSIDs mapped to appropriate VLANs
- Provide full IP addressing plan
- Estimate cable runs by area
- Include MDF/IDF closet planning
- Provide bill of materials with estimated costs`;

        // 3. Call Claude with streaming
        send('progress', { step: 3, message: 'AI is designing your network...', pct: 15 });

        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY to environment.' });
          return done();
        }

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        startHeartbeat('AI is designing your network...', 20, 3);

        let accumulated = '';
        const claudeStream = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          stream: true,
        });

        let lastHeartbeatMs = Date.now();
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            accumulated += event.delta.text;
            const now = Date.now();
            if (now - lastHeartbeatMs > 4000) {
              const pct = Math.min(70, 15 + Math.floor((accumulated.length / 12000) * 55));
              send('progress', { step: 3, message: `AI designing network... (${accumulated.length} chars)`, pct });
              lastHeartbeatMs = now;
            }
          }
        }
        stopHeartbeat();

        send('progress', { step: 4, message: 'Processing AI results...', pct: 75 });

        // 4. Parse response
        const parsed = extractJson(accumulated);
        if (!parsed) {
          send('error', { message: 'AI returned an unexpected format. Please try again.' });
          return done();
        }

        send('progress', { step: 5, message: 'Saving to database...', pct: 80 });

        // 5. Save VLANs
        if (parsed.vlans && Array.isArray(parsed.vlans)) {
          const vlanRows = parsed.vlans.map((v: any) => ({
            network_project_id,
            tenant_id: _tenantId,
            vlan_id: v.vlan_id,
            name: v.name,
            subnet: v.subnet || null,
            gateway: v.gateway || null,
            purpose: v.purpose || '',
            description: v.description || '',
          }));
          const { error: vErr } = await supabase.from('network_vlans').insert(vlanRows);
          if (vErr) console.error('[network-wizard] vlans insert error:', vErr.message);
        }

        // 6. Save Devices
        if (parsed.devices && Array.isArray(parsed.devices)) {
          const deviceRows: any[] = [];
          for (const d of parsed.devices) {
            const qty = d.quantity || 1;
            for (let i = 0; i < qty; i++) {
              deviceRows.push({
                network_project_id,
                tenant_id: _tenantId,
                hostname: qty > 1 ? `${d.name}-${String(i + 1).padStart(2, '0')}` : d.name,
                device_type: d.device_type || 'switch',
                manufacturer: d.manufacturer || '',
                model: d.model || '',
                ip_address: d.ip_address || null,
                port_count: d.port_count || 0,
                poe: d.poe_capable ?? false,
                managed: d.managed ?? true,
                location: d.location || '',
                status: 'planned',
              });
            }
          }
          if (deviceRows.length > 0) {
            const { error: dErr } = await supabase.from('network_devices').insert(deviceRows);
            if (dErr) console.error('[network-wizard] devices insert error:', dErr.message);
          }
        }

        send('progress', { step: 5, message: 'Saving firewall rules...', pct: 85 });

        // 7. Save Firewall Rules
        if (parsed.firewall_rules && Array.isArray(parsed.firewall_rules)) {
          const fwRows = parsed.firewall_rules.map((r: any) => ({
            network_project_id,
            tenant_id: _tenantId,
            rule_number: r.rule_number,
            name: r.name || `Rule ${r.rule_number}`,
            action: r.action || 'allow',
            direction: r.direction || 'outbound',
            protocol: r.protocol || 'any',
            source_ip: r.source_ip || 'any',
            source_port: r.source_port || 'any',
            destination_ip: r.destination_ip || 'any',
            destination_port: r.destination_port || 'any',
            description: r.description || '',
            enabled: true,
          }));
          const { error: fErr } = await supabase.from('firewall_rules').insert(fwRows);
          if (fErr) console.error('[network-wizard] firewall insert error:', fErr.message);
        }

        // 8. Save WiFi Networks
        if (parsed.wifi_networks && Array.isArray(parsed.wifi_networks)) {
          const wifiRows = parsed.wifi_networks.map((w: any) => ({
            network_project_id,
            tenant_id: _tenantId,
            ssid: w.ssid,
            security_type: w.security_type || 'WPA3-Enterprise',
            band: w.band || '2.4/5GHz',
            hidden: w.hidden ?? false,
            guest_network: w.guest_network ?? false,
            description: w.description || '',
            enabled: true,
          }));
          const { error: wErr } = await supabase.from('wifi_networks').insert(wifiRows);
          if (wErr) console.error('[network-wizard] wifi insert error:', wErr.message);
        }

        send('progress', { step: 5, message: 'Saving cable estimates...', pct: 90 });

        // 9. Save Cable Estimates
        if (parsed.cable_estimate && Array.isArray(parsed.cable_estimate)) {
          const cableRows = parsed.cable_estimate.map((c: any, idx: number) => ({
            network_project_id,
            tenant_id: _tenantId,
            cable_id: `EST-${String(idx + 1).padStart(3, '0')}`,
            cable_type: c.cable_type || 'Cat6A',
            category: c.category || 'Cat6A',
            from_location: c.from_area || '',
            to_location: c.to_area || '',
            length_ft: c.avg_length_ft || 0,
            notes: `Estimated ${c.estimated_runs || 0} runs — ${c.purpose || ''}`,
            status: 'planned',
          }));
          const { error: cErr } = await supabase.from('cable_runs').insert(cableRows);
          if (cErr) console.error('[network-wizard] cables insert error:', cErr.message);
        }

        send('progress', { step: 6, message: 'Complete!', pct: 100 });

        // 10. Send result
        send('result', {
          network_project_id,
          design: parsed,
          saved: true,
          summary: {
            vlans_created: parsed.vlans?.length || 0,
            devices_created: parsed.devices?.reduce((s: number, d: any) => s + (d.quantity || 1), 0) || 0,
            firewall_rules_created: parsed.firewall_rules?.length || 0,
            wifi_networks_created: parsed.wifi_networks?.length || 0,
            cable_estimates_created: parsed.cable_estimate?.length || 0,
            estimated_cost: parsed.total_estimated_cost || 0,
          },
        });

        done();
      } catch (err: unknown) {
        stopHeartbeat();
        const message = err instanceof Error ? err.message : 'Network wizard failed. Please try again.';
        console.error('[network-wizard]', err);
        send('error', { message });
        done();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
