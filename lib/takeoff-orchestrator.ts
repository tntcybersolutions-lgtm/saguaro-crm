// lib/takeoff-orchestrator.ts
// Complete 8-task pipeline that runs after every takeoff completes.
// Populates every connected module automatically.

import { SupabaseClient } from '@supabase/supabase-js';

export interface OrchestrationTask {
  id: string;
  label: string;
  detail: string;
}

export const ORCHESTRATION_TASKS: OrchestrationTask[] = [
  { id: 'validate',       label: 'Validating takeoff data',           detail: 'Checking line items and CSI breakdown quality' },
  { id: 'seed_budget',    label: 'Seeding project budget from takeoff', detail: 'Creating budget line items per CSI division' },
  { id: 'bid_packages',   label: 'Creating bid packages per trade',   detail: 'One package per CSI division with value > $5,000' },
  { id: 'scope_fill',     label: 'Sage AI writing scope of work',     detail: 'Generating professional scope for each package' },
  { id: 'rfis_suggest',   label: 'Suggesting common RFIs by trade',   detail: 'Pre-populating RFI list with typical questions' },
  { id: 'punch_seed',     label: 'Seeding punch list items',          detail: 'Adding typical closeout items by trade' },
  { id: 'sov_build',      label: 'Building Schedule of Values',       detail: 'Creating G703 SOV lines from takeoff breakdown' },
  { id: 'daily_template', label: 'Creating daily log template',       detail: 'Setting up trade roster for daily log pre-fill' },
  { id: 'notify',         label: 'Notifying team members',            detail: 'Sending notifications to project team' },
];

export interface TaskUpdate {
  taskId: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  message: string;
  count?: number;
  error?: string;
}

export interface OrchestrationResult {
  success: boolean;
  tasks: TaskUpdate[];
  stats: {
    bid_packages_created: number;
    scope_filled: number;
    rfis_created: number;
    punch_items_created: number;
    sov_lines_created: number;
    trades_detected: number;
  };
  error?: string;
}

interface CsiDivisionData {
  division: string;
  description: string;
  total_material: number;
  total_labor: number;
  total_equipment: number;
  total_sub: number;
  line_total: number;
  item_count: number;
}

interface TakeoffProject {
  id: string;
  name?: string;
  retainage_pct?: number;
}

