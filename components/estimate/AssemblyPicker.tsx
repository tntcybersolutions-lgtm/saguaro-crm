'use client';
import React, { useState, useMemo } from 'react';
import { X, Stack, Warning, MagnifyingGlass, Info } from '@phosphor-icons/react';
import {
  ASSEMBLIES, expandAssembly, searchAssemblies, assemblyNeedsPricing,
  defaultParams, paramSensitivity,
  type Assembly, type ExpandedLine, type AssemblyParam,
} from '@/lib/estimate-assemblies';
import { CSI_DIVISIONS } from '@/lib/estimate-grid';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF', ORANGE = '#B85C2A';

const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const qty = (n: unknown) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Pick an assembly and a driver quantity; get every line the work takes.
 *
 * The preview is the whole point. An estimator will not trust lines a library
 * produced unless they can see the arithmetic that produced them, so every
 * component shows its quantity, the basis it came from, and what it costs at
 * the library's placeholder pricing — before anything lands in the grid.
 */
export default function AssemblyPicker({
  open, onClose, onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (lines: ExpandedLine[], assembly: Assembly, driver: number) => void;
}) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Assembly | null>(null);
  const [driver, setDriver] = useState<string>('');
  /* Parameter values for the current assembly. Reset whenever the assembly
     changes, because a HEIGHT carried over from a partition means nothing on a
     slab. */
  const [params, setParams] = useState<Record<string, number>>({});
  const [showSensitivity, setShowSensitivity] = useState<string | null>(null);

  const results = useMemo(() => searchAssemblies(q), [q]);
  const driverQty = Number(driver);
  const preview = useMemo(
    () => (selected && driverQty > 0 ? expandAssembly(selected, driverQty, { params }) : null),
    [selected, driverQty, params],
  );

  const pick = (a: Assembly) => {
    setSelected(a);
    setParams(defaultParams(a));
    setShowSensitivity(null);
    if (!driver) setDriver('100');
  };

  /* What each setting of one parameter would do to the price — the question an
     estimator actually has, which is not "what does this cost" but "what does
     going to 24-inch spacing save me". */
  const sensitivity = useMemo(() => {
    if (!selected || !showSensitivity || driverQty <= 0) return null;
    const p = selected.params?.find((x) => x.name === showSensitivity);
    return p ? { param: p, rows: paramSensitivity(selected, driverQty, p, params) } : null;
  }, [selected, showSensitivity, driverQty, params]);
  const pricing = useMemo(() => (preview ? assemblyNeedsPricing(preview.lines) : null), [preview]);

  if (!open) return null;

  const inp: React.CSSProperties = {
    padding: '8px 10px', background: '#1c1c1e', border: '1px solid ' + BORDER,
    borderRadius: 6, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(980px, 100%)', maxHeight: '90vh', background: '#0f0f11', border: '1px solid ' + BORDER, borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}
      >
        <div style={{ padding: '15px 20px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Stack size={19} weight="duotone" color={GOLD} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>Insert Assembly</div>
              <div style={{ fontSize: 11.5, color: DIM, marginTop: 1 }}>
                One quantity in, every line the work takes out — with the arithmetic shown.
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 4 }}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, minHeight: 0 }}>
          {/* Library */}
          <div style={{ borderRight: '1px solid ' + BORDER, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: 12, borderBottom: '1px solid ' + BORDER, position: 'relative' }}>
              <MagnifyingGlass size={13} weight="bold" color={DIM} style={{ position: 'absolute', left: 21, top: 20 }} />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${ASSEMBLIES.length} assemblies…`}
                style={{ ...inp, width: '100%', paddingLeft: 30 }}
              />
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {results.length === 0 && (
                <div style={{ padding: 16, fontSize: 12.5, color: DIM }}>Nothing matches “{q}”.</div>
              )}
              {results.map((a) => {
                const on = selected?.id === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => pick(a)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '10px 13px',
                      background: on ? 'rgba(245,158,11,.10)' : 'transparent',
                      border: 'none', borderLeft: `2px solid ${on ? GOLD : 'transparent'}`,
                      borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, letterSpacing: .4 }}>
                      {a.division} · {CSI_DIVISIONS[a.division] ?? ''}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, marginTop: 2 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                      {a.components.length} components · per {a.driverUnit}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div style={{ overflow: 'auto', padding: 16, minHeight: 0 }}>
            {!selected && (
              <div style={{ color: DIM, fontSize: 13, padding: 24, textAlign: 'center' }}>
                Pick an assembly to see what it expands to.
              </div>
            )}

            {selected && (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: DIM, marginTop: 3, lineHeight: 1.5 }}>{selected.description}</div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, margin: '14px 0 4px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>
                      {selected.driverLabel}
                    </label>
                    <input
                      type="number" min={0} value={driver} onChange={(e) => setDriver(e.target.value)}
                      style={{ ...inp, width: 150 }} autoFocus
                    />
                  </div>
                  <div style={{ fontSize: 12, color: DIM, paddingBottom: 9 }}>{selected.driverUnit}</div>
                  {preview && (
                    <div style={{ marginLeft: 'auto', textAlign: 'right', paddingBottom: 4 }}>
                      <div style={{ fontSize: 10.5, color: DIM, textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700 }}>At library pricing</div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: GOLD }}>{money(preview.indicativeTotal)}</div>
                    </div>
                  )}
                </div>

                {/* Parameters. One entry covers every height, spacing and layer
                    count, so these are where the estimate actually gets made —
                    and every change re-prices the whole expansion live. */}
                {selected.params && selected.params.length > 0 && (
                  <div style={{ marginTop: 10, padding: 12, background: RAISED, border: '1px solid ' + BORDER, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 9 }}>
                      Adjust to the job
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                      {selected.params.map((p: AssemblyParam) => (
                        <div key={p.name}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 4 }}>
                            {p.label}{p.unit ? <span style={{ fontWeight: 500 }}> ({p.unit})</span> : null}
                            <button
                              type="button"
                              onClick={() => setShowSensitivity(showSensitivity === p.name ? null : p.name)}
                              title="What does changing this do to the price?"
                              style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: showSensitivity === p.name ? GOLD : 'rgba(255,255,255,.3)', fontSize: 11, fontWeight: 800 }}
                            >
                              ±
                            </button>
                          </label>
                          {p.options ? (
                            <select
                              value={params[p.name] ?? p.default}
                              onChange={(e) => setParams((v) => ({ ...v, [p.name]: Number(e.target.value) }))}
                              style={{ ...inp, width: '100%', fontSize: 12.5, padding: '6px 8px' }}
                            >
                              {p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <input
                              type="number"
                              value={params[p.name] ?? p.default}
                              min={p.min} max={p.max} step={p.step ?? 1}
                              onChange={(e) => setParams((v) => ({ ...v, [p.name]: Number(e.target.value) }))}
                              style={{ ...inp, width: '100%', fontSize: 12.5, padding: '6px 8px' }}
                            />
                          )}
                          {p.help && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.42)', marginTop: 3, lineHeight: 1.4 }}>{p.help}</div>}
                        </div>
                      ))}
                    </div>

                    {sensitivity && (
                      <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid ' + BORDER }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, marginBottom: 6 }}>
                          {sensitivity.param.label} — what each setting costs
                        </div>
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                          {sensitivity.rows.map((row) => {
                            const current = (params[sensitivity.param.name] ?? sensitivity.param.default) === row.value;
                            return (
                              <button
                                key={row.value}
                                onClick={() => setParams((v) => ({ ...v, [sensitivity.param.name]: row.value }))}
                                style={{
                                  padding: '6px 10px', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
                                  background: current ? 'rgba(245,158,11,.16)' : '#0f0f11',
                                  border: `1px solid ${current ? GOLD + '77' : BORDER}`,
                                }}
                              >
                                <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT }}>{row.label}</div>
                                <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>{money(row.total)}</div>
                                <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 1, color: row.delta === 0 ? DIM : row.delta > 0 ? '#E0644E' : '#45B37D' }}>
                                  {row.delta === 0 ? 'current' : `${row.delta > 0 ? '+' : '−'}${money(Math.abs(row.delta))} (${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%)`}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {preview && preview.skipped.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,.45)', lineHeight: 1.5 }}>
                    Not included at these settings: {preview.skipped.join(', ')}.
                  </div>
                )}

                {preview && preview.lines.length > 0 && (
                  <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                      <thead>
                        <tr>
                          {['Component', 'Qty', 'Unit', 'Waste', 'Unit cost', 'Amount'].map((h, i) => (
                            <th key={h} style={{ padding: '6px 8px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .4, borderBottom: '1px solid ' + BORDER }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lines.map((l, i) => {
                          const unitCost = (Number(l.unit_material_cost) || 0) + (Number(l.unit_labor_cost) || 0)
                            + (Number(l.unit_equipment_cost) || 0) + (Number(l.unit_sub_cost) || 0);
                          const adj = (Number(l.quantity) || 0) * (1 + (Number(l.waste_factor_pct) || 0) / 100);
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '6px 8px', color: TEXT }}>
                                {l.description}
                                {/* The basis is why the quantity is what it is.
                                    Six months on this is the difference between
                                    a number you can defend and one you cannot. */}
                                {typeof l.notes === 'string' && l.notes.includes('·') && (
                                  <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>
                                    {l.notes.split('·').slice(1).join('·').trim()}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{qty(l.quantity)}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: DIM }}>{l.unit}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: DIM }}>{l.waste_factor_pct ? `${l.waste_factor_pct}%` : ''}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: DIM, fontVariantNumeric: 'tabular-nums' }}>${unitCost.toFixed(2)}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(adj * unitCost)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {pricing && pricing.count > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 9, background: `${ORANGE}12`, border: `1px solid ${ORANGE}33` }}>
                        <Info size={15} weight="duotone" color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
                        <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5 }}>
                          <span style={{ color: TEXT, fontWeight: 700 }}>
                            {pricing.count} line{pricing.count === 1 ? '' : 's'} carry library pricing.
                          </span>{' '}
                          The quantities are standards-based and worth trusting; the unit costs are starting
                          points. Real prices are regional, seasonal and specific to your suppliers — price
                          these against your own before the bid goes out.
                        </div>
                      </div>
                    )}
                  </>
                )}

                {preview && preview.errors.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 9, background: 'rgba(224,100,78,.12)', border: '1px solid rgba(224,100,78,.35)' }}>
                    <Warning size={15} weight="duotone" color="#E0644E" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5 }}>
                      {preview.errors.length} component{preview.errors.length === 1 ? '' : 's'} could not be computed and will be left out:{' '}
                      {preview.errors.map((e) => `${e.description} (${e.code})`).join(', ')}
                    </div>
                  </div>
                )}

                {selected && driverQty <= 0 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: DIM }}>
                    Enter a {selected.driverLabel.toLowerCase()} to see the expansion.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11.5, color: DIM }}>
            {preview ? `${preview.lines.length} line${preview.lines.length === 1 ? '' : 's'} · ${money(preview.indicativeTotal)}` : ' '}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={() => { if (preview && selected) { onInsert(preview.lines, selected, driverQty); onClose(); } }}
              disabled={!preview || preview.lines.length === 0}
              style={{
                padding: '8px 16px', background: GOLD, border: 'none', borderRadius: 7,
                color: '#1a1206', fontSize: 13, fontWeight: 800,
                cursor: preview && preview.lines.length ? 'pointer' : 'default',
                opacity: preview && preview.lines.length ? 1 : .45,
              }}
            >
              Insert {preview ? `${preview.lines.length} lines` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
