'use client';
import React, { useState, useEffect, useCallback } from 'react';

/* ─── Palette ─── */
const BG = '#F8F9FB', CARD = '#F8F9FB', GOLD = '#C8960F', GREEN = '#22C55E';
const BORDER = '#2A3040', TEXT = '#F0F4FF', DIM = '#8B9DB8', DARK = '#141922';
const BLUE = '#3B82F6', PURPLE = '#8B5CF6', AMBER = '#F59E0B';

const glass: React.CSSProperties = {
  background: `${CARD}CC`, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${BORDER}`, borderRadius: 16,
};

type PackageItem = { name: string; included: boolean };
type SmartPackage = {
  id: string; name: string; tier: string; tagline: string;
  items: PackageItem[]; price_low: number; price_high: number;
  annual_savings: number; roi_years: number; comfort_score: number;
  home_value_increase: number;
};

const TIER_COLORS: Record<string, string> = {
  essential: BLUE, connected: GREEN, premium: GOLD, ultimate: PURPLE,
};

const FALLBACK_PACKAGES: SmartPackage[] = [
  {
    id: 'essential', name: 'Essential', tier: 'essential',
    tagline: 'Smart basics for everyday comfort',
    items: [
      { name: 'Smart Thermostat', included: true },
      { name: 'Smart Lighting (5 rooms)', included: true },
      { name: 'Smart Doorbell Camera', included: true },
      { name: 'Smart Smoke Detectors', included: true },
      { name: 'Smart Plugs (10)', included: true },
      { name: 'Solar Panels', included: false },
      { name: 'Battery Wall', included: false },
      { name: 'EV Charging', included: false },
      { name: 'Smart Irrigation', included: false },
      { name: 'Whole-Home Automation', included: false },
    ],
    price_low: 2800, price_high: 5200, annual_savings: 720,
    roi_years: 5, comfort_score: 65, home_value_increase: 3,
  },
  {
    id: 'connected', name: 'Connected', tier: 'connected',
    tagline: 'A truly intelligent home experience',
    items: [
      { name: 'Smart Thermostat', included: true },
      { name: 'Smart Lighting (All Rooms)', included: true },
      { name: 'Security Camera System', included: true },
      { name: 'Smart Lock System', included: true },
      { name: 'Smart Blinds', included: true },
      { name: 'Smart Irrigation', included: true },
      { name: 'Voice Control Hub', included: true },
      { name: 'Solar Panels', included: false },
      { name: 'Battery Wall', included: false },
      { name: 'EV Charging', included: false },
    ],
    price_low: 8500, price_high: 14000, annual_savings: 1440,
    roi_years: 7, comfort_score: 78, home_value_increase: 6,
  },
  {
    id: 'premium', name: 'Premium', tier: 'premium',
    tagline: 'Energy independence meets luxury',
    items: [
      { name: 'Smart Thermostat', included: true },
      { name: 'Smart Lighting (All Rooms)', included: true },
      { name: 'Full Security System', included: true },
      { name: 'Smart Lock System', included: true },
      { name: 'Smart Blinds & Shades', included: true },
      { name: 'Smart Irrigation', included: true },
      { name: 'Solar Panels (8kW)', included: true },
      { name: 'Battery Wall', included: true },
      { name: 'EV Charging Station', included: true },
      { name: 'Whole-Home Automation', included: false },
    ],
    price_low: 32000, price_high: 48000, annual_savings: 3600,
    roi_years: 10, comfort_score: 90, home_value_increase: 12,
  },
  {
    id: 'ultimate', name: 'Ultimate', tier: 'ultimate',
    tagline: 'The pinnacle of smart living',
    items: [
      { name: 'Smart Climate (Zoned)', included: true },
      { name: 'Smart Lighting (All Rooms)', included: true },
      { name: 'Full Security + AI Monitor', included: true },
      { name: 'Biometric Lock System', included: true },
      { name: 'Motorized Everything', included: true },
      { name: 'Smart Irrigation + Weather', included: true },
      { name: 'Solar Panels (12kW)', included: true },
      { name: 'Dual Battery Wall', included: true },
      { name: 'Dual EV Charging', included: true },
      { name: 'Whole-Home Automation', included: true },
    ],
    price_low: 55000, price_high: 85000, annual_savings: 5200,
    roi_years: 12, comfort_score: 98, home_value_increase: 18,
  },
];

const COMPARISON_FEATURES = [
  'Smart Thermostat', 'Smart Lighting', 'Security Cameras', 'Smart Locks',
  'Smart Blinds', 'Smart Irrigation', 'Solar Panels', 'Battery Storage',
  'EV Charging', 'Voice Control', 'Whole-Home Automation', 'AI Monitoring',
];

const FEATURE_BY_TIER: Record<string, boolean[]> = {
  essential: [true, true, true, false, false, false, false, false, false, false, false, false],
  connected: [true, true, true, true, true, true, false, false, false, true, false, false],
  premium:   [true, true, true, true, true, true, true, true, true, true, false, false],
  ultimate:  [true, true, true, true, true, true, true, true, true, true, true, true],
};

function ComfortRing({ score, color }: { score: number; color: string }) {
  const r = 36, c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width="90" height="90" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx="45" cy="45" r={r} fill="none" stroke={BORDER} strokeWidth="6" />
      <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 45 45)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="45" y="45" textAnchor="middle" dominantBaseline="middle"
        fill={TEXT} fontSize="18" fontWeight="800">{score}</text>
    </svg>
  );
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<SmartPackage[]>(FALLBACK_PACKAGES);
  const [loading, setLoading] = useState(true);
  const [zipCode, setZipCode] = useState('');
  const [customizing, setCustomizing] = useState(false);
  const [customized, setCustomized] = useState(false);
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/smart-packages').then(r => r.json())
      .then(data => { if (data?.packages?.length) setPackages(data.packages); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCustomize = async () => {
    if (!zipCode || zipCode.length < 5) return;
    setCustomizing(true);
    try {
      const geoRes = await fetch(`/api/customers/geo?zip=${zipCode}`);
      const geo = await geoRes.json();
      setGeoData(geo);
      const custRes = await fetch('/api/smart-packages/customize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip: zipCode, geo, packages }),
      });
      const custData = await custRes.json();
      if (custData?.packages?.length) setPackages(custData.packages);
      setCustomized(true);
    } catch {
      setCustomized(true);
    } finally {
      setCustomizing(false);
    }
  };

  const fmt = (n: number) => '$' + n.toLocaleString();

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT }}>
      {/* Header */}
      <section style={{
        textAlign: 'center', padding: '80px 20px 40px',
        background: `linear-gradient(180deg, ${DARK} 0%, ${BG} 100%)`,
      }}>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 44px)', fontWeight: 800, marginBottom: 12 }}>
          Smart Building <span style={{ color: GOLD }}>Packages</span>
        </h1>
        <p style={{ fontSize: 17, color: DIM, maxWidth: 600, margin: '0 auto' }}>
          From essential upgrades to full smart home transformation. Choose your level.
        </p>
      </section>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 80px' }}>
        {/* Customize by location */}
        <div style={{
          ...glass, padding: 24, marginBottom: 40, display: 'flex', gap: 12,
          alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 14, color: DIM }}>Customize for my location:</span>
          <input
            type="text" placeholder="Enter ZIP code" value={zipCode}
            onChange={e => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            style={{
              padding: '10px 16px', background: BG, border: `1px solid ${BORDER}`,
              borderRadius: 10, color: TEXT, fontSize: 14, width: 140, outline: 'none',
            }}
          />
          <button onClick={handleCustomize} disabled={customizing || zipCode.length < 5} style={{
            padding: '10px 24px', background: GOLD, color: '#000', border: 'none',
            borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14,
            opacity: customizing || zipCode.length < 5 ? 0.5 : 1,
          }}>
            {customizing ? 'Customizing...' : 'Get Local Pricing'}
          </button>
          {customized && geoData && (
            <span style={{ fontSize: 13, color: GREEN }}>
              Showing rates for {geoData.city || 'your area'}, {geoData.state || ''}
            </span>
          )}
        </div>

        {/* Package Cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20,
          marginBottom: 60,
        }}>
          {packages.map((pkg, idx) => {
            const tierColor = TIER_COLORS[pkg.tier] || GOLD;
            return (
              <div key={pkg.id} style={{
                ...glass, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                borderColor: pkg.tier === 'premium' ? GOLD : BORDER,
                position: 'relative',
              }}>
                {pkg.tier === 'premium' && (
                  <div style={{
                    position: 'absolute', top: 12, right: -28, background: GOLD,
                    color: '#000', fontSize: 11, fontWeight: 800, padding: '4px 32px',
                    transform: 'rotate(45deg)', zIndex: 1,
                  }}>POPULAR</div>
                )}
                <div style={{
                  padding: '24px 20px 16px', borderBottom: `1px solid ${BORDER}`,
                  textAlign: 'center',
                }}>
                  <div style={{
                    display: 'inline-block', padding: '3px 14px', borderRadius: 99,
                    background: `${tierColor}20`, color: tierColor, fontSize: 11,
                    fontWeight: 800, textTransform: 'uppercase', marginBottom: 8,
                    border: `1px solid ${tierColor}40`,
                  }}>{pkg.tier}</div>
                  <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{pkg.name}</h3>
                  <p style={{ fontSize: 13, color: DIM }}>{pkg.tagline}</p>
                </div>

                <div style={{ padding: '16px 20px', flex: 1 }}>
                  <div style={{ marginBottom: 16 }}>
                    {pkg.items.map((item, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 0', fontSize: 13,
                        color: item.included ? TEXT : `${DIM}60`,
                        textDecoration: item.included ? 'none' : 'line-through',
                      }}>
                        <span style={{ color: item.included ? GREEN : `${DIM}40`, fontSize: 14 }}>
                          {item.included ? '✓' : '—'}
                        </span>
                        {item.name}
                      </div>
                    ))}
                  </div>

                  {/* Comfort Score Ring */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: DIM, textAlign: 'center', marginBottom: 6 }}>
                      Comfort Score
                    </div>
                    <ComfortRing score={pkg.comfort_score} color={tierColor} />
                  </div>

                  {/* Stats */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                    padding: '12px 0', borderTop: `1px solid ${BORDER}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: DIM }}>Annual Savings</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: GREEN }}>
                        {fmt(pkg.annual_savings)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: DIM }}>ROI</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>
                        {pkg.roi_years} years
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: DIM }}>Home Value +</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: BLUE }}>
                        {pkg.home_value_increase}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: DIM }}>Price Range</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {fmt(pkg.price_low)} - {fmt(pkg.price_high)}
                      </div>
                    </div>
                  </div>
                </div>

                <a href="/design/discover" style={{ textDecoration: 'none' }}>
                  <button style={{
                    width: '100%', padding: '14px', border: 'none', borderRadius: 0,
                    background: tierColor, color: pkg.tier === 'essential' ? '#fff' : '#000',
                    fontWeight: 700, fontSize: 15, cursor: 'pointer', transition: 'opacity .2s',
                  }}>
                    Get Started
                  </button>
                </a>
              </div>
            );
          })}
        </div>

        {/* Comparison Table */}
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>
          Compare All Packages
        </h2>
        <div style={{ ...glass, overflow: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 13, color: DIM }}>Feature</th>
                {packages.map(p => (
                  <th key={p.id} style={{
                    padding: '14px 16px', textAlign: 'center', fontSize: 14, fontWeight: 700,
                    color: TIER_COLORS[p.tier],
                  }}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_FEATURES.map((feat, fi) => (
                <tr key={feat} style={{
                  borderBottom: `1px solid ${BORDER}`,
                  background: fi % 2 === 0 ? 'transparent' : `${BG}40`,
                }}>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>{feat}</td>
                  {['essential', 'connected', 'premium', 'ultimate'].map(tier => (
                    <td key={tier} style={{ textAlign: 'center', padding: '10px 16px' }}>
                      {FEATURE_BY_TIER[tier]?.[fi] ? (
                        <span style={{ color: GREEN, fontSize: 18 }}>&#10003;</span>
                      ) : (
                        <span style={{ color: `${DIM}40` }}>&mdash;</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${BORDER}` }}>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700 }}>Price Range</td>
                {packages.map(p => (
                  <td key={p.id} style={{
                    textAlign: 'center', padding: '14px 16px', fontSize: 13, fontWeight: 700,
                  }}>
                    {fmt(p.price_low)} - {fmt(p.price_high)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
