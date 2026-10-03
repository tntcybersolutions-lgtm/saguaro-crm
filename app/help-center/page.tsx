'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const C = {
  dark: 'var(--bg-base)',
  gold: 'var(--brand-primary)',
  goldBright: 'var(--brand-primary-strong)',
  text: '#F5F5F7',
  dim: '#A1A1AA',
  border: 'rgba(255,255,255,0.10)',
  raised: 'var(--bg-surface)',
  raisedAlt: 'var(--bg-surface-2)',
  green: '#22C55E',
  blue: '#6366F1',
  font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'The App', href: '/get-the-app' },
  { label: 'Compare', href: '/compare' },
];

type Cat = {
  key: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
};

type Article = {
  cat: string;
  title: string;
  body: string;
  tags?: string[];
};

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {d.split('|').map((path, i) => <path key={i} d={path} />)}
    </svg>
  );
}

const CATEGORIES: Cat[] = [
  {
    key: 'getting-started',
    title: 'Getting Started',
    desc: 'Set up your company, invite your team, and import your first project from any platform.',
    icon: <Icon d="M12 2l9 4.5v11L12 22l-9-4.5v-11L12 2z|M12 2v20|M3 6.5l9 4.5 9-4.5" />,
  },
  {
    key: 'projects',
    title: 'Projects & Field Ops',
    desc: 'Run jobs end to end — schedules, RFIs, submittals, change orders, and daily logs.',
    icon: <Icon d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z|M8 13h8|M8 17h5" />,
  },
  {
    key: 'financials',
    title: 'Financials & Pay Apps',
    desc: 'Pay applications, AIA documents, lien waivers, budgets, and cost tracking that reconcile automatically.',
    icon: <Icon d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z|M7 8h10|M7 12h6|M7 16h4" />,
  },
  {
    key: 'ai',
    title: 'AI: Sage & Takeoff',
    desc: 'Draft RFIs, summarize specs, and run AI takeoffs straight from your plan sets.',
    icon: <Icon d="M12 3l1.7 4.5L18 9l-4.3 1.5L12 15l-1.7-4.5L6 9l4.3-1.5L12 3z|M18 14l.6 1.6L20 16l-1.4.5L18 18l-.6-1.5L16 16l1.4-.4L18 14z" />,
  },
  {
    key: 'trades',
    title: 'Trades, Takeoff & Cost Codes',
    desc: 'Set up cost codes and run takeoffs for low-voltage, electrical, plumbing, HVAC, concrete, and more.',
    icon: <Icon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z" />,
  },
  {
    key: 'field-app',
    title: 'Field App',
    desc: 'Saguaro Control Systems for iOS & Android — works offline, syncs when you get signal.',
    icon: <Icon d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M11 18h2" />,
  },
  {
    key: 'portals',
    title: 'Owner & Sub Portals',
    desc: 'Give owners and subcontractors scoped logins to approve, submit, and stay compliant.',
    icon: <Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8" />,
  },
  {
    key: 'billing',
    title: 'Billing & Plans',
    desc: 'Manage your subscription, invoices, add-ons, and seats. No per-seat surprises.',
    icon: <Icon d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z|M3 10h18|M7 15h4" />,
  },
  {
    key: 'account',
    title: 'Account & Security',
    desc: 'Passwords, two-factor, biometric sign-in, notifications, and data protection.',
    icon: <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z|M9 12l2 2 4-4" />,
  },
];

