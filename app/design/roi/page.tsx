'use client';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

/* ─── Palette — Premium Dark Glassmorphism ─── */
const GOLD = '#D4A017', GREEN = '#22C55E';
const TEXT = '#F5F5F7', DIM = '#86868B';
const RED = '#EF4444', BLUE = '#3B82F6';
const BG = '#000000', CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)', CARD_SHADOW = '0 8px 32px rgba(0,0,0,0.4)';

/* ─── State Data ─── */
type StateData = {
  name: string; electricity_rate: number; gas_rate: number; solar_hours: number;
  rebates: number; climate: string;
};

const STATES: Record<string, StateData> = {
  AL: { name: 'Alabama', electricity_rate: 0.13, gas_rate: 0.95, solar_hours: 4.8, rebates: 1000, climate: 'Hot & Humid' },
  AK: { name: 'Alaska', electricity_rate: 0.24, gas_rate: 0.65, solar_hours: 2.8, rebates: 1500, climate: 'Arctic' },
  AZ: { name: 'Arizona', electricity_rate: 0.13, gas_rate: 1.05, solar_hours: 6.5, rebates: 2500, climate: 'Hot & Dry' },
  AR: { name: 'Arkansas', electricity_rate: 0.11, gas_rate: 0.80, solar_hours: 4.9, rebates: 1000, climate: 'Temperate' },
  CA: { name: 'California', electricity_rate: 0.27, gas_rate: 1.45, solar_hours: 5.8, rebates: 4000, climate: 'Mediterranean' },
  CO: { name: 'Colorado', electricity_rate: 0.14, gas_rate: 0.85, solar_hours: 5.5, rebates: 2000, climate: 'Mixed' },
  CT: { name: 'Connecticut', electricity_rate: 0.24, gas_rate: 1.30, solar_hours: 3.8, rebates: 3500, climate: 'Cold' },
  DE: { name: 'Delaware', electricity_rate: 0.14, gas_rate: 1.05, solar_hours: 4.2, rebates: 2000, climate: 'Temperate' },
  FL: { name: 'Florida', electricity_rate: 0.14, gas_rate: 1.20, solar_hours: 5.6, rebates: 1500, climate: 'Hot & Humid' },
  GA: { name: 'Georgia', electricity_rate: 0.13, gas_rate: 0.95, solar_hours: 5.0, rebates: 1200, climate: 'Hot & Humid' },
  HI: { name: 'Hawaii', electricity_rate: 0.37, gas_rate: 2.50, solar_hours: 5.9, rebates: 5000, climate: 'Tropical' },
  ID: { name: 'Idaho', electricity_rate: 0.10, gas_rate: 0.75, solar_hours: 5.0, rebates: 1500, climate: 'Mixed' },
  IL: { name: 'Illinois', electricity_rate: 0.16, gas_rate: 0.80, solar_hours: 4.2, rebates: 3000, climate: 'Cold' },
  IN: { name: 'Indiana', electricity_rate: 0.14, gas_rate: 0.75, solar_hours: 4.0, rebates: 1500, climate: 'Cold' },
  IA: { name: 'Iowa', electricity_rate: 0.13, gas_rate: 0.70, solar_hours: 4.3, rebates: 2000, climate: 'Cold' },
  KS: { name: 'Kansas', electricity_rate: 0.13, gas_rate: 0.75, solar_hours: 5.0, rebates: 1500, climate: 'Mixed' },
  KY: { name: 'Kentucky', electricity_rate: 0.11, gas_rate: 0.80, solar_hours: 4.2, rebates: 1000, climate: 'Temperate' },
  LA: { name: 'Louisiana', electricity_rate: 0.10, gas_rate: 0.90, solar_hours: 5.0, rebates: 1500, climate: 'Hot & Humid' },
  ME: { name: 'Maine', electricity_rate: 0.20, gas_rate: 1.20, solar_hours: 3.8, rebates: 3000, climate: 'Cold' },
  MD: { name: 'Maryland', electricity_rate: 0.15, gas_rate: 1.10, solar_hours: 4.3, rebates: 3000, climate: 'Temperate' },
  MA: { name: 'Massachusetts', electricity_rate: 0.25, gas_rate: 1.30, solar_hours: 4.0, rebates: 3500, climate: 'Cold' },
  MI: { name: 'Michigan', electricity_rate: 0.18, gas_rate: 0.75, solar_hours: 3.8, rebates: 2000, climate: 'Cold' },
  MN: { name: 'Minnesota', electricity_rate: 0.14, gas_rate: 0.70, solar_hours: 4.3, rebates: 2500, climate: 'Cold' },
  MS: { name: 'Mississippi', electricity_rate: 0.12, gas_rate: 0.85, solar_hours: 4.8, rebates: 1000, climate: 'Hot & Humid' },
  MO: { name: 'Missouri', electricity_rate: 0.12, gas_rate: 0.80, solar_hours: 4.5, rebates: 1500, climate: 'Mixed' },
  MT: { name: 'Montana', electricity_rate: 0.12, gas_rate: 0.70, solar_hours: 4.8, rebates: 2000, climate: 'Cold' },
  NE: { name: 'Nebraska', electricity_rate: 0.11, gas_rate: 0.70, solar_hours: 4.8, rebates: 1500, climate: 'Cold' },
  NV: { name: 'Nevada', electricity_rate: 0.12, gas_rate: 1.00, solar_hours: 6.4, rebates: 2500, climate: 'Hot & Dry' },
  NH: { name: 'New Hampshire', electricity_rate: 0.22, gas_rate: 1.25, solar_hours: 3.8, rebates: 3000, climate: 'Cold' },
  NJ: { name: 'New Jersey', electricity_rate: 0.17, gas_rate: 1.10, solar_hours: 4.3, rebates: 3000, climate: 'Temperate' },
  NM: { name: 'New Mexico', electricity_rate: 0.13, gas_rate: 0.85, solar_hours: 6.3, rebates: 2500, climate: 'Hot & Dry' },
  NY: { name: 'New York', electricity_rate: 0.22, gas_rate: 1.25, solar_hours: 3.9, rebates: 5000, climate: 'Cold' },
  NC: { name: 'North Carolina', electricity_rate: 0.12, gas_rate: 0.90, solar_hours: 5.0, rebates: 2000, climate: 'Temperate' },
  ND: { name: 'North Dakota', electricity_rate: 0.11, gas_rate: 0.65, solar_hours: 4.5, rebates: 1500, climate: 'Cold' },
  OH: { name: 'Ohio', electricity_rate: 0.13, gas_rate: 0.80, solar_hours: 3.8, rebates: 1500, climate: 'Cold' },
  OK: { name: 'Oklahoma', electricity_rate: 0.11, gas_rate: 0.75, solar_hours: 5.2, rebates: 1500, climate: 'Mixed' },
  OR: { name: 'Oregon', electricity_rate: 0.12, gas_rate: 0.95, solar_hours: 4.2, rebates: 3000, climate: 'Temperate' },
  PA: { name: 'Pennsylvania', electricity_rate: 0.15, gas_rate: 0.90, solar_hours: 4.0, rebates: 2500, climate: 'Cold' },
  RI: { name: 'Rhode Island', electricity_rate: 0.24, gas_rate: 1.30, solar_hours: 3.9, rebates: 3500, climate: 'Cold' },
  SC: { name: 'South Carolina', electricity_rate: 0.13, gas_rate: 0.90, solar_hours: 5.0, rebates: 1500, climate: 'Hot & Humid' },
  SD: { name: 'South Dakota', electricity_rate: 0.12, gas_rate: 0.70, solar_hours: 4.8, rebates: 1500, climate: 'Cold' },
  TN: { name: 'Tennessee', electricity_rate: 0.11, gas_rate: 0.85, solar_hours: 4.5, rebates: 1200, climate: 'Temperate' },
  TX: { name: 'Texas', electricity_rate: 0.12, gas_rate: 0.85, solar_hours: 5.6, rebates: 1500, climate: 'Hot & Dry' },
  UT: { name: 'Utah', electricity_rate: 0.11, gas_rate: 0.80, solar_hours: 5.5, rebates: 2000, climate: 'Mixed' },
  VT: { name: 'Vermont', electricity_rate: 0.20, gas_rate: 1.20, solar_hours: 3.6, rebates: 3000, climate: 'Cold' },
  VA: { name: 'Virginia', electricity_rate: 0.13, gas_rate: 0.95, solar_hours: 4.5, rebates: 2500, climate: 'Temperate' },
  WA: { name: 'Washington', electricity_rate: 0.11, gas_rate: 0.90, solar_hours: 3.6, rebates: 3000, climate: 'Temperate' },
  WV: { name: 'West Virginia', electricity_rate: 0.12, gas_rate: 0.80, solar_hours: 3.8, rebates: 1000, climate: 'Cold' },
  WI: { name: 'Wisconsin', electricity_rate: 0.15, gas_rate: 0.75, solar_hours: 4.0, rebates: 2000, climate: 'Cold' },
  WY: { name: 'Wyoming', electricity_rate: 0.11, gas_rate: 0.70, solar_hours: 5.2, rebates: 1500, climate: 'Cold' },
  DC: { name: 'Washington D.C.', electricity_rate: 0.14, gas_rate: 1.15, solar_hours: 4.2, rebates: 4000, climate: 'Temperate' },
};

