'use client';
/**
 * Saguaro — Prevailing Wage Calculator
 * Live, table-driven Davis-Bacon / state prevailing-wage lookup.
 * Rates come from `wage_determinations` via GET /api/prevailing-wage.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toCents, toDollars, extend } from '@/lib/calc';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty } from '@/components/ui/premium';
import { Scales, MagnifyingGlass, CurrencyDollar, Calculator, CalendarBlank, CalendarCheck, Table as TableIcon, FileMagnifyingGlass } from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)';
const GREEN = '#2CFF7A';
const BLUE = 'var(--brand-primary)';
const TEXT = '#FFFFFF';
const DIM = '#D4D4D8';
const BORDER = 'rgba(255,255,255,0.12)';

interface Rate {
  id: string;
  state: string;
  county: string | null;
  determination_number: string | null;
  effective_date: string | null;
  classification: string;
  base: number;
  fringe: number;
  total: number;
  custom: boolean;
}
interface Determination {
  determination_number: string;
  effective_date: string | null;
  county: string | null;
}
interface WageResponse {
  states: string[];
  counties: string[];
  determinations: Determination[];
  rates: Rate[];
}

const STATE_NAMES: Record<string, string> = {
  AZ: 'Arizona', CA: 'California', TX: 'Texas', NV: 'Nevada', CO: 'Colorado',
  FL: 'Florida', NM: 'New Mexico', UT: 'Utah', WA: 'Washington', OR: 'Oregon',
  NY: 'New York', IL: 'Illinois', GA: 'Georgia', NC: 'North Carolina',
};

const HOUR_PRESETS = [
  { label: '8hr Day', hours: 8 },
  { label: '40hr Week', hours: 40 },
  { label: 'Custom', hours: 0 },
];

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PrevailingWagePage() {
  const [states, setStates] = useState<string[]>([]);
  const [state, setState] = useState('');
  const [county, setCounty] = useState(''); // '' = All / statewide
  const [determination, setDetermination] = useState(''); // '' = All
  const [allRates, setAllRates] = useState<Rate[]>([]);
  const [countyList, setCountyList] = useState<string[]>([]);
  const [determinations, setDeterminations] = useState<Determination[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [hoursPreset, setHoursPreset] = useState(8);
  const [customHours, setCustomHours] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadState = useCallback(async (st: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = st ? `?state=${encodeURIComponent(st)}` : '';
      const r = await fetch(`/api/prevailing-wage${qs}`);
      const d = (await r.json()) as WageResponse & { error?: string };
      if (d.error) setError(d.error);
      setStates((prev) => (d.states?.length ? d.states : prev));
      setCountyList(d.counties || []);
      setDeterminations(d.determinations || []);
      setAllRates(d.rates || []);
    } catch {
      setError('Failed to load prevailing wage rates.');
      setAllRates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: fetch state list, then default to first available state.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/prevailing-wage');
        const d = (await r.json()) as WageResponse & { error?: string };
        const list = d.states || [];
        setStates(list);
        const first = list.includes('AZ') ? 'AZ' : list[0] || '';
        setState(first);
        if (first) await loadState(first);
        else setLoading(false);
      } catch {
        setError('Failed to load prevailing wage rates.');
        setLoading(false);
      }
    })();
  }, [loadState]);

  function onStateChange(st: string) {
    setState(st);
    setCounty('');
    setDetermination('');
    setSelectedClass('');
    loadState(st);
  }

  // County-filtered rate set (statewide rows, county === null, always included).
  const countyRates = useMemo(
    () => allRates.filter((r) => !county || r.county === county || r.county == null),
    [allRates, county],
  );

  // Determinations available for the chosen county.
  const countyDeterminations = useMemo(() => {
    const map = new Map<string, Determination>();
    for (const r of countyRates) {
      if (!r.determination_number) continue;
      if (!map.has(r.determination_number)) {
        map.set(r.determination_number, {
          determination_number: r.determination_number,
          effective_date: r.effective_date,
          county: r.county,
        });
      }
    }
    const arr = Array.from(map.values());
    return arr.length ? arr : determinations;
  }, [countyRates, determinations]);

  // Determination-filtered rates (the schedule the user is pricing against).
  const rates = useMemo(
    () => countyRates.filter((r) => !determination || r.determination_number === determination),
    [countyRates, determination],
  );

  // Keep a valid classification selected as the filters change.
  useEffect(() => {
    if (rates.length === 0) {
      if (selectedClass) setSelectedClass('');
      return;
    }
    if (!rates.some((r) => r.classification === selectedClass)) {
      setSelectedClass(rates[0].classification);
    }
  }, [rates, selectedClass]);

  const rate = useMemo(
    () => rates.find((r) => r.classification === selectedClass) || rates[0] || null,
    [rates, selectedClass],
  );

  const activeDetermination = useMemo(() => {
    if (!rate) return null;
    return (
      countyDeterminations.find((d) => d.determination_number === rate.determination_number) ||
      (rate.determination_number
        ? { determination_number: rate.determination_number, effective_date: rate.effective_date, county: rate.county }
        : null)
    );
  }, [rate, countyDeterminations]);

  const hours = isCustom ? parseFloat(customHours) || 0 : hoursPreset;

  const baseCost = rate ? toDollars(extend(hours, toCents(rate.base))) : 0;
  const fringeCost = rate ? toDollars(extend(hours, toCents(rate.fringe))) : 0;
  const totalCost = rate ? toDollars(extend(hours, toCents(rate.total))) : 0;
  const dailyCost = rate ? toDollars(extend(8, toCents(rate.total))) : 0;
  const weeklyCost = rate ? toDollars(extend(40, toCents(rate.total))) : 0;

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-surface-2)',
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    color: TEXT,
    width: '100%',
    outline: 'none',
  };

  return (
    <PremiumSurface maxWidth={1040}>
      {/* Header */}
      <ModuleHero
        eyebrow="Compliance"
        eyebrowIcon={<Scales size={13} weight="fill" color="var(--brand-primary)" />}
        title="Prevailing Wage"
        accent="Calculator"
        subtitle={<>
          Davis-Bacon &amp; state prevailing-wage determinations
          {activeDetermination?.determination_number
            ? ` — ${activeDetermination.determination_number} (effective ${fmtDate(activeDetermination.effective_date)})`
            : ''}
        </>}
      />

      {/* Honesty disclaimer — the shared schedule is sample/reference data, not
          an official determination. Tenant-entered CUSTOM rows are authoritative. */}
      <div style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: '#D4D4D8', lineHeight: 1.55 }}>
        <span style={{ fontWeight: 800, color: 'var(--warning)', marginRight: 6 }}>Sample / Reference Rates</span>
        These are realistic Davis-Bacon-style rates for estimating and planning only — <strong>not an official wage determination</strong>. Before certifying payroll, verify against the official determination on{' '}
        <a href="https://sam.gov/content/wage-determinations" target="_blank" rel="noopener noreferrer" style={{ color: GOLD, fontWeight: 700 }}>SAM.gov (WDOL)</a>{' '}
        for the exact project, county and decision number. Rows marked <span style={{ color: BLUE, fontWeight: 800 }}>Custom</span> are your own tenant-entered determination and override the sample schedule.
      </div>
      {error && (
        <div style={{ background: 'rgba(192,48,48,.1)', border: '1px solid rgba(192,48,48,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#FF3B30' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(300px, 1.1fr)', gap: 24 }}>
        {/* Left: Inputs */}
        <SectionCard title="Wage Lookup" icon={<MagnifyingGlass size={17} weight="duotone" color={GOLD} />}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>State</label>
            <select value={state} onChange={(e) => onStateChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {states.length === 0 && <option value="">No Data</option>}
              {states.map((s) => (
                <option key={s} value={s}>{STATE_NAMES[s] ? `${STATE_NAMES[s]} (${s})` : s}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>County</label>
            <select
              value={county}
              onChange={(e) => { setCounty(e.target.value); setDetermination(''); }}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">All Counties / Statewide</option>
              {countyList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Determination</label>
            <select
              value={determination}
              onChange={(e) => setDetermination(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
              disabled={countyDeterminations.length === 0}
            >
              <option value="">{countyDeterminations.length > 1 ? 'All Determinations' : 'Current Determination'}</option>
              {countyDeterminations.map((d) => (
                <option key={d.determination_number} value={d.determination_number}>
                  {d.determination_number} — {fmtDate(d.effective_date)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Trade / Classification</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
              disabled={rates.length === 0}
            >
              {rates.length === 0 && <option value="">No Classifications</option>}
              {rates.map((r) => (
                <option key={r.id} value={r.classification}>
                  {r.classification}{r.custom ? ' (Custom)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Hours</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {HOUR_PRESETS.map((p) => {
                const active = (!isCustom && hoursPreset === p.hours && p.label !== 'Custom') || (isCustom && p.label === 'Custom');
                return (
                  <button
                    key={p.label}
                    onClick={() => {
                      if (p.label === 'Custom') setIsCustom(true);
                      else { setIsCustom(false); setHoursPreset(p.hours); }
                    }}
                    style={{
                      background: active ? 'color-mix(in srgb, var(--brand-primary) 15%, transparent)' : 'var(--bg-surface-2)',
                      color: active ? GOLD : DIM,
                      border: `1px solid ${active ? 'color-mix(in srgb, var(--brand-primary) 25%, transparent)' : BORDER}`,
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
                );
              })}
            </div>
            {isCustom && (
              <input
                type="number"
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
                placeholder="Enter hours"
                min="0"
                step="0.5"
                style={inputStyle}
              />
            )}
          </div>
        </SectionCard>

        {/* Right: Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <SectionCard flat>
              <div style={{ textAlign: 'center', color: DIM, fontSize: 14, padding: '20px 0' }}>
                Loading rate schedule…
              </div>
            </SectionCard>
          ) : !rate ? (
            <SectionCard flat>
              <PremiumEmpty
                icon={<FileMagnifyingGlass size={30} weight="duotone" color={GOLD} />}
                title="No determination found"
                description="No prevailing wage determination found for this selection."
                compact
              />
            </SectionCard>
          ) : (
            <>
              {/* Rate Card */}
              <SectionCard
                title="Rate Details"
                icon={<CurrencyDollar size={17} weight="duotone" color={GREEN} />}
                accent={GREEN}
                action={
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: 'var(--brand-primary-12)', color: BLUE }}>
                    {rate.classification}
                  </span>
                }
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: 11, color: DIM, fontWeight: 600, padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>Component</th>
                      <th style={{ textAlign: 'right', fontSize: 11, color: DIM, fontWeight: 600, padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>Rate/hr</th>
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
                <div style={{ marginTop: 12, fontSize: 11, color: DIM }}>
                  {rate.state}{rate.county ? ` · ${rate.county} County` : ' · Statewide'}
                  {activeDetermination?.determination_number ? ` · ${activeDetermination.determination_number}` : ''}
                  {' · Effective '}{fmtDate(activeDetermination?.effective_date ?? rate.effective_date)}
                </div>
              </SectionCard>

              {/* Cost Calculation Card */}
              <SectionCard
                title="Cost Calculation"
                subtitle={`${hours} hours`}
                icon={<Calculator size={17} weight="duotone" color={GOLD} />}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: 11, color: DIM, fontWeight: 600, padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>Component</th>
                      <th style={{ textAlign: 'right', fontSize: 11, color: DIM, fontWeight: 600, padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, borderBottom: `1px solid ${BORDER}` }}>Base ({fmt(rate.base)} × {hours}h)</td>
                      <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, textAlign: 'right', fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{fmt(baseCost)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, borderBottom: `1px solid ${BORDER}` }}>Fringe ({fmt(rate.fringe)} × {hours}h)</td>
                      <td style={{ padding: '10px 0', fontSize: 14, color: TEXT, textAlign: 'right', fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{fmt(fringeCost)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '12px 0', fontSize: 16, color: GREEN, fontWeight: 700 }}>Total Cost</td>
                      <td style={{ padding: '12px 0', fontSize: 18, color: GREEN, textAlign: 'right', fontWeight: 800 }}>{fmt(totalCost)}</td>
                    </tr>
                  </tbody>
                </table>
              </SectionCard>

              {/* Quick Reference */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <StatCard
                  icon={<CalendarBlank size={19} weight="duotone" color={GOLD} />}
                  label="Daily (8hr)"
                  value={fmt(dailyCost)}
                  sub={`${fmt(rate.total)}/hr total`}
                 href="/app/compliance/prevailing-wage"/>
                <StatCard
                  icon={<CalendarCheck size={19} weight="duotone" color={GOLD} />}
                  label="Weekly (40hr)"
                  value={fmt(weeklyCost)}
                  sub={`${fmt(rate.total)}/hr total`}
                 href="/app/compliance/prevailing-wage"/>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Full Rate Table */}
      <SectionCard
        title={`${state ? `${STATE_NAMES[state] || state} Rate Schedule` : 'Rate Schedule'}${county ? ` — ${county} County` : ''}`}
        icon={<TableIcon size={17} weight="duotone" color={GOLD} />}
        style={{ marginTop: 24 }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                {['Classification', 'Base Rate', 'Fringe', 'Total/hr', 'Daily (8hr)', 'Weekly (40hr)'].map((h) => (
                  <th key={h} style={{ textAlign: h === 'Classification' ? 'left' : 'right', fontSize: 11, color: DIM, fontWeight: 600, padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '20px 12px', textAlign: 'center', color: DIM, fontSize: 13 }}>
                    {loading ? 'Loading…' : 'No classifications for this selection.'}
                  </td>
                </tr>
              ) : (
                rates.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedClass(r.classification)}
                    style={{ cursor: 'pointer', background: selectedClass === r.classification ? 'var(--brand-primary-08)' : 'transparent', transition: 'background 0.15s' }}
                  >
                    <td style={{ padding: '10px 12px', fontSize: 14, color: selectedClass === r.classification ? GOLD : TEXT, fontWeight: selectedClass === r.classification ? 700 : 500, borderBottom: `1px solid ${BORDER}` }}>
                      {r.classification}{r.custom ? <span style={{ fontSize: 10, color: BLUE, marginLeft: 6, fontWeight: 700 }}>Custom</span> : null}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: TEXT, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(r.base)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: TEXT, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(r.fringe)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: GOLD, fontWeight: 700, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(r.total)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: DIM, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(toDollars(extend(8, toCents(r.total))))}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: DIM, textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmt(toDollars(extend(40, toCents(r.total))))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </PremiumSurface>
  );
}
