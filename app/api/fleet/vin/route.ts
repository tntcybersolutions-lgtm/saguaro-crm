/**
 * VIN decode — free NHTSA vPIC API (no key). GC types a VIN, we auto-fill
 * year/make/model/body/engine. Also used for the "add vehicle" flow.
 */
import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: NextRequest) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const vin = (new URL(req.url).searchParams.get('vin') || '').trim().toUpperCase();
  if (vin.length < 11) return Response.json({ error: 'Enter a full VIN' }, { status: 400 });
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, { cache: 'no-store' });
    const d = await r.json();
    const v = (d?.Results && d.Results[0]) || {};
    const num = (x: any) => { const n = parseInt(String(x || ''), 10); return Number.isFinite(n) ? n : undefined; };
    const clean = (x: any) => { const s = String(x || '').trim(); return s && s !== 'Not Applicable' ? s : undefined; };
    return Response.json({
      vin,
      year: num(v.ModelYear),
      make: clean(v.Make),
      model: clean(v.Model),
      trim: clean(v.Trim),
      bodyClass: clean(v.BodyClass),
      vehicleType: clean(v.VehicleType),
      engine: [clean(v.DisplacementL) ? `${clean(v.DisplacementL)}L` : null, clean(v.EngineCylinders) ? `${clean(v.EngineCylinders)}cyl` : null, clean(v.FuelTypePrimary)].filter(Boolean).join(' ') || undefined,
      drive: clean(v.DriveType),
      plant: [clean(v.PlantCity), clean(v.PlantCountry)].filter(Boolean).join(', ') || undefined,
      errorText: clean(v.ErrorText) && String(v.ErrorText).startsWith('0') ? undefined : clean(v.ErrorText),
    });
  } catch (e: any) {
    return apiError('fleet/vin', e, "VIN lookup failed", 200);
  }
}