/* ─── Upgrade Definitions ─── */
type Upgrade = {
  id: string; name: string; icon: string;
  cost_low: number; cost_high: number;
  base_savings: number; // base annual savings before state multiplier
  multiplier_key: 'electricity' | 'gas' | 'solar' | 'water';
  has_slider?: boolean; slider_label?: string; slider_min?: number; slider_max?: number;
};

const UPGRADES: Upgrade[] = [
  { id: 'thermostat', name: 'Smart Thermostat', icon: '🌡️', cost_low: 200, cost_high: 500, base_savings: 180, multiplier_key: 'electricity' },
  { id: 'lighting', name: 'Smart Lighting', icon: '💡', cost_low: 800, cost_high: 2400, base_savings: 240, multiplier_key: 'electricity' },
  { id: 'solar', name: 'Solar Panels', icon: '☀️', cost_low: 2000, cost_high: 3000, base_savings: 300, multiplier_key: 'solar', has_slider: true, slider_label: 'System Size (kW)', slider_min: 2, slider_max: 16 },
  { id: 'battery', name: 'Battery Wall', icon: '🔋', cost_low: 8000, cost_high: 14000, base_savings: 480, multiplier_key: 'electricity' },
  { id: 'ev', name: 'EV Charging', icon: '🔌', cost_low: 800, cost_high: 2400, base_savings: 600, multiplier_key: 'electricity' },
  { id: 'irrigation', name: 'Smart Irrigation', icon: '💧', cost_low: 400, cost_high: 1200, base_savings: 320, multiplier_key: 'water' },
  { id: 'heatpump', name: 'Heat Pump', icon: '♨️', cost_low: 4000, cost_high: 8000, base_savings: 720, multiplier_key: 'gas' },
  { id: 'insulation', name: 'Insulation Upgrade', icon: '🧱', cost_low: 2000, cost_high: 6000, base_savings: 540, multiplier_key: 'electricity' },
  { id: 'waterheater', name: 'Smart Water Heater', icon: '🚿', cost_low: 1200, cost_high: 3000, base_savings: 360, multiplier_key: 'gas' },
];

