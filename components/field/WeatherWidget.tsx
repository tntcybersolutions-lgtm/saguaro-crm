'use client';
import React, { useEffect, useState, useCallback } from 'react';

const GOLD = '#C8960F';
const GREEN = '#22C55E';
const RED = '#EF4444';
const DIM = '#8BAAC8';
const TEXT = '#F0F4FF';

const CACHE_KEY = 'saguaro_weather_cache';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

interface WeatherData {
  temperature: number;
  condition: string;
  conditionCode: number;
  windSpeed: number;
  humidity: number;
  hourlyForecast: { hour: string; temp: number }[];
  fetchedAt: number;
}

type WorkImpact = 'GREEN' | 'YELLOW' | 'RED';

interface WorkImpactResult {
  level: WorkImpact;
  label: string;
}

const shimmerKeyframes = `
@keyframes ww-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`;

const WMO_CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Light rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Moderate showers',
  82: 'Heavy showers',
  85: 'Light snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm + hail',
  99: 'Thunderstorm + heavy hail',
};

function getConditionIcon(code: number): string {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 55) return '🌦️';
  if (code >= 61 && code <= 65) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371);
}

function evaluateWorkImpact(temp: number, wind: number, code: number): WorkImpactResult {
  const isLightning = code >= 95;
  const isHeavyRain = code === 65 || code === 82;
  const isHeavySnow = code === 75 || code === 86;
  const isLightPrecip = (code >= 51 && code <= 53) || code === 61 || code === 80;

  // RED conditions
  if (temp > 105 || temp < 32 || wind > 40 || isLightning || isHeavyRain || isHeavySnow) {
    return { level: 'RED', label: 'Stop Work' };
  }

  // YELLOW conditions
  if (
    (temp >= 95 && temp <= 105) ||
    (temp >= 32 && temp < 40) ||
    (wind >= 25 && wind <= 40) ||
    isLightPrecip
  ) {
    return { level: 'YELLOW', label: 'Caution' };
  }

  // GREEN
  return { level: 'GREEN', label: 'Good Conditions' };
}

function getImpactColor(level: WorkImpact): string {
  switch (level) {
    case 'GREEN': return GREEN;
    case 'YELLOW': return GOLD;
    case 'RED': return RED;
  }
}

function getCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as WeatherData;
    if (Date.now() - cached.fetchedAt > CACHE_TTL) return null;
    return cached;
  } catch {
    return null;
  }
}

function cacheWeather(data: WeatherData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage might be full or unavailable
  }
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', lat.toString());
      url.searchParams.set('longitude', lon.toString());
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
      url.searchParams.set('hourly', 'temperature_2m,weather_code');
      url.searchParams.set('temperature_unit', 'fahrenheit');
      url.searchParams.set('wind_speed_unit', 'mph');
      url.searchParams.set('forecast_days', '1');
      url.searchParams.set('timezone', 'auto');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Weather API error (${res.status})`);
      const json = await res.json();

      const current = json.current;
      const hourly = json.hourly;
      const nowHourIndex = new Date().getHours();

      const hourlyForecast: { hour: string; temp: number }[] = [];
      for (let i = 1; i <= 6; i++) {
        const idx = nowHourIndex + i;
        if (idx < (hourly?.time?.length || 0)) {
          const h = new Date(hourly.time[idx]);
          hourlyForecast.push({
            hour: h.toLocaleTimeString([], { hour: 'numeric' }),
            temp: Math.round(hourly.temperature_2m[idx]),
          });
        }
      }

      const data: WeatherData = {
        temperature: Math.round(current.temperature_2m),
        condition: WMO_CONDITIONS[current.weather_code] || 'Unknown',
        conditionCode: current.weather_code,
        windSpeed: Math.round(current.wind_speed_10m),
        humidity: Math.round(current.relative_humidity_2m),
        hourlyForecast,
        fetchedAt: Date.now(),
      };

      cacheWeather(data);
      setWeather(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Weather fetch failed';
      // Try loading from cache on error
      const cached = getCachedWeather();
      if (cached) {
        setWeather(cached);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Try cache first
    const cached = getCachedWeather();
    if (cached) {
      setWeather(cached);
      setLoading(false);
    }

    if (!navigator.geolocation) {
      if (!cached) setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        if (!cached) {
          setError('Weather unavailable \u2014 check your location settings');
        }
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [fetchWeather]);

  const cardStyle: React.CSSProperties = {
    background: 'rgba(26,31,46,0.7)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid #EEF0F3',
    borderRadius: 16,
    overflow: 'hidden',
  };

  if (loading && !weather) {
    return (
      <div style={cardStyle}>
        <style>{shimmerKeyframes}</style>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)',
              backgroundSize: '800px 100%',
              animation: 'ww-shimmer 1.5s infinite linear',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{
                width: '50%', height: 20, borderRadius: 6, marginBottom: 6,
                background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)',
                backgroundSize: '800px 100%',
                animation: 'ww-shimmer 1.5s infinite linear',
              }} />
              <div style={{
                width: '35%', height: 12, borderRadius: 6,
                background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)',
                backgroundSize: '800px 100%',
                animation: 'ww-shimmer 1.5s infinite linear',
              }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 48, borderRadius: 8,
                background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)',
                backgroundSize: '800px 100%',
                animation: 'ww-shimmer 1.5s infinite linear',
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !weather) {
    return (
      <div style={cardStyle}>
        <div style={{
          padding: '28px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🌐</div>
          <p style={{ margin: 0, fontSize: 13, color: DIM, lineHeight: 1.5 }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!weather) return null;

  const impact = evaluateWorkImpact(weather.temperature, weather.windSpeed, weather.conditionCode);
  const impactColor = getImpactColor(impact.level);

  return (
    <div style={cardStyle}>
      <div style={{ padding: 20 }}>
        {/* Top row: icon + temp + condition */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <span style={{ fontSize: 36, lineHeight: 1 }}>
            {getConditionIcon(weather.conditionCode)}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontSize: 28,
                fontWeight: 800,
                color: TEXT,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {weather.temperature}
              </span>
              <span style={{ fontSize: 14, color: DIM, fontWeight: 600 }}>&deg;F</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>
              {weather.condition}
            </p>
          </div>

          {/* Work Impact Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            background: `${impactColor}15`,
            border: `1px solid ${impactColor}30`,
            borderRadius: 8,
          }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: impactColor,
              boxShadow: `0 0 6px ${impactColor}80`,
            }} />
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: impactColor,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {impact.label}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex',
          gap: 0,
          marginBottom: 16,
          padding: '10px 0',
          borderTop: '1px solid #F3F4F6',
          borderBottom: '1px solid #F3F4F6',
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 10, color: DIM, marginBottom: 2 }}>Wind</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
              {weather.windSpeed} <span style={{ fontSize: 10, color: DIM, fontWeight: 500 }}>mph</span>
            </p>
          </div>
          <div style={{ width: 1, background: '#EEF0F3' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 10, color: DIM, marginBottom: 2 }}>Humidity</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
              {weather.humidity}<span style={{ fontSize: 10, color: DIM, fontWeight: 500 }}>%</span>
            </p>
          </div>
        </div>

        {/* Hourly forecast */}
        {weather.hourlyForecast.length > 0 && (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Next Hours
            </p>
            <div style={{ display: 'flex', gap: 0 }}>
              {weather.hourlyForecast.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '8px 2px',
                    background: i % 2 === 0 ? '#FAFBFC' : 'transparent',
                    borderRadius: 6,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 9, color: DIM, marginBottom: 4 }}>
                    {h.hour}
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 700,
                    color: TEXT,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {h.temp}&deg;
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
