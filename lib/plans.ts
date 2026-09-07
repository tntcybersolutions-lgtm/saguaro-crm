/**
 * lib/plans.ts — THE canonical source for marketing tiers, pricing, and
 * feature matrices.
 *
 * Owner mandate: every marketing page that talks about plan comparisons or
 * what each level of the platform offers MUST render from this file so the
 * numbers can never drift between pages.
 *
 * Rendered by:
 *   - app/pricing/page.tsx   (cards, add-ons, services, full feature matrix)
 *   - app/page.tsx           (homepage compact pricing cards + price labels)
 *   - app/compare/page.tsx   (starting-price references)
 *
 * TRUTH NOTES (do not re-invent):
 *   - Prices here mirror app/pricing/page.tsx, the designated source of truth.
 *   - Saguaro Radio: BASE RADIO IS FREE ON EVERY PLAN. Only the
 *     'radio_streaming' live-streaming add-on is paid (see lib/addons.ts).
 *   - Trial length is TRIAL_DAYS (30) everywhere — never hardcode "14 days".
 *
 * Pure data — safe to import from client AND server components.
 */

/** Free-trial length in days — the one number every page must quote. */
export const TRIAL_DAYS = 30;

/** Sales contact used by Enterprise + add-on CTAs. */
export const SALES_EMAIL = 'sales@saguarocontrol.net';

export interface Plan {
  name: 'Starter' | 'Professional' | 'Enterprise';
  /** Monthly price in USD. 0 means "Call for Quote". */
  priceMo: number;
  /** Effective monthly price on annual billing. 0 means custom. */
  priceYr: number;
  tagline: string;
  popular: boolean;
  cta: string;
  ctaHref: string;
  highlight: string;
  /** Short one-liner for compact cards (homepage). */
  blurb: string;
  /** Full included-feature list (pricing page cards). */
  features: string[];
  /** Explicitly not included (pricing page cards). */
  notIncluded: string[];
  /** Compact feature list for small cards (homepage). Subset of `features`. */
  cardFeatures: string[];
}

export const PLANS: Plan[] = [
  {
    name: 'Starter',
    priceMo: 499,
    priceYr: 449,
    tagline: 'For small GCs getting off spreadsheets',
    popular: false,
    cta: 'Start Free Trial',
    ctaHref: '/signup',
    highlight: 'Best for 1–5 person teams',
    blurb: 'Perfect for small GCs getting started',
    features: [
      'Unlimited users — no per-seat fees',
      'Up to 15 active projects',
      'Saguaro Radio — base radio included free',
      'AI Takeoff — Takeoff Studio included',
      'Pay Applications G702/G703',
      'Lien Waivers — all 50 states',
      'Basic RFI & Change Orders',
      'Mobile Field App (Saguaro Control Systems — Construction Management & Project Controls)',
      'Free migration from any platform',
      'Email support (48hr response)',
    ],
    notIncluded: [
      'Certified Payroll WH-347',
      'ACORD 25 Insurance Tracker',
      'Owner & Sub Portals',
      'Bid Intelligence',
      'White Label',
      'API Integrations',
    ],
    cardFeatures: [
      'Unlimited users — no per-seat fees',
      'Up to 15 active projects',
      'AI Takeoff — Takeoff Studio included',
      'Saguaro Radio — base radio free',
      'Pay apps G702/G703 & lien waivers',
      'Mobile field app',
      'Email support',
    ],
  },
  {
    name: 'Professional',
    priceMo: 750,
    priceYr: 650,
    tagline: 'For growing GCs managing multiple projects',
    popular: true,
    cta: 'Start Free Trial',
    ctaHref: '/signup',
    highlight: 'Best for 5–50 person teams',
    blurb: 'For growing contractors who need it all',
    features: [
      'Unlimited active projects',
      'Unlimited users',
      'Saguaro Radio — base radio included free',
      'AI Takeoff — Takeoff Studio included',
      'All AIA Documents (G702–G706, A310, A312)',
      'All 4 Lien Waiver types — all 50 states',
      'Certified Payroll WH-347 + DOL wage lookup',
      'ACORD 25 Insurance Tracker + COI Parser',
      'OSHA 300 Log',
      'Preliminary Notices AZ/CA/TX',
      'Owner & Sub Portals',
      'Autopilot RFI/CO automation',
      'Bid Intelligence + Jacket Generator',
      'Free migration from any platform',
      'Priority chat + email support (4hr response)',
    ],
    notIncluded: [
      'White Label your brand/domain',
      'Custom API integrations',
      'SAML SSO',
      'Dedicated account manager',
    ],
    cardFeatures: [
      'Unlimited users & unlimited projects',
      'All AIA Documents (G702–G706, A310, A312)',
      'Certified Payroll WH-347',
      'ACORD 25 Insurance Tracker + COI Parser',
      'Owner & Sub Portals',
      'Bid Intelligence + Jacket Generator',
      'Autopilot RFI/CO automation',
      'Priority support (4hr response)',
    ],
  },
  {
    name: 'Enterprise',
    priceMo: 0,
    priceYr: 0,
    tagline: 'For ENR 400 firms, large GCs & resellers',
    popular: false,
    cta: 'Contact Sales',
    ctaHref: `mailto:${SALES_EMAIL}`,
    highlight: 'Custom pricing for 50+ person firms',
    blurb: 'For large firms with custom needs',
    features: [
      'Everything in Professional',
      'White Label your brand/domain',
      'Unlimited sandbox accounts',
      'Custom API integrations',
      'QuickBooks sync',
      'Dedicated account manager',
      'SLA — 99.9% uptime guarantee',
      'Custom contract & invoicing',
      'SAML SSO',
      'Custom onboarding + training',
      'Free migration — we handle everything',
      'Phone support + 1hr response SLA',
    ],
    notIncluded: [],
    cardFeatures: [
      'Everything in Professional',
      'White Label your brand/domain',
      'Custom API integrations',
      'QuickBooks sync',
      'SAML SSO',
      'Dedicated account manager',
      'SLA — 99.9% uptime guarantee',
    ],
  },
];

