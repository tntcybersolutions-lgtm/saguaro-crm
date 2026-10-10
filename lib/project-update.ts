/**
 * project-update — which columns a generic project edit may write.
 *
 * PUT /api/projects/[projectId] used to carry a list called
 * ALLOWED_PROJECT_COLUMNS that was really every column on the table: it let a
 * request set tenant_id-adjacent ownership (created_by, assigned_to,
 * customer_id), the soft-delete and archive markers (deleted_at, is_deleted,
 * archived_at), the audit trail (updated_by, created_by_name) and every
 * system rollup (billed_to_date, total_paid, rfi_count, health_score). Any
 * signed-in editor could un-delete a job, re-attribute who created it, or type
 * a billed-to-date figure that the pay-app flow would then disagree with.
 *
 * This is the explicit list instead. A key is here only when it is a fact a GC
 * types about the job: what it is, where it is, who is on it (free-text
 * directory slots), the contract terms and the dates. Everything else either
 * belongs to a dedicated route that validates it, or is written by the system.
 *
 * Deliberately NOT editable here, and where each one is changed instead:
 *   id, tenant_id, created_at, created_by, created_by_name   never
 *   customer_id, assigned_to(_name), project_lead(_name)      PATCH /api/projects/[id] (customerId / assignedTo)
 *   deleted_at, deleted_by, is_deleted                        never from the app
 *   is_archived, archived_at, archived_by                     DELETE /api/projects/[id]
 *   status, closeout_date                                     /api/projects/[id]/close
 *   phase                                                     PUT /api/projects/[id]/phase
 *   rollout_stage                                             /api/franchise/pipeline
 *   updated_at, updated_by(_name)                             set by the server on every write
 *   rollups and counters (billed_to_date, total_*, *_count,
 *   last_*_at, revised_contract_value, net_change_by_co, …)   computed from pay apps, COs, logs
 *   metadata, custom_fields, source, external_id,
 *   integration_source, is_template, template_name,
 *   setup_*                                                   system / integration state
 *
 * Every column below was checked against information_schema.columns for
 * public.projects on 2026-10-10.
 */

export const EDITABLE_PROJECT_COLUMNS = [
  // What the job is
  'name', 'project_number', 'description', 'scope_of_work', 'notes', 'internal_notes',
  'type', 'project_type', 'building_type', 'occupancy_type', 'construction_type',
  'divisions', 'tags', 'color', 'logo_url', 'cover_photo_url', 'percent_complete',

  // Where it is
  'address', 'city', 'county', 'state', 'zip', 'state_jurisdiction',
  'latitude', 'longitude', 'geofence_lat', 'geofence_lng', 'geofence_radius_meters',
  'parcel_number', 'legal_description', 'zoning',
  'sq_footage', 'square_footage', 'num_floors', 'num_units',
  'is_public_project', 'public_project',

  // Who is on it — free-text directory slots, not user links
  'owner_name', 'owner_email', 'owner_phone', 'owner_entity', 'owner_address',
  'architect', 'architect_name', 'architect_email', 'architect_phone', 'architect_contact',
  'architect_entity', 'architect_firm', 'architect_license',
  'engineer_name', 'engineer_email', 'engineer_phone', 'engineer_entity',
  'inspector_name', 'inspector_email', 'inspector_phone',
  'gc_name', 'gc_email', 'gc_phone', 'gc_entity', 'gc_address',
  'gc_license', 'gc_license_number', 'gc_license_expiry', 'gc_insurance_expiry',
  'sub_name', 'sub_email', 'sub_phone', 'sub_entity', 'sub_address', 'sub_license',
  'project_manager', 'superintendent', 'foreman',
  'pm_name', 'pm_email', 'pm_phone',
  'super_name', 'super_email', 'super_phone',
  'foreman_name', 'foreman_email', 'foreman_phone',

  // Contract terms
  'contract_type', 'contract_value', 'contract_amount', 'contract_sum',
  'original_contract', 'original_contract_value', 'original_contract_amount', 'total_contract_amount',
  'retainage_pct', 'retainage_percent', 'mobilization_pct', 'stored_materials_allowed',
  'liquidated_damages', 'liquidated_damages_per',
  'bonded', 'bond_amount', 'performance_bond_required', 'payment_bond_required', 'insurance_required',
  'prevailing_wage', 'certified_payroll_required', 'davis_bacon_wage_decision',
  'osha_required', 'leed_required', 'leed_level',
  'estimated_cost', 'contingency', 'overhead_pct', 'profit_pct', 'tax_pct', 'insurance_pct', 'bond_pct',
  'bid_number', 'aia_project_number', 'federal_project_number',
  'permit_number', 'permit_expiry',

  // Dates
  'bid_date', 'bid_due_date', 'award_date', 'contract_date', 'contract_execution_date',
  'notice_to_proceed', 'notice_to_proceed_date', 'ntp_date',
  'start_date', 'end_date', 'projected_start_date', 'projected_end_date',
  'actual_start_date', 'actual_end_date', 'groundbreaking_date',
  'substantial_completion', 'substantial_completion_date', 'substantial_date',
  'final_completion', 'final_completion_date', 'estimated_completion', 'target_finish_date',
  'revised_completion_date', 'occupancy_date', 'owner_occupancy_date',
  'punch_list_due_date', 'punch_list_complete_date', 'warranty_expiry_date',
  'lien_deadline_date', 'retention_release_date',

  // Working hours
  'work_hours_start', 'work_hours_end', 'work_days',
] as const;

export type EditableProjectColumn = (typeof EDITABLE_PROJECT_COLUMNS)[number];

const EDITABLE = new Set<string>(EDITABLE_PROJECT_COLUMNS);

export function isEditableProjectColumn(key: string): key is EditableProjectColumn {
  return EDITABLE.has(key);
}

export type ProjectUpdatePick = {
  /** Only allowlisted keys whose value was not `undefined`. */
  updates: Partial<Record<EditableProjectColumn, unknown>>;
  /** Keys the request sent that this route will not write, in request order. */
  ignored: string[];
};

/**
 * Split a request body into the columns this route may write and the keys it
 * drops. Never throws; a non-object body yields nothing to write.
 */
export function pickProjectUpdate(body: unknown): ProjectUpdatePick {
  const updates: Partial<Record<EditableProjectColumn, unknown>> = {};
  const ignored: string[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { updates, ignored };
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (isEditableProjectColumn(key)) {
      if (value !== undefined) updates[key] = value;
    } else {
      ignored.push(key);
    }
  }
  return { updates, ignored };
}
