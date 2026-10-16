import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * POST /api/smart-packages/customize-public   (public — no auth required)
 *
 * Powers the "Get Local Pricing" control on the public /design/packages page.
 * Resolves the visitor's ZIP to a state (free Nominatim lookup), pulls that
 * state's utility rates from roi_configs, and adjusts each package's pricing /
 * savings by the local-vs-baseline cost multiplier.
 *
 * Real work only:
 *  - If the ZIP can't be resolved -> honest 400.
 *  - If we have no rate data for that state, we return the packages UNCHANGED
 *    with applied:false so the UI can say "national averages" rather than
 *    pretending numbers were localized.
 *
 * (The authenticated CRM variant /api/smart-packages/customize keys off a
 *  customer_id + tier and is unrelated to this public marketing flow.)
 */

type PackageItem = { name: string; included: boolean };
type SmartPackage = {
  id: string;
  name: string;
  tier: string;
  tagline: string;
  items: PackageItem[];
  price_low: number;
  price_high: number;
  annual_savings: number;
  roi_years: number;
  comfort_score: number;
  home_value_increase: number;
};

const BASE_ELECTRICITY = 0.128; // AZ baseline $/kWh
const BASE_GAS = 1.05; // AZ baseline $/therm

function stateToCode(name: string): string {
  const map: Record<string, string> = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
    California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
    Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
    Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
    Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
    Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
    Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
    Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
    Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
    Wisconsin: 'WI', Wyoming: 'WY',
  };
  if (name.length === 2) return name.toUpperCase();
  return map[name] || name;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zip: string = String(body?.zip ?? '').trim();
    const packages: SmartPackage[] = Array.isArray(body?.packages) ? body.packages : [];

    if (!/^\d{5}$/.test(zip)) {
      return NextResponse.json({ error: 'A valid 5-digit ZIP is required' }, { status: 400 });
    }
    if (packages.length === 0) {
      return NextResponse.json({ error: 'packages are required' }, { status: 400 });
    }

    // Resolve ZIP -> city/state via free Nominatim (no key required)
    let city = '';
    let state = '';
    let stateCode = '';
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&addressdetails=1&limit=1`,
        { headers: { 'User-Agent': 'SaguaroControl/1.0' } },
      );
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        const a = results[0].address || {};
        city = a.city || a.town || a.village || a.hamlet || a.county || '';
        state = a.state || '';
        stateCode = stateToCode(state);
      }
    } catch {
      /* fall through to unresolved */
    }

    if (!stateCode) {
      return NextResponse.json(
        { error: 'Could not resolve that ZIP code. Please double-check it.' },
        { status: 400 },
      );
    }

    // Pull that state's utility rates
    const db = createServerClient();
    const { data: roiConfig } = await db
      .from('roi_configs')
      .select('electricity_kwh, gas_therm')
      .eq('state', stateCode)
      .limit(1)
      .maybeSingle();

    if (!roiConfig) {
      // Honest: we located them but have no local rate data — do not fake an adjustment.
      return NextResponse.json({
        packages,
        geo: { city, state, state_code: stateCode },
        applied: false,
      });
    }

    const elec = parseFloat(String(roiConfig.electricity_kwh)) || BASE_ELECTRICITY;
    const gas = parseFloat(String(roiConfig.gas_therm)) || BASE_GAS;
    const elecMult = elec / BASE_ELECTRICITY;
    const gasMult = gas / BASE_GAS;
    const costMult = (elecMult + gasMult) / 2;

    const adjusted: SmartPackage[] = packages.map((p) => {
      const price_low = Math.round(p.price_low * costMult);
      const price_high = Math.round(p.price_high * costMult);
      const annual_savings = Math.round(p.annual_savings * elecMult);
      const avgCost = (price_low + price_high) / 2;
      const roi_years =
        annual_savings > 0 ? parseFloat((avgCost / annual_savings).toFixed(1)) : p.roi_years;
      return { ...p, price_low, price_high, annual_savings, roi_years };
    });

    return NextResponse.json({
      packages: adjusted,
      geo: { city, state, state_code: stateCode },
      applied: true,
      cost_multiplier: parseFloat(costMult.toFixed(2)),
    });
  } catch (e) {
    return apiError('smart-packages/customize-public POST', e);
  }
}
