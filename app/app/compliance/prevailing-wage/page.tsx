'use client';
/**
 * Saguaro — Prevailing Wage Calculator
 * Client-side calculator with AZ Davis-Bacon rates (2024).
 */
import React, { useState, useMemo } from 'react';

const BASE = '#F8F9FB';
const CARD = 'rgba(26,31,46,0.7)';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#EEF0F3';

interface WageRate {
  trade: string;
  base: number;
  fringe: number;
  total: number;
}

const AZ_RATES: WageRate[] = [
  { trade: 'Electrician', base: 36.14, fringe: 16.45, total: 52.59 },
  { trade: 'Plumber', base: 34.87, fringe: 15.92, total: 50.79 },
  { trade: 'Carpenter', base: 28.65, fringe: 14.23, total: 42.88 },
  { trade: 'Ironworker', base: 33.42, fringe: 22.10, total: 55.52 },
  { trade: 'Laborer', base: 20.15, fringe: 12.85, total: 33.00 },
  { trade: 'Operating Engineer', base: 31.20, fringe: 16.80, total: 48.00 },
  { trade: 'Cement Mason', base: 27.50, fringe: 14.50, total: 42.00 },
  { trade: 'Painter', base: 24.80, fringe: 13.20, total: 38.00 },
  { trade: 'Roofer', base: 26.30, fringe: 14.70, total: 41.00 },
  { trade: 'Sheet Metal Worker', base: 35.60, fringe: 21.40, total: 57.00 },
];

