'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Timer, FileText, CurrencyDollar, HardHat, CheckCircle, Laptop, Lightbulb, ChartBar } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

const DARK = 'var(--bg-base)';
const ON_GOLD = '#0A0A00';
const GOLD = 'var(--brand-primary)';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';
const BORDER = 'rgba(255,255,255,0.12)';
const HAIRLINE = 'rgba(255,255,255,0.08)';
const CARD = 'rgba(255,255,255,0.02)';
const RAISED = 'var(--bg-surface)';
const GREEN = '#22c55e';

const fmt = (n: number) => Math.round(n).toLocaleString();

const defaultValues = {
  teamSize: 12,
  bidsPerMonth: 8,
  hoursPerTakeoff: 4,
  hourlyRate: 85,
  lienWaiversPerMonth: 25,
  currentSoftwareCost: 0,
  useProcore: false,
};

export default function ROICalculatorPage() {
  const [teamSize, setTeamSize] = useState(defaultValues.teamSize);
  const [bidsPerMonth, setBidsPerMonth] = useState(defaultValues.bidsPerMonth);
  const [hoursPerTakeoff, setHoursPerTakeoff] = useState(defaultValues.hoursPerTakeoff);
  const [hourlyRate, setHourlyRate] = useState(defaultValues.hourlyRate);
  const [lienWaiversPerMonth, setLienWaiversPerMonth] = useState(defaultValues.lienWaiversPerMonth);
  const [currentSoftwareCost, setCurrentSoftwareCost] = useState(defaultValues.currentSoftwareCost);
  const [useProcore, setUseProcore] = useState(defaultValues.useProcore);
  const [email, setEmail] = useState('');

  const effectiveSoftwareCost = useProcore ? 1850 : currentSoftwareCost;

  // Calculations
  const takeoffTimeSaved = bidsPerMonth * hoursPerTakeoff;
  const takeoffMoneySaved = takeoffTimeSaved * hourlyRate;
  const lienWaiverTimeSaved = lienWaiversPerMonth * 0.5;
  const lienWaiverMoneySaved = lienWaiverTimeSaved * hourlyRate;
  const payAppTimeSaved = 4;
  const payAppMoneySaved = payAppTimeSaved * hourlyRate;
  const certPayrollSaved = 3;
  const certPayrollMoneySaved = certPayrollSaved * hourlyRate;
  const adminSaved = 6;
  const adminMoneySaved = adminSaved * hourlyRate;
  const totalMonthlySaved =
    takeoffMoneySaved + lienWaiverMoneySaved + payAppMoneySaved + certPayrollMoneySaved + adminMoneySaved;
  const saguaroCost = 499;
  const softwareSavings = Math.max(0, effectiveSoftwareCost - saguaroCost);
  const totalNetSavings = totalMonthlySaved + softwareSavings;
  const annualSavings = totalNetSavings * 12;
  const threeYearSavings = totalNetSavings * 36;
  const roiPercent = Math.round((totalNetSavings / saguaroCost) * 100);
  const paybackDays = Math.round(saguaroCost / (totalNetSavings / 30));

  const handleReset = () => {
    setTeamSize(defaultValues.teamSize);
    setBidsPerMonth(defaultValues.bidsPerMonth);
    setHoursPerTakeoff(defaultValues.hoursPerTakeoff);
    setHourlyRate(defaultValues.hourlyRate);
    setLienWaiversPerMonth(defaultValues.lienWaiversPerMonth);
    setCurrentSoftwareCost(defaultValues.currentSoftwareCost);
    setUseProcore(defaultValues.useProcore);
  };

  const handleProcoreToggle = () => {
    const next = !useProcore;
    setUseProcore(next);
    if (next) setCurrentSoftwareCost(1850);
    else setCurrentSoftwareCost(0);
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ email });
    window.location.href = `/signup?${params.toString()}`;
  };

  const SliderRow = ({
    label,
    value,
    min,
    max,
    step,
    onChange,
    prefix = '',
    suffix = '',
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    prefix?: string;
    suffix?: string;
  }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ color: DIM, fontSize: 14, fontWeight: 500 }}>{label}</label>
        <span style={{ color: TEXT, fontWeight: 600, fontSize: 15 }}>
          {prefix}{value % 1 === 0 ? value.toLocaleString() : value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          accentColor: GOLD,
          height: 6,
          cursor: 'pointer',
          background: `linear-gradient(to right, ${GOLD} ${((value - min) / (max - min)) * 100}%, ${BORDER} ${((value - min) / (max - min)) * 100}%)`,
          borderRadius: 3,
          outline: 'none',
          border: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color: '#8094B0', fontSize: 11 }}>{prefix}{min}{suffix}</span>
        <span style={{ color: '#8094B0', fontSize: 11 }}>{prefix}{max.toLocaleString()}{suffix}</span>
      </div>
    </div>
  );

  const SavingsRow = ({
    icon: IconCmp,
    label,
    hours,
    monthly,
  }: {
    icon: Icon;
    label: string;
    hours?: number;
    monthly: number;
  }) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: `1px solid ${HAIRLINE}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconCmp size={16} weight="duotone" color={GOLD} />
        <div>
          <div style={{ color: TEXT, fontSize: 13, fontWeight: 500 }}>{label}</div>
          {hours !== undefined && (
            <div style={{ color: DIM, fontSize: 11 }}>Saves {hours % 1 === 0 ? hours : hours.toFixed(1)} hrs/mo</div>
          )}
        </div>
      </div>
      <span style={{ color: GREEN, fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>
        +${fmt(monthly)}/mo
      </span>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-headline {
          animation: fadeInUp 0.6s ease both;
        }
        .hero-sub {
          animation: fadeInUp 0.6s 0.12s ease both;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: ${GOLD};
          cursor: pointer;
          border: none;
        }
        input[type=range]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: ${GOLD};
          cursor: pointer;
          border: none;
        }
        .nav-btn-outline {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.14);
          color: ${DIM};
          padding: 7px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: border-color 0.2s, color 0.2s;
          text-decoration: none;
          display: inline-block;
        }
        .nav-btn-outline:hover {
          border-color: rgba(255,255,255,0.25);
          color: ${TEXT};
        }
        .nav-btn-gold {
          background: ${GOLD};
          border: none;
          color: ${ON_GOLD};
          padding: 7px 18px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: background 0.2s;
          text-decoration: none;
          display: inline-block;
        }
        .nav-btn-gold:hover {
          background: var(--brand-primary-strong);
        }
        .cta-btn {
          background: ${GOLD};
          color: ${ON_GOLD};
          font-weight: 600;
          font-size: 15px;
          padding: 13px 28px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          width: 100%;
          transition: background 0.2s;
          text-decoration: none;
          display: block;
          text-align: center;
        }
        .cta-btn:hover {
          background: var(--brand-primary-strong);
        }
        .procore-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 10px;
          border: 1px solid ${HAIRLINE};
          background: ${CARD};
          cursor: pointer;
          transition: border-color 0.2s;
          margin-bottom: 24px;
          width: 100%;
          text-align: left;
        }
        .procore-toggle.active {
          border-color: color-mix(in srgb, var(--brand-primary) 50%, transparent);
          background: color-mix(in srgb, var(--brand-primary) 5%, transparent);
        }
        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .comparison-table th {
          padding: 14px 12px;
          text-align: center;
          font-weight: 600;
          font-size: 12px;
          border-bottom: 1px solid ${HAIRLINE};
        }
        .comparison-table td {
          padding: 12px;
          text-align: center;
          border-bottom: 1px solid ${HAIRLINE};
          color: ${DIM};
          font-size: 13px;
        }
        .comparison-table td:first-child {
          text-align: left;
          color: ${TEXT};
          font-weight: 500;
        }
        .comparison-table tr:hover td {
          background: rgba(255,255,255,0.02);
        }
        .trust-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.14);
          background: transparent;
          color: ${DIM};
          font-size: 12px;
          white-space: nowrap;
        }
        @media (max-width: 768px) {
          .calc-grid {
            grid-template-columns: 1fr !important;
          }
          .results-sticky {
            position: static !important;
          }
          .method-grid {
            grid-template-columns: 1fr !important;
          }
          .trust-pills-row {
            flex-wrap: wrap;
          }
          .footer-links {
            flex-direction: column;
            gap: 12px !important;
          }
        }
        @media (max-width: 480px) {
          .cta-btn {
            font-size: 14px !important;
            padding: 12px 20px !important;
          }
        }
      `}</style>

      <div className="mkt-page" style={{ background: DARK, minHeight: '100vh', color: TEXT, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>

        {/* NAV */}
        <nav style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(13,17,23,0.9)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${HAIRLINE}`,
          padding: '0 24px',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 58 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Saguaro Control Systems — home">
              <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link href="/login" className="nav-btn-outline">Log In</Link>
              <Link href="/signup" className="nav-btn-gold">Free Trial</Link>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section style={{
          padding: '96px 24px 64px',
          textAlign: 'center',
          background: 'transparent',
        }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: `1px solid rgba(255,255,255,0.14)`,
              color: DIM,
              fontSize: 12,
              fontWeight: 500,
              padding: '6px 14px',
              borderRadius: 999,
              marginBottom: 28,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
              ROI Calculator
            </div>
            <h1
              className="hero-headline"
              style={{
                fontWeight: 600,
                lineHeight: 1.2,
                margin: '0 0 18px',
                letterSpacing: -0.5,
                whiteSpace: 'pre-line',
              }}
            >
              {"How Much Is Manual Work\nCosting Your Business?"}
            </h1>
            <p
              className="hero-sub"
              style={{
                fontSize: 'clamp(15px, 2vw, 17px)',
                color: DIM,
                lineHeight: 1.65,
                margin: 0,
                maxWidth: 580,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Enter your numbers below and see exactly what you&apos;re leaving on the table — and how fast Saguaro pays for itself.
            </p>
          </div>
        </section>

        {/* MAIN CALCULATOR */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1200, margin: '0 auto' }}>
          <div
            className="calc-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 420px',
              gap: 32,
              alignItems: 'start',
            }}
          >
            {/* LEFT: Inputs */}
            <div>
              <div style={{
                background: CARD,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 14,
                padding: '28px 24px',
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Your Business</h2>
                  <button
                    onClick={handleReset}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${HAIRLINE}`,
                      color: DIM,
                      fontSize: 12,
                      padding: '5px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, color 0.2s',
                    }}
                    onMouseOver={(e) => { (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.25)'; (e.target as HTMLButtonElement).style.color = TEXT; }}
                    onMouseOut={(e) => { (e.target as HTMLButtonElement).style.borderColor = HAIRLINE; (e.target as HTMLButtonElement).style.color = DIM; }}
                  >
                    Reset to Defaults
                  </button>
                </div>

                <SliderRow
                  label="Team Size (Field + Office)"
                  value={teamSize}
                  min={1}
                  max={100}
                  step={1}
                  onChange={setTeamSize}
                  suffix=" people"
                />
                <SliderRow
                  label="Bids Submitted per Month"
                  value={bidsPerMonth}
                  min={1}
                  max={40}
                  step={1}
                  onChange={setBidsPerMonth}
                  suffix=" bids"
                />
                <SliderRow
                  label="Hours Spent per Takeoff (Currently)"
                  value={hoursPerTakeoff}
                  min={1}
                  max={12}
                  step={0.5}
                  onChange={setHoursPerTakeoff}
                  suffix=" hrs"
                />
                <SliderRow
                  label="Estimator Hourly Rate"
                  value={hourlyRate}
                  min={40}
                  max={200}
                  step={5}
                  onChange={setHourlyRate}
                  prefix="$"
                  suffix="/hr"
                />
              </div>

              <div style={{
                background: CARD,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 14,
                padding: '28px 24px',
              }}>
                <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 600 }}>Operations &amp; Software</h2>

                <SliderRow
                  label="Lien Waivers Processed per Month"
                  value={lienWaiversPerMonth}
                  min={0}
                  max={100}
                  step={1}
                  onChange={setLienWaiversPerMonth}
                  suffix=" waivers"
                />

                <div style={{ marginBottom: 24 }}>
                  <p style={{ color: DIM, fontSize: 13, margin: '0 0 10px' }}>Current Project Management Software</p>
                  <button
                    className={`procore-toggle${useProcore ? ' active' : ''}`}
                    onClick={handleProcoreToggle}
                  >
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      border: `1px solid ${useProcore ? GOLD : BORDER}`,
                      background: useProcore ? GOLD : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.2s',
                    }}>
                      {useProcore && <span style={{ fontSize: 12, color: ON_GOLD, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ color: TEXT, fontWeight: 500, fontSize: 14 }}>
                        I Use Procore
                      </div>
                      {useProcore && (
                        <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>
                          Procore typically costs $1,850+/mo for a team of your size.
                        </div>
                      )}
                    </div>
                  </button>
                </div>

                <SliderRow
                  label={useProcore ? "Current Software Cost (Procore)" : "Current Monthly Software Cost"}
                  value={effectiveSoftwareCost}
                  min={0}
                  max={5000}
                  step={50}
                  onChange={(v) => { setCurrentSoftwareCost(v); if (v !== 1850) setUseProcore(false); }}
                  prefix="$"
                  suffix="/mo"
                />
              </div>
            </div>

            {/* RIGHT: Results */}
            <div
              className="results-sticky"
              style={{ position: 'sticky', top: 80 }}
            >
              <div
                style={{
                  background: CARD,
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 14,
                  padding: '28px 24px',
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${HAIRLINE}` }}>
                  <div style={{ color: DIM, fontSize: 12, marginBottom: 10, fontWeight: 500 }}>
                    Your Estimated Savings
                  </div>
                  <div style={{
                    fontSize: 44,
                    fontWeight: 600,
                    color: TEXT,
                    lineHeight: 1,
                    letterSpacing: -1,
                  }}>
                    ${fmt(totalNetSavings)}
                  </div>
                  <div style={{ color: DIM, fontSize: 15, marginTop: 8, fontWeight: 400 }}>Per Month</div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <SavingsRow icon={Timer} label="AI Blueprint Takeoff" hours={takeoffTimeSaved} monthly={takeoffMoneySaved} />
                  <SavingsRow icon={FileText} label="Lien Waivers" hours={lienWaiverTimeSaved} monthly={lienWaiverMoneySaved} />
                  <SavingsRow icon={CurrencyDollar} label="Pay Applications" hours={payAppTimeSaved} monthly={payAppMoneySaved} />
                  <SavingsRow icon={HardHat} label="Certified Payroll" hours={certPayrollSaved} monthly={certPayrollMoneySaved} />
                  <SavingsRow icon={CheckCircle} label="Admin & Compliance" hours={adminSaved} monthly={adminMoneySaved} />
                  {softwareSavings > 0 && (
                    <SavingsRow icon={Laptop} label="Software Savings" monthly={softwareSavings} />
                  )}
                </div>

                <div style={{
                  background: 'transparent',
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: TEXT, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
                        ${fmt(annualSavings)}
                      </div>
                      <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>Per Year</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: TEXT, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
                        ${fmt(threeYearSavings)}
                      </div>
                      <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>Over 3 Years</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  <div style={{
                    flex: 1,
                    background: 'transparent',
                    border: `1px solid ${HAIRLINE}`,
                    borderRadius: 8,
                    padding: '12px 10px',
                    textAlign: 'center',
                  }}>
                    <div style={{ color: TEXT, fontSize: 20, fontWeight: 600 }}>{roiPercent}%</div>
                    <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>ROI</div>
                  </div>
                  <div style={{
                    flex: 1,
                    background: 'transparent',
                    border: `1px solid ${HAIRLINE}`,
                    borderRadius: 8,
                    padding: '12px 10px',
                    textAlign: 'center',
                  }}>
                    <div style={{ color: TEXT, fontSize: 20, fontWeight: 600 }}>{paybackDays}d</div>
                    <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>Payback Period</div>
                  </div>
                </div>

                <div style={{ marginBottom: 12, padding: '10px 14px', background: 'transparent', border: `1px solid ${HAIRLINE}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Lightbulb size={14} weight="duotone" color={GOLD} />
                  <span style={{ color: DIM, fontSize: 12 }}>
                    Pays for itself in <strong style={{ color: GREEN, fontWeight: 600 }}>{paybackDays} days</strong> — Saguaro is just <strong style={{ color: TEXT, fontWeight: 600 }}>${saguaroCost}/mo flat</strong>.
                  </span>
                </div>

                <Link href="/signup" className="cta-btn">
                  Claim This ROI — Start Free Trial →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* HOW WE CALCULATE */}
        <section style={{
          padding: '96px 24px',
          background: 'transparent',
          borderTop: `1px solid ${HAIRLINE}`,
          borderBottom: `1px solid ${HAIRLINE}`,
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{
                display: 'inline-block',
                padding: '5px 14px',
                background: 'transparent',
                border: `1px solid rgba(255,255,255,0.14)`,
                borderRadius: 999,
                color: DIM,
                fontSize: 11,
                fontWeight: 500,
                marginBottom: 16,
              }}>
                Methodology
              </div>
              <h2 style={{ fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>
                Built on Real GC Data
              </h2>
            </div>

            <div
              className="method-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}
            >
              {([
                {
                  icon: Timer,
                  title: 'Time Savings',
                  desc: 'Based on surveying 200+ GC estimators on time spent per task — takeoffs, lien waivers, pay apps, and compliance paperwork. We use conservative medians, not best-case scenarios.',
                },
                {
                  icon: ChartBar,
                  title: 'Industry Rates',
                  desc: "Uses Bureau of Labor Statistics construction estimator rates. Your input overrides the default. We use your actual burdened cost so the numbers reflect reality for your business.",
                },
                {
                  icon: Laptop,
                  title: 'Software Comparison',
                  desc: "Procore pricing from public data and verified customer contracts. Saguaro is $499/mo flat — no per-seat fees, no add-ons, no surprise invoices. Your current spend overrides defaults.",
                },
              ] as { icon: Icon; title: string; desc: string }[]).map((card) => (
                <div
                  key={card.title}
                  style={{
                    background: 'transparent',
                    borderTop: `1px solid ${HAIRLINE}`,
                    borderRadius: 0,
                    padding: '24px 4px',
                  }}
                >
                  <div style={{ marginBottom: 14 }}><card.icon size={24} weight="duotone" color={GOLD} /></div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600 }}>{card.title}</h3>
                  <p style={{ margin: 0, color: DIM, fontSize: 14, lineHeight: 1.65 }}>{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section style={{ padding: '96px 24px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-block',
              padding: '5px 14px',
              background: 'transparent',
              border: `1px solid rgba(255,255,255,0.14)`,
              borderRadius: 999,
              color: DIM,
              fontSize: 11,
              fontWeight: 500,
              marginBottom: 16,
            }}>
              Feature Comparison
            </div>
            <h2 style={{ fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>
              {"What's Included in the $499"}
            </h2>
            <p style={{ color: DIM, fontSize: 16, marginTop: 12 }}>
              Everything you need. No per-seat pricing. No hidden add-ons.
            </p>
          </div>

          <div style={{
            background: CARD,
            border: `1px solid ${HAIRLINE}`,
            borderRadius: 14,
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
            maxWidth: '100%',
          }}>
            <table className="comparison-table">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ textAlign: 'left', color: DIM, padding: '16px 20px' }}>Feature</th>
                  <th style={{ color: DIM }}>Manual</th>
                  <th style={{ color: DIM }}>Procore</th>
                  <th style={{ color: TEXT }}>Saguaro $499/mo</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['AI Blueprint Takeoff', 'Hours of work', 'Not included', '✓ Included'],
                  ['Lien Waiver Automation', 'Manual PDFs', 'Add-on fee', '✓ Included'],
                  ['Pay Applications', 'Spreadsheets', '✓ Included', '✓ Included'],
                  ['Certified Payroll', 'Manual entry', 'Add-on / limited', '✓ Included'],
                  ['Field App', 'Pen & paper', '✓ Included', '✓ Included'],
                  ['Bid Intelligence', 'None', 'None', '✓ Included'],
                  ['Client Portal', 'Email threads', 'Extra cost', '✓ Included'],
                  ['Sub Portal', 'None', 'Extra cost', '✓ Included'],
                ].map(([feature, manual, procore, saguaro]) => (
                  <tr key={feature}>
                    <td style={{ padding: '14px 20px', color: TEXT, fontWeight: 500 }}>{feature}</td>
                    <td style={{ color: '#ef4444' }}>{manual}</td>
                    <td style={{ color: procore === '✓ Included' ? GREEN : DIM }}>{procore}</td>
                    <td style={{ color: GREEN, fontWeight: 600 }}>{saguaro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{
          padding: '112px 24px',
          background: 'transparent',
          borderTop: `1px solid ${HAIRLINE}`,
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{
              display: 'inline-block',
              padding: '5px 14px',
              background: 'transparent',
              border: `1px solid rgba(255,255,255,0.14)`,
              borderRadius: 999,
              color: DIM,
              fontSize: 11,
              fontWeight: 500,
              marginBottom: 20,
            }}>
              Get Started Today
            </div>
            <h2 style={{ fontWeight: 600, margin: '0 0 16px', letterSpacing: -0.4, lineHeight: 1.2 }}>
              Ready to Stop Leaving<br />Money on the Table?
            </h2>
            <p style={{ color: DIM, fontSize: 16, lineHeight: 1.6, marginBottom: 40 }}>
              Join hundreds of GCs already saving time and money with Saguaro. Start your free 30-day trial — no credit card required.
            </p>

            <form onSubmit={handleEmailSubmit} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', gap: 12, maxWidth: 480, margin: '0 auto', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    flex: 1,
                    background: DARK,
                    border: `1px solid ${HAIRLINE}`,
                    borderRadius: 8,
                    padding: '14px 18px',
                    color: TEXT,
                    fontSize: 15,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = GOLD)}
                  onBlur={(e) => (e.target.style.borderColor = HAIRLINE)}
                />
                <button
                  type="submit"
                  className="cta-btn"
                  style={{ width: 'auto', maxWidth: '100%', whiteSpace: 'normal', fontSize: 15, padding: '14px 24px' }}
                >
                  Start My Free 30-Day Trial
                </button>
              </div>
            </form>

            <div
              className="trust-pills-row"
              style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}
            >
              {['No Credit Card Required', 'Cancel Anytime', '30-Day Free Trial', 'SOC 2 Compliant', 'US-Based Support'].map((pill) => (
                <span key={pill} className="trust-pill">
                  <span style={{ color: GREEN, fontSize: 10 }}>✓</span>
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{
          borderTop: `1px solid ${HAIRLINE}`,
          padding: '48px 24px',
          background: RAISED,
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
              <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Saguaro Control Systems — home">
                <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 30 }} />
              </Link>
              <div className="footer-links" style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                {[
                  ['Features', '/features'],
                  ['Pricing', '/pricing'],
                  ['ROI Calculator', '/roi-calculator'],
                  ['Sign Up', '/signup'],
                  ['Log In', '/login'],
                ].map(([label, href]) => (
                  <Link key={label} href={href} style={{ color: DIM, textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = TEXT)}
                    onMouseOut={(e) => (e.currentTarget.style.color = DIM)}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <p style={{ margin: 0, color: '#8094B0', fontSize: 13 }}>
                &copy; {new Date().getFullYear()} Saguaro Control Systems. All rights reserved.
              </p>
              <div style={{ display: 'flex', gap: 20 }}>
                {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']].map(([label, href]) => (
                  <Link key={label} href={href} style={{ color: '#8094B0', textDecoration: 'none', fontSize: 13 }}
                    onMouseOver={(e) => (e.currentTarget.style.color = DIM)}
                    onMouseOut={(e) => (e.currentTarget.style.color = '#8094B0')}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
