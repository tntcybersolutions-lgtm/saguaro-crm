import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const WMO: Record<number, { label: string; icon: string; construction_impact: 'favorable' | 'marginal' | 'adverse' }> = {
  0:  { label: 'Clear Sky',           icon: 'clear',   construction_impact: 'favorable' },
  1:  { label: 'Mostly Clear',        icon: 'clear',   construction_impact: 'favorable' },
  2:  { label: 'Partly Cloudy',       icon: 'cloudy',  construction_impact: 'favorable' },
  3:  { label: 'Overcast',            icon: 'cloudy',  construction_impact: 'favorable' },
  45: { label: 'Foggy',               icon: 'fog',     construction_impact: 'marginal' },
  48: { label: 'Rime Fog',            icon: 'fog',     construction_impact: 'marginal' },
  51: { label: 'Light Drizzle',       icon: 'drizzle', construction_impact: 'marginal' },
  53: { label: 'Moderate Drizzle',    icon: 'drizzle', construction_impact: 'marginal' },
  55: { label: 'Dense Drizzle',       icon: 'rain',    construction_impact: 'adverse' },
  61: { label: 'Slight Rain',         icon: 'rain',    construction_impact: 'marginal' },
  63: { label: 'Moderate Rain',       icon: 'rain',    construction_impact: 'adverse' },
  65: { label: 'Heavy Rain',          icon: 'rain',    construction_impact: 'adverse' },
  71: { label: 'Slight Snow',         icon: 'snow',    construction_impact: 'adverse' },
  73: { label: 'Moderate Snow',       icon: 'snow',    construction_impact: 'adverse' },
  75: { label: 'Heavy Snow',          icon: 'snow',    construction_impact: 'adverse' },
  77: { label: 'Snow Grains',         icon: 'snow',    construction_impact: 'adverse' },
  80: { label: 'Rain Showers',        icon: 'rain',    construction_impact: 'marginal' },
  81: { label: 'Moderate Showers',    icon: 'rain',    construction_impact: 'adverse' },
  82: { label: 'Violent Showers',     icon: 'storm',   construction_impact: 'adverse' },
  85: { label: 'Snow Showers',        icon: 'snow',    construction_impact: 'adverse' },
  95: { label: 'Thunderstorm',        icon: 'storm',   construction_impact: 'adverse' },
  96: { label: 'Thunderstorm + Hail', icon: 'storm',   construction_impact: 'adverse' },
  99: { label: 'Severe Thunderstorm', icon: 'storm',   construction_impact: 'adverse' },
};

function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function generateWorkNotes(temp: number, wind: number, precip: number, humidity: number, uvIndex: number, weatherCode: number): string[] {
  const notes: string[] = [];
  if (temp > 102) notes.push('OSHA heat advisory — mandatory water/shade/rest breaks per OSHA 1926.503');
  else if (temp > 95) notes.push('Heat alert — additional water breaks, monitor workers for heat exhaustion');
  if (temp < 35) notes.push('Freeze risk — protect fresh concrete and masonry, verify admixtures in place');
  else if (temp < 45) notes.push('Cold weather concreting — verify accelerating admixture on site');
  if (wind > 25) notes.push('High wind advisory — crane operations and lifts restricted above 20 mph');
  else if (wind > 15) notes.push('Wind advisory — confirm with crane operator for lift operations');
  if (precip > 0.25) notes.push('Rain warning — cover excavations, protect fresh concrete, verify SWPPP measures');
  else if (precip > 0) notes.push('Wet conditions — earthwork and compaction operations may be affected');
  if (humidity > 85) notes.push('High humidity — masonry and exterior finishes may be affected');
  if (uvIndex > 8) notes.push('High UV — ensure sun protection for all outdoor workers');
  if ([95, 96, 99].includes(weatherCode)) notes.push('Thunderstorm — all crane operations suspended, evacuate elevated work areas');
  if (notes.length === 0) notes.push('Favorable conditions — no weather-related work restrictions');
  return notes;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { latitude, longitude } = body;

    if (latitude == null || longitude == null) {
      return NextResponse.json({ error: 'latitude and longitude are required' }, { status: 400 });
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,weather_code,relative_humidity_2m,cloud_cover,uv_index&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=1`;

    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: 'Weather service unavailable' }, { status: 502 });
    }

    const data = await res.json();
    const current = data.current;
    const daily = data.daily;

    const weatherCode = current?.weather_code ?? 0;
    const wmo = WMO[weatherCode] || WMO[0];
    const tempCurrent = current?.temperature_2m ?? 0;
    const tempHigh = daily?.temperature_2m_max?.[0] ?? tempCurrent;
    const tempLow = daily?.temperature_2m_min?.[0] ?? tempCurrent;
    const windSpeed = current?.wind_speed_10m ?? 0;
    const windDir = current?.wind_direction_10m ?? 0;
    const precipitation = current?.precipitation ?? 0;
    const humidity = current?.relative_humidity_2m ?? 0;
    const uvIndex = current?.uv_index ?? 0;
    const cloudCover = current?.cloud_cover ?? 0;
    const apparentTemp = current?.apparent_temperature ?? tempCurrent;

    // Sunrise/sunset
    const sunrise = daily?.sunrise?.[0] || '';
    const sunset = daily?.sunset?.[0] || '';
    let daylightHours = 0;
    if (sunrise && sunset) {
      const sr = new Date(sunrise).getTime();
      const ss = new Date(sunset).getTime();
      daylightHours = Math.round(((ss - sr) / 3600000) * 10) / 10;
    }
    const sunriseLocal = sunrise ? new Date(sunrise).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
    const sunsetLocal = sunset ? new Date(sunset).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

    // Determine construction impact (override WMO if conditions are worse)
    let constructionImpact = wmo.construction_impact;
    if (tempCurrent > 102 || tempCurrent < 35 || windSpeed > 25 || precipitation > 0.25) {
      constructionImpact = 'adverse';
    } else if (tempCurrent > 95 || tempCurrent < 45 || windSpeed > 15 || precipitation > 0.05) {
      if (constructionImpact === 'favorable') constructionImpact = 'marginal';
    }

    const workNotes = generateWorkNotes(tempCurrent, windSpeed, precipitation, humidity, uvIndex, weatherCode);

    return NextResponse.json({
      conditions: wmo.label,
      icon: wmo.icon,
      construction_impact: constructionImpact,
      temperature_current: Math.round(tempCurrent),
      temperature_high: Math.round(tempHigh),
      temperature_low: Math.round(tempLow),
      apparent_temperature: Math.round(apparentTemp),
      precipitation: Math.round(precipitation * 100) / 100,
      precipitation_probability: daily?.precipitation_probability_max?.[0] ?? 0,
      wind_speed: Math.round(windSpeed),
      wind_direction: windDir,
      wind_direction_label: windDirectionLabel(windDir),
      humidity,
      cloud_cover: cloudCover,
      uv_index: uvIndex,
      sunrise: sunriseLocal,
      sunset: sunsetLocal,
      daylight_hours: daylightHours,
      work_notes: workNotes,
      source: 'open-meteo',
      coordinates: { lat: latitude, lng: longitude },
      as_of: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
