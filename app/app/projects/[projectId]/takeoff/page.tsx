'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '../../../../../components/Toast';

interface TakeoffItem {
  csiCode: string;
  csiDivision: string;
  csiName: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  laborHours: number;
  notes: string;
}

interface TakeoffResult {
  takeoffId: string;
  projectName: string;
  buildingType: string;
  estimatedSF: number;
  confidence: number;
  summary: string;
  items: TakeoffItem[];
  totalMaterialCost: number;
  totalLaborCost: number;
  totalProjectCost: number;
  contingency: number;
  recommendations: string[];
  itemCount: number;
}

interface ProgressState {
  step: number;
  message: string;
  pct: number;
}

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtN = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

const CSI_DIVISION_NAMES: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics, Composites',
  '07': 'Thermal and Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
};

const GOLD = '#D4A017';
const SURFACE = 'rgba(255,255,255,0.04)';
const BORDER = 'rgba(255,255,255,0.08)';

export default function TakeoffPage() {
  const { projectId } = useParams() as { projectId: string };
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<'upload' | 'analyzing' | 'results'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [takeoffId, setTakeoffId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ step: 0, message: '', pct: 0 });
  const [result, setResult] = useState<TakeoffResult | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  // Load latest completed takeoff on mount
  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/takeoffs/latest?projectId=${projectId}`);
      if (!res.ok) return;
      const { data } = await res.json();
      if (!data || data.status !== 'complete') return;
      const mats = data.takeoff_materials || [];
      if (mats.length === 0) return;

      const items: TakeoffItem[] = mats.map((m: Record<string, unknown>) => ({
        csiCode: String(m.csi_code || ''),
        csiDivision: String(m.csi_code || '').slice(0, 2),
        csiName: String(m.csi_name || ''),
        description: String(m.description || ''),
        quantity: Number(m.quantity) || 0,
        unit: String(m.unit || ''),
        unitCost: Number(m.unit_cost) || 0,
        totalCost: Number(m.total_cost) || 0,
        laborHours: Number(m.labor_hours) || 0,
        notes: String(m.notes || ''),
      }));

      setResult({
        takeoffId: String(data.id),
        projectName: String(data.project_name_detected || ''),
        buildingType: String(data.building_type || ''),
        estimatedSF: Number(data.building_area) || 0,
        confidence: Number(data.confidence) || 0,
        summary: String(data.summary || ''),
        items,
        totalMaterialCost: Number(data.material_cost) || 0,
        totalLaborCost: Number(data.labor_cost) || 0,
        totalProjectCost: Number(data.total_cost) || 0,
        contingency: Number(data.contingency_pct) || 10,
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
        itemCount: items.length,
      });
      setTakeoffId(String(data.id));
      setState('results');
    };
    load().catch(() => {});
  }, [projectId]);

  const handleFileSelect = useCallback((file: File) => {
    const valid = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/webp'];
    if (!valid.includes(file.type)) {
      showToast('Invalid file type. Please use PDF, PNG, JPG, or TIFF.', 'error');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast('File too large. Maximum 50MB.', 'error');
      return;
    }
    setSelectedFile(file);
  }, [showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setState('analyzing');
    setProgress({ step: 1, message: 'Creating takeoff record...', pct: 5 });

    try {
      // 1. Create takeoff record
      const createRes = await fetch('/api/takeoff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!createRes.ok) {
        const e = await createRes.json();
        throw new Error(e.error || 'Failed to create takeoff');
      }
      const { data: newTakeoff } = await createRes.json();
      setTakeoffId(newTakeoff.id);

      // 2. Upload file
      setProgress({ step: 2, message: 'Uploading blueprint...', pct: 10 });
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadRes = await fetch(`/api/takeoff/${newTakeoff.id}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        const e = await uploadRes.json();
        throw new Error(e.error || 'Upload failed');
      }

      // 3. Connect SSE analysis stream
      setProgress({ step: 3, message: 'Connecting to AI...', pct: 15 });
      const eventSource = new EventSource(`/api/takeoff/${newTakeoff.id}/analyze`);

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.event === 'progress') {
            setProgress({ step: data.step, message: data.message, pct: data.pct });
          }

          if (data.event === 'result') {
            eventSource.close();
            setResult(data as TakeoffResult);
            setState('results');
            showToast(`Analysis complete — ${data.itemCount} line items found.`, 'success');
          }

          if (data.event === 'error') {
            eventSource.close();
            showToast(String(data.message) || 'Analysis failed', 'error');
            setState('upload');
            setProgress({ step: 0, message: '', pct: 0 });
          }

          if (data.event === 'done') {
            eventSource.close();
          }
        } catch { /* ignore parse errors on malformed chunks */ }
      };

      eventSource.onerror = () => {
        eventSource.close();
        showToast('Connection lost during analysis. Please try again.', 'error');
        setState('upload');
      };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      showToast(msg, 'error');
      setState('upload');
      setProgress({ step: 0, message: '', pct: 0 });
    }
  };

  const handleGenerateBidPackages = async () => {
    if (!result) return;
    setGenerating('bid-packages');
    try {
      const divisions = [...new Set(result.items.map(i => i.csiCode?.slice(0, 2)))].filter(Boolean);
      let created = 0;

      for (const div of divisions) {
        const divItems = result.items.filter(i => i.csiCode?.startsWith(div));
        const divTotal = divItems.reduce((sum, i) => sum + i.totalCost, 0);
        const divName = CSI_DIVISION_NAMES[div] || `Division ${div}`;

        const res = await fetch('/api/bid-packages/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            name: `Division ${div} — ${divName}`,
            trade: divName,
            csiDivision: div,
            estimatedValue: divTotal,
            scopeSummary: divItems.map(i => `${i.description}: ${fmtN(i.quantity)} ${i.unit}`).join('\n'),
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });
        if (res.ok) created++;
      }

      showToast(`${created} bid package${created !== 1 ? 's' : ''} created!`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create bid packages';
      showToast(msg, 'error');
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateSOV = async () => {
    if (!result) return;
    setGenerating('sov');
    try {
      const sovLines = result.items.map((item, idx) => ({
        itemNumber: idx + 1,
        description: `${item.csiCode} — ${item.description}`,
        scheduledValue: item.totalCost,
      }));

      const res = await fetch('/api/pay-apps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          periodFrom: new Date().toISOString().split('T')[0],
          periodTo: new Date().toISOString().split('T')[0],
          applicationNumber: 1,
          scheduledValue: result.totalProjectCost,
          sovLines,
        }),
      });

      if (!res.ok) throw new Error('Failed to create SOV');
      showToast('Schedule of Values created from takeoff!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate SOV';
      showToast(msg, 'error');
    } finally {
      setGenerating(null);
    }
  };

  const exportCSV = () => {
    if (!result) return;
    const headers = 'CSI Code,Description,Quantity,Unit,Unit Cost,Total Cost,Labor Hours';
    const rows = result.items.map(i =>
      `"${i.csiCode}","${i.description.replace(/"/g, '""')}",${i.quantity},"${i.unit}",${i.unitCost},${i.totalCost},${i.laborHours}`
    );
    const csv = [headers, ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `takeoff-${projectId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Group items by CSI division
  const groupedItems = result
    ? result.items.reduce<Record<string, TakeoffItem[]>>((acc, item) => {
        const div = item.csiCode?.slice(0, 2) || 'XX';
        if (!acc[div]) acc[div] = [];
        acc[div].push(item);
        return acc;
      }, {})
    : {};

  // ── STATE A: UPLOAD ──────────────────────────────────────────────────────────
  if (state === 'upload') {
    return (
      <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
            AI Blueprint Takeoff
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 6 }}>
            Upload any blueprint. Claude reads every dimension and generates a full material takeoff in under 2 minutes.
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? GOLD : selectedFile ? '#22C55E' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 16,
            padding: '48px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? 'rgba(212,160,23,0.05)' : SURFACE,
            transition: 'all 0.2s',
            marginBottom: 24,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />

          {selectedFile ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ color: '#22C55E', fontWeight: 600, fontSize: 16 }}>
                {selectedFile.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
                {(selectedFile.size / 1024 / 1024).toFixed(1)} MB — Click to change file
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 56, marginBottom: 16 }}>📐</div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>
                Drop blueprint here or click to browse
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                PDF, PNG, JPG, TIFF — up to 50MB
              </div>
            </>
          )}
        </div>

        {/* What AI extracts */}
        <div style={{
          background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '20px 24px', marginBottom: 24,
        }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            What the AI extracts
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
            {[
              '✓ All materials by CSI division',
              '✓ Quantities with units',
              '✓ Current Phoenix market pricing',
              '✓ Labor hours estimate',
              '✓ Building area and floor count',
              '✓ Bid package generation ready',
            ].map((item) => (
              <div key={item} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{item}</div>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            Supports PDF blueprints, floor plans, site plans, structural drawings — any scale
          </div>
        </div>

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={!selectedFile}
          style={{
            width: '100%',
            padding: '14px',
            background: selectedFile ? `linear-gradient(135deg, ${GOLD}, #C8960F)` : 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: 10,
            color: selectedFile ? '#000' : 'rgba(255,255,255,0.3)',
            fontSize: 15,
            fontWeight: 700,
            cursor: selectedFile ? 'pointer' : 'not-allowed',
            letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          {selectedFile ? '🤖 Start AI Analysis' : 'Select a blueprint to continue'}
        </button>
      </div>
    );
  }

  // ── STATE B: ANALYZING ───────────────────────────────────────────────────────
  if (state === 'analyzing') {
    const steps = [
      'Loading blueprint',
      'Sending to AI',
      'Reading dimensions',
      'Identifying materials',
      'Calculating quantities',
      'Applying pricing',
      'Organizing by CSI',
      'Saving results',
    ];

    return (
      <div style={{ padding: '32px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>🤖</div>
        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          AI is reading your blueprint
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 32 }}>
          {progress.message || 'Starting analysis...'}
        </p>

        {/* Progress bar */}
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 999, height: 8, marginBottom: 8, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress.pct}%`,
            background: `linear-gradient(90deg, ${GOLD}, #F0C040)`,
            borderRadius: 999,
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ color: GOLD, fontWeight: 700, fontSize: 18, marginBottom: 32 }}>
          {progress.pct}%
        </div>

        {/* Step checklist */}
        <div style={{ textAlign: 'left', background: SURFACE, borderRadius: 12, padding: '16px 20px' }}>
          {steps.map((step, i) => (
            <div key={step} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 0',
              color: i < progress.step ? 'rgba(255,255,255,0.9)' : i === progress.step ? GOLD : 'rgba(255,255,255,0.3)',
              fontSize: 13,
              borderBottom: i < steps.length - 1 ? `1px solid ${BORDER}` : 'none',
            }}>
              <span style={{ width: 20, textAlign: 'center', fontSize: i === progress.step ? 16 : 13 }}>
                {i < progress.step ? '✓' : i === progress.step ? '⟳' : '○'}
              </span>
              {step}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── STATE C: RESULTS ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px' }}>

      {/* Summary header */}
      <div style={{
        background: 'rgba(212,160,23,0.08)',
        border: `1px solid rgba(212,160,23,0.2)`,
        borderRadius: 12, padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {result?.buildingType || 'Building'} · {fmtN(result?.estimatedSF || 0)} SF
          </div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginTop: 2 }}>
            {result?.projectName || 'Material Takeoff'}
          </div>
          {result?.summary && (
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4, maxWidth: 480 }}>
              {result.summary}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Project Cost</div>
          <div style={{ color: GOLD, fontWeight: 800, fontSize: 32 }}>
            {fmt$(result?.totalProjectCost || 0)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 8, padding: '6px 14px', textAlign: 'center',
          }}>
            <div style={{ color: '#22C55E', fontWeight: 700, fontSize: 18 }}>{result?.confidence ?? 0}%</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confidence</div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: '6px 14px', textAlign: 'center',
          }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{result?.itemCount ?? 0}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Line Items</div>
          </div>
        </div>
      </div>

      {/* Cost breakdown cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Material Cost', value: result?.totalMaterialCost || 0, color: GOLD },
          { label: 'Labor Cost', value: result?.totalLaborCost || 0, color: '#60A5FA' },
          {
            label: `Contingency (${result?.contingency ?? 10}%)`,
            value: (result?.totalProjectCost || 0) * ((result?.contingency ?? 10) / 100),
            color: '#A78BFA',
          },
        ].map((card) => (
          <div key={card.label} style={{
            background: SURFACE, border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              {card.label}
            </div>
            <div style={{ color: card.color, fontWeight: 700, fontSize: 22 }}>
              {fmt$(card.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Results table */}
      <div style={{
        background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: 12, overflow: 'hidden', marginBottom: 20,
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 1fr 80px 56px 80px 110px',
          padding: '10px 16px',
          background: 'rgba(255,255,255,0.04)',
          borderBottom: `1px solid ${BORDER}`,
          fontSize: 11, fontWeight: 600,
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
        }}>
          <div>CSI Code</div>
          <div>Description</div>
          <div style={{ textAlign: 'right' }}>Qty</div>
          <div style={{ textAlign: 'right' }}>Unit</div>
          <div style={{ textAlign: 'right' }}>$/Unit</div>
          <div style={{ textAlign: 'right' }}>Total</div>
        </div>

        {/* Grouped rows */}
        {Object.entries(groupedItems)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([div, items]) => {
            const divTotal = items.reduce((s, i) => s + i.totalCost, 0);
            const divName = CSI_DIVISION_NAMES[div] || `Division ${div}`;
            return (
              <div key={div}>
                {/* Division header */}
                <div style={{
                  padding: '8px 16px',
                  background: 'rgba(212,160,23,0.06)',
                  borderBottom: `1px solid ${BORDER}`,
                  borderTop: `1px solid ${BORDER}`,
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, fontWeight: 700, color: GOLD,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  <span>Division {div} — {divName}</span>
                  <span>{fmt$(divTotal)}</span>
                </div>
                {/* Items */}
                {items.map((item, idx) => (
                  <div key={idx} style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 1fr 80px 56px 80px 110px',
                    padding: '10px 16px',
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    fontSize: 13, alignItems: 'center',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}>
                    <div style={{ color: GOLD, fontFamily: 'monospace', fontSize: 12 }}>
                      {item.csiCode}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.85)', paddingRight: 8 }}>{item.description}</div>
                    <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
                      {fmtN(item.quantity)}
                    </div>
                    <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                      {item.unit}
                    </div>
                    <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
                      ${item.unitCost.toFixed(2)}
                    </div>
                    <div style={{ textAlign: 'right', color: GOLD, fontWeight: 600 }}>
                      {fmt$(item.totalCost)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

        {/* Grand total row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 1fr 80px 56px 80px 110px',
          padding: '12px 16px',
          background: 'rgba(212,160,23,0.08)',
          borderTop: `2px solid rgba(212,160,23,0.3)`,
          fontSize: 14, fontWeight: 700,
        }}>
          <div style={{ gridColumn: '1 / 6', color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Total — {result?.itemCount ?? 0} Line Items
          </div>
          <div style={{ textAlign: 'right', color: GOLD, fontSize: 16 }}>
            {fmt$(result?.totalProjectCost || 0)}
          </div>
        </div>
      </div>

      {/* AI Recommendations */}
      {(result?.recommendations?.length ?? 0) > 0 && (
        <div style={{
          borderLeft: `3px solid ${GOLD}`,
          background: 'rgba(212,160,23,0.05)',
          borderRadius: '0 8px 8px 0',
          padding: '14px 18px',
          marginBottom: 20,
        }}>
          <div style={{ color: GOLD, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            AI Recommendations
          </div>
          {result!.recommendations.map((rec, i) => (
            <div key={i} style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 4 }}>
              • {rec}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={handleGenerateBidPackages}
          disabled={!!generating}
          style={{
            padding: '11px 22px',
            background: `linear-gradient(135deg, ${GOLD}, #C8960F)`,
            border: 'none', borderRadius: 8,
            color: '#000', fontWeight: 700, fontSize: 13,
            cursor: generating ? 'wait' : 'pointer',
            letterSpacing: '0.04em',
            opacity: generating && generating !== 'bid-packages' ? 0.6 : 1,
          }}
        >
          {generating === 'bid-packages' ? 'Creating...' : '📦 Generate Bid Packages'}
        </button>
        <button
          onClick={handleGenerateSOV}
          disabled={!!generating}
          style={{
            padding: '11px 22px',
            background: 'rgba(255,255,255,0.07)',
            border: `1px solid rgba(255,255,255,0.15)`,
            borderRadius: 8, color: '#fff',
            fontWeight: 600, fontSize: 13,
            cursor: generating ? 'wait' : 'pointer',
            opacity: generating && generating !== 'sov' ? 0.6 : 1,
          }}
        >
          {generating === 'sov' ? 'Creating...' : '📋 Auto-Generate SOV'}
        </button>
        <button
          onClick={exportCSV}
          style={{
            padding: '11px 22px',
            background: 'rgba(255,255,255,0.07)',
            border: `1px solid rgba(255,255,255,0.15)`,
            borderRadius: 8, color: '#fff',
            fontWeight: 600, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          📊 Export to CSV
        </button>
        <button
          onClick={() => {
            if (confirm('Start a new takeoff? Your previous results are saved in the database.')) {
              setState('upload');
              setSelectedFile(null);
              setResult(null);
              setTakeoffId(null);
            }
          }}
          style={{
            padding: '11px 22px',
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontWeight: 500, fontSize: 13,
            cursor: 'pointer', marginLeft: 'auto',
          }}
        >
          + New Analysis
        </button>
      </div>

      {/* Unused variable suppression */}
      {takeoffId && null}
    </div>
  );
}