const HOUR_PRESETS = [
  { label: '8hr Day', hours: 8 },
  { label: '40hr Week', hours: 40 },
  { label: 'Custom', hours: 0 },
];

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export default function PrevailingWagePage() {
  const [state, setState] = useState('AZ');
  const [county, setCounty] = useState('Maricopa');
  const [selectedTrade, setSelectedTrade] = useState('Electrician');
  const [hoursPreset, setHoursPreset] = useState(8);
  const [customHours, setCustomHours] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const rate = useMemo(() => AZ_RATES.find(r => r.trade === selectedTrade) || AZ_RATES[0], [selectedTrade]);
  const hours = isCustom ? (parseFloat(customHours) || 0) : hoursPreset;

  const baseCost = rate.base * hours;
  const fringeCost = rate.fringe * hours;
  const totalCost = rate.total * hours;

  const dailyCost = rate.total * 8;
  const weeklyCost = rate.total * 40;

  const inputStyle: React.CSSProperties = {
    background: 'rgba(15,20,25,0.6)',
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    color: TEXT,
    width: '100%',
    outline: 'none',
  };

  return (
    <div style={{ background: BASE, minHeight: '100vh', color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Prevailing Wage Calculator</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM }}>AZ Davis-Bacon prevailing wage rates (2024)</p>
      </div>

      <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Left: Inputs */}
          <div style={{
            background: CARD,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: 24,
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: GOLD }}>Wage Lookup</h3>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>State</label>
              <select value={state} onChange={e => setState(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="AZ">Arizona (AZ)</option>
                <option value="CA" disabled>California (CA) - Coming Soon</option>
                <option value="TX" disabled>Texas (TX) - Coming Soon</option>
                <option value="NV" disabled>Nevada (NV) - Coming Soon</option>
                <option value="CO" disabled>Colorado (CO) - Coming Soon</option>
                <option value="FL" disabled>Florida (FL) - Coming Soon</option>
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>County</label>
              <input value={county} onChange={e => setCounty(e.target.value)} placeholder="e.g. Maricopa" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Trade / Classification</label>
              <select
                value={selectedTrade}
                onChange={e => setSelectedTrade(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {AZ_RATES.map(r => (
                  <option key={r.trade} value={r.trade}>{r.trade}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Hours</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {HOUR_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => {
                      if (p.label === 'Custom') {
                        setIsCustom(true);
                      } else {
                        setIsCustom(false);
                        setHoursPreset(p.hours);
                      }
                    }}
                    style={{
                      background: (!isCustom && hoursPreset === p.hours) || (isCustom && p.label === 'Custom')
                        ? 'rgba(212,160,23,0.15)' : 'rgba(15,20,25,0.4)',
                      color: (!isCustom && hoursPreset === p.hours) || (isCustom && p.label === 'Custom')
                        ? GOLD : DIM,
                      border: `1px solid ${(!isCustom && hoursPreset === p.hours) || (isCustom && p.label === 'Custom')
                        ? GOLD + '40' : BORDER}`,
                      borderRadius: 8,
                      padding: '7px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      flex: 1,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {isCustom && (
                <input
                  type="number"
                  value={customHours}
                  onChange={e => setCustomHours(e.target.value)}
                  placeholder="Enter hours"
                  min="0"
                  step="0.5"
                  style={inputStyle}
                />
              )}
            </div>
          </div>

          {/* Right: Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Rate Card */}
            <div style={{
              background: CARD,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: 24,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: GREEN }}>Rate Details</h3>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 6,
                  background: 'rgba(59,130,246,0.12)',
                  color: BLUE,
                  textTransform: 'uppercase',
                }}>
                  {selectedTrade}
                </span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 11, color: DIM, fontWeight: 600, padding: '6px 0', borderBottom: `1px solid ${BORDER}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Component</th>
                    <th style={{ textAlign: 'right', fontSize: 11, color: DIM, fontWeight: 600, padding: '6px 0', borderBottom: `1px solid ${BORDER}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rate/hr</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, borderBottom: `1px solid ${BORDER}` }}>Base Rate</td>
                    <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, textAlign: 'right', fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{fmt(rate.base)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, borderBottom: `1px solid ${BORDER}` }}>Fringe Benefits</td>
                    <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, textAlign: 'right', fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{fmt(rate.fringe)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px 0', fontSize: 15, color: GOLD, fontWeight: 700 }}>Total Prevailing Wage</td>
                    <td style={{ padding: '10px 0', fontSize: 15, color: GOLD, textAlign: 'right', fontWeight: 800 }}>{fmt(rate.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Cost Calculation Card */}
            <div style={{
              background: CARD,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: 24,
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: GOLD }}>
                Cost Calculation
                <span style={{ fontSize: 12, fontWeight: 500, color: DIM, marginLeft: 8 }}>({hours} hours)</span>
              </h3>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 11, color: DIM, fontWeight: 600, padding: '6px 0', borderBottom: `1px solid ${BORDER}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Component</th>
                    <th style={{ textAlign: 'right', fontSize: 11, color: DIM, fontWeight: 600, padding: '6px 0', borderBottom: `1px solid ${BORDER}`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, borderBottom: `1px solid ${BORDER}` }}>Base ({fmt(rate.base)} x {hours}h)</td>
                    <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, textAlign: 'right', fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{fmt(baseCost)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, borderBottom: `1px solid ${BORDER}` }}>Fringe ({fmt(rate.fringe)} x {hours}h)</td>
                    <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, textAlign: 'right', fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{fmt(fringeCost)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px 0', fontSize: 16, color: GREEN, fontWeight: 700 }}>Total Cost</td>
                    <td style={{ padding: '12px 0', fontSize: 18, color: GREEN, textAlign: 'right', fontWeight: 800 }}>{fmt(totalCost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Quick Reference */}
            <div style={{
              background: CARD,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: '16px 24px',
              display: 'flex',
              gap: 24,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Daily (8hr)</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{fmt(dailyCost)}</div>
              </div>
              <div style={{ width: 1, background: BORDER }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Weekly (40hr)</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{fmt(weeklyCost)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Full Rate Table */}
        <div style={{
          background: CARD,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 24,
          marginTop: 24,
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: GOLD }}>AZ Rate Schedule (2024 Davis-Bacon)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr>
                  {['Trade', 'Base Rate', 'Fringe', 'Total/hr', 'Daily (8hr)', 'Weekly (40hr)'].map(h => (
                    <th key={h} style={{
                      textAlign: h === 'Trade' ? 'left' : 'right',
                      fontSize: 11,
                      color: DIM,
                      fontWeight: 600,
                      padding: '8px 12px',
                      borderBottom: `1px solid ${BORDER}`,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AZ_RATES.map(r => (
                  <tr
                    key={r.trade}
                    onClick={() => setSelectedTrade(r.trade)}
                    style={{
                      cursor: 'pointer',
                      background: selectedTrade === r.trade ? 'rgba(212,160,23,0.06)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{
                      padding: '10px 12px',
                      fontSize: 14,
                      color: selectedTrade === r.trade ? GOLD : TEXT,
                      fontWeight: selectedTrade === r.trade ? 700 : 500,
                      borderBottom: `1px solid ${BORDER}`,
                    }}>
                      {r.trade}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: TEXT, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(r.base)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: TEXT, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(r.fringe)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: GOLD, fontWeight: 700, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(r.total)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: DIM, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(r.total * 8)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: DIM, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(r.total * 40)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
