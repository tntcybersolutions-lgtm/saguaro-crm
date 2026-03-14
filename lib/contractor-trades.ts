/**
 * contractor-trades.ts
 * Single source of truth for all contractor trade types, sub-specialties,
 * tradesperson roles, and building types used across the entire app.
 *
 * Import from here — do NOT define local TRADES arrays in individual pages.
 */

// ─── Primary Trade Categories (company / subcontractor level) ─────────────────
// Used in: bid packages, sub-portal, prequalification, directory, subs list, etc.

export const CONTRACTOR_TRADES: readonly string[] = [
  // ── General / Management ──────────────────────────────────────────────────
  'General Contractor',
  'Construction Manager (CM)',
  'Design-Build',
  "Owner's Representative",
  'Program Manager',

  // ── Site Work & Civil ─────────────────────────────────────────────────────
  'Earthwork & Grading',
  'Excavation',
  'Demolition',
  'Environmental Remediation',
  'Site Utilities',
  'Underground Utilities',
  'Storm Drainage',
  'Paving & Asphalt',
  'Concrete Flatwork & Paving',
  'Landscaping & Irrigation',
  'Hardscaping & Paving',
  'Geotechnical / Soils',
  'Survey',

  // ── Concrete & Masonry ────────────────────────────────────────────────────
  'Concrete (Structural)',
  'Concrete (Flatwork & Slabs)',
  'Reinforcing Steel / Rebar',
  'Precast Concrete',
  'Tilt-Up Concrete',
  'Post-Tension Concrete',
  'Masonry / Brick / Block',
  'Stone & Tile Masonry',

  // ── Structural ────────────────────────────────────────────────────────────
  'Structural Steel / Iron Work',
  'Miscellaneous Metals',
  'Ornamental Iron & Architectural Metals',
  'Cold-Formed Steel Framing',
  'Welding & Fabrication',

  // ── Framing & Carpentry ───────────────────────────────────────────────────
  'Wood Framing / Rough Carpentry',
  'Finish Carpentry & Trim',
  'Millwork & Cabinetry',
  'Casework & Built-Ins',
  'Countertops',
  'Doors & Hardware',

  // ── Exterior Envelope ─────────────────────────────────────────────────────
  'Roofing',
  'Roofing (Low-Slope / Membrane)',
  'Roofing (Steep-Slope / Shingle)',
  'Roofing (Metal)',
  'Waterproofing & Dampproofing',
  'Insulation',
  'Exterior Cladding / Siding',
  'Stucco / EIFS',
  'Curtain Wall',
  'Storefront & Entrances',
  'Glazing & Windows',
  'Skylights',

  // ── Interior Finishes ─────────────────────────────────────────────────────
  'Drywall / Metal Framing',
  'Plastering',
  'Acoustical Ceilings & Partitions',
  'Painting & Coatings',
  'Wallcovering',
  'Flooring (General)',
  'Hardwood Flooring',
  'Carpet & Resilient Flooring',
  'Tile & Stone (Interior)',
  'Epoxy Flooring',
  'Polished Concrete',
  'Window Treatments / Blinds',

  // ── MEP — Mechanical, Electrical, Plumbing ────────────────────────────────
  'Electrical',
  'Electrical (High Voltage)',
  'Low Voltage / Data / AV',
  'Security & Access Control',
  'Fire Alarm',
  'Plumbing',
  'HVAC / Mechanical',
  'Sheet Metal / Ductwork',
  'Mechanical Insulation',
  'Controls / Building Automation (BAS)',
  'Refrigeration',
  'Medical Gas',
  'Process Piping',
  'Compressed Air Systems',

  // ── Fire & Life Safety ────────────────────────────────────────────────────
  'Fire Suppression / Sprinklers',
  'Fire Protection (General)',
  'Kitchen Hood & Suppression',
  'Emergency Generator & UPS',

  // ── Vertical Transportation ───────────────────────────────────────────────
  'Elevator & Escalator',
  'Moving Walks & Conveyors',
  'Material Handling / Lifts',
  'Dock Equipment',

  // ── Specialty Systems ─────────────────────────────────────────────────────
  'Food Service Equipment',
  'Commercial Kitchen',
  'Audiovisual / Technology',
  'Signage & Wayfinding',
  'Pool & Spa',
  'Athletic & Recreational Equipment',
  'Playground Equipment',
  'Parking Equipment',
  'Fuel Systems',
  'Solar / Photovoltaic',
  'Wind & Renewable Energy',
  'Modular / Prefabricated Construction',

  // ── Specialty Finishes ────────────────────────────────────────────────────
  'Caulking & Sealants',
  'Cleaning & Final',
  'Specialties (Bath Accessories, Lockers, Etc.)',
  'Furnishings (FF&E)',

  // ── Other ─────────────────────────────────────────────────────────────────
  'Other',
] as const;

// ─── Tradesperson Roles (individual labor classification) ─────────────────────
// Used in: T&M tickets, certified payroll, resource planning, timesheets