const ARTICLES: Article[] = [
  // ---- Getting Started ----
  { cat: 'getting-started', title: 'Create Your Company Account in 5 Minutes', body: 'Sign up at saguarocontrol.net, name your company, and pick your trade focus. Your first project workspace, cost-code list, and document folders are created automatically so you can start working within minutes.' },
  { cat: 'getting-started', title: 'Invite Your Team and Assign Roles', body: 'From Settings → Team, add email addresses and assign a role: Admin, PM, Field, Accounting, or Read-Only. Every plan includes unlimited users, so there is never a per-seat charge for adding your whole crew.', tags: ['add teammate', 'add a teammate', 'invite', 'users', 'permissions', 'roles'] },
  { cat: 'getting-started', title: 'Free Migration from Procore, Buildertrend, or Spreadsheets', body: 'Free guided migration is included on every plan. Tell us your current platform under Settings → Migration and our team imports your projects, contacts, vendors, documents, and pay-app history — most companies are fully live in one business day.', tags: ['migrate', 'migration', 'procore', 'buildertrend', 'import', 'switch platform', 'move data'] },
  { cat: 'getting-started', title: 'Install the Field App on iPhone & Android', body: 'Download Saguaro Control Systems from the App Store or Google Play, sign in with your account, and your assigned projects sync to the device. The app works offline and syncs the moment you regain signal.', tags: ['install', 'download', 'app store', 'google play', 'iphone', 'android'] },
  { cat: 'getting-started', title: 'Set Up Approval Chains for Pay Apps and Change Orders', body: 'Under Settings → Approvals, define who reviews and signs off on pay applications, change orders, and POs. You can require multiple approvers and set dollar thresholds that route larger items to ownership.' },
  { cat: 'getting-started', title: 'Import Your Cost Codes and CSI Divisions', body: 'Upload your existing cost-code list as a CSV, or start from the built-in CSI MasterFormat divisions. Codes flow into budgets, takeoffs, commitments, and job-cost reports so everything reconciles.' },
  { cat: 'getting-started', title: 'Connect QuickBooks Online', body: 'Link QuickBooks Online under Settings → Integrations to sync customers, vendors, invoices, and bills. Job costs and pay-app billings post automatically, eliminating double entry for your accountant.', tags: ['quickbooks', 'qbo', 'accounting', 'sync'] },

  // ---- Projects & Field Ops ----
  { cat: 'projects', title: 'Create a Project and Build the Schedule of Values', body: 'Start a project, enter the contract amount, and break it into a schedule of values (SOV). The SOV drives your G703, budget, and cost-to-complete so billing and costing stay in sync.', tags: ['sov', 'schedule of values', 'budget'] },
  { cat: 'projects', title: 'Manage RFIs and Route Them with Autopilot', body: 'Create an RFI, attach drawings or photos, and Autopilot suggests the right recipient and due date. Track open, answered, and overdue RFIs in one log with the full ball-in-court history.', tags: ['rfi', 'request for information', 'autopilot'] },
  { cat: 'projects', title: 'Submittals, Transmittals & Document Control', body: 'Build submittal packages, route them for review, and track ball-in-court status. Every revision is versioned, and transmittals generate a stamped PDF record automatically.', tags: ['submittal', 'transmittal', 'documents'] },
  { cat: 'projects', title: 'Change Orders That Tie to the Budget', body: 'Log potential change orders (PCOs), price them, and promote approved ones to change orders that adjust the contract and budget instantly. The CO log shows pending, approved, and executed value at a glance.', tags: ['change order', 'pco', 'co log'] },
  { cat: 'projects', title: 'Daily Logs with Photos, Weather & Manpower', body: 'Capture a daily log from the field with crew counts, equipment, notes, and photos. Weather is pulled automatically for the job-site location and stamped to the record for documentation and claims.', tags: ['daily log', 'daily report', 'weather', 'manpower'] },
  { cat: 'projects', title: 'Build and Manage the Project Schedule', body: 'Create milestones and tasks, set durations and dependencies, and track percent complete. The field team sees upcoming work, and slippage flags so you can re-sequence before it costs you.', tags: ['schedule', 'gantt', 'milestones'] },
  { cat: 'projects', title: 'Punch Lists and Project Closeout', body: 'Create punch-list items with photos and assign them to subs. Track open versus closed, then generate a closeout package with warranties and O&M manuals to hand the owner a complete record.', tags: ['punch list', 'closeout', 'warranty'] },
  { cat: 'projects', title: 'Drawings & Blueprint Version Control', body: 'Upload plan sets as PDFs; Saguaro keeps every version and shows the current set to the field. Markups, RFIs, and photos can be pinned to a sheet location so context travels with the drawing.', tags: ['drawings', 'blueprints', 'plans', 'sheets'] },
  { cat: 'projects', title: 'Meeting Minutes and Action Items', body: 'Record meeting minutes, assign action items with owners and due dates, and carry open items forward to the next meeting automatically so nothing gets dropped.', tags: ['meeting minutes', 'action items'] },

  // ---- Financials & Pay Apps ----
  { cat: 'financials', title: 'Generate G702 / G703 Pay Applications', body: 'Build an AIA-style G702 application and G703 continuation sheet directly from your schedule of values. Enter this period of work and retention, stored materials, and totals calculate automatically.', tags: ['g702', 'g703', 'pay app', 'pay application', 'continuation sheet', 'billing'] },
  { cat: 'financials', title: 'AIA Documents: G702–G706, A310, A312', body: 'Generate the full AIA family — G702/G703 pay apps, G706/G706A/G707 closeout and lien releases, and A310/A312 bonds — pre-filled from your project data and ready to sign.', tags: ['aia', 'g706', 'g707', 'a310', 'a312', 'bond'] },
  { cat: 'financials', title: 'Lien Waivers — All 50 States, All Four Types', body: 'Produce conditional or unconditional, progress or final lien waivers for any state. Arizona, California, Texas, Nevada, Florida, and other statutory states use state-specific language; the rest use our attorney-reviewed form.', tags: ['lien waiver', 'lien release', 'conditional', 'unconditional', 'california', 'texas', 'arizona'] },
  { cat: 'financials', title: 'Certified Payroll WH-347 & Davis-Bacon', body: 'Run certified payroll on prevailing-wage jobs with the federal WH-347 form. Look up Davis-Bacon wage determinations by county and classification, and export the signed statement of compliance.', tags: ['certified payroll', 'wh-347', 'wh347', 'davis bacon', 'prevailing wage'] },
  { cat: 'financials', title: 'Track Budgets, Commitments & Cost-to-Complete', body: 'See the budget, committed costs, actuals, and projected cost-to-complete on one page. Variances flag early so you can act before a line item goes underwater.', tags: ['budget', 'cost to complete', 'commitments', 'job cost'] },
  { cat: 'financials', title: 'Retention / Retainage Tracking and Release', body: 'Saguaro tracks retainage withheld on every pay app and accrues it across the job. When it is time to bill retention, generate the G703 retention release and final waiver in a couple of clicks.', tags: ['retention', 'retainage'] },
  { cat: 'financials', title: 'Subcontractor Invoices, COIs & W-9s', body: 'Collect sub invoices, certificates of insurance, and W-9s through the Sub Portal. Expired COIs flag automatically and can block payment until compliance is current.', tags: ['subcontractor', 'invoice', 'coi', 'certificate of insurance', 'w-9', 'w9'] },
  { cat: 'financials', title: 'Job Costing and WIP Reports', body: 'Generate work-in-progress (WIP) and job-cost reports that reconcile billings to costs, calculate over/under billing, and give your CPA the schedule they need at period close.', tags: ['wip', 'job costing', 'over under billing'] },

  // ---- AI: Sage & Takeoff ----
  { cat: 'ai', title: 'What Is Sage, the AI Assistant?', body: 'Sage is the built-in AI assistant. Ask it to draft an RFI, summarize a submittal, find which lien-waiver a state requires, or pull cost-to-complete — and because Sage reads your project context, answers are specific to your data.', tags: ['sage', 'ai assistant', 'chat'] },
  { cat: 'ai', title: 'Draft an RFI or Letter with Sage', body: 'Describe the issue in plain language and Sage writes a clear, professional RFI — subject, question, and suggested assignee — that you can edit and file. The same works for letters, scopes, and emails.', tags: ['draft rfi', 'sage', 'ai'] },
  { cat: 'ai', title: 'Run an AI Takeoff from a PDF Plan Set', body: 'Upload a plan set, set a scale reference, and AI Takeoff measures linear feet, square footage, and counts automatically. Every measurement is editable, and quantities flow into your estimate and budget.', tags: ['ai takeoff', 'takeoff', 'measure', 'estimate', 'quantity'] },
  { cat: 'ai', title: 'Summarize a Long Submittal or Spec Section', body: 'Open a long spec, submittal, or contract and Sage returns the key requirements, deadlines, and risks in seconds — so you catch the buried clause before it bites you.', tags: ['summarize', 'spec', 'sage'] },
  { cat: 'ai', title: 'AI Daily Reports — Speak It, Sage Writes It', body: 'On the field app, tap the mic and describe your day. Sage turns your voice note into a structured daily report with work performed, manpower, and issues, ready to submit.', tags: ['voice', 'daily report', 'ai', 'dictate'] },
  { cat: 'ai', title: 'Auto-Generate Scopes of Work and Bid Packages', body: 'Give Sage a project and a trade and it drafts a scope of work and bid invitation you can send to subs, then helps you level the bids that come back.', tags: ['scope of work', 'bid package', 'ai'] },

  // ---- Trades, Takeoff & Cost Codes ----
  { cat: 'trades', title: 'Set Up Cost Codes for Low-Voltage, Security & AV', body: 'Add a low-voltage division to your cost codes for structured cabling, access control, CCTV, fire alarm, and AV. Saguaro tracks device counts and cable footage so your bids, budgets, and pay apps line up with how low-voltage work is actually billed.', tags: ['low voltage', 'low volt', 'lv', 'structured cabling', 'security', 'access control', 'cctv', 'av', 'audio visual', 'fire alarm', 'data', 'cabling'] },
  { cat: 'trades', title: 'AI Takeoff for Electrical Devices & Fixtures', body: 'Run an AI takeoff on the electrical plans to count receptacles, switches, fixtures, panels, and home runs, and to measure conduit and feeder lengths. Counts drop straight into your estimate by cost code.', tags: ['electrical', 'electric', 'devices', 'fixtures', 'conduit', 'panel', 'receptacle', 'lighting', 'wire'] },
  { cat: 'trades', title: 'Plumbing Takeoff: Fixtures, Waste & Supply', body: 'Take off plumbing fixtures, then measure waste, vent, and supply runs by size and material. Saguaro totals fixture units and pipe footage so you can price the rough-in and trim-out accurately.', tags: ['plumbing', 'plumber', 'fixtures', 'pipe', 'waste', 'vent', 'supply'] },
  { cat: 'trades', title: 'HVAC / Mechanical: Equipment & Duct Runs', body: 'Schedule HVAC equipment — RTUs, splits, VAV boxes — and measure duct runs and diffusers off the mechanical plans. Equipment schedules and linear footage roll up into the mechanical budget.', tags: ['hvac', 'mechanical', 'duct', 'ductwork', 'rtu', 'vav', 'tonnage'] },
  { cat: 'trades', title: 'Concrete & Flatwork Takeoff by the Cubic Yard', body: 'Measure slabs, footings, and walls and Saguaro converts area and thickness to cubic yards, adds a waste factor, and totals rebar and forming. Pour quantities feed the budget and the supplier order.', tags: ['concrete', 'flatwork', 'slab', 'footing', 'rebar', 'cubic yard', 'foundation'] },
  { cat: 'trades', title: 'Framing & Carpentry: Linear Feet and Sheet Counts', body: 'Take off wall framing in linear feet, count studs and joists, and tally sheathing and decking by the sheet. It works for wood and light-gauge metal framing alike.', tags: ['framing', 'carpentry', 'wood', 'metal stud', 'lumber', 'sheathing', 'joist'] },
  { cat: 'trades', title: 'Drywall & Finishes: Square-Foot Takeoff', body: 'Measure wall and ceiling board by the square foot, apply a waste factor, and total board, tape, mud, and corner bead. Finish schedules tie each room to its assembly.', tags: ['drywall', 'gypsum', 'finishes', 'tape', 'board', 'ceiling', 'paint', 'painting'] },
  { cat: 'trades', title: 'Roofing: Squares, Membrane & Tear-Off', body: 'Take off roof area in squares, break out membrane, insulation, fasteners, and flashing, and add tear-off quantities for re-roofs. Pitch and detail allowances are built in.', tags: ['roofing', 'roof', 'membrane', 'tpo', 'epdm', 'shingle', 'tear off'] },
  { cat: 'trades', title: 'Earthwork & Grading: Cut, Fill & Haul', body: 'Estimate cut and fill volumes, balance the site, and calculate haul-off or import by the cubic yard and truckload. Quantities feed your site-work budget and equipment plan.', tags: ['earthwork', 'grading', 'excavation', 'site work', 'dirt', 'cut', 'fill', 'haul'] },
  { cat: 'trades', title: 'Masonry: CMU and Brick Counts', body: 'Measure masonry walls and Saguaro returns CMU or brick counts, mortar and grout quantities, and reinforcing — by wall type and size — ready for the budget and supplier takeoff.', tags: ['masonry', 'cmu', 'block', 'brick', 'mortar', 'grout'] },
  { cat: 'trades', title: 'Fire Protection & Sprinkler Heads', body: 'Count sprinkler heads, measure main and branch piping, and schedule risers and valves off the fire-protection plans, with quantities organized for design-build sub billing.', tags: ['fire protection', 'sprinkler', 'fire sprinkler', 'nfpa', 'heads', 'standpipe'] },
  { cat: 'trades', title: 'Solar / PV: Panel Counts and Racking', body: 'Take off module counts, racking footage, and inverter quantities from the PV layout, and roll DC and AC scope into separate cost codes for clean billing.', tags: ['solar', 'pv', 'photovoltaic', 'panel', 'racking', 'inverter'] },
  { cat: 'trades', title: 'Create a Bid Package and Invite Subs by Trade', body: 'Assemble a bid package with plans, specs, and a scope of work, then invite subs by trade. Track who viewed, downloaded, and bid, and level the responses side by side.', tags: ['bid package', 'bidding', 'invite subs', 'leveling', 'scope'] },

  // ---- Field App ----
  { cat: 'field-app', title: 'Download & Log In to Saguaro Control Systems', body: 'Install Saguaro Control Systems from the App Store or Google Play and sign in with your Saguaro account — Face ID gets you in fast. Your assigned projects sync automatically.', tags: ['download', 'login', 'field app', 'install'] },
  { cat: 'field-app', title: 'Capture Punch-List Items with Photos', body: 'Walk the site, snap a photo, drop a punch item with a location and assignee, and it syncs to the office. Subs see their list and mark items done from their own device.', tags: ['punch list', 'photos', 'field'] },
  { cat: 'field-app', title: 'Log Time & Track Crews on Site', body: 'Clock crews in and out, allocate hours to cost codes, and capture daily manpower. Time flows into job costing and certified payroll without re-keying.', tags: ['time', 'timesheet', 'crew', 'labor'] },
  { cat: 'field-app', title: 'Work Offline — Automatic Sync on Reconnect', body: 'Saguaro Control Systems is offline-first. Daily logs, photos, punch items, and time entries queue locally with no signal and sync the moment you reconnect — nothing is lost in a dead zone.', tags: ['offline', 'sync', 'no signal'] },
  { cat: 'field-app', title: 'Push Notifications for RFIs & Approvals', body: 'Get a push the instant an RFI is answered, a pay app needs your signature, or a change order is approved, so the field and office never wait on each other.', tags: ['notifications', 'push', 'alerts'] },
  { cat: 'field-app', title: 'Scan Blueprints and Mark Up in the Field', body: 'Open the current plan set on your phone or tablet, zoom to a detail, and pin photos, RFIs, or notes to a location on the sheet.', tags: ['blueprints', 'markup', 'plans', 'scan'] },

  // ---- Owner & Sub Portals ----
  { cat: 'portals', title: 'Owner Portal: Approve Pay Apps & Change Orders', body: 'Give owners a scoped login to review and approve pay applications and change orders, see progress photos, and track the schedule — without exposing your internal costs.', tags: ['owner portal', 'approve', 'owner'] },
  { cat: 'portals', title: 'Sub Portal: Invoices, COIs & Lien Waivers', body: 'Subs submit invoices, upload certificates of insurance, and sign lien waivers in their own portal. You approve and pay from one queue, and compliance is enforced automatically.', tags: ['sub portal', 'subcontractor', 'invoice', 'coi', 'lien waiver'] },
  { cat: 'portals', title: 'Share Documents with Scoped Access', body: 'Share drawings, specs, or a single folder with an owner, architect, or sub using a secure link. They see only what you grant, and access can be revoked any time.', tags: ['share', 'documents', 'access', 'link'] },
  { cat: 'portals', title: 'Collect W-9s and Insurance from Subs', body: 'Request W-9s and COIs through the Sub Portal; Saguaro tracks expiration dates and flags lapses, and can hold payment until a sub’s insurance certificate is current.', tags: ['w-9', 'w9', 'coi', 'insurance', 'compliance'] },

  // ---- Billing & Plans ----
  { cat: 'billing', title: 'Switch Between Monthly & Annual Billing', body: 'Change your billing cycle any time under Settings → Billing. Annual plans include a discount, and any proration is handled automatically on your next invoice.', tags: ['billing', 'monthly', 'annual', 'subscription'] },
  { cat: 'billing', title: 'Upgrade, Downgrade, or Add an Add-On', body: 'Move between Starter, Professional, and Enterprise instantly, or add an add-on like extra takeoff pages. Changes prorate, and you keep all your data when you switch.', tags: ['upgrade', 'downgrade', 'plan', 'add-on'] },
  { cat: 'billing', title: 'Update Payment Method & Download Receipts', body: 'Update your card and download itemized receipts and invoices from Settings → Billing — handy for expense reports and your bookkeeper.', tags: ['payment', 'card', 'receipt', 'invoice'] },
  { cat: 'billing', title: 'Flat Pricing & Unlimited Users Explained', body: 'Saguaro charges a flat plan price with unlimited users — no per-seat fees. Add your whole crew, your estimators, and the owner without watching the bill climb.', tags: ['pricing', 'unlimited users', 'flat'] },
  { cat: 'billing', title: 'Cancel, Pause & Data Retention', body: 'Cancel or pause from Settings → Billing. Your data is retained and exportable during any pause, and you can reactivate right where you left off.', tags: ['cancel', 'pause', 'data retention'] },

  // ---- Account & Security ----
  { cat: 'account', title: 'Reset My Password', body: 'On the login screen, click Forgot Password and enter your email to get a secure reset link within a minute. If it does not arrive, check spam or contact support to verify your identity.', tags: ['password', 'reset', 'forgot', 'login'] },
  { cat: 'account', title: 'Set Up Two-Factor Authentication (2FA)', body: 'Enable 2FA under Settings → Security to require a one-time code at login. It is the single best way to keep a job’s financials and documents locked down.', tags: ['2fa', 'two factor', 'mfa', 'security'] },
  { cat: 'account', title: 'Face ID / Biometric Sign-In', body: 'Turn on Face ID or fingerprint sign-in in the field app for fast, secure access without typing a password on a dusty job site.', tags: ['face id', 'biometric', 'fingerprint', 'touch id'] },
  { cat: 'account', title: 'Manage Notification Preferences', body: 'Choose which events email or push you — RFIs, approvals, pay apps, daily logs — per project, so you get what matters and mute what does not.', tags: ['notifications', 'preferences', 'email'] },
  { cat: 'account', title: 'Data Security & Backups', body: 'Your data is encrypted in transit and at rest, backed up continuously, and isolated per company. See our Security page for how we protect your data and our subprocessor list.', tags: ['security', 'backup', 'encryption', 'privacy'] },
];

