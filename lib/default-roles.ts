/**
 * The built-in role templates every tenant gets automatically.
 *
 * White-label by design: these are defined ONCE here and seeded for each new
 * company at signup (app/api/auth/signup), so a role like Salesperson is a
 * coded default that reaches all tenants in their own tenant-isolated section —
 * never hand-inserted per account. The company owner is `profiles.role =
 * 'admin'` (full bypass), so an Admin row is not needed here.
 *
 * Permission categories/levels come from lib/permission-categories.ts
 * (None < View < Edit < Full). An absent category normalises to None.
 */
export interface DefaultRole {
  name: string;
  description: string;
  color: string;
  permissions: Record<string, 'None' | 'View' | 'Edit' | 'Full'>;
}

export const DEFAULT_ROLE_DEFINITIONS: DefaultRole[] = [
  {
    name: 'Project Manager',
    color: '#E8FF2A',
    description: 'Runs the job end to end — full access to every operational module.',
    permissions: { Projects: 'Full', Budget: 'Full', Schedule: 'Full', Safety: 'Full', Documents: 'Full', RFIs: 'Full', Submittals: 'Full', 'Change Orders': 'Full', 'Pay Apps': 'Full', Reports: 'Full', Sales: 'Edit', Admin: 'View' },
  },
  {
    name: 'Superintendent',
    color: '#4ADE80',
    description: 'Runs the field — schedule, safety, daily logs, submittals.',
    permissions: { Projects: 'View', Budget: 'View', Schedule: 'Edit', Safety: 'Edit', Documents: 'Edit', RFIs: 'Edit', Submittals: 'Edit', 'Change Orders': 'View', 'Pay Apps': 'View', Reports: 'View', Sales: 'None', Admin: 'None' },
  },
  {
    name: 'Foreman',
    color: '#FBBF24',
    description: 'Crew lead — field entry for schedule, safety and submittals.',
    permissions: { Projects: 'View', Budget: 'None', Schedule: 'Edit', Safety: 'Edit', Documents: 'View', RFIs: 'View', Submittals: 'View', 'Change Orders': 'None', 'Pay Apps': 'None', Reports: 'View', Sales: 'None', Admin: 'None' },
  },
  {
    name: 'Salesperson',
    color: '#F8FAFC',
    description: 'Chases the work: owns clients and pipeline in full, sees projects, contracts and bid jackets, views job finances — walled off from Admin and the build-comms tools.',
    permissions: { Sales: 'Full', Projects: 'Full', Documents: 'Full', Reports: 'Full', Schedule: 'View', Budget: 'View', 'Pay Apps': 'View', 'Change Orders': 'View', RFIs: 'None', Submittals: 'None', Safety: 'None', Admin: 'None' },
  },
  {
    name: 'Read-Only',
    color: '#94A3B8',
    description: 'Can see everything, change nothing.',
    permissions: { Projects: 'View', Budget: 'View', Schedule: 'View', Safety: 'View', Documents: 'View', RFIs: 'View', Submittals: 'View', 'Change Orders': 'View', 'Pay Apps': 'View', Reports: 'View', Sales: 'View', Admin: 'None' },
  },
  {
    name: 'Subcontractor',
    color: '#CBD5E1',
    description: 'Limited sub access — their own RFIs/submittals, view schedule and pay apps.',
    permissions: { Projects: 'View', Budget: 'None', Schedule: 'View', Safety: 'View', Documents: 'View', RFIs: 'Edit', Submittals: 'Edit', 'Change Orders': 'None', 'Pay Apps': 'View', Reports: 'None', Sales: 'None', Admin: 'None' },
  },
];

/** Rows ready to insert into role_definitions for a freshly created tenant. */
export function defaultRoleRows(tenantId: string) {
  return DEFAULT_ROLE_DEFINITIONS.map((r) => ({
    tenant_id: tenantId,
    name: r.name,
    description: r.description,
    permissions: r.permissions,
    color: r.color,
    is_builtin: true,
  }));
}
