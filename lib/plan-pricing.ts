// SAGUARO CRM — Plan Pricing Constants
// Single source of truth for all plan pricing displayed in UI
// These must match the plans table in Supabase (values in dollars, DB stores cents)
// When prices change: update this file AND the DB

export const PLAN_PRICING = {
  silver: {
    name: 'Silver',
    monthly: 399,
    annual: 3990,
    annualMonthly: 332.50,
    annualSavings: 798,
    description: 'For small GC teams getting started',
    features: [
      'Up to 5 active projects',
      'AI Takeoff extraction',
      'Bid packages & jackets',
      'RFIs, Submittals, Change Orders',
      'Daily Logs & Punch List',
      'G702/G703 Pay Applications',
      'Field mobile app',
      'Basic support included',
    ],
    onboarding_days: 7,
    support_response_time: null,
  },
  gold: {
    name: 'Gold',
    monthly: 499,
    annual: 4990,
    annualMonthly: 415.83,
    annualSavings: 998,
    description: 'For growing GC companies',
    features: [
      'Unlimited active projects',
      'Everything in Silver',
      'Sage AI document auto-generation',
      'Subcontractor portal',
      'Owner portal',
      'Advanced reporting & analytics',
      'Basic support included',
      '7-day guided onboarding',
      'Custom branding',
    ],
    onboarding_days: 7,
    support_response_time: null,
  },
  platinum: {
    name: 'Platinum',
    monthly: 799,
    annual: 7998,
    annualMonthly: 666.50,
    annualSavings: 1590,
    description: 'For large GC operations',
    features: [
      'Everything in Gold',
      'Unlimited users',
      'White-label option',
      '7-day guided onboarding',
      'API access',
      'Basic support included',
      'Custom support packages available — contact sales',
    ],
    onboarding_days: 7,
    support_response_time: null,
  },
} as const;

export type PlanSlug = keyof typeof PLAN_PRICING;

export function formatPrice(amount: number | null): string {
  if (!amount) return 'Contact us';
  return `$${amount.toLocaleString()}`;
}

export function getAnnualSavingsLabel(slug: PlanSlug): string {
  const plan = PLAN_PRICING[slug];
  if (!plan.annualSavings) return '';
  return `Save $${plan.annualSavings.toLocaleString()}/year`;
}