const POPULAR = [
  'AI Takeoff for Electrical',
  'Low-Voltage Cost Codes',
  'Generate a G703',
  'Lien Waiver for California',
  'Migrate from Procore',
  'Reset My Password',
];

const FAQS = [
  {
    q: 'How do I move my data over from Procore or Buildertrend?',
    a: 'Free migration is included on every plan. From Settings → Migration, tell us your current platform and our team imports all your projects, contacts, vendors, documents, pay-app history, and team accounts. Most companies are fully live in 1 business day — you do nothing.',
  },
  {
    q: 'What is Sage, the AI assistant?',
    a: 'Sage is the built-in AI assistant inside Saguaro. Ask it to draft an RFI, summarize a long submittal, find which lien-waiver type a state requires, or pull the cost-to-complete on a job. Sage reads your project context so answers are specific to your data — never generic.',
  },
  {
    q: 'How accurate is AI Takeoff and how do I run one?',
    a: 'Upload a PDF plan set under a project, draw a scale reference, and AI Takeoff measures linear feet, square footage, and counts automatically. Every measurement is editable, so you stay in control. Starter includes 150 pages/mo; Professional and Enterprise are unlimited.',
  },
  {
    q: 'Which states are supported for lien waivers?',
    a: 'All 50 states. Arizona, California, Texas, Nevada, Florida, Colorado, Washington, Oregon, Utah, and New Mexico use state-specific statutory language. Every other state uses our attorney-reviewed generic form. All four waiver types (conditional/unconditional, progress/final) are available on Professional and Enterprise.',
  },
  {
    q: 'Does the field app work without cell signal?',
    a: 'Yes. Saguaro Control Systems is offline-first. Log daily reports, punch-list items, photos, and time entries with no connection — everything queues locally and syncs automatically the moment you regain signal. No data is lost on a dead-zone job site.',
  },
  {
    q: 'How do I invite my team and set permissions?',
    a: 'Go to Settings → Team, enter email addresses, and assign a role (Admin, PM, Field, Accounting, or Read-Only). Every plan includes unlimited users at no extra cost, so there is never a per-seat charge for adding your whole crew, your estimators, or the owner.',
  },
  {
    q: 'Can owners and subcontractors get their own login?',
    a: 'Yes. The Owner Portal and Sub Portal (included on Professional and Enterprise) give external parties a scoped, sandboxed view — owners approve pay apps and change orders, subs submit invoices, COIs, and lien waivers. They only see what you share with them.',
  },
  {
    q: 'I forgot my password — how do I reset it?',
    a: 'On the login screen, click Forgot Password and enter your email. You will get a secure reset link within a minute. If it does not arrive, check spam or contact support and we will verify your identity and reset it manually.',
  },
];

