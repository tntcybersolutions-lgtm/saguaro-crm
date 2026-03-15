'use client';

import { useState } from 'react';

const DARK = '#0d1117';
const GOLD = '#F59E0B';
const TEXT = '#F8FAFC';
const DIM = '#CBD5E1';
const BORDER = '#1E3A5F';
const RAISED = '#0F172A';
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
  const saguaroCost = 399;
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
        <span style={{ color: GOLD, fontWeight: 700, fontSize: 16 }}>
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
        <span style={{ color: '#475569', fontSize: 11 }}>{prefix}{min}{suffix}</span>
        <span style={{ color: '#475569', fontSize: 11 }}>{prefix}{max.toLocaleString()}{suffix}</span>
      </div>
    </div>
  );

  const SavingsRow = ({
    icon,
    label,
    hours,
    monthly,
  }: {
    icon: string;
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
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div>
          <div style={{ color: TEXT, fontSize: 13, fontWeight: 500 }}>{label}</div>
          {hours !== undefined && (
            <div style={{ color: DIM, fontSize: 11 }}>saves {hours % 1 === 0 ? hours : hours.toFixed(1)} hrs/mo</div>
          )}
        </div>
      </div>
      <span style={{ color: GREEN, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>
        +${fmt(monthly)}/mo
      </span>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(32px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(245,158,11,0.2), 0 0 60px rgba(245,158,11,0.05); }
          50% { box-shadow: 0 0 30px rgba(245,158,11,0.35), 0 0 80px rgba(245,158,11,0.1); }
        }
        .hero-headline {
          animation: fadeInUp 0.7s ease both;
        }
        .hero-sub {
          animation: fadeInUp 0.7s 0.15s ease both;
        }
        .results-card {
          animation: glowPulse 4s ease-in-out infinite;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${GOLD};
          cursor: pointer;
          box-shadow: 0 0 8px rgba(245,158,11,0.5);
          transition: box-shadow 0.2s;
        }
        input[type=range]::-webkit-slider-thumb:hover {
          box-shadow: 0 0 16px rgba(245,158,11,0.8);
        }
        input[type=range]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${GOLD};
          cursor: pointer;
          border: none;
          box-shadow: 0 0 8px rgba(245,158,11,0.5);
        }
        .nav-btn-outline {
          background: transparent;
          border: 1px solid ${BORDER};
          color: ${TEXT};
          padding: 8px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: border-color 0.2s, color 0.2s;
          text-decoration: none;
          display: inline-block;
        }
        .nav-btn-outline:hover {
          border-color: ${GOLD};
          color: ${GOLD};
        }
        .nav-btn-gold {
          background: ${GOLD};
          border: none;
          color: #000;
          padding: 8px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          transition: background 0.2s, transform 0.1s;
          text-decoration: none;
          display: inline-block;
        }
        .nav-btn-gold:hover {
          background: #FBBF24;
          transform: translateY(-1px);
        }
        .cta-btn {
          background: linear-gradient(135deg, ${GOLD}, #FBBF24);
          color: #000;
          font-weight: 800;
          font-size: 18px;
          padding: 18px 36px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          width: 100%;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 24px rgba(245,158,11,0.3);
          letter-spacing: 0.01em;
          text-decoration: none;
          display: block;
          text-align: center;
        }
        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(245,158,11,0.5);
        }
        .procore-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 10px;
          border: 2px solid ${BORDER};
          background: ${RAISED};
          cursor: pointer;
          transition: border-color 0.2s;
          margin-bottom: 24px;
          width: 100%;
          text-align: left;
        }
        .procore-toggle.active {
          border-color: ${GOLD};
          background: rgba(245,158,11,0.08);
        }
        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .comparison-table th {
          padding: 14px 12px;
          text-align: center;
          font-weight: 700;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid ${BORDER};
        }
        .comparison-table td {
          padding: 12px;
          text-align: center;
          border-bottom: 1px solid ${BORDER};
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
          border: 1px solid ${BORDER};
          background: ${RAISED};
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
          .hero-headline {
            font-size: 32px !important;
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
          .hero-headline {
            font-size: 26px !important;
          }
          .cta-btn {
            font-size: 15px !important;
            padding: 14px 20px !important;
          }
        }
      `}</style>

      <div style={{ background: DARK, minHeight: '100vh', color: TEXT, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>

        {/* NAV */}
        <nav style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(13,17,23,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${BORDER}`,
          padding: '0 24px',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              <img src="/logo-full.jpg" alt="Saguaro" style={{ height: 48, mixBlendMode: 'screen' }} />
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <a href="/login" className="nav-btn-outline">Log In</a>
              <a href="/signup" className="nav-btn-gold">Start Free Trial</a>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section style={{
          padding: '80px 24px 64px',
          textAlign: 'center',
          background: `radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.08) 0%, transparent 60%)`,
        }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{
              display: 'inline-block',
              background: 'rgba(245,158,11,0.1)',
              border: `1px solid rgba(245,158,11,0.3)`,
              color: GOLD,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.18em',
              padding: '6px 16px',
              borderRadius: 100,
              marginBottom: 24,
              textTransform: 'uppercase',
            }}>
              ROI CALCULATOR
            </div>
            <h1
              className="hero-headline"
              style={{
                fontSize: 52,
                fontWeight: 900,
                lineHeight: 1.1,
                margin: '0 0 20px',
                letterSpacing: '-0.02em',
                whiteSpace: 'pre-line',
              }}
            >
              {"How Much Is Manual Work\nCosting Your Business?"}
            </h1>
            <p
              className="hero-sub"
              style={{
                fontSize: 18,
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
        <section style={{ padding: '0 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
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
                background: RAISED,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: '32px 28px',
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Your Business</h2>
                  <button
                    onClick={handleReset}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${BORDER}`,
                      color: DIM,
                      fontSize: 12,
                      padding: '5px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, color 0.2s',
                    }}
                    onMouseOver={(e) => { (e.target as HTMLButtonElement).style.borderColor = GOLD; (e.target as HTMLButtonElement).style.color = GOLD; }}
                    onMouseOut={(e) => { (e.target as HTMLButtonElement).style.borderColor = BORDER; (e.target as HTMLButtonElement).style.color = DIM; }}
                  >
                    Reset to defaults
                  </button>
                </div>

                <SliderRow
                  label="Team size (field + office)"
                  value={teamSize}
                  min={1}
                  max={100}
                  step={1}
                  onChange={setTeamSize}
                  suffix=" people"
                />
                <SliderRow
                  label="Bids submitted per month"
                  value={bidsPerMonth}
                  min={1}
                  max={40}
                  step={1}
                  onChange={setBidsPerMonth}
                  suffix=" bids"
                />
                <SliderRow
                  label="Hours spent per takeoff (currently)"
                  value={hoursPerTakeoff}
                  min={1}
                  max={12}
                  step={0.5}
                  onChange={setHoursPerTakeoff}
                  suffix=" hrs"
                />
                <SliderRow
                  label="Estimator hourly rate"
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
                background: RAISED,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: '32px 28px',
              }}>
                <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700 }}>Operations & Software</h2>

                <SliderRow
                  label="Lien waivers processed per month"
                  value={lienWaiversPerMonth}
                  min={0}
                  max={100}
                  step={1}
                  onChange={setLienWaiversPerMonth}
                  suffix=" waivers"
                />

                <div style={{ marginBottom: 24 }}>
                  <p style={{ color: DIM, fontSize: 13, margin: '0 0 10px' }}>Current project management software</p>
                  <button
                    className={`procore-toggle${useProcore ? ' active' : ''}`}
                    onClick={handleProcoreToggle}
                  >
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      border: `2px solid ${useProcore ? GOLD : BORDER}`,
                      background: useProcore ? GOLD : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.2s',
                    }}>
                      {useProcore && <span style={{ fontSize: 12, color: '#000', fontWeight: 800 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ color: useProcore ? GOLD : TEXT, fontWeight: 600, fontSize: 14 }}>
                        I use Procore
                      </div>
                      {useProcore && (
                        <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>
                          Procore typically costs $1,850+/mo for a team of your size
                        </div>
                      )}
                    </div>
                  </button>
                </div>

                <SliderRow
                  label={useProcore ? "Current software cost (Procore)" : "Current monthly software cost"}
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
                className="results-card"
                style={{
                  background: RAISED,
                  border: `2px solid ${GOLD}`,
                  borderRadius: 20,
                  padding: '28px 24px',
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ color: DIM, fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                    Your estimated savings
                  </div>
                  <div style={{
                    fontSize: 52,
                    fontWeight: 900,
                    color: GOLD,
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                    transition: 'all 0.3s ease',
                  }}>
                    ${fmt(totalNetSavings)}
                  </div>
                  <div style={{ color: DIM, fontSize: 16, marginTop: 6, fontWeight: 500 }}>per month</div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <SavingsRow icon="⏱" label="AI Blueprint Takeoff" hours={takeoffTimeSaved} monthly={takeoffMoneySaved} />
                  <SavingsRow icon="📄" label="Lien Waivers" hours={lienWaiverTimeSaved} monthly={lienWaiverMoneySaved} />
                  <SavingsRow icon="💰" label="Pay Applications" hours={payAppTimeSaved} monthly={payAppMoneySaved} />
                  <SavingsRow icon="🏗" label="Certified Payroll" hours={certPayrollSaved} monthly={certPayrollMoneySaved} />
                  <SavingsRow icon="✅" label="Admin & Compliance" hours={adminSaved} monthly={adminMoneySaved} />
                  {softwareSavings > 0 && (
                    <SavingsRow icon="💻" label="Software Savings" monthly={softwareSavings} />
                  )}
                </div>

                <div style={{
                  background: 'rgba(245,158,11,0.06)',
                  border: `1px solid rgba(245,158,11,0.15)`,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: GOLD, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
                        ${fmt(annualSavings)}
                      </div>
                      <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>per year</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: GREEN, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
                        ${fmt(threeYearSavings)}
                      </div>
                      <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>over 3 years</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  <div style={{
                    flex: 1,
                    background: DARK,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: '12px 10px',
                    textAlign: 'center',
                  }}>
                    <div style={{ color: GREEN, fontSize: 20, fontWeight: 800 }}>{roiPercent}%</div>
                    <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>ROI</div>
                  </div>
                  <div style={{
                    flex: 1,
                    background: DARK,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: '12px 10px',
                    textAlign: 'center',
                  }}>
                    <div style={{ color: GOLD, fontSize: 20, fontWeight: 800 }}>{paybackDays}d</div>
                    <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>payback period</div>
                  </div>
                </div>

                <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>💡</span>
                  <span style={{ color: DIM, fontSize: 12 }}>
                    Pays for itself in <strong style={{ color: GREEN }}>{paybackDays} days</strong> — Saguaro is just <strong style={{ color: TEXT }}>${saguaroCost}/mo flat</strong>
                  </span>
                </div>

                <a href="/signup" className="cta-btn">
                  Claim This ROI — Start Free Trial →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* HOW WE CALCULATE */}
        <section style={{
          padding: '80px 24px',
          background: RAISED,
          borderTop: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}`,
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{
                display: 'inline-block',
                color: GOLD,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: 16,
              }}>
                Methodology
              </div>
              <h2 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                Built on Real GC Data
              </h2>
            </div>

            <div
              className="method-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}
            >
              {[
                {
                  icon: '⏱',
                  title: 'Time Savings',
                  desc: 'Based on surveying 200+ GC estimators on time spent per task — takeoffs, lien waivers, pay apps, and compliance paperwork. We use conservative medians, not best-case scenarios.',
                },
                {
                  icon: '📊',
                  title: 'Industry Rates',
                  desc: "Uses Bureau of Labor Statistics construction estimator rates. Your input overrides the default. We use your actual burdened cost so the numbers reflect reality for your business.",
                },
                {
                  icon: '💻',
                  title: 'Software Comparison',
                  desc: "Procore pricing from public data and verified customer contracts. Saguaro is $299/mo flat — no per-seat fees, no add-ons, no surprise invoices. Your current spend overrides defaults.",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  style={{
                    background: DARK,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    padding: '28px 24px',
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 14 }}>{card.icon}</div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700 }}>{card.title}</h3>
                  <p style={{ margin: 0, color: DIM, fontSize: 14, lineHeight: 1.65 }}>{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-block',
              color: GOLD,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 16,
            }}>
              Feature Comparison
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              {"What's Included in the $299"}
            </h2>
            <p style={{ color: DIM, fontSize: 16, marginTop: 12 }}>
              Everything you need. No per-seat pricing. No hidden add-ons.
            </p>
          </div>

          <div style={{
            background: RAISED,
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            <table className="comparison-table">
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <th style={{ textAlign: 'left', color: DIM, padding: '16px 20px' }}>Feature</th>
                  <th style={{ color: DIM }}>Manual</th>
                  <th style={{ color: DIM }}>Procore</th>
                  <th style={{ color: GOLD, borderBottom: `2px solid ${GOLD}` }}>Saguaro $299/mo</th>
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
                    <td style={{ color: manual === '✓ Included' ? GREEN : DIM }}>{procore}</td>
                    <td style={{ color: GREEN, fontWeight: 700 }}>{saguaro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{
          padding: '80px 24px',
          background: `radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.07) 0%, transparent 70%), ${RAISED}`,
          borderTop: `1px solid ${BORDER}`,
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{
              display: 'inline-block',
              color: GOLD,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 20,
            }}>
              Get Started Today
            </div>
            <h2 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              Ready to Stop Leaving<br />Money on the Table?
            </h2>
            <p style={{ color: DIM, fontSize: 17, lineHeight: 1.6, marginBottom: 40 }}>
              Join hundreds of GCs already saving time and money with Saguaro. Start your free 30-day trial — no credit card required.
            </p>

            <form onSubmit={handleEmailSubmit} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', gap: 12, maxWidth: 480, margin: '0 auto' }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    flex: 1,
                    background: DARK,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: '14px 18px',
                    color: TEXT,
                    fontSize: 15,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = GOLD)}
                  onBlur={(e) => (e.target.style.borderColor = BORDER)}
                />
                <button
                  type="submit"
                  className="cta-btn"
                  style={{ width: 'auto', whiteSpace: 'nowrap', fontSize: 15, padding: '14px 24px' }}
                >
                  Start My Free 30-Day Trial
                </button>
              </div>
            </form>

            <div
              className="trust-pills-row"
              style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}
            >
              {['No credit card required', 'Cancel anytime', '30-day free trial', 'SOC 2 compliant', 'US-based support'].map((pill) => (
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
          borderTop: `1px solid ${BORDER}`,
          padding: '40px 24px',
          background: DARK,
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
              <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <img src="/logo-full.jpg" alt="Saguaro" style={{ height: 40, mixBlendMode: 'screen' }} />
              </a>
              <div className="footer-links" style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                {[
                  ['Features', '/features'],
                  ['Pricing', '/pricing'],
                  ['ROI Calculator', '/roi-calculator'],
                  ['Sign Up', '/signup'],
                  ['Log In', '/login'],
                ].map(([label, href]) => (
                  <a key={label} href={href} style={{ color: DIM, textDecoration: 'none', fontSize: 14, transition: 'color 0.2s' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = GOLD)}
                    onMouseOut={(e) => (e.currentTarget.style.color = DIM)}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <p style={{ margin: 0, color: '#475569', fontSize: 13 }}>
                &copy; {new Date().getFullYear()} Saguaro. All rights reserved.
              </p>
              <div style={{ display: 'flex', gap: 20 }}>
                {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']].map(([label, href]) => (
                  <a key={label} href={href} style={{ color: '#475569', textDecoration: 'none', fontSize: 13 }}
                    onMouseOver={(e) => (e.currentTarget.style.color = DIM)}
                    onMouseOut={(e) => (e.currentTarget.style.color = '#475569')}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
