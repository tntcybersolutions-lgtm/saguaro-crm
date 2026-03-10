// lib/construction-intelligence.ts
// CSI MasterFormat divisions lookup
// Davis-Bacon prevailing wage rates
// Bid jacket auto-populate from takeoff
// Historical bid context for AI prompts

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CSIDivision {
  name: string;
  trades: string[];
}

export interface BidRecord {
  id?: string;
  tenant_id?: string;
  project_name: string;
  project_type?: string;
  bid_date?: string;
  bid_amount?: number;
  actual_cost?: number;
  margin_pct?: number;
  outcome?: 'won' | 'lost' | 'pending' | 'withdrawn';
  loss_reason?: string;
  awarded_to?: string;
  location?: string;
  state?: string;
  trades?: string[];
  notes?: string;
}

export interface SubPerformance {
  id?: string;
  tenant_id?: string;
  sub_id?: string;
  sub_name: string;
  trade: string;
  email?: string;
  phone?: string;
  total_bids?: number;
  won_bids?: number;
  win_rate?: number;
  avg_bid_delta?: number;
  last_project_date?: string;
  avg_rating?: number;
  state?: string;
  notes?: string;
}

// ─── CSI MasterFormat Divisions ───────────────────────────────────────────────

export const CSI_DIVISIONS: Record<string, CSIDivision> = {
  '01': { name: 'General Requirements', trades: ['General Contractor', 'PM', 'Superintendent'] },
  '02': { name: 'Existing Conditions', trades: ['Demolition', 'Abatement', 'Survey'] },
  '03': { name: 'Concrete', trades: ['Concrete', 'Formwork', 'Rebar', 'Ready-Mix'] },
  '04': { name: 'Masonry', trades: ['Masonry', 'Brick', 'CMU', 'Stone'] },
  '05': { name: 'Metals', trades: ['Structural Steel', 'Misc Metals', 'Ornamental'] },
  '06': { name: 'Wood, Plastics & Composites', trades: ['Rough Framing', 'Finish Carpentry', 'Millwork', 'Casework'] },
  '07': { name: 'Thermal & Moisture Protection', trades: ['Roofing', 'Waterproofing', 'Insulation', 'Caulking'] },
  '08': { name: 'Openings', trades: ['Doors & Frames', 'Windows', 'Glass & Glazing', 'Hardware'] },
  '09': { name: 'Finishes', trades: ['Drywall', 'Painting', 'Flooring', 'Tile', 'Acoustic Ceiling'] },
  '10': { name: 'Specialties', trades: ['Signage', 'Toilet Partitions', 'Fire Extinguishers'] },
  '11': { name: 'Equipment', trades: ['Kitchen Equipment', 'Laundry', 'Medical Equipment'] },
  '12': { name: 'Furnishings', trades: ['Casework', 'Furniture', 'Window Treatments'] },
  '13': { name: 'Special Construction', trades: ['Pre-engineered Buildings', 'Pools', 'Special Structures'] },
  '14': { name: 'Conveying Equipment', trades: ['Elevators', 'Escalators', 'Lifts'] },
  '21': { name: 'Fire Suppression', trades: ['Fire Sprinkler', 'Fire Suppression'] },
  '22': { name: 'Plumbing', trades: ['Plumbing', 'Medical Gas', 'Plumbing Fixtures'] },
  '23': { name: 'HVAC', trades: ['HVAC', 'Mechanical', 'Sheet Metal', 'Controls', 'Balancing'] },
  '26': { name: 'Electrical', trades: ['Electrical', 'Low Voltage', 'Fire Alarm', 'Lighting'] },
  '27': { name: 'Communications', trades: ['Data/Telecom', 'AV Systems', 'Security Systems'] },
  '28': { name: 'Electronic Safety & Security', trades: ['Access Control', 'CCTV', 'Intrusion Detection'] },
  '31': { name: 'Earthwork', trades: ['Excavation', 'Grading', 'Compaction', 'Dewatering'] },
  '32': { name: 'Exterior Improvements', trades: ['Paving', 'Landscaping', 'Fencing', 'Curb & Gutter'] },
  '33': { name: 'Utilities', trades: ['Site Utilities', 'Underground Piping', 'Storm Drain'] },
};

/**
 * Map a material/description string to a CSI MasterFormat division code.
 * Returns '01' (General Requirements) as a safe default.
 */
export function classifyToCSI(description: string): string {
  const d = description.toLowerCase();
  if (d.match(/concrete|rebar|formwork|slab|footing|foundation/)) return '03';
  if (d.match(/masonry|brick|block|cmu|stone/)) return '04';
  if (d.match(/steel|metal|beam|column|joist|deck/)) return '05';
  if (d.match(/lumber|wood|framing|sheathing|plywood|osb|stud/)) return '06';
  if (d.match(/roof|waterproof|insul|vapor|felt|underlayment/)) return '07';
  if (d.match(/door|window|glass|glazing|storefront|frame/)) return '08';
  if (d.match(/drywall|gypsum|paint|floor|tile|carpet|ceiling|acoustic/)) return '09';
  if (d.match(/sprinkler|fire suppression/)) return '21';
  if (d.match(/plumb|pipe|fixture|drain|toilet|lavatory/)) return '22';
  if (d.match(/hvac|duct|mechanical|air handler|chiller|boiler|fan/)) return '23';
  if (d.match(/electrical|conduit|wire|panel|outlet|switch|light/)) return '26';
  if (d.match(/data|telecom|fiber|cat6|av |audio|video/)) return '27';
  if (d.match(/excavat|grade|fill|compact|earthwork|soil/)) return '31';
  if (d.match(/pav|asphalt|concrete walk|landscape|fence|curb/)) return '32';
  if (d.match(/utility|sewer|water main|storm/)) return '33';
  return '01';
}