export const TRADESPERSON_ROLES: readonly string[] = [
  // Management & Supervision
  'Project Manager',
  'Superintendent',
  'Assistant Superintendent',
  'Foreman / Supervisor',
  'Safety Officer / Safety Manager',
  'Quality Control Inspector',
  'Field Engineer',
  'Estimator',

  // General Labor
  'General Laborer',
  'Skilled Laborer',
  'Cleanup / Porter',

  // Electrical
  'Master Electrician',
  'Journeyman Electrician',
  'Apprentice Electrician (1st Year)',
  'Apprentice Electrician (2nd Year)',
  'Apprentice Electrician (3rd Year)',
  'Apprentice Electrician (4th Year)',
  'Wireman',
  'Lineman',
  'Cable Splicer',

  // Plumbing
  'Master Plumber',
  'Journeyman Plumber',
  'Apprentice Plumber (1st Year)',
  'Apprentice Plumber (2nd Year)',
  'Apprentice Plumber (3rd Year)',
  'Apprentice Plumber (4th Year)',
  'Pipefitter (Journeyman)',
  'Pipefitter (Apprentice)',
  'Steamfitter',
  'Sprinkler Fitter',

  // HVAC & Sheet Metal
  'HVAC Technician',
  'Sheet Metal Worker (Journeyman)',
  'Sheet Metal Worker (Apprentice)',
  'Refrigeration Mechanic',
  'Boilermaker',
  'Insulator (Mechanical)',

  // Carpenter / Framing
  'Carpenter (Journeyman)',
  'Carpenter (Apprentice)',
  'Finish Carpenter',
  'Cabinet Installer',
  'Millwork Installer',

  // Concrete & Masonry
  'Cement Mason (Journeyman)',
  'Cement Mason (Apprentice)',
  'Concrete Finisher',
  'Form Setter',
  'Brick Mason (Journeyman)',
  'Brick Mason (Apprentice)',
  'Tile Setter (Journeyman)',
  'Tile Setter (Apprentice)',

  // Iron Work & Structural Steel
  'Ironworker (Structural)',
  'Ironworker (Ornamental)',
  'Ironworker (Reinforcing)',
  'Ironworker (Apprentice)',
  'Welder (Certified)',
  'Welder (Helper)',

  // Roofing
  'Roofer (Journeyman)',
  'Roofer (Apprentice)',
  'Waterproof Membrane Applicator',

  // Painting & Finishes
  'Painter (Journeyman)',
  'Painter (Apprentice)',
  'Drywall Finisher / Taper',
  'Drywall Installer',
  'Plasterer',
  'Glazier',
  'Flooring Installer',
  'Carpet Layer',

  // Equipment Operators
  'Equipment Operator (Group 1 — Crane)',
  'Equipment Operator (Group 2 — Excavator)',
  'Equipment Operator (Group 3 — Grader)',
  'Equipment Operator (Group 4 — Forklift)',
  'Truck Driver / Teamster',
  'CDL Driver',
  'Crane Operator',

  // Other
  'Elevator Constructor',
  'Other',
] as const;

// ─── Building / Project Types ─────────────────────────────────────────────────
// Used in: project creation, takeoff, proposals, intelligence

export const BUILDING_TYPES: readonly string[] = [
  'Commercial Office',
  'Medical Office / MOB',
  'Hospital / Healthcare',
  'Retail',
  'Restaurant / Food Service',
  'Industrial / Warehouse',
  'Manufacturing / Production',
  'Cold Storage / Refrigerated',
  'Data Center',
  'Laboratory / R&D',
  'Educational — K-12',
  'Educational — Higher Ed / University',
  'Government / Municipal',
  'Courthouse / Justice',
  'Religious / Institutional',
  'Hospitality / Hotel',
  'Multi-Family Residential (5+ units)',
  'Single-Family Residential',
  'Senior Living / Assisted Living',
  'Mixed-Use',
  'Sports & Recreation',
  'Arena / Stadium',
  'Parking Structure',
  'Auto Dealership',
  'Grocery / Supermarket',
  'Tenant Improvement (TI)',
  'Historic Renovation',
  'Civil / Infrastructure',
  'Other',
] as const;

// ─── Company / Contractor Type ────────────────────────────────────────────────
// Used in: onboarding, company profile, subs list

export const COMPANY_TYPES: readonly string[] = [
  'General Contractor',
  'Subcontractor',
  'Specialty Contractor',
  'Design-Build Firm',
  'Construction Manager',
  'Owner / Developer',
  'Architect / Engineer',
  "Owner's Representative",
  'Material Supplier',
  'Equipment Rental',
  'Other',
] as const;

// ─── Convenience flat list alias (backward compat) ────────────────────────────
export const TRADES = CONTRACTOR_TRADES;

export type ContractorTrade = (typeof CONTRACTOR_TRADES)[number];
export type TradespersonRole = (typeof TRADESPERSON_ROLES)[number];
export type BuildingType = (typeof BUILDING_TYPES)[number];