export async function runTakeoffOrchestration(
  supabase: SupabaseClient,
  takeoffId: string,
  tenantId: string,
  projectId: string,
  _anthropicApiKey: string,
  onUpdate: (update: TaskUpdate) => Promise<void>,
): Promise<OrchestrationResult> {
  const stats = {
    bid_packages_created: 0,
    scope_filled: 0,
    rfis_created: 0,
    punch_items_created: 0,
    sov_lines_created: 0,
    trades_detected: 0,
  };

  const emit = async (
    taskId: string,
    status: TaskUpdate['status'],
    message: string,
    count?: number,
    error?: string,
  ) => {
    await onUpdate({ taskId, status, message, count, error });
  };

  try {
    // ── TASK 1: VALIDATE ──────────────────────────────────
    await emit('validate', 'running', 'Loading takeoff data...');

    const { data: takeoff, error: takeoffError } = await supabase
      .from('takeoffs')
      .select('id, name, grand_total, total_material, total_labor, page_count, extraction_confidence, csi_breakdown, markup_labor_pct, markup_material_pct, markup_equipment_pct, overhead_pct, profit_pct, project_id')
      .eq('id', takeoffId)
      .eq('tenant_id', tenantId)
      .single();

    if (takeoffError || !takeoff) {
      await emit('validate', 'failed', 'Takeoff not found', undefined, takeoffError?.message);
      throw new Error('Takeoff not found');
    }

    // Load project data separately
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, retainage_pct')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single();

    const { data: lineItems } = await supabase
      .from('takeoff_line_items')
      .select('*')
      .eq('takeoff_id', takeoffId)
      .eq('tenant_id', tenantId)
      .order('csi_division')
      .order('sort_order');

    const breakdown = (takeoff.csi_breakdown || {}) as Record<string, CsiDivisionData>;

    const significantDivisions = Object.entries(breakdown)
      .filter(([, d]) => d.line_total > 5000)
      .sort(([, a], [, b]) => b.line_total - a.line_total);

    stats.trades_detected = significantDivisions.length;

    if (significantDivisions.length === 0) {
      await emit('validate', 'failed', 'No significant divisions found in takeoff');
      throw new Error('Takeoff has no significant divisions');
    }

    await emit('validate', 'complete',
      `${lineItems?.length || 0} items · ${significantDivisions.length} trades · $${Math.round(takeoff.grand_total || 0).toLocaleString()}`,
      significantDivisions.length);

    // ── TASK: SEED BUDGET ─────────────────────────────────
    await emit('seed_budget', 'running',
      `Creating budget line items for ${significantDivisions.length} divisions...`);

    const { data: seededCount } = await supabase.rpc('seed_budget_from_takeoff', {
      p_takeoff_id: takeoffId,
      p_project_id: projectId,
      p_tenant_id: tenantId,
    });

    await emit('seed_budget', 'complete',
      `Budget seeded: ${seededCount || 0} line items created`,
      seededCount || 0);

    // ── TASK 2: CREATE BID PACKAGES ───────────────────────
    await emit('bid_packages', 'running', `Creating ${significantDivisions.length} bid packages...`);

    const createdPkgIds: { id: string; division: string; trade: string }[] = [];

    for (const [div, data] of significantDivisions) {
      const { data: existing } = await supabase
        .from('bid_packages')
        .select('id')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId)
        .eq('csi_division', div)
        .maybeSingle();

      if (existing) {
        createdPkgIds.push({ id: existing.id, division: div, trade: data.description });
        continue;
      }

      const divItems = (lineItems || []).filter((i: { csi_division?: string }) =>
        String(i.csi_division || '').startsWith(div));
      const uniqueCodes = [...new Set(divItems.map((i: { csi_code?: string }) => i.csi_code).filter(Boolean))];

      const { data: pkg, error: pkgErr } = await supabase
        .from('bid_packages')
        .insert({
          project_id:   projectId,
          tenant_id:    tenantId,
          takeoff_id:   takeoffId,
          name:         `${data.description} — Division ${div}`,
          trade:        data.description,
          csi_division: div,
          csi_codes:    uniqueCodes.slice(0, 10),
          estimated_value: Math.round(data.line_total),
          status:       'draft',
          ai_generated: true,
          requires_bond: data.line_total > 150000,
          insurance_required_amount: data.line_total > 500000 ? 2000000 : 1000000,
          bid_due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          bid_validity_days: 60,
          package_number: `BP-${String(stats.bid_packages_created + 1).padStart(3, '0')}`,
        })
        .select('id')
        .single();

      if (!pkgErr && pkg) {
        createdPkgIds.push({ id: pkg.id, division: div, trade: data.description });
        stats.bid_packages_created++;
      }
    }

    await emit('bid_packages', 'complete',
      `${stats.bid_packages_created} packages created`, stats.bid_packages_created);

    // ── TASK 3: SAGE AI SCOPE FILL ────────────────────────
    await emit('scope_fill', 'running', 'Sage AI is writing scope of work for each trade...');

    const scopeBatches: string[][] = [];
    for (let i = 0; i < createdPkgIds.length; i += 4) {
      scopeBatches.push(createdPkgIds.slice(i, i + 4).map(p => p.id));
    }

    for (const batch of scopeBatches) {
      await Promise.allSettled(batch.map(async (pkgId) => {
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const r = await fetch(`${appUrl}/api/bid-packages/${pkgId}/sage-fill`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal': process.env.INTERNAL_API_KEY || 'saguaro-internal',
            },
          });
          if (r.ok) stats.scope_filled++;
        } catch {
          /* non-blocking */
        }
      }));
    }

    await emit('scope_fill', 'complete',
      `Scope generated for ${stats.scope_filled} packages`, stats.scope_filled);

    // ── TASK 4: SUGGEST RFIS ──────────────────────────────
    await emit('rfis_suggest', 'running', 'Generating trade-specific RFI questions...');

    const RFI_TEMPLATES: Record<string, Array<{
      subject: string; question: string; spec_section: string; priority: string;
    }>> = {
      '03': [
        { priority: 'normal', spec_section: '03 30 00',
          subject: 'Concrete mix design — approval required',
          question: 'Please confirm the approved concrete mix design for structural elements per Section 033000. Provide 28-day compressive strength test results from an approved testing laboratory prior to pour.' },
        { priority: 'high', spec_section: '03 20 00',
          subject: 'Rebar lap splice lengths not dimensioned',
          question: 'Structural drawings do not indicate lap splice lengths at column-to-footing connections or slab edge conditions. Please provide lap splice schedule per ACI 318 Table 25.5.2.' },
      ],
      '05': [
        { priority: 'high', spec_section: '05 12 00',
          subject: 'Structural steel connection details missing',
          question: 'Column base plate anchor bolt details are not shown on structural drawings. Please provide fully dimensioned base plate details including bolt diameter, embedment depth, and grout pocket dimensions.' },
        { priority: 'normal', spec_section: '05 05 23',
          subject: 'Bolt specification — ASTM grade confirmation',
          question: 'Drawings reference "high-strength bolts" without specifying ASTM grade. Please confirm whether A325 or A490 bolts are required and specify bearing vs slip-critical condition.' },
      ],
      '22': [
        { priority: 'normal', spec_section: '22 42 00',
          subject: 'Plumbing fixture rough-in dimensions not provided',
          question: 'ADA-compliant rough-in dimensions are not shown for restroom fixtures. Please issue dimensioned rough-in drawings for all fixture types including centerline heights and trap arm locations.' },
        { priority: 'high', spec_section: '22 11 16',
          subject: 'Domestic water service sizing confirmation',
          question: 'The domestic water service is shown as 2" but fixture unit calculations indicate 3" may be required per IFGC Table 604.1. Please confirm service size with supporting calculations.' },
      ],
      '23': [
        { priority: 'high', spec_section: '23 74 13',
          subject: 'RTU equipment schedule — manufacturer data required',
          question: 'Equipment schedule shows units by mark number only. Please provide manufacturer cut sheets, performance data tables, and electrical connection requirements for all specified RTU units.' },
        { priority: 'normal', spec_section: '23 05 93',
          subject: 'TAB requirements — scope clarification',
          question: 'Specification Section 230593 calls for independent TAB contractor but no bid allowance is included. Please confirm whether TAB is included in HVAC scope or if it is owner-direct.' },
      ],
      '26': [
        { priority: 'high', spec_section: '26 24 16',
          subject: 'Panel LP-2 circuit count discrepancy',
          question: 'Panel LP-2 indicates 42 circuits but Panel Schedule lists only 38 breaker positions. Please issue revised panel schedule or confirm correct circuit count.' },
        { priority: 'high', spec_section: '26 05 00',
          subject: 'Service entrance load calculations required',
          question: '2,000A service requires stamped electrical load calculations per NEC Section 220. Calculations must be submitted to AHJ with permit application. Please provide stamped calculations.' },
        { priority: 'normal', spec_section: '26 05 19',
          subject: 'Conduit routing through structural members',
          question: 'Electrical drawings show conduit routes passing through structural members at Grid Lines B and D. Please confirm whether core drilling or sleeve installation is permitted.' },
      ],
      '31': [
        { priority: 'high', spec_section: '31 00 00',
          subject: 'Geotechnical report not provided',
          question: 'Section 310000 references a geotechnical investigation report but it has not been issued. Earthwork quantities and compaction requirements cannot be confirmed. Please provide prior to bid.' },
      ],
      '32': [
        { priority: 'normal', spec_section: '32 12 16',
          subject: 'Paving section schedule not specified',
          question: 'Civil drawings show asphalt paving areas but do not specify the paving section design. Please provide paving section schedule by use type (heavy traffic, standard, pedestrian).' },
      ],
    };

    for (const [div] of significantDivisions) {
      const templates = RFI_TEMPLATES[div];
      if (!templates) continue;

      const { data: lastRfi } = await supabase
        .from('rfis')
        .select('rfi_number')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId)
        .order('rfi_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNum = (lastRfi?.rfi_number || 0) + 1;

      for (const template of templates) {
        const searchTerms = template.subject.split(' ').slice(0, 3).join(' ');
        const { data: existing } = await supabase
          .from('rfis')
          .select('id')
          .eq('project_id', projectId)
          .eq('tenant_id', tenantId)
          .ilike('subject', `%${searchTerms}%`)
          .maybeSingle();

        if (existing) continue;

        const { error } = await supabase.from('rfis').insert({
          project_id:     projectId,
          tenant_id:      tenantId,
          rfi_number:     nextNum++,
          subject:        template.subject,
          question:       template.question,
          spec_section:   template.spec_section,
          status:         'draft',
          priority:       template.priority,
          is_urgent:      template.priority === 'critical',
          days_to_respond: 7,
          ai_suggested:   true,
          ai_suggested_from: 'takeoff',
        });
        if (!error) stats.rfis_created++;
      }
    }

    await emit('rfis_suggest', 'complete',
      `${stats.rfis_created} RFI questions drafted`, stats.rfis_created);

    // ── TASK 5: SEED PUNCH LIST ───────────────────────────
    await emit('punch_seed', 'running', 'Seeding punch list with typical items...');

    const PUNCH_TEMPLATES: Record<string, Array<{
      title: string; description: string; trade: string; priority: string;
    }>> = {
      '09': [
        { priority: 'normal', trade: 'Finishes',
          title: 'Touch up all paint — scuffs, nail holes, and edge cuts',
          description: 'Touch up all painted surfaces with two-coat system matching existing. Spot prime exposed drywall. Touch up all scuffs from construction activity.' },
        { priority: 'normal', trade: 'Flooring',
          title: 'Install all floor transition strips and T-molds',
          description: 'Install all specified transition strips between flooring types. Verify T-molds, reducer strips, and end caps are correctly installed.' },
        { priority: 'high', trade: 'Finishes',
          title: 'Verify acoustical ceiling tile — no damage or staining',
          description: 'Walk entire ceiling grid. Replace any damaged, stained, or misaligned tiles. Ensure all tiles are fully seated and center-scored lines align with grid.' },
      ],
      '26': [
        { priority: 'high', trade: 'Electrical',
          title: 'Test all GFCI and AFCI devices — replace any failures',
          description: 'Test every GFCI outlet with a dedicated GFCI tester. Test every AFCI breaker by pressing the test button. Tag and replace all failed devices.' },
        { priority: 'normal', trade: 'Electrical',
          title: 'Complete all panel directories — laminate and install',
          description: 'Complete typed circuit directory for every electrical panel. Laminate directories and install in panel doors. Verify every circuit is identified correctly.' },
        { priority: 'normal', trade: 'Electrical',
          title: 'Install all cover plates — devices and junction boxes',
          description: 'Install all outlet, switch, and data device cover plates. Verify all junction box covers are installed and accessible for maintenance.' },
      ],
      '22': [
        { priority: 'high', trade: 'Plumbing',
          title: 'Run all fixtures — check for leaks and proper drainage',
          description: 'Run water at every fixture for minimum 5 minutes. Check all supply stops, angle valves, P-traps, and drain connections for leaks.' },
        { priority: 'normal', trade: 'Plumbing',
          title: 'Verify hot water temperature at all fixtures',
          description: 'Test hot water delivery temperature at each fixture. Confirm temperature is within 105-120°F range. Check water heater thermostat operation.' },
      ],
      '23': [
        { priority: 'high', trade: 'HVAC',
          title: 'Provide certified TAB report — all zones',
          description: 'Submit certified Test, Adjust, and Balance report from independent TAB contractor. Report must include all supply and return air measurements versus design.' },
        { priority: 'normal', trade: 'HVAC',
          title: 'Label all thermostats and VAV boxes',
          description: 'Label each thermostat with zone designation matching as-built drawings. Label each VAV box with mark number, design CFM, and zone.' },
        { priority: 'normal', trade: 'HVAC',
          title: 'Provide O&M manuals for all HVAC equipment',
          description: 'Submit complete Operations and Maintenance manual binders for all HVAC equipment. Include manufacturer cut sheets, warranties, and maintenance schedules.' },
      ],
    };

    let punchItemNum = 1;
    for (const [div] of significantDivisions) {
      const templates = PUNCH_TEMPLATES[div];
      if (!templates) continue;
      for (const item of templates) {
        const { error } = await supabase.from('punch_list').insert({
          project_id:   projectId,
          tenant_id:    tenantId,
          item_number:  punchItemNum++,
          title:        item.title,
          description:  item.description,
          trade:        item.trade,
          status:       'open',
          priority:     item.priority,
          ai_suggested: true,
          ai_verified:  false,
          location:     'TBD — assign during walkthrough',
        });
        if (!error) stats.punch_items_created++;
      }
    }

    await emit('punch_seed', 'complete',
      `${stats.punch_items_created} punch items added`, stats.punch_items_created);

    // ── TASK 6: BUILD SOV ─────────────────────────────────
    await emit('sov_build', 'running', 'Building Schedule of Values (G703)...');

    const { data: activePayApp } = await supabase
      .from('pay_applications')
      .select('id')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activePayApp) {
      let sovNum = 1;
      for (const [div, data] of significantDivisions.slice(0, 20)) {
        const { error } = await supabase.from('sov_line_items').insert({
          pay_application_id: activePayApp.id,
          project_id:         projectId,
          tenant_id:          tenantId,
          item_no:            String(sovNum).padStart(2, '0'),
          description:        `Div ${div} — ${data.description}`,
          scheduled_value:    Math.round(data.line_total),
          csi_division:       div,
          sort_order:         sovNum,
        });
        if (!error) stats.sov_lines_created++;
        sovNum++;
      }

      const totalSOV = significantDivisions.reduce((s, [, d]) => s + d.line_total, 0);
      await supabase.from('pay_applications').update({
        contract_sum_to_date: Math.round(totalSOV),
        original_contract_sum: Math.round(totalSOV),
      }).eq('id', activePayApp.id);

      await emit('sov_build', 'complete',
        `${stats.sov_lines_created} SOV lines added to Pay Application`, stats.sov_lines_created);
    } else {
      await emit('sov_build', 'complete', 'SOV ready — will populate when Pay Application is created');
    }

    // ── TASK 7: DAILY LOG TEMPLATE ────────────────────────
    await emit('daily_template', 'running', 'Creating daily log trade template...');

    const tradeRoster = significantDivisions.map(([div, data]) => ({
      division:        div,
      trade:           data.description,
      company:         `${data.description} Contractor`,
      workers:         0,
      hours:           8,
      estimated_value: Math.round(data.line_total),
    }));

    await supabase.from('takeoffs').update({
      trade_roster: tradeRoster,
    }).eq('id', takeoffId).eq('tenant_id', tenantId);

    await emit('daily_template', 'complete',
      `${tradeRoster.length} trades added to daily log template`, tradeRoster.length);

    // ── TASK 8: NOTIFICATIONS ─────────────────────────────
    await emit('notify', 'running', 'Sending notifications...');

    const projectName = (project as TakeoffProject | null)?.name || 'Project';

    await supabase.from('notifications').insert([{
      tenant_id:  tenantId,
      type:       'takeoff_orchestration_complete',
      title:      `Sage AI populated all modules — ${projectName}`,
      body:       `${stats.bid_packages_created} bid packages · ${stats.rfis_created} RFI questions · ${stats.punch_items_created} punch list items · $${Math.round(takeoff.grand_total || 0).toLocaleString()} extracted`,
      link:       `/app/projects/${projectId}/bid-packages`,
      project_id: projectId,
      metadata:   { ...stats, takeoff_id: takeoffId },
    }]);

    await emit('notify', 'complete', 'Team notified');

    return { success: true, tasks: [], stats };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[orchestrator]', msg);
    return { success: false, tasks: [], stats, error: msg };
  }
}
