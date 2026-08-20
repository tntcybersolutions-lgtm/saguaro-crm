import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * POST /api/customers/geo  (public — no auth required)
 * Accepts { ip } or { latitude, longitude } or { zip_code }.
 * Uses ip-api.com (free, no key) to resolve location.
 * Returns geo data + utility rates from roi_configs for the state.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { ip, latitude, longitude, zip_code } = body;

    let geoData: {
      city: string;
      state: string;
      state_code: string;
      zip: string;
      lat: number;
      lng: number;
      country: string;
      timezone: string;
    } | null = null;

    // Strategy 1: IP lookup via ip-api.com
    if (ip) {
      const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,region,regionName,zip,lat,lon,country,timezone`);
      const geo = await res.json();
      if (geo.status === 'success') {
        geoData = {
          city: geo.city,
          state: geo.regionName,
          state_code: geo.region,
          zip: geo.zip,
          lat: geo.lat,
          lng: geo.lon,
          country: geo.country,
          timezone: geo.timezone,
        };
      }
    }

    // Strategy 2: Reverse geocode from lat/lng via ip-api (using lat/lng as a pass-through)
    if (!geoData && latitude && longitude) {
      // ip-api doesn't support reverse geocode, so we use a free Nominatim call
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { 'User-Agent': 'SaguaroCRM/1.0' } },
      );
      const geo = await res.json();
      if (geo.address) {
        geoData = {
          city: geo.address.city || geo.address.town || geo.address.village || '',
          state: geo.address.state || '',
          state_code: stateToCode(geo.address.state || ''),
          zip: geo.address.postcode || '',
          lat: parseFloat(geo.lat),
          lng: parseFloat(geo.lon),
          country: geo.address.country || 'US',
          timezone: '',
        };
      }
    }

    // Strategy 3: Zip code lookup via ip-api batch or Nominatim
    if (!geoData && zip_code) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${zip_code}&country=US&format=json&addressdetails=1&limit=1`,
        { headers: { 'User-Agent': 'SaguaroCRM/1.0' } },
      );
      const results = await res.json();
      if (results.length > 0) {
        const geo = results[0];
        geoData = {
          city: geo.address?.city || geo.address?.town || geo.address?.village || '',
          state: geo.address?.state || '',
          state_code: stateToCode(geo.address?.state || ''),
          zip: zip_code,
          lat: parseFloat(geo.lat),
          lng: parseFloat(geo.lon),
          country: 'US',
          timezone: '',
        };
      }
    }

    if (!geoData) {
      return NextResponse.json(
        { error: 'Could not resolve location. Provide ip, latitude/longitude, or zip_code.' },
        { status: 400 },
      );
    }

    // Look up roi_configs for the state
    const db = createServerClient();
    const { data: roiConfig } = await db
      .from('roi_configs')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('state', geoData.state_code)
      .limit(1)
      .single();

    // Determine climate zone from latitude
    const climateZone = getClimateZone(geoData.lat);

    return NextResponse.json({
      geo: geoData,
      climate_zone: climateZone,
      utility_rates: roiConfig
        ? {
            electricity_kwh: roiConfig.electricity_kwh,
            gas_therm: roiConfig.gas_therm,
            water_gallon: roiConfig.water_gallon,
            avg_home_price: roiConfig.avg_home_price,
            permit_cost_avg: roiConfig.permit_cost_avg,
          }
        : null,
      roi_config_found: !!roiConfig,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Map full state name to 2-letter code. */
function stateToCode(name: string): string {
  const map: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY',
  };
  // If already 2-letter code, return as-is
  if (name.length === 2) return name.toUpperCase();
  return map[name] || name;
}

/** Rough climate zone from latitude. */
function getClimateZone(lat: number): string {
  const absLat = Math.abs(lat);
  if (absLat >= 45) return 'cold';
  if (absLat >= 38) return 'mixed';
  if (absLat >= 30) return 'hot-humid';
  return 'hot-dry';
}
