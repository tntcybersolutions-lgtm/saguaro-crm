/**
 * lib/plan-limits.ts
 *
 * Plan enforcement helper — checks project limits, storage limits,
 * user limits based on tenant plan (trial/starter/pro/enterprise).
 *
 * -1 = unlimited for that resource.
 */

export const PLAN_LIMITS = {
  trial:      { projects: 3,  users: 2,  storage_gb: 1  },
  starter:    { projects: 5,  users: -1, storage_gb: 10 },
  silver:     { projects: 5,  users: -1, storage_gb: 10 },
  pro:        { projects: -1, users: -1, storage_gb: 100 },
  gold:       { projects: -1, users: -1, storage_gb: 100 },
  platinum:   { projects: -1, users: -1, storage_gb: -1  },
  enterprise: { projects: -1, users: -1, storage_gb: -1  },
  expired:    { projects: 0,  users: 0,  storage_gb: 0  },
  canceled:   { projects: 0,  users: 0,  storage_gb: 0  },
} as const;

export type PlanResource = 'projects' | 'users' | 'storage_gb';

export function getPlanLimit(plan: string, resource: PlanResource): number {
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.trial;
  return limits[resource];
}

export function isAtLimit(current: number, limit: number): boolean {
  if (limit === -1) return false; // unlimited
  return current >= limit;
}
