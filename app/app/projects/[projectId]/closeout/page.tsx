'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, T, ProgressBar } from '@/components/ui/shell';

interface ChecklistItem {
  id: string;
  label: string;
  status: 'complete' | 'incomplete';
  generateEndpoint?: string;
  generateLabel?: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'final_pay_app', label: 'Final Pay App', status: 'incomplete' },
  { id: 'g706_affidavit', label: 'G706 Affidavit', status: 'incomplete', generateEndpoint: '/api/documents/g706', generateLabel: 'Generate G706' },
  { id: 'all_lien_waivers', label: 'All Lien Waivers', status: 'incomplete' },
  { id: 'g704_certificate', label: 'G704 Certificate of Substantial Completion', status: 'incomplete', generateEndpoint: '/api/documents/g704', generateLabel: 'Generate G704' },
  { id: 'bond_rider', label: 'Bond Rider', status: 'incomplete' },
  { id: 'w9_forms', label: 'W-9 Forms', status: 'incomplete' },
  { id: 'wh347_final', label: 'WH-347 Final Certified Payroll', status: 'incomplete' },
  { id: 'as_built_drawings', label: 'As-Built Drawings', status: 'incomplete' },
  { id: 'equipment_warranties', label: 'Equipment Warranties', status: 'incomplete' },
  { id: 'om_manuals', label: 'O&M Manuals', status: 'incomplete' },
  { id: 'final_inspection', label: 'Final Inspection', status: 'incomplete' },
  { id: 'certificate_of_occupancy', label: 'Certificate of Occupancy', status: 'incomplete' },
];

export default function CloseoutPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [items, setItems] = useState<ChecklistItem[]>(CHECKLIST_ITEMS);
  const [generating, setGenerating] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/closeout`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          setItems(prev => prev.map(item => {
            const saved = data.items.find((s: any) => s.id === item.id);
            return saved ? { ...item, status: saved.status } : item;
          }));
        }
      } catch { /* use defaults */ }
    })();
  }, [projectId]);

  const completed = items.filter(i => i.status === 'complete').length;
  const total = items.length;
  const pct = Math.round((completed / total) * 100);

  async function toggleItem(id: string) {
    const newItems = items.map(i =>
      i.id === id ? { ...i, status: (i.status === 'complete' ? 'incomplete' : 'complete') as 'complete' | 'incomplete' } : i
    );
    setItems(newItems);
    try {
      await fetch(`/api/projects/${projectId}/closeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems.map(i => ({ id: i.id, status: i.status })) }),
      });
    } catch { /* non-fatal */ }
  }

  async function generateDoc(item: ChecklistItem) {
    if (!item.generateEndpoint) return;
    setGenerating(item.id);
    try {
      const res = await fetch(item.generateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      const url = data.url || data.pdfUrl || data.downloadUrl;
      if (url) {
        window.open(url, '_blank');
        setToast(`${item.generateLabel} generated successfully.`);
      } else {
        setToast(`${item.generateLabel} queued. Check Documents when ready.`);
      }
    } catch {
      setToast(`${item.generateLabel} request sent.`);
    } finally {
      setGenerating(null);
      setTimeout(() => setToast(''), 4000);
    }
  }

  async function exportCloseout() {
    setExporting(true);
    try {
      const res = await fetch('/api/documents/closeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      const url = data.url || data.pdfUrl || data.downloadUrl;
      if (url) window.open(url, '_blank');
      setToast('Closeout package generated.');
    } catch {
      setToast('Closeout package request sent.');
    } finally {
      setExporting(false);
      setTimeout(() => setToast(''), 4000);
    }
  }

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        <SectionHeader
          title="Project Closeout"
          sub={`${completed}/${total} items complete - ${pct}%`}
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => generateDoc({ id: 'g704', label: 'G704', status: 'incomplete', generateEndpoint: '/api/documents/g704', generateLabel: 'G704' })} disabled={!!generating}>
                Generate G704
              </Btn>
              <Btn variant="ghost" onClick={() => generateDoc({ id: 'g706', label: 'G706', status: 'incomplete', generateEndpoint: '/api/documents/g706', generateLabel: 'G706' })} disabled={!!generating}>
                Generate G706
              </Btn>
              <Btn onClick={exportCloseout} disabled={exporting || pct < 100}>
                {exporting ? 'Generating...' : 'Export Closeout Package'}
              </Btn>
            </div>
          }
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="✅" label="Completed" value={String(completed)} />
          <StatCard icon="⏳" label="Remaining" value={String(total - completed)} />
          <StatCard icon="📊" label="Progress" value={`${pct}%`} />
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
            {toast}
          </div>
        )}

        {/* Progress Bar */}
        <Card style={{ marginBottom: 24 }}>
          <CardBody>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Closeout Progress</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? T.green : T.gold }}>{pct}%</span>
            </div>
            <ProgressBar pct={pct} color={pct === 100 ? T.green : T.gold} height={10} />
            <div style={{ marginTop: 6, fontSize: 11, color: T.muted }}>
              {pct === 100 ? 'Ready to export closeout package' : `${total - completed} items remaining`}
            </div>
          </CardBody>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Closeout Checklist</span></CardHeader>
          <CardBody style={{ padding: 0 }}>
            {items.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${T.border}` }}>
                <button
                  onClick={() => toggleItem(item.id)}
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    border: `2px solid ${item.status === 'complete' ? T.green : T.border}`,
                    background: item.status === 'complete' ? T.green : 'transparent',
                    cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {item.status === 'complete' && <span style={{ color: '#000', fontSize: 13, fontWeight: 900 }}>&#10003;</span>}
                </button>
                <span style={{
                  flex: 1, fontSize: 14, color: item.status === 'complete' ? T.green : T.white,
                  textDecoration: item.status === 'complete' ? 'line-through' : 'none',
                }}>
                  {item.label}
                </span>
                <Badge label={item.status === 'complete' ? 'Complete' : 'Incomplete'} color={item.status === 'complete' ? 'green' : 'muted'} />
                {item.generateEndpoint && (
                  <Btn size="sm" variant="ghost" onClick={() => generateDoc(item)} disabled={generating === item.id}>
                    {generating === item.id ? 'Generating...' : item.generateLabel}
                  </Btn>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