// Normalize text for forgiving, multi-word, hyphen-insensitive search.
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', opacity: 0.7 }}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export default function HelpCenterPage() {
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [openArticle, setOpenArticle] = useState<string | null>(null);

  const tokens = norm(query).split(' ').filter(Boolean);
  const searching = tokens.length > 0;
  const matchText = (text: string) => {
    const hay = norm(text);
    return tokens.every(t => hay.includes(t));
  };
  const catTitle = (k: string) => CATEGORIES.find(c => c.key === k)?.title || '';

  const matchedArticles = searching
    ? ARTICLES.filter(a => matchText(`${a.title} ${a.body} ${(a.tags || []).join(' ')} ${catTitle(a.cat)}`))
    : [];
  const matchedFaqs = searching
    ? FAQS.filter(f => matchText(`${f.q} ${f.a}`))
    : FAQS;
  const totalResults = matchedArticles.length + (searching ? matchedFaqs.length : 0);

  return (
    <div className="mkt-page" style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 64, background: 'rgba(13,17,23,0.9)',
        borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', padding: '0 32px', gap: 0,
      }}>
        <style>{`@media (max-width: 768px){ .hc-mnav-links{ display:none !important } }`}</style>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, marginRight: 40 }} aria-label="Saguaro Control Systems — home">
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
        </Link>
        <div className="hc-mnav-links" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {NAV_LINKS.map(link => (
            <a key={link.label} href={link.href} style={{ padding: '6px 12px', borderRadius: 6, color: C.dim, fontSize: 14, fontWeight: 400, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
              {link.label}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/login" style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Log In</Link>
          <Link href="/signup" style={{ padding: '8px 16px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Free Trial</Link>
        </div>
      </nav>

      <div style={{ paddingTop: 64 }}>

        {/* Hero + Search */}
        <section style={{ textAlign: 'center', padding: '104px 24px 64px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 24 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
            Help Center
          </div>
          <h1 style={{ fontWeight: 600, lineHeight: 1.15, margin: '0 0 16px', letterSpacing: -0.5 }}>
            How Can We{' '}
            <span style={{ color: C.text }}>
              Help You Build?
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 1.6vw, 17px)', color: C.dim, maxWidth: 580, margin: '0 auto 32px', lineHeight: 1.6 }}>
            {ARTICLES.length} guides and answers for everything in Saguaro Control Systems — from AI takeoffs and trade cost codes to pay apps, the field app, and billing.
          </p>

          {/* Search box */}
          <div style={{ maxWidth: 620, margin: '0 auto', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </div>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search — e.g. low-voltage takeoff, G703, lien waiver, offline sync…"
              autoComplete="off"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '16px 20px 16px 52px',
                background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12,
                color: C.text, fontSize: 15, fontFamily: C.font, outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.border = `1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent)`)}
              onBlur={e => (e.currentTarget.style.border = `1px solid ${C.border}`)}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search"
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, width: 30, height: 30, color: C.dim, cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ×
              </button>
            )}
          </div>

          {/* Popular searches */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 700, margin: '20px auto 0' }}>
            <span style={{ fontSize: 13, color: C.dim, alignSelf: 'center', marginRight: 2 }}>Popular:</span>
            {POPULAR.map(p => (
              <button key={p} onClick={() => setQuery(p)} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 999, fontSize: 12.5, color: C.dim, fontWeight: 400, cursor: 'pointer', fontFamily: C.font }}
                onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.dim; e.currentTarget.style.borderColor = C.border; }}>
                {p}
              </button>
            ))}
          </div>
        </section>

        {searching ? (
          /* ---------- SEARCH RESULTS ---------- */
          <section style={{ padding: '0 24px 88px', maxWidth: 820, margin: '0 auto' }}>
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>
                {totalResults} result{totalResults === 1 ? '' : 's'}
              </h2>
              <span style={{ fontSize: 15, color: C.dim }}>for &ldquo;{query.trim()}&rdquo;</span>
            </div>

            {totalResults === 0 ? (
              <div style={{ textAlign: 'center', padding: '56px 24px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.dim, fontSize: 15, lineHeight: 1.7 }}>
                No articles match &ldquo;{query.trim()}&rdquo;. Try a broader term like <em>takeoff</em>, <em>pay app</em>, or <em>lien waiver</em> — or{' '}
                <Link href="/contact" style={{ color: C.gold, textDecoration: 'none', fontWeight: 600 }}>ask our team</Link>.
              </div>
            ) : (
              <>
                {matchedArticles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: matchedFaqs.length ? 44 : 0, borderTop: `1px solid ${C.border}` }}>
                    {matchedArticles.map(a => {
                      const open = openArticle === a.title;
                      return (
                        <div key={a.title} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <button onClick={() => setOpenArticle(open ? null : a.title)}
                            style={{ width: '100%', textAlign: 'left', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, fontFamily: C.font }}>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 4 }}>{catTitle(a.cat)}</span>
                              <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: C.text, lineHeight: 1.35 }}>{a.title}</span>
                            </span>
                            <Chevron open={open} />
                          </button>
                          {open && (
                            <div style={{ padding: '0 0 18px', fontSize: 15, color: C.dim, lineHeight: 1.75 }}>{a.body}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {matchedFaqs.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 500, color: C.dim, margin: '0 0 14px' }}>Related Questions</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {matchedFaqs.map((faq, i) => (
                        <div key={faq.q} style={{ borderBottom: i < matchedFaqs.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                          <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', textAlign: 'left', padding: '18px 0', background: 'none', border: 'none', color: C.text, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, lineHeight: 1.4, fontFamily: C.font }}>
                            <span>{faq.q}</span>
                            <span style={{ flexShrink: 0, width: 26, height: 26, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 18, fontWeight: 300 }}>
                              {openFaq === i ? '−' : '+'}
                            </span>
                          </button>
                          {openFaq === i && (
                            <div style={{ padding: '0 0 20px', fontSize: 15, color: C.dim, lineHeight: 1.75, maxWidth: 680 }}>{faq.a}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          /* ---------- BROWSE (no search) ---------- */
          <>
            <section style={{ padding: '0 24px 88px', maxWidth: 1160, margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <h2 style={{ fontWeight: 600, margin: '0 0 8px', letterSpacing: -0.3 }}>Browse by Category</h2>
                <p style={{ fontSize: 15, color: C.dim, margin: 0 }}>Tap any article to read it — {ARTICLES.length} guides across {CATEGORIES.length} topics.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '48px 56px' }}>
                {CATEGORIES.map(cat => {
                  const arts = ARTICLES.filter(a => a.cat === cat.key);
                  return (
                    <div key={cat.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {cat.icon}
                        </div>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0, letterSpacing: -0.2 }}>{cat.title}</h3>
                          <span style={{ fontSize: 12.5, color: C.dim }}>{arts.length} articles</span>
                        </div>
                      </div>
                      <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: '0 0 14px' }}>{cat.desc}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderTop: `1px solid ${C.border}` }}>
                        {arts.map(a => {
                          const open = openArticle === a.title;
                          return (
                            <div key={a.title} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <button onClick={() => setOpenArticle(open ? null : a.title)}
                                style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', color: open ? C.text : C.dim, fontFamily: C.font }}
                                onMouseEnter={e => { if (!open) e.currentTarget.style.color = C.text; }}
                                onMouseLeave={e => { if (!open) e.currentTarget.style.color = C.dim; }}>
                                <span style={{ fontSize: 13.5, fontWeight: 400, lineHeight: 1.4 }}>{a.title}</span>
                                <Chevron open={open} />
                              </button>
                              {open && (
                                <div style={{ padding: '0 0 14px', fontSize: 13.5, color: C.dim, lineHeight: 1.7 }}>{a.body}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* FAQ */}
            <section style={{ padding: '0 24px 88px', maxWidth: 800, margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 44 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
                  Common Questions
                </div>
                <h2 style={{ fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>Frequently Asked Questions</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {FAQS.map((faq, i) => (
                  <div key={faq.q} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', textAlign: 'left', padding: '22px 0', background: 'none', border: 'none', color: C.text, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, lineHeight: 1.4, fontFamily: C.font }}>
                      <span>{faq.q}</span>
                      <span style={{ flexShrink: 0, width: 26, height: 26, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 18, fontWeight: 300 }}>
                        {openFaq === i ? '−' : '+'}
                      </span>
                    </button>
                    {openFaq === i && (
                      <div style={{ padding: '0 0 22px', fontSize: 15, color: C.dim, lineHeight: 1.75, maxWidth: 680 }}>{faq.a}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Contact Support CTA */}
        <section style={{ padding: '24px 24px 96px', maxWidth: 980, margin: '0 auto' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '44px 48px', display: 'flex', gap: 40, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 12 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
                Still Need a Hand?
              </div>
              <h2 style={{ fontWeight: 600, margin: '0 0 12px', lineHeight: 1.25, letterSpacing: -0.3 }}>Talk to a Real Human on Our Support Team</h2>
              <p style={{ fontSize: 15, color: C.dim, margin: '0 0 24px', lineHeight: 1.65 }}>
                Our support team is built from people who have actually run construction jobs. Reach out and we will help you set up your company, run your first pay app, or migrate from your old platform.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  'Email support included on every plan',
                  'Priority chat with 4-hour response on Pro',
                  'Free guided migration from any platform',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="8" cy="8" r="8" fill="rgba(255,255,255,0.06)" />
                      <path d="M4.5 8l2.5 2.5 4-5" stroke={C.dim} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 14, color: C.dim }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch', minWidth: 220 }}>
              <Link href="/contact" style={{ padding: '13px 28px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 15, textDecoration: 'none', textAlign: 'center' }}>
                Contact Support
              </Link>
              <Link href="/signup" style={{ padding: '13px 28px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontWeight: 500, fontSize: 15, textDecoration: 'none', textAlign: 'center' }}>
                Start Free Trial
              </Link>
              <a href="mailto:support@saguarocontrol.net" style={{ fontSize: 13, color: C.dim, textDecoration: 'none', textAlign: 'center', marginTop: 2 }}>
                support@saguarocontrol.net
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '48px 32px', background: C.raised }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 32 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Saguaro Control Systems — home">
              <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 30, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
            </Link>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'Home', href: '/' }, { label: 'Features', href: '/features' },
                { label: 'Pricing', href: '/pricing' }, { label: 'Compare', href: '/compare' },
                { label: 'The App', href: '/get-the-app' }, { label: 'Contact', href: '/contact' },
                { label: 'Security', href: '/security' }, { label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' },
              ].map(link => (
                <a key={link.label} href={link.href} style={{ fontSize: 13, color: C.dim, textDecoration: 'none', fontWeight: 500 }}>{link.label}</a>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap' }}>&copy; {new Date().getFullYear()} Saguaro Control Systems</div>
          </div>
        </footer>

      </div>
    </div>
  );
}
