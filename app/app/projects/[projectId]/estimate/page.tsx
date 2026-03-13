'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

interface EstimateLine {
  csi_code: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total: number;
}

interface TakeoffData {
  id: string;
  materials: EstimateLine[];
  labor_cost: number;
  material_cost: number;
  total_cost: number;
  square_footage: number;
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EstimatePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [takeoff, setTakeoff] = useState<TakeoffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchTakeoff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/takeoffs/latest?projectId=${projectId}`);
      if (!res.ok) { setTakeoff(null); return; }
      const data = await res.json();
      if (data.takeoff) {
        const t = data.takeoff;
        const materials: EstimateLine[] = (t.materials || t.line_items || []).map((m: any) => ({
          csi_code: m.csi_code || m.code || '',
          description: m.description || m.name || '',
          quantity: m.quantity || 0,
          unit: m.unit || 'EA',
          unit_cost: m.unit_cost || m.unit_price || 0,
          total: m.total || (m.quantity || 0) * (m.unit_cost || m.unit_price || 0),
        }));
        const materialCost = materials.reduce((s, m) => s + m.total, 0);
        setTakeoff({
          id: t.id,
          materials,
          labor_cost: t.labor_cost || 0,
          material_cost: materialCost,
          total_cost: materialCost + (t.labor_cost || 0),
          square_footage: t.square_footage || t.sqft || 0,
        });
      } else {
        setTakeoff(null);
      }
    } catch {
      setTakeoff(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTakeoff(); }, [fetchTakeoff]);

  function exportCSV() {
    if (!takeoff) return;
    setExporting(true);
    const header = 'CSI Code,Description,Quantity,Unit,Unit Cost,Total\n';
    const rows = takeoff.materials.map(m =>
      `"${m.csi_code}","${m.description}",${m.quantity},"${m.unit}",${m.unit_cost},${m.total}`
    ).join('\n');
    const summary = `\n\nMaterial Cost,,,,,"${fmt(takeoff.material_cost)}"\nLabor Cost,,,,,"${fmt(takeoff.labor_cost)}"\nTotal,,,,,"${fmt(takeoff.total_cost)}"`;
    if (takeoff.square_footage > 0) {
      const costPerSF = takeoff.total_cost / takeoff.square_footage;
      // appending to summary
    }
    const blob = new Blob([header + rows + summary], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimate-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: T.muted }}>Loading estimate data...</div>
        ) : !takeoff ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <SectionHeader title="Estimate" sub="No takeoff data available" />
            <Card>
              <CardBody>
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T.white, marginBottom: 8 }}>No takeoff data</div>
                  <div style={{ fontSize: 14, color: T.muted, marginBottom: 24 }}>Run a blueprint analysis first to generate estimate line items.</div>
                  <a href={`/projects/${projectId}/takeoff`} style={{ textDecoration: 'none' }}>
                    <Btn>Go to Takeoff</Btn>
                  </a>
                </div>
              </CardBody>
            </Card>
          </div>
        ) : (
          <>
            <SectionHeader
              title="Estimate"
              sub="Cost estimate from latest takeoff analysis"
              action={
                <Btn onClick={exportCSV} disabled={exporting}>
                  {exporting ? 'Exporting...' : 'Export CSV'}
                </Btn>
              }
            />

            {/* Summary Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
              <StatCard icon="📦" label="Material Cost" value={fmt(takeoff.material_cost)} />
              <StatCard icon="👷" label="Labor Cost" value={fmt(takeoff.labor_cost)} />
              <StatCard icon="💰" label="Total" value={fmt(takeoff.total_cost)} />
              <StatCard
                icon="📐"
                label="Cost per SF"
                value={takeoff.square_footage > 0 ? fmt(takeoff.total_cost / takeoff.square_footage) : 'N/A'}
                sub={takeoff.square_footage > 0 ? `${takeoff.square_footage.toLocaleString()} SF` : undefined}
              />
            </div>

            {/* Line Items Table */}
            <Card>
              <CardHeader>
                <span style={{ fontWeight: 700, color: T.white, flex: 1 }}>Line Items</span>
                <span style={{ fontSize: 12, color: T.muted }}>{takeoff.materials.length} items</span>
              </CardHeader>
              <CardBody style={{ padding: 0 }}>
                <Table
                  headers={['CSI Code', 'Description', 'Quantity', 'Unit', 'Unit Cost', 'Total']}
                  rows={takeoff.materials.map(m => [
                    <span key="c" style={{ color: T.gold, fontWeight: 600, fontFamily: 'monospace' }}>{m.csi_code}</span>,
                    m.description,
                    <span key="q" style={{ color: T.white }}>{m.quantity.toLocaleString()}</span>,
                    <span key="u" style={{ color: T.muted }}>{m.unit}</span>,
                    <span key="uc" style={{ color: T.muted }}>{fmt(m.unit_cost)}</span>,
                    <span key="t" style={{ fontWeight: 600, color: T.white }}>{fmt(m.total)}</span>,
                  ])}
                />
              </CardBody>
            </Card>

            {/* Summary Footer */}
            <Card style={{ marginTop: 20 }}>
              <CardBody>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', marginBottom: 4 }}>Material Cost</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>{fmt(takeoff.material_cost)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', marginBottom: 4 }}>Labor Cost</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>{fmt(takeoff.labor_cost)}</div>
                  </div>
                  <div style={{ textAlign: 'right', paddingLeft: 24, borderLeft: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.gold, textTransform: 'uppercase', marginBottom: 4 }}>Total</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.white }}>{fmt(takeoff.total_cost)}</div>
                  </div>
                  {takeoff.square_footage > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', marginBottom: 4 }}>Cost per SF</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: T.gold }}>{fmt(takeoff.total_cost / takeoff.square_footage)}</div>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </PageWrap>
  );
}
