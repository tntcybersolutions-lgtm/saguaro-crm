/**
 * Project edit allowlist — PUT /api/projects/[projectId].
 * Run: npx -y tsx lib/project-update.sanity.test.ts   (exit 0 = every assertion held)
 */
import { EDITABLE_PROJECT_COLUMNS, isEditableProjectColumn, pickProjectUpdate } from './project-update';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* Never writable through the generic edit — identity, ownership, deletion,
   archive, audit, lifecycle with its own route, and system rollups. */
const FORBIDDEN = [
  'id', 'tenant_id', 'created_at', 'created_by', 'created_by_name',
  'customer_id', 'assigned_to', 'assigned_to_name', 'project_lead', 'project_lead_name',
  'deleted_at', 'deleted_by', 'is_deleted', 'is_archived', 'archived_at', 'archived_by',
  'updated_at', 'updated_by', 'updated_by_name',
  'status', 'phase', 'closeout_date', 'rollout_stage',
  'billed_to_date', 'retainage_held', 'balance_to_finish', 'approved_change_orders',
  'revised_contract_value', 'net_change_by_co', 'approved_co_count', 'scheduled_value',
  'total_earned', 'total_billed', 'total_paid', 'total_retainage', 'total_pending',
  'cost_to_date', 'projected_cost', 'rfi_count', 'change_order_count', 'photo_count',
  'punch_count', 'open_punch_count', 'pay_app_count', 'current_pay_app_number',
  'last_activity_at', 'last_log_at', 'last_photo_at', 'last_rfi_at', 'last_pay_app_at',
  'completeness_score', 'health_score', 'metadata', 'custom_fields', 'source', 'external_id',
  'integration_source', 'is_template', 'template_name', 'setup_complete', 'setup_step', 'setup_dismissed',
];

for (const k of FORBIDDEN) {
  check(`${k} is not editable`, !isEditableProjectColumn(k));
}

// A hostile body: every forbidden key plus one real edit.
const hostile: Record<string, unknown> = { name: 'Renamed job' };
for (const k of FORBIDDEN) hostile[k] = k === 'is_deleted' ? false : 'x';
const picked = pickProjectUpdate(hostile);
check('hostile body keeps the real edit', picked.updates.name === 'Renamed job');
check('hostile body writes exactly one column', Object.keys(picked.updates).length === 1,
  Object.keys(picked.updates).join(','));
check('every forbidden key is reported as ignored', FORBIDDEN.every((k) => picked.ignored.includes(k)),
  FORBIDDEN.filter((k) => !picked.ignored.includes(k)).join(','));

// Unknown and prototype-shaped keys are dropped, never written.
const weird = pickProjectUpdate(JSON.parse('{"__proto__":{"admin":true},"constructor":1,"not_a_column":2}'));
check('only-unknown body writes nothing', Object.keys(weird.updates).length === 0);
check('only-unknown body names all three', weird.ignored.length === 3, weird.ignored.join(','));
check('no prototype pollution', ({} as Record<string, unknown>).admin === undefined);

// Non-object bodies.
for (const [label, b] of [['null', null], ['array', ['name']], ['string', 'name'], ['number', 7]] as const) {
  const r = pickProjectUpdate(b);
  check(`${label} body → nothing`, Object.keys(r.updates).length === 0 && r.ignored.length === 0);
}

// undefined is "not sent"; null is "clear it".
const nulls = pickProjectUpdate({ description: null, notes: undefined });
check('null is kept (clears the field)', 'description' in nulls.updates && nulls.updates.description === null);
check('undefined is not sent', !('notes' in nulls.updates));

/* Every caller's keys survive.
   PUT  — components/project/JobColorPicker.tsx sends { color }.
   PATCH — app/app/projects/[projectId]/team/page.tsx and
   components/projects/ProjectOwnershipCard.tsx use their own structured body
   ({ leadership }, { assignedTo }, { customerId }) parsed in the PATCH
   handler; the leadership slots it writes are directory columns and must stay
   editable here too so the two routes agree. */
const color = pickProjectUpdate({ color: '#C2410C' });
check('JobColorPicker { color } survives', color.updates.color === '#C2410C' && color.ignored.length === 0);

const LEADERSHIP = ['pm_name', 'pm_email', 'super_name', 'super_email', 'foreman_name', 'foreman_email',
  'owner_name', 'owner_email', 'architect_name', 'architect_email'];
for (const k of LEADERSHIP) check(`leadership slot ${k} is editable`, isEditableProjectColumn(k));

/* The user-entered columns POST /api/projects/create writes are the same facts
   a later edit must be able to correct (status/phase/customer_id excluded —
   they have their own routes). */
const CREATE_FORM_COLUMNS = [
  'name', 'address', 'state_jurisdiction', 'project_type', 'contract_value', 'contract_amount',
  'original_contract', 'original_contract_amount', 'description', 'start_date', 'ntp_date',
  'substantial_date', 'final_completion_date', 'owner_name', 'owner_email', 'owner_entity',
  'architect_name', 'architect_email', 'architect_entity', 'retainage_pct', 'contract_type',
  'is_public_project', 'prevailing_wage', 'project_number', 'building_type', 'color',
];
const createBody = Object.fromEntries(CREATE_FORM_COLUMNS.map((k) => [k, 'v']));
const fromCreate = pickProjectUpdate(createBody);
check('every create-form column survives', fromCreate.ignored.length === 0, fromCreate.ignored.join(','));
check('create-form columns all written', Object.keys(fromCreate.updates).length === CREATE_FORM_COLUMNS.length);

// The list itself: no duplicates, nothing forbidden slipped in.
check('allowlist has no duplicates', new Set(EDITABLE_PROJECT_COLUMNS).size === EDITABLE_PROJECT_COLUMNS.length);
check('allowlist contains no forbidden key',
  !EDITABLE_PROJECT_COLUMNS.some((k) => FORBIDDEN.includes(k)),
  EDITABLE_PROJECT_COLUMNS.filter((k) => FORBIDDEN.includes(k)).join(','));

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall project update assertions held');