/**
 * Return the CSI division object for a code, or null if not found.
 */
export function getCSIDivision(code: string): CSIDivision | null {
  return CSI_DIVISIONS[code] ?? null;
}

// ─── Prevailing Wages (Davis-Bacon) ───────────────────────────────────────────

/** Sample Davis-Bacon prevailing wage rates ($/hr) by state and trade. */
export const PREVAILING_WAGES: Record<string, Record<string, number>> = {
  AZ: {
    Carpenter: 32.50,
    Electrician: 38.75,
    Plumber: 36.00,
    'Iron Worker': 34.25,
    'Operating Engineer': 35.50,
    Laborer: 22.75,
    Painter: 28.00,
    Roofer: 30.50,
  },
  CA: {
    Carpenter: 52.40,
    Electrician: 62.85,
    Plumber: 58.20,
    'Iron Worker': 55.10,
    'Operating Engineer': 57.80,
    Laborer: 38.50,
    Painter: 46.75,
    Roofer: 50.30,
  },
  TX: {
    Carpenter: 28.30,
    Electrician: 32.60,
    Plumber: 30.80,
    'Iron Worker': 29.50,
    'Operating Engineer': 30.20,
    Laborer: 19.40,
    Painter: 24.50,
    Roofer: 26.80,
  },
  FL: {
    Carpenter: 27.80,
    Electrician: 31.50,
    Plumber: 29.40,
    'Iron Worker': 28.60,
    'Operating Engineer': 29.80,
    Laborer: 18.90,
    Painter: 23.80,
    Roofer: 25.90,
  },
  NY: {
    Carpenter: 68.20,
    Electrician: 82.40,
    Plumber: 76.50,
    'Iron Worker': 72.30,
    'Operating Engineer': 74.80,
    Laborer: 52.60,
    Painter: 61.40,
    Roofer: 65.80,
  },
};

/**
 * Look up the Davis-Bacon prevailing wage for a state+trade combination.
 * Returns null when data is not available for the combination.
 */
export function getPrevailingWage(state: string, trade: string): number | null {
  return PREVAILING_WAGES[state]?.[trade] ?? null;
}

// ─── Bid History Context for AI ───────────────────────────────────────────────

/**
 * Build a plain-text context block describing this tenant's recent bid history.
 * Designed to be injected into AI system prompts.
 * Never throws — returns a safe fallback string on any error.
 */
export async function buildBidHistoryContext(
  supabase: any,
  tenantId: string,
  projectType?: string,
  _trades?: string[],
): Promise<string> {
  try {
    let q = supabase
      .from('bid_history')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('bid_date', { ascending: false })
      .limit(20);

    if (projectType) {
      q = q.eq('project_type', projectType);
    }

    const { data, error } = await q;

    if (error || !data?.length) {
      return 'No previous bid history available.';
    }

    const wins: BidRecord[] = data.filter((b: BidRecord) => b.outcome === 'won');
    const losses: BidRecord[] = data.filter((b: BidRecord) => b.outcome === 'lost');
    const winRate =
      data.length > 0 ? Math.round((wins.length / data.length) * 100) : 0;
    const avgMargin =
      wins.reduce((sum: number, b: BidRecord) => sum + (b.margin_pct ?? 0), 0) /
      (wins.length || 1);

    const recent = data
      .slice(0, 5)
      .map(
        (b: BidRecord) =>
          `${b.project_name} (${b.outcome}, $${(b.bid_amount ?? 0).toLocaleString()}, margin ${b.margin_pct ?? 0}%)`,
      )
      .join('; ');

    return `BID HISTORY CONTEXT:
- Total bids in history: ${data.length} (${wins.length} won, ${losses.length} lost)
- Overall win rate: ${winRate}%
- Average winning margin: ${avgMargin.toFixed(1)}%
- Recent bids: ${recent}`;
  } catch {
    return 'Bid history unavailable.';
  }
}

// ─── Sub Performance Lookup ───────────────────────────────────────────────────

/**
 * Fetch the top-performing subcontractors for a given trade from historical data.
 * Never throws — returns empty array on error.
 */
export async function getTopSubsForTrade(
  supabase: any,
  tenantId: string,
  trade: string,
): Promise<SubPerformance[]> {
  try {
    const { data } = await supabase
      .from('sub_performance')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('trade', trade)
      .order('win_rate', { ascending: false })
      .limit(5);

    return data ?? [];
  } catch {
    return [];
  }
}