export const STARTER = PLANS[0];
export const PROFESSIONAL = PLANS[1];
export const ENTERPRISE = PLANS[2];

/** "$499" — lowest paid monthly price, formatted. */
export const STARTING_PRICE = `$${STARTER.priceMo}`;
/** "$499/mo" */
export const STARTING_PRICE_MO = `${STARTING_PRICE}/mo`;
/** "$499/mo flat" — the homepage comparison-table label. */
export const STARTING_PRICE_FLAT = `${STARTING_PRICE_MO} flat`;
/** "$499–$750/mo" — full paid range for competitor tables. */
export const PRICE_RANGE = `$${STARTER.priceMo}–$${PROFESSIONAL.priceMo}/mo`;
/** Biggest yearly saving across plans, e.g. 1200. */
export const MAX_ANNUAL_SAVINGS = Math.max(
  ...PLANS.filter(p => p.priceMo > 0).map(p => (p.priceMo - p.priceYr) * 12),
);

/**
 * Saguaro Radio tier truth: the base radio is FREE for every tenant on every
 * plan. Only live streaming ('radio_streaming' in lib/addons.ts) is a paid
 * add-on. Any page that says otherwise is wrong.
 */
export const RADIO_BASE_LINE = 'Saguaro Radio — base radio included free';
export const RADIO_STREAMING_ADDON_NAME = 'Saguaro Radio — Live Streaming';

export interface PlanAddon {
  name: string;
  price: string;
  per?: string;
  service?: boolean;
  description: string;
  available: string;
  mailSubject: string;
}

/** Marketing add-on catalog (pricing page). App-side keys live in lib/addons.ts. */
export const PLAN_ADDONS: PlanAddon[] = [
  {
    name: RADIO_STREAMING_ADDON_NAME,
    price: 'Contact us',
    description: 'Ultra-low-latency live voice for your crews — full-duplex channels instead of store-and-forward clips. Base radio is included free on every plan.',
    available: 'All plans',
    mailSubject: 'Saguaro Radio Live Streaming add-on',
  },
  {
    name: 'QuickBooks Sync',
    price: '$99', per: '/mo',
    description: 'Bidirectional sync of budgets, pay apps, and change orders with QuickBooks.',
    available: 'Starter, Professional — included in Enterprise',
    mailSubject: 'QuickBooks Sync add-on',
  },
  {
    name: 'API Access',
    price: '$149', per: '/mo',
    description: 'Full REST API + webhooks. Build custom integrations with your tech stack.',
    available: 'Starter, Professional — included in Enterprise',
    mailSubject: 'API Access add-on',
  },
  {
    name: 'White Label',
    price: '$299', per: '/mo',
    description: 'Your own brand, logo, and custom domain — on the platform and on every PDF it generates.',
    available: 'Starter, Professional — included in Enterprise',
    mailSubject: 'White Label add-on',
  },
  {
    name: 'Priority Support',
    price: '$300', per: '/mo', service: true,
    description: 'Live chat + email with 4hr response. Dedicated support agent for your account.',
    available: 'Starter — included in Professional and Enterprise',
    mailSubject: 'Priority Support add-on',
  },
  {
    name: 'Dedicated CSM',
    price: '$299', per: '/mo', service: true,
    description: 'Named Customer Success Manager. Phone support, weekly check-ins, 1hr SLA.',
    available: 'Starter, Professional — included in Enterprise',
    mailSubject: 'Dedicated CSM add-on',
  },
];

