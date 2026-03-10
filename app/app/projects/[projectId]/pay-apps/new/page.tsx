'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
const GREEN = '#3dd68c';

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface LineItem {
  itemNo: string;
  description: string;
  scheduledValue: number;
  prevCompleted: number;
  thisPeriod: number;
  storedMaterials: number;
}

const defaultItem = (): LineItem => ({
  itemNo: '',
  description: '',
  scheduledValue: 0,
  prevCompleted: 0,
  thisPeriod: 0,
  storedMaterials: 0,
});

const inp: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: '#0d1117',
  border: '1px solid ' + BORDER,
  borderRadius: 6,
  color: TEXT,
  fontSize: 12,
  outline: 'none',
};

const numInp: React.CSSProperties = {
  ...inp,
  textAlign: 'right',
};

export default function NewPayAppPage() {
  const params = useParams();
  const pid = params['projectId'] as string;

  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { itemNo: '1', description: 'Site Work & Earthwork', scheduledValue: 285000, prevCompleted: 142500, thisPeriod: 71250, storedMaterials: 0 },
    { itemNo: '2', description: 'Concrete Foundation & Slab', scheduledValue: 420000, prevCompleted: 378000, thisPeriod: 42000, storedMaterials: 0 },
    { itemNo: '3', description: 'Structural Steel & Framing', scheduledValue: 315000, prevCompleted: 157500, thisPeriod: 78750, storedMaterials: 12000 },
    { itemNo: '4', description: 'Roofing (TPO)', scheduledValue: 195000, prevCompleted: 0, thisPeriod: 48750, storedMaterials: 29000 },
    { itemNo: '5', description: 'Electrical (MEP)', scheduledValue: 385000, prevCompleted: 96250, thisPeriod: 96250, storedMaterials: 0 },
  ]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ documentId: string; downloadUrl?: string } | null>(null);
  const [error, setError] = useState('');

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addRow = () => setLineItems(prev => [...prev, { ...defaultItem(), itemNo: String(prev.length + 1) }]);
  const removeRow = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const totalScheduled = lineItems.reduce((s, r) => s + Number(r.scheduledValue), 0);
  const totalPrev = lineItems.reduce((s, r) => s + Number(r.prevCompleted), 0);
  const totalThis = lineItems.reduce((s, r) => s + Number(r.thisPeriod), 0);
  const totalMaterials = lineItems.reduce((s, r) => s + Number(r.storedMaterials), 0);
  const totalCompleted = totalPrev + totalThis + totalMaterials;
  const retainage = totalCompleted * 0.1;
  const paymentDue = totalThis + totalMaterials - retainage;

  const rowTotal = (r: LineItem) =>
    Number(r.prevCompleted) + Number(r.thisPeriod) + Number(r.storedMaterials);

  const rowPct = (r: LineItem) =>
    r.scheduledValue > 0 ? ((rowTotal(r) / Number(r.scheduledValue)) * 100).toFixed(1) : '0.0';

  async function handleSubmit() {
    if (!periodFrom || !periodTo) { setError('Period From and Period To are required.'); return; }
    if (lineItems.length === 0) { setError('Add at least one line item.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/documents/pay-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: pid, periodFrom, periodTo, lineItems }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); } else { setResult(d); }
    } catch {
      setError('Request failed. Check your connection and try again.');
    }
    setLoading(false);
  }

  if (result) {
    return (
      <div style={{ background: DARK, minHeight: '100%', padding: 32 }}>
        <div style={{
          maxWidth: 600, margin: '0 auto',
          background: 'rgba(61,214,140,.06)',
          border: '1px solid rgba(61,214,140,.3)',
          borderRadius: 14, padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: GREEN, marginBottom: 8 }}>Pay Application Generated!</div>
          <div style={{ fontSize: 14, color: DIM, marginBottom: 24 }}>
            G702 / G703 PDFs have been generated.
            {result.documentId && <> Document ID: <span style={{ color: TEXT }}>{result.documentId}</span></>}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {result.downloadUrl && (
              <a href={result.downloadUrl} style={{
                padding: '10px 22px',
                background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                borderRadius: 8, color: '#0d1117', fontSize: 13, fontWeight: 800, textDecoration: 'none',
              }}>Download G702/G703 PDF</a>
            )}
            <Link href={`/app/projects/${pid}/pay-apps`} style={{
              padding: '10px 22px', background: RAISED,
              border: `1px solid ${BORDER}`, borderRadius: 8,
              color: DIM, fontSize: 13, textDecoration: 'none',
            }}>← Back to Pay Applications</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: DARK,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href={`/app/projects/${pid}/pay-apps`} style={{
            color: DIM, fontSize: 13, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>← Pay Applications</Link>
          <span style={{ color: BORDER }}>|</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>New Pay Application</h2>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>AIA G702 / G703 — Schedule of Values</div>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: '9px 22px',
            background: `linear-gradient(135deg,${GOLD},#F0C040)`,
            border: 'none', borderRadius: 8,
            color: '#0d1117', fontSize: 13, fontWeight: 800,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >{loading ? 'Generating...' : 'Generate G702/G703'}</button>
      </div>

      <div style={{ padding: 24 }}>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#ef4444',
          }}>{error}</div>
        )}

        {/* Period dates */}
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 14 }}>Application Period</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 480 }}>
            {[
              { label: 'Period From', value: periodFrom, set: setPeriodFrom },
              { label: 'Period To', value: periodTo, set: setPeriodTo },
            ].map(f => (
              <div key={f.label}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                  {f.label} *
                </label>
                <input
                  type="date"
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  style={inp}
                />
              </div>
            ))}
          </div>
        </div>

        {/* SOV Table + Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20, alignItems: 'start' }}>

          {/* SOV Table */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{
              padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Schedule of Values</span>
              <button
                onClick={addRow}
                style={{
                  padding: '5px 14px',
                  background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                  border: 'none', borderRadius: 6,
                  color: '#0d1117', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >+ Add Row</button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#0a1117' }}>
                    {['Item #', 'Description', 'Scheduled Value', 'Prev Completed ($)', 'This Period ($)', 'Stored Materials ($)', 'Total', '%', ''].map(h => (
                      <th key={h} style={{
                        padding: '9px 10px', textAlign: 'left',
                        fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                        color: DIM, borderBottom: `1px solid ${BORDER}`,
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)', borderBottom: `1px solid rgba(38,51,71,.5)` }}
                    >
                      <td style={{ padding: '8px 10px', width: 60 }}>
                        <input
                          value={row.itemNo}
                          onChange={e => updateItem(idx, 'itemNo', e.target.value)}
                          style={{ ...inp, width: 48 }}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', minWidth: 180 }}>
                        <input
                          value={row.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          style={inp}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', width: 110 }}>
                        <input
                          type="number"
                          value={row.scheduledValue}
                          onChange={e => updateItem(idx, 'scheduledValue', Number(e.target.value))}
                          style={{ ...numInp, width: 100 }}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', width: 110 }}>
                        <input
                          type="number"
                          value={row.prevCompleted}
                          onChange={e => updateItem(idx, 'prevCompleted', Number(e.target.value))}
                          style={{ ...numInp, width: 100 }}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', width: 110 }}>
                        <input
                          type="number"
                          value={row.thisPeriod}
                          onChange={e => updateItem(idx, 'thisPeriod', Number(e.target.value))}
                          style={{ ...numInp, width: 100 }}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', width: 110 }}>
                        <input
                          type="number"
                          value={row.storedMaterials}
                          onChange={e => updateItem(idx, 'storedMaterials', Number(e.target.value))}
                          style={{ ...numInp, width: 100 }}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', color: TEXT, fontWeight: 600, whiteSpace: 'nowrap', width: 100 }}>
                        {fmt(rowTotal(row))}
                      </td>
                      <td style={{ padding: '8px 10px', width: 52 }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 7px',
                          borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: Number(rowPct(row)) >= 100
                            ? 'rgba(61,214,140,.12)' : 'rgba(212,160,23,.1)',
                          color: Number(rowPct(row)) >= 100 ? GREEN : GOLD,
                        }}>{rowPct(row)}%</span>
                      </td>
                      <td style={{ padding: '8px 6px', width: 30 }}>
                        <button
                          onClick={() => removeRow(idx)}
                          title="Remove row"
                          style={{
                            background: 'none', border: 'none',
                            color: '#ef4444', cursor: 'pointer',
                            fontSize: 14, padding: '2px 4px',
                          }}
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0a1117', borderTop: `2px solid ${BORDER}` }}>
                    <td colSpan={2} style={{ padding: '10px 10px', fontWeight: 800, fontSize: 12, color: TEXT, textTransform: 'uppercase', letterSpacing: 0.3 }}>TOTALS</td>
                    <td style={{ padding: '10px 10px', fontWeight: 800, color: GOLD, textAlign: 'right' }}>{fmt(totalScheduled)}</td>
                    <td style={{ padding: '10px 10px', fontWeight: 700, color: TEXT, textAlign: 'right' }}>{fmt(totalPrev)}</td>
                    <td style={{ padding: '10px 10px', fontWeight: 800, color: GREEN, textAlign: 'right' }}>{fmt(totalThis)}</td>
                    <td style={{ padding: '10px 10px', fontWeight: 700, color: TEXT, textAlign: 'right' }}>{fmt(totalMaterials)}</td>
                    <td style={{ padding: '10px 10px', fontWeight: 800, color: TEXT }}>{fmt(totalCompleted)}</td>
                    <td colSpan={2} style={{ padding: '10px 10px', fontWeight: 700, color: DIM }}>
                      {totalScheduled > 0 ? ((totalCompleted / totalScheduled) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Summary Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Summary</span>
              </div>
              <div style={{ padding: 16 }}>
                {[
                  { label: 'Total Scheduled Value', value: fmt(totalScheduled), color: GOLD },
                  { label: 'Previously Completed', value: fmt(totalPrev), color: DIM },
                  { label: 'This Period', value: fmt(totalThis), color: GREEN },
                  { label: 'Stored Materials', value: fmt(totalMaterials), color: DIM },
                  { label: 'Total Completed + Stored', value: fmt(totalCompleted), color: TEXT },
                  { label: 'Retainage (10%)', value: '- ' + fmt(retainage), color: '#f97316' },
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    marginBottom: 10, paddingBottom: 10,
                    borderBottom: `1px solid rgba(38,51,71,.5)`,
                  }}>
                    <span style={{ fontSize: 11, color: DIM }}>{row.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>{row.value}</span>
                  </div>
                ))}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginTop: 4, paddingTop: 12, borderTop: `2px solid ${BORDER}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 0.3 }}>Payment Due</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{fmt(paymentDue)}</span>
                </div>
              </div>
            </div>

            <div style={{
              background: 'rgba(212,160,23,.06)',
              border: '1px solid rgba(212,160,23,.2)',
              borderRadius: 10, padding: 14,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>AI Notice</div>
              <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>
                G702 and G703 PDFs will be auto-generated from your Schedule of Values with AIA-compliant formatting.
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                padding: '12px 0', width: '100%',
                background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                border: 'none', borderRadius: 8,
                color: '#0d1117', fontSize: 14, fontWeight: 800,
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >{loading ? 'Generating...' : 'Generate G702/G703'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
