'use client';
/**
 * Saguaro Field — Delivery Confirmation
 * Log incoming deliveries, flag shortages/damage, tie to POs. Offline queue.
 */
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const CONDITIONS = [
  { value: 'Accepted',        label: 'Accepted',         color: GREEN,  emoji: '✅' },
  { value: 'Partial',         label: 'Partial Delivery', color: AMBER,  emoji: '⚠️' },
  { value: 'Damaged',         label: 'Damaged',          color: RED,    emoji: '🛑' },
  { value: 'Refused',         label: 'Refused / Returned', color: RED,  emoji: '❌' },
];

interface Delivery {
  id: string;
  supplier: string;
  description: string;
  condition: string;
  created_at: string;
  po_number?: string;
}

type View = 'list' | 'new';

function DeliveryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';
  const fileRef = useRef<HTMLInputElement>(null);

  const [view, setView]     = useState<View>('list');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]  = useState(false);
  const [online, setOnline]  = useState(true);
  const [projectName, setProjectName] = useState('');

  // Form state
  const [supplier, setSupplier]       = useState('');
  const [description, setDescription] = useState('');
  const [poNumber, setPoNumber]       = useState('');
  const [qtyOrdered, setQtyOrdered]   = useState('');
  const [qtyReceived, setQtyReceived] = useState('');
  const [condition, setCondition]     = useState('Accepted');
  const [receivedBy, setReceivedBy]   = useState('');
  const [notes, setNotes]             = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoFile, setPhotoFile]       = useState<File | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});

    fetch(`/api/deliveries?projectId=${projectId}`)
      .then((r) => r.ok ? r.json() : { deliveries: [] })
      .then((d) => setDeliveries(d.deliveries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(String(ev.target?.result || ''));
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier.trim()) return;
    setSaving(true);

    let photoUrls: string[] = [];
    // Try to upload photo if present
    if (photoFile && online) {
      try {
        const fd = new FormData();
        fd.append('file', photoFile);
        fd.append('projectId', projectId);
        fd.append('category', 'Delivery');
        fd.append('caption', `Delivery from ${supplier}`);
        const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const d = await res.json();
          if (d.photo?.url) photoUrls = [d.photo.url];
        }
      } catch { /* photo upload failed, continue */ }
    }

    const payload = {
      projectId,
      supplier: supplier.trim(),
      description: description.trim() || `Delivery from ${supplier.trim()}`,
      poNumber: poNumber.trim(),
      qtyOrdered: qtyOrdered.trim(),
      qtyReceived: qtyReceived.trim(),
      condition,
      receivedBy: receivedBy.trim(),
      notes: notes.trim(),
      photoUrls,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/deliveries/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      // Optimistic
      setDeliveries((prev) => [{
        id: `local-${Date.now()}`, supplier: supplier.trim(), description: payload.description,
        condition, created_at: new Date().toISOString(), po_number: poNumber.trim(),
      }, ...prev]);
    } catch {
      await enqueue({ url: '/api/deliveries/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setDeliveries((prev) => [{
        id: `local-${Date.now()}`, supplier: supplier.trim(), description: payload.description,
        condition, created_at: new Date().toISOString(), po_number: poNumber.trim(),
      }, ...prev]);
    }

    // Reset
    setSupplier(''); setDescription(''); setPoNumber(''); setQtyOrdered(''); setQtyReceived('');
    setCondition('Accepted'); setReceivedBy(''); setNotes(''); setPhotoPreview(''); setPhotoFile(null);
    setView('list');
    setSaving(false);
  };

  const condConfig = CONDITIONS.find((c) => c.value === condition)!;
  const todayDeliveries = deliveries.filter((d) => {
    const dDate = new Date(d.created_at);
    const now = new Date();
    return dDate.getDate() === now.getDate() && dDate.getMonth() === now.getMonth();
  });

  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}>← Back</button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Deliveries</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM }}>{projectName} · {todayDeliveries.length} today</p>
        </div>
        {view === 'list' && (
          <button onClick={() => setView('new')} style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '10px 16px', color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            + Log
          </button>
        )}
      </div>

      {!online && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>}

      {/* ── List ── */}
      {view === 'list' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading...</div>
        ) : deliveries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
            <p style={{ margin: 0, fontSize: 14 }}>No deliveries logged yet. Tap "+ Log" to record one.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deliveries.map((d) => {
              const cfg = CONDITIONS.find((c) => c.value === d.condition) || CONDITIONS[0];
              return (
                <div key={d.id} style={{ background: RAISED, border: `1px solid ${d.condition === 'Refused' || d.condition === 'Damaged' ? 'rgba(239,68,68,.3)' : BORDER}`, borderRadius: 12, padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{cfg.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>{d.supplier}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 13, color: DIM }}>{d.description}</p>
                      {d.po_number && <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM }}>PO: {d.po_number}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: DIM }}>{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── New delivery form ── */}
      {view === 'new' && (
        <form onSubmit={submit}>
          <div style={card}>
            <p style={secLbl}>Delivery Info</p>
            <Fld label="Supplier / Vendor *">
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. ABC Ready-Mix, Ferguson Supply" style={inp} required />
            </Fld>
            <Fld label="Material Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder='e.g. 3000 PSI concrete, 4" PVC pipe' style={inp} />
            </Fld>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Fld label="PO Number">
                <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-123" style={inp} />
              </Fld>
              <Fld label="Qty Ordered">
                <input value={qtyOrdered} onChange={(e) => setQtyOrdered(e.target.value)} placeholder="e.g. 50" style={inp} />
              </Fld>
              <Fld label="Qty Received">
                <input value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} placeholder="e.g. 48" style={inp} />
              </Fld>
            </div>
            <Fld label="Received By">
              <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Your name" style={inp} />
            </Fld>
          </div>

          {/* Condition selector */}
          <div style={card}>
            <p style={secLbl}>Condition</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCondition(c.value)}
                  style={{ background: condition === c.value ? `rgba(${hexRgb(c.color)},.15)` : 'transparent', border: `2px solid ${condition === c.value ? c.color : BORDER}`, borderRadius: 10, padding: '13px 8px', color: condition === c.value ? c.color : DIM, fontSize: 13, fontWeight: condition === c.value ? 800 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo */}
          <div style={card}>
            <p style={secLbl}>Delivery Slip / Photo</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: 'none' }} />
            {!photoPreview ? (
              <button type="button" onClick={() => fileRef.current?.click()} style={{ width: '100%', background: 'transparent', border: `1px dashed ${BORDER}`, borderRadius: 10, padding: '14px', color: DIM, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                📷 Take photo of delivery slip
              </button>
            ) : (
              <div style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Delivery" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10 }} />
                <button type="button" onClick={() => { setPhotoPreview(''); setPhotoFile(null); }} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.7)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 12, cursor: 'pointer' }}>✕ Remove</button>
              </div>
            )}
            <Fld label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Damage notes, short shipment details, storage location..." rows={2} style={{ ...inp, marginTop: 6 }} />
            </Fld>
          </div>

          {/* Alert for bad conditions */}
          {(condition === 'Damaged' || condition === 'Refused') && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: RED, fontWeight: 600 }}>
              ⚠️ {condition === 'Refused' ? 'Refused deliveries should be documented and PM notified immediately.' : 'Damaged materials — document thoroughly and notify PM/supplier.'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setView('list')} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? '#1e3148' : condConfig.color, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving...' : `${condConfig.emoji} Confirm Delivery`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function FieldDeliveryPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}><DeliveryPage /></Suspense>;
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>{label}</label>{children}</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const inp: React.CSSProperties = { width: '100%', background: '#09111A', border: '1px solid #1e3148', borderRadius: 10, padding: '11px 14px', color: '#e8edf8', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8fa3c0', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
