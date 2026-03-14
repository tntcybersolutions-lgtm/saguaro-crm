export interface Industry {
  slug: string;
  name: string;
  headline: string;
  subheadline: string;
  painPoints: string[];
  keyFeatures: { title: string; desc: string }[];
  testimonialName: string;
  testimonialTitle: string;
  testimonialQuote: string;
  metaTitle: string;
  metaDescription: string;
  searchKeywords: string[];
  iconPath: string; // SVG path data for the industry icon
}

export const INDUSTRIES: Industry[] = [
  {
    slug: 'general-contractors',
    name: 'General Contractors',
    headline: 'The Platform Built for\nGeneral Contractors',
    subheadline: 'AI blueprint takeoff, AIA pay apps, lien waivers in all 50 states, certified payroll, sub management, and a free mobile field app — everything a GC needs in one platform.',
    painPoints: [
      'Spending 4–8 hours per takeoff doing manual quantity calculations',
      'Chasing lien waiver paperwork across 20 subs every month',
      'Filling out G702/G703 pay apps by hand for every project',
      'Managing certified payroll with spreadsheets on prevailing wage jobs',
      'Paying for 4 different tools that don\'t talk to each other',
    ],
    keyFeatures: [
      { title: 'AI Blueprint Takeoff', desc: 'Upload any PDF. Sage reads every dimension, calculates all materials, generates a full CSI-organized estimate. 41 seconds vs 4–8 hours.' },
      { title: 'AIA G702/G703 Pay Apps', desc: 'Generate and submit G702/G703 pay applications in 60 seconds. Track SOV, retention, and payment history automatically.' },
      { title: 'Lien Waivers — All 50 States', desc: 'Send, sign, and track conditional and unconditional lien waivers digitally. State-compliant language auto-applied.' },
      { title: 'Certified Payroll WH-347', desc: 'Auto-generate DOL-compliant WH-347 forms with live Davis-Bacon rates. Submit directly to agencies.' },
      { title: 'Subcontractor Management', desc: 'Invite subs by CSI trade division, track compliance, COIs, insurance, and bid responses in one dashboard.' },
      { title: 'Free Mobile Field App', desc: 'GPS clock-in, daily logs, photos, RFIs, punch lists — works offline. No App Store. Free for your whole crew.' },
    ],
    testimonialName: 'Marcus T.',
    testimonialTitle: 'Project Manager, Phoenix AZ',
    testimonialQuote: 'We used to spend half a day doing material takeoffs by hand. Now our estimator uploads the PDF and has numbers in a minute. It completely changed how we bid.',
    metaTitle: 'Construction Software for General Contractors | Saguaro CRM',
    metaDescription: 'The best construction CRM for general contractors. AI blueprint takeoff, AIA pay apps, lien waivers in 50 states, certified payroll, free mobile field app. Start free.',
    searchKeywords: ['general contractor software', 'GC construction software', 'best software for general contractors', 'construction CRM for GCs'],
    iconPath: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  },
  {
    slug: 'residential-remodelers',
    name: 'Residential Remodelers',
    headline: 'Construction Software Built\nfor Residential Remodelers',
    subheadline: 'Win more bids with AI estimating, impress clients with a professional portal, manage subs with digital lien waivers, and run your crew with a free mobile field app.',
    painPoints: [
      'Spending hours estimating every remodel job with spreadsheets',
      'Losing bids to competitors who estimate faster and more accurately',
      'Managing client communication across texts, emails, and phone calls',
      'Paper change orders and no clear paper trail for disputes',
      'Chasing lien waivers from subs at project closeout',
    ],
    keyFeatures: [
      { title: 'AI Estimating for Remodels', desc: 'Upload kitchen, bath, addition, or whole-home plans. Sage calculates materials, labor, and costs for any remodel scope.' },
      { title: 'Client Portal', desc: 'Clients see project updates, approve change orders, and sign documents online. No more texts and phone calls.' },
      { title: 'Change Order Management', desc: 'Create, send, and track change orders digitally. Clients sign online. Your paper trail is automatic.' },
      { title: 'Lien Waiver Tracking', desc: 'Send lien waivers to every sub and supplier after each payment. Track who\'s signed. No closeout surprises.' },
      { title: 'Bid Management', desc: 'Win-rate AI scores every bid opportunity 0–100. Stop chasing bad jobs and focus on your best wins.' },
      { title: 'Free Mobile Field App', desc: 'Your crew logs daily progress, submits photos, and clocks in with GPS. You see everything in real time.' },
    ],
    testimonialName: 'Jennifer R.',
    testimonialTitle: 'Owner, Residential Remodeler, Las Vegas NV',
    testimonialQuote: 'The lien waiver module alone is worth the subscription. We do 30–40 waivers a month across multiple projects. This cut our admin time by 80%.',
    metaTitle: 'Construction Software for Residential Remodelers | Saguaro CRM',
    metaDescription: 'Best construction software for residential remodelers. AI estimating, client portal, change orders, lien waivers, field app. Win more bids and manage projects easier.',
    searchKeywords: ['remodeling contractor software', 'residential remodeler CRM', 'home remodeling project management software', 'best software for remodelers'],
    iconPath: 'M2 22V12L12 2l10 10v10H2z',
  },
  {
    slug: 'commercial-contractors',
    name: 'Commercial General Contractors',
    headline: 'Enterprise-Grade Tools.\nMid-Market Price.\nBuilt for Commercial GCs.',
    subheadline: 'AI blueprint takeoff for large commercial projects, AIA pay apps, multi-division bid packages, certified payroll, and full compliance management — without Procore\'s price tag.',
    painPoints: [
      'Procore costs $50,000–$100,000/year for a mid-size commercial GC',
      'Manual takeoffs on commercial blueprints take 1–2 days per project',
      'Tracking certified payroll across multiple prevailing wage jobs',
      'Managing 50+ subs across multiple CSI divisions on one project',
      'COI tracking and insurance compliance across the whole sub base',
    ],
    keyFeatures: [
      { title: 'AI Commercial Blueprint Takeoff', desc: 'Upload 50-page commercial blueprints. Sage analyzes every division — civil, structural, MEP, finishes — and generates a complete CSI takeoff.' },
      { title: 'Multi-Division Bid Packages', desc: 'Auto-create bid packages by CSI trade division from your takeoff. Invite subs by email. Track responses in one dashboard.' },
      { title: 'AIA G702/G703 Pay Applications', desc: 'Generate AIA pay apps from your SOV, track retention, and submit to owners digitally. Never fill a G702 by hand again.' },
      { title: 'Certified Payroll WH-347', desc: 'Manage prevailing wage compliance across multiple active projects. Davis-Bacon rates auto-populated. Submit to agencies directly.' },
      { title: 'Insurance & COI Compliance', desc: 'Parse ACORD 25 COIs automatically. Track expirations. Flag non-compliant subs before they step on your job site.' },
      { title: 'OSHA 300 Log & Safety', desc: 'Maintain OSHA 300 incident logs, track safety metrics, and run toolbox talks digitally from the field app.' },
    ],
    testimonialName: 'David K.',
    testimonialTitle: 'Owner, Commercial GC, Denver CO',
    testimonialQuote: 'We compared this to Procore and Buildertrend. Saguaro has everything we need at a fraction of the cost, and the AI features are actually useful — not just a gimmick.',
    metaTitle: 'Commercial Construction Software for General Contractors | Saguaro CRM',
    metaDescription: 'Best commercial construction CRM for GCs. AI blueprint takeoff, AIA pay apps, certified payroll, multi-division bid management. Procore alternative at $399/mo.',
    searchKeywords: ['commercial construction software', 'commercial GC software', 'commercial contractor management software', 'procore alternative commercial'],
    iconPath: 'M6 2v20M18 2v20M2 12h20M2 7h4M18 7h4M2 17h4M18 17h4',
  },
  {
    slug: 'roofing-contractors',
    name: 'Roofing Contractors',
    headline: 'Construction Software Built\nfor Roofing Contractors',
    subheadline: 'Estimate faster with AI takeoff, win more jobs with bid intelligence, manage crews with a mobile app that works on any roof, and handle all your lien waivers digitally.',
    painPoints: [
      'Manual takeoffs using measuring tools and spreadsheets for every bid',
      'Losing jobs to competitors who estimate faster',
      'Managing crews on rooftops without reliable cell signal',
      'Paper lien waivers at project closeout with homeowners',
      'Tracking material deliveries and supplier payments across 10+ jobs',
    ],
    keyFeatures: [
      { title: 'AI Roof Takeoff', desc: 'Upload any roof plan or satellite measurement. Sage calculates squares, pitch factors, waste percentages, and full material lists.' },
      { title: 'Bid Intelligence', desc: 'AI win-rate scoring helps you bid the right jobs at the right price. Know your win probability before you spend time estimating.' },
      { title: 'Offline Field App', desc: 'GPS clock-in, daily logs, and photos work even on rooftops with no signal. Perfect for remote residential jobs.' },
      { title: 'Lien Waivers', desc: 'Send conditional and unconditional lien waivers to homeowners and suppliers digitally. State-compliant for all 50 states.' },
      { title: 'Crew Management', desc: 'Schedule roofing crews, track hours, and manage sub payments from your phone.' },
      { title: 'Client Portal', desc: 'Homeowners see project progress, approve upgrades, and sign documents online. No more back-and-forth calls.' },
    ],
    testimonialName: 'Jake T.',
    testimonialTitle: 'Owner, Roofing Contractor, Mesa AZ',
    testimonialQuote: 'I had the whole crew of 14 installed on the field app in under 10 minutes. Just texted them the link. The GPS clock-in alone saves me an hour of timesheet chasing every Friday.',
    metaTitle: 'Roofing Contractor Software | AI Estimating & Job Management | Saguaro',
    metaDescription: 'Best software for roofing contractors. AI roof takeoff, bid intelligence, offline field app, lien waivers, crew management. Start free — no credit card.',
    searchKeywords: ['roofing contractor software', 'roofing CRM', 'roofing estimating software', 'roofing management app', 'best software for roofers'],
    iconPath: 'M3 10.5L12 3l9 7.5V21H3V10.5z',
  },
  {
    slug: 'specialty-subcontractors',
    name: 'Specialty Subcontractors',
    headline: 'Run Your Sub Business\nLike a Top-Tier GC',
    subheadline: 'AI takeoff, digital lien waivers, AIA pay applications, certified payroll, and a mobile field app — everything specialty subs need to get paid faster and win better work.',
    painPoints: [
      'Waiting 60–90 days to get paid because pay apps are done manually',
      'Losing prevailing wage jobs over WH-347 paperwork compliance',
      'Managing multiple GCs and their different document requirements',
      'Tracking lien rights and deadlines across multiple projects',
      'Paper daily logs and inconsistent field documentation',
    ],
    keyFeatures: [
      { title: 'AIA G702/G703 Pay Apps', desc: 'Generate and submit pay applications to your GC in 60 seconds. Never chase payment because of paperwork issues again.' },
      { title: 'Lien Waiver Management', desc: 'Track your lien rights across every project. Send conditional waivers on payment. Protect your money.' },
      { title: 'Certified Payroll WH-347', desc: 'Win more prevailing wage work. Generate DOL-compliant WH-347 forms automatically. Davis-Bacon rates built in.' },
      { title: 'AI Takeoff for Bids', desc: 'Estimate faster with AI takeoff. Win more bids by responding faster than your competition.' },
      { title: 'Field App for Your Crew', desc: 'GPS clock-in, daily logs, RFIs, and inspection forms — all from any phone. Works offline underground or in dead zones.' },
      { title: 'Sub Portal for GCs', desc: 'Accept bid invitations, submit pay apps, and manage compliance documents in one place for all your GC relationships.' },
    ],
    testimonialName: 'Maria S.',
    testimonialTitle: 'Owner, Specialty Sub, Las Vegas NV',
    testimonialQuote: 'The offline mode is huge. We work in basements and dead zones constantly. With our old system we lost data. With this we lose nothing.',
    metaTitle: 'Specialty Subcontractor Software | Lien Waivers, Pay Apps & Field App | Saguaro',
    metaDescription: 'Best software for specialty subcontractors. AIA pay apps, lien waivers, certified payroll WH-347, AI takeoff, offline field app. Get paid faster. Start free.',
    searchKeywords: ['specialty subcontractor software', 'subcontractor management app', 'lien waiver software subcontractors', 'certified payroll software subcontractor'],
    iconPath: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  },
];

export const INDUSTRY_SLUGS = INDUSTRIES.map(i => i.slug);