export interface OneTimeService {
  name: string;
  price: number;
  label: string;
  description: string;
  highlight: boolean;
}

/** One-time professional services (pricing page). */
export const ONE_TIME_SERVICES: OneTimeService[] = [
  {
    name: 'Free Migration',
    price: 0,
    label: 'FREE',
    description: 'We migrate all your projects, contacts, documents, and history from any platform or spreadsheet. Done in 1 business day.',
    highlight: true,
  },
  {
    name: 'Guided Onboarding',
    price: 1200,
    label: '$1,200',
    description: 'Hands-on 3-hour setup session with a Saguaro specialist. Configure your company, import your templates, and train your team.',
    highlight: false,
  },
  {
    name: 'Custom Training',
    price: 299,
    label: '$299/session',
    description: '2-hour live training session for your team. Field app, takeoff, pay apps, or any workflow. Remote or on-site (travel extra).',
    highlight: false,
  },
  {
    name: 'Template Build-Out',
    price: 399,
    label: '$399',
    description: 'We build your custom bid templates, pay app headers, lien waiver forms, and company documents — ready on day one.',
    highlight: false,
  },
];

export interface FeatureMatrixRow {
  label: string;
  starter: boolean | string;
  pro: boolean | string;
  ent: boolean | string;
}

/** Full plan-by-plan feature matrix (pricing page "Everything, side by side"). */
export const FEATURE_MATRIX: FeatureMatrixRow[] = [
  { label: 'Active Projects', starter: '15', pro: 'Unlimited', ent: 'Unlimited' },
  { label: 'Users / Seats', starter: 'Unlimited', pro: 'Unlimited', ent: 'Unlimited' },
  { label: 'Saguaro Radio — base', starter: 'Free', pro: 'Free', ent: 'Free' },
  { label: 'Saguaro Radio — Live Streaming', starter: 'Add-on', pro: 'Add-on', ent: 'Add-on' },
  { label: 'Takeoff Studio — AI takeoff', starter: true, pro: true, ent: true },
  { label: 'Signal Studio', starter: true, pro: true, ent: true },
  { label: 'My Work', starter: true, pro: true, ent: true },
  { label: 'Crews', starter: true, pro: true, ent: true },
  { label: 'T&M Tickets', starter: true, pro: true, ent: true },
  { label: 'Daily Logs', starter: true, pro: true, ent: true },
  { label: 'Documents', starter: true, pro: true, ent: true },
  { label: 'Intelligence', starter: true, pro: true, ent: true },
  { label: 'Pay Applications G702/G703', starter: true, pro: true, ent: true },
  { label: 'Lien Waivers — all 50 states', starter: true, pro: true, ent: true },
  { label: 'RFIs & Change Orders', starter: 'Basic', pro: 'Full', ent: 'Full' },
  { label: 'All AIA Documents (G702–G706, A310, A312)', starter: false, pro: true, ent: true },
  { label: 'All 4 Lien Waiver types', starter: false, pro: true, ent: true },
  { label: 'Certified Payroll WH-347', starter: false, pro: true, ent: true },
  { label: 'ACORD 25 / COI Parser', starter: false, pro: true, ent: true },
  { label: 'Owner & Sub Portals', starter: false, pro: true, ent: true },
  { label: 'Autopilot RFI/CO', starter: false, pro: true, ent: true },
  { label: 'Bid Jackets + Bid Intelligence', starter: false, pro: true, ent: true },
  { label: 'Preliminary Notices AZ/CA/TX', starter: false, pro: true, ent: true },
  { label: 'Free Migration', starter: true, pro: true, ent: true },
  { label: 'White Label', starter: 'Add-on', pro: 'Add-on', ent: true },
  { label: 'API Access', starter: 'Add-on', pro: 'Add-on', ent: true },
  { label: 'QuickBooks Sync', starter: 'Add-on', pro: 'Add-on', ent: true },
  { label: 'SAML SSO', starter: false, pro: false, ent: true },
];