/* ─── Icon colors per upgrade (replaces emojis) ─── */
const ICON_COLORS: Record<string, string> = {
  thermostat: '#EF4444',
  lighting: '#FBBF24',
  solar: '#F97316',
  battery: '#22C55E',
  ev: '#3B82F6',
  irrigation: '#06B6D4',
  heatpump: '#A855F7',
  insulation: '#78716C',
  waterheater: '#0EA5E9',
};

/* ─── Animated counter hook ─── */
function useAnimatedNumber(target: number, duration = 600) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef({ value: 0, time: 0 });

  useEffect(() => {
    const start = startRef.current.value;
    const startTime = performance.now();
    startRef.current = { value: target, time: startTime };

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (target - start) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

export default function ROICalculatorPage() {
  const [state, setState] = useState('AZ');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [solarKw, setSolarKw] = useState(8);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sd = STATES[state];

  const multipliers = useMemo(() => ({
    electricity: sd.electricity_rate / 0.14,
    gas: sd.gas_rate / 0.90,
    solar: sd.solar_hours / 4.5,
    water: 1.0,
  }), [sd]);

  const calculations = useMemo(() => {
    let totalCostLow = 0, totalCostHigh = 0, totalAnnual = 0;
    const items: { name: string; cost: string; savings: number }[] = [];

    UPGRADES.forEach(u => {
      if (!selected[u.id]) return;
      let costLow = u.cost_low, costHigh = u.cost_high, savings = u.base_savings;
      if (u.id === 'solar') {
        costLow = u.cost_low * solarKw;
        costHigh = u.cost_high * solarKw;
        savings = u.base_savings * solarKw;
      }
      savings = Math.round(savings * multipliers[u.multiplier_key]);
      totalCostLow += costLow;
      totalCostHigh += costHigh;
      totalAnnual += savings;
      items.push({ name: u.name, cost: `$${costLow.toLocaleString()} - $${costHigh.toLocaleString()}`, savings });
    });

    const avgCost = (totalCostLow + totalCostHigh) / 2;
    const roiYears = totalAnnual > 0 ? +(avgCost / totalAnnual).toFixed(1) : 0;
    const tenYearNet = totalAnnual * 10 - avgCost;
    const homeValueIncrease = Math.round(avgCost * 0.65);

    return {
      items, totalCostLow, totalCostHigh, totalAnnual,
      monthlySavings: Math.round(totalAnnual / 12),
      roiYears, tenYearNet, homeValueIncrease,
    };
  }, [selected, solarKw, multipliers]);

  // Bar chart data for years 1-10
  const chartBars = useMemo(() => {
    const avgCost = (calculations.totalCostLow + calculations.totalCostHigh) / 2;
    return Array.from({ length: 10 }, (_, i) => ({
      year: i + 1,
      savings: calculations.totalAnnual * (i + 1),
      cost: avgCost,
    }));
  }, [calculations]);

  const maxChart = Math.max(...chartBars.map(b => Math.max(b.savings, b.cost)), 1);
  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString();

  const animatedAnnual = useAnimatedNumber(calculations.totalAnnual);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleUpgrade = useCallback((id: string) => {
    setSelected(p => ({ ...p, [id]: !p[id] }));
  }, []);

  /* Average US home energy cost for comparison */
  const avgHomeEnergy = 2400;
  const smartHomeCost = Math.max(avgHomeEnergy - calculations.totalAnnual, 0);

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .roi-toggle {
          position: relative;
          width: 44px;
          height: 24px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: background 0.3s ease;
          flex-shrink: 0;
          padding: 0;
        }
        .roi-toggle::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fff;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .roi-toggle.active::after {
          transform: translateX(20px);
          box-shadow: 0 1px 6px rgba(212,160,23,0.4);
        }
        .roi-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.08);
          outline: none;
        }
        .roi-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${GOLD};
          cursor: pointer;
          box-shadow: 0 0 10px rgba(212,160,23,0.4);
        }
        .roi-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${GOLD};
          cursor: pointer;
          border: none;
          box-shadow: 0 0 10px rgba(212,160,23,0.4);
        }
        .roi-dropdown-item {
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.15s ease;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .roi-dropdown-item:hover {
          background: rgba(212,160,23,0.1);
        }
        .roi-dropdown-item:last-child {
          border-bottom: none;
        }
        .roi-cta-btn {
          position: relative;
          overflow: hidden;
        }
        .roi-cta-btn::before {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          transition: left 0.5s ease;
        }
        .roi-cta-btn:hover::before {
          left: 100%;
        }
        @media (max-width: 900px) {
          .roi-layout {
            grid-template-columns: 1fr !important;
          }
          .roi-sticky {
            position: relative !important;
            top: 0 !important;
          }
        }
      `}</style>

      {/* ─── Hero Section ─── */}
      <section style={{
        textAlign: 'center',
        padding: '100px 20px 60px',
        background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,160,23,0.12) 0%, transparent 70%)',
        animation: 'fadeInUp 0.8s ease-out',
      }}>
        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 800,
          marginBottom: 16,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}>
          Smart Home{' '}
          <span style={{
            background: `linear-gradient(135deg, ${GOLD}, #F5D060)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>ROI</span>{' '}
          Calculator
        </h1>
        <p style={{
          fontSize: 'clamp(16px, 2vw, 20px)',
          color: DIM,
          maxWidth: 600,
          margin: '0 auto',
          lineHeight: 1.6,
        }}>
          See exactly how much you save — personalized to your state&#39;s utility rates
        </p>
      </section>

      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 20px 40px' }}>
        <div className="roi-layout" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 400px',
          gap: 28,
          alignItems: 'start',
        }}>
          {/* ─── Left Column: Controls ─── */}
          <div style={{ animation: 'fadeInUp 0.8s ease-out 0.1s both' }}>

            {/* ─── State Selector ─── */}
            <div ref={dropdownRef} style={{
              position: 'relative',
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: 24,
              marginBottom: 24,
            }}>
              <label style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: DIM,
                display: 'block',
                marginBottom: 12,
              }}>
                Your State
              </label>

              {/* Custom dropdown trigger */}
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${dropdownOpen ? GOLD : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 12,
                  color: TEXT,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'border-color 0.2s ease',
                  outline: 'none',
                }}
              >
                <span>{sd.name}</span>
                <span style={{
                  fontSize: 12,
                  color: DIM,
                  transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.2s ease',
                  display: 'inline-block',
                }}>
                  &#9660;
                </span>
              </button>

              {/* Dropdown list */}
              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  marginTop: 4,
                  background: 'rgba(20,20,20,0.96)',
                  backdropFilter: 'blur(40px)',
                  WebkitBackdropFilter: 'blur(40px)',
                  border: '1px solid rgba(212,160,23,0.15)',
                  borderRadius: 12,
                  maxHeight: 320,
                  overflowY: 'auto' as const,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                }}>
                  {Object.entries(STATES).map(([code, s]) => (
                    <div
                      key={code}
                      className="roi-dropdown-item"
                      onClick={() => { setState(code); setDropdownOpen(false); }}
                      style={{
                        color: code === state ? GOLD : TEXT,
                        fontWeight: code === state ? 700 : 400,
                        fontSize: 14,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{s.name}</span>
                      <span style={{ fontSize: 12, color: DIM }}>{code}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* State info badges */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {[
                  { label: 'Electricity', value: `$${sd.electricity_rate}/kWh` },
                  { label: 'Solar', value: `${sd.solar_hours}h/day` },
                  { label: 'Climate', value: sd.climate },
                ].map(badge => (
                  <span key={badge.label} style={{
                    fontSize: 12,
                    padding: '5px 12px',
                    borderRadius: 20,
                    background: 'rgba(212,160,23,0.08)',
                    border: '1px solid rgba(212,160,23,0.15)',
                    color: DIM,
                    display: 'inline-flex',
                    gap: 4,
                  }}>
                    {badge.label}:{' '}
                    <strong style={{ color: GOLD, fontWeight: 600 }}>{badge.value}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* ─── Upgrade Cards ─── */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: 24,
            }}>
              <h3 style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: DIM,
                marginBottom: 18,
              }}>Select Upgrades</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {UPGRADES.map(u => {
                  const isOn = !!selected[u.id];
                  let costLow = u.cost_low, costHigh = u.cost_high;
                  let savings = u.base_savings;
                  if (u.id === 'solar' && isOn) {
                    costLow = u.cost_low * solarKw;
                    costHigh = u.cost_high * solarKw;
                    savings = u.base_savings * solarKw;
                  }
                  savings = Math.round(savings * multipliers[u.multiplier_key]);
                  const iconColor = ICON_COLORS[u.id] || GOLD;
                  const firstLetter = u.name.charAt(0);

                  return (
                    <div key={u.id} style={{
                      padding: '14px 16px',
                      borderRadius: 14,
                      background: isOn
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(255,255,255,0.02)',
                      backdropFilter: isOn ? 'blur(40px)' : 'none',
                      WebkitBackdropFilter: isOn ? 'blur(40px)' : 'none',
                      borderLeft: isOn ? `3px solid ${GOLD}` : '3px solid transparent',
                      border: isOn
                        ? `1px solid rgba(212,160,23,0.2)`
                        : '1px solid rgba(255,255,255,0.05)',
                      borderLeftWidth: 3,
                      borderLeftColor: isOn ? GOLD : 'transparent',
                      transition: 'all 0.3s ease',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {/* Icon circle */}
                        <div style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: `${iconColor}18`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                          fontWeight: 800,
                          color: iconColor,
                          flexShrink: 0,
                          border: `1px solid ${iconColor}30`,
                        }}>
                          {firstLetter}
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>{u.name}</div>
                          <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                            ${costLow.toLocaleString()} - ${costHigh.toLocaleString()}
                          </div>
                        </div>

                        {/* Savings */}
                        <div style={{ textAlign: 'right', marginRight: 12, flexShrink: 0 }}>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: isOn ? GREEN : DIM,
                            transition: 'color 0.2s ease',
                          }}>
                            {isOn ? `$${savings}/yr` : '--'}
                          </div>
                        </div>

                        {/* Toggle switch */}
                        <button
                          className={`roi-toggle${isOn ? ' active' : ''}`}
                          onClick={() => toggleUpgrade(u.id)}
                          style={{
                            background: isOn
                              ? `linear-gradient(135deg, ${GOLD}, #B8860B)`
                              : 'rgba(255,255,255,0.08)',
                          }}
                          aria-label={`Toggle ${u.name}`}
                        />
                      </div>

                      {/* Solar slider */}
                      {u.has_slider && isOn && (
                        <div style={{ marginTop: 14, paddingLeft: 52 }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            color: DIM,
                            marginBottom: 8,
                          }}>
                            <span>{u.slider_label}</span>
                            <span style={{ color: GOLD, fontWeight: 700 }}>{solarKw} kW</span>
                          </div>
                          <input
                            type="range"
                            className="roi-slider"
                            min={u.slider_min}
                            max={u.slider_max}
                            value={solarKw}
                            onChange={e => setSolarKw(+e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── Right Column: Results Panel (sticky) ─── */}
          <div className="roi-sticky" style={{
            position: 'sticky',
            top: 80,
            animation: 'fadeInUp 0.8s ease-out 0.2s both',
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding: 28,
              marginBottom: 20,
            }}>
              <h3 style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: DIM,
                marginBottom: 24,
                textAlign: 'center',
              }}>
                Your Savings Summary
              </h3>

              {/* Annual savings with animated counter */}
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 6 }}>Annual Savings</div>
                <div style={{
                  fontSize: 48,
                  fontWeight: 800,
                  background: calculations.totalAnnual > 0
                    ? `linear-gradient(135deg, ${GREEN}, #4ADE80)`
                    : `linear-gradient(135deg, ${DIM}, ${DIM})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                }}>
                  ${animatedAnnual.toLocaleString()}
                </div>
                <div style={{ fontSize: 14, color: DIM, marginTop: 4 }}>
                  {fmt(calculations.monthlySavings)}/month
                </div>
              </div>

              {/* Stat cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
                {[
                  {
                    label: 'Total Cost',
                    value: calculations.totalCostLow > 0
                      ? `${fmt(calculations.totalCostLow)} - ${fmt(calculations.totalCostHigh)}`
                      : '$0',
                    color: TEXT,
                    size: 13,
                  },
                  {
                    label: 'ROI (Payoff)',
                    value: calculations.roiYears > 0 ? `${calculations.roiYears} yrs` : '--',
                    color: GOLD,
                    size: 20,
                  },
                  {
                    label: '10-Year Net',
                    value: calculations.tenYearNet !== 0
                      ? `${calculations.tenYearNet >= 0 ? '+' : '-'}${fmt(calculations.tenYearNet)}`
                      : '--',
                    color: calculations.tenYearNet >= 0 ? GREEN : RED,
                    size: 16,
                  },
                  {
                    label: 'Home Value +',
                    value: calculations.homeValueIncrease > 0 ? `+${fmt(calculations.homeValueIncrease)}` : '--',
                    color: BLUE,
                    size: 16,
                  },
                ].map(card => (
                  <div key={card.label} style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 12,
                    padding: 14,
                    textAlign: 'center',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>{card.label}</div>
                    <div style={{ fontSize: card.size, fontWeight: 800, color: card.color }}>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* ─── Bar Chart ─── */}
              {calculations.totalAnnual > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: DIM, marginBottom: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Cumulative Savings vs. Investment Cost
                  </div>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 150 }}>
                    {chartBars.map(bar => {
                      const savH = (bar.savings / maxChart) * 140;
                      const costH = (bar.cost / maxChart) * 140;
                      const breakEven = bar.savings >= bar.cost;
                      return (
                        <div key={bar.year} style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 3,
                        }}>
                          <div style={{
                            position: 'relative',
                            width: '100%',
                            display: 'flex',
                            gap: 1,
                            justifyContent: 'center',
                          }}>
                            <div style={{
                              width: '44%',
                              height: savH,
                              borderRadius: '6px 6px 0 0',
                              background: breakEven
                                ? `linear-gradient(180deg, ${GOLD} 0%, rgba(212,160,23,0.6) 100%)`
                                : `linear-gradient(180deg, ${GOLD}90 0%, rgba(212,160,23,0.3) 100%)`,
                              transition: 'height 0.5s ease',
                            }} />
                            <div style={{
                              width: '44%',
                              height: costH,
                              borderRadius: '6px 6px 0 0',
                              background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                              transition: 'height 0.5s ease',
                            }} />
                          </div>
                          <div style={{ fontSize: 10, color: DIM }}>{bar.year}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: DIM, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        background: `linear-gradient(135deg, ${GOLD}, rgba(212,160,23,0.6))`,
                        borderRadius: 2,
                      }} />
                      Savings
                    </span>
                    <span style={{ fontSize: 11, color: DIM, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: 2,
                      }} />
                      Cost
                    </span>
                  </div>
                </div>
              )}

              {/* ─── CTA Button ─── */}
              <a href="/design/discover" style={{ textDecoration: 'none', display: 'block' }}>
                <button className="roi-cta-btn" style={{
                  width: '100%',
                  padding: '16px',
                  background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
                  color: '#000',
                  border: 'none',
                  borderRadius: 14,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  letterSpacing: '0.01em',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: '0 4px 20px rgba(212,160,23,0.3)',
                }}>
                  Get a Custom Quote
                </button>
              </a>
            </div>
          </div>
        </div>

        {/* ─── How You Compare Section ─── */}
        <section style={{
          marginTop: 40,
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: 32,
          animation: 'fadeInUp 0.8s ease-out 0.3s both',
        }}>
          <h3 style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: DIM,
            marginBottom: 8,
          }}>How You Compare</h3>
          <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 28, color: TEXT }}>
            Average Home vs.{' '}
            <span style={{ color: GOLD }}>Smart Home</span>
          </p>

          {/* Average home bar */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: DIM }}>Average Home Energy Cost</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>${avgHomeEnergy.toLocaleString()}/yr</span>
            </div>
            <div style={{
              width: '100%',
              height: 14,
              borderRadius: 7,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: 7,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.08))',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          {/* Smart home bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: DIM }}>Your Smart Home Cost</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>${smartHomeCost.toLocaleString()}/yr</span>
            </div>
            <div style={{
              width: '100%',
              height: 14,
              borderRadius: 7,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${avgHomeEnergy > 0 ? Math.max((smartHomeCost / avgHomeEnergy) * 100, 2) : 100}%`,
                height: '100%',
                borderRadius: 7,
                background: `linear-gradient(90deg, ${GOLD}, rgba(212,160,23,0.5))`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          {calculations.totalAnnual > 0 && (
            <div style={{
              marginTop: 20,
              padding: '14px 20px',
              background: 'rgba(212,160,23,0.06)',
              border: '1px solid rgba(212,160,23,0.12)',
              borderRadius: 12,
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 14, color: DIM }}>You save </span>
              <span style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>
                {Math.round((calculations.totalAnnual / avgHomeEnergy) * 100)}%
              </span>
              <span style={{ fontSize: 14, color: DIM }}> on annual energy costs</span>
            </div>
          )}
        </section>

        {/* ─── Bottom CTA Section ─── */}
        <section style={{
          marginTop: 40,
          marginBottom: 40,
          textAlign: 'center',
          padding: '60px 20px',
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(212,160,23,0.08) 0%, transparent 70%)',
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.05)',
          animation: 'fadeInUp 0.8s ease-out 0.4s both',
        }}>
          <h2 style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 800,
            marginBottom: 12,
            letterSpacing: '-0.02em',
          }}>
            Ready to Build Your{' '}
            <span style={{
              background: `linear-gradient(135deg, ${GOLD}, #F5D060)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Smart Home</span>?
          </h2>
          <p style={{ fontSize: 16, color: DIM, maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.6 }}>
            Get a personalized design plan with exact pricing for your home and location.
          </p>
          <a href="/design/discover" style={{ textDecoration: 'none' }}>
            <button className="roi-cta-btn" style={{
              padding: '16px 48px',
              background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
              color: '#000',
              border: 'none',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 16,
              cursor: 'pointer',
              letterSpacing: '0.01em',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 24px rgba(212,160,23,0.3)',
            }}>
              Start Your Design
            </button>
          </a>
        </section>
      </div>
    </div>
  );
}
